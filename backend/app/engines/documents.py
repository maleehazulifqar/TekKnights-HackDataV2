"""Document engine: invoices and bank statements with exact (Decimal) money math."""
from __future__ import annotations

import io
import re
import zipfile
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from xml.sax.saxutils import escape as esc

import numpy as np
from faker import Faker
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.engines.tabular import ANCHOR_DATE
from app.schemas import DocumentRequest, DocumentsResponse

CENT = Decimal("0.01")


def D(x) -> Decimal:
    return Decimal(str(x))


def q2(x: Decimal) -> Decimal:
    return x.quantize(CENT, rounding=ROUND_HALF_UP)


REGIONS = {
    "US": {"faker": "en_US", "symbol": "$", "after": False, "date": "%m/%d/%Y",
           "tax_label": "Sales Tax", "tax": "0.08", "thou": ",", "dec": "."},
    "UK": {"faker": "en_GB", "symbol": "£", "after": False, "date": "%d/%m/%Y",
           "tax_label": "VAT", "tax": "0.20", "thou": ",", "dec": "."},
    "PK": {"faker": "en_IN", "symbol": "Rs ", "after": False, "date": "%d-%m-%Y",
           "tax_label": "GST", "tax": "0.18", "thou": ",", "dec": "."},
    "EU": {"faker": "de_DE", "symbol": "€", "after": True, "date": "%d.%m.%Y",
           "tax_label": "MwSt.", "tax": "0.19", "thou": ".", "dec": ","},
}

CATALOG = [  # (description, price_lo, price_hi)
    ("API access — Pro tier", 400, 1500), ("Onboarding support", 80, 300),
    ("Data storage (100 GB)", 20, 90), ("Consulting hours", 60, 220),
    ("Premium support plan", 150, 600), ("Custom integration", 500, 2500),
    ("Training workshop", 200, 900), ("Analytics add-on", 50, 250),
    ("Security audit", 800, 3000), ("Priority SLA", 100, 500),
    ("Team seats (10 pack)", 90, 400), ("Data export service", 30, 150),
]
DEBIT_MERCHANTS = [
    ("Greenleaf Market", 12, 140), ("Riverside Utilities", 40, 180), ("Metro Fuel", 20, 80),
    ("Corner Café", 4, 25), ("Pinecrest Pharmacy", 8, 70), ("StreamBox Subscription", 8, 20),
    ("Harbor Hardware", 15, 160), ("City Transit Pass", 10, 60), ("Sunrise Bakery", 3, 18),
    ("Lakeside Dining", 18, 95), ("Vista Online Store", 15, 220),
]
CREDIT_SOURCES = [
    ("Transfer from savings", 50, 400), ("Refund — Vista Online Store", 10, 120),
    ("Interest payment", 1, 8),
]


def money(amount, region: str) -> str:
    r = REGIONS[region]
    s = f"{D(amount):,.2f}"
    if (r["thou"], r["dec"]) != (",", "."):
        s = s.replace(",", "\x00").replace(".", r["dec"]).replace("\x00", r["thou"])
    return f"{s} {r['symbol']}" if r["after"] else f"{r['symbol']}{s}"


def _faker(region: str, notes: list[str]) -> Faker:
    try:
        return Faker(REGIONS[region]["faker"])
    except Exception:
        notes.append(f"Faker locale for {region} unavailable, used en_US")
        return Faker("en_US")


def _addr(fake: Faker) -> str:
    return fake.address().replace("\n", ", ")


# ---------------------------------------------------------------- invoices
def _invoice(cfg, seed: int, idx: int, number: int, fake: Faker) -> dict:
    rng = np.random.default_rng([seed & 0xFFFFFFFF, 1, idx])
    fake.seed_instance((seed * 7919 + idx) & 0xFFFFFFFF)
    r = REGIONS[cfg.region]
    hi = min(max(cfg.min_items, cfg.max_items), len(CATALOG))
    lo = min(cfg.min_items, hi)
    k = int(rng.integers(lo, hi + 1))
    rate = D(cfg.tax_rate) if cfg.tax_rate is not None else D(r["tax"])

    items, subtotal = [], Decimal("0")
    for p in rng.choice(len(CATALOG), size=k, replace=False):
        name, plo, phi = CATALOG[int(p)]
        qty = int(rng.integers(1, 6))
        price = q2(D(float(rng.uniform(plo, phi))))
        amount = q2(price * qty)
        subtotal += amount
        items.append({"description": name, "qty": qty,
                      "unit_price": float(price), "amount": float(amount)})
    tax = q2(subtotal * rate)
    issue = ANCHOR_DATE - timedelta(days=int(rng.integers(0, 180)))
    return {
        "invoice_number": f"INV-{number}",
        "region": cfg.region,
        "issue_date": issue.isoformat(),
        "due_date": (issue + timedelta(days=30)).isoformat(),
        "billed_to": {"name": fake.company(), "address": _addr(fake)},
        "seller": {"name": cfg.seller_name, "address": _addr(fake)},
        "items": items,
        "subtotal": float(subtotal),
        "tax_label": r["tax_label"],
        "tax_rate": float(rate),
        "tax": float(tax),
        "total": float(subtotal + tax),
    }


# -------------------------------------------------------- statement queries
def parse_query(q: str | None) -> tuple[dict, list[str]]:
    """Rule-based parser for query-style generation (deterministic, no LLM)."""
    parsed: dict = {}
    notes: list[str] = []
    if not q:
        return parsed, notes
    s = q.lower()
    num = r"[$£€]?\s*(?:rs\.?\s*)?([\d,]+(?:\.\d+)?)"
    if m := re.search(r"last\s+(\d+)\s*(day|week|month)s?", s):
        parsed["days"] = min(365, int(m[1]) * {"day": 1, "week": 7, "month": 30}[m[2]])
    if m := re.search(r"balance\s*(?:is\s*|of\s*)?(?:over|above|greater than|more than|at least|>=|>)\s*" + num, s):
        parsed["min_balance"] = float(m[1].replace(",", ""))
    if m := re.search(r"opening balance\s*(?:of\s*|is\s*)?" + num, s):
        parsed["opening_balance"] = float(m[1].replace(",", ""))
    if m := re.search(r"(\d+)\s+transactions?", s):
        parsed["transactions"] = min(400, int(m[1]))
    if not parsed:
        notes.append("Query not understood. Supported: 'last N days/weeks/months', "
                     "'balance over X', 'opening balance X', 'N transactions'.")
    return parsed, notes


# ------------------------------------------------------------- statements
def _statement(cfg, parsed: dict, seed: int, idx: int, fake: Faker, notes: list[str]) -> dict:
    rng = np.random.default_rng([seed & 0xFFFFFFFF, 2, idx])
    fake.seed_instance((seed * 6271 + idx) & 0xFFFFFFFF)
    days = parsed.get("days", cfg.days)
    end = cfg.end_date or ANCHOR_DATE
    start = end - timedelta(days=days - 1)
    floor = D(parsed.get("min_balance", 0))
    opening = D(parsed.get("opening_balance", cfg.opening_balance))
    if opening < floor:
        opening = floor + D(500)
        notes.append(f"Opening balance raised to {opening} to satisfy the minimum balance")
    n_tx = parsed.get("transactions") or cfg.transactions or int(np.clip(round(days * 0.7), 5, 400))

    events: list[tuple[date, str, Decimal]] = []
    for o in rng.integers(0, days, n_tx):
        d = start + timedelta(days=int(o))
        if rng.random() < 0.08:
            name, lo, hi = CREDIT_SOURCES[int(rng.integers(len(CREDIT_SOURCES)))]
            events.append((d, name, q2(D(float(rng.uniform(lo, hi))))))
        else:
            name, lo, hi = DEBIT_MERCHANTS[int(rng.integers(len(DEBIT_MERCHANTS)))]
            events.append((d, name, -q2(D(float(rng.uniform(lo, hi))))))

    pay_dates = []
    d = start + timedelta(days=int(rng.integers(0, min(14, days))))
    while d <= end:
        pay_dates.append(d)
        d += timedelta(days=14)
    planned = float(sum(-a for _, _, a in events if a < 0))
    salary = q2(D(max(500, round(planned * 1.05 / max(len(pay_dates), 1) / 50) * 50)))
    events += [(pd, "Payroll deposit", salary) for pd in pay_dates]
    events.sort(key=lambda e: (e[0], 0 if e[2] > 0 else 1))

    bal, deb, cred, rows = opening, Decimal("0"), Decimal("0"), []
    for d, desc, amt in events:
        if amt < 0 and bal + amt < floor:
            continue  # cannot afford it without breaking the minimum balance
        bal += amt
        if amt > 0:
            cred += amt
        else:
            deb += -amt
        rows.append({"date": d.isoformat(), "description": desc,
                     "debit": float(-amt) if amt < 0 else None,
                     "credit": float(amt) if amt > 0 else None,
                     "balance": float(bal)})
    return {
        "region": cfg.region,
        "holder": {"name": fake.name(), "address": _addr(fake)},
        "account_number": f"****{int(rng.integers(0, 10000)):04d}",
        "period_start": start.isoformat(), "period_end": end.isoformat(),
        "opening_balance": float(opening), "closing_balance": float(bal),
        "total_credits": float(cred), "total_debits": float(deb),
        "min_balance": float(floor), "transactions": rows,
    }


# ------------------------------------------------------------------ checks
def check_documents(kind: str, docs: list[dict]) -> list[dict]:
    bad = 0
    if kind == "invoice":
        for d in docs:
            lines_ok = all(q2(D(i["unit_price"]) * i["qty"]) == D(i["amount"]) for i in d["items"])
            sub = sum((D(i["amount"]) for i in d["items"]), Decimal("0"))
            ok = (lines_ok and sub == D(d["subtotal"])
                  and q2(sub * D(d["tax_rate"])) == D(d["tax"])
                  and D(d["subtotal"]) + D(d["tax"]) == D(d["total"]))
            bad += 0 if ok else 1
        name = "invoice_totals_reconcile"
    else:
        for d in docs:
            bal, floor, ok = D(d["opening_balance"]), D(d["min_balance"]), True
            for t in d["transactions"]:
                bal += D(t["credit"] or 0) - D(t["debit"] or 0)
                if bal != D(t["balance"]) or bal < floor:
                    ok = False
                    break
            ok = ok and bal == D(d["closing_balance"])
            bad += 0 if ok else 1
        name = "statement_balances_reconcile"
    return [{"check": name, "passed": bad == 0,
             "detail": f"{bad} of {len(docs)} document(s) failed"}]


# -------------------------------------------------------------- generation
def generate_documents(req: DocumentRequest) -> DocumentsResponse:
    notes: list[str] = []
    parsed: dict = {}
    if req.kind == "invoice":
        cfg = req.invoice
        fake = _faker(cfg.region, notes)
        first = 10000 + int(np.random.default_rng([req.seed & 0xFFFFFFFF, 99]).integers(0, 9000))
        docs = [_invoice(cfg, req.seed, i, first + i, fake) for i in range(cfg.count)]
    else:
        cfg = req.statement
        fake = _faker(cfg.region, notes)
        parsed, qnotes = parse_query(cfg.query)
        notes += qnotes
        docs = [_statement(cfg, parsed, req.seed, i, fake, notes) for i in range(cfg.count)]
    return DocumentsResponse(documents=docs, notes=notes, parsed_query=parsed,
                             checks=check_documents(req.kind, docs))


# --------------------------------------------------------------------- PDF
BRAND = colors.HexColor("#147a6b")
INK = colors.HexColor("#17233b")
GREY = colors.HexColor("#eeeeec")
LINE = colors.HexColor("#c8c8c8")


def _styles() -> dict:
    ss = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("t", parent=ss["Title"], alignment=0, textColor=INK, fontSize=22),
        "label": ParagraphStyle("l", parent=ss["Normal"], textColor=BRAND,
                                fontSize=8, fontName="Helvetica-Bold"),
        "body": ss["Normal"],
        "right": ParagraphStyle("r", parent=ss["Normal"], alignment=2),
    }


def _grid(header: bool = True) -> list:
    cmds = [("GRID", (0, 0), (-1, -1), 0.4, LINE), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN", (1, 0), (-1, -1), "RIGHT"), ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]
    if header:
        cmds += [("BACKGROUND", (0, 0), (-1, 0), GREY), ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold")]
    return cmds


def _party(p: dict, s: dict) -> Paragraph:
    return Paragraph(f"<b>{esc(p['name'])}</b><br/>{esc(p['address'])}", s["body"])


def _build(story: list, title: str) -> bytes:
    buf = io.BytesIO()
    SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
                      topMargin=18 * mm, bottomMargin=18 * mm, title=title).build(story)
    return buf.getvalue()


def invoice_pdf(inv: dict) -> bytes:
    s, reg = _styles(), inv["region"]
    dt = lambda iso: date.fromisoformat(iso).strftime(REGIONS[reg]["date"])
    m = lambda v: money(v, reg)
    story = [
        Table([[Paragraph("INVOICE", s["title"]),
                Paragraph(f"#{inv['invoice_number']}<br/>Issued {dt(inv['issue_date'])}"
                          f"<br/>Due {dt(inv['due_date'])}", s["right"])]],
              colWidths=[95 * mm, 79 * mm]),
        Spacer(1, 6 * mm),
        Table([[Paragraph("BILLED TO", s["label"]), Paragraph("FROM", s["label"])],
               [_party(inv["billed_to"], s), _party(inv["seller"], s)]],
              colWidths=[87 * mm, 87 * mm]),
        Spacer(1, 8 * mm),
    ]
    rows = [["Item", "Qty", "Price", "Amount"]] + [
        [Paragraph(esc(i["description"]), s["body"]), str(i["qty"]),
         m(i["unit_price"]), m(i["amount"])] for i in inv["items"]]
    t = Table(rows, colWidths=[90 * mm, 16 * mm, 34 * mm, 34 * mm], repeatRows=1)
    t.setStyle(TableStyle(_grid()))
    story += [t, Spacer(1, 5 * mm)]
    tot = Table([["Subtotal", m(inv["subtotal"])],
                 [f"{inv['tax_label']} ({inv['tax_rate'] * 100:g}%)", m(inv["tax"])],
                 ["Total", m(inv["total"])]], colWidths=[120 * mm, 54 * mm], hAlign="RIGHT")
    tot.setStyle(TableStyle([("ALIGN", (1, 0), (1, -1), "RIGHT"),
                             ("FONTNAME", (0, 2), (-1, 2), "Helvetica-Bold"),
                             ("TEXTCOLOR", (0, 2), (-1, 2), BRAND), ("FONTSIZE", (0, 2), (-1, 2), 13),
                             ("LINEABOVE", (0, 2), (-1, 2), 0.6, LINE)]))
    story.append(tot)
    return _build(story, inv["invoice_number"])


def statement_pdf(st: dict) -> bytes:
    s, reg = _styles(), st["region"]
    dt = lambda iso: date.fromisoformat(iso).strftime(REGIONS[reg]["date"])
    m = lambda v: money(v, reg) if v is not None else ""
    story = [
        Paragraph("ACCOUNT STATEMENT", s["title"]),
        Paragraph(f"{esc(st['holder']['name'])} — {esc(st['holder']['address'])}<br/>"
                  f"Account {st['account_number']} · {dt(st['period_start'])} to {dt(st['period_end'])}",
                  s["body"]),
        Spacer(1, 6 * mm),
    ]
    summ = Table([["Opening balance", m(st["opening_balance"])], ["Total credits", m(st["total_credits"])],
                  ["Total debits", m(st["total_debits"])], ["Closing balance", m(st["closing_balance"])]],
                 colWidths=[60 * mm, 40 * mm], hAlign="LEFT")
    summ.setStyle(TableStyle(_grid(header=False) + [("FONTNAME", (0, 3), (-1, 3), "Helvetica-Bold")]))
    story += [summ, Spacer(1, 6 * mm)]
    rows = [["Date", "Description", "Debit", "Credit", "Balance"]] + [
        [dt(t["date"]), Paragraph(esc(t["description"]), s["body"]),
         m(t["debit"]), m(t["credit"]), m(t["balance"])] for t in st["transactions"]]
    t = Table(rows, colWidths=[22 * mm, 66 * mm, 28 * mm, 28 * mm, 30 * mm], repeatRows=1)
    t.setStyle(TableStyle(_grid() + [("ALIGN", (0, 0), (1, -1), "LEFT")]))
    story.append(t)
    return _build(story, "Account statement")


def export_documents_pdf(req: DocumentRequest) -> tuple[bytes, str, str]:
    res = generate_documents(req)
    render = invoice_pdf if req.kind == "invoice" else statement_pdf
    if len(res.documents) == 1:
        return render(res.documents[0]), "application/pdf", f"{req.kind}_1.pdf"
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for i, d in enumerate(res.documents, 1):
            z.writestr(f"{req.kind}_{i:04d}.pdf", render(d))
    return buf.getvalue(), "application/zip", f"{req.kind}s.zip"
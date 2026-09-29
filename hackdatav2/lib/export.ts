import type { ColumnType, ExportFormat, GenerateResponse, Mode, Row, SchemaSpec } from "@/types/schema";
import { generate, sortTables } from "./generator";
import { generateDocuments, type GeneratedDoc, type InvoiceDoc } from "./documents";
import { buildRequest } from "./request";
import {
  generateTabularRemote,
  generateRelationalRemote,
  exportDocumentsRemote,
  exportDataRemote
} from "./api";
import { plainMoney } from "./format";
import { useWorkspace } from "@/store/workspace";
import type { Snapshot } from "./snapshot";

export type { ExportFormat };
export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const FORMATS_BY_MODE: Record<Mode, ExportFormat[]> = {
  tabular: ["csv", "xlsx", "json"], relational: ["sql", "xlsx", "json"], documents: ["pdf", "xlsx", "csv", "json"],
};

export function download(filename: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const csvCell = (v: unknown) => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function toCsv(rows: Row[]) {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  return [keys.join(","), ...rows.map(r => keys.map(k => csvCell(r[k])).join(","))].join("\n");
};

const SQL_TYPES: Record<ColumnType, string> = {
  integer: "INTEGER", float: "NUMERIC(14,2)", string: "TEXT", category: "TEXT", boolean: "BOOLEAN",
  date: "DATE", datetime: "TIMESTAMP", email: "TEXT", name: "TEXT", address: "TEXT", phone: "TEXT", uuid: "TEXT",
};
const sqlLit = (v: unknown) =>
  v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v)
  : typeof v === "boolean" ? (v ? "TRUE" : "FALSE") : `'${String(v).replace(/'/g, "''")}'`;
const q = (s: string) => `"${s.replace(/"/g, '""')}"`;

export function toSql(spec: SchemaSpec, tables: Record<string, Row[]>) {
  const out = ["-- HackDataV2 synthetic dump", ""];
  const ordered = sortTables(spec.tables);
  for (const t of ordered) {
    const defs = t.columns.map(c => {
      const textual = c.privacy === "mask" || c.privacy === "hash";
      return `  ${q(c.name)} ${textual ? "TEXT" : SQL_TYPES[c.type]}${c.primary_key ? " NOT NULL" : ""}`;
    });
    const pk = t.columns.filter(c => c.primary_key).map(c => q(c.name));
    if (pk.length) defs.push(`  PRIMARY KEY (${pk.join(", ")})`);
    t.foreign_keys.forEach(f => defs.push(`  FOREIGN KEY (${q(f.column)}) REFERENCES ${q(f.ref_table)} (${q(f.ref_column)})`));
    out.push(`CREATE TABLE ${q(t.name)} (\n${defs.join(",\n")}\n);`, "");
  }
  for (const t of ordered) {
    const rows = tables[t.name] ?? [];
    const cols = t.columns.map(c => q(c.name)).join(", ");
    for (let i = 0; i < rows.length; i += 500) {
      const values = rows.slice(i, i + 500).map(r => `(${t.columns.map(c => sqlLit(r[c.name])).join(", ")})`);
      out.push(`INSERT INTO ${q(t.name)} (${cols}) VALUES\n${values.join(",\n")};`, "");
    }
  }
  return out.join("\n");
}

export function docRows(docs: GeneratedDoc[], currency: string): Row[] {
  const rows: Row[] = [];
  docs.forEach(d => {
    if (d.kind === "invoice") d.lines.forEach(l => rows.push({
      invoice: d.number, issued: d.issued, billed_to: d.billedTo, item: l.item, qty: l.qty,
      unit_price: l.unitCents / 100, amount: l.amountCents / 100, subtotal: d.subtotalCents / 100,
      tax: d.taxCents / 100, total: d.totalCents / 100, currency,
    }));
    else d.rows.forEach(r => rows.push({
      account: d.account, holder: d.holder, date: r.date, description: r.description,
      debit: r.debitCents === null ? null : r.debitCents / 100,
      credit: r.creditCents === null ? null : r.creditCents / 100, balance: r.balanceCents / 100, currency,
    }));
  });
  return rows;
}
const docsToCsv = (docs: GeneratedDoc[], currency: string) => toCsv(docRows(docs, currency));

export type Sheets = Record<string, unknown[][]>;
const aoa = (rows: Row[]): unknown[][] => {
  if (!rows.length) return [];
  const keys = Object.keys(rows[0]);
  return [keys, ...rows.map(r => keys.map(k => r[k] ?? null))];
};

/** One worksheet per table (data modes) or per document view (documents). Shared by the Excel export and its hover preview. */
export function toSheets(p: { mode: Mode; tables?: Record<string, Row[]>; docs?: GeneratedDoc[]; currency: string }): Sheets {
  if (p.mode !== "documents") return Object.fromEntries(Object.entries(p.tables ?? {}).map(([n, rows]) => [n, aoa(rows)]));
  const docs = p.docs ?? [];
  const out: Sheets = {};
  if (docs[0]?.kind === "invoice") {
    out.Summary = aoa((docs as InvoiceDoc[]).map(d => ({
      invoice: d.number, issued: d.issued, due: d.due, billed_to: d.billedTo, subtotal: d.subtotalCents / 100,
      tax_rate: d.taxRate, tax: d.taxCents / 100, total: d.totalCents / 100, currency: p.currency,
    })));
  }
  out[docs[0]?.kind === "statement" ? "Transactions" : "Line items"] = aoa(docRows(docs, p.currency));
  return out;
}

async function buildXlsx(sheets: Sheets): Promise<Blob> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  Object.entries(sheets).forEach(([name, rows]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name.slice(0, 31)));
  return new Blob([XLSX.write(wb, { bookType: "xlsx", type: "array" })], { type: XLSX_MIME });
}

async function docsToPdf(docs: GeneratedDoc[], currency: string, taxLabel: string): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const endY = () => (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const m = (c: number) => plainMoney(c, currency);
  docs.forEach((d, i) => {
    if (i > 0) pdf.addPage();
    pdf.setFontSize(20); pdf.text(d.kind === "invoice" ? "INVOICE" : "ACCOUNT STATEMENT", 40, 56);
    pdf.setFontSize(10);
    if (d.kind === "invoice") {
      pdf.text(`#${d.number}`, 555, 56, { align: "right" });
      pdf.text(`Billed to: ${d.billedTo}`, 40, 90); pdf.text(`From: ${d.from}`, 40, 106);
      pdf.text(`Issued: ${d.issued}   Due: ${d.due}`, 40, 122);
      autoTable(pdf, {
        startY: 140, head: [["Item", "Qty", "Price", "Amount"]],
        body: d.lines.map(l => [l.item, l.qty, m(l.unitCents), m(l.amountCents)]),
        headStyles: { fillColor: [22, 122, 108] }, columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
      });
      let y = endY() + 22;
      pdf.text(`Subtotal: ${m(d.subtotalCents)}`, 555, y, { align: "right" }); y += 16;
      pdf.text(`${taxLabel} (${(d.taxRate * 100).toFixed(1)}%): ${m(d.taxCents)}`, 555, y, { align: "right" }); y += 20;
      pdf.setFontSize(13); pdf.text(`Total: ${m(d.totalCents)}`, 555, y, { align: "right" });
    } else {
      pdf.text(`${d.holder}  |  Account ${d.account}`, 40, 90);
      pdf.text(`Period: ${d.periodStart} to ${d.periodEnd}   Opening: ${m(d.openingCents)}`, 40, 106);
      autoTable(pdf, {
        startY: 124, head: [["Date", "Description", "Debit", "Credit", "Balance"]],
        body: d.rows.map(r => [r.date, r.description, r.debitCents === null ? "" : m(r.debitCents), r.creditCents === null ? "" : m(r.creditCents), m(r.balanceCents)]),
        headStyles: { fillColor: [22, 122, 108] }, styles: { fontSize: 9 },
        columnStyles: { 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
      });
      pdf.setFontSize(11); pdf.text(`Closing balance: ${m(d.closingCents)}`, 555, endY() + 24, { align: "right" });
    }
  });
  return pdf.output("blob");
}

/** Generates the full (non-preview) dataset from current workspace state and triggers a download. */
export async function runExport(format: ExportFormat, s: Snapshot = useWorkspace.getState()): Promise<string> {
  const stamp = `hackdatav2-${s.mode}-seed${s.seed}`;

  if (s.mode === "documents") {
    const docs = generateDocuments({ config: s.docs, seed: s.seed, locale: s.locale, rules: s.privacy, preview: false });
    const name = `${stamp}-${s.docs.docType}`;
    if (format === "pdf") {
      const { pool } = await import("./locales");
      download(`${name}.pdf`, await exportDocumentsRemote({ config: s.docs, seed: s.seed, locale: s.locale, rules: s.privacy }), "application/pdf");
      return `${name}.pdf`;
    }
    if (format === "xlsx") {
      download(`${name}.xlsx`, await buildXlsx(toSheets({ mode: "documents", docs, currency: s.currency })), XLSX_MIME);
      return `${name}.xlsx`;
    }
    if (format === "csv") { download(`${name}.csv`, docsToCsv(docs, s.currency), "text/csv"); return `${name}.csv`; }
    download(`${name}.json`, JSON.stringify(docs, null, 2), "application/json"); return `${name}.json`;
  }

  const req = buildRequest(s, false);
  let res: GenerateResponse;

  // Prefer backend when available
  if (process.env.NEXT_PUBLIC_API_URL) {
    try {
      if (s.mode === "tabular") {
        res = await generateTabularRemote(req);
      } else if (s.mode === "relational") {
        res = await generateRelationalRemote(req);
      } else {
        // Fallback to generic generate endpoint for other modes or if specific ones fail
        const { generateRemote } = await import("./api");
        res = await generateRemote(req);
      }
    } catch (error) {
      console.warn("Backend unavailable, falling back to local generation:", error);
      res = generate(req, { noiseLevel: s.privacy.noiseLevel }); // backend unreachable: fall back to local engine
    }
  } else {
    res = generate(req, { noiseLevel: s.privacy.noiseLevel });
  }

  if (format === "xlsx") {
    download(`${stamp}.xlsx`, await buildXlsx(toSheets({ mode: s.mode, tables: res.tables, currency: s.currency })), XLSX_MIME);
    return `${stamp}.xlsx`;
  }
  if (format === "sql") { download(`${stamp}.sql`, toSql(req.spec, res.tables), "application/sql"); return `${stamp}.sql`; }
  if (format === "csv") {
    const t = req.spec.tables[0].name;
    download(`${t}.csv`, toCsv(res.tables[t]), "text/csv"); return `${t}.csv`;
  }
  const payload = s.mode === "tabular" ? res.tables[req.spec.tables[0].name] : res.tables;
  download(`${stamp}.json`, JSON.stringify(payload, null, 2), "application/json");
  return `${stamp}.json`;
}
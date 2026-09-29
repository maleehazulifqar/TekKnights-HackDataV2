"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { GeneratedDoc, InvoiceDoc, StatementDoc } from "@/lib/documents";
import { money, shortDate } from "@/lib/format";
import { pool } from "@/lib/locales";

interface Fmt { locale: string; currency: string }

function Invoice({ d, locale, currency }: { d: InvoiceDoc } & Fmt) {
  const m = (c: number) => money(c, locale, currency);
  return (
    <article className="animate-fade-up rounded-2xl border border-line bg-white p-6 shadow-sm sm:p-8">
      <div className="flex items-baseline justify-between border-b border-line pb-4">
        <h3 className="font-display text-xl font-semibold text-ink">Invoice</h3>
        <span className="text-sm text-slate">#{d.number}</span>
      </div>
      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
        <div><dt className="font-medium text-teal">Billed to</dt><dd>{d.billedTo}</dd></div>
        <div><dt className="font-medium text-teal">From</dt><dd>{d.from}</dd></div>
        <div><dt className="font-medium text-teal">Issued / due</dt><dd>{shortDate(d.issued, locale)} / {shortDate(d.due, locale)}</dd></div>
      </dl>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead><tr className="bg-sand text-left">
            <th className="px-3 py-2">Item</th><th className="px-3 py-2 text-right">Qty</th>
            <th className="px-3 py-2 text-right">Price</th><th className="px-3 py-2 text-right">Amount</th>
          </tr></thead>
          <tbody>{d.lines.map((l, i) => (
            <tr key={i} className="border-b border-line/70">
              <td className="px-3 py-2">{l.item}</td><td className="px-3 py-2 text-right tabular-nums">{l.qty}</td>
              <td className="px-3 py-2 text-right tabular-nums">{m(l.unitCents)}</td><td className="px-3 py-2 text-right tabular-nums">{m(l.amountCents)}</td>
            </tr>))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 space-y-1 text-right text-sm tabular-nums">
        <div className="text-slate">Subtotal {m(d.subtotalCents)}</div>
        <div className="text-slate">{pool(locale).taxLabel} ({(d.taxRate * 100).toFixed(1)}%) {m(d.taxCents)}</div>
        <div className="font-display text-lg font-semibold text-teal">Total: {m(d.totalCents)}</div>
      </div>
    </article>
  );
}

function Statement({ d, locale, currency }: { d: StatementDoc } & Fmt) {
  const m = (c: number | null) => (c === null ? "" : money(c, locale, currency));
  return (
    <article className="animate-fade-up rounded-2xl border border-line bg-white p-6 shadow-sm sm:p-8">
      <div className="flex items-baseline justify-between border-b border-line pb-4">
        <h3 className="font-display text-xl font-semibold text-ink">Account statement</h3>
        <span className="text-sm text-slate">{d.account}</span>
      </div>
      <p className="mt-4 text-sm text-slate">{d.holder} · {shortDate(d.periodStart, locale)} to {shortDate(d.periodEnd, locale)} · Opening balance {m(d.openingCents)}</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead><tr className="bg-sand text-left">
            <th className="px-3 py-2">Date</th><th className="px-3 py-2">Description</th>
            <th className="px-3 py-2 text-right">Debit</th><th className="px-3 py-2 text-right">Credit</th><th className="px-3 py-2 text-right">Balance</th>
          </tr></thead>
          <tbody>{d.rows.map((r, i) => (
            <tr key={i} className="border-b border-line/70">
              <td className="px-3 py-2">{r.date}</td><td className="px-3 py-2">{r.description}</td>
              <td className="px-3 py-2 text-right tabular-nums">{m(r.debitCents)}</td><td className="px-3 py-2 text-right tabular-nums">{m(r.creditCents)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{m(r.balanceCents)}</td>
            </tr>))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-right font-display text-lg font-semibold text-teal">Closing balance: {m(d.closingCents)}</p>
    </article>
  );
}

export function DocumentPreview({ docs, total, locale, currency }: { docs: GeneratedDoc[]; total: number } & Fmt) {
  const [i, setI] = useState(0);
  const idx = Math.min(i, docs.length - 1);
  const d = docs[idx];
  if (!d) return null;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm text-slate">
        <span>Document {idx + 1} of {docs.length} in preview ({total} on export)</span>
        <div className="flex gap-1">
          {[-1, 1].map(step => (
            <button key={step} type="button" aria-label={step < 0 ? "Previous document" : "Next document"}
              disabled={idx + step < 0 || idx + step >= docs.length} onClick={() => setI(idx + step)}
              className="btn-ghost grid h-8 w-8 place-items-center rounded-lg disabled:opacity-40 disabled:hover:translate-y-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal">
              {step < 0 ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ))}
        </div>
      </div>
      {d.kind === "invoice" ? <Invoice d={d} locale={locale} currency={currency} /> : <Statement d={d} locale={locale} currency={currency} />}
    </div>
  );
}

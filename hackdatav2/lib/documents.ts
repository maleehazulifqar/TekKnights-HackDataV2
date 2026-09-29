import type { DocType, PrivacyRules } from "@/types/schema";
import { Rng } from "./rng";
import { pool } from "./locales";
import { protectText } from "./privacy";

export interface DocConfig {
  docType: DocType; count: number;
  lineItemsMin: number; lineItemsMax: number;
  taxRate: number; statementDays: number;
}
export interface InvoiceLine { item: string; qty: number; unitCents: number; amountCents: number }
export interface InvoiceDoc {
  kind: "invoice"; number: string; issued: string; due: string; billedTo: string; from: string;
  lines: InvoiceLine[]; subtotalCents: number; taxRate: number; taxCents: number; totalCents: number;
}
export interface StatementRow { date: string; description: string; debitCents: number | null; creditCents: number | null; balanceCents: number }
export interface StatementDoc {
  kind: "statement"; holder: string; account: string; periodStart: string; periodEnd: string;
  openingCents: number; rows: StatementRow[]; closingCents: number;
}
export type GeneratedDoc = InvoiceDoc | StatementDoc;
export const PREVIEW_DOCS = 8;

const CATALOG: [string, number][] = [
  ["API access - Pro tier", 1100], ["Onboarding support", 140], ["Data storage add-on", 320],
  ["Priority support plan", 480], ["Custom integration hours", 250], ["Training workshop", 900],
];
const CLIENTS = ["Northwind Supplies Ltd.", "Harbor & Finch", "Bluepine Logistics", "Orchard Row Studio", "Kestrel Analytics"];
const MERCHANTS = ["Greenleaf Market", "Riverside Utilities", "Metro Transit", "Corner Bakery", "Sunrise Pharmacy", "Lakeside Fuel", "Book Nook"];
const iso = (dayOffset: number) => new Date(Date.UTC(2025, 7, 1) + dayOffset * 864e5).toISOString().slice(0, 10);

function invoice(i: number, c: DocConfig, rng: Rng, rules: PrivacyRules): InvoiceDoc {
  const n = rng.int(c.lineItemsMin, Math.max(c.lineItemsMin, c.lineItemsMax));
  const lines: InvoiceLine[] = Array.from({ length: n }, () => {
    const [item, base] = rng.pick(CATALOG);
    const qty = rng.int(1, 5);
    const unitCents = Math.round(base * 100 * rng.range(0.9, 1.1));
    return { item, qty, unitCents, amountCents: qty * unitCents };
  });
  const subtotalCents = lines.reduce((s, l) => s + l.amountCents, 0);
  const taxCents = Math.round(subtotalCents * c.taxRate);
  const issued = rng.int(0, 60);
  return {
    kind: "invoice", number: `INV-${10432 + i}`, issued: iso(issued), due: iso(issued + 30),
    billedTo: protectText(rng.pick(CLIENTS), rules), from: "Synth Data Co.",
    lines, subtotalCents, taxRate: c.taxRate, taxCents, totalCents: subtotalCents + taxCents,
  };
}

function statement(c: DocConfig, rng: Rng, locale: string, rules: PrivacyRules): StatementDoc {
  const p = pool(locale);
  const opening = rng.int(50_000, 400_000);
  const events: { day: number; description: string; cents: number }[] = [];
  for (let d = 14; d <= c.statementDays; d += 14) events.push({ day: d, description: "Payroll deposit", cents: rng.int(180_000, 260_000) });
  const debits = Math.min(60, Math.max(3, Math.round(c.statementDays / 2.5)));
  for (let k = 0; k < debits; k++) events.push({ day: rng.int(0, c.statementDays), description: rng.pick(MERCHANTS), cents: -rng.int(800, 18_000) });
  events.sort((a, b) => a.day - b.day);
  let balance = opening;
  const rows: StatementRow[] = events.map(e => {
    let { cents, description } = e;
    if (balance + cents < 0) { cents = Math.abs(cents) + 5_000; description = "Transfer in"; }
    balance += cents;
    return { date: iso(e.day).slice(5), description, debitCents: cents < 0 ? -cents : null, creditCents: cents > 0 ? cents : null, balanceCents: balance };
  });
  return {
    kind: "statement", holder: protectText(`${rng.pick(p.first)} ${rng.pick(p.last)}`, rules),
    account: protectText(`•••• ${rng.int(1000, 9999)}`, rules), periodStart: iso(0), periodEnd: iso(c.statementDays),
    openingCents: opening, rows, closingCents: balance,
  };
}

export function generateDocuments(p: { config: DocConfig; seed: number; locale: string; rules: PrivacyRules; preview: boolean }): GeneratedDoc[] {
  const n = p.preview ? Math.min(p.config.count, PREVIEW_DOCS) : p.config.count;
  return Array.from({ length: n }, (_, i) => {
    const rng = new Rng((p.seed ^ Math.imul(i + 1, 2654435761)) >>> 0); // doc i is stable across counts
    return p.config.docType === "invoice" ? invoice(i, p.config, rng, p.rules) : statement(p.config, rng, p.locale, p.rules);
  });
}

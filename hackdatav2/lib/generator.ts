import type { ColumnSpec, GenerateRequest, GenerateResponse, Row, TableSpec } from "@/types/schema";
import { Rng, hashString } from "./rng";
import { pool } from "./locales";
import { hashValue, maskText } from "./privacy";

export const PREVIEW_CAP = 20;
export const MAX_ROWS = 100_000;
const WORDS = ["alpha", "orbit", "delta", "harbor", "signal", "ember", "vector", "quartz", "lumen", "atlas"];
const NUMERIC = ["integer", "float"];

export function sortTables(tables: TableSpec[]): TableSpec[] {
  const byName = new Map(tables.map(t => [t.name, t]));
  const seen = new Set<string>();
  const out: TableSpec[] = [];
  const visit = (t: TableSpec, stack: Set<string>) => {
    if (seen.has(t.name) || stack.has(t.name)) return;
    stack.add(t.name);
    t.foreign_keys.forEach(fk => { const p = byName.get(fk.ref_table); if (p) visit(p, stack); });
    stack.delete(t.name); seen.add(t.name); out.push(t);
  };
  tables.forEach(t => visit(t, new Set()));
  return out;
}

interface Identity { first: string; last: string; handle: string }

function numeric(col: ColumnSpec, rng: Rng) {
  const min = col.min ?? 0, max = col.max ?? 1000;
  let v: number;
  if (col.distribution === "normal") {
    v = rng.normal(col.mean ?? (min + max) / 2, col.std ?? (max - min) / 6);
  } else if (col.distribution === "lognormal") {
    const mean = Math.max((col.mean ?? (min + max) / 4) - min, 1);
    v = min + Math.exp(rng.normal(Math.log(mean), 0.6));
  } else v = rng.range(min, max);
  v = Math.min(max, Math.max(min, v));
  return col.type === "integer" ? Math.round(v) : Math.round(v * 100) / 100;
}

function makeValue(col: ColumnSpec, rng: Rng, id: Identity, locale: string): unknown {
  const p = pool(locale);
  switch (col.type) {
    case "integer": case "float": return numeric(col, rng);
    case "string": return `${rng.pick(WORDS)} ${rng.pick(WORDS)} ${rng.int(10, 99)}`;
    case "category": return rng.weighted(col.categories?.length ? col.categories : ["A", "B", "C"], col.weights);
    case "boolean": return rng.bool();
    case "date": case "datetime": {
      const t = Date.UTC(2023, 0, 1) + rng.next() * (Date.UTC(2025, 11, 31) - Date.UTC(2023, 0, 1));
      const iso = new Date(t).toISOString();
      return col.type === "date" ? iso.slice(0, 10) : iso.slice(0, 19) + "Z";
    }
    case "email": return `${id.handle}@example.com`;
    case "name": return `${id.first} ${id.last}`;
    case "address": return `${rng.int(1, 999)} ${rng.pick(p.streets)}, ${rng.pick(p.cities)}`;
    case "phone": return p.phone(() => rng.next());
    case "uuid": {
      const h = () => Math.floor(rng.next() * 0x10000).toString(16).padStart(4, "0");
      return `${h()}${h()}-${h()}-4${h().slice(1)}-a${h().slice(1)}-${h()}${h()}${h()}`;
    }
  }
}

function protect(v: unknown, col: ColumnSpec, rng: Rng, noiseLevel: number): unknown {
  if (v === null || col.privacy === "none") return v;
  if (col.privacy === "hash") return hashValue(v);
  if (col.privacy === "mask") return typeof v === "string" ? maskText(v, col.type) : "***";
  if (typeof v === "number") {
    const noisy = v + rng.normal(0, Math.max(Math.abs(v), 1) * (noiseLevel / 100));
    return col.type === "integer" ? Math.round(noisy) : Math.round(noisy * 100) / 100;
  }
  return v;
}

function buildTable(t: TableSpec, out: Record<string, Row[]>, req: GenerateRequest, noiseLevel: number, warnings: string[]): Row[] {
  const rng = new Rng(req.seed ^ hashString(t.name));
  const cap = req.preview ? PREVIEW_CAP : MAX_ROWS;
  const main = t.foreign_keys.find(f => out[f.ref_table]?.length);
  t.foreign_keys.forEach(f => { if (!out[f.ref_table]?.length) warnings.push(`${t.name}.${f.column}: missing parent table "${f.ref_table}".`); });

  let parentIdx: number[] | null = null;
  let n = Math.min(t.row_count, cap);
  if (main) {
    const parents = out[main.ref_table];
    if (main.cardinality === "1:1") parentIdx = parents.map((_, i) => i);
    else if (main.cardinality === "1:N") {
      parentIdx = [];
      parents.forEach((_, i) => {
        const k = rng.int(main.min_children, Math.max(main.min_children, main.max_children));
        for (let j = 0; j < k; j++) parentIdx!.push(i);
      });
    } else parentIdx = Array.from({ length: n }, () => rng.int(0, parents.length - 1));
    if (parentIdx.length > MAX_ROWS) { parentIdx = parentIdx.slice(0, MAX_ROWS); warnings.push(`${t.name}: capped at ${MAX_ROWS.toLocaleString()} rows.`); }
    n = parentIdx.length;
  }

  const seen = new Map<string, Set<unknown>>();
  const rows: Row[] = [];
  for (let i = 0; i < n; i++) {
    const first = rng.pick(pool(req.locale).first), last = rng.pick(pool(req.locale).last);
    const id: Identity = { first, last, handle: `${first[0]}.${last}`.toLowerCase().replace(/[^a-z.]/g, "") + (rng.bool(0.3) ? rng.int(1, 99) : "") };
    const row: Row = {};
    for (const col of t.columns) {
      const fk = t.foreign_keys.find(f => f.column === col.name);
      if (fk) {
        const parents = out[fk.ref_table];
        row[col.name] = parents?.length ? parents[fk === main && parentIdx ? parentIdx[i] : rng.int(0, parents.length - 1)][fk.ref_column] : null;
        continue;
      }
      if (col.primary_key && col.type === "integer") { row[col.name] = i + 1; continue; }
      if (!col.primary_key && rng.next() < col.null_rate) { row[col.name] = null; continue; }
      let v = makeValue(col, rng, id, req.locale);
      if (col.unique || col.primary_key) {
        const s = seen.get(col.name) ?? new Set();
        for (let tries = 0; s.has(v) && tries < 8; tries++) v = makeValue(col, rng, id, req.locale);
        if (s.has(v)) v = typeof v === "string" ? v.replace(/(@|$)/, `${i}$1`) : v;
        s.add(v); seen.set(col.name, s);
      }
      if (NUMERIC.includes(col.type) && rng.next() < col.outlier_rate) {
        const lo = col.min ?? 0, hi = col.max ?? 1000, span = hi - lo || 1;
        const o = rng.bool() ? hi + span * rng.range(0.5, 2) : lo - span * rng.range(0.5, 2);
        v = col.type === "integer" ? Math.round(o) : Math.round(o * 100) / 100;
      }
      row[col.name] = protect(v, col, rng, noiseLevel);
    }
    rows.push(row);
  }
  return rows;
}

/** Parent.total = sum(child.qty * child.unit_price) when a child table carries both columns. */
function reconcile(tables: TableSpec[], out: Record<string, Row[]>, warnings: string[]) {
  for (const child of tables) {
    const hasCols = child.columns.some(c => c.name === "qty") && child.columns.some(c => c.name === "unit_price");
    if (!hasCols) continue;
    for (const fk of child.foreign_keys) {
      const parent = tables.find(t => t.name === fk.ref_table);
      const totalCol = parent?.columns.find(c => c.name === "total");
      if (!parent || !totalCol) continue;
      const sums = new Map<unknown, number>();
      out[child.name].forEach(r => sums.set(r[fk.column], (sums.get(r[fk.column]) ?? 0) + Number(r.qty) * Number(r.unit_price)));
      out[parent.name].forEach(r => { r.total = Math.round((sums.get(r[fk.ref_column]) ?? 0) * 100) / 100; });
      if (totalCol.privacy === "noise") warnings.push(`Noise skipped on ${parent.name}.total to keep totals reconciled with line items.`);
    }
  }
}

export function generate(req: GenerateRequest, opts: { noiseLevel?: number } = {}): GenerateResponse {
  const warnings: string[] = [];
  const out: Record<string, Row[]> = {};
  const ordered = sortTables(req.spec.tables);
  for (const t of ordered) out[t.name] = buildTable(t, out, req, opts.noiseLevel ?? 5, warnings);
  reconcile(ordered, out, warnings);
  if (req.preview) warnings.push(`Preview is capped at ${PREVIEW_CAP} root rows. Export generates the full dataset.`);
  return { tables: out, warnings };
}

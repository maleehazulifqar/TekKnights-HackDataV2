import type { Row } from "@/types/schema";
import { buildRequest } from "./request";
import { generate } from "./generator";
import { generateDocuments } from "./documents";
import { docRows, toCsv } from "./export";
import type { Snapshot } from "./snapshot";

export interface ColumnProfile {
  name: string; type: string; valid: number; missing: number; missingPct: number; unique: number;
  min?: number; max?: number; mean?: number;
}
/** `data` holds the generated rows in memory only (profiles are never persisted) so the explorer can show head, tail or random rows. */
export interface TableProfile { name: string; rows: number; columns: ColumnProfile[]; sizeBytes: number; data: Row[] }
export type SampleMode = "head" | "tail" | "random";
export const SAMPLE_SIZE = 5;
export interface SampledRow { index: number; row: Row } // index is the 1-based row number in the full table

/** First, last or random `n` rows of a table. Random rows are distinct and shown in table order. */
export function sampleRows(rows: Row[], mode: SampleMode, n = SAMPLE_SIZE): SampledRow[] {
  const count = Math.min(n, rows.length);
  let idx: number[];
  if (mode === "head") idx = Array.from({ length: count }, (_, i) => i);
  else if (mode === "tail") idx = Array.from({ length: count }, (_, i) => rows.length - count + i);
  else {
    const chosen = new Set<number>();
    while (chosen.size < count) chosen.add(Math.floor(Math.random() * rows.length));
    idx = [...chosen].sort((a, b) => a - b);
  }
  return idx.map(i => ({ index: i + 1, row: rows[i] }));
}
export interface DatasetSummary { tables: number; rows: number; columns: number; cells: number; missing: number; missingPct: number; sizeBytes: number }
export interface DatasetProfile { summary: DatasetSummary; tables: TableProfile[]; documents?: number }

const byteLength = (s: string) => new TextEncoder().encode(s).length;

function profileRows(name: string, rows: Row[], cols: { name: string; type: string }[]): TableProfile {
  const columns = cols.map(c => {
    let missing = 0, sum = 0, nums = 0, min = Infinity, max = -Infinity;
    const seen = new Set<unknown>();
    for (const r of rows) {
      const v = r[c.name];
      if (v === null || v === undefined || v === "") { missing++; continue; }
      seen.add(v);
      if (typeof v === "number") { nums++; sum += v; if (v < min) min = v; if (v > max) max = v; }
    }
    return {
      name: c.name, type: c.type, valid: rows.length - missing, missing,
      missingPct: rows.length ? (missing / rows.length) * 100 : 0, unique: seen.size,
      ...(nums ? { min, max, mean: sum / nums } : {}),
    };
  });
  // Size is measured as the CSV export of this table.
  return { name, rows: rows.length, columns, sizeBytes: byteLength(toCsv(rows)), data: rows };
}

export function profileDataset(snap: Snapshot): DatasetProfile {
  let tables: TableProfile[];
  let documents: number | undefined;
  if (snap.mode === "documents") {
    const docs = generateDocuments({ config: snap.docs, seed: snap.seed, locale: snap.locale, rules: snap.privacy, preview: false });
    const rows = docRows(docs, snap.currency);
    const cols = Object.keys(rows[0] ?? {}).map(k => ({ name: k, type: rows.some(r => typeof r[k] === "number") ? "number" : "text" }));
    tables = [profileRows(snap.docs.docType === "invoice" ? "invoice_line_items" : "transactions", rows, cols)];
    documents = docs.length;
  } else {
    const req = buildRequest(snap, false);
    const res = generate(req, { noiseLevel: snap.privacy.noiseLevel });
    tables = req.spec.tables.map(t => profileRows(t.name, res.tables[t.name], t.columns.map(c => ({ name: c.name, type: c.type }))));
  }
  const sum = (f: (t: TableProfile) => number) => tables.reduce((a, t) => a + f(t), 0);
  const cells = sum(t => t.rows * t.columns.length);
  const missing = sum(t => t.columns.reduce((a, c) => a + c.missing, 0));
  return {
    documents, tables,
    summary: {
      tables: tables.length, rows: sum(t => t.rows), columns: sum(t => t.columns.length), cells, missing,
      missingPct: cells ? (missing / cells) * 100 : 0, sizeBytes: sum(t => t.sizeBytes),
    },
  };
}

const CACHE_MAX = 6; // profiles keep their rows in memory, so only the most recent few are cached
const cache = new Map<string, DatasetProfile>();
/** Same snapshot always yields the same data, so profiles are cached by signature (least recently used is evicted). */
export function getProfile(signature: string, snap: Snapshot): DatasetProfile {
  let p = cache.get(signature);
  if (p) { cache.delete(signature); cache.set(signature, p); return p; }
  p = profileDataset(snap);
  cache.set(signature, p);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
  return p;
}

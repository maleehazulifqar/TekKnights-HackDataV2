import { create } from "zustand";
import type { ColumnSpec, ExportFormat, ForeignKey, Mode, PrivacyRules, SchemaSpec, TableSpec } from "@/types/schema";
import { DEFAULT_DOCS, DEFAULT_RELATIONAL, DEFAULT_TABULAR, col } from "@/lib/defaults";
import type { DocConfig } from "@/lib/documents";
import { pool } from "@/lib/locales";
import type { Snapshot } from "@/lib/snapshot";

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
export const MAX_DOCS = 500;

export interface WorkspaceState {
  mode: Mode; seed: number; locale: string; currency: string; rowCount: number;
  privacy: PrivacyRules; tabular: TableSpec; relational: SchemaSpec; docs: DocConfig;

  view: "workspace" | "datasets";
  datasetId: string | null; // dataset open in the Recent datasets view
  setView: (v: "workspace" | "datasets") => void;
  openDataset: (id: string | null) => void;
  loadSnapshot: (s: Snapshot) => void;
  hoverFormat: ExportFormat | null; // export option under the pointer or keyboard focus
  setHoverFormat: (f: ExportFormat | null) => void;
  setMode: (m: Mode) => void;
  setSeed: (n: number) => void;
  reseed: () => void;
  setLocale: (l: string) => void;
  setCurrency: (c: string) => void;
  setCount: (n: number) => void; // rows for data modes, documents for documents mode
  setPrivacy: (p: Partial<PrivacyRules>) => void;
  addColumn: () => void;
  updateColumn: (i: number, patch: Partial<ColumnSpec>) => void;
  removeColumn: (i: number) => void;
  updateForeignKey: (table: string, column: string, patch: Partial<ForeignKey>) => void;
  updateTable: (table: string, patch: Partial<TableSpec>) => void;
  setDocs: (patch: Partial<DocConfig>) => void;
}

export const useWorkspace = create<WorkspaceState>((set) => ({
  mode: "tabular", seed: 42, locale: "en_US", currency: "USD", rowCount: 100,
  privacy: { mask: false, hash: false, noise: false, noiseLevel: 5 },
  tabular: DEFAULT_TABULAR, relational: DEFAULT_RELATIONAL, docs: DEFAULT_DOCS,

  view: "workspace", datasetId: null,
  setView: view => set({ view, datasetId: null }),
  openDataset: datasetId => set({ view: "datasets", datasetId }),
  loadSnapshot: snap => set({ ...snap, view: "workspace", datasetId: null, hoverFormat: null }),
  hoverFormat: null,
  setHoverFormat: hoverFormat => set({ hoverFormat }),
  setMode: mode => set({ mode, view: "workspace" }),
  setSeed: n => set({ seed: Math.trunc(n) }),
  reseed: () => set({ seed: Math.floor(Math.random() * 1_000_000) }),
  setLocale: locale => set(s => ({
    locale, currency: pool(locale).currency, docs: { ...s.docs, taxRate: pool(locale).taxRate },
  })),
  setCurrency: currency => set({ currency }),
  setCount: n => set(s => s.mode === "documents"
    ? { docs: { ...s.docs, count: clamp(Math.trunc(n), 1, MAX_DOCS) } }
    : { rowCount: clamp(Math.trunc(n), 1, 100_000) }),
  setPrivacy: p => set(s => ({ privacy: { ...s.privacy, ...p } })),

  addColumn: () => set(s => ({
    tabular: { ...s.tabular, columns: [...s.tabular.columns, col(`column_${s.tabular.columns.length + 1}`, "string")] },
  })),
  updateColumn: (i, patch) => set(s => ({
    tabular: { ...s.tabular, columns: s.tabular.columns.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) },
  })),
  removeColumn: i => set(s => ({
    tabular: { ...s.tabular, columns: s.tabular.columns.filter((_, idx) => idx !== i) },
  })),
  updateForeignKey: (table, column, patch) => set(s => ({
    relational: { tables: s.relational.tables.map(t => t.name !== table ? t : {
      ...t, foreign_keys: t.foreign_keys.map(f => (f.column === column ? { ...f, ...patch } : f)),
    }) },
  })),
  updateTable: (table, patch) => set(s => ({
    relational: { tables: s.relational.tables.map(t => (t.name === table ? { ...t, ...patch } : t)) },
  })),
  setDocs: patch => set(s => ({ docs: { ...s.docs, ...patch } })),
}));

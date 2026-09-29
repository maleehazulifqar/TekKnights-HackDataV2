import type { GenerateRequest, Mode, PrivacyRules, SchemaSpec, TableSpec } from "@/types/schema";
import { resolvePrivacy } from "./privacy";

export interface RequestState {
  mode: Mode; seed: number; locale: string; rowCount: number;
  privacy: PrivacyRules; tabular: TableSpec; relational: SchemaSpec;
}

/** Root tables take the global row count; child tables follow their FK cardinality. */
export function buildRequest(s: RequestState, preview: boolean): GenerateRequest {
  const base = s.mode === "tabular" ? { tables: [s.tabular] } : s.relational;
  const spec = resolvePrivacy(
    { tables: base.tables.map(t => ({ ...t, row_count: t.foreign_keys.length ? t.row_count : s.rowCount })) },
    s.privacy,
  );
  return { spec, seed: s.seed, locale: s.locale, preview };
}
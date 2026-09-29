import type { ColumnSpec, ColumnType, PrivacyMode, PrivacyRules, SchemaSpec } from "@/types/schema";
import { hashString } from "./rng";

const PII: ColumnType[] = ["name", "email", "phone", "address"];

/** Column-level choice wins; otherwise global rules apply to matching column types. */
export function effectiveMode(col: ColumnSpec, rules: PrivacyRules): PrivacyMode {
  if (col.privacy !== "none") return col.privacy;
  if (PII.includes(col.type)) return rules.hash ? "hash" : rules.mask ? "mask" : "none";
  if ((col.type === "integer" || col.type === "float") && rules.noise) return "noise";
  return "none";
}

/** Bakes global rules into each column's `privacy`. Keys (PK/FK) are never altered. */
export function resolvePrivacy(spec: SchemaSpec, rules: PrivacyRules): SchemaSpec {
  return {
    tables: spec.tables.map(t => {
      const keys = new Set([...t.foreign_keys.map(f => f.column), ...t.columns.filter(c => c.primary_key).map(c => c.name)]);
      return { ...t, columns: t.columns.map(c => ({ ...c, privacy: keys.has(c.name) ? "none" : effectiveMode(c, rules) })) };
    }),
  };
}

export const hashValue = (v: unknown) =>
  hashString(String(v)).toString(16).padStart(8, "0") + hashString(String(v) + "~").toString(16).padStart(8, "0");

export function maskText(v: string, type?: ColumnType): string {
  if (type === "email") { const [l, dom] = v.split("@"); return `${l[0] ?? ""}***@${dom ?? ""}`; }
  if (type === "phone") return v.replace(/\d(?=(?:\D*\d){2})/g, "*");
  if (type === "address") return `${v.split(" ")[0]} ***`;
  if (type === "date" || type === "datetime") return v.slice(0, 4) + "-**-**";
  return v.split(" ").map(w => (w ? w[0] + "***" : w)).join(" ");
}

/** Text protection used by the document generators. */
export function protectText(v: string, rules: PrivacyRules) {
  return rules.hash ? hashValue(v).slice(0, 10) : rules.mask ? maskText(v) : v;
}

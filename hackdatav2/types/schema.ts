// TypeScript mirror of the backend Pydantic models.
export type ColumnType =
  | "integer" | "float" | "string" | "category" | "boolean"
  | "date" | "datetime" | "email" | "name" | "address" | "phone" | "uuid";
export type PrivacyMode = "none" | "mask" | "hash" | "noise";
export type Distribution = "uniform" | "normal" | "lognormal";

export interface ColumnSpec {
  name: string;
  type: ColumnType;
  primary_key?: boolean;
  unique?: boolean;
  null_rate: number;
  outlier_rate: number;
  distribution: Distribution;
  min?: number;
  max?: number;
  mean?: number;
  std?: number;
  categories?: string[];
  weights?: number[];
  privacy: PrivacyMode;
}

export interface ForeignKey {
  column: string;
  ref_table: string;
  ref_column: string;
  cardinality: "1:1" | "1:N" | "N:N";
  min_children: number;
  max_children: number;
}

export interface TableSpec {
  name: string;
  row_count: number;
  columns: ColumnSpec[];
  foreign_keys: ForeignKey[];
}

export interface SchemaSpec { tables: TableSpec[] }

export interface GenerateRequest {
  spec: SchemaSpec;
  seed: number;
  locale: string;
  preview: boolean; // true = cap at ~20 rows for the live canvas
}

export type Row = Record<string, unknown>;
export interface GenerateResponse { tables: Record<string, Row[]>; warnings: string[] }

// UI-only types
export type ExportFormat = "csv" | "json" | "sql" | "pdf" | "xlsx";
export type Mode = "tabular" | "relational" | "documents";
export type DocType = "invoice" | "bank_statement";
export interface PrivacyRules { mask: boolean; hash: boolean; noise: boolean; noiseLevel: number }

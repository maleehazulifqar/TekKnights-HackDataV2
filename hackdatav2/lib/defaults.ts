import type { ColumnSpec, SchemaSpec, TableSpec } from "@/types/schema";
import type { DocConfig } from "./documents";

export const col = (name: string, type: ColumnSpec["type"], extra: Partial<ColumnSpec> = {}): ColumnSpec => ({
  name, type, null_rate: 0, outlier_rate: 0, distribution: "uniform", privacy: "none", ...extra,
});

export const DEFAULT_TABULAR: TableSpec = {
  name: "customers", row_count: 100, foreign_keys: [],
  columns: [
    col("id", "integer", { primary_key: true }),
    col("name", "name"),
    col("email", "email", { unique: true }),
    col("signup", "date"),
    col("balance", "float", { distribution: "lognormal", min: 0, max: 5000, mean: 600, null_rate: 0.02, outlier_rate: 0.02 }),
    col("status", "category", { categories: ["active", "paused", "churned"], weights: [0.7, 0.2, 0.1] }),
  ],
};

export const DEFAULT_RELATIONAL: SchemaSpec = {
  tables: [
    { name: "customers", row_count: 100, foreign_keys: [], columns: [col("customer_id", "integer", { primary_key: true }), col("name", "name"), col("email", "email", { unique: true })] },
    {
      name: "orders", row_count: 100,
      foreign_keys: [{ column: "customer_id", ref_table: "customers", ref_column: "customer_id", cardinality: "1:N", min_children: 1, max_children: 4 }],
      columns: [col("order_id", "integer", { primary_key: true }), col("customer_id", "integer"), col("order_date", "date"), col("total", "float")],
    },
    {
      name: "order_items", row_count: 100,
      foreign_keys: [{ column: "order_id", ref_table: "orders", ref_column: "order_id", cardinality: "1:N", min_children: 1, max_children: 4 }],
      columns: [
        col("item_id", "integer", { primary_key: true }), col("order_id", "integer"),
        col("sku", "category", { categories: ["SKU-100", "SKU-220", "SKU-310", "SKU-450"] }),
        col("qty", "integer", { min: 1, max: 5 }), col("unit_price", "float", { min: 5, max: 200 }),
      ],
    },
  ],
};

export const DEFAULT_DOCS: DocConfig = { docType: "invoice", count: 5, lineItemsMin: 2, lineItemsMax: 5, taxRate: 0.08, statementDays: 30 };

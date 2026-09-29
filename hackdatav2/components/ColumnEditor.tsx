"use client";
import { Plus, Trash2 } from "lucide-react";
import type { ColumnType, Distribution, PrivacyMode } from "@/types/schema";
import { useWorkspace } from "@/store/workspace";
import { Field, ListField, NumberField, SelectField, control } from "./ui";

const TYPES: ColumnType[] = ["integer", "float", "string", "category", "boolean", "date", "datetime", "email", "name", "address", "phone", "uuid"];
const opt = <T extends string>(xs: T[]) => xs.map(x => ({ value: x, label: x }));
const PRIVACY: { value: PrivacyMode; label: string }[] = [
  { value: "none", label: "None" }, { value: "mask", label: "Mask" }, { value: "hash", label: "Hash" }, { value: "noise", label: "Noise" },
];

export function ColumnEditor() {
  const columns = useWorkspace(s => s.tabular.columns);
  const { updateColumn, removeColumn, addColumn } = useWorkspace.getState();
  return (
    <div className="space-y-3">
      {columns.map((c, i) => {
        const numeric = c.type === "integer" || c.type === "float";
        return (
          <div key={i} className="animate-pop-in space-y-3 rounded-xl border border-line bg-paper p-3 transition-shadow hover:shadow-md">
            <div className="flex gap-2">
              <input aria-label="Column name" className={control} value={c.name} onChange={e => updateColumn(i, { name: e.target.value })} />
              <button
                type="button" aria-label={`Remove column ${c.name}`} disabled={columns.length === 1} onClick={() => removeColumn(i)}
                className="btn-icon h-9 w-9 shrink-0 hover:!bg-red-50 hover:!text-red-600 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
              ><Trash2 className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Type">
                <SelectField value={c.type} options={opt(TYPES)} onChange={t =>
                  updateColumn(i, { type: t, ...(t === "category" && !c.categories?.length ? { categories: ["A", "B", "C"] } : {}) })} />
              </Field>
              <Field label="Privacy">
                <SelectField value={c.privacy} options={PRIVACY} disabled={c.primary_key} onChange={privacy => updateColumn(i, { privacy })} />
              </Field>
              <Field label="Nulls (%)"><NumberField min={0} max={100} value={Math.round(c.null_rate * 100)} disabled={c.primary_key} onChange={p => updateColumn(i, { null_rate: p / 100 })} /></Field>
              <Field label="Outliers (%)"><NumberField min={0} max={100} value={Math.round(c.outlier_rate * 100)} disabled={!numeric} onChange={p => updateColumn(i, { outlier_rate: p / 100 })} /></Field>
            </div>
            {numeric && (
              <div className="grid grid-cols-3 gap-2">
                <Field label="Shape"><SelectField<Distribution> value={c.distribution} options={opt<Distribution>(["uniform", "normal", "lognormal"])} onChange={distribution => updateColumn(i, { distribution })} /></Field>
                <Field label="Min"><NumberField value={c.min ?? 0} onChange={min => updateColumn(i, { min })} /></Field>
                <Field label="Max"><NumberField value={c.max ?? 1000} onChange={max => updateColumn(i, { max })} /></Field>
              </div>
            )}
            {c.type === "category" && (
              <Field label="Categories"><ListField value={c.categories ?? []} onChange={categories => updateColumn(i, { categories, weights: undefined })} /></Field>
            )}
          </div>
        );
      })}
      <button
        type="button" onClick={addColumn}
        className="btn group flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-teal/50 text-sm font-medium text-teal hover:-translate-y-0.5 hover:border-solid hover:bg-tealsoft hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
      ><Plus className="h-4 w-4 transition-transform duration-300 group-hover:rotate-90" aria-hidden /> Add column</button>
    </div>
  );
}

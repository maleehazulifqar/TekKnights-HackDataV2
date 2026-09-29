"use client";
import { Key, Link2 } from "lucide-react";
import { useWorkspace } from "@/store/workspace";
import type { ForeignKey } from "@/types/schema";
import { Field, NumberField, SelectField } from "./ui";

const CARD: { value: ForeignKey["cardinality"]; label: string }[] = [
  { value: "1:1", label: "1:1 (one child per parent)" }, { value: "1:N", label: "1:N (many children per parent)" }, { value: "N:N", label: "N:N (random parent picks)" },
];

export function RelationshipEditor() {
  const tables = useWorkspace(s => s.relational.tables);
  const { updateForeignKey, updateTable } = useWorkspace.getState();
  return (
    <div className="space-y-3">
      {tables.map(t => (
        <div key={t.name} className="animate-fade-up rounded-xl border border-line bg-paper p-3 transition-shadow hover:shadow-md">
          <div className="font-display text-sm font-semibold text-ink">{t.name}</div>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {t.columns.map(c => {
              const fk = t.foreign_keys.some(f => f.column === c.name);
              return (
                <li key={c.name} className="flex items-center gap-1 rounded-full bg-tealsoft px-2 py-0.5 text-xs text-teal transition-transform hover:scale-105">
                  {c.primary_key && <Key className="h-3 w-3" aria-label="primary key" />}
                  {fk && <Link2 className="h-3 w-3" aria-label="foreign key" />}{c.name}
                </li>
              );
            })}
          </ul>
          {t.foreign_keys.map(f => (
            <div key={f.column} className="mt-3 space-y-2 border-t border-line pt-3">
              <p className="text-[13px] text-slate">{t.name}.{f.column} references {f.ref_table}.{f.ref_column}</p>
              <Field label="Cardinality"><SelectField value={f.cardinality} options={CARD} onChange={cardinality => updateForeignKey(t.name, f.column, { cardinality })} /></Field>
              {f.cardinality === "1:N" && (
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Min children"><NumberField min={0} max={f.max_children} value={f.min_children} onChange={min_children => updateForeignKey(t.name, f.column, { min_children })} /></Field>
                  <Field label="Max children"><NumberField min={Math.max(1, f.min_children)} max={50} value={f.max_children} onChange={max_children => updateForeignKey(t.name, f.column, { max_children })} /></Field>
                </div>
              )}
              {f.cardinality === "N:N" && (
                <Field label="Rows in this table"><NumberField min={1} max={100000} value={t.row_count} onChange={row_count => updateTable(t.name, { row_count })} /></Field>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

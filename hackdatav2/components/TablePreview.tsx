"use client";
import { Lock } from "lucide-react";
import type { ColumnSpec, Row } from "@/types/schema";

export const PREVIEW_ROWS = 12;

export function TablePreview({ rows, columns }: { rows: Row[]; columns: ColumnSpec[] }) {
  const shown = rows.slice(0, PREVIEW_ROWS);
  const numeric = (c: ColumnSpec) => c.type === "integer" || c.type === "float";
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-white shadow-sm">
      <table className="w-full min-w-max border-collapse text-sm">
        <thead>
          <tr className="bg-gradient-to-r from-sand to-tealsoft/60 text-left">
            {columns.map(c => (
              <th key={c.name} scope="col" className={`sticky top-0 whitespace-nowrap border-b border-line px-3 py-2.5 font-semibold text-ink ${numeric(c) ? "text-right" : ""}`}>
                <span className="inline-flex items-center gap-1.5">
                  {c.name}
                  {c.privacy !== "none" && <Lock className="h-3 w-3 text-teal" aria-label={`${c.privacy} applied`} />}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => (
            <tr key={i} style={{ animationDelay: `${i * 35}ms` }} className="animate-fade-up border-b border-line/70 transition-colors last:border-0 hover:bg-tealsoft/50">
              {columns.map(c => {
                const v = r[c.name];
                return (
                  <td key={c.name} className={`whitespace-nowrap px-3 py-2 ${numeric(c) ? "text-right tabular-nums" : ""}`}>
                    {v === null || v === undefined ? <span className="italic text-slate/60">null</span>
                      : c.type === "float" && typeof v === "number" ? v.toFixed(2) : String(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {!shown.length && <p className="p-6 text-sm text-slate">No rows yet. Add a column or raise the row count.</p>}
    </div>
  );
}

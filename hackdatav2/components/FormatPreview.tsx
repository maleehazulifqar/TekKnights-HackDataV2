"use client";
import { useMemo, useState } from "react";
import type { ExportFormat, Mode, Row, SchemaSpec } from "@/types/schema";
import type { GeneratedDoc } from "@/lib/documents";
import { docRows, toCsv, toSheets, toSql } from "@/lib/export";
import { DocumentPreview } from "./DocumentPreview";

const LABEL: Record<ExportFormat, string> = { csv: "CSV", xlsx: "Excel", json: "JSON", sql: "SQL dump", pdf: "PDF" };
const MAX_LINES = 40, GRID_ROWS = 14;
const colLetter = (i: number) => String.fromCharCode(65 + (i % 26));

interface Props {
  format: ExportFormat; mode: Mode; currency: string; locale: string; total: number;
  data: ({ spec: SchemaSpec; tables: Record<string, Row[]> }) | null;
  documents: GeneratedDoc[] | null;
}

function textFor({ format, mode, data, documents, currency }: Props): string {
  if (mode === "documents") {
    const docs = documents ?? [];
    return format === "csv" ? toCsv(docRows(docs, currency)) : JSON.stringify(docs.slice(0, 2), null, 2);
  }
  if (!data) return "";
  const names = data.spec.tables.map(t => t.name);
  if (format === "sql") return toSql(data.spec, data.tables);
  if (format === "csv") return toCsv(data.tables[names[0]]);
  if (mode === "tabular") return JSON.stringify(data.tables[names[0]].slice(0, 5), null, 2);
  return JSON.stringify(Object.fromEntries(names.map(n => [n, data.tables[n].slice(0, 3)])), null, 2);
}

function Grid({ props }: { props: Props }) {
  const sheets = useMemo(
    () => toSheets({ mode: props.mode, tables: props.data?.tables, docs: props.documents ?? undefined, currency: props.currency }),
    [props.mode, props.data, props.documents, props.currency],
  );
  const names = Object.keys(sheets);
  const [tab, setTab] = useState(names[0]);
  const name = names.includes(tab) ? tab : names[0];
  const rows = (sheets[name] ?? []).slice(0, GRID_ROWS + 1);
  const width = Math.max(1, ...rows.map(r => r.length));
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead>
            <tr className="bg-sand text-center text-xs text-slate">
              <th className="w-10 border-b border-r border-line" />
              {Array.from({ length: width }, (_, i) => <th key={i} className="border-b border-r border-line px-3 py-1 font-medium">{colLetter(i)}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>
                <td className="border-b border-r border-line bg-sand text-center text-xs text-slate">{ri + 1}</td>
                {Array.from({ length: width }, (_, ci) => (
                  <td key={ci} className={`whitespace-nowrap border-b border-r border-line px-3 py-1.5 ${ri === 0 ? "bg-teal font-semibold text-white" : typeof r[ci] === "number" ? "text-right tabular-nums" : ""}`}>
                    {r[ci] === null || r[ci] === undefined ? "" : String(r[ci])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div role="tablist" aria-label="Worksheets" className="flex gap-1 border-t border-line bg-sand px-2 pt-1">
        {names.map(n => (
          <button key={n} role="tab" type="button" aria-selected={n === name} onClick={() => setTab(n)}
            className={`btn rounded-t-lg px-3 py-1.5 text-xs font-medium ${n === name ? "bg-white text-teal" : "text-slate hover:bg-white/50 hover:text-ink"}`}>{n}</button>
        ))}
      </div>
    </div>
  );
}

/** Shows what the hovered export option will produce, built from the same data as the real export. */
export function FormatPreview(props: Props) {
  const { format, mode } = props;
  const text = useMemo(() => (format === "xlsx" || format === "pdf" ? "" : textFor(props)), [props, format]);
  const lines = text.split("\n");
  return (
    <div className="space-y-3">
      <p aria-live="polite" className="rounded-lg bg-tealsoft px-3 py-2 text-[13px] text-teal">
        Previewing {LABEL[format]} export using your current settings. Move away to return to the data view.
      </p>
      {format === "xlsx" && <Grid props={props} />}
      {format === "pdf" && mode === "documents" && props.documents && (
        <div className="rounded-xl bg-sand p-3 sm:p-5">
          <DocumentPreview docs={props.documents} total={props.total} locale={props.locale} currency={props.currency} />
        </div>
      )}
      {(format === "csv" || format === "json" || format === "sql") && (
        <>
          <pre className="overflow-x-auto rounded-xl border border-line bg-ink p-4 font-mono text-[12.5px] leading-relaxed text-white/90">
            {lines.slice(0, MAX_LINES).join("\n")}
          </pre>
          {lines.length > MAX_LINES && <p className="text-[13px] text-slate">{lines.length - MAX_LINES} more lines in this preview. The export includes everything.</p>}
        </>
      )}
    </div>
  );
}

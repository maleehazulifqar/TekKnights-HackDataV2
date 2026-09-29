"use client";
import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { usePreview } from "@/hooks/usePreview";
import { useWorkspace } from "@/store/workspace";
import { FormatPreview } from "./FormatPreview";
import { DocumentPreview } from "./DocumentPreview";
import { PREVIEW_ROWS, TablePreview } from "./TablePreview";
import { LiveOverview } from "./DatasetInsights";
import { takeSnapshot } from "@/lib/snapshot";

const TITLE = { tabular: "Tabular preview", relational: "Relational preview", documents: "Document preview" } as const;

export function PreviewCanvas() {
  const p = usePreview();
  const hover = useWorkspace(s => s.hoverFormat);
  const [active, setActive] = useState("");
  const [tab, setTab] = useState<"preview" | "overview">("preview");
  const snapshot = useMemo(
    () => takeSnapshot(p),
    [p.mode, p.seed, p.locale, p.currency, p.rowCount, p.privacy, p.tabular, p.relational, p.docs], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const overview = tab === "overview";
  const showFormat = !overview && hover !== null && (p.data !== null || p.documents !== null);
  const tables = p.data?.spec.tables ?? [];
  const current = tables.find(t => t.name === active) ?? tables[0];
  const rows = current ? p.data!.tables[current.name] : [];

  return (
    <section aria-label="Live preview" className="flex h-full min-h-0 w-full flex-col">
      <header className="glass flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-8">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">{overview ? "Dataset overview" : TITLE[p.mode]}</h2>
          <p className="text-[13px] text-slate">{overview ? `Summary of the full dataset. Seed ${p.seed}.` : `Updates as you change settings. Seed ${p.seed}.`}</p>
        </div>
        <div className="flex items-center gap-3">
          <span aria-live="polite" className={`flex items-center gap-1.5 rounded-full bg-tealsoft px-3 py-1 text-xs font-medium text-teal transition-opacity ${p.pending ? "opacity-100" : "opacity-0"}`}><span className="h-1.5 w-1.5 animate-ping rounded-full bg-teal" />Updating</span>
          <div role="tablist" aria-label="Workspace view" className="inline-flex rounded-xl border border-line bg-white p-1 shadow-sm">
            {(["preview", "overview"] as const).map(id => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                className={`btn h-8 rounded-lg px-4 text-[13px] font-medium capitalize focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal ${tab === id ? "bg-gradient-to-r from-teal to-mint text-white shadow-md shadow-teal/30" : "text-slate hover:bg-sand hover:text-ink"}`}>{id}</button>
            ))}
          </div>
        </div>
      </header>

      <div key={tab} className="min-h-0 flex-1 animate-fade-up space-y-4 overflow-y-auto px-5 py-5 sm:px-8">
        {overview ? <LiveOverview snapshot={snapshot} /> : (
          <>
        {showFormat && hover && <FormatPreview format={hover} mode={p.mode} data={p.data} documents={p.documents} currency={p.currency} locale={p.locale} total={p.docs.count} />}

        {!showFormat && p.mode === "relational" && (
          <div role="tablist" aria-label="Tables" className="flex flex-wrap gap-2">
            {tables.map(t => (
              <button key={t.name} role="tab" type="button" aria-selected={t.name === current?.name} onClick={() => setActive(t.name)}
                className={`btn rounded-full px-3.5 py-1.5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal ${t.name === current?.name ? "bg-gradient-to-r from-ink to-[#24406b] text-white shadow-md" : "bg-sand text-ink hover:-translate-y-0.5 hover:bg-line"}`}>
                {t.name} <span className="opacity-60">{p.data!.tables[t.name].length}</span>
              </button>
            ))}
          </div>
        )}

        {!showFormat && p.mode === "documents" && p.documents && (
          <DocumentPreview docs={p.documents} total={p.docs.count} locale={p.locale} currency={p.currency} />
        )}
        {!showFormat && p.mode !== "documents" && current && (
          <>
            <TablePreview key={current.name} rows={rows} columns={current.columns} />
            <p className="text-[13px] text-slate">
              Showing {Math.min(rows.length, PREVIEW_ROWS)} of {rows.length} preview rows.
            </p>
          </>
        )}

        {p.data && p.data.warnings.filter(w => !w.startsWith("Preview is capped")).map(w => (
          <p key={w} className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{w}
          </p>
        ))}
          </>
        )}
      </div>
    </section>
  );
}

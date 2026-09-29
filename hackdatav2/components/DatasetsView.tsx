"use client";
import { useState } from "react";
import { Database, FileText, Network, Search, Table2, Trash2, type LucideIcon } from "lucide-react";
import type { Mode } from "@/types/schema";
import { useWorkspace } from "@/store/workspace";
import { useDatasets, type DatasetRecord } from "@/store/datasets";
import { formatBytes, timeAgo } from "@/lib/format";
import { DatasetOverview } from "./DatasetOverview";
import { MissingChip } from "./DatasetInsights";

const MODE: Record<Mode, { label: string; Icon: LucideIcon; band: string }> = {
  tabular: { label: "Tabular", Icon: Table2, band: "bg-gradient-to-br from-tealsoft to-mint/30 text-teal" },
  relational: { label: "Relational", Icon: Network, band: "bg-gradient-to-br from-ink to-violet/80 text-white" },
  documents: { label: "Documents", Icon: FileText, band: "bg-gradient-to-br from-sand to-amber-100 text-ink" },
};

function Card({ r, delay = 0 }: { r: DatasetRecord; delay?: number }) {
  const openDataset = useWorkspace(s => s.openDataset);
  const remove = useDatasets(s => s.remove);
  const { label, Icon, band } = MODE[r.snapshot.mode];
  const s = r.summary;
  return (
    <li style={{ animationDelay: `${delay}ms` }} className="card-lift group relative animate-fade-up overflow-hidden rounded-2xl border border-line bg-white focus-within:ring-2 focus-within:ring-teal">
      <button type="button" onClick={() => openDataset(r.id)} className="block w-full text-left focus:outline-none">
        <div className={`flex h-24 items-center justify-center ${band}`}><Icon className="h-9 w-9 opacity-80 transition-transform duration-500 group-hover:scale-125 group-hover:rotate-6" aria-hidden /></div>
        <div className="space-y-2 p-4">
          <h3 className="line-clamp-2 font-display text-[15px] font-semibold leading-snug text-ink">{r.name}</h3>
          <p className="text-[13px] text-slate">{label} · {timeAgo(r.createdAt)}{r.format ? ` · ${r.format.toUpperCase()}` : ""}</p>
          <p className="text-[13px] text-ink">
            {s.rows.toLocaleString()} rows × {s.columns} columns{s.tables > 1 ? ` · ${s.tables} tables` : ""}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="rounded-full bg-sand px-2.5 py-0.5 text-xs font-medium text-ink">{formatBytes(s.sizeBytes)}</span>
            <MissingChip missing={s.missing} pct={s.missingPct} />
          </div>
        </div>
      </button>
      <button type="button" aria-label={`Delete ${r.name}`} onClick={() => remove(r.id)}
        className="btn-icon absolute right-2 top-2 h-8 w-8 bg-white/90 opacity-0 shadow-sm hover:!bg-red-50 hover:!text-red-600 focus-visible:opacity-100 group-hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal">
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );
}

export function DatasetsView() {
  const records = useDatasets(s => s.records);
  const hydrated = useDatasets(s => s.hydrated);
  const clear = useDatasets(s => s.clear);
  const id = useWorkspace(s => s.datasetId);
  const setView = useWorkspace(s => s.setView);
  const [q, setQ] = useState("");

  const open = records.find(r => r.id === id);
  if (open) return <DatasetOverview key={open.id} record={open} />;

  const shown = records.filter(r => r.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <section aria-label="Recent datasets" className="flex h-full min-h-0 w-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-8">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Recent datasets</h2>
          <p className="text-[13px] text-slate">Datasets you exported or saved. Open one to see its overview.</p>
        </div>
        {records.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="relative">
              <span className="sr-only">Search datasets</span>
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate" aria-hidden />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search datasets"
                className="h-9 w-56 rounded-lg border border-line bg-white pl-9 pr-3 text-sm transition-all duration-300 focus:w-72 focus:border-teal focus:outline-none focus:ring-4 focus:ring-teal/15" />
            </label>
            <button type="button" onClick={clear} className="btn h-9 rounded-lg px-3 text-sm text-slate hover:bg-red-50 hover:text-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal">Clear all</button>
          </div>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8">
        {!hydrated ? null : records.length === 0 ? (
          <div className="mx-auto mt-16 max-w-sm animate-fade-up text-center">
            <div className="mx-auto grid h-16 w-16 animate-float place-items-center rounded-2xl bg-gradient-to-br from-tealsoft to-mint/30"><Database className="h-8 w-8 text-teal" aria-hidden /></div>
            <h3 className="mt-4 font-display text-lg font-semibold text-ink">No datasets yet</h3>
            <p className="mt-1 text-sm text-slate">Export a dataset, or choose Save to recent, and it will appear here with its size and missing-data summary.</p>
            <button type="button" onClick={() => setView("workspace")} className="btn-primary mt-5 h-10 rounded-xl px-5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal">Go to workspace</button>
          </div>
        ) : shown.length === 0 ? (
          <p className="text-sm text-slate">No datasets match “{q}”.</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{shown.map((r, i) => <Card key={r.id} r={r} delay={i * 60} />)}</ul>
        )}
      </div>
    </section>
  );
}

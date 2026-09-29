"use client";
import { useState } from "react";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { useWorkspace } from "@/store/workspace";
import type { DatasetRecord } from "@/store/datasets";
import { FORMATS_BY_MODE, runExport } from "@/lib/export";
import { formatBytes } from "@/lib/format";
import type { ExportFormat } from "@/types/schema";
import { DataExplorer, OverviewTiles, useProfile } from "./DatasetInsights";

const FORMAT_LABEL: Record<ExportFormat, string> = { csv: "CSV", xlsx: "Excel", json: "JSON", sql: "SQL", pdf: "PDF" };

export function DatasetOverview({ record }: { record: DatasetRecord }) {
  const openDataset = useWorkspace(s => s.openDataset);
  const loadSnapshot = useWorkspace(s => s.loadSnapshot);
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const { profile, error } = useProfile(record.snapshot); // summary paints first, rows follow

  const { summary: s, snapshot: snap } = record;
  const privacy = [snap.privacy.mask && "masking", snap.privacy.hash && "hashing", snap.privacy.noise && `noise (${snap.privacy.noiseLevel}%)`].filter(Boolean).join(", ");

  async function download(f: ExportFormat) {
    setBusy(f); setStatus(null);
    await new Promise(r => setTimeout(r, 30));
    try { setStatus(`Downloaded ${await runExport(f, snap)}`); }
    catch (e) { setStatus(`Download failed: ${(e as Error).message}`); }
    finally { setBusy(null); }
  }

  return (
    <section aria-label="Dataset overview" className="flex h-full min-h-0 w-full flex-col">
      <header className="glass animate-fade-in border-b border-line px-5 py-4 sm:px-8">
        <button type="button" onClick={() => openDataset(null)} className="btn group mb-2 flex items-center gap-1.5 rounded-md text-[13px] font-medium text-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal">
          <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-1" aria-hidden /> Recent datasets
        </button>
        <h2 className="font-display text-xl font-semibold text-ink">{record.name}</h2>
        <p className="mt-1 text-[13px] text-slate">
          {snap.mode[0].toUpperCase() + snap.mode.slice(1)} · seed {snap.seed} · {snap.locale.replace("_", "-")} · created {new Date(record.createdAt).toLocaleString()}
        </p>
      </header>

      <div className="min-h-0 flex-1 space-y-8 overflow-y-auto px-5 py-6 sm:px-8">
        <div>
          <h3 className="font-display text-base font-semibold text-ink">Overview</h3>
          <div className="mt-3"><OverviewTiles summary={s} documents={profile?.documents} /></div>
          <p className="mt-4 max-w-prose text-sm leading-relaxed text-slate">
            Synthetic {snap.mode} data generated with seed {snap.seed} and the {snap.locale.replace("_", "-")} locale.
            Privacy rules: {privacy || "none"}. Opening this dataset in the workspace restores these settings, and the same seed reproduces the same data.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => loadSnapshot(snap)} className="btn-primary h-10 rounded-xl px-5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal">Open in workspace</button>
            {FORMATS_BY_MODE[snap.mode].map(f => (
              <button key={f} type="button" disabled={busy !== null} onClick={() => download(f)}
                className="btn-ghost group flex h-10 items-center gap-1.5 rounded-xl px-3.5 text-sm font-medium disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal">
                {busy === f ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4 transition-transform group-hover:translate-y-0.5" aria-hidden />}{FORMAT_LABEL[f]}
              </button>
            ))}
          </div>
          <p aria-live="polite" className="mt-2 min-h-[1.25rem] text-[13px] text-slate">{status}</p>
        </div>

        <div>
          <h3 className="font-display text-base font-semibold text-ink">Data explorer</h3>
          {error ? <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900">Could not analyze this dataset: {error}</p>
            : !profile ? <p className="mt-3 flex items-center gap-2 text-sm text-slate"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Analyzing dataset…</p>
            : <div className="mt-3"><DataExplorer profile={profile} /></div>}
        </div>
      </div>
    </section>
  );
}

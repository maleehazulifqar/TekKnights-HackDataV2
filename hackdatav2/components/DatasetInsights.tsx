"use client";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Shuffle } from "lucide-react";
import { formatBytes } from "@/lib/format";
import {
  getProfile, sampleRows, SAMPLE_SIZE,
  type DatasetProfile, type DatasetSummary, type SampleMode,
} from "@/lib/profile";
import { snapshotSignature, type Snapshot } from "@/lib/snapshot";

const num = (n?: number) => (n === undefined ? "–" : n.toLocaleString(undefined, { maximumFractionDigits: 2 }));

export function MissingChip({ missing, pct }: { missing: number; pct: number }) {
  return missing === 0
    ? <span className="rounded-full bg-tealsoft px-2.5 py-0.5 text-xs font-medium text-teal">No missing values</span>
    : <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-900">{missing.toLocaleString()} missing ({pct.toFixed(1)}%)</span>;
}

/**
 * Profiles a snapshot after a short delay so the surrounding UI paints first.
 * With keepStale, the previous profile stays on screen (flagged stale) while a new one is computed.
 */
export function useProfile(snap: Snapshot, opts: { delay?: number; keepStale?: boolean } = {}) {
  const { delay = 20, keepStale = false } = opts;
  const signature = useMemo(() => snapshotSignature(snap), [snap]);
  const [state, setState] = useState<{ sig: string; profile: DatasetProfile } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    const t = setTimeout(() => {
      try { setState({ sig: signature, profile: getProfile(signature, snap) }); }
      catch (e) { setError((e as Error).message); }
    }, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- snap is fully described by its signature
  }, [signature, delay]);

  const fresh = state?.sig === signature;
  return { signature, profile: fresh || keepStale ? state?.profile ?? null : null, stale: !fresh, error };
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="animate-fade-up rounded-2xl border border-line bg-white p-4 transition-shadow hover:shadow-md">
      <div className="text-[13px] text-slate">{label}</div>
      <div className="mt-1 font-display text-2xl font-semibold text-ink">{value}</div>
      <div className="mt-0.5 text-xs text-slate">{note}</div>
    </div>
  );
}

export function OverviewTiles({ summary: s, documents }: { summary: DatasetSummary; documents?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile label="Rows" value={s.rows.toLocaleString()} note={s.tables > 1 ? `across ${s.tables} tables` : documents ? `from ${documents} documents` : "in 1 table"} />
      <Tile label="Columns" value={String(s.columns)} note={s.tables > 1 ? `across ${s.tables} tables` : "in 1 table"} />
      <Tile label="Missing values" value={s.missing.toLocaleString()} note={s.missing === 0 ? "every cell is filled" : `${s.missingPct.toFixed(1)}% of ${s.cells.toLocaleString()} cells`} />
      <Tile label="Size" value={formatBytes(s.sizeBytes)} note="measured as CSV" />
    </div>
  );
}

const SAMPLE_OPTIONS: { id: SampleMode; label: string; hint: string }[] = [
  { id: "head", label: "Head", hint: `First ${SAMPLE_SIZE}` },
  { id: "tail", label: "Tail", hint: `Last ${SAMPLE_SIZE}` },
  { id: "random", label: "Random", hint: `${SAMPLE_SIZE} random` },
];
const SAMPLE_TITLE: Record<SampleMode, string> = { head: "First", tail: "Last", random: "Random" };

export function DataExplorer({ profile, dimmed = false }: { profile: DatasetProfile; dimmed?: boolean }) {
  const [picked, setPicked] = useState("");
  const [mode, setMode] = useState<SampleMode>("head");
  const [shuffle, setShuffle] = useState(0); // bump to draw a fresh random sample
  const table = profile.tables.find(t => t.name === picked) ?? profile.tables[0];
  const rows = useMemo(
    () => sampleRows(table.data, mode),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shuffle intentionally re-draws random rows
    [table, mode, mode === "random" ? shuffle : 0],
  );
  const missing = table.columns.reduce((a, c) => a + c.missing, 0);

  return (
    <div className={`grid gap-4 transition-opacity lg:grid-cols-[220px_1fr] ${dimmed ? "opacity-60" : ""}`}>
      <ul aria-label="Tables" className="flex gap-2 overflow-x-auto lg:flex-col">
        {profile.tables.map(t => (
          <li key={t.name} className="shrink-0">
            <button type="button" aria-current={t.name === table.name} onClick={() => setPicked(t.name)}
              className={`btn w-full rounded-xl border px-3 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal ${t.name === table.name ? "border-teal bg-gradient-to-br from-tealsoft to-white shadow-md shadow-teal/15" : "border-line bg-white hover:-translate-y-0.5 hover:border-teal/50 hover:shadow-sm"}`}>
              <span className="block text-sm font-semibold text-ink">{t.name}</span>
              <span className="block text-xs text-slate">{t.rows.toLocaleString()} × {t.columns.length} · {formatBytes(t.sizeBytes)}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-ink">{table.name}</span>
          <MissingChip missing={missing} pct={table.rows ? (missing / (table.rows * table.columns.length)) * 100 : 0} />
        </div>

        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full min-w-max border-collapse text-sm">
            <caption className="sr-only">Column summary for {table.name}</caption>
            <thead><tr className="bg-sand text-left">
              {["Column", "Type", "Valid / missing", "Unique"].map(h => <th key={h} scope="col" className="px-3 py-2.5 font-semibold text-ink">{h}</th>)}
              {["Min", "Max", "Mean"].map(h => <th key={h} scope="col" className="px-3 py-2.5 text-right font-semibold text-ink">{h}</th>)}
            </tr></thead>
            <tbody>
              {table.columns.map(c => (
                <tr key={c.name} className="border-t border-line/70">
                  <td className="px-3 py-2 font-medium text-ink">{c.name}</td>
                  <td className="px-3 py-2 text-slate">{c.type}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-amber-200" role="img" aria-label={`${(100 - c.missingPct).toFixed(1)}% valid`}>
                        <div className="h-full bg-teal" style={{ width: `${100 - c.missingPct}%` }} />
                      </div>
                      <span className="text-xs text-slate">{c.missing === 0 ? "0% missing" : `${c.missingPct.toFixed(1)}% missing`}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{c.unique.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{num(c.min)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{num(c.max)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{num(c.mean)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-ink" aria-live="polite">
              {SAMPLE_TITLE[mode]} {rows.length} of {table.rows.toLocaleString()} rows
            </h4>
            <div className="flex items-center gap-2">
              {mode === "random" && (
                <button type="button" onClick={() => setShuffle(n => n + 1)}
                  className="btn-ghost group flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal">
                  <Shuffle className="h-3.5 w-3.5 transition-transform duration-500 group-active:rotate-[360deg]" aria-hidden /> Shuffle
                </button>
              )}
              <div role="radiogroup" aria-label="Rows to show" className="inline-flex rounded-xl border border-line bg-white p-1 shadow-sm">
                {SAMPLE_OPTIONS.map(o => (
                  <button key={o.id} type="button" role="radio" aria-checked={mode === o.id} title={o.hint} onClick={() => setMode(o.id)}
                    className={`btn h-7 rounded-lg px-3 text-[13px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal ${mode === o.id ? "bg-gradient-to-r from-teal to-mint text-white shadow-md shadow-teal/30" : "text-slate hover:bg-sand hover:text-ink"}`}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="overflow-x-auto rounded-xl border border-line bg-white">
            <table className="w-full min-w-max border-collapse text-sm">
              <thead><tr className="bg-sand text-left">
                <th scope="col" className="px-3 py-2 text-right font-semibold text-slate">#</th>
                {table.columns.map(c => <th key={c.name} scope="col" className="whitespace-nowrap px-3 py-2 font-semibold text-ink">{c.name}</th>)}
              </tr></thead>
              <tbody>
                {rows.map(({ index, row }) => (
                  <tr key={index} className="border-t border-line/70">
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate">{index.toLocaleString()}</td>
                    {table.columns.map(c => (
                      <td key={c.name} className="whitespace-nowrap px-3 py-1.5">
                        {row[c.name] === null || row[c.name] === undefined ? <span className="italic text-slate/60">null</span> : String(row[c.name])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <p className="p-4 text-sm text-slate">This table has no rows.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Overview + data explorer for the dataset currently configured in the workspace (not yet saved). */
export function LiveOverview({ snapshot }: { snapshot: Snapshot }) {
  const { profile, stale, error } = useProfile(snapshot, { delay: 250, keepStale: true });
  const rowsNote = snapshot.mode === "documents" ? "documents" : "rows";
  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-base font-semibold text-ink">Overview</h3>
          {stale && !error && <span className="flex items-center gap-1.5 text-xs text-slate"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Updating…</span>}
        </div>
        <p className="mt-1 text-[13px] text-slate">
          Full {rowsNote === "documents" ? "document set" : "dataset"} for the current settings, not just the preview. Nothing is saved until you export or save it.
        </p>
        {error ? <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900">Could not analyze this dataset: {error}</p>
          : !profile ? <p className="mt-3 flex items-center gap-2 text-sm text-slate"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Analyzing dataset…</p>
          : <div className={`mt-3 transition-opacity ${stale ? "opacity-60" : ""}`}><OverviewTiles summary={profile.summary} documents={profile.documents} /></div>}
      </div>
      {profile && (
        <div>
          <h3 className="font-display text-base font-semibold text-ink">Data explorer</h3>
          <div className="mt-3"><DataExplorer profile={profile} dimmed={stale} /></div>
        </div>
      )}
    </div>
  );
}

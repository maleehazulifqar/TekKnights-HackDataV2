"use client";
import { useEffect, useState } from "react";
import { Braces, Check, Database, Download, FileSpreadsheet, FileText, FileType, Loader2, type LucideIcon } from "lucide-react";
import { useWorkspace } from "@/store/workspace";
import { FORMATS_BY_MODE, runExport } from "@/lib/export";
import { saveDataset } from "@/lib/saveDataset";
import type { ExportFormat } from "@/types/schema";

const INFO: Record<ExportFormat, { label: string; hint: string; Icon: LucideIcon }> = {
  csv: { label: "CSV", hint: "Plain text, opens anywhere", Icon: FileText },
  xlsx: { label: "Excel", hint: "Workbook with sheets", Icon: FileSpreadsheet },
  json: { label: "JSON", hint: "Structured data", Icon: Braces },
  sql: { label: "SQL dump", hint: "Tables and inserts", Icon: Database },
  pdf: { label: "PDF", hint: "One page per document", Icon: FileType },
};

export function ExportBar() {
  const mode = useWorkspace(s => s.mode);
  const setHover = useWorkspace(s => s.setHoverFormat);
  const formats = FORMATS_BY_MODE[mode];
  const [picked, setPicked] = useState<ExportFormat>("csv");
  const format = formats.includes(picked) ? picked : formats[0];
  const [busy, setBusy] = useState<"export" | "save" | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [done, setDone] = useState<"export" | "save" | null>(null); // brief success state on the button
  useEffect(() => () => setHover(null), [setHover]);

  function flash(k: "export" | "save") { setDone(k); setTimeout(() => setDone(null), 2200); }

  async function run(kind: "export" | "save") {
    setBusy(kind); setStatus(null); setDone(null);
    await new Promise(r => setTimeout(r, 30)); // let the busy state paint before heavy generation
    try {
      if (kind === "save") { saveDataset(); setStatus({ ok: true, text: "Saved to Recent datasets" }); flash("save"); }
      else { const file = await runExport(format); saveDataset(format); setStatus({ ok: true, text: `Exported ${file} and saved to Recent datasets` }); flash("export"); }
    } catch (e) { setStatus({ ok: false, text: `${kind === "save" ? "Save" : "Export"} failed: ${(e as Error).message}. Try a smaller row count.` }); }
    finally { setBusy(null); }
  }

  return (
    <div className="space-y-3 border-t border-line bg-gradient-to-b from-white to-paper p-4">
      <div role="radiogroup" aria-label="Export format" className="grid grid-cols-2 gap-2" onMouseLeave={() => setHover(null)}>
        {formats.map(f => {
          const { label, hint, Icon } = INFO[f];
          const on = f === format;
          return (
            <button
              key={f} type="button" role="radio" aria-checked={on}
              onClick={() => setPicked(f)}
              onMouseEnter={() => setHover(f)} onFocus={() => setHover(f)} onBlur={() => setHover(null)}
              className={`btn group relative flex items-start gap-2 rounded-xl border px-3 py-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal ${on ? "border-teal bg-gradient-to-br from-tealsoft to-white shadow-md shadow-teal/15" : "border-line hover:-translate-y-0.5 hover:border-teal/60 hover:bg-paper hover:shadow-sm"}`}
            >
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 transition-transform duration-300 group-hover:scale-125 group-hover:-rotate-6 ${on ? "text-teal" : "text-slate"}`} aria-hidden />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink">{label}</span>
                <span className="block text-xs leading-snug text-slate">{hint}</span>
              </span>
              {on && <span key={f} className="absolute right-2 top-2 grid h-4 w-4 animate-check-pop place-items-center rounded-full bg-teal text-white"><Check className="h-3 w-3" strokeWidth={3} aria-hidden /></span>}
            </button>
          );
        })}
      </div>
      <button
        type="button" onClick={() => run("export")} disabled={busy !== null}
        className={`btn-primary group flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal ${done === "export" ? "btn-success" : ""}`}
      >
        {busy === "export" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          : done === "export" ? <Check key="ok" className="h-5 w-5 animate-check-pop" strokeWidth={3} aria-hidden />
          : <Download className="h-4 w-4 transition-transform group-hover:translate-y-0.5" aria-hidden />}
        {busy === "export" ? "Generating…" : done === "export" ? "Exported!" : `Export ${INFO[format].label}`}
      </button>
      <button
        type="button" onClick={() => run("save")} disabled={busy !== null}
        className={`btn-ghost flex h-10 w-full items-center justify-center gap-2 rounded-xl text-sm font-medium disabled:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal ${done === "save" ? "!border-green-500 !bg-green-50 !text-green-700" : ""}`}
      >
        {busy === "save" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {done === "save" && <Check key="ok" className="h-4 w-4 animate-check-pop" strokeWidth={3} aria-hidden />}
        {done === "save" ? "Saved!" : "Save to recent datasets"}
      </button>
      <p key={status?.text} aria-live="polite" className={`min-h-[1.25rem] animate-fade-up text-[13px] ${status?.ok === false ? "text-red-700" : "text-slate"}`}>{status?.text}</p>
    </div>
  );
}

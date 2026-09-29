"use client";
import { Table2, Network, FileText, History, type LucideIcon } from "lucide-react";
import type { Mode } from "@/types/schema";
import { useWorkspace } from "@/store/workspace";
import { useDatasets } from "@/store/datasets";

const MODES: { id: Mode; label: string; hint: string; Icon: LucideIcon }[] = [
  { id: "tabular", label: "Tabular", hint: "One table, custom columns", Icon: Table2 },
  { id: "relational", label: "Relational", hint: "Linked tables with keys", Icon: Network },
  { id: "documents", label: "Documents", hint: "Invoices and statements", Icon: FileText },
];

const item = (active: boolean) =>
  `btn group flex flex-1 items-center gap-3 rounded-xl px-3 py-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white lg:flex-none ${active ? "bg-gradient-to-r from-teal to-mint/90 text-white shadow-lg shadow-mint/20" : "text-white/70 hover:translate-x-1 hover:bg-white/10 hover:text-white"}`;

export function ModeSwitcher() {
  const { mode, view, setMode, setView } = useWorkspace();
  const count = useDatasets(s => s.records.length);
  return (
    <nav aria-label="Workspace" className="flex gap-1 p-3 lg:flex-col lg:gap-1.5 lg:p-4">
      {MODES.map(({ id, label, hint, Icon }) => {
        const active = view === "workspace" && id === mode;
        return (
          <button key={id} type="button" aria-current={active ? "page" : undefined} onClick={() => setMode(id)} className={item(active)}>
            <Icon className="h-[18px] w-[18px] shrink-0 transition-transform duration-300 group-hover:scale-125 group-hover:-rotate-6" aria-hidden />
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{label}</span>
              <span className={`hidden text-xs lg:block ${active ? "text-white/80" : "text-white/50"}`}>{hint}</span>
            </span>
          </button>
        );
      })}
      <hr className="my-2 hidden border-white/10 lg:block" />
      <button type="button" aria-current={view === "datasets" ? "page" : undefined} onClick={() => setView("datasets")} className={item(view === "datasets")}>
        <History className="h-[18px] w-[18px] shrink-0 transition-transform duration-300 group-hover:scale-125 group-hover:-rotate-6" aria-hidden />
        <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
          <span className="text-sm font-semibold">
            <span className="lg:hidden">Recent</span><span className="hidden lg:inline">Recent datasets</span>
          </span>
          {count > 0 && <span key={count} className="animate-pop-in rounded-full bg-white/20 px-2 py-0.5 text-xs">{count}</span>}
        </span>
      </button>
    </nav>
  );
}

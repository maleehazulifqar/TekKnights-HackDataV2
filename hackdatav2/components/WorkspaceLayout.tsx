"use client";
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { useWorkspace } from "@/store/workspace";
import { useDatasets } from "@/store/datasets";
import { ConfigPanel } from "./ConfigPanel";
import { DatasetsView } from "./DatasetsView";
import { ModeSwitcher } from "./ModeSwitcher";
import { PreviewCanvas } from "./PreviewCanvas";

/** Adds a ripple to any element with the .btn class, wherever it is clicked. */
function useRipple() {
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>(".btn");
      if (!el || (el as HTMLButtonElement).disabled) return;
      const r = el.getBoundingClientRect();
      const size = Math.max(r.width, r.height);
      const dot = document.createElement("span");
      dot.className = "ripple-dot";
      Object.assign(dot.style, { width: `${size}px`, height: `${size}px`, left: `${e.clientX - r.left - size / 2}px`, top: `${e.clientY - r.top - size / 2}px` });
      el.appendChild(dot);
      dot.addEventListener("animationend", () => dot.remove());
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);
}

export function WorkspaceLayout() {
  const [pane, setPane] = useState<"preview" | "configure">("preview"); // small screens show one pane at a time
  const view = useWorkspace(s => s.view);
  useEffect(() => { void useDatasets.persist.rehydrate(); }, []);
  useRipple();
  return (
    <div className="flex h-dvh flex-col text-ink lg:flex-row">
      <aside className="relative shrink-0 overflow-hidden bg-gradient-to-b from-night via-ink to-[#0f3a3f] text-white lg:w-64">
        <div aria-hidden className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 animate-blob rounded-full bg-mint/25 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-16 -right-10 hidden h-52 w-52 animate-blob rounded-full bg-violet/25 blur-3xl [animation-delay:3s] lg:block" />
        <div className="relative hidden items-center gap-3 px-6 pb-2 pt-6 lg:flex">
          <div className="grid h-10 w-10 animate-glow-pulse place-items-center rounded-xl bg-gradient-to-br from-teal to-mint shadow-lg shadow-mint/30">
            <Sparkles className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <div className="font-display text-lg font-semibold leading-tight">HackDataV2</div>
            <div className="text-[12px] text-white/60">Synthetic data platform</div>
          </div>
        </div>
        <div className="relative"><ModeSwitcher /></div>
      </aside>

      {view === "datasets" ? (
        <main className="flex min-h-0 flex-1 animate-fade-in"><DatasetsView /></main>
      ) : (
        <>
          <main className={`min-h-0 flex-1 ${pane === "preview" ? "flex" : "hidden"} animate-fade-in lg:flex`}><PreviewCanvas /></main>
          <aside className={`min-h-0 flex-1 border-line bg-white/90 shadow-[-8px_0_30px_-15px_rgba(22,34,58,0.15)] lg:w-[380px] lg:flex-none lg:border-l ${pane === "configure" ? "block" : "hidden"} lg:block`}>
            <ConfigPanel />
          </aside>
          <div role="tablist" aria-label="Workspace pane" className="glass grid shrink-0 grid-cols-2 border-t border-line lg:hidden">
            {(["preview", "configure"] as const).map(id => (
              <button key={id} role="tab" type="button" aria-selected={pane === id} onClick={() => setPane(id)}
                className={`btn relative h-12 text-sm font-semibold capitalize ${pane === id ? "text-teal" : "text-slate"}`}>
                {id}
                <span className={`absolute inset-x-6 top-0 h-0.5 rounded-full bg-gradient-to-r from-teal to-mint transition-transform duration-300 ${pane === id ? "scale-x-100" : "scale-x-0"}`} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

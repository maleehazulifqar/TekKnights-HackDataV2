import type { ExportFormat } from "@/types/schema";
import { useWorkspace } from "@/store/workspace";
import { useDatasets } from "@/store/datasets";
import { snapshotSignature, takeSnapshot } from "./snapshot";
import { getProfile } from "./profile";

/** Adds the current workspace configuration to Recent datasets. Identical settings update the existing entry. */
export function saveDataset(format?: ExportFormat) {
  const snap = takeSnapshot(useWorkspace.getState());
  const signature = snapshotSignature(snap);
  const profile = getProfile(signature, snap);
  const name = snap.mode === "tabular" ? snap.tabular.name
    : snap.mode === "relational" ? snap.relational.tables.map(t => t.name).join(" + ")
    : snap.docs.docType === "invoice" ? "Invoices" : "Bank statements";
  useDatasets.getState().upsert({ signature, name: `${name} (seed ${snap.seed})`, format, snapshot: snap, summary: profile.summary });
}

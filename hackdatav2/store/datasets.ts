import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ExportFormat } from "@/types/schema";
import type { Snapshot } from "@/lib/snapshot";
import type { DatasetSummary } from "@/lib/profile";

export interface DatasetRecord {
  id: string; signature: string; name: string; createdAt: number;
  format?: ExportFormat; snapshot: Snapshot; summary: DatasetSummary;
}
const MAX_RECORDS = 30;

interface DatasetsState {
  records: DatasetRecord[];
  hydrated: boolean;
  upsert: (r: Omit<DatasetRecord, "id" | "createdAt">) => void;
  remove: (id: string) => void;
  clear: () => void;
}

export const useDatasets = create<DatasetsState>()(persist(
  set => ({
    records: [], hydrated: false,
    upsert: r => set(s => {
      const prev = s.records.find(x => x.signature === r.signature); // same settings + seed = same dataset
      const rec: DatasetRecord = { ...r, id: prev?.id ?? Math.random().toString(36).slice(2) + Date.now().toString(36), createdAt: Date.now() };
      return { records: [rec, ...s.records.filter(x => x.signature !== r.signature)].slice(0, MAX_RECORDS) };
    }),
    remove: id => set(s => ({ records: s.records.filter(r => r.id !== id) })),
    clear: () => set({ records: [] }),
  }),
  {
    name: "hackdatav2-datasets",
    storage: createJSONStorage(() => localStorage),
    skipHydration: true, // rehydrated in an effect so server and client first render match
    partialize: s => ({ records: s.records }),
    onRehydrateStorage: () => () => useDatasets.setState({ hydrated: true }),
  },
));

import type { WorkspaceState } from "@/store/workspace";
import { hashString } from "./rng";

/** Everything needed to regenerate a dataset exactly (generation is seeded and deterministic). */
export type Snapshot = Pick<WorkspaceState, "mode" | "seed" | "locale" | "currency" | "rowCount" | "privacy" | "tabular" | "relational" | "docs">;

export const takeSnapshot = (s: Snapshot): Snapshot => ({
  mode: s.mode, seed: s.seed, locale: s.locale, currency: s.currency, rowCount: s.rowCount,
  privacy: s.privacy, tabular: s.tabular, relational: s.relational, docs: s.docs,
});

/** Stable id for a snapshot: same settings + seed = same dataset. */
export const snapshotSignature = (snap: Snapshot): string => hashString(JSON.stringify(snap)).toString(36);

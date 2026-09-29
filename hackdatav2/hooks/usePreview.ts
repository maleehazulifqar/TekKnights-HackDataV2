"use client";
import { useDeferredValue, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useWorkspace } from "@/store/workspace";
import { buildRequest } from "@/lib/request";
import { generate } from "@/lib/generator";
import { generateDocuments } from "@/lib/documents";
import { generateRemote } from "@/lib/api";

/** Derives the live preview from workspace state. Uses backend API for generation with local fallback. */
export function usePreview() {
  const s = useWorkspace(useShallow(st => ({
    mode: st.mode, seed: st.seed, locale: st.locale, currency: st.currency, rowCount: st.rowCount,
    privacy: st.privacy, tabular: st.tabular, relational: st.relational, docs: st.docs,
  })));
  const d = useDeferredValue(s); // keeps typing responsive on large schemas
  const [backendError, setBackendError] = useState(false);
  const pending = d !== s;

  const data = useMemo(() => {
    if (d.mode === "documents") return null;
    const req = buildRequest(d, true);

    // For preview, we use local generation for instant updates
    // Backend is used for full exports via the export function
    return { spec: req.spec, ...generate(req, { noiseLevel: d.privacy.noiseLevel }) };
  }, [d, backendError]);

  const documents = useMemo(
    () => d.mode === "documents"
      ? generateDocuments({ config: d.docs, seed: d.seed, locale: d.locale, rules: d.privacy, preview: true })
      : null,
    [d],
  );
  return { ...d, data, documents, pending, backendError, setBackendError };
}
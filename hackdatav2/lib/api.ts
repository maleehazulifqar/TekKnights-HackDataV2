import type {
  GenerateRequest, GenerateResponse,
  DocumentRequest, DocumentsResponse,
  ExportRequest,
  InferResponse
} from "@/types/schema";

/** Set NEXT_PUBLIC_API_URL to route generation through the Python backend. */
export const API_URL = process.env.NEXT_PUBLIC_API_URL;

export async function generateTabularRemote(req: GenerateRequest): Promise<GenerateResponse> {
  const res = await fetch(`${API_URL}/generate/tabular`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`Backend returned ${res.status}`);
  return res.json();
}

export async function generateRelationalRemote(req: GenerateRequest): Promise<GenerateResponse> {
  const res = await fetch(`${API_URL}/generate/relational`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`Backend returned ${res.status}`);
  return res.json();
}

export async function generateDocumentsRemote(req: DocumentRequest): Promise<DocumentsResponse> {
  const res = await fetch(`${API_URL}/generate/documents`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`Backend returned ${res.status}`);
  return res.json();
}

export async function exportDocumentsRemote(req: DocumentRequest): Promise<Blob> {
  const res = await fetch(`${API_URL}/export/documents`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`Backend returned ${res.status}`);
  return res.blob();
}

export async function exportDataRemote(req: ExportRequest): Promise<Blob> {
  const res = await fetch(`${API_URL}/export/data`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`Backend returned ${res.status}`);
  return res.blob();
}

export async function inferSchemaRemote(files: {filename: string, content: BlobPart}[], use_llm: boolean = true): Promise<InferResponse> {
  const formData = new FormData();
  files.forEach((file, index) => {
    formData.append("files", new Blob([file.content]), file.filename || `table_${index + 1}`);
  });
  formData.append("use_llm", use_llm.toString());

  const res = await fetch(`${API_URL}/schema/infer`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error(`Backend returned ${res.status}`);
  return res.json();
}

export async function healthCheck(): Promise<{status: string}> {
  if (!API_URL) return {status: "no_backend"};
  try {
    const res = await fetch(`${API_URL}/health`);
    if (!res.ok) throw new Error(`Backend returned ${res.status}`);
    return res.json();
  } catch (error) {
    return {status: "error", error: String(error)};
  }
}
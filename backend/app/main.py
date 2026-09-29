from fastapi import FastAPI
from fastapi import HTTPException
from fastapi import Response
from fastapi import File, Form, UploadFile
from app.exporters import export_data
from fastapi.middleware.cors import CORSMiddleware
from app.schemas import GenerateRequest, GenerateResponse
from app.engines.tabular import generate_table
from app.engines.relational import SchemaError, generate_relational
from app.engines.documents import export_documents_pdf, generate_documents
from app.schemas import DocumentRequest, DocumentsResponse
from app.schemas import ExportRequest
from app.ai.inference import InferenceError, infer_schema
from app.schemas import InferResponse
from typing import List
from dotenv import load_dotenv
load_dotenv()


app = FastAPI(title="Synthetic Data Platform")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten later
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/generate/tabular", response_model=GenerateResponse)
def generate_tabular(req: GenerateRequest):
    warnings: list[str] = []
    tables = {}
    for t in req.spec.tables:
        if t.foreign_keys:
            warnings.append(f"{t.name}: foreign keys ignored here; use /generate/relational")
        tables[t.name] = generate_table(t, req.seed, req.locale, req.preview, warnings)
    return GenerateResponse(tables=tables, warnings=warnings)

@app.post("/generate/relational", response_model=GenerateResponse)
def generate_relational_endpoint(req: GenerateRequest):
    try:
        return generate_relational(req)
    except SchemaError as e:
        raise HTTPException(status_code=422, detail=str(e))

@app.post("/generate/documents", response_model=DocumentsResponse)
def generate_documents_endpoint(req: DocumentRequest):
    return generate_documents(req)

@app.post("/export/documents")
def export_documents_endpoint(req: DocumentRequest):
    data, media, name = export_documents_pdf(req)
    return Response(content=data, media_type=media,
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})


@app.post("/export/data")
def export_data_endpoint(req: ExportRequest):
    try:
        data, media, name = export_data(req)
    except SchemaError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return Response(content=data, media_type=media,
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})


@app.post("/schema/infer", response_model=InferResponse)
def infer_schema_endpoint(files: list[UploadFile] = File(...), use_llm: bool = Form(True)):
    payload = [(f.filename or f"table_{i}", f.file.read()) for i, f in enumerate(files, 1)]
    try:
        return infer_schema(payload, use_llm)
    except InferenceError as e:
        raise HTTPException(status_code=422, detail=str(e))
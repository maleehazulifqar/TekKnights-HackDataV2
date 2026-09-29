from typing import Any, Literal, Optional
from pydantic import BaseModel, Field
from datetime import date

ColumnType = Literal[
    "integer", "float", "string", "category", "boolean",
    "date", "datetime", "email", "name", "address", "phone", "uuid",
]
PrivacyMode = Literal["none", "mask", "hash", "noise"]
Distribution = Literal["uniform", "normal", "lognormal"]


class ColumnSpec(BaseModel):
    name: str
    type: ColumnType
    primary_key: bool = False
    unique: bool = False
    null_rate: float = Field(0.0, ge=0, le=1)
    outlier_rate: float = Field(0.0, ge=0, le=1)
    distribution: Distribution = "uniform"
    min: Optional[float] = None
    max: Optional[float] = None
    mean: Optional[float] = None
    std: Optional[float] = None
    categories: Optional[list[str]] = None
    weights: Optional[list[float]] = None
    privacy: PrivacyMode = "none"


class ForeignKey(BaseModel):
    column: str
    ref_table: str
    ref_column: str
    cardinality: Literal["1:1", "1:N", "N:N"] = "1:N"
    min_children: int = Field(1, ge=0)
    max_children: int = Field(5, ge=1)


class TableSpec(BaseModel):
    name: str
    row_count: int = Field(100, ge=1, le=100_000)
    columns: list[ColumnSpec]
    foreign_keys: list[ForeignKey] = []

class AggregateRule(BaseModel):
    """Parent column is computed from child rows, e.g. orders.total = sum(order_items.line_total)."""
    parent_table: str
    parent_column: str
    child_table: str
    child_column: str
    fk_column: str  # FK column on the child table pointing at the parent
    op: Literal["sum", "count", "mean"] = "sum"

class SchemaSpec(BaseModel):
    tables: list[TableSpec]
    rules: list[AggregateRule] = []


class GenerateRequest(BaseModel):
    spec: SchemaSpec
    seed: int = 42
    locale: str = "en_US"
    preview: bool = True  # True = cap at ~20 rows for the live canvas


class GenerateResponse(BaseModel):
    tables: dict[str, list[dict[str, Any]]]
    warnings: list[str] = []
    checks: list[dict[str, Any]] = []


Region = Literal["US", "UK", "PK", "EU"]


class InvoiceConfig(BaseModel):
    region: Region = "US"
    count: int = Field(1, ge=1, le=500)
    min_items: int = Field(1, ge=1, le=12)
    max_items: int = Field(5, ge=1, le=12)
    tax_rate: Optional[float] = Field(None, ge=0, le=1)  # None = region default
    seller_name: str = "Synth Data Co."


class StatementConfig(BaseModel):
    region: Region = "US"
    count: int = Field(1, ge=1, le=100)
    days: int = Field(30, ge=1, le=365)
    opening_balance: float = Field(2000.0, ge=0)
    transactions: Optional[int] = Field(None, ge=1, le=400)
    end_date: Optional[date] = None  # default: fixed anchor date, for reproducibility
    query: Optional[str] = None      # e.g. "last 90 days, balance over $500"


class DocumentRequest(BaseModel):
    kind: Literal["invoice", "bank_statement"]
    seed: int = 42
    invoice: InvoiceConfig = Field(default_factory=InvoiceConfig)
    statement: StatementConfig = Field(default_factory=StatementConfig)


class DocumentsResponse(BaseModel):
    documents: list[dict[str, Any]]
    notes: list[str] = []
    parsed_query: dict[str, Any] = {}
    checks: list[dict[str, Any]] = []


class ExportRequest(BaseModel):
    spec: SchemaSpec
    seed: int = 42
    locale: str = "en_US"
    format: Literal["csv", "json", "sql"] = "csv"
    dialect: Literal["postgres", "sqlite"] = "postgres"  # only used for sql


class InferResponse(BaseModel):
    spec: SchemaSpec
    notes: list[str] = []
    used_llm: bool = False
    llm_changes: list[dict[str, str]] = []  # column, from, to, reason
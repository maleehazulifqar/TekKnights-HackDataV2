"""Schema inference: local statistical profiling + optional LLM refinement.

Privacy: the LLM never receives raw values, only column names, detected types, null
rates, distinct counts and character-pattern "shapes" (letters -> a/A, digits -> 9).
"""
from __future__ import annotations

import io
import json
import re
from pathlib import Path

import numpy as np
import pandas as pd

from app.ai import provider
from app.schemas import ColumnSpec, ForeignKey, InferResponse, SchemaSpec, TableSpec

MAX_BYTES = 5_000_000
MAX_ROWS = 100_000
MAX_CATEGORIES = 50
EMAIL_RE = r"[^@\s]+@[^@\s]+\.[^@\s]+"
UUID_RE = r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
DATE_RE = r"\d{4}-\d{2}-\d{2}"
DATETIME_RE = r"\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}.*"
PHONE_RE = r"\+?[\d\s\-()]{7,20}"
TEXT_TYPES = {"string", "category", "name", "email", "address", "phone", "uuid"}
ALLOWED = sorted(TEXT_TYPES | {"integer", "float", "boolean", "date", "datetime"})
TRANSITIONS: dict[str, set[str]] = {t: TEXT_TYPES - {t} for t in TEXT_TYPES}
TRANSITIONS["integer"] = {"category"}  # e.g. status codes stored as numbers


class InferenceError(ValueError):
    """The uploaded sample could not be understood."""


# ---------------------------------------------------------------- reading
def _table_name(filename: str, existing: dict) -> str:
    base = re.sub(r"\W+", "_", Path(filename).stem).strip("_").lower() or "table"
    name, i = base, 2
    while name in existing:
        name, i = f"{base}_{i}", i + 1
    return name


def _read(filename: str, data: bytes) -> pd.DataFrame:
    if len(data) > MAX_BYTES:
        raise InferenceError(f"{filename}: file larger than {MAX_BYTES // 1_000_000} MB")
    try:
        if filename.lower().endswith(".json"):
            obj = json.loads(data.decode("utf-8-sig"))
            if isinstance(obj, dict):
                obj = obj.get("data") or obj.get("rows") or [obj]
            df = pd.DataFrame(obj)
        else:
            try:
                df = pd.read_csv(io.BytesIO(data), encoding="utf-8-sig", nrows=MAX_ROWS)
            except UnicodeDecodeError:
                df = pd.read_csv(io.BytesIO(data), encoding="latin-1", nrows=MAX_ROWS)
    except Exception as e:
        raise InferenceError(f"{filename}: could not parse ({e.__class__.__name__})")
    if df.empty or df.shape[1] == 0:
        raise InferenceError(f"{filename}: no rows or columns found")
    df.columns = [str(c).strip() for c in df.columns]
    return df.head(MAX_ROWS)


# -------------------------------------------------------------- profiling
def _shape(v) -> str:
    s = re.sub(r"\d", "9", str(v)[:40])
    return re.sub(r"[A-Z]", "A", re.sub(r"[a-z]", "a", s))


def _heuristic_type(name: str, s: pd.Series) -> str:
    nn, lname = s.dropna(), name.lower()
    if nn.empty:
        return "string"
    if pd.api.types.is_bool_dtype(s):
        return "boolean"
    if pd.api.types.is_integer_dtype(s):
        return "integer"
    if pd.api.types.is_float_dtype(s):
        return "float"
    strs = nn.astype(str)

    def share(rx: str) -> float:
        return float(strs.str.fullmatch(rx).mean())

    if share(EMAIL_RE) > 0.9:
        return "email"
    if share(UUID_RE) > 0.9:
        return "uuid"
    if share(DATETIME_RE) > 0.9:
        return "datetime"
    if share(DATE_RE) > 0.9:
        return "date"
    if re.search(r"phone|mobile", lname) and share(PHONE_RE) > 0.9:
        return "phone"
    if "address" in lname:
        return "address"
    if "name" in lname and not re.search(r"user|file|host|table|column", lname):
        return "name"
    distinct = int(nn.nunique())
    if distinct < len(nn) and distinct <= max(12, int(0.05 * len(nn))):
        return "category"
    return "string"


def _find_pk(df: pd.DataFrame) -> str | None:
    for c in df.columns:
        s = df[c]
        idish = re.search(r"(^|_)id$|[a-z]Id$|^id_", c, flags=re.IGNORECASE)
        if idish and s.notna().all() and s.is_unique and \
                (pd.api.types.is_integer_dtype(s) or s.dtype == object):
            return c
    return None


def _finite(x, default=None):
    x = float(x)
    return x if np.isfinite(x) and x > 0 else default


def _build_column(name: str, s: pd.Series, ctype: str, is_pk: bool) -> ColumnSpec:
    nn = s.dropna()
    if is_pk:
        kw = {"name": name, "type": ctype, "primary_key": True}
        if ctype == "integer":
            kw["min"] = int(nn.min())
        return ColumnSpec(**kw)
    kw = {"name": name, "type": ctype, "null_rate": round(float(s.isna().mean()), 4)}
    if ctype in ("integer", "float") and not nn.empty:
        x = nn.astype(float)
        kw["min"], kw["max"] = float(x.min()), float(x.max())
        skew = float(x.skew()) if len(x) > 2 else 0.0
        if x.min() > 0 and skew > 1.0:
            kw.update(distribution="lognormal", mean=float(x.median()),
                      std=_finite(np.log(x).std(), 0.5))
        elif abs(skew) < 0.5 and len(x) >= 8:
            kw.update(distribution="normal", mean=float(x.mean()), std=_finite(x.std()))
    elif ctype == "category" and not nn.empty:
        top = nn.astype(str).value_counts().head(MAX_CATEGORIES)
        kw["categories"] = [str(i) for i in top.index]
        kw["weights"] = [round(float(v) / float(top.sum()), 4) for v in top.values]
    elif ctype in ("email", "phone") and len(nn) >= 10 and nn.is_unique:
        kw["unique"] = True
    return ColumnSpec(**kw)


# ------------------------------------------------------------ foreign keys
def _detect_fks(frames: dict[str, pd.DataFrame], tables: dict[str, TableSpec],
                notes: list[str]) -> None:
    pks = {t: next((c.name for c in spec.columns if c.primary_key), None)
           for t, spec in tables.items()}
    for child, cdf in frames.items():
        pk_cols = {c.name for c in tables[child].columns if c.primary_key}
        for col in cdf.columns:
            if col in pk_cols:
                continue
            for parent, pk in pks.items():
                if parent == child or pk is None:
                    continue
                singular = parent[:-1] if parent.endswith("s") else parent
                if col.lower() not in {pk.lower(), f"{parent}_id", f"{singular}_id"}:
                    continue
                vals = cdf[col].dropna()
                parent_keys = frames[parent][pk].dropna().tolist()
                if vals.empty or not set(vals.tolist()).issubset(set(parent_keys)):
                    continue
                vc = vals.value_counts().to_dict()
                per_parent = [vc.get(k, 0) for k in parent_keys]
                card = "1:1" if vals.is_unique else "1:N"
                tables[child].foreign_keys.append(ForeignKey(
                    column=col, ref_table=parent, ref_column=pk, cardinality=card,
                    min_children=int(min(per_parent)), max_children=max(1, int(max(per_parent)))))
                notes.append(f"Detected foreign key {child}.{col} -> {parent}.{pk} ({card})")
                break


# ----------------------------------------------------------- LLM refinement
SYSTEM = (
    "You are a data-modeling assistant. You receive a statistical profile of tabular data: "
    "column names, detected types, null rates, distinct counts, and character-pattern shapes "
    "(letters are 'a'/'A', digits are '9'). You never see real values. "
    f"Allowed types: {ALLOWED}. "
    'Return ONLY a JSON object: {"columns": [{"table": str, "column": str, "type": str, '
    '"reason": str}], "notes": [str]}. '
    "List a column only if its detected type should change to something more specific "
    "(for example string -> name, address, phone, email or category). "
    "Never invent tables or columns. Put at most 4 short observations in notes about data "
    "quality or realistic edge cases worth testing."
)


def _profile(frames: dict[str, pd.DataFrame], tables: dict[str, TableSpec]) -> dict:
    out = {}
    for tname, df in frames.items():
        cols = []
        for c in tables[tname].columns:
            nn = df[c.name].dropna()
            item = {"name": c.name, "detected_type": c.type,
                    "null_rate": round(float(df[c.name].isna().mean()), 3),
                    "distinct": int(nn.nunique()),
                    "shapes": sorted({_shape(v) for v in nn.head(20)})[:3]}
            if c.min is not None and c.max is not None:
                item["range"] = [c.min, c.max]
            cols.append(item)
        out[tname] = {"rows": int(len(df)), "columns": cols}
    return out


def _llm_refine(frames: dict[str, pd.DataFrame],
                tables: dict[str, TableSpec]) -> tuple[list[dict], list[str]]:
    resp = provider.complete_json(SYSTEM, json.dumps(_profile(frames, tables)))
    changes: list[dict] = []
    items = resp.get("columns", [])
    for item in items[:200] if isinstance(items, list) else []:
        if not isinstance(item, dict):
            continue
        t, c, new = item.get("table"), item.get("column"), item.get("type")
        spec = tables.get(t) if isinstance(t, str) else None
        if spec is None or new not in ALLOWED:
            continue
        idx = next((i for i, x in enumerate(spec.columns) if x.name == c), None)
        if idx is None:
            continue
        old = spec.columns[idx]
        if (new == old.type or old.primary_key or new not in TRANSITIONS.get(old.type, set())
                or c in {fk.column for fk in spec.foreign_keys}):
            continue
        if new == "category" and frames[t][c].nunique() > MAX_CATEGORIES:
            continue
        spec.columns[idx] = _build_column(c, frames[t][c], new, False)
        changes.append({"column": f"{t}.{c}", "from": old.type, "to": new,
                        "reason": str(item.get("reason", ""))[:200]})
    raw_notes = resp.get("notes", [])
    notes = [n[:200] for n in raw_notes[:4] if isinstance(n, str)] if isinstance(raw_notes, list) else []
    return changes, notes


# ------------------------------------------------------------------- main
def infer_schema(files: list[tuple[str, bytes]], use_llm: bool = True) -> InferResponse:
    frames: dict[str, pd.DataFrame] = {}
    for filename, data in files:
        frames[_table_name(filename, frames)] = _read(filename, data)

    tables: dict[str, TableSpec] = {}
    for tname, df in frames.items():
        pk = _find_pk(df)
        cols = [_build_column(c, df[c], _heuristic_type(c, df[c]), c == pk) for c in df.columns]
        tables[tname] = TableSpec(name=tname, row_count=max(1, min(len(df), MAX_ROWS)), columns=cols)

    notes: list[str] = []
    _detect_fks(frames, tables, notes)

    changes: list[dict] = []
    used = False
    if use_llm and provider.is_enabled():
        try:
            changes, llm_notes = _llm_refine(frames, tables)
            used = True
            notes += llm_notes
        except provider.LLMUnavailable as e:
            notes.append(f"AI refinement skipped: {e}")
    elif use_llm:
        notes.append("LLM_PROVIDER not configured: used statistical heuristics only.")

    return InferResponse(spec=SchemaSpec(tables=list(tables.values())),
                         notes=notes, used_llm=used, llm_changes=changes)
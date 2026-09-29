"""Seeded tabular data engine.

Every column gets its own RNG stream derived from (seed, table, column), so the
same request always produces the same data, and editing one column does not
reshuffle the others.
"""
from __future__ import annotations

import hashlib
import uuid
import zlib
from datetime import date, datetime, timedelta

import numpy as np
from faker import Faker

from app.schemas import ColumnSpec, TableSpec

PREVIEW_ROWS = 20
ANCHOR_DATE = date(2026, 1, 1)  # fixed anchor keeps dates reproducible
NUMERIC_TYPES = {"integer", "float"}


def _col_seed(seed: int, table: str, col: str) -> int:
    return (seed * 1_000_003 + zlib.crc32(f"{table}.{col}".encode())) & 0xFFFFFFFF


def _make_faker(locale: str, col_seed: int, warnings: list[str]) -> Faker:
    try:
        fake = Faker(locale)
    except Exception:
        warnings.append(f"Unknown locale '{locale}', fell back to en_US")
        fake = Faker("en_US")
    fake.seed_instance(col_seed)
    return fake


def _numeric(col: ColumnSpec, n: int, rng: np.random.Generator, as_int: bool) -> list:
    lo = col.min if col.min is not None else 0.0
    hi = col.max if col.max is not None else 1000.0
    if hi < lo:
        lo, hi = hi, lo
    span = hi - lo

    if col.distribution == "normal":
        mean = col.mean if col.mean is not None else (lo + hi) / 2
        std = col.std if col.std is not None else (span / 6 or 1.0)
        vals = rng.normal(mean, std, n)
    elif col.distribution == "lognormal":
        # mean = median of the distribution, std = sigma of the underlying log
        median = col.mean if col.mean is not None else max((lo + hi) / 2, 1e-6)
        sigma = col.std if col.std is not None else 0.5
        vals = rng.lognormal(np.log(max(median, 1e-6)), sigma, n)
    else:
        vals = rng.uniform(lo, hi, n)

    if col.min is not None:
        vals = np.maximum(vals, col.min)
    if col.max is not None:
        vals = np.minimum(vals, col.max)

    if col.outlier_rate > 0 and n > 0:
        mask = rng.random(n) < col.outlier_rate
        k = int(mask.sum())
        if k:
            center = float(np.median(vals))
            spread = float(np.std(vals)) or 1.0
            sign = rng.choice([-1.0, 1.0], k)
            vals[mask] = center + sign * rng.uniform(4, 8, k) * spread

    return np.rint(vals).astype(np.int64).tolist() if as_int else np.round(vals, 2).tolist()


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    out = []
    for i, v in enumerate(values):
        cand = v
        if cand in seen:
            if "@" in v:
                local, dom = v.split("@", 1)
                cand = f"{local}{i}@{dom}"
            else:
                cand = f"{v}-{i}"
        seen.add(cand)
        out.append(cand)
    return out


def _generate_values(col: ColumnSpec, table: str, n: int, seed: int,
                     locale: str, warnings: list[str]) -> tuple[list, np.random.Generator]:
    cs = _col_seed(seed, table, col.name)
    rng = np.random.default_rng(cs)
    t = col.type

    if t == "integer":
        if col.primary_key or col.unique:
            start = int(col.min) if col.min is not None else 1
            return list(range(start, start + n)), rng
        return _numeric(col, n, rng, as_int=True), rng
    if t == "float":
        return _numeric(col, n, rng, as_int=False), rng
    if t == "boolean":
        return (rng.random(n) < 0.5).tolist(), rng
    if t == "category":
        cats = col.categories or ["A", "B", "C"]
        p = None
        if col.weights:
            if len(col.weights) == len(cats) and sum(col.weights) > 0:
                p = np.array(col.weights, dtype=float) / sum(col.weights)
            else:
                warnings.append(f"{table}.{col.name}: weights ignored (length mismatch or zero sum)")
        idx = rng.choice(len(cats), size=n, p=p)
        return [cats[i] for i in idx], rng
    if t == "date":
        offs = rng.integers(0, 730, n)
        return [(ANCHOR_DATE - timedelta(days=int(o))).isoformat() for o in offs], rng
    if t == "datetime":
        days = rng.integers(0, 730, n)
        secs = rng.integers(0, 86400, n)
        base = datetime(ANCHOR_DATE.year, ANCHOR_DATE.month, ANCHOR_DATE.day)
        return [(base - timedelta(days=int(d)) + timedelta(seconds=int(s))).isoformat()
                for d, s in zip(days, secs)], rng
    if t == "uuid":
        return [str(uuid.UUID(bytes=rng.bytes(16), version=4)) for _ in range(n)], rng

    fake = _make_faker(locale, cs, warnings)
    if t == "name":
        vals = [fake.name() for _ in range(n)]
    elif t == "email":
        vals = [fake.safe_email() for _ in range(n)]
    elif t == "address":
        vals = [fake.address().replace("\n", ", ") for _ in range(n)]
    elif t == "phone":
        vals = [fake.phone_number() for _ in range(n)]
    else:  # "string"
        vals = [fake.word() for _ in range(n)]
    if col.unique or col.primary_key:
        vals = _dedupe(vals)
    return vals, rng


def _mask(v) -> str:
    s = str(v)
    if "@" in s:
        local, dom = s.split("@", 1)
        return local[:1] + "*" * max(len(local) - 1, 1) + "@" + dom
    if len(s) <= 2:
        return "*" * len(s)
    return s[0] + "*" * (len(s) - 2) + s[-1]


def _apply_privacy(values: list, col: ColumnSpec, table: str, seed: int,
                   rng: np.random.Generator, warnings: list[str]) -> list:
    mode = col.privacy
    if mode == "none":
        return values
    if mode == "mask":
        return [_mask(v) for v in values]
    if mode == "hash":
        return [hashlib.sha256(f"{seed}:{table}.{col.name}:{v}".encode()).hexdigest()[:16]
                for v in values]
    if mode == "noise":
        if col.type not in NUMERIC_TYPES:
            warnings.append(f"{table}.{col.name}: noise only applies to numeric columns, skipped")
            return values
        arr = np.array(values, dtype=float)
        scale = 0.05 * (float(arr.std()) or 1.0)
        noisy = arr + rng.laplace(0.0, scale, len(arr))
        if col.type == "integer":
            return np.rint(noisy).astype(np.int64).tolist()
        return np.round(noisy, 2).tolist()
    return values


def generate_table(table: TableSpec, seed: int, locale: str, preview: bool,
                   warnings: list[str], n: int | None = None,
                   overrides: dict[str, list] | None = None) -> list[dict]:
    if n is None:
        n = min(table.row_count, PREVIEW_ROWS) if preview else table.row_count
    overrides = overrides or {}
    cols: dict[str, list] = {}
    for col in table.columns:
        if col.name in cols:
            warnings.append(f"{table.name}: duplicate column '{col.name}' skipped")
            continue
        if col.name in overrides:
            values = list(overrides[col.name])
            rng = np.random.default_rng(_col_seed(seed, table.name, col.name))
        else:
            values, rng = _generate_values(col, table.name, n, seed, locale, warnings)
            values = _apply_privacy(values, col, table.name, seed, rng, warnings)
        if col.null_rate > 0 and not col.primary_key:
            mask = rng.random(n) < col.null_rate
            values = [None if m else v for v, m in zip(values, mask)]
        cols[col.name] = values
    return [{name: vals[i] for name, vals in cols.items()} for i in range(n)]
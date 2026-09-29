"""Relational engine: FK integrity, cardinalities, aggregate reconciliation."""
from __future__ import annotations

import math

import numpy as np

from app.engines.tabular import NUMERIC_TYPES, PREVIEW_ROWS, _col_seed, generate_table
from app.schemas import GenerateRequest, GenerateResponse, SchemaSpec, TableSpec
from app.validators import aggregate, validate

PREVIEW_CHILD_CAP = 200


class SchemaError(ValueError):
    """The schema is structurally invalid (bad references, cycles, ...)."""


def _validate_spec(spec: SchemaSpec) -> dict[str, TableSpec]:
    errors: list[str] = []
    tables = {t.name: t for t in spec.tables}
    if len(tables) != len(spec.tables):
        errors.append("duplicate table names")
    for t in spec.tables:
        cols = {c.name for c in t.columns}
        for fk in t.foreign_keys:
            if fk.column not in cols:
                errors.append(f"{t.name}.{fk.column}: FK column is not declared in columns")
            parent = tables.get(fk.ref_table)
            if parent is None:
                errors.append(f"{t.name}.{fk.column}: unknown ref_table '{fk.ref_table}'")
            elif fk.ref_column not in {c.name for c in parent.columns}:
                errors.append(f"{t.name}.{fk.column}: unknown ref_column '{fk.ref_table}.{fk.ref_column}'")
    for r in spec.rules:
        p, c = tables.get(r.parent_table), tables.get(r.child_table)
        label = f"rule {r.parent_table}.{r.parent_column} <- {r.child_table}.{r.child_column}"
        if p is None or c is None:
            errors.append(f"{label}: unknown table")
            continue
        if not any(f.column == r.fk_column and f.ref_table == r.parent_table for f in c.foreign_keys):
            errors.append(f"{label}: no FK '{r.fk_column}' on {r.child_table} pointing at {r.parent_table}")
        pcol = next((x for x in p.columns if x.name == r.parent_column), None)
        ccol = next((x for x in c.columns if x.name == r.child_column), None)
        if pcol is None or ccol is None:
            errors.append(f"{label}: column not found")
            continue
        if pcol.type not in NUMERIC_TYPES:
            errors.append(f"{label}: parent column must be integer or float")
        if r.op != "count" and ccol.type not in NUMERIC_TYPES:
            errors.append(f"{label}: child column must be integer or float for '{r.op}'")
    if errors:
        raise SchemaError("; ".join(errors))
    return tables


def _topo_order(spec: SchemaSpec) -> list[str]:
    remaining = {t.name: {fk.ref_table for fk in t.foreign_keys} for t in spec.tables}
    ready = sorted(n for n, d in remaining.items() if not d)
    for n in ready:
        del remaining[n]
    order: list[str] = []
    while ready:
        n = ready.pop(0)
        order.append(n)
        for m in list(remaining):
            remaining[m].discard(n)
            if not remaining[m]:
                ready.append(m)
                del remaining[m]
    if remaining:
        raise SchemaError(f"Circular foreign-key dependency among: {sorted(remaining)}")
    return order


def _row_count(table: TableSpec, preview: bool, tmap: dict[str, TableSpec],
               sizes: dict[str, int]) -> int:
    full = table.row_count
    if not preview:
        return full
    for fk in table.foreign_keys:
        if fk.cardinality == "1:N":  # keep the average fan-out realistic in previews
            avg = full / max(tmap[fk.ref_table].row_count, 1)
            return max(1, min(full, PREVIEW_CHILD_CAP, round(sizes[fk.ref_table] * avg)))
    return min(full, PREVIEW_ROWS)


def _cap_rows(table: TableSpec, n: int, keys: dict[str, list], warnings: list[str]) -> int:
    for fk in table.foreign_keys:
        if fk.cardinality == "1:1" and n > len(keys[fk.column]):
            warnings.append(f"{table.name}.{fk.column}: 1:1 needs rows <= parent rows; "
                            f"reduced {n} -> {len(keys[fk.column])}")
            n = len(keys[fk.column])
    nn = [len(keys[f.column]) for f in table.foreign_keys if f.cardinality == "N:N"]
    if len(nn) >= 2 and n > math.prod(nn):
        warnings.append(f"{table.name}: only {math.prod(nn)} unique N:N pairs possible; "
                        f"reduced {n} -> {math.prod(nn)}")
        n = math.prod(nn)
    return n


def _spread_counts(P: int, n: int, lo: int, hi: int, rng: np.random.Generator,
                   warnings: list[str], label: str) -> np.ndarray:
    """Children per parent: sums to n and stays within [lo, hi] when feasible."""
    if hi < lo:
        warnings.append(f"{label}: max_children < min_children, using max = min")
        hi = lo
    if lo * P > n:
        warnings.append(f"{label}: min_children={lo} infeasible for {n} rows / {P} parents; relaxed to 0")
        lo = 0
    if hi * P < n:
        warnings.append(f"{label}: max_children={hi} too low for {n} rows / {P} parents; relaxed")
        counts = np.full(P, lo, dtype=np.int64)
        counts += np.bincount(rng.integers(0, P, n - lo * P), minlength=P)
        return counts
    counts = rng.integers(lo, hi + 1, P)
    diff = n - int(counts.sum())
    while diff != 0:
        step = 1 if diff > 0 else -1
        eligible = np.flatnonzero(counts < hi) if diff > 0 else np.flatnonzero(counts > lo)
        k = min(abs(diff), len(eligible))
        counts[rng.choice(eligible, size=k, replace=False)] += step
        diff -= step * k
    return counts


def _dedupe_pairs(idx_cols: list[np.ndarray], sizes: list[int], rng: np.random.Generator,
                  warnings: list[str], label: str) -> None:
    n = len(idx_cols[0])
    for _ in range(20):
        seen: set = set()
        dups: list[int] = []
        for i in range(n):
            key = tuple(int(c[i]) for c in idx_cols)
            if key in seen:
                dups.append(i)
            else:
                seen.add(key)
        if not dups:
            return
        for c, size in zip(idx_cols, sizes):
            c[dups] = rng.integers(0, size, len(dups))
    warnings.append(f"{label}: could not fully de-duplicate N:N pairs")


def _build_fk_columns(table: TableSpec, n: int, keys: dict[str, list], seed: int,
                      warnings: list[str]) -> dict[str, list]:
    idx_by_col: dict[str, np.ndarray] = {}
    nn_idx: list[np.ndarray] = []
    nn_sizes: list[int] = []
    for fk in table.foreign_keys:
        P = len(keys[fk.column])
        rng = np.random.default_rng(_col_seed(seed, table.name, fk.column))
        if fk.cardinality == "1:1":
            idx = rng.permutation(P)[:n]
        elif fk.cardinality == "1:N":
            counts = _spread_counts(P, n, fk.min_children, fk.max_children, rng,
                                    warnings, f"{table.name}.{fk.column}")
            idx = np.repeat(np.arange(P), counts)
            rng.shuffle(idx)
        else:  # N:N
            idx = rng.integers(0, P, n)
            nn_idx.append(idx)
            nn_sizes.append(P)
        idx_by_col[fk.column] = idx
    if len(nn_idx) >= 2:
        pair_rng = np.random.default_rng(_col_seed(seed, table.name, "__pairs__"))
        _dedupe_pairs(nn_idx, nn_sizes, pair_rng, warnings, table.name)
    return {col: [keys[col][int(i)] for i in idx] for col, idx in idx_by_col.items()}


def _apply_rules(spec: SchemaSpec, order: list[str], tmap: dict[str, TableSpec],
                 out: dict[str, list[dict]]) -> None:
    depth = {name: i for i, name in enumerate(order)}
    # deepest children first, so chains like items -> orders -> customers resolve correctly
    for r in sorted(spec.rules, key=lambda r: depth[r.child_table], reverse=True):
        fk = next(f for f in tmap[r.child_table].foreign_keys
                  if f.column == r.fk_column and f.ref_table == r.parent_table)
        groups: dict = {}
        for row in out[r.child_table]:
            k, v = row[fk.column], row[r.child_column]
            if k is None or v is None:
                continue
            groups.setdefault(k, []).append(v)
        for prow in out[r.parent_table]:
            prow[r.parent_column] = aggregate(groups.get(prow[fk.ref_column], []), r.op)


def generate_relational(req: GenerateRequest) -> GenerateResponse:
    spec = req.spec
    tmap = _validate_spec(spec)
    order = _topo_order(spec)
    warnings: list[str] = []
    out: dict[str, list[dict]] = {}

    for name in order:
        table = tmap[name]
        keys: dict[str, list] = {}
        for fk in table.foreign_keys:
            ks = [r[fk.ref_column] for r in out[fk.ref_table] if r[fk.ref_column] is not None]
            if not ks:
                raise SchemaError(f"{fk.ref_table}.{fk.ref_column} has no values to reference")
            keys[fk.column] = ks
        n = _row_count(table, req.preview, tmap, {k: len(v) for k, v in out.items()})
        n = _cap_rows(table, n, keys, warnings)
        overrides = _build_fk_columns(table, n, keys, req.seed, warnings)
        out[name] = generate_table(table, req.seed, req.locale, req.preview, warnings,
                                   n=n, overrides=overrides)

    _apply_rules(spec, order, tmap, out)
    return GenerateResponse(tables=out, warnings=warnings, checks=validate(spec, out))
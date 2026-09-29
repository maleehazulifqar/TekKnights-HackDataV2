"""Independent integrity checks run on generated data."""
from __future__ import annotations

from typing import Any

from app.schemas import SchemaSpec


def aggregate(vals: list, op: str):
    if op == "count":
        return len(vals)
    if not vals:
        return 0.0
    s = sum(vals)
    return round(s, 2) if op == "sum" else round(s / len(vals), 2)


def validate(spec: SchemaSpec, tables: dict[str, list[dict[str, Any]]]) -> list[dict[str, Any]]:
    checks: list[dict[str, Any]] = []
    tmap = {t.name: t for t in spec.tables}

    def add(check: str, table: str, column: str, passed: bool, detail: str):
        checks.append({"check": check, "table": table, "column": column,
                       "passed": passed, "detail": detail})

    for t in spec.tables:
        rows = tables[t.name]
        for c in t.columns:
            if c.primary_key:
                vals = [r[c.name] for r in rows]
                dups = len(vals) - len(set(vals))
                add("primary_key_unique", t.name, c.name, dups == 0, f"{dups} duplicate key(s)")
        for fk in t.foreign_keys:
            parent_vals = {r[fk.ref_column] for r in tables[fk.ref_table]}
            refs = [r[fk.column] for r in rows if r[fk.column] is not None]
            orphans = sum(1 for v in refs if v not in parent_vals)
            add("referential_integrity", t.name, fk.column, orphans == 0,
                f"{orphans} orphan(s) among {len(refs)} refs to {fk.ref_table}.{fk.ref_column}")
            if fk.cardinality == "1:1":
                dup = len(refs) - len(set(refs))
                add("one_to_one", t.name, fk.column, dup == 0, f"{dup} repeated parent ref(s)")

    for r in spec.rules:
        fk = next(f for f in tmap[r.child_table].foreign_keys
                  if f.column == r.fk_column and f.ref_table == r.parent_table)
        groups: dict = {}
        for row in tables[r.child_table]:
            k, v = row[r.fk_column], row[r.child_column]
            if k is None or v is None:
                continue
            groups.setdefault(k, []).append(v)
        bad = 0
        for prow in tables[r.parent_table]:
            expected = aggregate(groups.get(prow[fk.ref_column], []), r.op)
            got = prow[r.parent_column]
            if got is None or abs(got - expected) > 0.011:
                bad += 1
        add("aggregate_reconciles", r.parent_table, r.parent_column, bad == 0,
            f"{bad} parent row(s) where {r.op}({r.child_table}.{r.child_column}) does not match")
    return checks
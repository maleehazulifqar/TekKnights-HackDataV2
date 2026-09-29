"""Serialize generated tables to CSV / JSON / SQL dump."""
from __future__ import annotations

import csv
import io
import json
import zipfile

from app.engines.relational import _topo_order, generate_relational
from app.schemas import ExportRequest, GenerateRequest, SchemaSpec, TableSpec

SQL_TYPES = {
    "postgres": {"integer": "BIGINT", "float": "DOUBLE PRECISION", "boolean": "BOOLEAN",
                 "date": "DATE", "datetime": "TIMESTAMP", "uuid": "UUID"},
    "sqlite": {"integer": "INTEGER", "float": "REAL", "boolean": "INTEGER",
               "date": "TEXT", "datetime": "TEXT", "uuid": "TEXT"},
}
CHUNK = 500


def _cols(t: TableSpec) -> list:
    seen, out = set(), []
    for c in t.columns:  # the engines skip duplicate column names, so do the same here
        if c.name not in seen:
            seen.add(c.name)
            out.append(c)
    return out


def _q(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def _lit(v, dialect: str) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return ("TRUE" if v else "FALSE") if dialect == "postgres" else ("1" if v else "0")
    if isinstance(v, (int, float)):
        return repr(v)
    return "'" + str(v).replace("'", "''") + "'"


def build_sql(spec: SchemaSpec, tables: dict, dialect: str, seed: int) -> str:
    tmap = {t.name: t for t in spec.tables}
    order = _topo_order(spec)

    # Effective SQL type per column. Masked/hashed columns become TEXT, and FK columns
    # inherit the parent's type, so the dump loads cleanly in strict databases.
    eff: dict[tuple[str, str], str] = {}
    for name in order:
        t = tmap[name]
        fk_by_col = {fk.column: fk for fk in t.foreign_keys}
        for c in _cols(t):
            if c.name in fk_by_col:
                fk = fk_by_col[c.name]
                eff[(name, c.name)] = eff[(fk.ref_table, fk.ref_column)]
            elif c.privacy in ("mask", "hash"):
                eff[(name, c.name)] = "TEXT"
            else:
                eff[(name, c.name)] = SQL_TYPES[dialect].get(c.type, "TEXT")

    out = [f"-- Synthetic Data Platform dump (seed={seed}, dialect={dialect})", "BEGIN;"]
    out += [f"DROP TABLE IF EXISTS {_q(n)};" for n in reversed(order)]

    for name in order:
        t = tmap[name]
        cols = _cols(t)
        fk_by_col = {fk.column: fk for fk in t.foreign_keys}
        pks = [c.name for c in cols if c.primary_key]
        defs, notes = [], []
        for c in cols:
            d = f"{_q(c.name)} {eff[(name, c.name)]}"
            if c.primary_key:
                d += " NOT NULL"
            fk = fk_by_col.get(c.name)
            if (c.unique or (fk and fk.cardinality == "1:1")) and not c.primary_key:
                d += " UNIQUE"
            defs.append(d)
        if pks:
            defs.append(f"PRIMARY KEY ({', '.join(_q(p) for p in pks)})")
        for fk in t.foreign_keys:
            parent = tmap[fk.ref_table]
            pcol = next(c for c in _cols(parent) if c.name == fk.ref_column)
            n_pk = sum(1 for c in _cols(parent) if c.primary_key)
            if (pcol.primary_key and n_pk == 1) or pcol.unique:
                defs.append(f"FOREIGN KEY ({_q(fk.column)}) REFERENCES "
                            f"{_q(fk.ref_table)} ({_q(fk.ref_column)})")
            else:
                notes.append(f"-- FK {name}.{fk.column} -> {fk.ref_table}.{fk.ref_column} "
                             f"not enforced: referenced column is not unique")
        out.append(f"CREATE TABLE {_q(name)} (\n  " + ",\n  ".join(defs) + "\n);")
        out += notes

    for name in order:
        cols = _cols(tmap[name])
        col_sql = ", ".join(_q(c.name) for c in cols)
        rows = tables[name]
        for i in range(0, len(rows), CHUNK):
            vals = ",\n  ".join(
                "(" + ", ".join(_lit(r[c.name], dialect) for c in cols) + ")"
                for r in rows[i:i + CHUNK])
            out.append(f"INSERT INTO {_q(name)} ({col_sql}) VALUES\n  {vals};")
    out.append("COMMIT;")
    return "\n".join(out) + "\n"


def _csv(rows: list[dict], columns: list[str]) -> str:
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(columns)
    for r in rows:
        w.writerow(["" if r[c] is None else r[c] for c in columns])
    return buf.getvalue()


def export_data(req: ExportRequest) -> tuple[bytes, str, str]:
    res = generate_relational(GenerateRequest(spec=req.spec, seed=req.seed,
                                              locale=req.locale, preview=False))
    tables = res.tables
    if req.format == "json":
        return (json.dumps(tables, indent=2, ensure_ascii=False).encode("utf-8"),
                "application/json", "data.json")
    if req.format == "sql":
        return (build_sql(req.spec, tables, req.dialect, req.seed).encode("utf-8"),
                "application/sql", f"dump_{req.dialect}.sql")
    names = {t.name: [c.name for c in _cols(t)] for t in req.spec.tables}
    if len(names) == 1:
        (n, cols), = names.items()
        return _csv(tables[n], cols).encode("utf-8"), "text/csv", f"{n}.csv"
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for n, cols in names.items():
            z.writestr(f"{n}.csv", _csv(tables[n], cols))
    return buf.getvalue(), "application/zip", "tables_csv.zip"
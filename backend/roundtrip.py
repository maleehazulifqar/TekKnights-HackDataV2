import sys

import httpx

BASE = "http://127.0.0.1:8000"
use_llm = sys.argv[1] if len(sys.argv) > 1 else "false"

files = [
    ("files", ("customers.csv", open("samples/customers.csv", "rb"), "text/csv")),
    ("files", ("orders.csv", open("samples/orders.csv", "rb"), "text/csv")),
]
r = httpx.post(f"{BASE}/schema/infer", files=files, data={"use_llm": use_llm}, timeout=120)
r.raise_for_status()
inf = r.json()

print("used_llm:", inf["used_llm"])
print("notes:", inf["notes"])
print("llm_changes:", inf["llm_changes"])
for t in inf["spec"]["tables"]:
    print(f"\n{t['name']} ({t['row_count']} rows)")
    for c in t["columns"]:
        print("  ", c["name"], "->", c["type"], "(PK)" if c["primary_key"] else "")
    print("   FKs:", t["foreign_keys"])

g = httpx.post(f"{BASE}/generate/relational",
               json={"spec": inf["spec"], "seed": 1, "preview": False}, timeout=120)
g.raise_for_status()
res = g.json()
print("\nwarnings:", res["warnings"])
print("all checks passed:", all(c["passed"] for c in res["checks"]), f"({len(res['checks'])} checks)")
print("row counts:", {k: len(v) for k, v in res["tables"].items()})
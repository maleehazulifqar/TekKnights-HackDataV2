import sqlite3
import sys

con = sqlite3.connect(":memory:")
con.executescript(open(sys.argv[1], encoding="utf-8").read())
print("FK violations:", con.execute("PRAGMA foreign_key_check").fetchall())
for t in ("customers", "orders", "order_items"):
    print(t, "rows:", con.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0])
bad = con.execute("""
    SELECT COUNT(*) FROM orders o
    WHERE ABS(o.total - COALESCE((SELECT SUM(line_total) FROM order_items i
                                  WHERE i.order_id = o.order_id), 0)) > 0.011
""").fetchone()[0]
print("Orders whose total != sum(items):", bad)
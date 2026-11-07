"""Converts a legacy database file into SQLite plus a CREATE TABLE script, so the rest of ReBorn can read it.

  python -I tools/db2sqlite.py <file.dbf|file.mdb|file.accdb> <out-base>

Writes <out-base>.sqlite and <out-base>.sql, prints a JSON summary on stdout.
dBase/FoxPro (.dbf): column types come from the file header (declared, exact).
Access (.mdb/.accdb): column types are inferred from the values read (access_parser), so they are reported as inferred.
Reads only; never writes to the source file.
"""
import datetime
import json
import os
import sqlite3
import sys


def q(name):
    return '"' + str(name).replace('"', '""') + '"'


def dbf_tables(path):
    from dbfread import DBF
    table = DBF(path, load=True, char_decode_errors="replace", ignore_missing_memofile=True)
    cols = []
    for f in table.fields:
        t, n, d = f.type, f.length, f.decimal_count
        sql = {
            "C": f"VARCHAR({n})", "D": "DATE", "T": "TIMESTAMP", "@": "TIMESTAMP", "L": "BOOLEAN", "M": "CLOB",
            "I": "INTEGER", "+": "INTEGER", "F": "DOUBLE", "B": "DOUBLE", "O": "DOUBLE", "Y": "MONEY", "G": "BLOB", "P": "BLOB",
        }.get(t)
        if t == "N":
            sql = f"NUMERIC({n},{d})" if d else ("INTEGER" if n <= 18 else f"NUMERIC({n},0)")
        cols.append((f.name, sql or "VARCHAR(255)"))
    name = os.path.splitext(os.path.basename(path))[0].upper()
    rows = [[rec.get(c) for c, _ in cols] for rec in table.records]
    return [{"name": name, "columns": cols, "rows": rows, "types": "declared"}]


def infer(values):
    seen = [v for v in values if v is not None]
    if not seen:
        return "VARCHAR(255)"
    if all(isinstance(v, bool) for v in seen):
        return "BOOLEAN"
    if all(isinstance(v, int) and not isinstance(v, bool) for v in seen):
        return "INTEGER"
    if all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in seen):
        return "DOUBLE"
    if all(isinstance(v, (datetime.datetime, datetime.date)) for v in seen):
        return "TIMESTAMP"
    if all(isinstance(v, (bytes, bytearray)) for v in seen):
        return "BLOB"
    width = max(len(str(v)) for v in seen)
    return "CLOB" if width > 255 else f"VARCHAR({max(width, 1)})"


def access_tables(path):
    from access_parser import AccessParser
    db = AccessParser(path)
    out = []
    for name in sorted(db.catalog):
        if name.startswith("MSys") or name.startswith("~"):
            continue
        data = db.parse_table(name)
        cols = [(c, infer(v)) for c, v in data.items()]
        count = max((len(v) for v in data.values()), default=0)
        rows = [[(data[c][i] if i < len(data[c]) else None) for c, _ in cols] for i in range(count)]
        out.append({"name": name, "columns": cols, "rows": rows, "types": "inferred"})
    return out


def main():
    src, base = sys.argv[1], sys.argv[2]
    ext = os.path.splitext(src)[1].lower()
    tables = dbf_tables(src) if ext == ".dbf" else access_tables(src) if ext in (".mdb", ".accdb") else None
    if tables is None:
        print(json.dumps({"error": f"unsupported file type {ext}"}))
        sys.exit(2)
    for p in (base + ".sqlite", base + ".sql"):
        if os.path.exists(p):
            os.remove(p)
    con = sqlite3.connect(base + ".sqlite")
    ddl = []
    for t in tables:
        create = f"CREATE TABLE {q(t['name'])} (\n  " + ",\n  ".join(f"{q(c)} {ty}" for c, ty in t["columns"]) + "\n);"
        ddl.append(create)
        con.execute(create)
        marks = ",".join("?" for _ in t["columns"])
        con.executemany(f"INSERT INTO {q(t['name'])} VALUES ({marks})", [[v.isoformat() if isinstance(v, (datetime.date, datetime.datetime)) else v for v in r] for r in t["rows"]])
    con.commit()
    con.close()
    with open(base + ".sql", "w", encoding="utf-8") as fh:
        fh.write("\n\n".join(ddl) + "\n")
    print(json.dumps({"tables": [{"name": t["name"], "columns": len(t["columns"]), "rows": len(t["rows"]), "types": t["types"]} for t in tables]}))


if __name__ == "__main__":
    main()

// Legacy database reader: a dBase III file -> SQLite + entity cards with the types the file declares.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { sandbox, ROOT, lib } from "./helpers.mjs";

// Minimal dBase III writer: header, field descriptors, records (enough to exercise the reader).
function writeDbf(file, fields, rows) {
  const recLen = 1 + fields.reduce((n, f) => n + f.len, 0);
  const headLen = 32 + 32 * fields.length + 1;
  const buf = Buffer.alloc(headLen + recLen * rows.length + 1, 0);
  buf[0] = 0x03; buf[1] = 126; buf[2] = 11; buf[3] = 7;
  buf.writeUInt32LE(rows.length, 4); buf.writeUInt16LE(headLen, 8); buf.writeUInt16LE(recLen, 10);
  fields.forEach((f, i) => {
    const o = 32 + 32 * i;
    buf.write(f.name, o, "ascii"); buf.write(f.type, o + 11, "ascii"); buf[o + 16] = f.len; buf[o + 17] = f.dec ?? 0;
  });
  buf[headLen - 1] = 0x0d;
  rows.forEach((r, ri) => {
    let o = headLen + ri * recLen;
    buf[o++] = 0x20;
    fields.forEach((f, fi) => {
      const v = String(r[fi]);
      const s = f.type === "C" ? v.padEnd(f.len) : v.padStart(f.len);
      buf.write(s.slice(0, f.len), o, "ascii"); o += f.len;
    });
  });
  buf[buf.length - 1] = 0x1a;
  fs.writeFileSync(file, buf);
}

test("a dBase file becomes entity cards with its declared types", async (t) => {
  const { localConfig } = await lib("config");
  const py = process.env.REBORN_READERS_PYTHON || localConfig().readersPython;
  if (!py || !fs.existsSync(py)) return t.skip("readers venv not configured (readersPython)");
  const sb = sandbox("dolibarr");
  try {
    const file = path.join(sb.dir, "ITEMS.dbf");
    writeDbf(file, [
      { name: "ID", type: "N", len: 6 }, { name: "NAME", type: "C", len: 20 }, { name: "PRICE", type: "N", len: 10, dec: 2 },
      { name: "ACTIVE", type: "L", len: 1 }, { name: "CREATED", type: "D", len: 8 },
    ], [[1, "Coffee", "2.50", "T", "20260101"], [2, "Tea", "1.95", "F", "20260215"]]);
    const r = spawnSync(process.execPath, [path.join(ROOT, "tools", "reborn.mjs"), "db", "dolibarr", file], { encoding: "utf8", env: { ...process.env } });
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.match(r.stdout, /ITEMS \(5 columns, 2 rows, types declared\)/);
    const card = fs.readFileSync(path.join(sb.root, "02-investigation", "domain", "Items.yaml"), "utf8");
    assert.match(card, /status: confirmed/);
    assert.match(card, /name: price[\s\S]*?type: decimal[\s\S]*?precision: 2/);
    assert.match(card, /name: active[\s\S]*?type: boolean/);
    assert.match(card, /name: created[\s\S]*?type: date/);
    assert.match(card, /name: name[\s\S]*?max_length: 20/);
    const { validateTarget } = await lib("validate");
    assert.deepEqual(validateTarget("dolibarr").errors, []);
  } finally { sb.cleanup(); }
});

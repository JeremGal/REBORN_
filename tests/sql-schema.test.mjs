// The SQL reader grades entities "confirmed" because a shipped create script is an exact artifact.
// That only holds if the reader misses nothing the script says.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, lib } from "./helpers.mjs";

const entity = async (sql, name) => {
  const { schemaToEntities } = await lib("sql-schema");
  return schemaToEntities(sql, { engine: "SQL", sourceRef: "sql:test" }).find((e) => e.name === name);
};
const field = (e, n) => e.fields.find((f) => f.name === n);

test("ALTER TABLE ... ADD COLUMN adds the column to the entity", async () => {
  const e = await entity(`CREATE TABLE PRODUCTS (ID VARCHAR(255) NOT NULL, NAME VARCHAR(255) NOT NULL, PRIMARY KEY (ID));
ALTER TABLE PRODUCTS ADD COLUMN ISVPRICE BOOLEAN DEFAULT FALSE NOT NULL;`, "Products");
  assert.ok(field(e, "isvprice"), "isvprice is missing");
  assert.equal(field(e, "isvprice").type, "boolean");
  assert.equal(field(e, "isvprice").required, true);
});

test("a comment line inside CREATE TABLE does not swallow the next column", async () => {
  const e = await entity(`CREATE TABLE T (
  ID INTEGER NOT NULL,
  -- the label, with a comma, here
  LABEL VARCHAR(10),
  PRIMARY KEY (ID));`, "T");
  assert.ok(field(e, "label"), "label is missing");
});

test("a primary key declared as CONSTRAINT or inline is recorded", async () => {
  const a = await entity(`CREATE TABLE A (ID INTEGER NOT NULL, CONSTRAINT PK_A PRIMARY KEY (ID));`, "A");
  const b = await entity(`CREATE TABLE B (ID INTEGER PRIMARY KEY, X VARCHAR(5));`, "B");
  assert.equal(field(a, "id").unique, true);
  assert.equal(field(b, "id").unique, true);
});

test("common types keep their real meaning and precision", async () => {
  const e = await entity(`CREATE TABLE TYPES (D DATETIME, B TINYINT(1), M MONEY, N NUMBER(10,2), P DECIMAL(12,3), V VARCHAR(20));`, "Types");
  assert.equal(field(e, "d").type, "datetime");
  assert.equal(field(e, "b").type, "boolean");
  assert.equal(field(e, "m").type, "money");
  assert.equal(field(e, "n").type, "decimal");
  assert.equal(field(e, "n").precision, 2);
  assert.equal(field(e, "p").precision, 3);
  assert.equal(field(e, "v").type, "string");
  assert.equal(field(e, "v").max_length, 20);
});

test("a statement the reader does not understand downgrades the entity to partial", async () => {
  const e = await entity(`CREATE TABLE T (ID INTEGER NOT NULL, X VARCHAR(5));
ALTER TABLE T ALTER COLUMN X VARCHAR(50);`, "T");
  assert.equal(e.status, "partial");
});

test("a column declared twice with different types yields one field and a partial entity", async () => {
  const e = await entity(`CREATE TABLE C (ID INTEGER NOT NULL);
ALTER TABLE C ADD COLUMN TIP VARCHAR(255) DEFAULT '';
ALTER TABLE C ADD COLUMN TIP BOOLEAN DEFAULT TRUE NOT NULL;`, "C");
  assert.equal(e.fields.filter((f) => f.name === "tip").length, 1);
  assert.equal(e.status, "partial");
  assert.match(e.description, /declared twice/);
});

test("an understood script keeps the entity confirmed, with its basis", async () => {
  const e = await entity(`CREATE TABLE T (ID INTEGER NOT NULL, X VARCHAR(5));`, "T");
  assert.equal(e.status, "confirmed");
});

test("the real uniCenta script loses no column (every ALTER ... ADD COLUMN is applied)", async (t) => {
  const file = path.join(ROOT, ".evidence", "unicenta", "schema", "HSQLDB-create.sql");
  if (!fs.existsSync(file)) return t.skip("script not in the local evidence store");
  const { schemaToEntities } = await lib("sql-schema");
  const sql = fs.readFileSync(file, "utf8");
  const count = (s) => schemaToEntities(s, { engine: "HSQLDB", sourceRef: "sql:t" }).reduce((n, e) => n + e.fields.length, 0);
  const created = count(sql.split(/\r?\n/).filter((l) => !/^\s*ALTER\s+TABLE/i.test(l)).join("\n"));
  // one column per distinct (table, column): the script declares CATEGORIES.TEXTTIP twice, with two types
  const alters = new Set([...sql.matchAll(/ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(\w+)/gi)].map((m) => `${m[1]}.${m[2]}`.toUpperCase())).size;
  assert.equal(count(sql), created + alters);
});

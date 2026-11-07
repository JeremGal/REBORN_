import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { decodeText, detectFormat, parseCsv, parseSource, parseSqlDump, readZip, FormatError } from "./formats";
import { convert, toCents, TransformError } from "./transforms";
import { profileColumn, profileTables } from "./profile";
import { checkMapping, effectiveMapping, MigrationMappingSchema, proposeMapping, reviewItems, importOrder } from "./mapping";
import { buildDdl } from "./model";

// Écrivains du logiciel historique de test (ZIP / XLSX) : vrais fichiers, pas de maquette
const ROOT = path.resolve(import.meta.dirname, "../../../..");
const { zip } = await import(path.join(ROOT, "legacy-crm/lib/zip.mjs"));
const { xlsx } = await import(path.join(ROOT, "legacy-crm/lib/xlsx.mjs"));

describe("Lecteurs de formats", () => {
  it("CSV : séparateur, guillemets, retours à la ligne, Windows-1252", () => {
    const text = 'ID;NOM;NOTE\r\n1;"Durand ; fils";"Ligne 1\nLigne 2"\r\n2;Élise;"Client ""historique"""\r\n';
    const cp1252 = Buffer.from(text, "latin1");
    const { text: decoded, encoding } = decodeText(cp1252);
    expect(encoding).toBe("windows-1252");
    const { table } = parseCsv("t", decoded);
    expect(table.columns).toEqual(["ID", "NOM", "NOTE"]);
    expect(table.rows).toEqual([
      ["1", "Durand ; fils", "Ligne 1\nLigne 2"],
      ["2", "Élise", 'Client "historique"'],
    ]);
    expect(decodeText(Buffer.from("﻿a,b\n1,2", "utf8")).encoding).toBe("utf-8 (BOM)");
    expect(() => parseCsv("t", 'a;b\n1;"non fermé')).toThrow(FormatError);
  });

  it("JSON : tableau, objet de tables, NDJSON", () => {
    expect(parseSource("p.json", Buffer.from('[{"a":1,"b":"x"},{"a":2,"c":true}]')).tables[0]).toEqual({ name: "p", columns: ["a", "b", "c"], rows: [[1, "x", null], [2, null, true]] });
    expect(parseSource("x.json", Buffer.from('{"clients":[{"id":1}],"meta":{"v":1}}')).tables.map((t) => t.name)).toEqual(["clients"]);
    expect(parseSource("x.ndjson", Buffer.from('{"id":1}\n{"id":2}\n')).tables[0].rows).toEqual([[1], [2]]);
  });

  it("ZIP et Excel : relus depuis de vrais fichiers", () => {
    const z = zip([{ name: "a/b.txt", data: "contenu é" }, { name: "c.bin", data: Buffer.from([0, 1, 2]) }]);
    expect(detectFormat("docs.zip", z)).toBe("zip");
    const entries = readZip(z);
    expect(entries.map((e) => e.path)).toEqual(["a/b.txt", "c.bin"]);
    expect(entries[0].data.toString("utf8")).toBe("contenu é");
    const book = xlsx("Feuille", ["REF", "PRIX", "LIB"], [["A-1", 12.5, "Vanne & raccord <DN50>"], ["A-2", 3, null]]);
    const parsed = parseSource("articles.xlsx", book);
    expect(parsed.format).toBe("xlsx");
    expect(parsed.tables[0]).toMatchObject({ columns: ["REF", "PRIX", "LIB"], rows: [["A-1", 12.5, "Vanne & raccord <DN50>"], ["A-2", 3, null]] });
  });

  it("SQL : instructions de données acceptées, instructions dangereuses refusées", () => {
    const dump = "CREATE TABLE T (ID INTEGER PRIMARY KEY, NOM TEXT);\nINSERT INTO T VALUES (1, 'O''Brien; SA');\nINSERT INTO `T` VALUES (2, NULL);";
    expect(parseSqlDump(dump).tables[0]).toEqual({ name: "T", columns: ["ID", "NOM"], rows: [[1, "O'Brien; SA"], [2, null]] });
    expect(() => parseSqlDump("ATTACH DATABASE '/tmp/x.db' AS x;")).toThrow(/non autorisée/);
    expect(() => parseSqlDump("CREATE TABLE T(a); VACUUM INTO '/tmp/y.db';")).toThrow(/non autorisée/);
    expect(() => parseSqlDump("CREATE TRIGGER t AFTER INSERT ON T BEGIN SELECT 1; END;")).toThrow(/non autorisée/);
  });

  it("refuse une archive dont un chemin sort du dossier", () => {
    expect(() => readZip(zip([{ name: "../evil.txt", data: "x" }]))).toThrow(/refusé/);
  });
});

describe("Conversions exactes (aucune valeur inventée)", () => {
  it("montants en centimes sans arrondi flottant", () => {
    expect(toCents("1 234,56")).toBe(123456);
    expect(toCents("1.234,56")).toBe(123456);
    expect(toCents("1,234.56")).toBe(123456);
    expect(toCents("0,1")).toBe(10);
    expect(toCents(1234.56)).toBe(123456);
    expect(toCents(0.3)).toBe(30);
    expect(toCents("-12,50 €")).toBe(-1250);
    expect(toCents("(12,50)")).toBe(-1250);
    expect(toCents("12,500")).toBe(1250);
    expect(() => toCents("12,505")).toThrow(/arrondi refusé/);
    expect(() => toCents("douze")).toThrow(TransformError);
  });

  it("dates : calendrier vérifié, format déclaré", () => {
    expect(convert("05/03/2019", { type: "date", transforms: [{ date: "DD/MM/YYYY" }] })).toBe("2019-03-05");
    expect(() => convert("31/02/2015", { type: "date", transforms: [{ date: "DD/MM/YYYY" }] })).toThrow(/inexistante/);
    expect(() => convert("2019-03-05", { type: "date", transforms: [{ date: "DD/MM/YYYY" }] })).toThrow(/format inattendu/);
    expect(convert(43831, { type: "date", transforms: [{ date: "excel" }] })).toBe("2020-01-01");
  });

  it("valeurs vides → NULL, codes inconnus → erreur (jamais de valeur par défaut)", () => {
    expect(convert("   ", { type: "text", transforms: ["trim"] })).toBeNull();
    expect(convert(null, { type: "money" })).toBeNull();
    expect(convert("AC", { type: "enum", transforms: [{ map: { AC: "actif" } }], options: [{ value: "actif" }] })).toBe("actif");
    expect(() => convert("ZZ", { type: "enum", transforms: [{ map: { AC: "actif" } }] })).toThrow(/absent/);
    expect(() => convert("peut-être", { type: "boolean" })).toThrow(/booléenne/);
    expect(convert("O", { type: "boolean", transforms: [{ boolean: { true: ["O"], false: ["N"] } }] })).toBe(1);
    expect(convert(" Contact@Ex.FR ", { type: "email", transforms: ["trim", "lower"] })).toBe("contact@ex.fr");
  });
});

describe("Analyse de structure et correspondances", () => {
  const tables = [
    { name: "T_CLIENT", columns: ["ID_CLI", "NOM", "CAT", "CREE"], rows: Array.from({ length: 30 }, (_, i) => [String(i + 1), `Client ${i + 1}`, ["A", "B"][i % 2], `0${(i % 9) + 1}/01/2020`]) },
    { name: "T_FACT", columns: ["ID_FAC", "ID_CLI", "TOTAL_TTC"], rows: Array.from({ length: 40 }, (_, i) => [String(i + 1), String((i % 31) + 1), `${i},50`]) },
  ];

  it("déduit types, clés, relations et orphelins", () => {
    const prof = profileTables(tables);
    expect(prof.tables[0]).toMatchObject({ primary_key: "ID_CLI", entity: "clients" });
    expect(prof.tables[0].columns.find((c) => c.name === "CREE")).toMatchObject({ type: "date", format: "DD/MM/YYYY" });
    expect(prof.tables[1].columns.find((c) => c.name === "TOTAL_TTC")).toMatchObject({ type: "money", format: "comma" });
    const rel = prof.relations.find((r) => r.column === "ID_CLI")!;
    expect(rel).toMatchObject({ table: "T_FACT", references: { table: "T_CLIENT", column: "ID_CLI" }, orphans: 1, orphan_samples: ["31"] });
    expect(profileColumn("X", ["1", "2", "abc"]).type).toBe("text");
  });

  it("propose des correspondances génériques et marque les incertitudes", () => {
    const prof = profileTables(tables);
    const m = proposeMapping(prof);
    expect(MigrationMappingSchema.safeParse(m).success).toBe(true);
    expect(checkMapping(m, prof).filter((i) => i.level === "error")).toEqual([]);
    const fact = m.entities.find((e) => e.source.table === "T_FACT")!;
    expect(fact.fields.find((f) => f.source === "ID_CLI")).toMatchObject({ type: "reference", references: "clients", on_missing: "keep_unlinked" });
    const keys = reviewItems(m).map((i) => i.key);
    expect(keys).toEqual(expect.arrayContaining(["field:clients.cat", "field:facts.id_cli"]));
    expect(importOrder(m).map((e) => e.name)).toEqual(["clients", "facts"]);
    expect(buildDdl(m).join("\n")).toMatch(/REFERENCES "clients"\("id"\)/);
  });

  it("rejette les incohérences avec la structure lue", () => {
    const prof = profileTables(tables);
    const m = proposeMapping(prof);
    m.entities[0].fields[0].source = "INEXISTANTE";
    m.entities[1].fields[0].references = "inconnue";
    const errs = checkMapping(m, prof).filter((i) => i.level === "error").map((i) => i.message);
    expect(errs.join(" ")).toMatch(/INEXISTANTE/);
    expect(errs.join(" ")).toMatch(/inconnue/);
    expect(MigrationMappingSchema.safeParse({ ...m, entities: [{ ...m.entities[0], name: 'x"; DROP' }] }).success).toBe(false);
  });
});

describe("Protection de l'historique (proposition automatique)", () => {
  const n = 12;
  const tables = [
    { name: "customers", columns: ["customer_id", "company", "created_on"], rows: Array.from({ length: n }, (_, i) => [String(i + 1), `Company ${i + 1}`, `2020-01-${String(i + 1).padStart(2, "0")}`]) },
    { name: "products", columns: ["product_id", "label", "unit_price", "created_on"], rows: Array.from({ length: n }, (_, i) => [String(i + 1), `P${i + 1}`, `${i + 10}.50`, "2020-02-01"]) },
    { name: "quotes", columns: ["quote_id", "quote_number", "customer_id", "quote_date", "status", "total_excl_tax"], rows: Array.from({ length: n }, (_, i) => [String(i + 1), `Q-${i + 1}`, String(i + 1), "2021-03-01", ["draft", "sent"][i % 2], `${i + 100}.00`]) },
    { name: "quote_lines", columns: ["line_id", "quote_id", "product_id", "quantity", "line_total"], rows: Array.from({ length: n }, (_, i) => [String(i + 1), String(i + 1), String(i + 1), String(i + 1), `${i + 5}.25`]) },
    { name: "invoices", columns: ["invoice_id", "invoice_number", "customer_id", "invoice_date", "amount_incl_tax", "paid"], rows: Array.from({ length: n }, (_, i) => [String(i + 1), `F-${i + 1}`, String(i + 1), "2021-04-01", `${i + 200}.00`, String(i % 2)]) },
  ];

  it("protège montants, dates, numéros et statuts des factures ; ne bloque pas le référentiel", () => {
    const m = proposeMapping(profileTables(tables));
    const ent = (name: string) => m.entities.find((e) => e.name === name)!;
    const locked = (name: string) => ent(name).fields.filter((f) => f.accounting).map((f) => f.name).sort();
    expect(ent("invoices").classification).toMatchObject({ kind: "financial" });
    expect(locked("invoices")).toEqual(["amount_incl_tax", "invoice_date", "invoice_number", "paid"]);
    expect(ent("quotes").classification).toMatchObject({ kind: "commercial" });
    expect(locked("quotes")).toEqual(["quote_number", "total_excl_tax"]);
    expect(ent("quote_lines")).toMatchObject({ classification: { kind: "line", parent: "quotes" }, line_of: { entity: "quotes", via: "quote_id" } });
    expect(locked("quote_lines")).toEqual(["line_total", "quantity"]);
    // Référentiel : le prix d'un produit reste modifiable
    expect(ent("products").classification).toMatchObject({ kind: "master" });
    expect(locked("products")).toEqual([]);
    expect(MigrationMappingSchema.safeParse(m).success).toBe(true);
  });

  it("fait valider les classements incertains ; la protection reste active tant qu'un humain ne l'a pas retirée", () => {
    const m = proposeMapping(profileTables(tables));
    const items = reviewItems(m).filter((i) => i.kind === "accounting");
    // Facture : classement sûr, protégé sans question ; devis : classement incertain, à valider
    expect(items.map((i) => i.key)).toEqual(["accounting:quotes"]);
    const kept = effectiveMapping(m, { "accounting:quotes": { decision: "accepted", at: "", by: "test" } });
    expect(kept.entities.find((e) => e.name === "quotes")!.fields.some((f) => f.accounting)).toBe(true);
    const freed = effectiveMapping(m, { "accounting:quotes": { decision: "excluded", at: "", by: "test" } });
    expect(freed.entities.find((e) => e.name === "quotes")!.fields.some((f) => f.accounting)).toBe(false);
    expect(freed.entities.find((e) => e.name === "quote_lines")!.fields.some((f) => f.accounting)).toBe(false);
    expect(freed.entities.find((e) => e.name === "invoices")!.fields.some((f) => f.accounting)).toBe(true);
  });
});

describe("Runtime du logiciel livré", () => {
  it("embarque une copie à jour du moteur de règles de REBORN (même code que le Studio)", async () => {
    const { runtimeFiles } = await import(path.join(ROOT, "platform/scripts/build-runtime.mjs"));
    const files = runtimeFiles() as Record<string, string>;
    expect(Object.keys(files)).toEqual(expect.arrayContaining(["lib/expr.mjs", "lib/engine/engine.mjs", "lib/engine/bindings.mjs"]));
    for (const [rel, content] of Object.entries(files)) expect(fs.readFileSync(path.join(ROOT, "platform/runtime", rel), "utf8"), rel).toBe(content);
  });

  it("le moteur copié calcule exactement comme celui du Studio", async () => {
    const { compute } = await import("../engine/engine");
    const copy = await import(path.join(ROOT, "platform/runtime/lib/engine/engine.mjs"));
    const model = JSON.parse(fs.readFileSync(path.join(ROOT, "platform/scenarios/quote/rules.v1.json"), "utf8"));
    for (const inputs of [{ product: "B", quantity: 12, customer_type: "premium" }, { product: "A", quantity: 60, customer_type: "partenaire" }, { product: "C", quantity: 0, customer_type: "standard" }]) {
      expect(copy.compute(model, inputs)).toEqual(compute(model, inputs));
    }
  });

  it("ne contient aucun vocabulaire métier (tout vient de app.json)", () => {
    const src = ["server.mjs", "public/app.js"].map((f) => fs.readFileSync(path.join(ROOT, "platform/runtime", f), "utf8")).join("\n");
    expect(src).not.toMatch(/\b(client|facture|devis|prospect|article|relatio|morel)s?\b/i);
  });
});

describe("Libellés et indicateurs de la proposition automatique", () => {
  it("traduit les noms techniques courants sans rien inventer", async () => {
    const { humanLabel, singularLabel } = await import("./labels");
    expect(humanLabel("quote_lines")).toBe("Lignes de devis");
    expect(humanLabel("amount_incl_tax")).toBe("Montant TTC");
    expect(humanLabel("DATE_CREA")).toBe("Date de création");
    expect(humanLabel("T_CLIENT")).toBe("Client");
    expect(humanLabel("customer_id")).toBe("Client identifiant");
    expect(humanLabel("zorglub_xq")).toBe("Zorglub xq");
    expect(singularLabel("Lignes de devis")).toBe("Ligne de devis");
    expect(singularLabel("Devis")).toBe("Devis");
  });

  it("reconnaît un indicateur 0/1 annoncé par son nom, pas un code entier quelconque", () => {
    expect(profileColumn("paid", ["0", "1", "1", "0"]).type).toBe("boolean");
    expect(profileColumn("is_active", ["1", "1"]).type).toBe("boolean");
    expect(profileColumn("priority", ["0", "1", "1", "0"]).type).toBe("integer");
  });
});

describe("Contrat business_model (modèle métier d'Alan)", () => {
  it("refuse les noms d'entrée réservés par le moteur et les liaisons incohérentes", async () => {
    const { BusinessModelSchema, checkBusinessModel } = await import("./business-model");
    const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, "platform/scenarios/crm/business-model.json"), "utf8"));
    const mapping = JSON.parse(fs.readFileSync(path.join(ROOT, "platform/scenarios/crm/mapping.json"), "utf8"));
    const ok = BusinessModelSchema.parse(fixture);
    expect(checkBusinessModel(ok, MigrationMappingSchema.parse(mapping)).filter((i) => i.level === "error")).toEqual([]);
    const bad = structuredClone(fixture);
    bad.modules["devis.ligne"].inputs[1].name = "unit_price";
    bad.bindings[0].inputs = { quantity: "quantite", unit_price: "article.prix_ht", remise_ligne: "remise_pct" };
    bad.bindings[1].outputs.total_price = "inexistant";
    const errs = checkBusinessModel(BusinessModelSchema.parse(bad), MigrationMappingSchema.parse(mapping))
      .filter((i) => i.level === "error")
      .map((i) => i.message)
      .join(" | ");
    expect(errs).toMatch(/variable réservée/);
    expect(errs).toMatch(/champ de sortie inconnu/);
    expect(BusinessModelSchema.safeParse({ ...fixture, bindings: [{ ...fixture.bindings[0], inputs: { quantity: "../../etc" } }] }).success).toBe(false);
  });
});

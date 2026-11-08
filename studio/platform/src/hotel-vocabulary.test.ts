/**
 * Logiciel d'hôtel livré à partir d'une sauvegarde de type HotelDruid — JEU DE TEST : toutes les valeurs sont
 * INVENTÉES (aucune donnée réelle), seule la structure (noms et types de colonnes) suit le format de sauvegarde.
 *
 *   sauvegarde inventée → adaptateur (scripts/tagged-dump-to-sqlite.mjs : colonnes dérivées AJOUTÉES, colonnes
 *   d'origine intactes, rapport) → lecture et proposition automatique du Studio → vocabulaire de l'Analyste
 *   (scripts/hotel-vocabulary.mjs : formulaires courts, champs techniques à part, planning des chambres, liens
 *   rétablis) → contrat JSON (ajv de la racine du dépôt) et zod, checkMapping → migration réelle → spécification.
 *
 * Contrat ui.form_fields / ui.technical_fields / ui.views : tant qu'il n'est pas encore dans les schémas du Studio
 * (chantier parallèle), il est ajouté LOCALEMENT au schéma pour valider le reste ; dès qu'il y est, le vrai schéma
 * est utilisé tel quel.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { parseSource, type RawTable } from "@/lib/migration/formats";
import { profileTables, type SourceProfile } from "@/lib/migration/profile";
import { checkMapping, effectiveMapping, EntityMapSchema, MigrationMappingSchema, proposeMapping, reviewItems, type MigrationMapping } from "@/lib/migration/mapping";
import { runMigration, type RunResult, type SourceTableInput } from "@/lib/migration/run";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

const STUDIO = path.resolve(import.meta.dirname, "../..");
const REPO = path.resolve(STUDIO, "..");
const ADAPTER = path.join(STUDIO, "scripts", "tagged-dump-to-sqlite.mjs");
const VOCABULARY = path.join(STUDIO, "scripts", "hotel-vocabulary.mjs");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "reborn-hotel-"));

/* ------------------------------------------------------------------ */
/* Sauvegarde INVENTÉE (jeu de test) au format « tagged-dump »          */
/* ------------------------------------------------------------------ */

type Cell = string | number;
interface DumpTable {
  name: string;
  cols: [string, string][];
  rows: Cell[][];
}
const tbl = (name: string, cols: [string, string][], rows: Cell[][]): DumpTable => ({ name, cols, rows });
const dumpText = (tables: DumpTable[]) =>
  [
    "<database>",
    ...tables.flatMap((t) => [
      `<nometabella>${t.name}</nometabella>`,
      ...t.cols.map(([c]) => `<nomecolonna>${c}</nomecolonna>`),
      ...t.cols.map(([, ty]) => `<tipocolonna>${ty}</tipocolonna>`),
      ...t.rows.map((r) => `<riga>${r.map((v) => `<cmp>${v}</cmp>`).join("")}</riga>`),
    ]),
    "</database>",
  ].join("\n");
const day = (start: string, plus: number) => new Date(Date.parse(`${start}T00:00:00Z`) + plus * 86400000).toISOString().slice(0, 10);
const cols = (spec: string) => spec.split(" ").map((c) => c.split(":") as [string, string]);

/** Premier jour des périodes de chaque année (un jour par ligne, datafine = lendemain). */
const FIRST_DAY: Record<number, string> = { 2025: "2025-03-01", 2026: "2026-01-05" };
const DAYS: Record<number, number> = { 2025: 60, 2026: 40 };

const PRENOTA_COLS = cols(
  "idprenota:int idclienti:int idappartamenti:varchar iddatainizio:int iddatafine:int assegnazioneapp:varchar app_assegnabili:text num_persone:int cat_persone:text idprenota_compagna:text tariffa:varchar tariffesettimanali:text incompatibilita:text sconto:float8 tariffa_tot:float8 caparra:float8 commissioni:float8 tasseperc:float8 pagato:float8 valuta:varchar metodo_pagamento:text codice:text origine:varchar commento:text conferma:varchar checkin:datetime checkout:datetime id_anni_prec:text datainserimento:datetime hostinserimento:varchar data_modifica:datetime utente_inserimento:int",
);
interface Stay {
  year: number;
  id: number;
  client: number;
  room: string;
  start: number;
  end: number;
  persons: number;
  tariff: string;
  confirmed: "S" | "N";
}
const ROOMS = ["101", "102", "103", "201", "202", "203"];
const stays2025: Stay[] = Array.from({ length: 25 }, (_, k) => {
  const i = k + 1;
  const start = (i % 12) * 4 + 1;
  const tariff = i === 13 ? "Tarif libre (test)" : i % 5 === 0 ? `Tarif C (test)#@&${45 + i}#@&p` : i % 2 ? `Tarif A (test)#@&${100 + i * 5}` : `Tarif B (test)#@&${150 + i}`;
  // Dernière réservation : départ au-delà des périodes de l'année (date de départ introuvable).
  return { year: 2025, id: i, client: ((i - 1) % 12) + 1, room: ROOMS[i % 6], start, end: i === 25 ? 70 : start + (i % 4), persons: (i % 3) + 1, tariff, confirmed: i % 9 === 0 ? "N" : "S" };
});
const stays2026: Stay[] = Array.from({ length: 5 }, (_, k) => ({ year: 2026, id: k + 1, client: k + 2, room: ROOMS[k], start: (k + 1) * 3, end: (k + 1) * 3 + 1, persons: 2, tariff: `Tarif A (test)#@&${120 + k}`, confirmed: "S" as const }));
const cancelled: Stay[] = [
  { year: 2025, id: 26, client: 1, room: "101", start: 10, end: 12, persons: 2, tariff: "Tarif A (test)#@&130", confirmed: "S" },
  { year: 2025, id: 27, client: 2, room: "101", start: 10, end: 12, persons: 2, tariff: "Tarif B (test)#@&155", confirmed: "N" },
  { year: 2026, id: 26, client: 1, room: "102", start: 3, end: 4, persons: 1, tariff: "Tarif C (test)#@&48#@&p", confirmed: "S" },
];
const stayRow = (s: Stay): Cell[] => [
  s.id, s.client, s.room, s.start, s.end, "v", "", s.persons, "", "", s.tariff, "", "", "",
  `${100 + s.id * 10}.5`, s.id % 3 ? 50 : "", "", "", s.id % 2 ? `${100 + s.id * 10}.5` : 0, "EUR", "", "", "", s.id % 4 ? "" : "Commentaire de test",
  s.confirmed, s.id % 2 ? `${s.year}-03-02 14:00:00` : "", "", "", `${s.year}-02-01 10:00:00`, "poste-test", "", 1,
];
const COSTI_PRENOTA_COLS = cols(
  "idcostiprenota:int idprenota:int tipo:varchar nome:varchar valore:float8 valore_perc:float8 arrotonda:float8 tasseperc:float8 associasett:varchar settimane:text moltiplica:text categoria:text letto:varchar cat_persone:text numlimite:int idntariffe:int variazione:varchar varmoltiplica:varchar varnumsett:varchar varperiodipermessi:text varbeniinv:text varappincompatibili:text vartariffeassociate:varchar vartariffeincomp:text datainserimento:datetime hostinserimento:varchar utente_inserimento:int",
);
const FEES = [["u", "Taxe de séjour (test)", "1.65"], ["s", "Petit-déjeuner (test)", "12"], ["u", "Ménage (test)", "20"]];
const feeRows = (stays: { id: number }[], perStay: number): Cell[][] =>
  stays.flatMap((s) => FEES.slice(0, perStay).map((f) => [s.id, ...f])).map(([idprenota, tipo, nome, valore], k) => [k + 1, idprenota, tipo, nome, valore, "", "", "", "n", "", "", "", "", "", "", (k % 3) + 1, "", "", "", "", "", "", "", "", `2025-02-01 10:00:00`, "poste-test", 1]);
const NTARIFFE_COLS = cols(
  "idntariffe:int nomecostoagg:varchar tipo_ca:varchar valore_ca:float8 valore_perc_ca:float8 arrotonda_ca:float8 tasseperc_ca:float8 associasett_ca:varchar numsett_ca:varchar moltiplica_ca:varchar periodipermessi_ca:text beniinv_ca:text appincompatibili_ca:text variazione_ca:varchar mostra_ca:varchar categoria_ca:text letto_ca:varchar numlimite_ca:int regoleassegna_ca:text utente_inserimento:int tariffa1:varchar tariffa2:varchar",
);
const ntariffeRows = (): Cell[][] => [1, 2, 3].map((i) => [i, `Frais ${"ABC"[i - 1]} (test)`, "u", 10 * i, "", "", "", "n", "", "", "", "", "", "", "s", "", "", "", "", 1, "s", ""]);
const PERIODI_COLS = cols("idperiodi:int datainizio:date datafine:date tariffa1:float8 tariffa1p:float8 tariffa2:float8 tariffa2p:float8 tariffa3:float8 tariffa3p:float8");
const periodiRows = (year: number): Cell[][] => Array.from({ length: DAYS[year] }, (_, i) => [i + 1, day(FIRST_DAY[year], i), day(FIRST_DAY[year], i + 1), 80, "", 110, "", 150, ""]);
const RCLIENTI_COLS = cols("idprenota:int idclienti:int num_ordine:int parentela:varchar datainserimento:datetime hostinserimento:varchar utente_inserimento:int");
const occRows = (stays: Stay[]): Cell[][] => stays.map((s) => [s.id, s.client, 1, "", `${s.year}-02-01 10:00:00`, "poste-test", 1]);
const SOLDI_COLS = cols("idsoldi:int motivazione:text id_pagamento:text metodo_pagamento:text note:text saldo_prenota:float8 saldo_cassa:float8 soldi_prima:float8 valuta:varchar saldo_valuta:float8 data_transazione:datetime data_modifica:datetime data_inserimento:datetime utente_inserimento:int");
const soldiRows = (year: number, n: number): Cell[][] =>
  Array.from({ length: n }, (_, k) => [k + 1, `${k + 1};1;1;`, "", k % 2 ? "Carte (test)" : "Espèces (test)", "", `${50 + k}.5`, "", "", "EUR", "", `${year}-03-${String(k + 1).padStart(2, "0")} 09:00:00`, "", `${year}-03-${String(k + 1).padStart(2, "0")} 09:00:00`, 1]);
const COSTI_COLS = cols("idcosti:int nome_costo:varchar val_costo:float8 tipo_costo:varchar valuta:varchar costo_valuta:float8 nome_cassa:varchar persona_costo:varchar provenienza_costo:varchar id_pagamento:text metodo_pagamento:text data_transazione:datetime data_modifica:datetime datainserimento:datetime hostinserimento:varchar utente_inserimento:int");
const costiRows = (year: number, n: number): Cell[][] => Array.from({ length: n }, (_, k) => [k + 1, `Achat ${k + 1} (test)`, 30 + k, k % 2 ? "e" : "s", "EUR", "", "Caisse (test)", "", "", "", "", `${year}-03-10 12:00:00`, "", `${year}-03-10 12:00:00`, "poste-test", 1]);
const REGOLE_COLS = cols("idregole:int app_agenzia:text tariffa_chiusa:varchar tariffa_per_app:text tariffa_per_utente:text tariffa_per_persone:text tariffa_commissioni:int iddatainizio:int iddatafine:int motivazione:text motivazione2:text motivazione3:text");

const CLIENT_COLS = cols(
  "idclienti:int cognome:varchar cognome2:varchar nome:varchar soprannome:varchar sesso:varchar titolo:varchar lingua:varchar datanascita:date cittanascita:varchar regionenascita:varchar nazionenascita:varchar documento:varchar scadenzadoc:date tipodoc:varchar cittadoc:varchar regionedoc:varchar nazionedoc:varchar nazionalita:varchar nazione:varchar regione:varchar citta:varchar via:varchar numcivico:varchar cap:varchar telefono:varchar telefono2:varchar telefono3:varchar fax:varchar email:text email2:text email3:text cod_fiscale:varchar partita_iva:varchar commento:text max_num_ordine:int idclienti_compagni:text doc_inviati:text datainserimento:datetime hostinserimento:varchar utente_inserimento:int",
);
const clientRows = (): Cell[][] =>
  Array.from({ length: 12 }, (_, k) => {
    const n = String(k + 1).padStart(2, "0");
    return [k + 1, `Client ${n} (jeu de test)`, "", `Prénom ${n}`, "", "", "", "fr", "", "", "", "", "", "", "", "", "", "", "", ["Pays A (test)", "Pays B (test)"][k % 2], "", `Ville ${n} (test)`, "", "", "", `+33 6 00 00 00 ${n}`, "", "", "", `client${n}@exemple.test`, "", "", "", "", k % 3 ? "" : "Client de test", 1, "", "", "2025-01-15 10:00:00", "poste-test", 1];
  });

const INVENTED_DUMP: DumpTable[] = [
  tbl("anni", cols("idanni:int tipo_periodi:varchar"), [[2025, "g"], [2026, "g"]]),
  tbl("nazioni", cols("idnazioni:int nome_nazione:varchar codice_nazione:varchar codice2_nazione:varchar codice3_nazione:varchar datainserimento:datetime hostinserimento:varchar utente_inserimento:int"), [
    [1, "Pays A (test)", "PA", "PA", "PAA", "2025-01-01 10:00:00", "poste-test", 1],
    [2, "Pays B (test)", "PB", "PB", "PBB", "2025-01-01 10:00:00", "poste-test", 1],
    [3, "Pays C (test)", "PC", "PC", "PCC", "2025-01-01 10:00:00", "poste-test", 1],
  ]),
  tbl("clienti", CLIENT_COLS, clientRows()),
  tbl("appartamenti", cols("idappartamenti:varchar numpiano:varchar maxoccupanti:int numcasa:varchar app_vicini:text priorita:int priorita2:int letto:text commento:text"), ROOMS.map((r, k) => [r, r[0], (k % 3) + 1, "", "", k + 1, "", k % 2 ? "2 lits" : "1 lit", ""])),
  tbl("casse", cols("idcasse:int nome_cassa:varchar stato:varchar codice_cassa:varchar descrizione_cassa:text datainserimento:datetime hostinserimento:varchar utente_inserimento:int"), [[1, "Caisse (test)", "aperta", "C1", "Caisse de test", "2025-01-01 10:00:00", "poste-test", 1]]),
  tbl("messaggi", cols("idmessaggi:int tipo_messaggio:varchar stato:varchar idutenti:text idutenti_visto:text datavisione:datetime mittente:varchar testo:text datainserimento:datetime"), [[1, "sistema", "nuovo", ",1,", "", "", "1", "Message de test", "2025-01-01 10:00:00"]]),
  tbl("periodi2025", PERIODI_COLS, periodiRows(2025)),
  tbl("periodi2026", PERIODI_COLS, periodiRows(2026)),
  tbl("prenota2025", PRENOTA_COLS, stays2025.map(stayRow)),
  tbl("prenota2026", PRENOTA_COLS, stays2026.map(stayRow)),
  tbl("prenotacanc2025", PRENOTA_COLS, cancelled.filter((s) => s.year === 2025).map(stayRow)),
  tbl("prenotacanc2026", PRENOTA_COLS, cancelled.filter((s) => s.year === 2026).map(stayRow)),
  // Trois frais par réservation, un par réservation annulée : numéros 1 à 77 (plus que de jours dans l'année)
  tbl("costiprenota2025", COSTI_PRENOTA_COLS, [...feeRows(stays2025, 3), ...feeRows(cancelled.filter((s) => s.year === 2025), 1)].map((r, k) => [k + 1, ...r.slice(1)])),
  tbl("costiprenota2026", COSTI_PRENOTA_COLS, feeRows(stays2026, 1)),
  tbl("rclientiprenota2025", RCLIENTI_COLS, occRows([...stays2025, ...cancelled.filter((s) => s.year === 2025)])),
  tbl("rclientiprenota2026", RCLIENTI_COLS, occRows([...stays2026, ...cancelled.filter((s) => s.year === 2026)])),
  tbl("ntariffe2025", NTARIFFE_COLS, ntariffeRows()),
  tbl("ntariffe2026", NTARIFFE_COLS, ntariffeRows()),
  tbl("soldi2025", SOLDI_COLS, soldiRows(2025, 20)),
  tbl("soldi2026", SOLDI_COLS, soldiRows(2026, 3)),
  tbl("costi2025", COSTI_COLS, costiRows(2025, 4)),
  tbl("costi2026", COSTI_COLS, costiRows(2026, 2)),
  tbl("regole2025", REGOLE_COLS, [[1, "", "Tarif B (test)", "", "", "", "", 5, 10, "Fermeture (test)", "", ""], [2, "101", "", "", "", "", "", "", "", "", "", ""]]),
  tbl("regole2026", REGOLE_COLS, [[1, "", "Tarif A (test)", "", "", "", "", 2, 8, "Fermeture (test)", "", ""]]),
  // Comptes : table sensible, jamais importée
  tbl("utenti", cols("idutenti:int nome_utente:varchar password:varchar"), [[1, "admin-test", "secret-fictif-jeu-de-test"]]),
];

/* ------------------------------------------------------------------ */
/* Outils                                                               */
/* ------------------------------------------------------------------ */

function convertDump(name: string, tables: DumpTable[]): { db: string; report: Json } {
  const input = path.join(tmp, `${name}.txt`);
  const db = path.join(tmp, `${name}.db`);
  fs.writeFileSync(input, dumpText(tables));
  const out = execFileSync(process.execPath, ["--no-warnings", ADAPTER, input, db], { encoding: "utf8" });
  return { db, report: JSON.parse(out) };
}
const tableInfo = (db: DatabaseSync, t: string) => db.prepare(`PRAGMA table_info("${t}")`).all() as { name: string; type: string }[];

const IDENT = { type: "string", pattern: "^[a-z][a-z0-9_]{0,59}$" };
/** Contrat commun (ui.form_fields, ui.technical_fields, ui.views) tel que décrit pour les deux chantiers. */
const UI_CONTRACT_JSON: Record<string, Json> = {
  form_fields: { type: "array", items: IDENT },
  technical_fields: { type: "array", items: IDENT },
  views: {
    type: "array",
    items: {
      type: "object",
      properties: { kind: { type: "string", enum: ["planning"] }, name: IDENT, label: { type: "string" }, start: IDENT, end: IDENT, resource: IDENT, title: IDENT, status: IDENT },
      required: ["kind", "name", "label", "start", "end", "resource", "title"],
      additionalProperties: false,
    },
  },
};
const Ident = z.string().regex(/^[a-z][a-z0-9_]{0,59}$/);
const UI_CONTRACT_ZOD: Record<string, z.ZodType> = {
  form_fields: z.array(Ident).optional(),
  technical_fields: z.array(Ident).optional(),
  views: z.array(z.object({ kind: z.literal("planning"), name: Ident, label: z.string(), start: Ident, end: Ident, resource: Ident, title: Ident, status: Ident.optional() }).strict()).optional(),
};
// Clés du contrat commun encore absentes des schémas du Studio (affichées dans le nom des tests concernés)
const JSON_SCHEMA = JSON.parse(fs.readFileSync(path.join(STUDIO, "contracts", "migration_mapping.schema.json"), "utf8"));
const JSON_MISSING = Object.keys(UI_CONTRACT_JSON).filter((k) => !JSON_SCHEMA.properties.entities.items.properties.ui.properties[k]);
const UI_ZOD = EntityMapSchema.shape.ui.unwrap();
const ZOD_MISSING = Object.keys(UI_CONTRACT_ZOD).filter((k) => !(k in UI_ZOD.shape));
const extendedNote = (keys: string[]) => (keys.length ? ` — étendu localement (contrat commun pas encore publié) : ui.${keys.join(", ui.")}` : "");

/* ------------------------------------------------------------------ */
/* Chaîne                                                               */
/* ------------------------------------------------------------------ */

let conv: { db: string; report: Json };
let tables: RawTable[];
let profile: SourceProfile;
let auto: MigrationMapping;
let voc: Json;
let hotelVocabulary: (m: Json) => Json;
let checkVocabulary: (m: Json) => { path: string; message: string }[];
const ent = (m: Json, name: string) => m.entities.find((e: Json) => e.name === name);
const autoOf = (table: string) => auto.entities.find((e) => e.source.table === table)!;
/** Champs d'une entité de la sortie, désignés par leur colonne source. */
const sourcesOf = (m: Json, entity: string, names: string[] = []) => names.map((n) => ent(m, entity).fields.find((f: Json) => f.name === n)?.source);
const fieldBySource = (m: Json, entity: string, src: string) => ent(m, entity).fields.find((f: Json) => f.source === src);

beforeAll(async () => {
  conv = convertDump("hotel", INVENTED_DUMP);
  tables = parseSource("hotel.db", fs.readFileSync(conv.db)).tables;
  profile = profileTables(tables);
  auto = MigrationMappingSchema.parse(proposeMapping(profile, { target: { id: "hotel-jeu-de-test", name: "Hôtel (jeu de test) — nouveau logiciel" }, source_system: "HotelDruid" }));
  ({ hotelVocabulary, checkVocabulary } = await import(VOCABULARY));
  voc = hotelVocabulary(auto);
}, 30_000);

afterAll(() => {
  if (!process.env.REBORN_KEEP_TEST_DIRS) fs.rmSync(tmp, { recursive: true, force: true });
});

describe("Adaptateur : séjour lisible ajouté aux réservations, colonnes d'origine intactes", () => {
  it("déclare les colonnes dérivées en fin de table (TEXT, TEXT, INTEGER, TEXT, REAL)", () => {
    const db = new DatabaseSync(conv.db, { readOnly: true });
    try {
      for (const t of ["prenota", "prenotacanc"]) {
        const info = tableInfo(db, t);
        expect(info.slice(-5).map((c) => `${c.name}:${c.type}`)).toEqual(["date_arrivee:TEXT", "date_depart:TEXT", "nuits:INTEGER", "type_tarif:TEXT", "prix_tarif:REAL"]);
        // Toutes les colonnes d'origine sont là, dans l'ordre, avant les colonnes ajoutées
        const original = PRENOTA_COLS.map(([c]) => c);
        expect(info.map((c) => c.name).filter((c) => original.includes(c))).toEqual(original);
      }
      // Les autres tables ne reçoivent rien
      expect(tableInfo(db, "costiprenota").map((c) => c.name)).not.toContain("date_arrivee");
    } finally {
      db.close();
    }
  });

  it("arrivée, départ (même année), nuits et tarif découpé ; valeurs d'origine inchangées", () => {
    const db = new DatabaseSync(conv.db, { readOnly: true });
    try {
      const rows = db.prepare(`SELECT * FROM "prenota"`).all() as Json[];
      expect(rows).toHaveLength(stays2025.length + stays2026.length);
      for (const s of [...stays2025, ...stays2026]) {
        const r = rows.find((x) => x.cle === `${s.year}:${s.id}`);
        // Colonnes d'origine : copiées telles quelles
        expect(r).toMatchObject({ annee: s.year, idprenota: s.id, idclienti: s.client, idappartamenti: s.room, iddatainizio: s.start, iddatafine: s.end, tariffa: s.tariff, conferma: s.confirmed });
        expect(r.date_arrivee).toBe(day(FIRST_DAY[s.year], s.start - 1));
        expect(r.date_depart).toBe(s.end <= DAYS[s.year] ? day(FIRST_DAY[s.year], s.end) : null);
        expect(r.nuits).toBe(s.end - s.start + 1);
        const parts = s.tariff.split("#@&");
        expect(r.type_tarif).toBe(parts.length >= 2 ? parts[0] : null);
        expect(r.prix_tarif).toBe(parts.length >= 2 ? Number(parts[1]) : null);
      }
      // Une réservation 2026 lit les périodes de 2026, pas celles de 2025 (numéros de jour identiques)
      expect(rows.find((x) => x.cle === "2026:1").date_arrivee).toBe("2026-01-07");
    } finally {
      db.close();
    }
  });

  it("le rapport compte dates résolues / non résolues, nuits et tarifs ; la table de comptes reste exclue", () => {
    const r = conv.report;
    expect(r.excluded.map((x: Json) => x.table)).toContain("utenti");
    expect(r.rejected_rows).toBe(0);
    const pren = r.derived.find((d: Json) => d.table === "prenota");
    expect(pren).toMatchObject({ columns: ["date_arrivee", "date_depart", "nuits", "type_tarif", "prix_tarif"], rows: 30, dates_resolved: 29, dates_unresolved: 1, nights_mismatch: 0, nights_unresolved: 0, tariffs_split: 29, tariffs_unsplit: 1, tariffs_empty: 0, tariffs_per_person: 5 });
    expect(r.derived.find((d: Json) => d.table === "prenotacanc")).toMatchObject({ rows: 3, dates_resolved: 3, dates_unresolved: 0, tariffs_split: 3, tariffs_per_person: 1 });
    expect(r.written.find((w: Json) => w.table === "prenota").derived).toEqual(["date_arrivee", "date_depart", "nuits", "type_tarif", "prix_tarif"]);
    expect(r.rows_written).toBe(r.rows_read - 1);
  });

  it("sans numéros de jour ni tarif (ancienne structure) : aucune colonne ajoutée", () => {
    const small = convertDump("petit", [
      tbl("appartamenti", cols("idappartamenti:int nome:varchar"), [[1, "Chambre bleue (jeu de test)"]]),
      tbl("prenota2025", cols("idprenota:int idappartamenti:int nome:varchar"), [[1, 1, "Client A (jeu de test)"]]),
    ]);
    expect(small.report.derived).toEqual([]);
    const db = new DatabaseSync(small.db, { readOnly: true });
    try {
      expect(tableInfo(db, "prenota").map((c) => c.name)).toEqual(["cle", "annee", "idprenota", "idappartamenti", "nome"]);
    } finally {
      db.close();
    }
  });

  it("la proposition automatique du Studio lit arrivée et départ en dates, nuits en entier, prix en nombre", () => {
    const p = profile.tables.find((t) => t.name === "prenota")!;
    const type = (c: string) => p.columns.find((x) => x.name === c)?.type;
    expect([type("date_arrivee"), type("date_depart"), type("nuits")]).toEqual(["date", "date", "integer"]);
    expect(["integer", "decimal", "money"]).toContain(type("prix_tarif"));
    const f = (c: string) => autoOf("prenota").fields.find((x) => x.source === c)!.type;
    expect([f("date_arrivee"), f("date_depart"), f("nuits")]).toEqual(["date", "date", "integer"]);
  });
});

describe("Vocabulaire de l'Analyste : simple, lisible, sans perte", () => {
  it("formulaires courts : l'essentiel, dans l'ordre demandé", () => {
    const form = (e: string) => sourcesOf(voc, e, ent(voc, e).ui.form_fields);
    expect(form("clients")).toEqual(["cognome", "nome", "telefono", "email", "citta", "nazione", "commento"]);
    expect(form("reservations")).toEqual(["idclienti", "idappartamenti", "date_arrivee", "date_depart", "num_persone", "type_tarif", "tariffa_tot", "caparra", "pagato", "conferma", "commento"]);
    expect(form("chambres")).toEqual(["idappartamenti", "numpiano", "maxoccupanti", "letto", "commento"]);
    expect(form("paiements")).toEqual(["data_transazione", "metodo_pagamento", "saldo_prenota", "saldo_cassa", "note"]);
    expect(form("occupants")).toEqual(["idprenota_cle", "idclienti"]);
    expect(form("frais_sejour")).toEqual(["idprenota_cle", "nome", "valore"]);
    // Les autres entités : 4 à 6 champs utiles (une seule colonne pour les années d'activité)
    for (const e of voc.entities.filter((x: Json) => !["clients", "reservations", "chambres", "paiements", "occupants", "frais_sejour", "annees"].includes(x.name))) {
      expect(e.ui.form_fields.length, e.name).toBeGreaterThanOrEqual(4);
      expect(e.ui.form_fields.length, e.name).toBeLessThanOrEqual(6);
    }
  });

  it("champs techniques à part : jamais dans un formulaire, une liste, une recherche ou un titre", () => {
    const tech = (e: string) => sourcesOf(voc, e, ent(voc, e).ui.technical_fields);
    // (la clé « cle » des réservations est leur référence d'origine, pas un champ ; elle l'est pour un occupant)
    expect(tech("reservations")).toEqual(expect.arrayContaining(["annee", "iddatainizio", "iddatafine", "iddatainizio_cle", "iddatafine_cle", "hostinserimento", "utente_inserimento", "idprenota_compagna", "tariffesettimanali", "incompatibilita", "app_assegnabili", "cat_persone", "id_anni_prec"]));
    expect(tech("occupants")).toEqual(expect.arrayContaining(["cle", "annee", "hostinserimento", "utente_inserimento"]));
    expect(tech("clients")).toEqual(expect.arrayContaining(["max_num_ordine", "hostinserimento", "utente_inserimento"]));
    expect(tech("frais_sejour")).toEqual(expect.arrayContaining(["varmoltiplica", "varnumsett", "varperiodipermessi", "varbeniinv", "varappincompatibili", "vartariffeassociate", "vartariffeincomp", "idntariffe_cle"]));
    // La réservation d'un frais (lien *_cle) est essentielle : dans le formulaire, pas à part
    expect(tech("frais_sejour")).not.toContain("idprenota_cle");
    for (const e of voc.entities) {
      const t = new Set(e.ui.technical_fields ?? []);
      for (const k of ["form_fields", "list_fields", "search_fields"]) for (const n of e.ui[k] ?? []) expect(t.has(n), `${e.name}.${k} : ${n}`).toBe(false);
      expect(t.has(e.title_field), `${e.name}.title_field`).toBe(false);
      // Chaque champ technique désigné existe et reste enregistré
      for (const n of t) expect(e.fields.some((f: Json) => f.name === n)).toBe(true);
    }
    expect(checkVocabulary(voc)).toEqual([]);
  });

  it("listes, titres, libellés et types des colonnes dérivées", () => {
    expect(sourcesOf(voc, "reservations", ent(voc, "reservations").ui.list_fields)).toEqual(["idclienti", "idappartamenti", "date_arrivee", "date_depart", "nuits", "num_persone", "tariffa_tot", "pagato", "conferma"]);
    expect(fieldBySource(voc, "clients", ent(voc, "clients").title_field)?.source ?? ent(voc, "clients").title_field).toBe("cognome");
    expect(sourcesOf(voc, "chambres", [ent(voc, "chambres").title_field])).toEqual(["idappartamenti"]);
    expect(sourcesOf(voc, "reservations", [ent(voc, "reservations").title_field])).toEqual(["date_arrivee"]);
    const label = (src: string) => fieldBySource(voc, "reservations", src).label;
    expect(["date_arrivee", "date_depart", "nuits", "type_tarif", "prix_tarif"].map(label)).toEqual(["Arrivée", "Départ", "Nuits", "Type de tarif", "Prix du tarif"]);
    expect(["date_arrivee", "date_depart", "nuits", "prix_tarif"].map((s) => fieldBySource(voc, "reservations", s).type)).toEqual(["date", "date", "integer", "money"]);
    expect(fieldBySource(voc, "reservations", "prix_tarif").transforms).toBeUndefined();
    expect(fieldBySource(voc, "chambres", "idappartamenti")).toMatchObject({ label: "Numéro", type: "text", required: true, unique: true });
    // Confirmation : codes d'origine conservés (S/N), affichés Oui / Non
    expect(fieldBySource(voc, "reservations", "conferma").options).toEqual(expect.arrayContaining([{ value: "S", label: "Oui" }, { value: "N", label: "Non" }]));
  });

  it("planning des chambres : arrivée, départ (exclu), chambre, client, confirmation", () => {
    const r = ent(voc, "reservations");
    expect(r.ui.views).toEqual([{ kind: "planning", name: "planning", label: "Planning des chambres", start: "date_arrivee", end: "date_depart", resource: "idappartamenti", title: "idclienti", status: "conferma" }]);
    expect(r.fields.find((f: Json) => f.name === "idappartamenti")).toMatchObject({ type: "reference", references: "chambres" });
    expect(r.fields.find((f: Json) => f.name === "idclienti")).toMatchObject({ type: "reference", references: "clients" });
    // Sans les colonnes dérivées (ancienne conversion) : pas de planning, titre de repli, présentation valide
    const old = structuredClone(auto) as Json;
    const p = old.entities.find((e: Json) => e.source.table === "prenota");
    p.fields = p.fields.filter((f: Json) => !["date_arrivee", "date_depart", "nuits", "type_tarif", "prix_tarif"].includes(f.source));
    if (["date_arrivee", "date_depart", "nuits", "type_tarif", "prix_tarif"].includes(p.title_field)) delete p.title_field;
    const out = hotelVocabulary(old);
    expect(ent(out, "reservations").ui.views).toBeUndefined();
    expect(sourcesOf(out, "reservations", [ent(out, "reservations").title_field])).toEqual(["idprenota"]);
    expect(checkVocabulary(out)).toEqual([]);
  });

  it("liens rétablis vers la bonne table (même année) ; « cle » n'est jamais un lien", () => {
    const ref = (e: string, src: string) => {
      const f = fieldBySource(voc, e, src);
      return f?.type === "reference" ? `${f.references}:${f.on_missing}` : f?.type;
    };
    expect(ref("reservations", "iddatainizio_cle")).toBe("tarifs_jour:keep_unlinked");
    expect(ref("reservations", "iddatafine_cle")).toBe("tarifs_jour:keep_unlinked");
    expect(ref("frais_sejour", "idprenota_cle")).toBe("reservations:keep_unlinked");
    expect(ref("frais_sejour", "idntariffe_cle")).toBe("frais_catalogue:keep_unlinked");
    expect(ref("regles_reservation", "iddatainizio_cle")).toBe("tarifs_jour:keep_unlinked");
    expect(ref("reservations_annulees", "iddatainizio_cle")).toBe("tarifs_jour:keep_unlinked");
    // Occupant : la clé d'origine EST la réservation ; un champ lit la même colonne
    expect(ent(voc, "occupants").source.key).toBe("idprenota_cle");
    expect(ref("occupants", "idprenota_cle")).toBe("reservations:keep_unlinked");
    for (const e of voc.entities) if (fieldBySource(voc, e.name, "cle")) expect(ref(e.name, "cle"), e.name).toBe("text");
    // Numéro propre d'une réservation annulée : pas un lien vers les réservations actives
    const own = fieldBySource(voc, "reservations_annulees", "idprenota_cle");
    if (own) expect(own.type).toBe("text");
  });

  it("aucune colonne perdue, protections et classement inchangés, aucun point à valider ajouté", () => {
    for (const a of auto.entities) {
      const v = voc.entities.find((e: Json) => e.source.table === a.source.table);
      expect(v.source).toEqual(a.source);
      const sources = new Set(v.fields.map((f: Json) => f.source));
      for (const f of a.fields) expect(sources.has(f.source), `${a.source.table}.${f.source}`).toBe(true);
      // Chaque colonne de la table est la clé ou la source d'un champ
      const t = tables.find((x) => x.name === a.source.table)!;
      for (const c of t.columns) expect(c === a.source.key || sources.has(c), `${t.name}.${c}`).toBe(true);
      for (const f of a.fields) expect(!!v.fields.find((g: Json) => g.source === f.source && g.name === f.name)?.accounting, `${a.source.table}.${f.source}`).toBe(!!f.accounting);
      expect(v.classification?.kind).toBe(a.classification?.kind);
      expect(v.classification?.confidence).toBe(a.classification?.confidence);
    }
    expect(reviewItems(voc).length).toBeLessThanOrEqual(reviewItems(auto).length);
    expect(reviewItems(voc).filter((i) => i.kind === "accounting").length).toBe(reviewItems(auto).filter((i) => i.kind === "accounting").length);
  });

  it("idempotent : appliqué deux fois, même résultat (note comprise)", () => {
    expect(hotelVocabulary(voc)).toEqual(voc);
    expect(voc.notes.match(/Vocabulaire hôtelier appliqué/g)).toHaveLength(1);
  });
});

describe("Contrats et cohérence avec la structure lue", () => {
  it(`contrat JSON contracts/migration_mapping.schema.json (ajv de la racine du dépôt)${extendedNote(JSON_MISSING)}`, () => {
    const require = createRequire(path.join(REPO, "package.json"));
    let Ajv2020: Json;
    try {
      Ajv2020 = require("ajv/dist/2020.js");
    } catch {
      throw new Error("ajv introuvable à la racine du dépôt : lancez « npm install » à la racine");
    }
    const schema = structuredClone(JSON_SCHEMA);
    const ui = schema.properties.entities.items.properties.ui;
    for (const k of JSON_MISSING) ui.properties[k] = UI_CONTRACT_JSON[k];
    if (JSON_MISSING.length) console.warn(`[jeu de test hôtel] contrat JSON étendu localement : ui.${JSON_MISSING.join(", ui.")}`);
    const ajv = new (Ajv2020.default ?? Ajv2020)({ allErrors: true, strict: false });
    const validate = ajv.compile(schema);
    expect(validate(voc), JSON.stringify(validate.errors?.slice(0, 5))).toBe(true);
    // Le contrat reste strict : une clé inconnue dans ui est refusée
    const bad = structuredClone(voc);
    bad.entities[0].ui.inconnu = true;
    expect(validate(bad)).toBe(false);
  });

  it(`contrat zod du Studio et checkMapping : aucune erreur, aucun avertissement de plus que la proposition${extendedNote(ZOD_MISSING)}`, () => {
    const missing = Object.fromEntries(ZOD_MISSING.map((k) => [k, UI_CONTRACT_ZOD[k]]));
    if (ZOD_MISSING.length) console.warn(`[jeu de test hôtel] contrat zod étendu localement : ui.${ZOD_MISSING.join(", ui.")}`);
    const Local = MigrationMappingSchema.extend({ entities: z.array(EntityMapSchema.extend({ ui: UI_ZOD.extend(missing).optional() })).min(1).max(100) });
    const parsed = Local.safeParse(voc);
    expect(parsed.success, JSON.stringify(parsed.error?.issues.slice(0, 5))).toBe(true);
    const issues = checkMapping(parsed.data as unknown as MigrationMapping, profile);
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
    const before = new Set(checkMapping(auto, profile).map((i) => i.message));
    expect(issues.filter((i) => !before.has(i.message))).toEqual([]);
  });
});

describe("Migration réelle et logiciel livré", () => {
  let run: RunResult;
  let target: DatabaseSync;
  const outDir = path.join(tmp, "run");

  beforeAll(() => {
    const inputs = new Map<string, SourceTableInput>(tables.map((t) => [t.name, { ...t, file: "hotel.db", file_sha256: "jeu-de-test" }]));
    run = runMigration({ runId: "RUN_TEST", mapping: effectiveMapping(voc as MigrationMapping, {}), tables: inputs, archives: new Map(), outDir, sourceSystem: "HotelDruid" });
    target = new DatabaseSync(path.join(outDir, "target.db"), { readOnly: true });
  });
  afterAll(() => target?.close());

  it("toutes les lignes migrées, aucun rejet ; seuls les liens réellement absents sont signalés", () => {
    expect(run.status, run.error).toBe("completed");
    for (const e of run.entities) expect({ entity: e.entity, imported: e.imported, rejected: e.rejected }).toEqual({ entity: e.entity, imported: e.source_rows, rejected: 0 });
    expect(run.field_issues.filter((i) => i.kind === "conversion")).toEqual([]);
    const unlinked: Record<string, number> = {};
    for (const i of run.field_issues) unlinked[`${i.entity}.${i.field}`] = (unlinked[`${i.entity}.${i.field}`] ?? 0) + 1;
    // Frais et occupants des réservations annulées, jour de départ hors des périodes de l'année
    expect(unlinked).toEqual({ "frais_sejour.idprenota_cle": 2, "occupants.idprenota_cle": 3, "reservations.iddatafine_cle": 1 });
  });

  it("valeurs du nouveau logiciel : dates ISO, prix en centimes, liens vers le bon enregistrement", () => {
    const one = (sql: string, ...a: (string | number)[]) => target.prepare(sql).get(...a) as Json;
    const r1 = one(`SELECT * FROM "reservations" WHERE "_source_key" = ?`, "2025:1");
    expect(r1).toMatchObject({ date_arrivee: "2025-03-05", date_depart: "2025-03-07", nuits: 2, type_tarif: "Tarif A (test)", prix_tarif: 10500, iddatainizio: 5, iddatafine: 6 });
    expect(one(`SELECT "_source_key" AS k FROM "chambres" WHERE "id" = ?`, r1.idappartamenti).k).toBe("102");
    expect(one(`SELECT "idappartamenti" AS n FROM "chambres" WHERE "id" = ?`, r1.idappartamenti).n).toBe("102");
    expect(one(`SELECT "_source_key" AS k FROM "tarifs_jour" WHERE "id" = ?`, r1.iddatainizio_cle).k).toBe("2025:5");
    const fee = one(`SELECT * FROM "frais_sejour" WHERE "_source_key" = ?`, "2025:1");
    expect(one(`SELECT "_source_key" AS k FROM "reservations" WHERE "id" = ?`, fee.idprenota_cle).k).toBe("2025:1");
    const occ = one(`SELECT * FROM "occupants" WHERE "_source_key" = ?`, "2026:3");
    expect(one(`SELECT "_source_key" AS k FROM "reservations" WHERE "id" = ?`, occ.idprenota_cle).k).toBe("2026:3");
    expect(one(`SELECT "cle" AS c FROM "occupants" WHERE "_source_key" = ?`, "2026:3").c).toBe("2026:3");
    // Texte d'origine du tarif conservé à côté des colonnes dérivées
    expect(one(`SELECT "_source_key" AS k, "tariffa" AS t FROM "reservations" WHERE "_source_key" = ?`, "2025:5").t).toBe("Tarif C (test)#@&50#@&p");
  });

  it("spécification du logiciel livré : listes, titres, répartitions ; formulaires et planning transmis s'ils sont pris en charge", async () => {
    // Le générateur importe le stockage du Studio : dossiers de test le temps de l'import, puis valeurs rétablies.
    const saved = { data: process.env.REBORN_DATA_DIR, apps: process.env.REBORN_APPS_DIR };
    process.env.REBORN_DATA_DIR = path.join(tmp, "reborn");
    process.env.REBORN_APPS_DIR = path.join(tmp, "generated");
    let spec: Json;
    try {
      const { buildAppSpec } = await import("@/lib/migration/generate");
      spec = buildAppSpec(effectiveMapping(voc as MigrationMapping, {}), { runId: "RUN_TEST", sourceSystem: "HotelDruid", port: 5999 });
    } finally {
      for (const [k, v] of [["REBORN_DATA_DIR", saved.data], ["REBORN_APPS_DIR", saved.apps]] as const) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
    const res = spec.entities.find((e: Json) => e.name === "reservations");
    const m = ent(voc, "reservations");
    expect(res.list_fields).toEqual(m.ui.list_fields);
    expect(res.title_field).toBe("date_arrivee");
    expect(spec.dashboard.breakdowns.slice(0, 4).map((b: Json) => `${b.entity}.${b.field}`)).toEqual(["reservations.type_tarif", "clients.nazione", "chambres.maxoccupanti", "paiements.metodo_pagamento"]);
    // Contrat commun : form_fields / technical_fields par entité, views (avec entity) — vérifiés dès qu'ils sont transmis
    for (const e of spec.entities) {
      const em = ent(voc, e.name);
      if ("form_fields" in e) expect(e.form_fields ?? [], e.name).toEqual(em.ui.form_fields ?? []);
      if ("technical_fields" in e) expect(e.technical_fields ?? [], e.name).toEqual(em.ui.technical_fields ?? []);
    }
    if ("views" in spec) expect(spec.views).toEqual(expect.arrayContaining([expect.objectContaining({ ...m.ui.views[0], entity: "reservations" })]));
  });
});

describe("Ligne de commande", () => {
  it("se lance depuis un chemin contenant des espaces (usage affiché, code 2, rien n'est envoyé)", () => {
    // Environnement minimal : sans adresse ni jeton, aucun appel n'est tenté
    const env = { PATH: process.env.PATH ?? "" } as unknown as NodeJS.ProcessEnv;
    const r = spawnSync(process.execPath, ["--no-warnings", VOCABULARY], { encoding: "utf8", env });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/usage : REBORN_URL=… REBORN_ANALYST_TOKEN=… node scripts\/hotel-vocabulary\.mjs --project MIG_x/);
  });
});

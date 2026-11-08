#!/usr/bin/env node
/**
 * Adaptateur d'extraction : sauvegarde « tagged-dump » (format d'export de HotelDruid, décrit d'après son
 * code AGPL : <database><tabella><nometabella>…<righetabella><riga><cmp>…</cmp></riga>) → base SQLite
 * que le Studio sait déjà importer (dépôt de fichier par le propriétaire du projet).
 *
 * - Tables partitionnées par année (prenota2024, prenota2025…) : fusionnées en UNE table par famille, avec
 *   la colonne `annee` et la clé tracée `cle` = « année:identifiant » (les identifiants se recouvrent d'une
 *   année à l'autre). Les colonnes d'origine sont toutes conservées, valeurs inchangées.
 * - Liens déclarés (REFERENCES) : id<table> → <table> ; vers une famille annuelle, dans la MÊME année
 *   (colonne <col>_cle) ; iddatainizio / iddatafine → périodes de la même année.
 * - Jamais importés : blocs <file> (configuration), tables de comptes, sessions, intégrations, modèles de
 *   documents et réglages, colonnes nommées comme un secret, tables vides. Tout est listé dans le rapport.
 * - Aucune valeur d'origine recalculée : une chaîne vide dans une colonne numérique devient NULL (absence), le
 *   reste est copié tel quel.
 * - Séjour lisible (réservations `prenota` et réservations annulées `prenotacanc`) : colonnes AJOUTÉES en fin de
 *   table, les colonnes d'origine restent intactes. `date_arrivee` = début du jour n° iddatainizio et
 *   `date_depart` = fin du jour n° iddatafine (lendemain de la dernière nuit), lus dans les périodes de la MÊME
 *   année (dates ISO AAAA-MM-JJ) ; `nuits` = iddatafine − iddatainizio + 1 ; `type_tarif` et `prix_tarif`
 *   = les deux premières parties de `tariffa` (« type#@&prix », prix en nombre ; une 3e partie « p », tarif par
 *   personne, reste dans `tariffa`). Valeur introuvable ou illisible : NULL, jamais devinée. Le rapport compte
 *   les dates résolues et non résolues, les nuits incohérentes avec les dates, les tarifs découpés ou non.
 *
 *   node scripts/tagged-dump-to-sqlite.mjs <sauvegarde[.gz]> <sortie.db>
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { DatabaseSync } from "node:sqlite";

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error("usage : tagged-dump-to-sqlite.mjs <sauvegarde[.gz]> <sortie.db>");
  process.exit(2);
}
const MAX = 512 * 1024 * 1024;
let raw = fs.readFileSync(input);
if (raw[0] === 0x1f && raw[1] === 0x8b) raw = zlib.gunzipSync(raw, { maxOutputLength: MAX });
const text = raw.toString("utf8");

const SENSITIVE = new Set(["utenti", "sessioni", "transazioni", "transazioniweb", "privilegi", "relutenti", "relgruppi", "gruppi", "cache", "contratti", "interconnessioni", "personalizza", "versioni"]);
const SECRET_COL = /^(password|passwd|pwd|pass|hash|salt|token|secret|chiave|sessione|session)$/i;

/* 1. Lecture ligne à ligne (une valeur peut contenir des retours à la ligne). */
const tables = [];
let cur = null;
let inDb = false;
let buf = null;
let bad = 0;
const decode = (v) =>
  v
    .replaceAll("</righetabella@%&@>", "</righetabella>")
    .replaceAll("</riga@%&@>", "</riga>")
    .replaceAll("<riga@%&@>", "<riga>")
    .replaceAll("</cmp@%&@>", "</cmp>")
    .replaceAll("@%&@@%&@", "@%&@");
for (const line of text.split("\n")) {
  if (!inDb) {
    if (line.startsWith("<database>")) inDb = true;
    continue;
  }
  if (buf === null) {
    let m;
    if ((m = /^<nometabella>(.*)<\/nometabella>/.exec(line))) {
      cur = { name: m[1], cols: [], types: [], rows: [], rejected: 0 };
      tables.push(cur);
      continue;
    }
    if (!cur) continue;
    if ((m = /^<nomecolonna>(.*)<\/nomecolonna>/.exec(line))) { cur.cols.push(m[1]); continue; }
    if ((m = /^<tipocolonna>(.*)<\/tipocolonna>/.exec(line))) { cur.types.push(m[1]); continue; }
    if (!line.startsWith("<riga>")) continue;
    buf = line;
  } else buf += "\n" + line;
  if (buf.endsWith("</cmp></riga>")) {
    const vals = buf.slice(11, -13).split("</cmp><cmp>").map(decode);
    if (vals.length === cur.cols.length) cur.rows.push(vals);
    else { cur.rejected++; bad++; }
    buf = null;
  }
}

/* 2. Familles annuelles et exclusions. */
const report = { tables_read: tables.length, rows_read: tables.reduce((a, t) => a + t.rows.length, 0), rejected_rows: bad, excluded: [], removed_columns: [], written: [], derived: [] };
const kept = [];
for (const t of tables) {
  const base = /^(.*?)(\d{4})$/.exec(t.name)?.[1] ?? t.name;
  if (SENSITIVE.has(base)) { report.excluded.push({ table: t.name, reason: "comptes, sessions, intégrations, modèles de documents ou réglages : jamais importés" }); continue; }
  if (!t.rows.length) { report.excluded.push({ table: t.name, reason: "table vide" }); continue; }
  kept.push(t);
}
const fam = new Map();
for (const t of kept) {
  const m = /^(.*?)(\d{4})$/.exec(t.name);
  const key = m ? m[1] : t.name;
  if (!fam.has(key)) fam.set(key, { name: key, partitioned: !!m, parts: [] });
  fam.get(key).parts.push({ year: m ? Number(m[2]) : null, t });
}

const sqlType = (ty) => (/int/i.test(ty) ? "INTEGER" : /float|real|double|decimal|numeric/i.test(ty) ? "REAL" : "TEXT");
const q = (s) => `"${String(s).replaceAll('"', '""')}"`;

/* 3. Schéma par famille : colonnes communes, clé, liens. */
const specs = [];
for (const f of fam.values()) {
  const first = f.parts[0].t;
  const cols = first.cols
    .map((c, i) => ({ name: c, type: sqlType(first.types[i] ?? "") }))
    .filter((c) => {
      if (SECRET_COL.test(c.name)) { report.removed_columns.push(`${f.name}.${c.name}`); return false; }
      return f.parts.every((p) => p.t.cols.includes(c.name));
    });
  const keyCol = first.cols[0];
  const uniqueKey = f.parts.every((p) => {
    const i = p.t.cols.indexOf(keyCol);
    return new Set(p.t.rows.map((r) => r[i])).size === p.t.rows.length;
  });
  specs.push({ ...f, cols, keyCol, uniqueKey });
}
const byName = new Map(specs.map((s) => [s.name, s]));
for (const s of specs) {
  s.links = [];
  for (const c of s.cols) {
    if (c.name === s.keyCol && s.uniqueKey && c.name === `id${s.name}`) continue;
    let target = null;
    const m = /^id([a-z]+)$/.exec(c.name);
    if (m && byName.has(m[1]) && byName.get(m[1]).keyCol === c.name && byName.get(m[1]).uniqueKey) target = byName.get(m[1]);
    if (/^iddata(inizio|fine)$/.test(c.name) && byName.has("periodi")) target = byName.get("periodi");
    if (!target || target === s) continue;
    s.links.push({ col: c.name, target: target.name, sameYear: target.partitioned && s.partitioned, viaKey: target.partitioned });
  }
}

/* 3 bis. Séjour lisible : colonnes dérivées AJOUTÉES aux réservations (les colonnes d'origine restent intactes). */
const intOf = (v) => (typeof v === "string" && /^-?\d+$/.test(v.trim()) ? Number(v.trim()) : null);
/** Date ISO AAAA-MM-JJ (calendrier vérifié) ; une heure éventuelle est ignorée ; sinon null. */
const isoDay = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/.exec(String(v ?? "").trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) ? `${m[1]}-${m[2]}-${m[3]}` : null;
};
const dayDiff = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const TARIFF_SEP = "#@&";
const PRICE = /^-?\d+(?:\.\d+)?$/;
// Jours : « année:n° de jour » → début et fin du jour (lendemain), lus dans les périodes de cette année-là.
const days = new Map();
const per = byName.get("periodi");
if (per && ["idperiodi", "datainizio", "datafine"].every((c) => per.cols.some((x) => x.name === c))) {
  for (const p of per.parts) {
    const idx = Object.fromEntries(p.t.cols.map((c, i) => [c, i]));
    for (const r of p.t.rows) {
      const n = intOf(r[idx.idperiodi]);
      const k = `${p.year ?? ""}:${n}`;
      if (n !== null && !days.has(k)) days.set(k, { start: isoDay(r[idx.datainizio]), end: isoDay(r[idx.datafine]) });
    }
  }
}
for (const s of specs) {
  s.derived = [];
  if (s.name !== "prenota" && s.name !== "prenotacanc") continue;
  const has = (c) => s.cols.some((x) => x.name === c);
  const skipped = [];
  // Nom déjà porté par une colonne d'origine : la colonne d'origine est gardée, la dérivée n'est pas ajoutée.
  const add = (name, type) => (has(name) ? skipped.push(name) : s.derived.push({ name, type }));
  if (has("iddatainizio") && has("iddatafine")) {
    if (days.size) {
      add("date_arrivee", "TEXT");
      add("date_depart", "TEXT");
    }
    add("nuits", "INTEGER");
  }
  if (has("tariffa")) {
    add("type_tarif", "TEXT");
    add("prix_tarif", "REAL");
  }
  if (s.derived.length || skipped.length) {
    const cols = s.derived.map((d) => d.name);
    s.stats = {
      table: s.name,
      columns: cols,
      ...(skipped.length ? { skipped_columns: skipped } : {}),
      note: "Colonnes ajoutées, colonnes d'origine intactes : arrivée et départ lus dans les périodes de la même année, nuits = dernier jour − premier jour + 1, tarif découpé sur « #@& ». Valeur introuvable : vide.",
      rows: 0,
      ...(cols.includes("date_arrivee") ? { dates_resolved: 0, dates_unresolved: 0, nights_mismatch: 0 } : {}),
      ...(cols.includes("nuits") ? { nights_unresolved: 0 } : {}),
      ...(cols.includes("type_tarif") ? { tariffs_split: 0, tariffs_unsplit: 0, tariffs_empty: 0, tariffs_per_person: 0 } : {}),
    };
  }
}

/** Valeurs des colonnes dérivées d'une ligne de réservation (année de la partition, valeurs brutes). */
function derive(s, year, get) {
  const st = s.stats;
  st.rows++;
  const out = {};
  const want = new Set(s.derived.map((d) => d.name));
  const a = intOf(get("iddatainizio"));
  const b = intOf(get("iddatafine"));
  if (want.has("nuits")) {
    out.nuits = a !== null && b !== null && b - a + 1 >= 1 ? b - a + 1 : null;
    if (out.nuits === null) st.nights_unresolved++;
  }
  if (want.has("date_arrivee")) {
    out.date_arrivee = a === null ? null : (days.get(`${year ?? ""}:${a}`)?.start ?? null);
    out.date_depart = b === null ? null : (days.get(`${year ?? ""}:${b}`)?.end ?? null);
    if (out.date_arrivee && out.date_depart) {
      st.dates_resolved++;
      if (out.nuits !== null && out.nuits !== undefined && dayDiff(out.date_arrivee, out.date_depart) !== out.nuits) st.nights_mismatch++;
    } else st.dates_unresolved++;
  }
  if (want.has("type_tarif")) {
    const raw = get("tariffa");
    const parts = typeof raw === "string" && raw !== "" ? raw.split(TARIFF_SEP) : [];
    const price = parts.length >= 2 && PRICE.test(parts[1].trim()) ? Number(parts[1].trim()) : null;
    out.type_tarif = parts.length >= 2 && parts[0] !== "" ? parts[0] : null;
    out.prix_tarif = price;
    if (!parts.length) st.tariffs_empty++;
    else if (out.type_tarif !== null && price !== null) st.tariffs_split++;
    else st.tariffs_unsplit++;
    if (parts.length >= 3 && parts[2] === "p") st.tariffs_per_person++;
  }
  return s.derived.map((d) => out[d.name] ?? null);
}

/* 4. Écriture SQLite (une transaction). */
fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
if (fs.existsSync(output)) fs.unlinkSync(output);
// Liens déclarés mais non imposés : une référence orpheline de l'ancien logiciel est copiée telle quelle,
// puis signalée par la vérification du Studio (jamais supprimée ni « réparée » en silence).
const db = new DatabaseSync(output, { enableForeignKeyConstraints: false });
db.exec("PRAGMA journal_mode = DELETE");
db.exec("PRAGMA foreign_keys = OFF");
// Ordre : tables référencées d'abord (lisibilité ; les clés ne sont pas imposées par SQLite ici).
const ordered = [...specs].sort((a, b) => a.links.length - b.links.length);
for (const s of ordered) {
  const defs = [];
  if (s.partitioned) defs.push(`"cle" TEXT PRIMARY KEY`, `"annee" INTEGER NOT NULL`);
  for (const c of s.cols) {
    const link = s.links.find((l) => l.col === c.name && !l.viaKey);
    const pk = !s.partitioned && c.name === s.keyCol && s.uniqueKey ? " PRIMARY KEY" : "";
    defs.push(`${q(c.name)} ${c.type}${pk}${link ? ` REFERENCES ${q(link.target)}(${q(byName.get(link.target).keyCol)})` : ""}`);
  }
  for (const l of s.links.filter((x) => x.viaKey)) defs.push(`${q(l.col + "_cle")} TEXT REFERENCES ${q(l.target)}("cle")`);
  for (const d of s.derived) defs.push(`${q(d.name)} ${d.type}`);
  db.exec(`CREATE TABLE ${q(s.name)} (${defs.join(", ")})`);
}
db.exec("BEGIN");
for (const s of ordered) {
  const names = [...(s.partitioned ? ["cle", "annee"] : []), ...s.cols.map((c) => c.name), ...s.links.filter((l) => l.viaKey).map((l) => l.col + "_cle"), ...s.derived.map((d) => d.name)];
  const ins = db.prepare(`INSERT INTO ${q(s.name)} (${names.map(q).join(", ")}) VALUES (${names.map(() => "?").join(", ")})`);
  let n = 0;
  for (const p of s.parts) {
    const idx = Object.fromEntries(p.t.cols.map((c, i) => [c, i]));
    p.t.rows.forEach((r, rowNo) => {
      const val = (c) => {
        const v = r[idx[c.name]];
        if (c.type !== "TEXT" && v === "") return null;
        if (c.type === "INTEGER" && /^-?\d+$/.test(v)) return Number(v);
        if (c.type === "REAL" && /^-?\d+(\.\d+)?$/.test(v)) return Number(v);
        return v;
      };
      const out = [];
      if (s.partitioned) out.push(`${p.year}:${s.uniqueKey ? r[idx[s.keyCol]] : rowNo + 1}`, p.year);
      for (const c of s.cols) out.push(val(c));
      for (const l of s.links.filter((x) => x.viaKey)) {
        const v = r[idx[l.col]];
        out.push(v === "" || v === undefined ? null : `${l.sameYear ? p.year : ""}${l.sameYear ? ":" : ""}${v}`);
      }
      if (s.derived.length) out.push(...derive(s, p.year, (c) => (c in idx ? r[idx[c]] : undefined)));
      ins.run(...out);
      n++;
    });
  }
  report.written.push({ table: s.name, rows: n, partitions: s.partitioned ? s.parts.map((p) => p.year) : null, links: s.links.map((l) => `${l.col} → ${l.target}${l.sameYear ? " (même année)" : ""}`), ...(s.derived.length ? { derived: s.derived.map((d) => d.name) } : {}) });
  if (s.stats) report.derived.push(s.stats);
}
db.exec("COMMIT");
db.close();
report.rows_written = report.written.reduce((a, w) => a + w.rows, 0);
console.log(JSON.stringify(report, null, 1));

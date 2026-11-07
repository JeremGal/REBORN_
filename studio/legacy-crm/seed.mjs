#!/usr/bin/env node
/**
 * Relatio 2004 — base de données du CRM historique de test (SQLite).
 *
 * Données synthétiques cohérentes et déterministes (graine fixe) pour une PME industrielle
 * fictive : clients, prospects, articles, devis, factures, paiements, activités, documents.
 * Les défauts typiques d'un vieux logiciel sont présents volontairement (voir QUIRKS) :
 * REBORN doit les détecter et les signaler, sans les connaître à l'avance.
 *
 *   node legacy-crm/seed.mjs            → legacy-crm/data/relatio.db (+ data/files/, data/.credentials.json)
 *   LEGACY_CRM_DATA=/tmp/x node seed.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { randomBytes, scryptSync } from "node:crypto";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = () => process.env.LEGACY_CRM_DATA ?? path.join(HERE, "data");

/** Défauts injectés (documentés pour les tests ; REBORN ne lit jamais ce fichier). */
export const QUIRKS = {
  nameless_clients: [377, 913],
  duplicate_client_pairs: [[12, 1194], [148, 1195], [260, 1196], [511, 1197], [702, 1198], [880, 1199]],
  clients_without_email: 15,
  orphan_invoice_clients: [1201, 1202],
  invoices_with_manual_adjustment: 12,
  missing_files: 8,
  invalid_activity_dates: ["31/02/2015", "00/00/0000", "31/04/2018", "29/02/2019", "32/13/2020"],
  orphan_quote_line_articles: [9001, 9002, 9003],
  duplicate_prospect_emails: 3,
};

const COUNTS = { clients: 1200, prospects: 3500, articles: 248, devis: 1800, factures_directes: 180, activites: 4000, commissions: 300 };

/* ------------------------------------------------------------------ */
/* Aléa déterministe                                                    */
/* ------------------------------------------------------------------ */
let seed = 0x5eed2004;
function rnd() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const chance = (p) => rnd() < p;
const weighted = (pairs) => {
  let r = rnd() * pairs.reduce((s, [, w]) => s + w, 0);
  for (const [v, w] of pairs) if ((r -= w) < 0) return v;
  return pairs.at(-1)[0];
};
const pad = (n, w) => String(n).padStart(w, "0");
const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* Dates : stockées en JJ/MM/AAAA (format historique du logiciel) */
const DAY = 86400000;
const dateFrom = (y0, y1) => new Date(Date.UTC(y0, 0, 1) + Math.floor(rnd() * ((Date.UTC(y1, 11, 31) - Date.UTC(y0, 0, 1)) / DAY)) * DAY);
const fr = (d) => `${pad(d.getUTCDate(), 2)}/${pad(d.getUTCMonth() + 1, 2)}/${d.getUTCFullYear()}`;
const addDays = (d, n) => new Date(d.getTime() + n * DAY);
const later = (d, maxDays) => addDays(d, int(1, maxDays));
const vatRate = (d) => (d < new Date(Date.UTC(2014, 0, 1)) ? 19.6 : 20);

/* ------------------------------------------------------------------ */
/* Vocabulaire                                                          */
/* ------------------------------------------------------------------ */
const PREFIX = ["Ateliers", "Établissements", "Société", "Groupe", "SARL", "SAS", "Industries", "Mécanique", "Usinage", "Chaudronnerie"];
const FAMILY = ["Martin", "Bernard", "Dubois", "Thomas", "Robert", "Richard", "Petit", "Durand", "Leroy", "Moreau", "Simon", "Laurent", "Lefèvre", "Michel", "Garcia", "David", "Bertrand", "Roux", "Vincent", "Fournier", "Morel", "Girard", "André", "Mercier", "Dupont", "Lambert", "Bonnet", "François", "Legrand", "Garnier", "Faure", "Rousseau", "Blanc", "Guérin", "Muller", "Henry", "Roussel", "Perrin", "Morin", "Mathieu", "Clément", "Gauthier", "Dumont", "Fontaine", "Chevalier", "Robin", "Masson", "Sanchez", "Noël", "Brun"];
const SECTOR = ["Hydraulique", "Thermique", "Process", "Énergie", "Agro", "Chimie", "Maintenance", "Industrie", "Services", "Technologies", "Fluides", "Environnement"];
const FIRST = ["Jean", "Marie", "Pierre", "Sophie", "Nicolas", "Isabelle", "Laurent", "Céline", "Philippe", "Nathalie", "Stéphane", "Sandrine", "Olivier", "Valérie", "Christophe", "Hélène", "Frédéric", "Aurélie", "Julien", "Émilie", "Thierry", "Agnès", "François", "Chloé"];
const STREET = ["rue de la République", "avenue Jean Jaurès", "rue Victor Hugo", "boulevard des Belges", "ZI des Platières", "rue de l'Industrie", "chemin des Mûriers", "route de Vienne", "allée des Artisans", "rue Pasteur", "quai Perrache", "impasse des Forges"];
const CITY = [["Lyon", "69003"], ["Villeurbanne", "69100"], ["Saint-Étienne", "42000"], ["Grenoble", "38000"], ["Annecy", "74000"], ["Clermont-Ferrand", "63000"], ["Dijon", "21000"], ["Besançon", "25000"], ["Valence", "26000"], ["Chambéry", "73000"], ["Roanne", "42300"], ["Vienne", "38200"], ["Mâcon", "71000"], ["Bourg-en-Bresse", "01000"], ["Paris", "75011"], ["Nanterre", "92000"], ["Lille", "59000"], ["Rouen", "76000"], ["Nantes", "44000"], ["Rennes", "35000"], ["Bordeaux", "33000"], ["Toulouse", "31000"], ["Marseille", "13002"], ["Nice", "06000"], ["Strasbourg", "67000"], ["Metz", "57000"], ["Reims", "51100"], ["Orléans", "45000"], ["Tours", "37000"], ["Le Mans", "72000"]];
const SALES = ["JMO", "SLE", "PDU", "AGA", "CBR"];
const REMARKS = [null, null, null, null, "Livraison quai n°3 ; appeler avant", 'Client "historique" depuis 1998', "Contact : M. Durand\nAccueil fermé le vendredi", "Paiement à 45 jours fin de mois", "Exige un certificat matière 3.1", "Ancien compte repris de GESCOM 95"];
const FAMILIES = [
  ["VAN", "Vannes", "Vanne à boisseau sphérique", 38],
  ["RAC", "Raccords", "Raccord union", 6.5],
  ["POM", "Pompes", "Pompe centrifuge", 420],
  ["JNT", "Joints", "Joint plat", 1.9],
  ["CAP", "Capteurs", "Capteur de pression", 145],
  ["TUB", "Tubes", "Tube soudé", 12],
  ["BRI", "Brides", "Bride à souder", 22],
  ["FIL", "Filtres", "Filtre à tamis", 64],
];
const MATERIALS = [["INOX", "inox 316L", 1.6], ["LAI", "laiton", 1.0], ["FONTE", "fonte GS", 1.25], ["PVC", "PVC pression", 0.55], ["ACIER", "acier carbone", 0.9]];
const DN = [15, 20, 25, 32, 40, 50, 65, 80, 100, 125, 150];

/* ------------------------------------------------------------------ */
/* Génération                                                           */
/* ------------------------------------------------------------------ */
export function seedDatabase(dir = DATA_DIR()) {
  seed = 0x5eed2004;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, "files"), { recursive: true });
  const db = new DatabaseSync(path.join(dir, "relatio.db"));
  db.exec(`
    CREATE TABLE T_CLIENT (ID_CLI INTEGER PRIMARY KEY, CODE_CLI TEXT, RAISON_SOC TEXT, SIRET TEXT, ADR1 TEXT, CP TEXT, VILLE TEXT, PAYS TEXT, TEL TEXT, EMAIL TEXT, CAT_CLI TEXT, ETAT TEXT, DATE_CREA TEXT, COMMERCIAL TEXT, REMARQUES TEXT);
    CREATE TABLE T_PROSPECT (ID_PROS INTEGER PRIMARY KEY, SOCIETE TEXT, CONTACT_NOM TEXT, CONTACT_PRENOM TEXT, EMAIL TEXT, TEL TEXT, ORIGINE TEXT, STADE TEXT, DATE_CONTACT TEXT, ID_CLI_CONVERTI INTEGER);
    CREATE TABLE T_ARTICLE (ID_ART INTEGER PRIMARY KEY, REF_ART TEXT, LIBELLE TEXT, FAMILLE TEXT, PRIX_HT REAL, CODE_TVA TEXT, ACTIF TEXT, STOCK INTEGER);
    CREATE TABLE T_DEVIS (ID_DEV INTEGER PRIMARY KEY, NUM_DEV TEXT, ID_CLI INTEGER, DATE_DEV TEXT, STATUT TEXT, REMISE_PCT REAL, TOTAL_HT REAL, TOTAL_TVA REAL, TOTAL_TTC REAL);
    CREATE TABLE T_DEVIS_LIGNE (ID_LIG INTEGER PRIMARY KEY, ID_DEV INTEGER, ID_ART INTEGER, QTE INTEGER, PU_HT REAL, REMISE_PCT REAL);
    CREATE TABLE T_FACTURE (ID_FAC INTEGER PRIMARY KEY, NUM_FAC TEXT, ID_CLI INTEGER, ID_DEV INTEGER, DATE_FAC TEXT, DATE_ECH TEXT, TAUX_TVA REAL, TOTAL_HT REAL, TOTAL_TVA REAL, TOTAL_TTC REAL, STATUT_PAI TEXT);
    CREATE TABLE T_FACTURE_LIGNE (ID_LIG INTEGER PRIMARY KEY, ID_FAC INTEGER, ID_ART INTEGER, QTE INTEGER, PU_HT REAL);
    CREATE TABLE T_PAIEMENT (ID_PAI INTEGER PRIMARY KEY, ID_FAC INTEGER, DATE_PAI TEXT, MONTANT REAL, MODE_PAI TEXT);
    CREATE TABLE T_ACTIVITE (ID_ACT INTEGER PRIMARY KEY, ID_CLI INTEGER, ID_PROS INTEGER, DATE_ACT TEXT, TYPE_ACT TEXT, SUJET TEXT, NOTE TEXT);
    CREATE TABLE T_DOCUMENT (ID_DOC INTEGER PRIMARY KEY, TYPE_LIEN TEXT, ID_LIEN INTEGER, NOM_FICHIER TEXT, CHEMIN TEXT, TAILLE INTEGER, DATE_AJOUT TEXT);
    CREATE TABLE T_COMMISSION (ID_COM INTEGER PRIMARY KEY, COMMERCIAL TEXT, ID_FAC INTEGER, TAUX REAL, MONTANT REAL);
    CREATE TABLE T_UTILISATEUR (LOGIN TEXT PRIMARY KEY, HASH TEXT, SEL TEXT, DROITS TEXT);
  `);
  const ins = (table, cols) => {
    const st = db.prepare(`INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`);
    return (row) => st.run(...cols.map((c) => row[c] ?? null));
  };
  db.exec("BEGIN");

  /* Articles ---------------------------------------------------------- */
  const articles = [];
  const addArt = ins("T_ARTICLE", ["ID_ART", "REF_ART", "LIBELLE", "FAMILLE", "PRIX_HT", "CODE_TVA", "ACTIF", "STOCK"]);
  const refs = new Set();
  while (articles.length < COUNTS.articles) {
    const [code, fam, label, base] = pick(FAMILIES);
    const [mat, matLabel, factor] = pick(MATERIALS);
    const dn = pick(DN);
    const ref = `${code}-${mat}-${pad(dn, 3)}`;
    if (refs.has(ref)) continue;
    refs.add(ref);
    const a = { ID_ART: articles.length + 1, REF_ART: ref, LIBELLE: `${label} ${matLabel} DN${dn}`, FAMILLE: fam, PRIX_HT: round2(base * factor * (0.6 + dn / 60)), CODE_TVA: "N", ACTIF: chance(0.92) ? "O" : "N", STOCK: int(0, 400) };
    articles.push(a);
    addArt(a);
  }

  /* Clients ----------------------------------------------------------- */
  const clients = [];
  const addCli = ins("T_CLIENT", ["ID_CLI", "CODE_CLI", "RAISON_SOC", "SIRET", "ADR1", "CP", "VILLE", "PAYS", "TEL", "EMAIL", "CAT_CLI", "ETAT", "DATE_CREA", "COMMERCIAL", "REMARQUES"]);
  const sirets = new Set();
  const noEmail = new Set();
  while (noEmail.size < QUIRKS.clients_without_email) noEmail.add(int(30, 1180));
  // Raisons sociales uniques : les seuls doublons sont ceux injectés volontairement (QUIRKS)
  const names = new Set();
  for (let id = 1; id <= COUNTS.clients; id++) {
    let name;
    do name = `${pick(PREFIX)} ${pick(FAMILY)}${chance(0.55) ? ` ${pick(SECTOR)}` : ""}`;
    while (names.has(name));
    names.add(name);
    let siret;
    do siret = `${int(300, 899)}${pad(int(0, 999999), 6)}${pad(int(10, 99999), 5)}`;
    while (sirets.has(siret));
    sirets.add(siret);
    const [city, cp] = pick(CITY);
    const created = dateFrom(2004, 2023);
    const c = {
      ID_CLI: id,
      CODE_CLI: `C${pad(id, 5)}`,
      RAISON_SOC: name,
      SIRET: siret,
      ADR1: `${int(1, 180)} ${pick(STREET)}`,
      CP: cp,
      VILLE: city,
      PAYS: chance(0.97) ? "FRANCE" : pick(["BELGIQUE", "SUISSE", "ESPAGNE"]),
      TEL: `0${int(1, 5)} ${pad(int(10, 99), 2)} ${pad(int(0, 99), 2)} ${pad(int(0, 99), 2)} ${pad(int(0, 99), 2)}`,
      EMAIL: noEmail.has(id) ? null : `${pick(["contact", "achats", "compta", "atelier"])}@${slug(name)}.fr`,
      CAT_CLI: weighted([["STD", 65], ["PRE", 25], ["PAR", 10]]),
      ETAT: weighted([["AC", 85], ["SU", 8], ["RA", 7]]),
      DATE_CREA: fr(created),
      COMMERCIAL: pick(SALES),
      REMARQUES: pick(REMARKS),
      _created: created,
    };
    clients.push(c);
  }
  // Défaut : fiches sans raison sociale
  clients[QUIRKS.nameless_clients[0] - 1].RAISON_SOC = null;
  clients[QUIRKS.nameless_clients[1] - 1].RAISON_SOC = "   ";
  // Défaut : doublons (même SIRET, e-mail saisi autrement)
  for (const [a, b] of QUIRKS.duplicate_client_pairs) {
    const A = clients[a - 1];
    const B = clients[b - 1];
    B.SIRET = A.SIRET;
    B.RAISON_SOC = A.RAISON_SOC?.toUpperCase() ?? B.RAISON_SOC;
    B.EMAIL = A.EMAIL ? ` ${A.EMAIL.toUpperCase()} ` : B.EMAIL;
  }
  for (const c of clients) addCli(c);
  const validClients = clients.filter((c) => !QUIRKS.nameless_clients.includes(c.ID_CLI));

  /* Prospects ---------------------------------------------------------- */
  const addPros = ins("T_PROSPECT", ["ID_PROS", "SOCIETE", "CONTACT_NOM", "CONTACT_PRENOM", "EMAIL", "TEL", "ORIGINE", "STADE", "DATE_CONTACT", "ID_CLI_CONVERTI"]);
  const prospects = [];
  const companies = new Set();
  for (let id = 1; id <= COUNTS.prospects; id++) {
    let company;
    do company = `${pick(PREFIX)} ${pick(FAMILY)} ${pick(SECTOR)}${chance(0.5) ? ` ${pick(CITY)[0]}` : ""}`;
    while (companies.has(company));
    companies.add(company);
    const first = pick(FIRST);
    const last = pick(FAMILY);
    const stage = weighted([["NOUV", 30], ["QUAL", 25], ["PROP", 15], ["GAGN", 10], ["PERDU", 20]]);
    const p = {
      ID_PROS: id,
      SOCIETE: company,
      CONTACT_NOM: last.toUpperCase(),
      CONTACT_PRENOM: first,
      EMAIL: `${slug(first)}.${slug(last)}@${slug(company)}.fr`,
      TEL: chance(0.8) ? `06 ${pad(int(0, 99), 2)} ${pad(int(0, 99), 2)} ${pad(int(0, 99), 2)} ${pad(int(0, 99), 2)}` : null,
      ORIGINE: weighted([["SALON", 20], ["WEB", 35], ["TEL", 15], ["RECO", 20], ["MAILING", 10]]),
      STADE: stage,
      DATE_CONTACT: fr(dateFrom(2012, 2025)),
      ID_CLI_CONVERTI: stage === "GAGN" ? pick(validClients).ID_CLI : null,
    };
    prospects.push(p);
  }
  for (let i = 0; i < QUIRKS.duplicate_prospect_emails; i++) prospects[3400 + i].EMAIL = prospects[100 + i * 7].EMAIL;
  for (const p of prospects) addPros(p);

  /* Devis -------------------------------------------------------------- */
  const addDev = ins("T_DEVIS", ["ID_DEV", "NUM_DEV", "ID_CLI", "DATE_DEV", "STATUT", "REMISE_PCT", "TOTAL_HT", "TOTAL_TVA", "TOTAL_TTC"]);
  const addDevL = ins("T_DEVIS_LIGNE", ["ID_LIG", "ID_DEV", "ID_ART", "QTE", "PU_HT", "REMISE_PCT"]);
  const yearSeq = new Map();
  const nextNum = (prefix, d) => {
    const k = `${prefix}${d.getUTCFullYear()}`;
    const n = (yearSeq.get(k) ?? 0) + 1;
    yearSeq.set(k, n);
    return `${prefix}${d.getUTCFullYear()}-${pad(n, 5)}`;
  };
  const devis = [];
  let devLineId = 0;
  const priceAt = (art, d) => round2(art.PRIX_HT * (1 - 0.018 * (2025 - d.getUTCFullYear())));
  const quoteClients = [
    ...QUIRKS.nameless_clients.flatMap((id) => [clients[id - 1], clients[id - 1]]),
    ...Array.from({ length: COUNTS.devis - QUIRKS.nameless_clients.length * 2 }, () => pick(validClients)),
  ];
  let orphanLines = [...QUIRKS.orphan_quote_line_articles];
  for (let i = 0; i < COUNTS.devis; i++) {
    const cli = quoteClients[i];
    const d = new Date(Math.min(later(cli._created, 3600).getTime(), Date.UTC(2025, 9, 30)));
    const nameless = QUIRKS.nameless_clients.includes(cli.ID_CLI);
    const status = nameless ? "EN" : weighted([["AC", 45], ["EN", 15], ["RE", 20], ["EX", 15], ["BR", 5]]);
    const remise = weighted([[0, 70], [2, 10], [5, 12], [10, 8]]);
    const lines = [];
    for (let k = 0, n = int(1, 5); k < n; k++) {
      const art = pick(articles);
      const orphan = orphanLines.length && i % 97 === 50 ? orphanLines.shift() : null;
      lines.push({ ID_LIG: ++devLineId, ID_DEV: i + 1, ID_ART: orphan ?? art.ID_ART, QTE: weighted([[int(1, 5), 50], [int(6, 20), 35], [int(21, 120), 15]]), PU_HT: priceAt(art, d), REMISE_PCT: chance(0.15) ? 5 : 0 });
    }
    const ht = round2(round2(lines.reduce((s, l) => s + round2(l.QTE * l.PU_HT * (1 - l.REMISE_PCT / 100)), 0)) * (1 - remise / 100));
    const rate = vatRate(d);
    const tva = round2((ht * rate) / 100);
    const q = { ID_DEV: i + 1, NUM_DEV: nextNum("D", d), ID_CLI: cli.ID_CLI, DATE_DEV: fr(d), STATUT: status, REMISE_PCT: remise, TOTAL_HT: ht, TOTAL_TVA: tva, TOTAL_TTC: round2(ht + tva), _date: d, _lines: lines, _rate: rate };
    devis.push(q);
    addDev(q);
    for (const l of lines) addDevL(l);
  }

  /* Factures ------------------------------------------------------------ */
  const addFac = ins("T_FACTURE", ["ID_FAC", "NUM_FAC", "ID_CLI", "ID_DEV", "DATE_FAC", "DATE_ECH", "TAUX_TVA", "TOTAL_HT", "TOTAL_TVA", "TOTAL_TTC", "STATUT_PAI"]);
  const addFacL = ins("T_FACTURE_LIGNE", ["ID_LIG", "ID_FAC", "ID_ART", "QTE", "PU_HT"]);
  const factures = [];
  let facLineId = 0;
  const sources = [
    ...devis.filter((q) => q.STATUT === "AC").map((q) => ({ cli: q.ID_CLI, dev: q, d: later(q._date, 40) })),
    ...Array.from({ length: COUNTS.factures_directes }, () => {
      const cli = pick(validClients);
      return { cli: cli.ID_CLI, dev: null, d: later(cli._created, 3000) };
    }),
  ].sort((a, b) => a.d - b.d);
  const adjusted = new Set();
  while (adjusted.size < QUIRKS.invoices_with_manual_adjustment) adjusted.add(int(20, sources.length - 20));
  sources.forEach((src, i) => {
    const d = new Date(Math.min(src.d.getTime(), Date.UTC(2025, 10, 5)));
    const lines = src.dev
      ? src.dev._lines.filter((l) => !QUIRKS.orphan_quote_line_articles.includes(l.ID_ART)).map((l) => ({ QTE: l.QTE, PU_HT: round2(l.PU_HT * (1 - l.REMISE_PCT / 100) * (1 - src.dev.REMISE_PCT / 100)), ID_ART: l.ID_ART }))
      : Array.from({ length: int(1, 4) }, () => {
          const art = pick(articles);
          return { QTE: int(1, 30), PU_HT: priceAt(art, d), ID_ART: art.ID_ART };
        });
    if (!lines.length) lines.push({ QTE: 1, PU_HT: priceAt(articles[0], d), ID_ART: 1 });
    const sum = round2(lines.reduce((s, l) => s + round2(l.QTE * l.PU_HT), 0));
    // Défaut : ajustement manuel du total, non reporté sur les lignes (pratique de l'époque)
    const ht = adjusted.has(i) ? round2(sum - int(1, 500) / 100) : sum;
    const rate = vatRate(d);
    const tva = round2((ht * rate) / 100);
    const f = {
      ID_FAC: i + 1,
      NUM_FAC: nextNum("F", d),
      ID_CLI: src.cli,
      ID_DEV: src.dev?.ID_DEV ?? null,
      DATE_FAC: fr(d),
      DATE_ECH: fr(addDays(d, 30)),
      TAUX_TVA: rate,
      TOTAL_HT: ht,
      TOTAL_TVA: tva,
      TOTAL_TTC: round2(ht + tva),
      STATUT_PAI: weighted([["PA", 75], ["PP", 10], ["NP", 15]]),
      _date: d,
    };
    factures.push(f);
    for (const l of lines) addFacL({ ID_LIG: ++facLineId, ID_FAC: f.ID_FAC, ...l });
  });
  // Défaut : factures dont le client a été supprimé de l'ancien logiciel
  factures[40].ID_CLI = QUIRKS.orphan_invoice_clients[0];
  factures[410].ID_CLI = QUIRKS.orphan_invoice_clients[1];
  for (const f of factures) addFac(f);

  /* Paiements ------------------------------------------------------------- */
  const addPai = ins("T_PAIEMENT", ["ID_PAI", "ID_FAC", "DATE_PAI", "MONTANT", "MODE_PAI"]);
  let paiId = 0;
  for (const f of factures) {
    if (f.STATUT_PAI === "NP") continue;
    const mode = weighted([["VIR", 55], ["CHQ", 25], ["LCR", 12], ["CB", 8]]);
    if (f.STATUT_PAI === "PP") {
      addPai({ ID_PAI: ++paiId, ID_FAC: f.ID_FAC, DATE_PAI: fr(later(f._date, 45)), MONTANT: round2(f.TOTAL_TTC * (int(30, 70) / 100)), MODE_PAI: mode });
    } else if (chance(0.2)) {
      const first = round2(f.TOTAL_TTC * 0.3);
      addPai({ ID_PAI: ++paiId, ID_FAC: f.ID_FAC, DATE_PAI: fr(later(f._date, 20)), MONTANT: first, MODE_PAI: mode });
      addPai({ ID_PAI: ++paiId, ID_FAC: f.ID_FAC, DATE_PAI: fr(later(f._date, 60)), MONTANT: round2(f.TOTAL_TTC - first), MODE_PAI: mode });
    } else {
      addPai({ ID_PAI: ++paiId, ID_FAC: f.ID_FAC, DATE_PAI: fr(later(f._date, 50)), MONTANT: f.TOTAL_TTC, MODE_PAI: mode });
    }
  }

  /* Activités ------------------------------------------------------------- */
  const addAct = ins("T_ACTIVITE", ["ID_ACT", "ID_CLI", "ID_PROS", "DATE_ACT", "TYPE_ACT", "SUJET", "NOTE"]);
  const SUBJECTS = { APPEL: ["Relance devis", "Demande de prix", "Suivi livraison", "Réclamation qualité"], RDV: ["Visite atelier", "Présentation gamme inox", "Revue annuelle"], MAIL: ["Envoi catalogue", "Conditions générales", "Relance facture"], VISITE: ["Audit installation", "Mise en service pompe"] };
  for (let id = 1; id <= COUNTS.activites; id++) {
    const type = weighted([["APPEL", 45], ["MAIL", 30], ["RDV", 15], ["VISITE", 10]]);
    const forClient = chance(0.6);
    addAct({
      ID_ACT: id,
      ID_CLI: forClient ? pick(validClients).ID_CLI : null,
      ID_PROS: forClient ? null : pick(prospects).ID_PROS,
      DATE_ACT: QUIRKS.invalid_activity_dates[id % 800 === 0 ? id / 800 - 1 : -1] ?? fr(dateFrom(2010, 2025)),
      TYPE_ACT: type,
      SUJET: pick(SUBJECTS[type]),
      NOTE: chance(0.4) ? pick(["RAS", "Client satisfait, à recontacter en septembre", "Problème d'étanchéité signalé sur DN50 — voir SAV", "Souhaite une remise de 5 %", "Interlocuteur parti à la retraite ; nouveau contact : Mme Faure"]) : null,
    });
  }

  /* Documents (pièces jointes) -------------------------------------------- */
  const addDoc = ins("T_DOCUMENT", ["ID_DOC", "TYPE_LIEN", "ID_LIEN", "NOM_FICHIER", "CHEMIN", "TAILLE", "DATE_AJOUT"]);
  let docId = 0;
  const docs = [];
  for (const f of factures) if (chance(0.4)) docs.push({ type: "FAC", id: f.ID_FAC, name: `Facture_${f.NUM_FAC}.pdf`, dir: `factures/${f._date.getUTCFullYear()}`, title: `Facture ${f.NUM_FAC} — ${f.TOTAL_TTC.toFixed(2).replace(".", ",")} EUR TTC`, d: f._date });
  for (const q of devis) if (chance(0.08)) docs.push({ type: "DEV", id: q.ID_DEV, name: `Devis_${q.NUM_DEV}.pdf`, dir: `devis/${q._date.getUTCFullYear()}`, title: `Devis ${q.NUM_DEV}`, d: q._date });
  for (const c of validClients) if (chance(0.05)) docs.push({ type: "CLI", id: c.ID_CLI, name: `Contrat_${c.CODE_CLI}.pdf`, dir: "contrats", title: `Contrat cadre ${c.CODE_CLI} — ${c.RAISON_SOC}`, d: c._created });
  const missing = new Set();
  while (missing.size < QUIRKS.missing_files) missing.add(int(5, docs.length - 5));
  docs.forEach((doc, i) => {
    const rel = `${doc.dir}/${doc.name}`;
    const bytes = pdf(doc.title);
    // Défaut : fichier référencé mais perdu sur le serveur de fichiers
    if (!missing.has(i)) {
      fs.mkdirSync(path.join(dir, "files", doc.dir), { recursive: true });
      fs.writeFileSync(path.join(dir, "files", rel), bytes);
    }
    addDoc({ ID_DOC: ++docId, TYPE_LIEN: doc.type, ID_LIEN: doc.id, NOM_FICHIER: doc.name, CHEMIN: rel, TAILLE: bytes.length, DATE_AJOUT: fr(doc.d) });
  });

  /* Commissions (accès restreint à la direction) -------------------------- */
  const addCom = ins("T_COMMISSION", ["ID_COM", "COMMERCIAL", "ID_FAC", "TAUX", "MONTANT"]);
  for (let id = 1; id <= COUNTS.commissions; id++) {
    const f = pick(factures);
    const taux = pick([1.5, 2, 3]);
    addCom({ ID_COM: id, COMMERCIAL: pick(SALES), ID_FAC: f.ID_FAC, TAUX: taux, MONTANT: round2((f.TOTAL_HT * taux) / 100) });
  }

  /* Comptes utilisateurs ---------------------------------------------------- */
  const addUser = ins("T_UTILISATEUR", ["LOGIN", "HASH", "SEL", "DROITS"]);
  const credentials = {};
  for (const [login, rights] of [["admin", "admin,lecture,export,direction"], ["migration", "lecture,export"], ["compta", "lecture,compta"]]) {
    const password = randomBytes(12).toString("base64url");
    const salt = randomBytes(16).toString("hex");
    addUser({ LOGIN: login, HASH: scryptSync(password, salt, 32).toString("hex"), SEL: salt, DROITS: rights });
    credentials[login] = { password, rights };
  }
  db.exec("COMMIT");
  db.close();
  fs.writeFileSync(path.join(dir, ".credentials.json"), JSON.stringify(credentials, null, 2), { mode: 0o600 });
  return { dir, counts: { clients: clients.length, prospects: prospects.length, articles: articles.length, devis: devis.length, factures: factures.length, documents: docs.length } };
}

/** PDF minimal valide (une page, une ligne de texte). */
function pdf(text) {
  const t = text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[()\\]/g, "").replace(/[^\x20-\x7e]/g, "-");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    null,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const stream = `BT /F1 14 Tf 60 780 Td (Relatio 2004 - ${t}) Tj ET`;
  objs[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  let out = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${pad(o, 10)} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = seedDatabase();
  console.log(`[relatio] base créée : ${path.relative(process.cwd(), r.dir)}/relatio.db`, r.counts);
  console.log("[relatio] comptes : data/.credentials.json (non versionné) — npm run crm-source:password copie le mot de passe du compte « migration »");
}

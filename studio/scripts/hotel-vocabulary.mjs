#!/usr/bin/env node
/**
 * Analyste REBORN — vocabulaire métier hôtelier (sauvegarde de type HotelDruid).
 *
 * Reprend les correspondances proposées par le Studio pour un projet et les présente comme un logiciel d'hôtel
 * en français : entités renommées (Réservations, Clients, Chambres…), libellés de champs, modules techniques
 * masqués, colonnes utiles dans les listes, champs de recherche, indicateurs du tableau de bord, ordre de la
 * navigation, et pour SIMPLIFIER la saisie :
 *  - ui.form_fields : l'essentiel, dans l'ordre, en tête du formulaire et de la fiche ; tous les autres champs
 *    restent enregistrés et modifiables, repliés sous « Informations complémentaires » ;
 *  - ui.technical_fields : champs techniques de l'ancien logiciel (clé « année:numéro », année, liens *_cle,
 *    poste et auteur de saisie, numéros de jour…) : jamais dans un formulaire, visibles dans « Données d'origine » ;
 *  - ui.views : planning des chambres sur les réservations (arrivée, départ, chambre, client, confirmation).
 *
 * Liens : toutes les tables annuelles ont une clé « année:numéro » de même forme, la proposition générique ne peut
 * donc pas savoir laquelle un lien *_cle désigne (elle prend la première qui couvre ses valeurs). L'Analyste rétablit
 * les liens déclarés par l'adaptateur (idprenota_cle → réservations, iddatainizio_cle / iddatafine_cle → jours,
 * idntariffe_cle → catalogue des frais), toujours « conservé sans lien et signalé » si la cible manque (jamais une
 * ligne rejetée pour un lien) ; « cle » est la référence d'origine de l'enregistrement, jamais un lien.
 * Quand l'essentiel d'un formulaire est la clé d'origine (numéro de chambre, réservation d'un occupant), un champ
 * qui lit la même colonne est ajouté. Colonnes dérivées de l'adaptateur : arrivée et départ en date, nuits en
 * entier, prix du tarif en montant.
 *
 * NE CHANGE JAMAIS : tables et colonnes sources, clés, protections comptables (champs protégés et nature des
 * données ; seul le document d'une ligne suit un lien rétabli), aucune colonne retirée, aucune valeur modifiée ni
 * recalculée. Appliqué deux fois, même résultat. Les correspondances sont envoyées « par l'Analyste » : le
 * propriétaire du projet les valide ensuite dans le Studio.
 *
 *   REBORN_URL=http://127.0.0.1:3100 REBORN_ANALYST_TOKEN=… node scripts/hotel-vocabulary.mjs --project MIG_x [--propose] [--publish]
 *   --propose : demande d'abord une nouvelle proposition automatique (après le dépôt d'une nouvelle conversion).
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const ENTITIES = {
  prenota: ["reservations", "Réservations", "Réservation"],
  clienti: ["clients", "Clients", "Client"],
  appartamenti: ["chambres", "Chambres", "Chambre"],
  soldi: ["paiements", "Paiements et encaissements", "Paiement"],
  costiprenota: ["frais_sejour", "Frais de séjour", "Frais de séjour"],
  rclientiprenota: ["occupants", "Occupants des réservations", "Occupant"],
  periodi: ["tarifs_jour", "Tarifs par jour", "Tarif du jour"],
  ntariffe: ["frais_catalogue", "Catalogue des frais et suppléments", "Frais du catalogue"],
  costi: ["depenses_recettes", "Dépenses et recettes", "Dépense ou recette"],
  casse: ["caisses", "Caisses", "Caisse"],
  prenotacanc: ["reservations_annulees", "Réservations annulées", "Réservation annulée"],
  regole: ["regles_reservation", "Règles de réservation", "Règle de réservation"],
  nazioni: ["pays", "Pays", "Pays"],
  anni: ["annees", "Années d'activité", "Année"],
  messaggi: ["messages", "Messages internes", "Message"],
};
const ORDER = ["reservations", "clients", "chambres", "paiements", "frais_sejour", "occupants", "tarifs_jour", "frais_catalogue", "depenses_recettes", "caisses", "reservations_annulees", "regles_reservation", "pays", "annees", "messages"];
const HIDDEN = new Set(["annees", "messages"]);

const COMMON = {
  cle: "Référence d'origine", annee: "Année", datainserimento: "Créé le", hostinserimento: "Poste de saisie", utente_inserimento: "Saisi par (n° d'utilisateur)",
  data_modifica: "Modifié le", data_inserimento: "Saisi le", commento: "Commentaire", note: "Note", valuta: "Devise", metodo_pagamento: "Mode de paiement",
};
const FIELDS = {
  clienti: {
    idclienti: "N° client", cognome: "Nom", cognome2: "Second nom", nome: "Prénom", soprannome: "Surnom", sesso: "Sexe", titolo: "Civilité", lingua: "Langue",
    datanascita: "Date de naissance", cittanascita: "Ville de naissance", regionenascita: "Région de naissance", nazionenascita: "Pays de naissance",
    documento: "N° de pièce d'identité", scadenzadoc: "Expiration de la pièce", tipodoc: "Type de pièce", cittadoc: "Ville de délivrance", regionedoc: "Région de délivrance",
    nazionedoc: "Pays de délivrance", nazionalita: "Nationalité", nazione: "Pays", regione: "Région", citta: "Ville", via: "Rue", numcivico: "N° de rue", cap: "Code postal",
    telefono: "Téléphone", telefono2: "Téléphone 2", telefono3: "Téléphone 3", fax: "Fax", email: "E-mail", email2: "E-mail 2", email3: "E-mail 3",
    cod_fiscale: "Code fiscal", partita_iva: "N° de TVA", max_num_ordine: "Ordre (technique)", idclienti_compagni: "Accompagnants (n°)", doc_inviati: "Documents envoyés",
  },
  prenota: {
    idprenota: "N° de réservation", idclienti: "Client", idappartamenti: "Chambre", iddatainizio: "Jour d'arrivée (n°)", iddatafine: "Dernier jour du séjour (n°)",
    iddatainizio_cle: "Premier jour (période)", iddatafine_cle: "Dernier jour (période)", assegnazioneapp: "Attribution de la chambre", app_assegnabili: "Chambres possibles",
    num_persone: "Personnes", cat_persone: "Catégories de personnes", idprenota_compagna: "Réservation liée", tariffa: "Tarif appliqué (texte d'origine)", tariffesettimanali: "Détail des tarifs",
    incompatibilita: "Incompatibilités", sconto: "Remise", tariffa_tot: "Montant du séjour", caparra: "Acompte", commissioni: "Commission", tasseperc: "Taxe (%)",
    pagato: "Montant payé", codice: "Code de réservation", origine: "Origine de la réservation", conferma: "Confirmée", checkin: "Arrivée enregistrée le",
    checkout: "Départ enregistré le", id_anni_prec: "Réservation de l'année précédente (n°)",
    date_arrivee: "Arrivée", date_depart: "Départ", nuits: "Nuits", type_tarif: "Type de tarif", prix_tarif: "Prix du tarif",
  },
  appartamenti: { idappartamenti: "Numéro", numpiano: "Étage", maxoccupanti: "Capacité (personnes)", numcasa: "Bâtiment", app_vicini: "Chambres voisines", priorita: "Priorité d'attribution", priorita2: "Priorité secondaire", letto: "Lits" },
  costiprenota: {
    idcostiprenota: "N° de frais", idprenota: "Réservation (n°)", idprenota_cle: "Réservation", tipo: "Type de calcul", nome: "Frais", valore: "Montant", valore_perc: "Pourcentage",
    arrotonda: "Arrondi", tasseperc: "Taxe (%)", associasett: "Associé à la semaine", settimane: "Semaines", moltiplica: "Multiplicateur", categoria: "Catégorie", letto: "Lit",
    cat_persone: "Catégories de personnes", numlimite: "Limite", idntariffe: "Frais du catalogue (n°)", idntariffe_cle: "Frais du catalogue", variazione: "Variation",
    varmoltiplica: "Variation (multiplicateur)", varnumsett: "Variation (semaines)", varperiodipermessi: "Variation (périodes permises)", varbeniinv: "Variation (biens d'inventaire)",
    varappincompatibili: "Variation (chambres incompatibles)", vartariffeassociate: "Variation (tarifs associés)", vartariffeincomp: "Variation (tarifs incompatibles)",
  },
  rclientiprenota: { idprenota: "Réservation (n°)", idprenota_cle: "Réservation", idclienti: "Client", num_ordine: "Ordre", parentela: "Lien de parenté" },
  periodi: { idperiodi: "N° de jour", datainizio: "Date", datafine: "Lendemain" },
  soldi: {
    idsoldi: "N° de mouvement", motivazione: "Motif (codes d'origine)", id_pagamento: "N° de paiement", saldo_prenota: "Montant lié à la réservation", saldo_cassa: "Montant de caisse",
    soldi_prima: "Solde avant", saldo_valuta: "Montant en devise", data_transazione: "Date du mouvement",
  },
  costi: {
    idcosti: "N° d'écriture", nome_costo: "Libellé", val_costo: "Montant", tipo_costo: "Type", nome_cassa: "Caisse", persona_costo: "Personne", provenienza_costo: "Provenance",
    metodo_pagamento: "Mode de paiement", data_transazione: "Date", costo_valuta: "Montant en devise", id_pagamento: "N° de paiement",
  },
  casse: { idcasse: "N° de caisse", nome_cassa: "Nom de la caisse", stato: "État", codice_cassa: "Code de la caisse", descrizione_cassa: "Description", codice_fiscale: "Code fiscal", partita_iva: "N° de TVA" },
  prenotacanc: {},
  ntariffe: {
    idntariffe: "N°", nomecostoagg: "Nom du frais", tipo_ca: "Type de calcul", valore_ca: "Montant", valore_perc_ca: "Pourcentage", arrotonda_ca: "Arrondi", tasseperc_ca: "Taxe (%)",
    associasett_ca: "Associé à la semaine", numsett_ca: "Semaines", moltiplica_ca: "Multiplicateur", periodipermessi_ca: "Périodes permises", beniinv_ca: "Biens d'inventaire",
    appincompatibili_ca: "Chambres incompatibles", variazione_ca: "Variation", mostra_ca: "Affiché", categoria_ca: "Catégorie", letto_ca: "Lit", numlimite_ca: "Limite",
    regoleassegna_ca: "Règles d'attribution",
  },
  regole: {
    idregole: "N° de règle", app_agenzia: "Chambres réservées à une agence", tariffa_chiusa: "Tarif fermé", tariffa_per_app: "Tarif par chambre", tariffa_per_utente: "Tarif par utilisateur",
    tariffa_per_persone: "Tarif par nombre de personnes", tariffa_commissioni: "Commission du tarif", iddatainizio: "Début (n° de jour)", iddatafine: "Fin (n° de jour)",
    iddatainizio_cle: "Début", iddatafine_cle: "Fin", motivazione: "Motif", motivazione2: "Motif 2", motivazione3: "Motif 3",
  },
  nazioni: { idnazioni: "N°", nome_nazione: "Pays", codice_nazione: "Code", codice2_nazione: "Code 2", codice3_nazione: "Code 3" },
  anni: { idanni: "Année", tipo_periodi: "Type de périodes" },
  messaggi: { tipo_messaggio: "Type", stato: "État", idutenti: "Destinataires (n°)", idutenti_visto: "Lu par (n°)", datavisione: "Lu le", mittente: "Expéditeur (n°)", testo: "Texte" },
};
FIELDS.prenotacanc = { ...FIELDS.prenota, idprenota: "N° de réservation annulée", idprenota_cle: "Référence de la réservation annulée" };
const PERIOD_RATE = /^tariffa(\d+)(p?)$/;
const MESSAGE_DATA = /^dati_messaggio(\d+)$/;
const YES_NO = { S: "Oui", N: "Non" };

/* Formulaires : l'essentiel, dans cet ordre (colonnes sources). Le reste est replié, jamais retiré. Les six
   premiers sont exactement ceux demandés par l'hôtel ; les autres sont complétés jusqu'à 4 champs utiles. */
const EXACT_FORMS = new Set(["clients", "reservations", "chambres", "paiements", "occupants", "frais_sejour"]);
const FORM = {
  clients: ["cognome", "nome", "telefono", "email", "citta", "nazione", "commento"],
  reservations: ["idclienti", "idappartamenti", "date_arrivee", "date_depart", "num_persone", "type_tarif", "tariffa_tot", "caparra", "pagato", "conferma", "commento"],
  chambres: ["idappartamenti", "numpiano", "maxoccupanti", "letto", "commento"],
  paiements: ["data_transazione", "metodo_pagamento", "saldo_prenota", "saldo_cassa", "note"],
  occupants: ["idprenota_cle", "idclienti"],
  frais_sejour: ["idprenota_cle", "nome", "valore"],
  tarifs_jour: ["datainizio", "tariffa1", "tariffa2", "tariffa3", "tariffa4"],
  frais_catalogue: ["nomecostoagg", "tipo_ca", "valore_ca", "valore_perc_ca", "tasseperc_ca"],
  depenses_recettes: ["data_transazione", "nome_costo", "val_costo", "tipo_costo", "metodo_pagamento", "nome_cassa"],
  caisses: ["nome_cassa", "stato", "codice_cassa", "descrizione_cassa"],
  reservations_annulees: ["idclienti", "idappartamenti", "date_arrivee", "date_depart", "tariffa_tot", "commento"],
  regles_reservation: ["tariffa_chiusa", "app_agenzia", "tariffa_per_app", "tariffa_per_persone", "motivazione"],
  pays: ["nome_nazione", "codice_nazione", "codice2_nazione", "codice3_nazione"],
  annees: ["tipo_periodi"],
  messages: ["tipo_messaggio", "stato", "datavisione", "testo"],
};
/* Champs techniques (colonnes sources) : jamais dans un formulaire, visibles dans « Données d'origine ». */
const TECHNICAL = new Set(["cle", "annee", "hostinserimento", "utente_inserimento", "max_num_ordine", "idprenota_compagna", "iddatainizio", "iddatafine", "tariffesettimanali", "incompatibilita", "app_assegnabili", "cat_persone", "id_anni_prec"]);
const FEE_TABLES = new Set(["costiprenota", "ntariffe"]);
const isTechnical = (table, col) => TECHNICAL.has(col) || /_cle$/.test(col) || (FEE_TABLES.has(table) && /^var/.test(col));

const LIST = {
  reservations: ["idclienti", "idappartamenti", "date_arrivee", "date_depart", "nuits", "num_persone", "tariffa_tot", "pagato", "conferma"],
  clients: ["cognome", "nome", "telefono", "email", "citta", "nazione"],
  chambres: ["idappartamenti", "numpiano", "maxoccupanti", "letto"],
  paiements: ["data_transazione", "metodo_pagamento", "saldo_prenota", "saldo_cassa", "note"],
  frais_sejour: ["idprenota_cle", "nome", "valore", "tasseperc"],
  occupants: ["idprenota_cle", "idclienti", "parentela"],
  tarifs_jour: ["datainizio", "tariffa1", "tariffa2", "tariffa3", "tariffa4"],
  frais_catalogue: ["nomecostoagg", "tipo_ca", "valore_ca", "valore_perc_ca"],
  depenses_recettes: ["data_transazione", "nome_costo", "val_costo", "tipo_costo", "metodo_pagamento"],
  caisses: ["nome_cassa", "stato", "codice_cassa", "descrizione_cassa"],
  reservations_annulees: ["idclienti", "idappartamenti", "date_arrivee", "date_depart", "nuits", "tariffa_tot"],
  regles_reservation: ["tariffa_chiusa", "app_agenzia", "motivazione"],
  pays: ["nome_nazione", "codice_nazione", "codice2_nazione"],
  messages: ["tipo_messaggio", "stato", "datavisione", "testo"],
};
const SEARCH = {
  clients: ["cognome", "nome", "email", "telefono", "citta"],
  reservations: ["codice", "type_tarif", "commento"],
  reservations_annulees: ["codice", "type_tarif", "commento"],
  chambres: ["idappartamenti", "commento"],
  paiements: ["note", "id_pagamento", "metodo_pagamento"],
  frais_sejour: ["nome"],
  depenses_recettes: ["nome_costo", "nome_cassa"],
};
/* Titre d'un enregistrement (premier champ présent) : c'est lui qui s'affiche dans les liens. */
const TITLE = {
  clients: ["cognome"],
  chambres: ["idappartamenti"],
  reservations: ["date_arrivee", "idprenota"],
  reservations_annulees: ["date_arrivee", "idprenota"],
  tarifs_jour: ["datainizio"],
  paiements: ["data_transazione"],
  frais_sejour: ["nome"],
  pays: ["nome_nazione"],
  caisses: ["nome_cassa"],
  frais_catalogue: ["nomecostoagg"],
  depenses_recettes: ["nome_costo"],
};
const INDICATORS = {
  reservations: [{ label: "Réservations", kind: "count" }, { label: "Montant des séjours", kind: "sum", field: "tariffa_tot" }, { label: "Montant encaissé", kind: "sum", field: "pagato" }],
  clients: [{ label: "Clients", kind: "count" }],
  chambres: [{ label: "Chambres", kind: "count" }],
};
/* Répartitions du tableau de bord (premier champ présent) : à la place du premier code venu, parfois technique. */
const BREAKDOWN = { reservations: ["type_tarif", "conferma"], clients: ["nazione", "lingua"], chambres: ["maxoccupanti", "numpiano"], paiements: ["metodo_pagamento"] };

/* Liens déclarés par l'adaptateur : <col>_cle → famille annuelle de la même année. */
const LINK_COL = /^(id[a-z0-9]+)_cle$/;
const linkTable = (col) => (/^iddata(inizio|fine)$/.test(col) ? "periodi" : col.slice(2));
/** Numéro de l'enregistrement lui-même (réservation déplacée dans les annulations), pas un lien. */
const OWN_NUMBER = { prenotacanc: new Set(["idprenota_cle"]) };
/** Colonnes dérivées par l'adaptateur (tagged-dump-to-sqlite.mjs) : type attendu dans le nouveau logiciel. */
const DERIVED_TYPES = { date_arrivee: "date", date_depart: "date", nuits: "integer", prix_tarif: "money" };
/** Montants affichés en euros : un nombre (decimal / integer) de ces colonnes devient un montant (money). */
const MONEY = new Set(["tariffa_tot", "sconto", "caparra", "commissioni", "pagato", "valore", "saldo_prenota", "saldo_cassa", "soldi_prima", "saldo_valuta", "val_costo", "valore_ca"]);

const NOTE = "Vocabulaire hôtelier appliqué par l'Analyste REBORN : libellés français, formulaires courts (l'essentiel d'abord), champs techniques à part, liens de l'adaptateur rétablis, planning des chambres ; sources, clés et protections inchangées.";
const PREVIOUS_NOTE = /\s*(?:·\s*)?Vocabulaire hôtelier appliqué par l'Analyste REBORN[^·]*/g;

const humanize = (s) => {
  const t = String(s).replace(/_cle$/, "").replace(/_/g, " ").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : String(s);
};
/** Nom de champ déduit d'une colonne, comme la proposition automatique du Studio. */
const fieldName = (col) =>
  String(col)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .replace(/^(\d)/, "c_$1")
    .replace(/^(id|rowid|oid)$/, "source_$1")
    .slice(0, 60) || "colonne";

const linkNote = (col, target) => `Lien déclaré par l'adaptateur d'extraction (même année) : ${col} → ${target}. Cible introuvable : enregistrement conservé sans lien et signalé.`;

function asLink(f, target) {
  f.type = "reference";
  f.references = target;
  f.on_missing = "keep_unlinked";
  for (const k of ["required", "unique", "options", "transforms"]) delete f[k];
  f.confidence = 0.95;
  f.note = linkNote(f.source, target);
}

function asText(f, note) {
  f.type = "text";
  for (const k of ["references", "on_missing", "options", "transforms", "confidence"]) delete f[k];
  f.note = note;
}

/** Type d'une colonne dérivée (jamais pour un lien) ; seule la transformation « trim » est gardée. */
function setType(f, type) {
  if (f.type === "reference") return;
  f.type = type;
  for (const k of ["options", "references", "on_missing"]) delete f[k];
  const keep = (f.transforms ?? []).filter((t) => t === "trim");
  if (keep.length) f.transforms = keep;
  else delete f.transforms;
}

/** Liens *_cle vers la bonne table (déclarés par l'adaptateur) ; « cle » et le numéro propre ne sont jamais des liens. */
function restoreLinks(e, table, entityOfTable) {
  for (const f of e.fields) {
    const src = String(f.source);
    if (src === "cle" || OWN_NUMBER[table]?.has(src)) {
      if (f.type === "reference") asText(f, src === "cle" ? "Référence d'origine de l'enregistrement (année:numéro), conservée telle quelle : ce n'est pas un lien." : "Numéro d'origine de la réservation annulée (année:numéro), conservé tel quel : ce n'est pas un lien.");
      continue;
    }
    const m = LINK_COL.exec(src);
    if (!m) continue;
    const targetTable = linkTable(m[1]);
    const target = targetTable !== table ? entityOfTable.get(targetTable) : undefined;
    if (target) asLink(f, target);
    else if (f.type === "reference") asText(f, `Lien vers ${targetTable} : table absente des correspondances, valeur « année:numéro » conservée telle quelle.`);
  }
  // Lignes d'un document rattachées par un lien rétabli : le document est celui que le lien désigne.
  const via = e.line_of ? e.fields.find((f) => f.name === e.line_of.via) : null;
  if (via?.type === "reference" && via.references !== e.line_of.entity) {
    e.line_of.entity = via.references;
    if (e.classification?.kind === "line") e.classification.parent = via.references;
  }
}

/** Champ essentiel qui est la clé d'origine (non proposé comme champ) : un champ lit la même colonne. */
function addKeyField(e, table, newName, entityOfTable) {
  const key = e.source?.key;
  if (!key || !(FORM[newName] ?? []).includes(key) || e.fields.some((f) => String(f.source) === key)) return;
  const base = fieldName(key);
  let name = base;
  for (let i = 2; e.fields.some((f) => f.name === name); i++) name = `${base.slice(0, 56)}_${i}`;
  const m = LINK_COL.exec(key);
  const target = m && linkTable(m[1]) !== table ? entityOfTable.get(linkTable(m[1])) : undefined;
  e.fields.unshift(
    target
      ? { name, source: key, type: "reference", references: target, on_missing: "keep_unlinked", confidence: 0.95, note: linkNote(key, target) }
      : { name, source: key, type: "text", required: true, unique: true, note: "Clé d'origine de l'enregistrement, lue aussi comme champ pour être affichée et saisie (valeur copiée telle quelle)." },
  );
}

const TYPED = ["reference", "date", "money", "enum", "text", "email", "phone", "integer", "decimal"];

function applyUi(e, table, newName) {
  const bySource = new Map();
  for (const f of e.fields) if (!bySource.has(String(f.source))) bySource.set(String(f.source), f.name);
  const byName = new Map(e.fields.map((f) => [f.name, f]));
  const pick = (cols) => [...new Set((cols ?? []).map((c) => bySource.get(c)).filter(Boolean))];
  const technical = new Set(e.fields.filter((f) => isTechnical(table, String(f.source))).map((f) => f.name));
  const form = FORM[newName] ? pick(FORM[newName]) : [];
  // Un lien essentiel (la réservation d'un frais ou d'un occupant) reste dans le formulaire.
  for (const n of form) technical.delete(n);
  const shown = (names) => names.filter((n) => byName.has(n) && !technical.has(n));

  const title = shown(pick(TITLE[newName]))[0];
  if (title) e.title_field = title;
  else if (e.title_field && technical.has(e.title_field)) {
    const alt = e.fields.find((f) => f.type === "text" && !technical.has(f.name));
    if (alt) e.title_field = alt.name;
  }
  const fallback = shown([e.title_field, ...e.fields.filter((f) => TYPED.includes(f.type)).map((f) => f.name)].filter(Boolean));

  e.ui = { ...(e.ui ?? {}) };
  if (HIDDEN.has(newName)) e.ui.nav = false;
  // Exact pour les six demandés ; sinon au moins 4 champs utiles quand ils existent (6 au plus sans liste connue).
  const size = form.length >= 4 ? form.length : form.length ? 4 : 6;
  const formFields = EXACT_FORMS.has(newName) && form.length ? form : [...new Set([...form, ...fallback])].slice(0, size);
  if (formFields.length) e.ui.form_fields = formFields;
  else delete e.ui.form_fields;
  const tech = e.fields.map((f) => f.name).filter((n) => technical.has(n));
  if (tech.length) e.ui.technical_fields = tech;
  else delete e.ui.technical_fields;

  const list = LIST[newName] ? shown(pick(LIST[newName])) : shown(e.ui.list_fields ?? [...new Set(fallback)].slice(0, 6));
  if (list.length) e.ui.list_fields = list;
  else delete e.ui.list_fields;
  const searchable = e.fields.filter((f) => ["text", "email", "phone"].includes(f.type)).map((f) => f.name);
  const search = SEARCH[newName] ? shown(pick(SEARCH[newName])) : shown(e.ui.search_fields ?? searchable).slice(0, 4);
  if (search.length) e.ui.search_fields = search;
  else delete e.ui.search_fields;

  const ind = (INDICATORS[newName] ?? []).map((i) => (i.field ? { ...i, field: bySource.get(i.field) } : i)).filter((i) => !("field" in i) || i.field);
  if (ind.length) e.ui.indicators = ind;
  const breakdown = shown(pick(BREAKDOWN[newName]))[0];
  if (breakdown) e.ui.breakdown = breakdown;

  if (newName === "reservations") {
    const by = (src) => byName.get(bySource.get(src));
    const [start, end, room, client, status] = ["date_arrivee", "date_depart", "idappartamenti", "idclienti", "conferma"].map(by);
    const label = client ?? byName.get(e.title_field);
    if (start?.type === "date" && end?.type === "date" && room?.type === "reference" && label) {
      e.ui.views = [{ kind: "planning", name: "planning", label: "Planning des chambres", start: start.name, end: end.name, resource: room.name, title: label.name, ...(status ? { status: status.name } : {}) }];
    } else delete e.ui.views;
  }
}

export function hotelVocabulary(mapping) {
  const m = structuredClone(mapping);
  const rename = new Map();
  for (const e of m.entities) {
    const def = ENTITIES[e.source?.table];
    if (def) rename.set(e.name, def[0]);
  }
  const ren = (n) => rename.get(n) ?? n;
  const entityOfTable = new Map();
  for (const e of m.entities) if (!entityOfTable.has(e.source?.table)) entityOfTable.set(e.source?.table, ren(e.name));
  for (const e of m.entities) {
    const table = e.source?.table;
    const def = ENTITIES[table];
    const newName = ren(e.name);
    if (def) [e.name, e.label, e.label_singular] = def;
    for (const f of e.fields) if (f.references) f.references = ren(f.references);
    if (e.line_of?.entity) e.line_of.entity = ren(e.line_of.entity);
    if (e.classification?.parent) e.classification.parent = ren(e.classification.parent);
    for (const a of e.aggregates ?? []) if (a.children) a.children = ren(a.children);
    restoreLinks(e, table, entityOfTable);
    addKeyField(e, table, newName, entityOfTable);
    const dict = { ...COMMON, ...(FIELDS[table] ?? {}) };
    for (const f of e.fields) {
      const src = String(f.source);
      const want = DERIVED_TYPES[src];
      if (want && f.type !== want) setType(f, want);
      if ((MONEY.has(src) || /^tariffa\d+p?$/.test(src)) && (f.type === "decimal" || f.type === "integer")) setType(f, "money");
      const rate = PERIOD_RATE.exec(src);
      const data = MESSAGE_DATA.exec(src);
      f.label = (dict[src] ?? (rate ? `Tarif ${rate[1]}${rate[2] ? " par personne" : ""}` : data ? `Donnée ${data[1]}` : (f.label ?? humanize(src)))).slice(0, 80);
      if (src === "conferma" && f.type === "enum") for (const o of f.options ?? []) if (YES_NO[o.value] && (!o.label || o.label === o.value)) o.label = YES_NO[o.value];
    }
    applyUi(e, table, newName);
  }
  m.entities.sort((a, b) => {
    const ia = ORDER.indexOf(a.name), ib = ORDER.indexOf(b.name);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
  const rest = (m.notes ?? "").replace(PREVIOUS_NOTE, "").trim().replace(/^·\s*/, "");
  m.notes = `${rest ? rest + " · " : ""}${NOTE}`.slice(0, 2000);
  return m;
}

/**
 * Vérification locale de la présentation (avant tout envoi) : noms connus, aucun champ technique dans un
 * formulaire, une liste ou un titre, planning sur des champs date / date / référence, liens vers des entités connues.
 */
export function checkVocabulary(m) {
  const out = [];
  const entities = new Set(m.entities.map((e) => e.name));
  for (const e of m.entities) {
    const fields = new Map(e.fields.map((f) => [f.name, f]));
    const tech = new Set(e.ui?.technical_fields ?? []);
    const issue = (where, message) => out.push({ path: `${e.name}.${where}`, message });
    for (const k of ["list_fields", "search_fields", "form_fields", "technical_fields"]) {
      const list = e.ui?.[k] ?? [];
      for (const n of list) if (!fields.has(n)) issue(`ui.${k}`, `champ inconnu : ${n}`);
      if (new Set(list).size !== list.length) issue(`ui.${k}`, "champ en double");
      if (k !== "technical_fields") for (const n of list) if (tech.has(n)) issue(`ui.${k}`, `champ technique affiché : ${n}`);
    }
    if (e.title_field && !fields.has(e.title_field)) issue("title_field", `champ titre inconnu : ${e.title_field}`);
    if (e.title_field && tech.has(e.title_field)) issue("title_field", `champ titre technique : ${e.title_field}`);
    for (const f of e.fields) if (f.type === "reference" && !entities.has(f.references)) issue(`fields.${f.name}`, `entité référencée inconnue : ${f.references}`);
    for (const v of e.ui?.views ?? []) {
      if (v.kind !== "planning") issue("ui.views", `vue inconnue : ${v.kind}`);
      for (const [k, type] of [["start", "date"], ["end", "date"], ["resource", "reference"]]) if (fields.get(v[k])?.type !== type) issue(`ui.views.${v.name}.${k}`, `champ ${type} attendu : ${v[k]}`);
      for (const k of ["title", "status"]) if (v[k] !== undefined && !fields.has(v[k])) issue(`ui.views.${v.name}.${k}`, `champ inconnu : ${v[k]}`);
    }
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const project = args[args.indexOf("--project") + 1];
  const publish = args.includes("--publish");
  const propose = args.includes("--propose");
  const base = (process.env.REBORN_URL ?? "").replace(/\/$/, "");
  const token = process.env.REBORN_ANALYST_TOKEN;
  if (!/^MIG_[a-f0-9]{8}$/.test(project ?? "") || !base || !token) {
    console.error("usage : REBORN_URL=… REBORN_ANALYST_TOKEN=… node scripts/hotel-vocabulary.mjs --project MIG_x [--propose] [--publish]");
    process.exit(2);
  }
  const H = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  if (propose) {
    const p = await fetch(`${base}/api/migration/mapping?project=${project}&propose=auto`, { method: "POST", headers: H });
    const pb = await p.json();
    console.log(`Proposition automatique : HTTP ${p.status} · version ${pb.version ?? "?"}`);
    if (!p.ok) process.exit(1);
  }
  const cur = await fetch(`${base}/api/migration/mapping?project=${project}`, { headers: H });
  const body = await cur.json();
  const mapping = body.current?.mapping ?? body.mapping;
  if (!cur.ok || !mapping?.entities) {
    console.error(`Correspondances illisibles (HTTP ${cur.status}) : ${JSON.stringify(body).slice(0, 300)}`);
    process.exit(1);
  }
  const out = hotelVocabulary(mapping);
  console.log(`Vocabulaire : ${out.entities.map((e) => `${e.label}${e.ui?.nav === false ? " (masqué)" : ""}`).join(", ")}`);
  const res = out.entities.find((e) => e.name === "reservations");
  if (res) console.log(`Réservations : formulaire de ${res.ui?.form_fields?.length ?? 0} champ(s), ${res.ui?.technical_fields?.length ?? 0} champ(s) technique(s) à part, planning ${res.ui?.views?.length ? "oui" : "non (arrivée, départ ou chambre absents : convertissez de nouveau la sauvegarde)"}`);
  const problems = checkVocabulary(out);
  for (const p of problems) console.log(`  - ${p.path} ${p.message}`);
  if (problems.length) {
    console.error(`${problems.length} problème(s) de présentation : rien n'est envoyé.`);
    process.exit(1);
  }
  if (!publish) process.exit(0);
  const r = await fetch(`${base}/api/migration/mapping?project=${project}&source=analyst`, { method: "POST", headers: H, body: JSON.stringify(out) });
  const sent = await r.json();
  console.log(`Envoi par l'Analyste : HTTP ${r.status} · version ${sent.version ?? sent.current?.version ?? "?"} · ${(sent.issues ?? []).length} problème(s) · ${sent.review?.pending ?? sent.review?.items?.length ?? "?"} point(s) à valider`);
  for (const i of (sent.issues ?? []).slice(0, 10)) console.log(`  - ${i.level} ${i.path ?? ""} ${i.message}`);
  if (!r.ok) process.exit(1);
}

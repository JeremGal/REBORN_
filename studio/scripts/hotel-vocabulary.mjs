#!/usr/bin/env node
/**
 * Analyste REBORN — vocabulaire métier hôtelier (sauvegarde de type HotelDruid).
 *
 * Reprend les correspondances proposées par le Studio pour un projet et les présente comme un logiciel d'hôtel
 * en français : entités renommées (Réservations, Clients, Chambres…), libellés de champs, modules techniques
 * masqués, colonnes utiles dans les listes, champs de recherche, indicateurs du tableau de bord, ordre de la
 * navigation. NE CHANGE JAMAIS : tables et colonnes sources, clés, types, protections comptables (aucune perte,
 * aucun montant ni date historique modifié). Les correspondances sont envoyées « par l'Analyste » : le
 * propriétaire du projet les valide ensuite dans le Studio.
 *
 *   REBORN_URL=http://127.0.0.1:3100 REBORN_ANALYST_TOKEN=… node scripts/hotel-vocabulary.mjs --project MIG_x [--publish]
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
    iddatainizio_cle: "Premier jour (tarif)", iddatafine_cle: "Dernier jour (tarif)", assegnazioneapp: "Attribution de la chambre", app_assegnabili: "Chambres possibles",
    num_persone: "Personnes", cat_persone: "Catégories de personnes", idprenota_compagna: "Réservation liée", tariffa: "Tarif appliqué", tariffesettimanali: "Détail des tarifs",
    incompatibilita: "Incompatibilités", sconto: "Remise", tariffa_tot: "Montant du séjour", caparra: "Acompte", commissioni: "Commission", tasseperc: "Taxe (%)",
    pagato: "Montant payé", codice: "Code de réservation", origine: "Origine de la réservation", conferma: "Confirmée (S/N)", checkin: "Arrivée enregistrée le",
    checkout: "Départ enregistré le", id_anni_prec: "Réservation de l'année précédente (n°)",
    date_arrivee: "Arrivée", date_depart: "Départ", nuits: "Nuits", type_tarif: "Type de tarif", prix_tarif_affiche: "Prix du tarif",
  },
  appartamenti: { idappartamenti: "Chambre", numpiano: "Étage", maxoccupanti: "Capacité (personnes)", numcasa: "Bâtiment", app_vicini: "Chambres voisines", priorita: "Priorité d'attribution", priorita2: "Priorité secondaire", letto: "Lits" },
  costiprenota: {
    idcostiprenota: "N° de frais", idprenota: "Réservation (n°)", idprenota_cle: "Réservation", tipo: "Type de calcul", nome: "Frais", valore: "Montant", valore_perc: "Pourcentage",
    arrotonda: "Arrondi", tasseperc: "Taxe (%)", associasett: "Associé à la semaine", settimane: "Semaines", moltiplica: "Multiplicateur", categoria: "Catégorie", letto: "Lit",
    cat_persone: "Catégories de personnes", numlimite: "Limite", idntariffe: "Frais du catalogue (n°)", idntariffe_cle: "Frais du catalogue", variazione: "Variation",
  },
  rclientiprenota: { idprenota: "Réservation (n°)", idprenota_cle: "Réservation", idclienti: "Client", num_ordine: "Ordre", parentela: "Lien de parenté" },
  periodi: { idperiodi: "N° de jour", datainizio: "Date", datafine: "Lendemain" },
  soldi: {
    idsoldi: "N° de mouvement", motivazione: "Motif (codes d'origine)", id_pagamento: "N° de paiement", saldo_prenota: "Montant lié à une réservation", saldo_cassa: "Montant de caisse",
    soldi_prima: "Solde avant", saldo_valuta: "Montant en devise", data_transazione: "Date du mouvement",
  },
  costi: { idcosti: "N° d'écriture", nome_costo: "Libellé", val_costo: "Montant", tipo_costo: "Type", nome_cassa: "Caisse", persona_costo: "Personne", provenienza_costo: "Provenance", metodo_pagamento: "Mode de paiement" },
  casse: { idcasse: "N° de caisse", nome_cassa: "Nom de la caisse", stato: "État", codice_fiscale: "Code fiscal", partita_iva: "N° de TVA" },
  prenotacanc: {},
  ntariffe: { idntariffe: "N°", nomecostoagg: "Nom du frais", tipo_ca: "Type de calcul", valore_ca: "Montant", valore_perc_ca: "Pourcentage", arrotonda_ca: "Arrondi", tasseperc_ca: "Taxe (%)" },
  regole: { idregole: "N° de règle", app_agenzia: "Chambres réservées à une agence", tariffa_chiusa: "Tarif fermé", iddatainizio: "Début (n° de jour)", iddatafine: "Fin (n° de jour)", iddatainizio_cle: "Début", iddatafine_cle: "Fin", motivazione: "Motif" },
  nazioni: { idnazioni: "N°", nome_nazione: "Pays", codice_nazione: "Code", codice2_nazione: "Code 2", codice3_nazione: "Code 3" },
  anni: { idanni: "Année", tipo_periodi: "Type de périodes" },
  messaggi: {},
};
FIELDS.prenotacanc = { ...FIELDS.prenota, idprenota: "N° de réservation annulée" };
const PERIOD_RATE = /^tariffa(\d+)(p?)$/;

const LIST = {
  reservations: ["idclienti", "idappartamenti", "date_arrivee", "date_depart", "nuits", "num_persone", "tariffa", "tariffa_tot", "caparra", "pagato", "conferma"],
  clients: ["cognome", "nome", "telefono", "email", "citta", "nazione"],
  chambres: ["idappartamenti", "numpiano", "maxoccupanti", "letto"],
  paiements: ["data_transazione", "metodo_pagamento", "saldo_prenota", "saldo_cassa", "motivazione"],
  frais_sejour: ["idprenota_cle", "nome", "valore", "tasseperc"],
  occupants: ["idprenota_cle", "idclienti"],
  tarifs_jour: ["datainizio", "tariffa1", "tariffa2", "tariffa3", "tariffa4"],
  reservations_annulees: ["idclienti", "idappartamenti", "date_arrivee", "date_depart", "tariffa_tot"],
  depenses_recettes: ["data_inserimento", "nome_costo", "val_costo", "tipo_costo", "metodo_pagamento"],
};
const SEARCH = { clients: ["cognome", "nome", "email", "telefono", "citta"], reservations: ["codice", "tariffa"], chambres: ["idappartamenti"] };
const TITLE = { clients: "cognome", chambres: "idappartamenti", reservations: "idprenota", pays: "nome_nazione", caisses: "nome_cassa", frais_catalogue: "nomecostoagg" };
const INDICATORS = {
  reservations: [{ label: "Réservations", kind: "count" }, { label: "Montant des séjours", kind: "sum", field: "tariffa_tot" }, { label: "Montant encaissé", kind: "sum", field: "pagato" }],
  clients: [{ label: "Clients", kind: "count" }],
  chambres: [{ label: "Chambres", kind: "count" }],
};

const humanize = (s) => {
  const t = String(s).replace(/_cle$/, "").replace(/_/g, " ").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : String(s);
};

export function hotelVocabulary(mapping) {
  const m = structuredClone(mapping);
  const rename = new Map();
  for (const e of m.entities) {
    const def = ENTITIES[e.source?.table];
    if (def) rename.set(e.name, def[0]);
  }
  const ren = (n) => rename.get(n) ?? n;
  for (const e of m.entities) {
    const table = e.source?.table;
    const def = ENTITIES[table];
    const newName = ren(e.name);
    if (def) {
      e.name = def[0];
      e.label = def[1];
      e.label_singular = def[2];
    }
    const dict = { ...COMMON, ...(FIELDS[table] ?? {}) };
    const present = new Set(e.fields.map((f) => f.name));
    for (const f of e.fields) {
      const src = String(f.source);
      const rate = PERIOD_RATE.exec(src);
      f.label = (dict[src] ?? (rate ? `Tarif ${rate[1]}${rate[2] ? " par personne" : ""}` : f.label ?? humanize(src))).slice(0, 80);
      if (f.references) f.references = ren(f.references);
    }
    if (e.line_of?.entity) e.line_of.entity = ren(e.line_of.entity);
    if (e.classification?.parent) e.classification.parent = ren(e.classification.parent);
    for (const a of e.aggregates ?? []) if (a.children) a.children = ren(a.children);
    const bySource = new Map(e.fields.map((f) => [String(f.source), f.name]));
    const pick = (cols) => (cols ?? []).map((c) => bySource.get(c)).filter((n) => n && present.has(n));
    e.ui = { ...(e.ui ?? {}) };
    if (HIDDEN.has(newName)) e.ui.nav = false;
    const list = pick(LIST[newName]);
    if (list.length) e.ui.list_fields = list;
    const search = pick(SEARCH[newName]);
    if (search.length) e.ui.search_fields = search;
    const title = pick([TITLE[newName]])[0];
    if (title) e.title_field = title;
    const ind = (INDICATORS[newName] ?? []).map((i) => (i.field ? { ...i, field: bySource.get(i.field) } : i)).filter((i) => !("field" in i) || i.field);
    if (ind.length) e.ui.indicators = ind;
  }
  m.entities.sort((a, b) => {
    const ia = ORDER.indexOf(a.name), ib = ORDER.indexOf(b.name);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
  m.notes = `${m.notes ? m.notes + " · " : ""}Vocabulaire hôtelier appliqué par l'Analyste REBORN (libellés français, modules d'hôtel) ; sources, clés, types et protections inchangés.`.slice(0, 2000);
  return m;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const project = args[args.indexOf("--project") + 1];
  const publish = args.includes("--publish");
  const base = (process.env.REBORN_URL ?? "").replace(/\/$/, "");
  const token = process.env.REBORN_ANALYST_TOKEN;
  if (!/^MIG_[a-f0-9]{8}$/.test(project ?? "") || !base || !token) {
    console.error("usage : REBORN_URL=… REBORN_ANALYST_TOKEN=… node scripts/hotel-vocabulary.mjs --project MIG_x [--publish]");
    process.exit(2);
  }
  const H = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  const cur = await fetch(`${base}/api/migration/mapping?project=${project}`, { headers: H });
  const body = await cur.json();
  const mapping = body.current?.mapping ?? body.mapping;
  if (!cur.ok || !mapping?.entities) {
    console.error(`Correspondances illisibles (HTTP ${cur.status}) : ${JSON.stringify(body).slice(0, 300)}`);
    process.exit(1);
  }
  const out = hotelVocabulary(mapping);
  console.log(`Vocabulaire : ${out.entities.map((e) => `${e.label}${e.ui?.nav === false ? " (masqué)" : ""}`).join(", ")}`);
  if (!publish) process.exit(0);
  const r = await fetch(`${base}/api/migration/mapping?project=${project}&source=analyst`, { method: "POST", headers: H, body: JSON.stringify(out) });
  const res = await r.json();
  console.log(`Envoi par l'Analyste : HTTP ${r.status} · version ${res.version ?? res.current?.version ?? "?"} · ${(res.issues ?? []).length} problème(s) · ${res.review?.pending ?? res.review?.items?.length ?? "?"} point(s) à valider`);
  for (const i of (res.issues ?? []).slice(0, 10)) console.log(`  - ${i.level} ${i.path ?? ""} ${i.message}`);
  if (!r.ok) process.exit(1);
}

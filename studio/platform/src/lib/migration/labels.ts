/**
 * Libellés lisibles pour le nouveau logiciel, déduits des noms techniques de l'ancien
 * (« quote_lines » → « Lignes de devis », « TOTAL_HT » → « Total HT », « DATE_CREA » → « Date de
 * création »). Glossaire des termes métier courants (anglais et abréviations françaises des
 * anciens logiciels). Un terme inconnu est gardé tel quel : rien n'est inventé ; l'Analyste ou
 * l'opérateur peut toujours fournir ses propres libellés dans les correspondances.
 */

/** Expressions complètes (prioritaires), en minuscules, mots séparés par « _ ». */
const PHRASES: Record<string, string> = {
  contact_name: "nom du contact",
  first_name: "prénom",
  last_name: "nom",
  company_name: "raison sociale",
  raison_soc: "raison sociale",
  raison_sociale: "raison sociale",
  created_on: "date de création",
  created_at: "date de création",
  creation_date: "date de création",
  date_crea: "date de création",
  updated_at: "date de modification",
  date_mod: "date de modification",
  unit_price: "prix unitaire",
  prix_unit: "prix unitaire",
  pu_ht: "prix unitaire HT",
  vat_rate: "taux de TVA",
  taux_tva: "taux de TVA",
  vat_amount: "montant de TVA",
  total_excl_tax: "total HT",
  total_incl_tax: "total TTC",
  amount_excl_tax: "montant HT",
  amount_incl_tax: "montant TTC",
  line_total: "montant de la ligne",
  quote_number: "numéro de devis",
  quote_date: "date du devis",
  invoice_number: "numéro de facture",
  invoice_date: "date de facture",
  due_date: "date d'échéance",
  date_ech: "date d'échéance",
  order_number: "numéro de commande",
  order_date: "date de commande",
  postal_code: "code postal",
  zip_code: "code postal",
  quote_lines: "lignes de devis",
  quote_line: "ligne de devis",
  invoice_lines: "lignes de facture",
  invoice_line: "ligne de facture",
  order_lines: "lignes de commande",
  order_line: "ligne de commande",
  devis_lignes: "lignes de devis",
  factures_lignes: "lignes de facture",
  payment_status: "statut de paiement",
  statut_pai: "statut de paiement",
  cat_cli: "catégorie",
  code_cli: "code client",
  num_fac: "numéro de facture",
  num_dev: "numéro de devis",
  remise_pct: "remise (%)",
  discount_rate: "remise (%)",
};

/** Mots isolés. */
const WORDS: Record<string, string> = {
  customer: "client",
  customers: "clients",
  client: "client",
  clients: "clients",
  cli: "client",
  company: "société",
  soc: "société",
  contact: "contact",
  lead: "prospect",
  leads: "prospects",
  prospect: "prospect",
  prospects: "prospects",
  product: "produit",
  products: "produits",
  item: "article",
  items: "articles",
  art: "article",
  sku: "référence",
  ref: "référence",
  label: "libellé",
  designation: "désignation",
  quote: "devis",
  quotes: "devis",
  dev: "devis",
  invoice: "facture",
  invoices: "factures",
  fac: "facture",
  order: "commande",
  orders: "commandes",
  payment: "règlement",
  payments: "règlements",
  pai: "paiement",
  supplier: "fournisseur",
  suppliers: "fournisseurs",
  line: "ligne",
  lines: "lignes",
  lig: "ligne",
  quantity: "quantité",
  qty: "quantité",
  qte: "quantité",
  price: "prix",
  amount: "montant",
  total: "total",
  vat: "TVA",
  tva: "TVA",
  ht: "HT",
  ttc: "TTC",
  tax: "taxe",
  discount: "remise",
  remise: "remise",
  pct: "(%)",
  rate: "taux",
  status: "statut",
  state: "état",
  stage: "étape",
  source: "origine",
  segment: "segment",
  category: "catégorie",
  cat: "catégorie",
  email: "e-mail",
  mail: "e-mail",
  phone: "téléphone",
  tel: "téléphone",
  mobile: "mobile",
  address: "adresse",
  adr: "adresse",
  city: "ville",
  ville: "ville",
  country: "pays",
  zip: "code postal",
  cp: "code postal",
  name: "nom",
  nom: "nom",
  date: "date",
  number: "numéro",
  num: "numéro",
  no: "numéro",
  code: "code",
  id: "identifiant",
  notes: "notes",
  note: "note",
  comment: "commentaire",
  description: "description",
  active: "actif",
  actif: "actif",
  paid: "payée",
  due: "échéance",
  ech: "échéance",
  crea: "création",
  mod: "modification",
  user: "utilisateur",
  users: "utilisateurs",
  employee: "salarié",
  activity: "activité",
  activities: "activités",
  document: "document",
  documents: "documents",
  file: "fichier",
  files: "fichiers",
  stock: "stock",
  family: "famille",
  famille: "famille",
};

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** « T_CLIENT » → « client », « quoteLines » → « quote_lines ». */
function tokens(raw: string): string {
  return raw
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^t_/, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function humanLabel(raw: string): string {
  const t = tokens(raw);
  if (!t) return raw;
  if (PHRASES[t]) return cap(PHRASES[t]);
  const parts = t.split("_");
  // Plus longue expression connue en tête, puis mot à mot
  for (let n = parts.length - 1; n >= 2; n--) {
    const head = parts.slice(0, n).join("_");
    if (PHRASES[head]) return cap([PHRASES[head], ...parts.slice(n).map((w) => WORDS[w] ?? w)].join(" "));
  }
  return cap(parts.map((w) => WORDS[w] ?? w).join(" "));
}

/** Singulier d'un libellé d'entité (« Lignes de devis » → « Ligne de devis », « Clients » → « Client »). */
export function singularLabel(plural: string): string {
  const [first, ...rest] = plural.split(" ");
  const one = /(s|x)$/i.test(first) && !/^devis$/i.test(first) ? first.replace(/(s|x)$/i, "") : first;
  return [one, ...rest].join(" ");
}

/** Colonne d'indicateur oui/non d'après son nom (valeurs 0/1). */
export const FLAG_NAME = /^(is|has|est|a)_|(^|_)(active|actif|paid|paye|payee|enabled|archived|archive|deleted|supprime|valid|valide|closed|clos|blocked|bloque)$/i;

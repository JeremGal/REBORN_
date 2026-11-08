// Fonctions pures de l'interface du logiciel livré (aucun accès au DOM ni au réseau) : valeurs affichées,
// groupes de champs des formulaires et des fiches, colonnes des listes, titres, calendrier et disposition du
// planning. Utilisées par app.js et vérifiées par les tests du Studio. Rien n'est propre à un métier : tout
// vient de la spécification (app.json) transmise par /api/meta.

export const LOCALE = "fr-FR";

/* Valeurs ---------------------------------------------------------------- */
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const empty = (v) => v === null || v === undefined || v === "";
export const int = (n) => Number(n ?? 0).toLocaleString(LOCALE);
export const nb = (n) => Number(n).toLocaleString(LOCALE, { maximumFractionDigits: 4 });
/** Entier sans séparateur de milliers : numéros, années, codes (« 2024 », pas « 2 024 »). */
export const whole = (n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString(LOCALE, { maximumFractionDigits: 0, useGrouping: false }) : String(n));
/** Montant stocké en centimes entiers → « 1 234,56 € ». */
export const moneyOf = (c, currency = "EUR") => (empty(c) ? "—" : (Number(c) / 100).toLocaleString(LOCALE, { style: "currency", currency }));
export const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** « 2026-03-12 » → « 12/03/2026 » (le reste d'une date et heure est ignoré). */
export const dateFr = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s ?? ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s ? String(s) : "—";
};

/**
 * Listes à deux valeurs qui signifient oui / non (S/N, O/N, Y/N, 1/0…) et que la spécification n'a pas
 * libellées : affichées « Oui » / « Non ». Un libellé déclaré dans les options l'emporte toujours.
 */
const YES_NO = [
  ["s", "n"],
  ["o", "n"],
  ["y", "n"],
  ["j", "n"],
  ["1", "0"],
  ["oui", "non"],
  ["si", "no"],
  ["sì", "no"],
  ["yes", "no"],
  ["true", "false"],
  ["vrai", "faux"],
];
export function yesNo(f) {
  const opts = f?.type === "enum" ? (f.options ?? []) : [];
  if (opts.length !== 2 || opts.some((o) => o.label)) return null;
  const vals = opts.map((o) => String(o.value));
  for (const [y, n] of YES_NO) {
    const yes = vals.find((v) => v.trim().toLowerCase() === y);
    const no = vals.find((v) => v.trim().toLowerCase() === n);
    if (yes !== undefined && no !== undefined) return { yes, no };
  }
  return null;
}
export function optionLabel(f, v) {
  const o = f?.options?.find((x) => x.value === v);
  if (o?.label) return o.label;
  const yn = yesNo(f);
  if (yn && v === yn.yes) return "Oui";
  if (yn && v === yn.no) return "Non";
  return v;
}

/** Valeur affichée en texte brut (titres, résumés, journal). `refTitle` : titre de la fiche liée. */
export function plainOf(f, v, refTitle, currency = "EUR") {
  if (empty(v)) return "—";
  switch (f?.type) {
    case "money":
      return moneyOf(v, currency);
    case "date":
      return dateFr(v);
    case "boolean":
      return v ? "Oui" : "Non";
    case "enum":
      return String(optionLabel(f, v));
    case "percent":
      return `${nb(v)} %`;
    case "decimal":
      return nb(v);
    case "integer":
      return whole(v);
    case "reference":
      return refTitle ?? `#${v}`;
    default:
      // Une date AAAA-MM-JJ conservée en texte est lue à la française, sans être modifiée en base
      return ISO_DATE.test(String(v)) ? dateFr(v) : String(v);
  }
}
/** Valeur affichée (HTML échappé) : références en liens vers la fiche liée, nombres alignés. */
export function formatOf(f, v, refTitle, currency = "EUR") {
  if (empty(v)) return '<span class="muted">—</span>';
  switch (f?.type) {
    case "money":
    case "date":
    case "percent":
    case "decimal":
    case "integer":
      return `<span class="num">${esc(plainOf(f, v, refTitle, currency))}</span>`;
    case "boolean":
    case "enum":
      return esc(plainOf(f, v, refTitle, currency));
    case "reference":
      return `<a href="#/e/${esc(f.references)}/${esc(v)}">${esc(refTitle ?? `#${v}`)}</a>`;
    case "email":
      return `<a href="mailto:${esc(v)}">${esc(v)}</a>`;
    case "phone":
      return `<a href="tel:${esc(String(v).replace(/[^\d+]/g, ""))}">${esc(v)}</a>`;
    default:
      return ISO_DATE.test(String(v)) ? `<span class="num">${esc(dateFr(v))}</span>` : esc(v);
  }
}

/* Champs : formulaires simples, colonnes, enregistrements liés ------------------- */
export const fieldNamed = (e, n) => (n ? (e?.fields?.find((f) => f.name === n) ?? null) : null);

/**
 * Répartition des champs d'une entité : `essential` (form_fields dans leur ordre, plus tout champ obligatoire :
 * un champ requis n'est jamais caché), `more` (les autres, sous « Informations complémentaires »), `technical`
 * (jamais dans un formulaire ; « Données d'origine » de la fiche). Sans form_fields : tous les champs non
 * techniques sont essentiels, comme avant.
 */
export function fieldGroups(e) {
  const fields = e?.fields ?? [];
  const tech = new Set(e?.technical_fields ?? []);
  const technical = fields.filter((f) => tech.has(f.name));
  const visible = fields.filter((f) => !tech.has(f.name));
  const wanted = [];
  for (const n of e?.form_fields ?? []) {
    const f = visible.find((x) => x.name === n);
    if (f && !wanted.includes(f)) wanted.push(f);
  }
  if (!wanted.length) return { essential: visible, more: [], technical, declared: false };
  const essential = [...wanted, ...visible.filter((f) => f.required && !wanted.includes(f))];
  return { essential, more: visible.filter((f) => !essential.includes(f)), technical, declared: true };
}

/** Colonnes d'un tableau : champs nommés existants, jamais techniques ni exclus ; à défaut, le champ titre. */
export function listColumns(e, names = e?.list_fields ?? [], { exclude = [], max = Infinity } = {}) {
  const tech = new Set(e?.technical_fields ?? []);
  const out = [];
  for (const n of names) {
    const f = fieldNamed(e, n);
    if (f && !tech.has(n) && !exclude.includes(n) && !out.includes(f)) out.push(f);
  }
  if (!out.length) {
    const t = fieldNamed(e, e?.title_field);
    if (t && !exclude.includes(t.name)) out.push(t);
  }
  return out.slice(0, max);
}

/**
 * Colonnes des enregistrements liés à une fiche (entité `ce` rattachée par `via`) : pour une entité dessinée
 * dans un planning, le début, la fin, la ressource et le titre d'abord ; puis ses colonnes de liste. Le champ
 * qui pointe vers la fiche ouverte n'est jamais répété. La première colonne porte le lien vers l'enregistrement
 * lié lui-même : ce n'est pas une référence quand une autre colonne s'y prête (une référence garde son propre
 * lien vers sa fiche).
 */
export function relatedColumns(ce, via, views = [], max = 6) {
  const v = views.find((x) => x.entity === ce?.name);
  const lead = v ? [v.start, v.end, v.resource, v.title].filter(Boolean) : [];
  const cols = listColumns(ce, [...lead, ...(ce?.list_fields ?? [])], { exclude: [via], max });
  const own = cols.findIndex((f) => f.type !== "reference");
  return own > 0 ? [cols[own], ...cols.filter((_, i) => i !== own)] : cols;
}

/* Titres ------------------------------------------------------------------ */
/** Texte réduit à un numéro ou à un code numérique (« 15 », « 2024:15 », « #3 ») : peu parlant seul. */
export const numericLike = (s) => /^[\s#\d.,:/_-]+$/.test(String(s ?? ""));
export const rangeLabel = (s, e) => (s && e && e !== s ? `du ${dateFr(s)} au ${dateFr(e)}` : s ? `le ${dateFr(s)}` : "");

/**
 * Titre d'un enregistrement dans une liste, un choix ou une référence. Champ titre ; s'il est vide ou n'est
 * qu'un numéro et que l'entité est dessinée dans un planning : « titre lié · ressource · du … au … » ; sinon la
 * clé de l'ancien logiciel ; en dernier recours « Libellé #id ». Le serveur applique la même règle aux références.
 */
export function titleOf(e, row, views = [], currency = "EUR") {
  const tf = fieldNamed(e, e?.title_field);
  const raw = tf ? row?.[tf.name] : null;
  const t = empty(raw) ? "" : plainOf(tf, raw, row?._refs?.[tf.name], currency);
  const v = views.find((x) => x.entity === e?.name);
  if (v && !empty(row?.[v.start]) && (!t || numericLike(t))) {
    const wf = fieldNamed(e, v.title);
    const who = wf && !empty(row[wf.name]) ? plainOf(wf, row[wf.name], row._refs?.[wf.name], currency) : "";
    const where = empty(row[v.resource]) ? "" : (row._refs?.[v.resource] ?? `#${row[v.resource]}`);
    return [who, where, rangeLabel(row[v.start], row[v.end])].filter(Boolean).join(" · ");
  }
  if (t) return t;
  if (!empty(row?._source_key)) return String(row._source_key);
  return `${e?.label_singular ?? e?.label ?? ""} #${row?.id ?? "?"}`.trim();
}
/** Titre d'une page (fiche, formulaire) : un simple numéro est précédé du nom de l'entité (« Chambre 12 »). */
export function headingOf(e, row, currency = "EUR") {
  const tf = fieldNamed(e, e?.title_field);
  const t = tf && !empty(row?.[tf.name]) ? plainOf(tf, row[tf.name], row?._refs?.[tf.name], currency) : !empty(row?._source_key) ? String(row._source_key) : "";
  const label = e?.label_singular ?? e?.label ?? "";
  if (!t) return `${label} #${row?.id ?? "?"}`.trim();
  return numericLike(t) ? `${label} ${t.replace(/^#\s*/, "n° ")}`.trim() : t;
}

/* Calendrier (dates AAAA-MM-JJ, calculs en UTC : aucun décalage d'heure d'été) ---------- */
export const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
export const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
export const WEEKDAY_SHORT = ["D", "L", "M", "M", "J", "V", "S"];
const utc = (iso) => {
  const m = ISO_DATE.exec(String(iso ?? ""));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN;
};
export const validIso = (s) => {
  const t = utc(s);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;
};
export const addDays = (iso, n) => new Date(utc(iso) + n * 86400e3).toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((utc(b) - utc(a)) / 86400e3);
/** Date du jour de l'appareil (et non UTC) : « aujourd'hui » est celui de la personne. */
export const localIso = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** « 2026-03 » → { ym, from, to, days, label : « mars 2026 » } ; null si le mois est illisible. */
export function monthOf(ym) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym ?? "").trim());
  if (!m || +m[2] < 1 || +m[2] > 12 || +m[1] < 1900 || +m[1] > 2999) return null;
  const from = `${m[1]}-${m[2]}-01`;
  const to = addDays(new Date(Date.UTC(+m[1], +m[2], 1)).toISOString().slice(0, 10), -1);
  return { ym: `${m[1]}-${m[2]}`, from, to, days: daysBetween(from, to) + 1, label: `${MONTHS[+m[2] - 1]} ${m[1]}` };
}
export const shiftMonth = (ym, n) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
export const dayLabel = (iso) => {
  const d = new Date(utc(iso));
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

/* Planning ------------------------------------------------------------------- */
/**
 * Disposition d'un mois de planning. Entrée : réponse de GET /api/views/<nom> (ressources triées, éléments
 * { id, start, end, resource, title, status }) et la période [from, to] (jours inclus). Chaque élément devient
 * une barre de son début (inclus) à sa fin (exclue), coupée aux bords de la période (`before` / `after`) ; une
 * fin absente ou antérieure au début compte pour un jour. Deux éléments qui se chevauchent sur une même
 * ressource sont placés sur deux lignes (aucune barre masquée). Les éléments sans ressource connue sont
 * regroupés sur une dernière ligne (resource: null).
 */
export function planningLayout(data, from, to, today = null) {
  const n = daysBetween(from, to) + 1;
  const stopAll = addDays(to, 1);
  const days = Array.from({ length: n }, (_, i) => {
    const iso = addDays(from, i);
    const dow = new Date(utc(iso)).getUTCDay();
    return { iso, day: Number(iso.slice(8)), dow, weekend: dow === 0 || dow === 6, today: iso === today };
  });
  const byResource = new Map((data.resources ?? []).map((r) => [r.id, []]));
  const loose = [];
  for (const it of data.items ?? []) {
    if (!validIso(it.start)) continue;
    const stop = validIso(it.end) && it.end > it.start ? it.end : addDays(it.start, 1);
    if (stop <= from || it.start >= stopAll) continue;
    const s = it.start < from ? from : it.start;
    const e = stop > stopAll ? stopAll : stop;
    const seg = { item: it, col: daysBetween(from, s), span: Math.max(1, daysBetween(s, e)), before: it.start < from, after: stop > stopAll };
    (byResource.get(it.resource) ?? loose).push(seg);
  }
  const lanes = (segs = []) => {
    const out = [];
    for (const s of [...segs].sort((a, b) => a.col - b.col || b.span - a.span || String(a.item.id).localeCompare(String(b.item.id)))) {
      const lane = out.find((l) => l.end <= s.col);
      if (lane) {
        lane.segs.push(s);
        lane.end = s.col + s.span;
      } else out.push({ end: s.col + s.span, segs: [s] });
    }
    return out.length ? out.map((l) => l.segs) : [[]];
  };
  const rows = (data.resources ?? []).map((r) => ({ resource: r, lanes: lanes(byResource.get(r.id)) }));
  if (loose.length) rows.push({ resource: null, lanes: lanes(loose) });
  // Occupation : couples (ressource, jour) couverts, sans double compte en cas de chevauchement
  let used = 0;
  for (const row of rows) {
    if (!row.resource) continue;
    const covered = new Set();
    for (const lane of row.lanes) for (const s of lane) for (let d = s.col; d < s.col + s.span; d++) covered.add(d);
    used += covered.size;
  }
  return { days, rows, used, capacity: (data.resources ?? []).length * n, count: rows.reduce((k, r) => k + r.lanes.reduce((x, l) => x + l.length, 0), 0) };
}

/**
 * Liens des cartes « Aujourd'hui » d'un planning : listes filtrées par le serveur (plages de dates), et le
 * planning lui-même pour l'occupation. En cours = commencé au plus tard aujourd'hui, fin (exclue) après aujourd'hui.
 */
export function todayLinks(v, day) {
  const k = (s) => encodeURIComponent(s);
  return {
    arrivals: `#/e/${v.entity}?${k(`${v.start}.from`)}=${day}&${k(`${v.start}.to`)}=${day}`,
    departures: `#/e/${v.entity}?${k(`${v.end}.from`)}=${day}&${k(`${v.end}.to`)}=${day}`,
    current: `#/e/${v.entity}?${k(`${v.start}.to`)}=${day}&${k(`${v.end}.from`)}=${addDays(day, 1)}`,
    planning: `#/vue/${v.name}`,
  };
}

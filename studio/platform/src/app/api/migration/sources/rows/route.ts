import { z } from "zod";
import { loadSources } from "@/lib/migration/project";
import type { RawValue } from "@/lib/migration/formats";
import { ApiError, handler, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/*
 * Lecture paginée des lignes d'une table lue dans les sources du projet (étape « Données »).
 * Lecture seule : rien n'est modifié, ni dans le coffre ni dans le projet. Recherche, filtre et
 * tri sont faits ICI : le navigateur ne reçoit jamais qu'une page (100 lignes au plus), jamais
 * le fichier entier. Les valeurs sont renvoyées telles que lues (aucune conversion).
 *
 *   GET ?project=MIG_…&table=clients[&page=1][&per=25][&q=texte][&sort=COLONNE&dir=asc|desc]
 *       [&col=COLONNE&op=empty|filled|equals|contains[&value=…]]
 *   GET ?project=MIG_…&table=clients&row=17   → une ligne complète (inspection des valeurs)
 */

/** Nombre maximal de lignes par page. */
const MAX_PER = 100;
/** Longueur maximale d'une valeur dans une page (au-delà : tronquée et signalée). */
const CELL_MAX = 300;
/** Longueur maximale d'une valeur à l'inspection d'une ligne. */
const VALUE_MAX = 100_000;

const Query = z
  .object({
    table: z.string({ error: "Paramètre table requis" }).min(1, "Paramètre table requis").max(200),
    page: z.coerce.number().int("page doit être un entier").min(1, "page doit être supérieure ou égale à 1").max(1_000_000).default(1),
    per: z.coerce.number().int("per doit être un entier").min(1, `per doit être compris entre 1 et ${MAX_PER}`).max(MAX_PER, `per doit être compris entre 1 et ${MAX_PER}`).default(25),
    q: z.string().max(200, "Recherche limitée à 200 caractères").optional(),
    sort: z.string().min(1).max(200).optional(),
    dir: z.enum(["asc", "desc"], { error: "dir vaut asc ou desc" }).default("asc"),
    col: z.string().min(1).max(200).optional(),
    op: z.enum(["empty", "filled", "equals", "contains"], { error: "op vaut empty, filled, equals ou contains" }).optional(),
    value: z.string().max(200, "Valeur de filtre limitée à 200 caractères").optional(),
    row: z.coerce.number().int("row doit être un entier").min(1, "row doit être supérieure ou égale à 1").optional(),
  })
  .strict();

type Query = z.output<typeof Query>;

const isBlank = (v: RawValue | undefined) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

/** Forme comparable d'un texte : sans accents, sans casse. */
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const text = (v: RawValue | undefined) => (v === null || v === undefined ? "" : String(v));

/* ------------------------------------------------------------------ */
/* Tri : nombres (virgule ou point décimal), dates, puis texte          */
/* ------------------------------------------------------------------ */

const collator = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });

/** Nombre lu dans un texte (« 1 234,50 », « 99.9 », « 12 % », « 15 € ») ; null sinon. */
function asNumber(s: string): number | null {
  const t = s.replace(/[\s  ]/g, "").replace(/(€|eur|%)$/i, "");
  if (/^[+-]?\d+(?:[.,]\d+)?$/.test(t)) return Number(t.replace(",", "."));
  if (/^[+-]?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(t)) return Number(t.replace(/\./g, "").replace(",", "."));
  if (/^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(t)) return Number(t.replace(/,/g, ""));
  return null;
}

/** Date JJ/MM/AAAA ou AAAA-MM-JJ (heure facultative) → nombre croissant avec le temps ; null sinon. */
function asDate(s: string): number | null {
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  let y: number, mo: number, d: number, h = 0, mi = 0, se = 0;
  if (m) [y, mo, d, h, mi, se] = [Number(m[3]), Number(m[2]), Number(m[1]), Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0)];
  else {
    m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
    if (!m) return null;
    [y, mo, d, h, mi, se] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0)];
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return ((((y * 100 + mo) * 100 + d) * 100 + h) * 100 + mi) * 100 + se;
}

type SortKey = { rank: 0 | 1 | 2; num?: number; str?: string } | null;

function sortKey(v: RawValue | undefined): SortKey {
  if (isBlank(v)) return null;
  if (typeof v === "number") return Number.isFinite(v) ? { rank: 0, num: v } : { rank: 2, str: String(v) };
  const s = text(v).trim();
  const n = asNumber(s);
  if (n !== null && Number.isFinite(n)) return { rank: 0, num: n };
  const d = asDate(s);
  if (d !== null) return { rank: 1, num: d };
  return { rank: 2, str: s };
}

function compareKeys(a: NonNullable<SortKey>, b: NonNullable<SortKey>): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  if (a.rank === 2) return collator.compare(a.str ?? "", b.str ?? "");
  return (a.num ?? 0) - (b.num ?? 0);
}

/* ------------------------------------------------------------------ */

function columnIndex(columns: string[], name: string, what: string): number {
  const i = columns.indexOf(name);
  if (i < 0) throw new ApiError(400, `${what} : colonne inconnue dans cette table`);
  return i;
}

/** Valeur bornée en longueur (texte seulement) ; `cut` signale une valeur tronquée. */
function bounded(v: RawValue | undefined, max: number): { v: RawValue; cut: boolean } {
  if (v === undefined) return { v: null, cut: false };
  if (typeof v === "string" && v.length > max) return { v: v.slice(0, max), cut: true };
  return { v, cut: false };
}

function rowOut(n: number, values: RawValue[], width: number, max: number) {
  const truncated: number[] = [];
  const out: RawValue[] = [];
  for (let c = 0; c < width; c++) {
    const b = bounded(values[c], max);
    if (b.cut) truncated.push(c);
    out.push(b.v);
  }
  return truncated.length ? { n, values: out, truncated } : { n, values: out };
}

function readQuery(req: Request): Query {
  const params = new URL(req.url).searchParams;
  const raw: Record<string, string> = {};
  for (const [k, v] of params) if (k !== "project" && !(k in raw)) raw[k] = v;
  const parsed = Query.safeParse(raw);
  if (!parsed.success) throw new ApiError(400, "Paramètres de lecture invalides", parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  return parsed.data;
}

export const GET = handler(
  async (req) => {
    const qy = readQuery(req);
    const t = loadSources().tables.get(qy.table);
    if (!t) throw new ApiError(404, "Table introuvable dans les sources du projet");
    const width = t.columns.length;
    const base = { ok: true, table: qy.table, file: t.file, columns: t.columns, total: t.rows.length };

    // Inspection d'une ligne : valeurs complètes (bornées à VALUE_MAX caractères chacune)
    if (qy.row !== undefined) {
      const values = t.rows[qy.row - 1];
      if (!values) throw new ApiError(404, "Ligne introuvable dans cette table");
      return json({ ...base, row: rowOut(qy.row, values, width, VALUE_MAX) });
    }

    // Filtre de colonne
    if ((qy.col === undefined) !== (qy.op === undefined)) throw new ApiError(400, "Filtre incomplet : col et op vont ensemble");
    if ((qy.op === "equals" || qy.op === "contains") && (qy.value === undefined || qy.value.trim() === "")) throw new ApiError(400, "Filtre incomplet : précisez la valeur recherchée");
    const fc = qy.col !== undefined ? columnIndex(t.columns, qy.col, "Filtre") : -1;
    const fv = qy.value !== undefined ? fold(qy.value.trim()) : "";
    const keep = (r: RawValue[]): boolean => {
      if (fc < 0) return true;
      const v = r[fc];
      switch (qy.op) {
        case "empty":
          return isBlank(v);
        case "filled":
          return !isBlank(v);
        case "equals":
          return !isBlank(v) && fold(text(v).trim()) === fv;
        case "contains":
          return fold(text(v)).includes(fv);
        default:
          return true;
      }
    };

    // Recherche dans toutes les colonnes
    const q = qy.q?.trim() ? fold(qy.q.trim()) : null;
    const found = (r: RawValue[]): boolean => {
      if (!q) return true;
      for (let c = 0; c < width; c++) {
        const v = r[c];
        if (v !== null && v !== undefined && fold(text(v)).includes(q)) return true;
      }
      return false;
    };

    let idx: number[] = [];
    t.rows.forEach((r, i) => {
      if (keep(r) && found(r)) idx.push(i);
    });

    // Tri (valeurs vides toujours en dernier ; ordre d'origine en cas d'égalité)
    let sort: { column: string; dir: "asc" | "desc" } | null = null;
    if (qy.sort !== undefined) {
      const sc = columnIndex(t.columns, qy.sort, "Tri");
      sort = { column: qy.sort, dir: qy.dir };
      const sign = qy.dir === "desc" ? -1 : 1;
      const keys = new Map<number, SortKey>(idx.map((i) => [i, sortKey(t.rows[i][sc])]));
      idx = idx.sort((a, b) => {
        const ka = keys.get(a)!;
        const kb = keys.get(b)!;
        if (!ka || !kb) return ka === kb ? a - b : ka ? -1 : 1;
        return compareKeys(ka, kb) * sign || a - b;
      });
    }

    const matched = idx.length;
    const pages = Math.max(1, Math.ceil(matched / qy.per));
    const page = Math.min(qy.page, pages);
    const slice = idx.slice((page - 1) * qy.per, page * qy.per);
    return json({
      ...base,
      matched,
      page,
      per: qy.per,
      pages,
      q: q ? qy.q!.trim() : null,
      sort,
      filter: fc >= 0 ? { column: qy.col, op: qy.op, ...(qy.value !== undefined && (qy.op === "equals" || qy.op === "contains") ? { value: qy.value.trim() } : {}) } : null,
      rows: slice.map((i) => rowOut(i + 1, t.rows[i], width, CELL_MAX)),
    });
  },
  { access: ["owner", "analyst"], project: "query" },
);

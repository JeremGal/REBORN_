/*
 * Formats d'affichage (français). Fonctions pures, sans « use client ».
 * Règle REBORN : un pourcentage n'est jamais arrondi à 100 % (ni à 0 %) s'il ne l'est pas.
 */

/**
 * Intl (fr-FR) sépare les milliers par une espace fine insécable (U+202F) : en Instrument Sans à 14 px elle
 * mesure 1,4 px, si bien que « 21 065 » se lit « 21065 ». Elle est remplacée par l'espace insécable ordinaire
 * (U+00A0), lisible et toujours insécable. Seul l'affichage change, jamais la valeur.
 */
export const readableSpaces = (s: string): string => s.replace(/\u202f/g, "\u00a0");

/** Nombre au format français, milliers séparés par une espace lisible : 21 065 ; 1 234,5. « — » si non fini. */
export function formatNumber(n: number, options?: Intl.NumberFormatOptions): string {
  return Number.isFinite(n) ? readableSpaces(n.toLocaleString("fr-FR", options)) : "—";
}

/** Nombre entier (compteur) : formatNumber sans options. Nom unique pour tous les compteurs du Studio. */
export const formatInt = (n: number): string => formatNumber(n);

const nf = (digits: number) => ({ format: (v: number) => formatNumber(v, { maximumFractionDigits: digits, minimumFractionDigits: 0 }) });

/**
 * Accord des « (s) » dans les messages du serveur avec le nombre qui les précède, à l'affichage seulement
 * (V13) : « 2 ligne(s) de clients non migrée(s) » → « 2 lignes de clients non migrées » ; « 0 ligne(s) » →
 * « 0 ligne » (en français, 0 et 1 restent au singulier). Sans nombre avant, « (s) » est laissé tel quel.
 */
export function agreePlurals(text: string): string {
  if (!text.includes("(s)")) return text;
  let n: number | null = null;
  return text.replace(/(\d+(?:[ \u00a0\u202f]\d{3})*(?:,\d+)?)|([\p{L}'’-]+)\(s\)/gu, (m: string, num: string | undefined, word: string | undefined) => {
    if (num !== undefined) {
      n = Number(num.replace(/[ \u00a0\u202f]/g, "").replace(",", "."));
      return m;
    }
    if (n === null || word === undefined) return m;
    return Math.abs(n) >= 2 ? `${word}s` : word;
  });
}

const validDate = (iso: string | null | undefined): Date | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Date et heure, format unique du Studio : « 8 nov. 2026, 02:09 ». « — » si absente ou illisible. */
export function formatDateTime(iso: string | null | undefined): string {
  const d = validDate(iso);
  return d ? `${formatDay(iso)}, ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : "—";
}

/** Date seule, même format : « 8 nov. 2026 ». */
export function formatDay(iso: string | null | undefined): string {
  const d = validDate(iso);
  return d ? d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—";
}

/**
 * Part (0..1) → « 99,96 % ». Jusqu'à `digits` décimales ; une valeur strictement entre 0 et 1
 * n'est jamais affichée « 100 % » ni « 0 % » (on tronque vers l'intérieur et on ajoute des
 * décimales au besoin, jusqu'à 4).
 */
export function formatPercent(part: number, digits = 2): string {
  if (!Number.isFinite(part)) return "—";
  const pct = part * 100;
  if (pct <= 0 || pct >= 100) return `${nf(digits).format(Math.round(pct * 10 ** digits) / 10 ** digits)} %`;
  for (let d = digits; d <= 4; d++) {
    const f = 10 ** d;
    const rounded = Math.round(pct * f) / f;
    if (rounded > 0 && rounded < 100) return `${nf(d).format(rounded)} %`;
    // arrondi au bord : on tronque vers l'intérieur
    const inward = pct > 50 ? Math.floor(pct * f) / f : Math.ceil(pct * f) / f;
    if (inward > 0 && inward < 100 && d === 4) return `${nf(d).format(inward)} %`;
  }
  return pct > 50 ? "> 99,99 %" : "< 0,01 %";
}

/** Taille de fichier lisible : « 1,2 Mo ». */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} o`;
  const units = ["Ko", "Mo", "Go"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${nf(v < 10 ? 1 : 0).format(v)} ${units[i]}`;
}

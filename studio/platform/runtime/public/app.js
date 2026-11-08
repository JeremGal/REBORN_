// Interface du logiciel livré : entièrement pilotée par /api/meta (spécification générée, app.json).
// Rien n'est propre à un métier ici : modules, libellés, champs, règles, indicateurs, vues (planning) et
// identité de l'entreprise viennent de l'API. Aucun calcul métier dans le navigateur : chaque montant affiché
// est celui que le serveur a calculé (modèle métier versionné) ou conservé (historique migré).
import {
  addDays,
  dateFr,
  dayLabel,
  daysBetween,
  empty,
  esc,
  fieldGroups,
  formatOf,
  headingOf as headingText,
  int,
  listColumns,
  localIso,
  moneyOf,
  monthOf,
  nb,
  optionLabel,
  planningLayout,
  plainOf,
  rangeLabel,
  relatedColumns,
  shiftMonth,
  titleOf as titleText,
  todayLinks,
  validIso,
  WEEKDAY_SHORT,
  yesNo,
} from "./ui-core.js";

const root = document.getElementById("root");
const live = document.getElementById("live");
let META = null;
/** Identité de l'entreprise (nom, couleur, logo), connue avant la connexion (/api/branding). */
let BRAND = null;
/** Numéro de navigation : une réponse arrivée après une navigation plus récente est ignorée. */
let NAV = 0;
/** Action à exécuter après le prochain rendu (ex. remettre le curseur dans le formulaire de ligne). */
let AFTER_RENDER = null;
/** Page rendue en dernier : en arrivant sur une autre page, le focus va sur son titre. */
let LAST_PATH = null;
let FOCUS_TITLE = false;
/** Lien d'invitation qui vient d'être créé : affiché une seule fois, puis oublié. */
let FRESH_INVITE = null;
/** Modules dont le panneau de filtres est ouvert. */
const FILTERS_OPEN = new Set();
const LOCALE = "fr-FR";
const CUR = () => META?.app?.currency ?? "EUR";
const ROLES = { admin: 3, editor: 2, viewer: 1 };
const ROLE_LABEL = { admin: "Administration", editor: "Saisie", viewer: "Lecture" };
const ROLE_HELP = {
  viewer: "consulter les données et les exporter",
  editor: "consulter, créer, modifier et joindre des fichiers",
  admin: "tout, plus les comptes, les invitations, les sauvegardes et le journal",
};
const NUMERIC = new Set(["money", "integer", "decimal", "percent"]);
const RANGE = new Set(["date", "money", "integer", "decimal", "percent"]);
const ACTIVATION_RE = /^#\/activation\/([A-Za-z0-9_-]{43})$/;
const SOURCE_LABEL = { fixture: "Jeu de test", analyst: "Analyste", investigation: "Investigation du Studio", user: "Opérateur", publication: "Publication" };
const STATUS_LABEL = { hypothesis: "Hypothèse à confirmer", validated: "Validée", observed: "Observée", confirmed: "Confirmée", rejected: "Refusée" };
const KIND_LABEL = { table: "Table", field: "Champ", entity: "Entité", workflow: "Processus", rule: "Règle", attachment: "Pièces jointes", view: "Vue" };
const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
const isMobile = () => window.matchMedia?.("(max-width: 1023px)").matches ?? false;

/* Utilitaires ---------------------------------------------------------- */
const money = (c) => moneyOf(c, CUR());
const plural = (n, one, many) => `${int(n)} ${Math.abs(Number(n)) > 1 ? many : one}`;
const cap = (s) => (s ? String(s)[0].toUpperCase() + String(s).slice(1) : "");
const lower = (s) => String(s ?? "").toLocaleLowerCase(LOCALE);
const dateTime = (s) => {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? String(s) : d.toLocaleString(LOCALE, { dateStyle: "short", timeStyle: "short" });
};
const RTF = typeof Intl.RelativeTimeFormat === "function" ? new Intl.RelativeTimeFormat("fr", { numeric: "auto" }) : null;
/** Date relative (« il y a 5 minutes ») pour les sept derniers jours, date complète au-delà. */
function ago(s) {
  const ms = new Date(s).getTime();
  if (!Number.isFinite(ms)) return String(s ?? "");
  const sec = Math.round((ms - Date.now()) / 1000);
  const abs = Math.abs(sec);
  if (!RTF || abs > 6 * 86400) return dateTime(s);
  if (abs < 45) return "à l'instant";
  if (abs < 3600) return RTF.format(Math.round(sec / 60), "minute");
  if (abs < 86400) return RTF.format(Math.round(sec / 3600), "hour");
  return RTF.format(Math.round(sec / 86400), "day");
}
const timeTag = (s) => `<time datetime="${esc(s)}" title="${esc(dateTime(s))}">${esc(ago(s))}</time>`;
/** Part d'un total, sans arrondi trompeur : jamais « 100 % » ni « 0 % » s'ils ne sont pas exacts. */
function pctLabel(n, total) {
  if (!total) return "";
  const v = (n / total) * 100;
  if (v === 100 || v === 0) return `${int(v)} %`;
  if (v > 99.9) return `${Math.min(99.99, Math.floor(v * 100) / 100).toLocaleString(LOCALE, { maximumFractionDigits: 2 })} %`;
  if (v < 0.1) return "< 0,1 %";
  return `${v.toLocaleString(LOCALE, { maximumFractionDigits: 1 })} %`;
}
const initials = (s) =>
  String(s ?? "")
    .split("@")[0]
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "?";
const entity = (name) => META.entities.find((e) => e.name === name) ?? null;
const fieldOf = (e, name) => e?.fields.find((f) => f.name === name) ?? null;
/** Vues d'ensemble valides (planning), contrôlées par le serveur. */
const views = () => META?.views ?? [];
const viewFor = (e) => views().find((v) => v.entity === e?.name) ?? null;
/** Titre d'un enregistrement (listes, choix, références) et titre de page (fiche, formulaire). */
const titleOf = (e, row) => titleText(e, row, views(), CUR());
const headingOf = (e, row) => headingText(e, row, CUR());
/** Résumé d'un enregistrement : quelques colonnes de la liste après le titre (jamais un champ technique). */
const subOf = (e, row, n = 2) =>
  listColumns(e, e.list_fields, { exclude: [e.title_field] })
    .map((f) => plain(f, row[f.name], row._refs?.[f.name]))
    .filter((v) => v !== "—")
    .slice(0, n)
    .join(" · ");

/* Icônes (tracés simples, décoratifs : toujours accompagnés d'un texte) ---------------- */
const ICONS = {
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  download: '<path d="M12 4v11m-4.5-4.5L12 15l4.5-4.5M5 20h14"/>',
  edit: '<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="m13.5 7.5 3 3"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  back: '<path d="m15 6-6 6 6 6"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a1 1 0 0 1 1-1h9"/>',
  archive: '<rect x="3.5" y="4.5" width="17" height="4" rx="1"/><path d="M5.5 8.5v10a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-10M10 12.5h4"/>',
  clip: '<path d="m20 11.5-8.2 8.2a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  alert: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17.2v.3"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.3"/>',
  calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8.5 7h7M8.5 11.5h1M14.5 11.5h1M8.5 15.5h1M14.5 15.5h1"/>',
  key: '<circle cx="8" cy="15" r="3.5"/><path d="m10.5 12.5 8-8M15.5 7.5l2.5 2.5"/>',
  logout: '<path d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h10"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4M8 14h3M8 17h6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
};
const icon = (n, cls = "") => `<svg class="ic${cls ? ` ${cls}` : ""}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[n] ?? ""}</svg>`;

/* Couleur de l'entreprise et contraste (WCAG 2.2 AA) ------------------- */
const WHITE = "#ffffff";
const INK = "#15191f";
/** Fonds clairs de l'interface (mêmes valeurs que app.css) : liens et repères doivent rester lisibles sur chacun. */
const LIGHT_BACKGROUNDS = ["#ffffff", "#f3f4f6", "#f7f8f9"];
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgbHex = (c) => `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;
function luminance(h) {
  const [r, g, b] = hexRgb(h)
    .map((v) => v / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
const mix = (a, b, t) => {
  const [x, y] = [hexRgb(a), hexRgb(b)];
  return rgbHex(x.map((v, i) => v + (y[i] - v) * t));
};
/** Couleur la plus proche de `color` (en allant vers `toward`) qui atteint le contraste voulu sur tous les fonds. */
function reach(color, backgrounds, target, toward) {
  for (let i = 0; i <= 50; i++) {
    const c = mix(color, toward, i / 50);
    if (backgrounds.every((bg) => contrast(c, bg) >= target)) return c;
  }
  return toward;
}
/**
 * Palette dérivée de la couleur de l'entreprise : texte blanc ou encre sur la couleur pleine selon le
 * meilleur contraste (si aucun n'atteint 4,5:1, la couleur est ajustée juste assez) ; liens, repères
 * et anneau de focus en version assombrie lisible (≥ 4,5:1) sur tous les fonds clairs.
 */
function brandPalette(color) {
  let solid = color;
  let ink = contrast(color, WHITE) >= contrast(color, INK) ? WHITE : INK;
  if (contrast(solid, ink) < 4.5) {
    const dark = reach(color, [WHITE], 4.5, "#000000");
    const light = reach(color, [INK], 4.5, "#ffffff");
    const dist = (c) => hexRgb(c).reduce((s, v, i) => s + (v - hexRgb(color)[i]) ** 2, 0);
    [solid, ink] = dist(dark) <= dist(light) ? [dark, WHITE] : [light, INK];
  }
  const soft = mix(color, WHITE, 0.9);
  const text = reach(color, [...LIGHT_BACKGROUNDS, soft], 4.5, "#000000");
  const hover = ink === WHITE ? mix(solid, "#000000", 0.14) : mix(solid, "#ffffff", 0.2);
  return { solid, ink, soft, text, hover, line: mix(color, WHITE, 0.55) };
}
const BRAND_VARS = ["--brand", "--brand-ink", "--brand-soft", "--brand-text", "--brand-hover", "--brand-line"];
const brandName = () => BRAND?.name || META?.app?.branding?.name || META?.app?.name || "";
function applyBranding(b) {
  if (b) BRAND = b;
  const st = document.documentElement.style;
  const color = /^#[0-9a-f]{6}$/i.test(BRAND?.primary_color ?? "") ? BRAND.primary_color.toLowerCase() : null;
  const p = color ? brandPalette(color) : null;
  if (!p) BRAND_VARS.forEach((k) => st.removeProperty(k));
  else {
    st.setProperty("--brand", p.solid);
    st.setProperty("--brand-ink", p.ink);
    st.setProperty("--brand-soft", p.soft);
    st.setProperty("--brand-text", p.text);
    st.setProperty("--brand-hover", p.hover);
    st.setProperty("--brand-line", p.line);
  }
  let link = document.querySelector('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.append(link);
  }
  if (BRAND?.logo_url?.startsWith("data:image/")) link.href = BRAND.logo_url;
  else {
    const text = String(BRAND?.logo_text || initials(brandName())).slice(0, 4);
    const fill = p?.solid ?? "#2d4f7c";
    const ink = p?.ink ?? WHITE;
    link.href = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${fill}"/><text x="32" y="41" font-family="system-ui,sans-serif" font-size="${text.length > 2 ? 20 : 26}" font-weight="700" text-anchor="middle" fill="${ink}">${esc(text)}</text></svg>`)}`;
  }
}
async function loadBranding() {
  if (BRAND) return BRAND;
  try {
    const r = await fetch("/api/branding", { credentials: "same-origin" });
    if (r.ok) applyBranding(await r.json());
  } catch {}
  return BRAND;
}
/** Pastille de l'entreprise : son logo s'il est fourni, sinon ses initiales sur sa couleur. */
function logoMark(b, size = "") {
  if (b?.logo_url) return `<img class="logo${size ? ` ${size}` : ""} logo-img" src="${esc(b.logo_url)}" alt="">`;
  const text = String(b?.logo_text || initials(b?.name || brandName())).slice(0, 4);
  return `<span class="logo${size ? ` ${size}` : ""}" aria-hidden="true">${esc(text)}</span>`;
}

/*
 * Session ouverte depuis ce navigateur (indice local, sans aucun secret) : le cookie de session est HttpOnly,
 * la page ne peut donc pas savoir seule si une session existe. Sans indice, l'écran de connexion s'affiche
 * directement, sans requête vouée au refus (401 dans la console). Avec un indice périmé, le serveur répond 401 :
 * l'écran de connexion s'affiche et l'indice est retiré. Stockage indisponible : on interroge le serveur.
 * Les sessions du logiciel vivent en mémoire de son processus : un redémarrage les ferme toutes de toute façon.
 */
const SESSION_HINT = "reborn-app-session";
function hasSessionHint() {
  try {
    return localStorage.getItem(SESSION_HINT) === "1";
  } catch {
    return true;
  }
}
function setSessionHint(on) {
  try {
    localStorage.setItem(SESSION_HINT, on ? "1" : "0");
  } catch {}
}

/* API ------------------------------------------------------------------- */
class ApiError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
const invalid = (message) => new ApiError(400, message);

async function api(method, url, body) {
  let res;
  try {
    res = await fetch(url, { method, credentials: "same-origin", headers: body !== undefined ? { "content-type": "application/json" } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError(0, "Le serveur ne répond pas : vérifiez que le logiciel est en service, puis réessayez.");
  }
  const type = res.headers.get("content-type") ?? "";
  const data = type.includes("json") ? await res.json().catch(() => null) : await res.text();
  if (res.status === 401 && !url.startsWith("/api/auth/")) {
    const had = !!META;
    META = null;
    setSessionHint(false);
    renderLogin(had ? "Votre session a pris fin : reconnectez-vous pour continuer." : "");
    const x = new ApiError(401, "Connexion requise");
    x.handled = true;
    throw x;
  }
  if (!res.ok) {
    const obj = data && typeof data === "object" ? data : null;
    throw new ApiError(res.status, obj?.error || `Erreur ${res.status}`, obj?.details ?? null);
  }
  return data;
}

/** Message d'erreur compréhensible, d'après le code renvoyé par le serveur. */
function explain(x) {
  const msg = String(x?.message ?? "Erreur inattendue");
  const d = x?.details ?? null;
  const strip = (m) => cap(m.replace(/^Calcul (impossible|non disponible)\s*:\s*/i, ""));
  switch (x?.status) {
    case 422: {
      const title = d?.status === "rejected" ? "Refusé par une règle du modèle métier" : /^Calcul impossible/i.test(msg) ? "Calcul impossible" : "Calcul non disponible";
      const where = d?.version ? `${cap(modelLabel(d.version))}${d.module ? ` · module ${d.module}` : ""}. ` : "";
      return { kind: "warn", title, message: strip(msg), sub: `${where}Rien n'a été enregistré.` };
    }
    case 409: {
      const hist = /historique/i.test(msg);
      return {
        kind: hist ? "lock" : "error",
        title: hist ? "Document historique protégé" : "Opération refusée",
        message: msg,
        sub:
          hist && !/d'origine/i.test(msg)
            ? "Document historique : ses montants d'origine sont conservés tels qu'enregistrés dans l'ancien logiciel. Pour toute correction, créez un nouveau document."
            : hist
              ? "Les valeurs d'origine restent celles de l'ancien logiciel. Rien n'a été modifié."
              : "Rien n'a été modifié.",
      };
    }
    case 400:
      return { kind: "error", title: "Saisie à corriger", message: msg, sub: "" };
    case 401:
      return { kind: "error", title: "Connexion refusée", message: msg, sub: "" };
    case 403:
      return { kind: "error", title: "Droits insuffisants", message: msg === "Droits insuffisants" ? "Votre rôle ne permet pas cette opération." : msg, sub: "" };
    case 404:
      return { kind: "error", title: "Introuvable", message: msg, sub: "" };
    case 410:
      return { kind: "error", title: "Lien expiré ou déjà utilisé", message: msg, sub: "" };
    case 413:
      return { kind: "error", title: "Trop volumineux", message: msg, sub: "" };
    case 429:
      return { kind: "error", title: "Trop de tentatives", message: msg, sub: "" };
    case 0:
      return { kind: "error", title: "Serveur injoignable", message: msg, sub: "" };
    default:
      return { kind: "error", title: x?.status >= 500 ? "Erreur du serveur" : "Erreur", message: msg, sub: x?.status >= 500 ? "Réessayez dans un instant ; si le problème persiste, prévenez l'administrateur du logiciel." : "" };
  }
}
const NOTICE_ICON = { info: "info", warn: "alert", lock: "lock", error: "alert", ok: "check" };
/** Bandeau d'information : `html` est déjà échappé par l'appelant. */
const noticeHtml = (kind, html, title = "") => `<div class="notice ${kind}">${icon(NOTICE_ICON[kind] ?? "info", "notice-ic")}<div class="notice-body">${title ? `<p class="notice-title">${esc(title)}</p>` : ""}<div>${html}</div></div></div>`;
const alertBox = (kind, title, message, sub = "") =>
  `<div class="notice ${kind}" role="alert" tabindex="-1">${icon(NOTICE_ICON[kind] ?? "info", "notice-ic")}<div class="notice-body">${title ? `<p class="notice-title">${esc(title)}</p>` : ""}<p>${esc(message)}</p>${sub ? `<p class="notice-sub">${esc(sub)}</p>` : ""}</div></div>`;
const problem = (x) => {
  const p = explain(x);
  return alertBox(p.kind, p.title, p.message, p.sub);
};

/* Annonces, notifications, confirmations ---------------------------------- */
/** Région aria-live permanente (hors de #root, jamais remplacée) : confirmations lues par les lecteurs d'écran. */
function announce(text) {
  if (!live) return;
  live.textContent = "";
  setTimeout(() => (live.textContent = text), 50);
}
function toast(text, kind = "ok") {
  document.querySelectorAll(".toast").forEach((t) => t.remove());
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.innerHTML = `${icon(kind === "error" ? "alert" : "check")}<span></span>`;
  el.querySelector("span").textContent = text;
  if (kind === "error") el.setAttribute("role", "alert");
  else {
    el.setAttribute("aria-hidden", "true");
    announce(text);
  }
  document.body.append(el);
  setTimeout(() => el.remove(), kind === "error" ? 9000 : 4500);
}
const toastError = (x) => {
  if (x?.handled) return;
  const p = explain(x);
  toast(`${p.title} — ${p.message}`, "error");
};
/** Dialogue de confirmation natif (<dialog> : focus piégé, Échap, retour du focus). */
function confirmDialog({ title, message, confirm = "Confirmer", danger = false }) {
  return new Promise((resolve) => {
    const opener = document.activeElement;
    const dlg = document.createElement("dialog");
    dlg.className = "modal";
    dlg.setAttribute("aria-labelledby", "dlg-title");
    dlg.setAttribute("aria-describedby", "dlg-msg");
    dlg.innerHTML = `<div class="modal-box"><h2 id="dlg-title">${esc(title)}</h2><div id="dlg-msg" class="modal-msg">${String(message)
      .split("\n")
      .filter(Boolean)
      .map((l) => `<p>${esc(l)}</p>`)
      .join("")}</div><div class="modal-actions"><button type="button" class="btn secondary" data-v="0">Annuler</button><button type="button" class="btn ${danger ? "danger-solid" : "primary"}" data-v="1">${esc(confirm)}</button></div></div>`;
    let settled = false;
    const done = (v) => {
      if (settled) return;
      settled = true;
      dlg.close();
      dlg.remove();
      if (opener?.isConnected) opener.focus();
      resolve(v);
    };
    dlg.addEventListener("cancel", (ev) => {
      ev.preventDefault();
      done(false);
    });
    dlg.addEventListener("click", (ev) => {
      if (ev.target === dlg) done(false);
      const b = ev.target.closest("[data-v]");
      if (b) done(b.dataset.v === "1");
    });
    document.body.append(dlg);
    dlg.showModal();
    dlg.querySelector('[data-v="0"]').focus();
  });
}

const params = () => new URLSearchParams(location.hash.split("?")[1] ?? "");
const currentPath = () => (location.hash.slice(1) || "/").split("?")[0] || "/";
const go = (h) => (location.hash === h ? route() : (location.hash = h));
const can = (role) => (ROLES[META?.user?.role] ?? 0) >= ROLES[role];
/** Action décrite comme indisponible par la spécification (app.json → actions) : pas de bouton. */
const allowed = (e, action) => !(META.actions ?? []).some((a) => a.entity === e?.name && a.action === action && a.available === false);
/** Bouton occupé pendant une opération (désactivé, aria-busy) ; renvoie la fonction qui le rétablit. */
function busy(btn, label) {
  if (!btn) return () => {};
  const before = btn.innerHTML;
  btn.disabled = true;
  btn.setAttribute("aria-busy", "true");
  if (label) btn.innerHTML = `<span class="spinner" aria-hidden="true"></span><span>${esc(label)}</span>`;
  return () => {
    btn.disabled = false;
    btn.removeAttribute("aria-busy");
    btn.innerHTML = before;
  };
}

/* Valeurs ---------------------------------------------------------------- */
/** Montant saisi (« 1 234,56 ») → centimes entiers, sans calcul flottant. */
function parseMoney(input) {
  let t = String(input).replace(/[\s  €]/g, "").replace(/EUR/i, "");
  if (!t) return null;
  const neg = t.startsWith("-");
  if (neg || t.startsWith("+")) t = t.slice(1);
  const sep = t.lastIndexOf(",") > t.lastIndexOf(".") ? "," : ".";
  const [i, f = "", extra] = t.split(sep);
  if (extra !== undefined || !/^\d+$/.test(i.replaceAll(sep === "," ? "." : ",", "")) || !/^\d{0,2}$/.test(f)) throw invalid(`Montant invalide : « ${input} »`);
  const cents = Number(i.replaceAll(sep === "," ? "." : ",", "")) * 100 + Number((f + "00").slice(0, 2));
  return neg ? -cents : cents;
}
/** Valeur affichée (HTML) : références en liens titrés, dates à la française, montants, Oui / Non. */
const format = (f, v, refTitle) => formatOf(f, v, refTitle, CUR());
/** Valeur affichée (texte brut : journal, confirmations, résumés). */
const plain = (f, v, refTitle) => plainOf(f, v, refTitle, CUR());

/* Modèle métier et protection de l'historique --------------------------- */
const activeVersion = () => META?.rules?.active_version ?? null;
const bindings = () => META?.rules?.bindings ?? [];
const versionMeta = (v) => (META?.rules?.versions ?? []).find((x) => Number(x.version) === Number(v)) ?? null;
/** « modèle métier v2 », signalé comme jeu de test quand la version vient d'un jeu de test. */
const modelLabel = (v) => (v ? `modèle métier v${v}${versionMeta(v)?.source === "fixture" ? " — jeu de test" : ""}` : "modèle métier");
const hasAccounting = (e) => !!e?.fields.some((f) => f.accounting);
const isDocument = (e) => !!e?.rules?.document;
const isLine = (e) => !!e?.rules?.line;
const isBound = (e) => isDocument(e) || isLine(e);
const hasRules = () => (META?.rules?.versions ?? []).length > 0 || (META?.not_rebuilt ?? []).length > 0;
/** Enregistrement migré dont les montants d'origine sont protégés (comptable ou document calculé). */
const isProtectedRecord = (e, r) => !!r?._migrated && (hasAccounting(e) || isDocument(e));
/** `ce` est-elle une entité « ligne » de `pe` par la référence `via` (agrégat, line_of ou liaison) ? */
function lineOf(ce, pe, via) {
  return (
    (pe.aggregates ?? []).some((a) => a.children === ce.name && a.via === via) ||
    (ce.line_of?.entity === pe.name && ce.line_of?.via === via) ||
    bindings().some((b) => b.entity === ce.name && b.scope === "line" && b.document?.entity === pe.name && b.document?.via === via)
  );
}
/** Document protégé dont `e` est une ligne (ses lignes historiques ne sont pas modifiables). */
function lineParent(e) {
  for (const f of e.fields.filter((x) => x.type === "reference")) {
    const p = entity(f.references);
    if (p && (hasAccounting(p) || isDocument(p)) && lineOf(e, p, f.name)) return { field: f, parent: p };
  }
  return null;
}
const isProtectedLine = (e, r) => !!r?._migrated && !!lineParent(e);

/**
 * Pourquoi un champ n'est pas saisissable (null s'il l'est). `mode` : "form" (ce qui se passera à
 * l'enregistrement) ou "detail" (d'où vient la valeur affichée). `version` : version qu'appliquera
 * le serveur si elle est connue (celle du document pour une ligne), ou "document" si elle dépend
 * du document choisi.
 */
function lockReason(e, f, r, mode, version = null) {
  const isNew = !r?.id;
  const migrated = !isNew && !!r._migrated;
  if (f.computed_by_rules) {
    if (migrated) return empty(r[f.name]) ? "Non calculé pour l'historique" : "Valeur d'origine (historique), jamais recalculée";
    if (!isNew && r._rules_version) return `Calculé (${modelLabel(r._rules_version)})`;
    if (mode === "detail") return "Pas encore calculé par le modèle métier";
    if (version === "document") return "Calculé à l'enregistrement, avec la version du modèle métier de son document";
    const v = version ?? activeVersion();
    return v ? `Calculé à l'enregistrement (${modelLabel(v)})` : "Calculé par le modèle métier";
  }
  if (migrated && f.accounting) return "Valeur historique protégée";
  if (!migrated && !isBound(e) && ((e.computed ?? []).some((c) => c.field === f.name) || (e.aggregates ?? []).some((a) => a.field === f.name))) return "Calculé automatiquement par le logiciel";
  return null;
}
/** Cachet d'origine : chaque enregistrement dit s'il vient de l'ancien logiciel ou s'il a été créé ici. */
const originStamp = (r) => (r._migrated ? `<span class="stamp migrated">${icon("archive")}Migré</span>` : '<span class="stamp here"><span class="dot" aria-hidden="true"></span>Créé ici</span>');
const lockStamp = (text = "Historique protégé", big = false) => `<span class="stamp lock${big ? " big" : ""}">${icon("lock")}${esc(text)}</span>`;
/** Cellule de tableau : un champ calculé vide d'une ligne historique est signalé comme non calculé. */
function cell(e, f, r) {
  if (f.computed_by_rules && empty(r[f.name]) && r._migrated) return '<span class="muted" title="Non calculé pour l\'historique">—</span>';
  return format(f, r[f.name], r._refs?.[f.name]);
}

/* Écrans d'accès : connexion, activation ------------------------------------ */
function authScreen(inner, title) {
  document.title = `${title}${brandName() ? ` · ${brandName()}` : ""}`;
  const b = BRAND ?? {};
  const second = b.app_name && b.app_name !== b.name ? b.app_name : b.tagline;
  root.innerHTML = `<main class="auth" id="main" tabindex="-1"><div class="auth-card">
    <div class="auth-brand">${logoMark(b, "lg")}<div class="auth-brand-text"><p class="auth-company" id="login-app">${esc(b.name || "")}</p>${second ? `<p class="auth-app">${esc(second)}</p>` : ""}</div></div>
    ${inner}</div></main>`;
}
const pwInput = (id, name, autocomplete, describedby) =>
  `<div class="pw-wrap"><input id="${id}" type="password" name="${name}" autocomplete="${autocomplete}" required spellcheck="false" aria-describedby="${describedby}"><button type="button" class="pw-toggle" data-pw="${id}" aria-pressed="false" aria-label="Afficher le mot de passe" title="Afficher le mot de passe">${icon("eye")}</button></div>`;
/** Afficher / masquer un mot de passe (bouton à bascule, aria-pressed). */
function bindPasswordToggles(scope) {
  scope.querySelectorAll("[data-pw]").forEach((b) => {
    b.addEventListener("click", () => {
      const input = scope.querySelector(`#${CSS.escape(b.dataset.pw)}`);
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      b.setAttribute("aria-pressed", String(show));
      input.focus();
    });
  });
}
/** Erreurs rattachées aux champs : texte sous le champ, aria-invalid, récapitulatif s'il y en a plusieurs. */
function markErrors(form, list, { summary = true } = {}) {
  for (const { id, message } of list) {
    const el = form.querySelector(`#${CSS.escape(id)}`);
    const box = form.querySelector(`#${CSS.escape(id)}-err`);
    // Champ à corriger dans une section repliée (« Informations complémentaires ») : la section s'ouvre
    const fold = el?.closest("details");
    if (fold) fold.open = true;
    el?.setAttribute("aria-invalid", "true");
    if (box) {
      box.innerHTML = `${icon("alert")}<span>${esc(message)}</span>`;
      box.hidden = false;
    }
  }
  if (!list.length) return;
  const slot = form.querySelector("[data-summary]");
  if (summary && slot && list.length > 1) {
    slot.innerHTML = `<div class="error-summary" role="alert" tabindex="-1"><p class="error-summary-title">${icon("alert")}${esc(plural(list.length, "champ à corriger", "champs à corriger"))}</p><ul>${list.map((x) => `<li><button type="button" class="link-btn" data-focus="${esc(x.id)}">${esc(x.label ? `${x.label} : ` : "")}${esc(x.message)}</button></li>`).join("")}</ul></div>`;
    slot.querySelectorAll("[data-focus]").forEach((b) => (b.onclick = () => form.querySelector(`#${CSS.escape(b.dataset.focus)}`)?.focus()));
    slot.querySelector(".error-summary").focus();
  } else form.querySelector(`#${CSS.escape(list[0].id)}`)?.focus();
}
function clearErrors(form) {
  form.querySelectorAll(".field-error").forEach((p) => {
    p.hidden = true;
    p.textContent = "";
  });
  form.querySelectorAll('[aria-invalid="true"]').forEach((el) => el.removeAttribute("aria-invalid"));
  const slot = form.querySelector("[data-summary]");
  if (slot) slot.innerHTML = "";
}
/** Une erreur disparaît dès que la personne corrige le champ concerné. */
function liveClear(form) {
  const clear = (ev) => {
    const el = ev.target.type === "hidden" ? ev.target.closest("[data-picker]")?.querySelector(".picker-input") : ev.target;
    if (!el?.id || el.getAttribute("aria-invalid") !== "true") return;
    el.removeAttribute("aria-invalid");
    const box = form.querySelector(`#${CSS.escape(el.id)}-err`);
    if (box) {
      box.hidden = true;
      box.textContent = "";
    }
  };
  form.addEventListener("input", clear);
  form.addEventListener("change", clear);
}

function renderLogin(msg = "") {
  META = null;
  authScreen(
    `<h1 class="auth-title" id="page-title" tabindex="-1">Connexion</h1><p class="auth-lead">Accès réservé aux utilisateurs autorisés.</p>
    <div id="login-err">${msg ? alertBox("info", "", msg) : ""}</div>
    <form id="login" class="auth-form" novalidate>
      <div class="field"><label for="lg-user">Identifiant ou adresse e-mail</label><input id="lg-user" type="text" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required aria-describedby="lg-user-err"><p class="field-error" id="lg-user-err" hidden></p></div>
      <div class="field"><label for="lg-pw">Mot de passe</label>${pwInput("lg-pw", "password", "current-password", "lg-pw-err")}<p class="field-error" id="lg-pw-err" hidden></p></div>
      <button class="btn primary block" type="submit">Se connecter</button>
    </form>
    <p class="auth-help">Mot de passe oublié ou pas encore d'accès ? Un administrateur de ce logiciel peut vous envoyer un lien d'accès personnel, à usage unique.</p>`,
    "Connexion",
  );
  if (!BRAND) loadBranding().then(() => patchAuthBrand());
  const form = root.querySelector("#login");
  bindPasswordToggles(form);
  liveClear(form);
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    if (form.dataset.busy) return;
    clearErrors(form);
    const f = new FormData(form);
    const errs = [];
    if (!String(f.get("username") ?? "").trim()) errs.push({ id: "lg-user", label: "Identifiant", message: "Renseignez votre identifiant ou votre adresse e-mail" });
    if (!f.get("password")) errs.push({ id: "lg-pw", label: "Mot de passe", message: "Renseignez votre mot de passe" });
    if (errs.length) return markErrors(form, errs, { summary: false });
    form.dataset.busy = "1";
    const done = busy(form.querySelector('button[type="submit"]'), "Connexion…");
    try {
      await api("POST", "/api/auth/login", { username: f.get("username"), password: f.get("password") });
      setSessionHint(true);
      FOCUS_TITLE = true;
      LAST_PATH = null;
      await boot();
    } catch (x) {
      delete form.dataset.busy;
      done();
      const box = root.querySelector("#login-err");
      box.innerHTML = problem(x);
      const pw = form.querySelector("#lg-pw");
      pw.value = "";
      pw.focus();
    }
  };
  form.querySelector("#lg-user").focus();
}
function patchAuthBrand() {
  const box = root.querySelector(".auth-brand");
  if (!box || !BRAND) return;
  const second = BRAND.app_name && BRAND.app_name !== BRAND.name ? BRAND.app_name : BRAND.tagline;
  box.innerHTML = `${logoMark(BRAND, "lg")}<div class="auth-brand-text"><p class="auth-company" id="login-app">${esc(BRAND.name || "")}</p>${second ? `<p class="auth-app">${esc(second)}</p>` : ""}</div>`;
  document.title = `${document.title.split(" · ")[0]} · ${brandName()}`;
}

/**
 * Activation d'un accès par lien d'invitation (#/activation/<jeton>). Le jeton est retiré de l'adresse
 * dès l'ouverture (historique, captures d'écran) et n'est gardé qu'en mémoire jusqu'à l'activation.
 */
async function renderActivation(token) {
  history.replaceState(null, "", `${location.pathname}${location.search}#/activation`);
  META = null;
  await loadBranding();
  if (!token) return activationInvalid("Ce lien d'activation est incomplet : ouvrez à nouveau le lien reçu, en entier.");
  let info;
  try {
    info = await api("POST", "/api/auth/invitation", { token });
  } catch (x) {
    if (x.status === 410) return activationInvalid();
    authScreen(`<h1 class="auth-title" id="page-title" tabindex="-1">Activation impossible pour le moment</h1>${problem(x)}<button type="button" class="btn primary block" id="retry">Réessayer</button>`, "Activation");
    root.querySelector("#retry").onclick = () => renderActivation(token);
    return;
  }
  const min = info.password_min ?? 12;
  authScreen(
    `<h1 class="auth-title" id="page-title" tabindex="-1">Activer votre accès</h1>
    <p class="auth-lead">Choisissez le mot de passe que vous utiliserez pour vous connecter. Il n'est connu que de vous : n'utilisez pas celui de votre ancien logiciel.</p>
    <dl class="auth-facts"><div><dt>Adresse e-mail</dt><dd>${esc(info.email)}</dd></div><div><dt>Rôle</dt><dd>${esc(ROLE_LABEL[info.role] ?? info.role)}</dd></div><div><dt>Lien valable jusqu'au</dt><dd>${esc(dateTime(info.expires_at))}</dd></div></dl>
    ${info.existing_account ? noticeHtml("info", "Un compte existe déjà pour cette adresse : ce lien vous permet de choisir un nouveau mot de passe. Vos autres sessions seront fermées.") : ""}
    <div id="act-err"></div>
    <form id="activate" class="auth-form" novalidate>
      <input type="text" name="username" value="${esc(info.email)}" autocomplete="username" hidden>
      <div data-summary></div>
      <div class="field"><label for="ac-pw">Nouveau mot de passe</label>${pwInput("ac-pw", "password", "new-password", "ac-pw-hint ac-pw-err")}<p class="hint" id="ac-pw-hint">${esc(min)} caractères minimum<span id="ac-count"></span>. Une courte phrase de plusieurs mots est facile à retenir.</p><p class="field-error" id="ac-pw-err" hidden></p></div>
      <div class="field"><label for="ac-pw2">Confirmez le mot de passe</label>${pwInput("ac-pw2", "confirm", "new-password", "ac-pw2-err")}<p class="field-error" id="ac-pw2-err" hidden></p></div>
      <button class="btn primary block" type="submit">Activer mon accès</button>
    </form>`,
    "Activation de votre accès",
  );
  const form = root.querySelector("#activate");
  bindPasswordToggles(form);
  liveClear(form);
  const pw = form.querySelector("#ac-pw");
  const count = form.querySelector("#ac-count");
  pw.addEventListener("input", () => (count.textContent = pw.value ? ` (${pw.value.length} saisi${pw.value.length > 1 ? "s" : ""})` : ""));
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    if (form.dataset.busy) return;
    clearErrors(form);
    root.querySelector("#act-err").innerHTML = "";
    const a = pw.value;
    const b = form.querySelector("#ac-pw2").value;
    const errs = [];
    if (a.length < min) errs.push({ id: "ac-pw", label: "Nouveau mot de passe", message: `${min} caractères minimum (${a.length} saisi${a.length > 1 ? "s" : ""})` });
    if (!b) errs.push({ id: "ac-pw2", label: "Confirmation", message: "Saisissez à nouveau le mot de passe" });
    else if (a !== b) errs.push({ id: "ac-pw2", label: "Confirmation", message: "Les deux mots de passe ne sont pas identiques" });
    if (errs.length) return markErrors(form, errs);
    form.dataset.busy = "1";
    const done = busy(form.querySelector('button[type="submit"]'), "Activation…");
    try {
      await api("POST", "/api/auth/activate", { token, password: a });
      setSessionHint(true);
      token = null;
      history.replaceState(null, "", `${location.pathname}${location.search}#/`);
      toast("Accès activé : bienvenue.");
      FOCUS_TITLE = true;
      LAST_PATH = null;
      await boot();
    } catch (x) {
      delete form.dataset.busy;
      done();
      if (x.status === 410) return activationInvalid();
      if (x.details?.field === "password") return markErrors(form, [{ id: "ac-pw", label: "Nouveau mot de passe", message: x.message }]);
      root.querySelector("#act-err").innerHTML = problem(x);
      root.querySelector("#act-err .notice")?.focus();
    }
  };
  root.querySelector("#page-title").focus();
}
function activationInvalid(msg) {
  authScreen(
    `<h1 class="auth-title" id="page-title" tabindex="-1">Lien d'activation non valable</h1>
    ${alertBox("error", "", msg ?? "Ce lien a expiré, a déjà servi ou a été révoqué : chaque lien ne sert qu'une fois.")}
    <p class="auth-lead">Demandez un nouveau lien à la personne qui vous a invité. Si votre accès est déjà activé, connectez-vous avec votre adresse e-mail et votre mot de passe.</p>
    <button type="button" class="btn primary block" id="to-login">Aller à la connexion</button>`,
    "Lien non valable",
  );
  root.querySelector("#to-login").onclick = () => {
    history.replaceState(null, "", `${location.pathname}${location.search}#/`);
    renderLogin();
  };
  root.querySelector("#page-title").focus();
}

/* Coquille : barre latérale, recherche, en-tête de page ---------------------- */
function navHtml(path) {
  const link = (href, label, on, extra = "") => `<li><a href="${href}"${on ? ' aria-current="page"' : ""}><span class="nav-label">${esc(label)}</span>${extra}</a></li>`;
  const mods = META.navigation
    .map((n) => entity(n.entity))
    .filter(Boolean)
    .map((e) => {
      const n = META.counts?.[e.name];
      return link(`#/e/${e.name}`, e.label, path === `/e/${e.name}` || path.startsWith(`/e/${e.name}/`), n === undefined ? "" : `<span class="nav-count">${esc(int(n))}<span class="sr"> ${n > 1 ? "enregistrements" : "enregistrement"}</span></span>`);
    })
    .join("");
  const group = (id, label, items) => `<p class="nav-group" id="${id}">${esc(label)}</p><ul class="nav-list" aria-labelledby="${id}">${items}</ul>`;
  // Vues d'ensemble (planning) en tête : c'est l'écran de travail quotidien
  const viewLinks = views()
    .map((v) => link(`#/vue/${v.name}`, v.label, path === `/vue/${v.name}`))
    .join("");
  return `<ul class="nav-list">${viewLinks}${link("#/", "Tableau de bord", path === "/")}</ul>
    ${mods ? group("ng-mod", "Modules", mods) : ""}
    ${hasRules() ? group("ng-ref", "Référentiel", link("#/modele", "Modèle métier", path === "/modele")) : ""}
    ${
      can("admin")
        ? group("ng-adm", "Administration", `${link("#/admin", "Utilisateurs et accès", path === "/admin")}${link("#/admin/sauvegardes", "Sauvegardes", path === "/admin/sauvegardes")}${link("#/admin/journal", "Journal d'audit", path === "/admin/journal")}`)
        : ""
    }`;
}
/**
 * Coquille de l'application. `crumbs` : liste de [lien, libellé] (pages parentes) ; `badges` et
 * `actions` sont du HTML déjà échappé.
 */
function shell(content, { title, crumbs = [], actions = "", badges = "", subtitle = "" }) {
  document.title = `${title} · ${brandName()}`;
  const path = currentPath();
  const b = BRAND ?? META.branding ?? {};
  const second = b.app_name && b.app_name !== b.name ? b.app_name : META.app.tagline ?? "";
  const who = META.user.email || META.user.name;
  // Adresse e-mail : la partie avant « @ » sur une ligne (points de suspension), l'adresse complète en info-bulle
  const whoShort = who.includes("@") ? who.slice(0, who.indexOf("@")) : who;
  // Lien d'évitement vers #main (cible réelle, reconnue comme telle) ; le clic est intercepté plus bas : pas de changement de route.
  root.innerHTML = `<a class="skip" href="#main" id="skip">Aller au contenu</a>
  <div class="progress" id="progress" aria-hidden="true"></div>
  <div class="app" id="app">
    <header class="mobilebar">
      <button type="button" class="icon-btn" id="menu" aria-controls="side" aria-expanded="false" aria-label="Ouvrir le menu">${icon("menu")}</button>
      <a class="mobilebar-brand" href="#/">${logoMark(b, "sm")}<span>${esc(brandName())}</span></a>
      <button type="button" class="icon-btn" id="msearch" aria-label="Rechercher">${icon("search")}</button>
    </header>
    <aside class="side" id="side" aria-label="Menu">
      <div class="side-head"><a class="brand" href="#/">${logoMark(b)}<span class="brand-text"><b>${esc(brandName())}</b>${second ? `<span>${esc(second)}</span>` : ""}</span></a><button type="button" class="icon-btn side-close" id="side-close" aria-label="Fermer le menu">${icon("close")}</button></div>
      <div class="gsearch" role="search">
        <label class="sr" for="gs">Rechercher dans tout le logiciel</label>
        <div class="gsearch-field">${icon("search")}<input id="gs" type="search" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="gs-list" aria-describedby="gs-help" autocomplete="off" spellcheck="false" placeholder="Rechercher…"><kbd aria-hidden="true">/</kbd></div>
        <p class="sr" id="gs-help">Résultats proposés pendant la saisie ; flèches pour parcourir, Entrée pour ouvrir.</p>
        <div class="gsearch-pop" id="gs-pop" hidden><p class="gs-msg" id="gs-msg"></p><div role="listbox" id="gs-list" aria-label="Résultats de la recherche"></div><p class="gs-foot" id="gs-foot" hidden></p></div>
      </div>
      <nav class="nav" aria-label="Navigation principale">${navHtml(path)}</nav>
      <div class="me">
        <div class="me-id"><span class="avatar" aria-hidden="true">${esc(initials(who))}</span><span class="me-text"><b title="${esc(who)}">${esc(whoShort)}</b><span>${esc(ROLE_LABEL[META.user.role] ?? META.user.role)}</span></span></div>
        <div class="me-actions"><a href="#/compte"${path === "/compte" ? ' aria-current="page"' : ""}>${icon("key")}Mon mot de passe</a><button type="button" id="logout">${icon("logout")}Se déconnecter</button></div>
      </div>
    </aside>
    <div class="scrim" id="scrim" hidden></div>
    <main class="main" id="main" tabindex="-1">
      <header class="page-head">
        ${crumbs.length ? `<nav class="crumbs" aria-label="Fil d'Ariane"><ol>${crumbs.map(([h, l]) => `<li><a href="${h}">${esc(l)}</a></li>`).join("")}</ol></nav>` : ""}
        <div class="page-title"><div class="page-title-text"><h1 id="page-title" tabindex="-1">${esc(title)}</h1>${badges ? `<div class="badges">${badges}</div>` : ""}${subtitle ? `<p class="page-sub">${subtitle}</p>` : ""}</div>${actions ? `<div class="page-actions">${actions}</div>` : ""}</div>
      </header>
      <div class="page-body">${content}</div>
    </main>
  </div>`;
  root.querySelector("#skip").onclick = (ev) => {
    ev.preventDefault();
    root.querySelector("#main").focus();
  };
  root.querySelector("#logout").onclick = async () => {
    try {
      await api("POST", "/api/auth/logout");
    } catch {}
    setSessionHint(false);
    META = null;
    renderLogin();
    announce("Vous êtes déconnecté.");
  };
  root.querySelector("#menu").onclick = () => setDrawer(true);
  root.querySelector("#msearch").onclick = () => setDrawer(true, true);
  root.querySelector("#side-close").onclick = () => setDrawer(false);
  root.querySelector("#scrim").onclick = () => setDrawer(false);
  bindGlobalSearch();
  root.querySelectorAll("tr.link").forEach((tr) => (tr.onclick = (ev) => ev.target.closest("a, button, input, select, label") || go(tr.dataset.href)));
}
/** Menu en tiroir sur petit écran : contenu inerte derrière, Échap ferme, le focus revient au bouton. */
function setDrawer(open, focusSearch = false) {
  const app = root.querySelector("#app");
  if (!app) return;
  app.classList.toggle("drawer-open", open);
  root.querySelector("#menu")?.setAttribute("aria-expanded", String(open));
  root.querySelector("#scrim").hidden = !open;
  // Tout ce qui est hors du tiroir devient inerte, lien d'évitement compris (sinon Tab sort du tiroir).
  for (const sel of ["#main", ".mobilebar", "#skip"]) {
    const el = root.querySelector(sel);
    if (el) el.inert = open;
  }
  if (open) (focusSearch ? root.querySelector("#gs") : root.querySelector("#side-close"))?.focus();
  else root.querySelector("#menu")?.focus();
}
function setLoading(on) {
  const main = root.querySelector("#main");
  root.querySelector("#progress")?.classList.toggle("on", on);
  if (!main) return;
  main.classList.toggle("loading", on);
  main.setAttribute("aria-busy", on ? "true" : "false");
}

/** Recherche dans tous les modules (liste déroulante pendant la saisie, page de résultats sur Entrée). */
function bindGlobalSearch() {
  const input = root.querySelector("#gs");
  const pop = root.querySelector("#gs-pop");
  const list = root.querySelector("#gs-list");
  const msg = root.querySelector("#gs-msg");
  const foot = root.querySelector("#gs-foot");
  if (!input) return;
  let timer = null;
  let seq = 0;
  let items = [];
  let active = -1;
  const close = () => {
    pop.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    active = -1;
  };
  const mark = (i) => {
    active = i;
    list.querySelectorAll("[role=option]").forEach((o, k) => o.setAttribute("aria-selected", String(k === i)));
    const o = list.querySelector(`#gs-o${i}`);
    if (o) {
      input.setAttribute("aria-activedescendant", o.id);
      o.scrollIntoView({ block: "nearest" });
    }
  };
  const load = async () => {
    const my = ++seq;
    const term = input.value.trim();
    if (!term) return close();
    pop.hidden = false;
    input.setAttribute("aria-expanded", "true");
    msg.textContent = "Recherche…";
    msg.hidden = false;
    try {
      const res = await api("GET", `/api/search?q=${encodeURIComponent(term)}&per=4`);
      if (my !== seq) return;
      items = [];
      active = -1;
      input.removeAttribute("aria-activedescendant");
      const option = (href, html, cls = "") => {
        const i = items.push({ href }) - 1;
        return `<div role="option" id="gs-o${i}" data-i="${i}" aria-selected="false"${cls ? ` class="${cls}"` : ""}>${html}</div>`;
      };
      list.innerHTML = res.groups
        .map((g) => {
          const e = entity(g.entity);
          if (!e) return "";
          const rows = g.rows.map((r) => option(`#/e/${e.name}/${r.id}`, `<span class="gs-title">${esc(titleOf(e, r))}</span>${subOf(e, r) ? `<span class="gs-sub">${esc(subOf(e, r))}</span>` : ""}`)).join("");
          const more = g.total > g.rows.length ? option(`#/e/${e.name}?q=${encodeURIComponent(term)}`, `Voir les ${esc(int(g.total))} résultats dans ${esc(e.label)}`, "gs-more") : "";
          return `<div role="group" aria-label="${esc(`${e.label} : ${plural(g.total, "résultat", "résultats")}`)}"><div class="gs-group" aria-hidden="true">${esc(e.label)}<span>${esc(int(g.total))}</span></div>${rows}${more}</div>`;
        })
        .join("");
      const total = res.groups.reduce((s, g) => s + g.total, 0);
      msg.textContent = total ? "" : `Aucun résultat pour « ${term} ».`;
      msg.hidden = !!total;
      foot.hidden = !total;
      foot.textContent = total > 1 ? `Entrée : voir les ${int(total)} résultats` : total ? "Entrée : voir le résultat" : "";
      announce(total ? `${plural(total, "résultat", "résultats")} dans ${plural(res.groups.length, "module", "modules")}` : "Aucun résultat");
    } catch (x) {
      if (my === seq && !x.handled) {
        msg.textContent = explain(x).message;
        msg.hidden = false;
      }
    }
  };
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(load, 200);
  });
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault();
      if (pop.hidden) return void load();
      if (items.length) mark(ev.key === "ArrowDown" ? (active + 1) % items.length : (active - 1 + items.length) % items.length);
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      const term = input.value.trim();
      if (active >= 0 && items[active]) go(items[active].href);
      else if (term) go(`#/recherche?q=${encodeURIComponent(term)}`);
    } else if (ev.key === "Escape" && !pop.hidden) {
      ev.preventDefault();
      ev.stopPropagation();
      close();
    }
  });
  input.addEventListener("blur", close);
  pop.addEventListener("mousedown", (ev) => ev.preventDefault());
  list.addEventListener("click", (ev) => {
    const o = ev.target.closest("[data-i]");
    if (o) go(items[Number(o.dataset.i)].href);
  });
}

/* Tableaux ---------------------------------------------------------------- */
/** Tableau d'enregistrements : nombres alignés à droite, en-têtes lisibles, empilé sur petit écran. */
function rowsTable(e, cols, rows, { th = null, origin = false, tail = null, tailLabel = "Actions", caption = "" } = {}) {
  // Aucune colonne utilisable (toutes techniques, par exemple) : le titre de chaque enregistrement
  if (!cols.length) cols = [{ name: "__title", label: e.label_singular ?? e.label, type: "text" }];
  const head =
    cols.map((f) => (th ? th(f) : `<th scope="col"${NUMERIC.has(f.type) ? ' class="num"' : ""}>${esc(f.label)}</th>`)).join("") +
    (origin ? '<th scope="col" class="origin-col">Origine</th>' : "") +
    (tail ? `<th scope="col" class="act"><span class="sr">${esc(tailLabel)}</span></th>` : "");
  const body = rows
    .map((r) => {
      const cells = cols
        .map((f, i) => {
          const cls = NUMERIC.has(f.type) || f.type === "date" ? ` class="${NUMERIC.has(f.type) ? "num" : "date"}"` : "";
          if (i === 0) {
            const txt = plain(f, r[f.name], r._refs?.[f.name]);
            return `<td data-label="${esc(f.label)}"${cls}><a class="row-link" href="#/e/${e.name}/${r.id}">${esc(txt === "—" ? titleOf(e, r) : txt)}</a></td>`;
          }
          return `<td data-label="${esc(f.label)}"${cls}>${cell(e, f, r)}</td>`;
        })
        .join("");
      return `<tr class="link" data-href="#/e/${e.name}/${r.id}">${cells}${origin ? `<td data-label="Origine" class="origin-col">${originStamp(r)}</td>` : ""}${tail ? `<td class="act">${tail(r)}</td>` : ""}</tr>`;
    })
    .join("");
  return `<div class="table-wrap"><table class="ledger stack">${caption ? `<caption class="sr">${esc(caption)}</caption>` : ""}<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}
function rowsTableStatic(head, rows, caption = "") {
  if (!rows.length) return emptyMini("Aucun élément.");
  return `<div class="table-wrap"><table class="ledger stack">${caption ? `<caption class="sr">${esc(caption)}</caption>` : ""}<thead><tr>${head.map((h) => `<th scope="col"${h.startsWith("#") ? ' class="num"' : ""}>${esc(h.replace(/^#/, ""))}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td data-label="${esc(head[i].replace(/^#/, ""))}"${head[i].startsWith("#") ? ' class="num"' : ""}>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
const emptyMini = (text) => `<p class="empty">${esc(text)}</p>`;
/** Panneau : titre (h2 par défaut), actions éventuelles, contenu. */
const panel = (title, body, { actions = "", id = "", level = 2, cls = "", count = null, raw = false } = {}) => {
  const hid = id ? `${id}-title` : "";
  return `<section class="panel${cls ? ` ${cls}` : ""}"${id ? ` id="${id}" aria-labelledby="${hid}"` : ""}><header class="panel-head"><h${level}${hid ? ` id="${hid}" tabindex="-1"` : ""}>${esc(title)}${count !== null ? ` <span class="count">(${esc(int(count))})</span>` : ""}</h${level}>${actions ? `<div class="panel-actions">${actions}</div>` : ""}</header>${raw ? body : `<div class="panel-body">${body}</div>`}</section>`;
};

/* Tableau de bord ----------------------------------------------------- */
const ACTION = {
  create: "a créé",
  update: "a modifié",
  delete: "a supprimé",
  file_added: "a joint un fichier à",
  reprice: "a recalculé",
  update_refused: "modification refusée (historique protégé) :",
  delete_refused: "suppression refusée (historique protégé) :",
  login: "s'est connecté",
  backup: "a créé une sauvegarde",
  restore: "a restauré une sauvegarde",
  rules_published: "a publié un modèle métier",
  rules_activated: "a activé un modèle métier",
  user_created: "a créé un compte utilisateur",
  user_updated: "a modifié un compte",
  user_activated: "a activé son accès",
  password_changed: "a changé son mot de passe",
  password_reset: "a choisi un nouveau mot de passe (lien d'accès)",
  invite_created: "a créé une invitation",
  invite_imported: "a envoyé une invitation",
  invite_revoked: "a révoqué une invitation",
};
function kpiCell(c) {
  const e = entity(c.entity);
  const value = c.kind === "sum" ? money(c.value) : int(c.value);
  let foot;
  if (c.kind === "count") {
    if (!c.value) foot = '<span class="kpi-sub">Aucun enregistrement</span>';
    else {
      const here = c.value - (c.migrated ?? 0);
      const text = c.migrated === c.value ? "Tous issus de la migration" : !c.migrated ? "Tous créés dans ce logiciel" : `${int(c.migrated)} ${c.migrated > 1 ? "migrés" : "migré"} · ${int(here)} ${here > 1 ? "créés" : "créé"} ici`;
      foot = `<span class="split" aria-hidden="true"><span class="split-m" style="width:${(c.migrated / c.value) * 100}%"></span><span class="split-h" style="width:${(here / c.value) * 100}%"></span></span><span class="kpi-sub">${esc(text)}</span>`;
    }
  } else foot = `<span class="kpi-sub">${esc(c.sub ?? (fieldOf(e, c.field) ? `Somme de « ${fieldOf(e, c.field).label} », historique inclus` : ""))}</span>`;
  return `<a class="kpi" href="#/e/${esc(c.entity)}"><span class="kpi-label">${esc(c.label)}</span><span class="kpi-value">${esc(value)}</span>${foot}</a>`;
}
function latestPanel(latest) {
  const items = (latest ?? []).filter((x) => entity(x.entity));
  if (!items.length) return "";
  const tabs = items
    .map((x, i) => `<button type="button" role="tab" id="lt-${i}" aria-controls="lp-${i}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${esc(entity(x.entity).label)}</button>`)
    .join("");
  const panels = items
    .map((x, i) => {
      const e = entity(x.entity);
      const cols = listColumns(e, e.list_fields, { max: 3 });
      const body = x.rows.length
        ? `${rowsTable(e, cols, x.rows, { origin: true, caption: `${e.label} : derniers enregistrements` })}<p class="panel-foot"><a href="#/e/${e.name}">Voir tout (${esc(int(x.total))})${icon("chevron")}</a></p>`
        : `<div class="empty-state small"><p>Aucun enregistrement pour l'instant.</p>${can("editor") && allowed(e, "create") ? `<p><a class="btn secondary sm" href="#/e/${e.name}/new">${icon("plus")}Créer le premier</a></p>` : ""}</div>`;
      return `<div role="tabpanel" id="lp-${i}" aria-labelledby="lt-${i}" tabindex="0"${i ? " hidden" : ""}>${body}</div>`;
    })
    .join("");
  return `<section class="panel" id="latest" aria-labelledby="h-latest"><header class="panel-head"><h2 id="h-latest">Derniers enregistrements</h2></header><div class="tabs" role="tablist" aria-labelledby="h-latest">${tabs}</div>${panels}</section>`;
}
/** Onglets (motif ARIA : flèches, Début, Fin ; activation automatique). */
function bindTabs(scope) {
  if (!scope) return;
  const tabs = [...scope.querySelectorAll('[role="tab"]')];
  const select = (i, focus = true) => {
    tabs.forEach((t, k) => {
      t.setAttribute("aria-selected", String(k === i));
      t.tabIndex = k === i ? 0 : -1;
      scope.querySelector(`#${t.getAttribute("aria-controls")}`).hidden = k !== i;
    });
    if (focus) tabs[i].focus();
  };
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => select(i));
    t.addEventListener("keydown", (ev) => {
      const k = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[ev.key];
      if (k === undefined) return;
      ev.preventDefault();
      select((k + tabs.length) % tabs.length);
    });
  });
}
/**
 * « Aujourd'hui » d'un planning : arrivées et départs du jour, éléments en cours, ressources occupées sur le
 * total. Chaque carte ouvre la liste filtrée par le serveur (plages de dates) ; l'occupation ouvre le planning.
 */
function todaySection(board, several) {
  const v = views().find((x) => x.name === board.view);
  const e = entity(board.entity);
  const rf = v && fieldOf(e, v.resource);
  const re = rf && entity(rf.references);
  if (!v || !e || !re) return "";
  const tf = fieldOf(e, v.title);
  const te = tf?.type === "reference" ? entity(tf.references) : null;
  const links = todayLinks(v, board.day);
  const who = (x) => [x.title, x.resource].filter(Boolean).join(" · ") || `${e.label_singular ?? e.label} #${x.id}`;
  const preview = (block) => {
    if (!block.total) return "Rien pour aujourd'hui";
    const names = block.items.slice(0, 3).map((x) => x.title ?? x.resource ?? `#${x.id}`);
    const rest = block.total - names.length;
    return `${names.join(", ")}${rest > 0 ? ` et ${plural(rest, "autre", "autres")}` : ""}`;
  };
  const pct = board.resources ? Math.round((board.occupied / board.resources) * 100) : 0;
  const card = (href, label, value, sub, key) =>
    `<a class="kpi" href="${href}" data-fkey="${key}"><span class="kpi-label">${esc(label)}</span><span class="kpi-value">${esc(value)}</span><span class="kpi-sub">${esc(sub)}</span></a>`;
  const list = (title, block, href, id) =>
    `<section class="today-list" aria-labelledby="${id}"><h3 id="${id}">${esc(title)} <span class="count">(${esc(int(block.total))})</span></h3>${
      block.items.length
        ? `<ul>${block.items.map((x) => `<li><a href="#/e/${esc(e.name)}/${esc(x.id)}">${esc(who(x))}</a></li>`).join("")}</ul>${block.total > block.items.length ? `<p class="small"><a href="${href}">Voir les ${esc(int(block.total))}</a></p>` : ""}`
        : `<p class="muted small">Rien pour aujourd'hui.</p>`
    }</section>`;
  const sid = `today-${board.view}`;
  return `<section class="today" aria-labelledby="${sid}">
    <header class="today-head"><h2 id="${sid}">${icon("sun")}Aujourd'hui${several ? ` · ${esc(v.label)}` : ""}</h2><p>${esc(cap(dayLabel(board.day)))}</p><a class="btn secondary sm" href="${links.planning}">${icon("calendar")}${esc(v.label)}</a></header>
    <div class="kpi-band today-band">
      ${card(links.arrivals, "Arrivées du jour", int(board.arrivals.total), preview(board.arrivals), `${sid}-a`)}
      ${card(links.departures, "Départs du jour", int(board.departures.total), preview(board.departures), `${sid}-d`)}
      ${card(links.current, `${e.label} en cours`, int(board.current), te && board.current_titles !== null ? plural(board.current_titles, lower(te.label_singular ?? te.label), lower(te.label)) : "En cours aujourd'hui", `${sid}-c`)}
      ${card(links.planning, "Occupation", `${int(board.occupied)} / ${int(board.resources)}`, `${pct} % des ${lower(re.label)}`, `${sid}-o`)}
    </div>
    ${board.arrivals.total || board.departures.total ? `<div class="today-lists">${list("Arrivées", board.arrivals, links.arrivals, `${sid}-la`)}${list("Départs", board.departures, links.departures, `${sid}-ld`)}</div>` : ""}
  </section>`;
}

async function viewDashboard(t) {
  const d = await api("GET", `/api/dashboard?today=${localIso()}`);
  if (t !== NAV) return;
  const boards = d.today?.boards ?? [];
  const today = boards.map((b) => todaySection(b, boards.length > 1)).join("");
  const av = activeVersion();
  const docs = META.entities.filter(isDocument);
  const model = docs.length
    ? av
      ? ` Les nouveaux enregistrements (${esc(docs.map((e) => e.label).join(", "))}) sont calculés par le serveur avec le <a href="#/modele">${esc(modelLabel(av))}</a> ; les enregistrements historiques gardent leurs montants d'origine.`
      : " Aucun modèle métier actif : les nouveaux enregistrements ne sont pas calculés automatiquement."
    : "";
  const origin = d.migration
    ? noticeHtml("info", `Données historiques migrées depuis <b>${esc(d.migration.source_system ?? "l'ancien logiciel")}</b> le ${esc(dateTime(d.migration.migrated_at))}. Chaque fiche migrée indique son origine exacte.${model}`)
    : model
      ? noticeHtml("info", model.trim())
      : "";
  const a = d.activity ?? {};
  const stat = (n, one, many) => `<li><b>${esc(int(n ?? 0))}</b> ${esc(Number(n) > 1 ? many : one)}</li>`;
  const recent = d.recent.length
    ? `<ol class="timeline">${d.recent
        .map((r) => {
          const e = entity(r.entity);
          const label = r.title ?? `${e?.label_singular ?? r.entity} #${r.record_id}`;
          return `<li><p><b>${esc(r.user)}</b> ${esc(ACTION[r.action] ?? r.action)} ${e ? `<a href="#/e/${e.name}/${r.record_id}">${esc(label)}</a> <span class="muted">· ${esc(e.label_singular ?? e.label)}</span>` : esc(label)}</p>${timeTag(r.ts)}</li>`;
        })
        .join("")}</ol>`
    : emptyMini("Aucune modification depuis la mise en service.");
  const activity = panel(
    "Activité récente",
    `<ul class="activity-sum" aria-label="30 derniers jours">${stat(a.create, "création", "créations")}${stat(a.update, "modification", "modifications")}${stat(a.people, "personne active", "personnes actives")}</ul><p class="muted small activity-note">30 derniers jours, d'après le journal d'audit.</p>${recent}`,
    {},
  );
  const breakdowns = d.breakdowns
    .map((b) => {
      const e = entity(b.entity);
      const f = fieldOf(e, b.field);
      const total = b.values.reduce((s, x) => s + x.n, 0);
      const max = Math.max(1, ...b.values.map((x) => x.n));
      const items = b.values.length
        ? `<ul class="bars">${b.values
            .map((v) => {
              const label = v.value === null ? "Non renseigné" : optionLabel(f, v.value);
              const name = v.value === null ? `<span>${esc(label)}</span>` : `<a href="#/e/${esc(b.entity)}?${esc(b.field)}=${encodeURIComponent(v.value)}">${esc(label)}</a>`;
              return `<li>${name}<span class="bar" aria-hidden="true"><span style="width:${(v.n / max) * 100}%"></span></span><span class="bar-n">${esc(int(v.n))}<span class="bar-pct">${esc(pctLabel(v.n, total))}</span></span></li>`;
            })
            .join("")}</ul>`
        : emptyMini("Aucune donnée.");
      return panel(b.label, items, { level: 3 });
    })
    .join("");
  const now = new Date();
  shell(
    `${today}${origin}${today ? '<h2 class="section-title" id="h-kpi">Indicateurs</h2><section class="kpi-band" aria-labelledby="h-kpi">' : '<section class="kpi-band" aria-label="Indicateurs">'}${d.cards.map(kpiCell).join("")}</section>
     <div class="dash-grid">${latestPanel(d.latest)}${activity}</div>
     ${breakdowns ? `<section class="dash-section" aria-labelledby="h-rep"><h2 class="section-title" id="h-rep">Répartitions</h2><div class="breakdowns">${breakdowns}</div></section>` : ""}`,
    { title: "Tableau de bord", subtitle: `Chiffres lus dans la base du logiciel le ${esc(now.toLocaleDateString(LOCALE, { dateStyle: "long" }))} à ${esc(now.toLocaleTimeString(LOCALE, { timeStyle: "short" }))}.` },
  );
  bindTabs(root.querySelector("#latest"));
}

/* Planning ------------------------------------------------------------------ */
/** Couleur des barres selon le statut : oui / non, sinon une couleur par valeur (six au plus), avec leur légende. */
function statusStyles(sf, items) {
  if (!sf) return { cls: () => "", text: () => "", legend: [] };
  const text = (v) => (empty(v) ? "" : sf.type === "boolean" ? (Number(v) ? "Oui" : "Non") : String(optionLabel(sf, v)));
  const yn = sf.type === "boolean" ? { yes: 1, no: 0 } : yesNo(sf);
  if (yn)
    return {
      cls: (v) => (v === yn.yes ? "st-yes" : v === yn.no ? "st-no" : "st-none"),
      text,
      legend: [
        ["st-yes", "Oui"],
        ["st-no", "Non"],
      ],
    };
  const values = (sf.options?.length ? sf.options.map((o) => o.value) : [...new Set(items.map((x) => x.status).filter((x) => !empty(x)))]).slice(0, 6);
  return {
    cls: (v) => {
      const i = values.indexOf(v);
      return i < 0 ? "st-none" : `st-${i}`;
    },
    text,
    legend: values.map((v, i) => [`st-${i}`, text(v)]),
  };
}

/**
 * Planning (ui.views, kind « planning ») : un mois, une ligne par ressource (triées par titre), une colonne par
 * jour, une barre par élément du début (inclus) à la fin (exclue), étiquetée par le titre lié ; clic → fiche.
 * Le défilement horizontal reste dans la grille ; la colonne des ressources reste visible.
 */
async function viewPlanning(name, t) {
  const v = views().find((x) => x.name === name);
  const e = entity(v.entity);
  const rf = fieldOf(e, v.resource);
  const re = entity(rf?.references) ?? { name: rf?.references ?? "", label: rf?.label ?? "", label_singular: rf?.label ?? "" };
  const sf = v.status ? fieldOf(e, v.status) : null;
  const today = localIso();
  const month = monthOf(params().get("mois")) ?? monthOf(today.slice(0, 7));
  const data = await api("GET", `/api/views/${encodeURIComponent(name)}?from=${month.from}&to=${month.to}`);
  if (t !== NAV) return;
  const layout = planningLayout(data, month.from, month.to, today);
  const st = statusStyles(sf, data.items);
  const canCreate = can("editor") && allowed(e, "create");
  const base = `#/vue/${name}`;
  const dayClass = (d) => `${d.weekend ? " we" : ""}${d.today ? " today" : ""}`;
  const head = `<tr><th scope="col" class="pl-res">${esc(rf?.label ?? re.label_singular)}</th>${layout.days
    .map(
      (d) =>
        `<th scope="col" class="pl-day${dayClass(d)}"${d.today ? ' aria-current="date"' : ""}><span class="pl-dw" aria-hidden="true">${WEEKDAY_SHORT[d.dow]}</span><span class="pl-dn" aria-hidden="true">${d.day}</span><span class="sr">${esc(dayLabel(d.iso))}${d.today ? " (aujourd'hui)" : ""}</span></th>`,
    )
    .join("")}</tr>`;
  const bar = (s, row) => {
    const it = s.item;
    const label = it.title ?? `${e.label_singular ?? e.label} #${it.id}`;
    const status = sf && !empty(it.status) ? `${sf.label} : ${st.text(it.status)}` : "";
    const where = row.resource?.title ?? it.resource_title ?? "";
    const full = [label, where, rangeLabel(it.start, it.end), status, s.before ? "commence avant ce mois" : "", s.after ? "se poursuit après ce mois" : ""].filter(Boolean).join(" · ");
    return `<a class="pl-bar ${st.cls(it.status)}${s.before ? " before" : ""}${s.after ? " after" : ""}" style="--span:${s.span}" href="#/e/${esc(e.name)}/${esc(it.id)}" title="${esc(full)}" aria-label="${esc(full)}">${s.before ? '<span class="pl-cont" aria-hidden="true">‹</span>' : ""}<span class="pl-t">${esc(label)}</span>${s.after ? '<span class="pl-cont" aria-hidden="true">›</span>' : ""}</a>`;
  };
  const body = layout.rows.length
    ? layout.rows
        .map((row) =>
          row.lanes
            .map((lane, li) => {
              const th = li
                ? ""
                : `<th scope="row" class="pl-res"${row.lanes.length > 1 ? ` rowspan="${row.lanes.length}"` : ""}>${row.resource ? `<a href="#/e/${esc(re.name)}/${esc(row.resource.id)}">${esc(row.resource.title)}</a>` : `<span class="muted">${esc(`Sans ${lower(rf?.label ?? re.label_singular)}`)}</span>`}</th>`;
              const starts = new Map(lane.map((s) => [s.col, s]));
              const cells = layout.days
                .map((d, i) => {
                  const s = starts.get(i);
                  if (s) return `<td class="pl-c has-bar${dayClass(d)}">${bar(s, row)}</td>`;
                  return `<td class="pl-c${dayClass(d)}"${canCreate && row.resource && !li ? ` data-new="${esc(row.resource.id)}" data-day="${d.iso}"` : ""}></td>`;
                })
                .join("");
              return `<tr${li ? ' class="pl-lane"' : ""}>${th}${cells}</tr>`;
            })
            .join(""),
        )
        .join("")
    : `<tr><td class="pl-empty" colspan="${layout.days.length + 1}">Aucun enregistrement dans « ${esc(re.label)} » : rien à planifier.</td></tr>`;
  const pct = layout.capacity ? Math.round((layout.used / layout.capacity) * 100) : 0;
  const notices = [
    data.truncated?.items ? noticeHtml("warn", esc(`Plus de ${int(data.items.length)} éléments sur la période : seuls les premiers sont dessinés. Consultez la liste « ${e.label} » pour le détail.`)) : "",
    data.truncated?.resources ? noticeHtml("warn", esc(`Seules les ${int(data.resources.length)} premières lignes sur ${int(data.resources_total)} sont affichées.`)) : "",
  ].join("");
  const legend = `<div class="pl-legend"><p class="pl-legend-title" id="pl-legend">Légende</p><ul aria-labelledby="pl-legend">${st.legend.map(([c, l]) => `<li><span class="pl-sw ${c}" aria-hidden="true"></span>${esc(`${sf.label} : ${l}`)}</li>`).join("")}<li><span class="pl-sw today" aria-hidden="true"></span>Aujourd'hui</li><li><span class="pl-sw we" aria-hidden="true"></span>Samedi et dimanche</li><li><span class="pl-cont" aria-hidden="true">‹ ›</span>Commence avant ou se poursuit après le mois affiché</li>${canCreate ? `<li>Case libre : un clic ouvre « Nouveau » avec ${esc(lower(rf?.label ?? re.label_singular))} et date préremplies</li>` : ""}</ul></div>`;
  const summary = [cap(month.label), plural(data.resources.length, lower(re.label_singular), lower(re.label)), plural(layout.count, lower(e.label_singular ?? e.label), lower(e.label)), `occupation du mois : ${pct} %`].join(" · ");
  shell(
    `<section class="panel planning-panel" aria-labelledby="pl-month">
      <div class="pl-toolbar">
        <div class="pl-nav">
          <a class="btn secondary" href="${base}?mois=${shiftMonth(month.ym, -1)}" data-fkey="pl-prev">${icon("back")}<span class="pl-nav-t">Mois précédent</span></a>
          <a class="btn secondary" href="${base}" data-fkey="pl-today">Aujourd'hui</a>
          <a class="btn secondary" href="${base}?mois=${shiftMonth(month.ym, 1)}" data-fkey="pl-next"><span class="pl-nav-t">Mois suivant</span>${icon("chevron")}</a>
        </div>
        <h2 class="pl-month" id="pl-month" tabindex="-1">${esc(cap(month.label))}</h2>
        <form class="pl-jump" id="pl-jump" novalidate><label for="pl-mois">Aller au mois</label><input type="month" id="pl-mois" name="mois" value="${month.ym}" data-fkey="pl-mois" aria-describedby="pl-mois-err"><button class="btn secondary" type="submit">Afficher</button><p class="field-error" id="pl-mois-err" hidden></p></form>
      </div>
      ${notices ? `<div class="pad-x">${notices}</div>` : ""}
      <div class="pl-wrap" role="region" aria-labelledby="pl-cap" tabindex="0">
        <table class="planning" style="--days:${layout.days.length}">
          <caption id="pl-cap" class="sr">${esc(`${v.label}, ${month.label} : une ligne par ${lower(re.label_singular)}, une colonne par jour`)}</caption>
          <thead>${head}</thead>
          <tbody>${body}</tbody>
        </table>
      </div>
      ${legend}
    </section>`,
    { title: v.label, subtitle: esc(summary), actions: canCreate ? `<a class="btn primary" href="#/e/${esc(e.name)}/new">${icon("plus")}Nouveau<span class="sr"> : ${esc(e.label_singular ?? e.label)}</span></a>` : "" },
  );
  const wrap = root.querySelector(".pl-wrap");
  // Mois en cours : si le jour actuel est hors de la partie visible de la grille, il y est amené
  const now = wrap?.querySelector("thead th.today");
  if (now) {
    const lead = wrap.querySelector("thead th.pl-res").offsetWidth;
    const hidden = now.offsetLeft < wrap.scrollLeft + lead || now.offsetLeft + now.offsetWidth > wrap.scrollLeft + wrap.clientWidth;
    if (hidden) wrap.scrollLeft = Math.max(0, now.offsetLeft - lead - now.offsetWidth * 2);
  }
  wrap?.addEventListener("click", (ev) => {
    const td = ev.target.closest("td[data-new]");
    if (!td) return;
    go(`#/e/${e.name}/new?${encodeURIComponent(v.resource)}=${td.dataset.new}&${encodeURIComponent(v.start)}=${td.dataset.day}&${encodeURIComponent(v.end)}=${addDays(td.dataset.day, 1)}`);
  });
  const jump = root.querySelector("#pl-jump");
  liveClear(jump);
  jump.onsubmit = (ev) => {
    ev.preventDefault();
    clearErrors(jump);
    const raw = String(new FormData(jump).get("mois") ?? "").trim();
    const fr = /^(\d{1,2})\/(\d{4})$/.exec(raw);
    const ym = fr ? `${fr[2]}-${fr[1].padStart(2, "0")}` : raw;
    if (!monthOf(ym)) return markErrors(jump, [{ id: "pl-mois", label: "Mois", message: "Mois attendu, ex. 2026-03 ou 03/2026" }], { summary: false });
    go(`${base}?mois=${ym}`);
  };
}

/* Recherche ---------------------------------------------------------------- */
async function viewSearch(t) {
  const term = (params().get("q") ?? "").trim();
  const res = term ? await api("GET", `/api/search?q=${encodeURIComponent(term)}&per=10`) : { groups: [] };
  if (t !== NAV) return;
  const total = res.groups.reduce((s, g) => s + g.total, 0);
  const groups = res.groups
    .map((g) => {
      const e = entity(g.entity);
      if (!e) return "";
      const cols = listColumns(e, e.list_fields, { max: 4 });
      return panel(e.label, `${rowsTable(e, cols, g.rows, { origin: true, caption: `${e.label} : résultats` })}${g.total > g.rows.length ? `<p class="panel-foot"><a href="#/e/${e.name}?q=${encodeURIComponent(term)}">Voir les ${esc(int(g.total))} résultats dans ${esc(e.label)}${icon("chevron")}</a></p>` : ""}`, { count: g.total, raw: true });
    })
    .join("");
  shell(
    term
      ? total
        ? `<div class="stack-l">${groups}</div>`
        : `<div class="empty-state">${icon("search", "empty-ic")}<p><b>Aucun résultat pour « ${esc(term)} ».</b></p><p class="muted">Vérifiez l'orthographe ou essayez avec moins de mots. La recherche porte sur les champs de recherche de chaque module et sur la clé d'origine exacte.</p></div>`
      : `<div class="empty-state">${icon("search", "empty-ic")}<p><b>Saisissez un mot dans la recherche.</b></p><p class="muted">Raccourci : touche « / ».</p></div>`,
    { title: term ? `Recherche : « ${term} »` : "Recherche", subtitle: term ? esc(total ? `${plural(total, "résultat", "résultats")} dans ${plural(res.groups.length, "module", "modules")}` : "Aucun résultat") : "" },
  );
}

/* Liste -------------------------------------------------------------------- */
function rangeText(f, a, b) {
  const v = (x) => (f.type === "date" ? dateFr(x) : f.type === "money" ? money(Number(x)) : f.type === "percent" ? `${nb(Number(x))} %` : nb(Number(x)));
  if (a && b && a === b) return f.type === "date" ? `le ${v(a)}` : `exactement ${v(a)}`;
  if (a && b) return f.type === "date" ? `du ${v(a)} au ${v(b)}` : `de ${v(a)} à ${v(b)}`;
  if (a) return f.type === "date" ? `à partir du ${v(a)}` : `au moins ${v(a)}`;
  return f.type === "date" ? `jusqu'au ${v(b)}` : `au plus ${v(b)}`;
}
/** Accès aux plannings où paraît une entité : ses éléments (ex. les séjours) ou ses ressources (ex. les lignes du planning). */
const planningLinks = (e) =>
  views()
    .filter((v) => v.entity === e.name || fieldOf(entity(v.entity), v.resource)?.references === e.name)
    .map((v) => `<a class="btn secondary" href="#/vue/${esc(v.name)}">${icon("calendar")}${esc(v.label)}</a>`)
    .join("");
/** Libellé d'un tri de liste : champ de l'entité, ou « champ de la fiche liée » (référence.champ). */
function sortLabel(e, sort) {
  const own = fieldOf(e, sort);
  if (own) return own.label;
  const [ref, sub] = String(sort).split(".");
  const rf = fieldOf(e, ref);
  const tf = rf && fieldOf(entity(rf.references), sub);
  return rf && tf ? `${tf.label} (${rf.label})` : String(sort);
}
async function viewList(name, t) {
  const e = entity(name);
  const p = params();
  const page = Math.max(1, Number(p.get("page") ?? 1) || 1);
  const per = [25, 50, 100].includes(Number(p.get("per"))) ? Number(p.get("per")) : 25;
  const qs = new URLSearchParams(p);
  qs.set("per", String(per));
  const data = await api("GET", `/api/e/${name}?${qs}`);
  if (t !== NAV) return;
  // Colonnes de la liste : jamais un champ technique
  const cols = listColumns(e);
  const technical = new Set(e.technical_fields ?? []);
  const href = (x) => {
    const s = x.toString();
    return `#/e/${name}${s ? `?${s}` : ""}`;
  };
  const without = (...keys) => {
    const x = new URLSearchParams(p);
    for (const k of keys) x.delete(k);
    x.delete("page");
    return href(x);
  };
  const fchip = (text, link, what) => `<li class="fchip">${esc(text)}<a href="${link}" aria-label="Retirer ${esc(what)}" title="Retirer ${esc(what)}">${icon("close")}</a></li>`;
  const chips = [];
  if (p.get("q")) chips.push(fchip(`Recherche : « ${p.get("q")} »`, without("q"), "la recherche"));
  if (p.get("_migrated") === "1" || p.get("_migrated") === "0") chips.push(fchip(`Origine : ${p.get("_migrated") === "1" ? "migrés" : "créés ici"}`, without("_migrated"), "le filtre Origine"));
  for (const f of e.fields) {
    const v = p.get(f.name);
    if (v === null || v === "") continue;
    const label = f.type === "reference" ? (data.rows[0]?._refs?.[f.name] ?? `#${v}`) : f.type === "boolean" ? (v === "1" ? "Oui" : "Non") : optionLabel(f, v);
    chips.push(fchip(`${f.label} : ${label}`, without(f.name), `le filtre ${f.label}`));
  }
  const ranged = cols.filter((f) => RANGE.has(f.type));
  for (const f of e.fields.filter((x) => RANGE.has(x.type))) {
    const a = p.get(`${f.name}.from`);
    const b = p.get(`${f.name}.to`);
    if (a || b) chips.push(fchip(`${f.label} : ${rangeText(f, a, b)}`, without(`${f.name}.from`, `${f.name}.to`), `le filtre ${f.label}`));
  }
  const filtered = chips.length > 0;
  const sortLink = (f) => {
    const x = new URLSearchParams(p);
    x.set("sort", f.name);
    x.set("dir", p.get("sort") === f.name && p.get("dir") !== "desc" ? "desc" : "asc");
    x.delete("page");
    return href(x);
  };
  const th = (f) => {
    const on = p.get("sort") === f.name;
    const desc = p.get("dir") === "desc";
    const cls = [NUMERIC.has(f.type) ? "num" : "", on ? "sorted" : ""].filter(Boolean).join(" ");
    return `<th scope="col"${cls ? ` class="${cls}"` : ""}${on ? ` aria-sort="${desc ? "descending" : "ascending"}"` : ""}><a class="sort" href="${sortLink(f)}" data-fkey="sort-${esc(f.name)}">${esc(f.label)}<span class="sr">${on ? (desc ? " (tri décroissant, activer pour trier par ordre croissant)" : " (tri croissant, activer pour trier par ordre décroissant)") : " (activer pour trier)"}</span><span class="arrow" aria-hidden="true">${on ? (desc ? "↓" : "↑") : "↕"}</span></a></th>`;
  };
  const createHref = `#/e/${name}/new${[...p]
    .filter(([k]) => fieldOf(e, k)?.type === "reference")
    .map(([k, v], i) => `${i ? "&" : "?"}${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("")}`;
  const canCreate = can("editor") && allowed(e, "create");
  const table = data.rows.length
    ? rowsTable(e, cols, data.rows, { th, origin: true, caption: `${e.label} : ${data.rows.length} sur ${data.total}${p.get("sort") ? `, triés par ${sortLabel(e, p.get("sort"))}${p.get("dir") === "desc" ? " (décroissant)" : ""}` : ""}` })
    : `<div class="empty-state">${
        filtered
          ? `${icon("search", "empty-ic")}<p><b>Aucun résultat${p.get("q") ? ` pour « ${esc(p.get("q"))} »` : ""}.</b></p><p class="muted">Aucun enregistrement ne correspond à ces critères.</p><p><a class="btn secondary" href="#/e/${name}">Effacer la recherche et les filtres</a></p>`
          : `${icon("archive", "empty-ic")}<p><b>Aucun enregistrement pour l'instant.</b></p>${canCreate ? `<p><a class="btn primary" href="${createHref}">${icon("plus")}Créer le premier</a></p>` : '<p class="muted">Les enregistrements apparaîtront ici dès leur création.</p>'}`
      }</div>`;
  const pages = Math.max(1, Math.ceil(data.total / data.per));
  const pageLink = (n) => {
    const x = new URLSearchParams(p);
    x.set("page", String(n));
    return href(x);
  };
  const pager = data.total ? pagerHtml(data, pages, pageLink) : "";
  const searchable = e.search_fields.map((n) => fieldOf(e, n)?.label ?? n).join(", ") || "titre";
  // Petits écrans : les en-têtes sont masqués (lignes empilées), le tri passe par une liste
  const curSort = p.get("sort") ? `${p.get("sort")}:${p.get("dir") === "desc" ? "desc" : "asc"}` : "";
  const sortSelect = `<div class="inline-field mobile-only"><label for="sort">Trier</label><select id="sort" data-fkey="sort"><option value="">Par défaut</option>${cols
    .flatMap((f) => [
      [`${f.name}:asc`, `${f.label} (croissant)`],
      [`${f.name}:desc`, `${f.label} (décroissant)`],
    ])
    .map(([v, l]) => `<option value="${esc(v)}"${v === curSort ? " selected" : ""}>${esc(l)}</option>`)
    .join("")}</select></div>`;
  const open = FILTERS_OPEN.has(name);
  const filterFields = e.fields.filter((f) => !technical.has(f.name) && ((f.type === "enum" && f.options?.length) || f.type === "boolean"));
  const activeFilters = chips.length - (p.get("q") ? 1 : 0);
  const rangeValue = (f, v) => (empty(v) ? "" : f.type === "money" ? (Number(v) / 100).toFixed(2).replace(".", ",") : f.type === "date" ? v : String(v).replace(".", ","));
  const filterPanel = `<form id="filters" class="filters" novalidate${open ? "" : " hidden"} aria-label="Filtres : ${esc(e.label)}">
    <div data-summary></div>
    <div class="filters-grid">
      <div class="field"><label for="fl-_migrated">Origine</label><select id="fl-_migrated" name="_migrated"><option value="">Toutes</option><option value="1"${p.get("_migrated") === "1" ? " selected" : ""}>Migrés</option><option value="0"${p.get("_migrated") === "0" ? " selected" : ""}>Créés ici</option></select></div>
      ${filterFields
        .map(
          (f) =>
            `<div class="field"><label for="fl-${esc(f.name)}">${esc(f.label)}</label><select id="fl-${esc(f.name)}" name="${esc(f.name)}"><option value="">Tous</option>${
              f.type === "boolean"
                ? `<option value="1"${p.get(f.name) === "1" ? " selected" : ""}>Oui</option><option value="0"${p.get(f.name) === "0" ? " selected" : ""}>Non</option>`
                : f.options.map((o) => `<option value="${esc(o.value)}"${p.get(f.name) === o.value ? " selected" : ""}>${esc(optionLabel(f, o.value))}</option>`).join("")
            }</select></div>`,
        )
        .join("")}
      ${ranged
        .map((f) => {
          const kind = f.type === "date" ? 'type="date"' : `type="text" inputmode="decimal"`;
          const unit = f.type === "money" ? ` (${CUR() === "EUR" ? "€" : CUR()})` : f.type === "percent" ? " (%)" : "";
          return `<fieldset class="field range"><legend>${esc(f.label)}${esc(unit)}</legend><div class="range-row"><div class="range-part"><label for="fl-${esc(f.name)}-from">${f.type === "date" ? "Du" : "De"}</label><input id="fl-${esc(f.name)}-from" name="${esc(f.name)}.from" ${kind} value="${esc(rangeValue(f, p.get(`${f.name}.from`)))}" aria-describedby="fl-${esc(f.name)}-from-err"><p class="field-error" id="fl-${esc(f.name)}-from-err" hidden></p></div><div class="range-part"><label for="fl-${esc(f.name)}-to">${f.type === "date" ? "Au" : "À"}</label><input id="fl-${esc(f.name)}-to" name="${esc(f.name)}.to" ${kind} value="${esc(rangeValue(f, p.get(`${f.name}.to`)))}" aria-describedby="fl-${esc(f.name)}-to-err"><p class="field-error" id="fl-${esc(f.name)}-to-err" hidden></p></div></div></fieldset>`;
        })
        .join("")}
    </div>
    <div class="filters-actions"><button class="btn primary" type="submit">Appliquer les filtres</button>${activeFilters ? `<a class="btn quiet" href="${p.get("q") ? `#/e/${name}?q=${encodeURIComponent(p.get("q"))}` : `#/e/${name}`}">Retirer tous les filtres</a>` : ""}</div>
  </form>`;
  shell(
    `<section class="panel list-panel" aria-label="${esc(e.label)}">
      <div class="toolbar">
        <form id="search" class="list-search" role="search" aria-label="Rechercher dans ${esc(e.label)}"><label class="sr" for="ls-q">Rechercher dans ${esc(e.label)}</label><div class="input-icon">${icon("search")}<input type="search" id="ls-q" name="q" data-fkey="ls-q" placeholder="Rechercher : ${esc(searchable)}" value="${esc(p.get("q") ?? "")}"></div><button class="btn secondary" type="submit">Rechercher</button></form>
        <div class="toolbar-end">
          <button type="button" class="btn secondary" id="filters-toggle" aria-expanded="${open}" aria-controls="filters" data-fkey="filters-toggle">${icon("filter")}Filtres${activeFilters ? `<span class="pill" aria-label="${esc(plural(activeFilters, "filtre actif", "filtres actifs"))}">${esc(int(activeFilters))}</span>` : ""}</button>
          ${sortSelect}
          <div class="inline-field"><label for="per">Par page</label><select id="per" data-fkey="per">${[25, 50, 100].map((n) => `<option value="${n}"${n === per ? " selected" : ""}>${n}</option>`).join("")}</select></div>
        </div>
      </div>
      ${filterPanel}
      ${chips.length ? `<ul class="fchips" aria-label="Critères appliqués">${chips.join("")}</ul>` : ""}
      ${table}
      ${pager}
    </section>`,
    {
      title: e.label,
      subtitle: esc(filtered ? `${plural(data.total, "enregistrement correspond", "enregistrements correspondent")} aux critères` : plural(data.total, "enregistrement", "enregistrements")),
      actions: `${planningLinks(e)}${allowed(e, "export") ? `<a class="btn secondary" href="/api/export/${name}.csv" title="Tous les enregistrements du module, au format CSV">${icon("download")}Exporter tout (CSV)</a>` : ""}${canCreate ? `<a class="btn primary" href="${createHref}">${icon("plus")}Nouveau<span class="sr"> : ${esc(e.label_singular ?? e.label)}</span></a>` : ""}`,
    },
  );
  const nav = (x) => {
    x.delete("page");
    go(href(x));
  };
  root.querySelector("#search").onsubmit = (ev) => {
    ev.preventDefault();
    const x = new URLSearchParams(p);
    const v = String(new FormData(ev.target).get("q") ?? "").trim();
    if (v) x.set("q", v);
    else x.delete("q");
    nav(x);
  };
  root.querySelector("#sort").onchange = (ev) => {
    const x = new URLSearchParams(p);
    const [field, dir] = String(ev.target.value).split(":");
    if (field) {
      x.set("sort", field);
      x.set("dir", dir === "desc" ? "desc" : "asc");
    } else {
      x.delete("sort");
      x.delete("dir");
    }
    nav(x);
  };
  root.querySelector("#per").onchange = (ev) => {
    const x = new URLSearchParams(p);
    x.set("per", ev.target.value);
    nav(x);
  };
  root.querySelector("#filters-toggle").onclick = (ev) => {
    const f = root.querySelector("#filters");
    const show = f.hidden;
    f.hidden = !show;
    ev.currentTarget.setAttribute("aria-expanded", String(show));
    if (show) {
      FILTERS_OPEN.add(name);
      f.querySelector("select, input")?.focus();
    } else FILTERS_OPEN.delete(name);
  };
  const ff = root.querySelector("#filters");
  liveClear(ff);
  ff.onsubmit = (ev) => {
    ev.preventDefault();
    clearErrors(ff);
    const x = new URLSearchParams(p);
    const errs = [];
    for (const el of ff.elements) {
      if (!el.name) continue;
      x.delete(el.name);
      const raw = String(el.value ?? "").trim();
      if (!raw) continue;
      const fname = el.name.replace(/\.(from|to)$/, "");
      const f = fieldOf(e, fname);
      if (el.name !== fname && f && f.type !== "date") {
        if (f.type === "money") {
          try {
            x.set(el.name, String(parseMoney(raw)));
          } catch {
            errs.push({ id: el.id, label: f.label, message: "Montant invalide, ex. 1 234,56" });
          }
        } else if (Number.isFinite(Number(raw.replace(",", ".")))) x.set(el.name, String(Number(raw.replace(",", "."))));
        else errs.push({ id: el.id, label: f.label, message: "Nombre attendu, ex. 12,5" });
      } else x.set(el.name, raw);
    }
    if (errs.length) return markErrors(ff, errs);
    FILTERS_OPEN.add(name);
    nav(x);
  };
}
function pagerHtml(data, pages, link) {
  const from = (data.page - 1) * data.per + 1;
  const to = Math.min(data.total, data.page * data.per);
  const nums = [...new Set([1, data.page - 1, data.page, data.page + 1, pages])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  let items = "";
  let prev = 0;
  for (const n of nums) {
    if (n - prev > 1) items += '<li class="gap" aria-hidden="true">…</li>';
    items += n === data.page ? `<li><span class="pg on" aria-current="page"><span class="sr">Page </span>${esc(int(n))}</span></li>` : `<li><a class="pg" href="${link(n)}" data-fkey="pg"><span class="sr">Page </span>${esc(int(n))}</a></li>`;
    prev = n;
  }
  return `<nav class="pager" aria-label="Pagination"><p class="pager-info">${esc(int(from))}–${esc(int(to))} sur ${esc(int(data.total))}${pages > 1 ? ` · page ${esc(int(data.page))} / ${esc(int(pages))}` : ""}</p>${
    pages > 1
      ? `<ul class="pager-list">${data.page > 1 ? `<li><a class="pg wide" href="${link(data.page - 1)}" data-fkey="pg">${icon("back")}<span>Précédente</span></a></li>` : ""}${items}${data.page < pages ? `<li><a class="pg wide" href="${link(data.page + 1)}" data-fkey="pg"><span>Suivante</span>${icon("chevron")}</a></li>` : ""}</ul>`
      : ""
  }</nav>`;
}

/* Fiche -------------------------------------------------------------------- */
/**
 * Lignes d'un document, d'après la spécification : liaisons du modèle métier (document / ligne),
 * sinon lignes déclarées (line_of) ou agrégat (total = somme des lignes).
 */
function documentLines(e, rules) {
  const bs = rules?.bindings ?? bindings();
  const db = bs.find((b) => b.entity === e.name && b.scope === "document") ?? null;
  const lb = bs.find((b) => b.scope === "line" && b.document?.entity === e.name) ?? null;
  let le = entity(db?.lines?.entity ?? lb?.entity ?? "");
  let via = db?.lines?.via ?? lb?.document?.via ?? null;
  if (!le || !fieldOf(le, via)) {
    const bound = META.entities.find((x) => isLine(x) && x.fields.some((f) => f.type === "reference" && f.references === e.name)) ?? null;
    const declared = META.entities.find((x) => x.line_of?.entity === e.name && fieldOf(x, x.line_of.via)) ?? null;
    const agg = (e.aggregates ?? []).find((a) => entity(a.children) && fieldOf(entity(a.children), a.via)) ?? null;
    if (bound) {
      le = bound;
      via = bound.fields.find((f) => f.type === "reference" && f.references === e.name).name;
    } else if (declared) {
      le = declared;
      via = declared.line_of.via;
    } else if (agg) {
      le = entity(agg.children);
      via = agg.via;
    } else le = null;
  }
  return le && via ? { db, lb, le, via, ruled: !!(db || lb) || isLine(le) } : null;
}

function historyChanges(e, h) {
  let before = {};
  let after = {};
  try {
    before = h.before ? JSON.parse(h.before) : {};
    after = h.after ? JSON.parse(h.after) : {};
  } catch {
    return "";
  }
  const label = (k) => (k === "_rules_version" ? "Version du modèle métier" : (fieldOf(e, k)?.label ?? k));
  const val = (k, v) => (k === "_rules_version" ? (v ? `v${v}` : "aucune") : plain(fieldOf(e, k), v));
  if (h.action === "update") {
    // La version du modèle n'est listée « avant → après » que si l'ancienne valeur est dans le journal
    const keys = Object.keys(after).filter((k) => k !== "_rules_version" || k in before);
    const calc = "_rules_version" in after && !("_rules_version" in before) ? `calculé avec le modèle métier v${after._rules_version}` : "";
    return [...keys.map((k) => `${label(k)} : ${val(k, before[k])} → ${val(k, after[k])}`), calc].filter(Boolean).join(" · ");
  }
  if (h.action === "reprice") return `Version du modèle métier : ${val("_rules_version", before._rules_version)} → ${val("_rules_version", after._rules_version)}`;
  if (h.action === "update_refused") return `Champs protégés : ${(after.fields ?? []).map(label).join(", ")}`;
  return "";
}

/** Enregistrements liés affichés par page dans une fiche (les plus récents d'abord). */
const RELATED_PER = 10;
/** Contenu d'un panneau d'enregistrements liés : tableau, pages (plus récents / plus anciens), liste complète. */
function relatedBody(e, r, x, rows, page) {
  const { c, ce, block, label } = x;
  if (!block.total || !rows.length) return emptyMini("Aucun enregistrement lié.");
  const pages = Math.max(1, Math.ceil(block.total / RELATED_PER));
  const from = (page - 1) * RELATED_PER + 1;
  const to = Math.min(block.total, page * RELATED_PER);
  const sort = block.sort?.field ?? "id";
  const table = rowsTable(ce, relatedColumns(ce, c.via, views()), rows, { origin: true, caption: `${label} · ${headingOf(e, r)} · du plus récent au plus ancien${pages > 1 ? ` (page ${page} sur ${pages})` : ""}` });
  const pager =
    pages > 1
      ? `<nav class="pager rel-pager" aria-label="${esc(`Pages : ${label}`)}"><p class="pager-info">${esc(int(from))}–${esc(int(to))} sur ${esc(int(block.total))} · du plus récent au plus ancien</p><ul class="pager-list"><li><button type="button" class="pg wide" data-rel-page="${page - 1}" data-rel-dir="prev"${page <= 1 ? " disabled" : ""}>${icon("back")}<span>Page précédente</span></button></li><li><button type="button" class="pg wide" data-rel-page="${page + 1}" data-rel-dir="next"${page >= pages ? " disabled" : ""}><span>Page suivante</span>${icon("chevron")}</button></li></ul></nav>`
      : "";
  const all = block.total > RELATED_PER ? `<p class="panel-foot"><a href="#/e/${esc(c.entity)}?${encodeURIComponent(c.via)}=${esc(r.id)}${sort !== "id" ? `&sort=${encodeURIComponent(sort)}&dir=desc` : ""}">Ouvrir la liste complète (${esc(int(block.total))})${icon("chevron")}</a></p>` : "";
  return `${table}${pager}${all}`;
}
/** Pages suivantes d'un panneau lié : même tri que la fiche (GET /api/e/<entité>?<via>=<id>&sort=…&dir=desc). */
function bindRelated(e, r, x) {
  const sec = root.querySelector(`#${CSS.escape(x.id)}`);
  const body = sec?.querySelector(".rel-body");
  if (!body) return;
  body.addEventListener("click", async (ev) => {
    const b = ev.target.closest("[data-rel-page]");
    if (!b || b.disabled) return;
    const page = Number(b.dataset.relPage);
    const dir = b.dataset.relDir;
    const done = busy(b);
    try {
      const sort = x.block.sort?.field ?? "id";
      const res = await api("GET", `/api/e/${x.c.entity}?${encodeURIComponent(x.c.via)}=${r.id}&sort=${encodeURIComponent(sort)}&dir=desc&per=${RELATED_PER}&page=${page}`);
      if (!body.isConnected) return;
      x.block = { ...x.block, total: res.total };
      body.innerHTML = relatedBody(e, r, x, res.rows, page);
      body.querySelectorAll("tr.link").forEach((tr) => (tr.onclick = (ev2) => ev2.target.closest("a, button, input, select, label") || go(tr.dataset.href)));
      (body.querySelector(`[data-rel-dir="${dir}"]:not([disabled])`) ?? body.querySelector("[data-rel-page]:not([disabled])") ?? sec.querySelector("h2, h3"))?.focus();
      announce(`${x.label} : page ${page} sur ${Math.max(1, Math.ceil(res.total / RELATED_PER))}`);
    } catch (err) {
      done();
      toastError(err);
    }
  });
}
/** Résumé d'un enregistrement dessiné dans un planning : titre lié et ressource en liens, période, accès au planning. */
function viewSummary(e, r) {
  const v = viewFor(e);
  if (!v || empty(r[v.start])) return "";
  const part = (n) => {
    const f = fieldOf(e, n);
    if (!f || empty(r[n])) return "";
    return f.type === "reference" ? `<a href="#/e/${esc(f.references)}/${esc(r[n])}">${esc(r._refs?.[n] ?? `#${r[n]}`)}</a>` : esc(plain(f, r[n]));
  };
  const parts = [part(v.title), part(v.resource), esc(rangeLabel(r[v.start], r[v.end]))].filter(Boolean);
  return `<span class="view-sum">${parts.join(" · ")}</span><a class="view-sum-link" href="#/vue/${esc(v.name)}?mois=${esc(String(r[v.start]).slice(0, 7))}">${icon("calendar")}Voir dans « ${esc(v.label)} »</a>`;
}

async function viewDetail(name, id, t) {
  const e = entity(name);
  const [d, rules] = await Promise.all([api("GET", `/api/e/${name}/${id}`), isDocument(e) ? api("GET", "/api/rules") : Promise.resolve(null)]);
  const doc = documentLines(e, rules);
  const lines = doc ? await api("GET", `/api/e/${doc.le.name}?${encodeURIComponent(doc.via)}=${id}&per=200`) : null;
  if (t !== NAV) return;
  const r = d.record;
  const title = headingOf(e, r);
  const protRec = isProtectedRecord(e, r);
  const protLine = isProtectedLine(e, r) ? lineParent(e) : null;
  const src = META.app.source_system || "l'ancien logiciel";

  // Champs essentiels en tête ; les autres repliés sous « Informations complémentaires » ; les champs
  // techniques seulement dans « Données d'origine » (panneau Origine de la donnée)
  const groups = fieldGroups(e);
  const kv = (f) => {
    const note = lockReason(e, f, r, "detail");
    const long = (f.type === "text" && String(r[f.name] ?? "").length > 90) || /\n/.test(String(r[f.name] ?? ""));
    return `<div class="kv${long ? " wide" : ""}"><dt>${esc(f.label)}${f.accounting && r._migrated ? ` <span class="stamp lock sm" title="Valeur historique protégée : non modifiable">${icon("lock")}protégé</span>` : ""}</dt><dd>${format(f, r[f.name], r._refs?.[f.name])}${note && f.computed_by_rules ? `<span class="kv-note">${icon("calc")}${esc(note)}</span>` : ""}</dd></div>`;
  };
  const fields = groups.essential.map(kv).join("");
  const filled = groups.more.filter((f) => !empty(r[f.name]));
  const unfilled = groups.more.filter((f) => empty(r[f.name]));
  const more = groups.more.length
    ? `<details class="more" id="more-info"><summary>Informations complémentaires <span class="count">(${esc(plural(filled.length, "renseignée", "renseignées"))} sur ${esc(int(groups.more.length))})</span></summary>${filled.length ? `<dl class="kv-grid">${filled.map(kv).join("")}</dl>` : ""}${unfilled.length ? `<p class="muted small more-blank">Non renseignés : ${esc(unfilled.map((f) => f.label).join(", "))}.</p>` : ""}</details>`
    : "";
  const technical = groups.technical.length
    ? `<details class="raw tech"><summary>Données d'origine (${esc(int(groups.technical.length))})</summary><dl class="kv-list">${groups.technical.map((f) => `<div><dt>${esc(f.label)}</dt><dd>${format(f, r[f.name], r._refs?.[f.name])}</dd></div>`).join("")}</dl></details>`
    : "";

  // Enregistrements liés (références inverses) : les plus récents d'abord, par pages de RELATED_PER
  const kids = e.children.filter((c) => !(doc && c.entity === doc.le.name && c.via === doc.via) && entity(c.entity) && d.children[`${c.entity}.${c.via}`]);
  const relLabel = (c) => (e.children.filter((x) => x.entity === c.entity).length > 1 ? `${c.label} · ${fieldOf(entity(c.entity), c.via)?.label ?? c.via}` : c.label);
  const related = kids.map((c) => ({ c, ce: entity(c.entity), block: d.children[`${c.entity}.${c.via}`], label: relLabel(c), id: `rel-${c.entity}-${c.via}` }));
  const children = related
    .map((x) => {
      const lockedLines = protRec && lineOf(x.ce, e, x.c.via);
      const canAdd = can("editor") && allowed(x.ce, "create") && !lockedLines;
      return panel(x.label, `<div class="rel-body">${relatedBody(e, r, x, x.block.rows.slice(0, RELATED_PER), 1)}</div>`, {
        id: x.id,
        count: x.block.total,
        raw: true,
        actions: canAdd ? `<a class="btn secondary sm" href="#/e/${x.c.entity}/new?${encodeURIComponent(x.c.via)}=${r.id}">${icon("plus")}Ajouter<span class="sr"> : ${esc(x.ce.label_singular ?? x.ce.label)}</span></a>` : lockedLines ? lockStamp("historique protégé") : "",
      });
    })
    .join("");

  // Relations : fiches liées (références) et enregistrements rattachés, accessibles en un clic
  const parents = e.fields
    .filter((f) => f.type === "reference" && !empty(r[f.name]) && entity(f.references))
    .map((f) => `<li><span class="rel-label">${esc(f.label)}</span><a href="#/e/${esc(f.references)}/${esc(r[f.name])}">${esc(r._refs?.[f.name] ?? `#${r[f.name]}`)}</a></li>`);
  const attached = [
    ...(doc ? [{ id: "doc", label: doc.le.label, total: lines?.total ?? 0 }] : []),
    ...related.map((x) => ({ id: x.id, label: x.label, total: x.block.total })),
  ].map((x) => `<li><span class="rel-label">${esc(x.label)}</span>${x.total ? `<button type="button" class="link-btn" data-goto="${esc(x.id)}">${esc(plural(x.total, "enregistrement", "enregistrements"))}</button>` : '<span class="muted">aucun</span>'}</li>`);
  const relations = parents.length || attached.length ? panel("Relations", `${parents.length ? `<ul class="rel-list">${parents.join("")}</ul>` : ""}${attached.length ? `<ul class="rel-list">${attached.join("")}</ul>` : ""}`, {}) : "";

  const files = panel(
    "Pièces jointes",
    d.files.length
      ? `<ul class="file-list">${d.files.map((f) => `<li>${icon("clip")}<a href="/api/files/${f.id}"${f.sha256 ? ` title="Empreinte SHA-256 : ${esc(f.sha256)}"` : ""}>${esc(f.filename)}</a><span class="muted small">${esc(nb(Math.round((f.size / 1024) * 10) / 10))} Ko · ${f._migrated ? "migré" : `ajouté par ${esc(f.created_by)}`}</span></li>`).join("")}</ul>`
      : emptyMini("Aucune pièce jointe."),
    { count: d.files.length, actions: can("editor") && allowed(e, "attach") ? `<button type="button" class="btn secondary sm" id="upload-btn">${icon("clip")}Joindre un fichier</button><input type="file" id="upload" hidden>` : "" },
  );
  const lineage = d.lineage
    ? panel(
        "Origine de la donnée",
        `<dl class="kv-list"><div><dt>Logiciel source</dt><dd>${esc(d.lineage.source_system)}</dd></div><div><dt>Table et clé d'origine</dt><dd class="mono">${esc(d.lineage.source_table)} · ${esc(d.lineage.source_key)}</dd></div>
        <div><dt>Fichier extrait</dt><dd>${esc(d.lineage.source_file)}</dd></div><div><dt>Migrée le</dt><dd>${esc(dateTime(d.lineage.migrated_at))}</dd></div></dl>
        <details class="raw"><summary>Transformations appliquées</summary><pre>${esc(
          Object.entries(d.lineage.transforms ?? {})
            .map(([k, x]) => `${k} ← ${x.source}${x.transforms?.length ? `  [${x.transforms.join(" → ")}]` : ""}`)
            .join("\n"),
        )}</pre></details>
        ${technical}
        <details class="raw"><summary>Ligne d'origine complète</summary><pre>${esc(JSON.stringify(d.lineage.source_row, null, 2))}</pre><p class="muted small">Exécution de migration ${esc(d.lineage.run_id)} · empreinte du fichier extrait (SHA-256) <span class="mono">${esc(d.lineage.source_file_sha256 ?? "—")}</span></p></details>`,
        { actions: `<span class="stamp migrated">${icon("archive")}migré</span>` },
      )
    : panel("Origine de la donnée", `<p class="muted">Enregistrement créé le ${esc(dateTime(r._created_at))}.</p>${technical}`, { actions: '<span class="stamp here"><span class="dot" aria-hidden="true"></span>créé dans ce logiciel</span>' });
  const history = panel(
    "Historique",
    d.history.length
      ? `<ol class="timeline">${d.history
          .map((h) => {
            const ch = historyChanges(e, h);
            return `<li><p><b>${esc(h.user)}</b> ${esc(ACTION[h.action] ?? h.action)}</p>${timeTag(h.ts)}${ch ? `<p class="muted small">${esc(ch)}</p>` : ""}${h.justification ? `<p class="muted small">Motif : ${esc(h.justification)}</p>` : ""}</li>`;
          })
          .join("")}</ol>`
      : emptyMini(`Aucune modification${r._migrated ? " depuis la migration" : ""}.`),
    {},
  );

  let banner = "";
  if (protLine)
    banner = alertBox(
      "lock",
      "Historique protégé",
      `Cet enregistrement appartient à un document historique (${protLine.parent.label_singular ?? protLine.parent.label}) migré depuis ${src} : il n'est ni modifiable ni supprimable. Le document conserve ses montants d'origine ; pour toute correction, créez un nouveau document.`,
    );
  else if (protRec && isDocument(e))
    banner = alertBox(
      "lock",
      "Historique protégé",
      `${hasAccounting(e) ? "Document comptable historique" : "Document historique"} migré depuis ${src} : ses montants d'origine sont conservés tels qu'enregistrés dans l'ancien logiciel. Ils ne sont jamais recalculés, ses lignes ne sont pas modifiables et il ne peut pas être supprimé. Les autres informations restent modifiables ; chaque modification est tracée.`,
    );
  else if (protRec)
    banner = alertBox(
      "lock",
      "Historique protégé",
      `Document comptable historique : valeurs d'origine (${e.fields
        .filter((f) => f.accounting)
        .map((f) => f.label)
        .join(", ")}) conservées telles qu'enregistrées dans ${src}. Elles ne sont pas modifiables et l'enregistrement ne peut pas être supprimé.`,
    );
  banner = banner.replace(' role="alert" tabindex="-1"', "");

  const canEdit = can("editor") && allowed(e, "update") && !protLine;
  const canDelete = can("editor") && allowed(e, "delete") && !protRec && !protLine;
  const docBlock = doc ? documentBlock(e, r, doc, lines, rules) : null;
  shell(
    `${banner}<div class="detail-grid"><div class="detail-main">${panel("Informations", `<dl class="kv-grid">${fields}</dl>${more}`, {})}${docBlock ? docBlock.html : ""}${children}</div><div class="detail-side">${relations}${lineage}${files}${history}</div></div>`,
    {
      title,
      subtitle: viewSummary(e, r),
      badges: `${originStamp(r)}${protRec || protLine ? lockStamp("Historique protégé", true) : ""}${r._source_key ? `<span class="stamp key" title="Clé de l'enregistrement dans l'ancien logiciel">clé d'origine <span class="mono">${esc(r._source_key)}</span></span>` : ""}`,
      crumbs: [[`#/e/${name}`, e.label]],
      actions: `${canEdit ? `<a class="btn secondary" href="#/e/${name}/${id}/edit">${icon("edit")}Modifier</a>` : ""}${canDelete ? `<button class="btn danger" type="button" id="del">${icon("trash")}Supprimer</button>` : ""}`,
    },
  );
  docBlock?.bind();
  for (const x of related) bindRelated(e, r, x);
  root.querySelectorAll("[data-goto]").forEach((b) =>
    b.addEventListener("click", () => {
      const sec = root.querySelector(`#${CSS.escape(b.dataset.goto)}`);
      sec?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
      sec?.querySelector("h2, h3")?.focus({ preventScroll: true });
    }),
  );
  root.querySelector("#del")?.addEventListener("click", async (ev) => {
    const btn = ev.currentTarget;
    if (!(await confirmDialog({ title: `Supprimer « ${title} » ?`, message: "Cette action est définitive. Elle est enregistrée dans le journal d'audit.", confirm: "Supprimer", danger: true }))) return;
    const done = busy(btn, "Suppression…");
    try {
      await api("DELETE", `/api/e/${name}/${id}`);
      toast("Enregistrement supprimé");
      FOCUS_TITLE = true;
      go(`#/e/${name}`);
    } catch (x) {
      done();
      toastError(x);
    }
  });
  root.querySelector("#upload-btn")?.addEventListener("click", () => root.querySelector("#upload").click());
  root.querySelector("#upload")?.addEventListener("change", async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    const btn = root.querySelector("#upload-btn");
    const done = busy(btn, "Envoi…");
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      await api("POST", `/api/e/${name}/${id}/files`, { filename: file.name, mime: file.type || "application/octet-stream", content_base64: btoa(bin) });
      AFTER_RENDER = () => {
        toast(`Fichier joint : ${file.name}`);
        root.querySelector("#upload-btn")?.focus();
      };
      route();
    } catch (x) {
      done();
      toastError(x);
    }
  });
}

/* Éditeur de document à lignes --------------------------------------------- */
/**
 * Lignes d'un document : tableau, ajout d'une ligne (avec aperçu du calcul par le serveur quand le
 * modèle métier la calcule : POST /api/rules/preview), puis totaux recalculés et renvoyés par le serveur.
 */
function documentBlock(e, r, doc, lines, rules) {
  const { le, via, ruled } = doc;
  const av = rules?.active_version ?? activeVersion();
  const docBound = (rules?.bindings ?? bindings()).some((b) => b.entity === e.name && b.scope === "document");
  const historical = !!r._migrated;
  // Mêmes règles que le serveur : les lignes d'un document historique protégé ne sont jamais modifiables
  const lockedByHistory = isProtectedRecord(e, r);
  const editable = !lockedByHistory && can("editor") && allowed(le, "create");
  const cols = [...listColumns(le, le.list_fields, { exclude: [via] }), ...le.fields.filter((f) => f.computed_by_rules && !le.list_fields.includes(f.name))];
  const rows = lines?.rows ?? [];
  const canDeleteLine = editable && allowed(le, "delete");
  // Nom d'une ligne : sa première colonne (ex. la référence choisie), sinon « <libellé> #id »
  const lineName = (x) => {
    const v = cols[0] ? plain(cols[0], x?.[cols[0].name], x?._refs?.[cols[0].name]) : "—";
    return v === "—" ? titleOf(le, x) : v;
  };
  const table = rows.length
    ? rowsTable(le, cols, rows, {
        caption: `${le.label} de ${headingOf(e, r)}`,
        tail: canDeleteLine ? (x) => `<button class="btn quiet sm danger-text" type="button" data-del-line="${x.id}">${icon("trash")}Supprimer<span class="sr"> la ligne ${esc(lineName(x))}</span></button>` : null,
      })
    : `<p class="empty">${historical ? "Aucune ligne migrée pour ce document." : editable ? "Aucune ligne pour l'instant : ajoutez la première ci-dessous." : "Aucune ligne pour l'instant."}</p>`;
  const more = lines && lines.total > rows.length ? `<p class="panel-foot"><a href="#/e/${le.name}?${via}=${r.id}">Voir les ${esc(int(lines.total))} lignes${icon("chevron")}</a></p>` : "";
  const uncomputed = historical ? le.fields.filter((f) => f.computed_by_rules && rows.length && rows.every((x) => empty(x[f.name]))) : [];
  const uncomputedNote = uncomputed.length ? `<p class="note-line">${esc(uncomputed.map((f) => `« ${f.label} »`).join(", "))} : non calculé pour les lignes historiques. Le document conserve ses totaux d'origine.</p>` : "";

  // État du calcul et version du modèle utilisée par ce document
  let status;
  let reprice = "";
  if (lockedByHistory) status = `${lockStamp()} Montants d'origine conservés tels qu'enregistrés dans ${esc(META.app.source_system || "l'ancien logiciel")} : jamais recalculés.`;
  else if (historical) status = `<span class="stamp migrated">${icon("archive")}Migré</span> Document historique : ses totaux d'origine sont conservés et ne sont pas recalculés.`;
  else if (!ruled) status = `<span class="stamp here"><span class="dot" aria-hidden="true"></span>Calculé par le serveur</span> Les totaux sont recalculés par le serveur à chaque ligne enregistrée.`;
  else if (!docBound) status = `<span class="stamp neutral">Non calculé</span> Le modèle métier actif ne calcule pas ce document : ses montants ne sont pas recalculés automatiquement.`;
  else {
    const v = r._rules_version;
    status = v
      ? `<span class="stamp here"><span class="dot" aria-hidden="true"></span>Calculé par le serveur</span> Avec le <a href="#/modele">${esc(modelLabel(v))}</a>${av && av !== v ? ` · version active : <a href="#/modele">${esc(modelLabel(av))}</a>` : av === v ? " (version active)" : ""}.`
      : `<span class="stamp neutral">Pas encore calculé</span> Ce document n'a pas encore été calculé par le modèle métier.`;
    if (av && av !== v && can("editor") && allowed(e, "reprice")) reprice = `<button class="btn secondary sm" type="button" id="reprice">Recalculer avec la version active (v${esc(av)})</button>`;
  }
  // Totaux : champs calculés par le modèle métier, sinon agrégats et formules déclarés par la spécification
  const totalNames = new Set([...e.fields.filter((f) => f.computed_by_rules).map((f) => f.name), ...(!ruled ? [...(e.aggregates ?? []).map((a) => a.field), ...(e.computed ?? []).map((c) => c.field)] : [])]);
  const totals = e.fields.filter((f) => totalNames.has(f.name));
  const totalsNote = historical
    ? "Montants d'origine (historique), non recalculés."
    : ruled
      ? r._rules_version
        ? `Totaux calculés et enregistrés par le serveur (${esc(modelLabel(r._rules_version))}).`
        : "Totaux non calculés par le modèle métier."
      : "Totaux calculés et enregistrés par le serveur à partir des lignes.";
  const totalsHtml = totals.length
    ? `<div class="totals"><dl>${totals.map((f) => `<div><dt>${esc(f.label)}</dt><dd class="num">${format(f, r[f.name])}</dd></div>`).join("")}</dl><p class="totals-note">${totalsNote}</p></div>`
    : "";

  // Ligne à ajouter : champs saisissables (ni la référence au document, ni les champs calculés, ni les champs
  // techniques) ; si la spécification déclare des champs essentiels, seulement ceux-là (et les obligatoires)
  const inputs = fieldGroups(le).essential.filter((f) => f.name !== via && !f.computed_by_rules && !(f.accounting && historical));
  const computedLine = le.fields.filter((f) => f.computed_by_rules);
  // Une ligne est calculée avec la version du document (épinglée), sinon avec la version active
  const lineVersion = r._rules_version ?? av;
  const withPreview = ruled && isLine(le);
  const form = editable
    ? `<form id="line-form" class="line-form" novalidate aria-labelledby="lf-title"><h3 id="lf-title">Ajouter une ligne</h3>
        <div class="line-fields">${inputs.map((f) => fieldControl(le, f, null, { idPrefix: "ln", compact: true })).join("")}</div>
        ${computedLine.length ? `<p class="hint-line">${icon("calc")}${esc(computedLine.map((f) => f.label).join(", "))} : ${computedLine.length > 1 ? "calculés" : "calculé"} par le serveur à l'enregistrement${lineVersion ? ` (${esc(modelLabel(lineVersion))})` : ""}, jamais saisis.</p>` : ""}
        ${withPreview ? '<div id="line-preview" class="preview-zone" aria-live="polite"></div>' : ""}
        <div id="line-err"></div>
        <div class="line-actions"><button class="btn primary" type="submit">${icon("plus")}Ajouter la ligne</button></div></form>`
    : lockedByHistory
      ? ""
      : !can("editor")
        ? '<p class="note-line">Votre rôle (lecture) ne permet pas d\'ajouter des lignes.</p>'
        : "";

  const html = `<section class="panel doc" id="doc" aria-labelledby="doc-title"><header class="panel-head"><h2 id="doc-title" tabindex="-1">${esc(le.label)} <span class="count">(${esc(int(lines?.total ?? 0))})</span></h2>${reprice ? `<div class="panel-actions">${reprice}</div>` : ""}</header>
      <div class="calc-status">${status}</div><div id="doc-err" class="pad-x"></div>
      ${table}${more}${uncomputedNote}${form}${totalsHtml}</section>`;

  const bind = () => {
    const sec = root.querySelector("#doc");
    if (!sec) return;
    sec.querySelector("#reprice")?.addEventListener("click", async (ev) => {
      const btn = ev.currentTarget;
      const ok = await confirmDialog({
        title: `Recalculer « ${headingOf(e, r)} » ?`,
        message: `Le serveur recalcule ce document avec la version active du modèle métier (v${av}).\nSes montants actuels${r._rules_version ? ` (calculés avec la v${r._rules_version})` : ""} seront remplacés. L'opération est tracée dans le journal.`,
        confirm: "Recalculer",
      });
      if (!ok) return;
      const done = busy(btn, "Recalcul…");
      try {
        const out = await api("POST", `/api/e/${e.name}/${r.id}/reprice`);
        AFTER_RENDER = () => toast(`Document recalculé par le serveur (${modelLabel(out._rules_version)})`);
        route();
      } catch (x) {
        done();
        sec.querySelector("#doc-err").innerHTML = problem(x);
      }
    });
    sec.querySelectorAll("[data-del-line]").forEach((b) =>
      b.addEventListener("click", async () => {
        const x = rows.find((y) => String(y.id) === b.dataset.delLine);
        if (!(await confirmDialog({ title: `Supprimer la ligne « ${lineName(x)} » ?`, message: "Les totaux du document seront recalculés par le serveur. L'opération est tracée dans le journal.", confirm: "Supprimer la ligne", danger: true }))) return;
        const done = busy(b, "Suppression…");
        try {
          await api("DELETE", `/api/e/${le.name}/${b.dataset.delLine}`);
          AFTER_RENDER = () => {
            toast("Ligne supprimée : totaux recalculés par le serveur");
            root.querySelector("#doc-title")?.focus();
          };
          route();
        } catch (err) {
          done();
          sec.querySelector("#doc-err").innerHTML = problem(err);
        }
      }),
    );
    const f = sec.querySelector("#line-form");
    if (!f) return;
    bindPickers(f);
    liveClear(f);
    const preview = withPreview ? attachPreview(f, le, { fields: inputs, fixed: { [via]: r.id }, panel: f.querySelector("#line-preview") }) : null;
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      if (f.dataset.busy) return;
      const err = f.querySelector("#line-err");
      err.innerHTML = "";
      clearErrors(f);
      const errors = validate(f, inputs);
      if (errors.length) return markErrors(f, errors.map((x) => toControl(f, x)), { summary: false });
      let body;
      try {
        body = { ...collect(f, inputs), [via]: r.id };
      } catch (x) {
        err.innerHTML = problem(x);
        return;
      }
      f.dataset.busy = "1";
      const done = busy(f.querySelector('button[type="submit"]'), "Enregistrement…");
      preview?.cancel();
      try {
        const saved = await api("POST", `/api/e/${le.name}`, body);
        AFTER_RENDER = () => {
          toast(`Ligne enregistrée : totaux recalculés par le serveur${saved._rules_version ? ` (${modelLabel(saved._rules_version)})` : ""}`);
          const first = root.querySelector("#line-form .picker-input, #line-form input:not([type=hidden]), #line-form select");
          first?.focus();
        };
        await route();
      } catch (x) {
        delete f.dataset.busy;
        done();
        const fe = fieldErrors(x, inputs);
        if (fe.length) markErrors(f, fe.map((y) => toControl(f, y)), { summary: false });
        else err.innerHTML = problem(x);
      }
    };
  };
  return { html, bind };
}

/* Saisie --------------------------------------------------------------------- */
function hintFor(f) {
  switch (f.type) {
    case "money":
      return `Montant${CUR() === "EUR" ? " en euros" : ""}, ex. ${esc(money(123456))}`;
    case "integer":
      return "Nombre entier";
    case "decimal":
      return "Nombre, ex. 12,5";
    case "percent":
      return "En %, ex. 5 ou 12,5";
    case "reference": {
      const t = entity(f.references);
      const by = fieldOf(t, t?.title_field)?.label;
      return by ? `Recherchez par ${esc(lower(by))}, puis choisissez dans la liste` : "Tapez quelques lettres puis choisissez dans la liste";
    }
    case "email":
      return "Exemple : nom@entreprise.fr";
    default:
      return "";
  }
}
/** Contrôle de saisie d'un champ : libellé associé, aide, erreur liée (aria-describedby), obligatoire. */
function fieldControl(e, f, v, { idPrefix = "f", title = null, compact = false } = {}) {
  const id = `${idPrefix}-${f.name}`;
  const req = f.required ? " required" : "";
  const hint = compact && f.type !== "reference" ? "" : hintFor(f);
  const aria = ` aria-describedby="${hint ? `${id}-hint ` : ""}${id}-err"`;
  const label = `${esc(f.label)}${f.required ? '<span class="req" aria-hidden="true"> *</span><span class="sr"> (obligatoire)</span>' : ""}`;
  const wide = f.type === "reference" || (!compact && f.type === "text" && ((f.max_length ?? 0) > 200 || /note|remarque|comment|description/.test(f.name)));
  const wrap = (control) => `<div class="field${wide ? " wide" : ""}"><label for="${id}">${label}</label>${control}${hint ? `<p class="hint" id="${id}-hint">${hint}</p>` : ""}<p class="field-error" id="${id}-err" hidden></p></div>`;
  switch (f.type) {
    case "boolean":
      // Trois états : une valeur vide de l'historique reste vide (jamais transformée en « Non »)
      return wrap(`<select id="${id}" name="${esc(f.name)}"${req}${aria}><option value=""${v === null || v === undefined ? " selected" : ""}>—</option><option value="1"${v === 1 || v === true ? " selected" : ""}>Oui</option><option value="0"${v === 0 || v === false ? " selected" : ""}>Non</option></select>`);
    case "enum":
      return wrap(`<select id="${id}" name="${esc(f.name)}"${req}${aria}><option value="">—</option>${(f.options ?? []).map((o) => `<option value="${esc(o.value)}"${o.value === v ? " selected" : ""}>${esc(optionLabel(f, o.value))}</option>`).join("")}</select>`);
    case "date":
      return wrap(`<input type="date" id="${id}" name="${esc(f.name)}" value="${esc(v ?? "")}"${req}${aria}>`);
    case "money":
      return wrap(`<input type="text" inputmode="decimal" id="${id}" name="${esc(f.name)}" value="${empty(v) ? "" : esc((Number(v) / 100).toFixed(2).replace(".", ","))}"${req}${aria} autocomplete="off" class="num-input">`);
    case "integer":
      return wrap(`<input type="text" inputmode="numeric" id="${id}" name="${esc(f.name)}" value="${esc(v ?? "")}"${req}${aria} autocomplete="off" class="num-input">`);
    case "decimal":
    case "percent":
      return wrap(`<input type="text" inputmode="decimal" id="${id}" name="${esc(f.name)}" value="${esc(empty(v) ? "" : String(v).replace(".", ","))}"${req}${aria} autocomplete="off" class="num-input">`);
    case "reference": {
      const t = entity(f.references);
      return wrap(
        `<div class="picker" data-picker data-ref="${esc(f.references)}"><div class="input-icon">${icon("search")}<input type="text" class="picker-input" id="${id}" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${id}-list" autocomplete="off" placeholder="Rechercher : ${esc(t?.label_singular ?? t?.label ?? f.references)}" value="${esc(empty(v) ? "" : (title ?? `#${v}`))}"${req}${aria}></div><input type="hidden" name="${esc(f.name)}" value="${esc(v ?? "")}"><ul class="picker-list" id="${id}-list" role="listbox" aria-label="${esc(t?.label ?? f.label)}" hidden></ul></div>`,
      );
    }
    case "email":
      return wrap(`<input type="email" id="${id}" name="${esc(f.name)}" value="${esc(v ?? "")}"${req}${aria} autocomplete="off" spellcheck="false">`);
    case "phone":
      return wrap(`<input type="tel" id="${id}" name="${esc(f.name)}" value="${esc(v ?? "")}"${req}${aria} autocomplete="off">`);
    default:
      return wide ? wrap(`<textarea id="${id}" name="${esc(f.name)}"${req}${aria}>${esc(v ?? "")}</textarea>`) : wrap(`<input type="text" id="${id}" name="${esc(f.name)}" value="${esc(v ?? "")}"${req}${aria} autocomplete="off">`);
  }
}
/** Champ affiché en lecture seule (calculé, ou valeur historique protégée) : jamais envoyé. */
function readOnlyField(e, f, r, reason) {
  return `<div class="field ro${f.type === "reference" ? " wide" : ""}"><span class="lbl">${esc(f.label)}</span><div class="ro-value">${r?.id ? format(f, r[f.name], r._refs?.[f.name]) : '<span class="muted">—</span>'}</div><p class="hint">${icon(f.computed_by_rules || /Calcul/.test(reason) ? "calc" : "lock")}${esc(reason)}</p></div>`;
}

/** Valeurs saisies (types de stockage : montants en centimes entiers). Lève une erreur de saisie. */
function collect(form, fields, { partial = false } = {}) {
  const body = {};
  for (const f of fields) {
    const el = form.elements.namedItem(f.name);
    if (!el || el.disabled) continue;
    const raw = typeof el.value === "string" ? el.value.trim() : "";
    if (f.type === "boolean") body[f.name] = raw === "" ? null : raw === "1" ? 1 : 0;
    else if (f.type === "money") body[f.name] = raw ? parseMoney(raw) : null;
    else if (f.type === "reference") {
      const txt = el.closest("[data-picker]")?.querySelector(".picker-input")?.value.trim() ?? "";
      if (txt && !raw) throw invalid(`${f.label} : choisissez une valeur dans la liste proposée`);
      body[f.name] = raw ? Number(raw) : null;
    } else if (f.type === "integer") body[f.name] = raw === "" ? null : /^-?\d+$/.test(raw) ? Number(raw) : raw;
    else if (f.type === "decimal" || f.type === "percent") {
      const n = Number(raw.replace(",", "."));
      body[f.name] = raw === "" ? null : Number.isFinite(n) ? n : raw;
    } else body[f.name] = raw === "" ? null : f.type === "text" ? el.value : raw;
    if (partial && body[f.name] === null) delete body[f.name];
  }
  return body;
}
/** Contrôles avant l'envoi (le serveur revérifie tout) : obligatoire, montants, nombres, e-mail, dates. */
function validate(form, fields) {
  const out = [];
  for (const f of fields) {
    const el = form.elements.namedItem(f.name);
    if (!el || el.disabled) continue;
    const raw = String(el.value ?? "").trim();
    if (f.type === "reference") {
      const txt = el.closest("[data-picker]")?.querySelector(".picker-input")?.value.trim() ?? "";
      if (txt && !raw) out.push({ f, message: "Choisissez une valeur dans la liste proposée" });
      else if (f.required && !raw) out.push({ f, message: "Champ obligatoire" });
      continue;
    }
    if (!raw) {
      if (f.required) out.push({ f, message: f.type === "date" && el.validity?.badInput ? "Date incomplète ou invalide" : "Champ obligatoire" });
      continue;
    }
    if (f.type === "money") {
      try {
        parseMoney(raw);
      } catch {
        out.push({ f, message: `Montant invalide, ex. ${money(123456)}` });
      }
    } else if (f.type === "integer" && !/^-?\d+$/.test(raw)) out.push({ f, message: "Nombre entier attendu" });
    else if ((f.type === "decimal" || f.type === "percent") && !Number.isFinite(Number(raw.replace(",", ".")))) out.push({ f, message: "Nombre attendu, ex. 12,5" });
    else if (f.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) out.push({ f, message: "Adresse e-mail invalide, ex. nom@entreprise.fr" });
    else if (f.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) out.push({ f, message: "Date invalide" });
  }
  return out;
}
/** Erreur renvoyée par le serveur → champs concernés (libellé en tête du message, obligatoires, doublon). */
function fieldErrors(x, fields) {
  const msg = String(x?.message ?? "");
  const out = [];
  if (x?.details?.field) {
    const f = fields.find((y) => y.name === x.details.field);
    if (f) out.push({ f, message: msg });
  }
  let m = /^Champs obligatoires : (.+)$/.exec(msg);
  if (m)
    for (const l of m[1].split(", ")) {
      const f = fields.find((y) => y.label === l.trim());
      if (f) out.push({ f, message: "Champ obligatoire" });
    }
  m = /^Valeur déjà utilisée \((?:[^.()]+\.)?([^()]+)\)$/.exec(msg);
  if (m) {
    const f = fields.find((y) => y.name === m[1].trim());
    if (f) out.push({ f, message: "Valeur déjà utilisée par un autre enregistrement" });
  }
  if (!out.length) {
    const f = [...fields].sort((a, b) => b.label.length - a.label.length).find((y) => msg.startsWith(`${y.label} : `));
    if (f) out.push({ f, message: cap(msg.slice(f.label.length + 3)) });
  }
  return out;
}
/** Champ de la spécification → contrôle visible du formulaire (le sélecteur de référence pour une référence). */
function toControl(form, { f, message }) {
  const el = form.elements.namedItem(f.name);
  const ctl = el?.type === "hidden" ? el.closest("[data-picker]")?.querySelector(".picker-input") : el;
  return { id: ctl?.id ?? "", label: f.label, message };
}

/** Sélecteur d'une référence : liste de l'entité référencée (GET /api/e/<entité>?q=…). */
function bindPickers(scope) {
  scope.querySelectorAll("[data-picker]").forEach((box) => {
    const input = box.querySelector(".picker-input");
    const hidden = box.querySelector('input[type="hidden"]');
    const list = box.querySelector(".picker-list");
    const t = entity(box.dataset.ref);
    if (!t) return;
    const extra = listColumns(t, t.list_fields, { exclude: [t.title_field], max: 3 }).filter((f) => f.type !== "reference" && f.name !== t.title_field);
    // Choix rangés par titre (ordre alphabétique, ou numérique pour des numéros)
    const order = fieldOf(t, t.title_field) ? `&sort=${encodeURIComponent(t.title_field)}` : "";
    let timer = null;
    let seq = 0;
    let items = [];
    let active = -1;
    const close = () => {
      list.hidden = true;
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
      active = -1;
    };
    const mark = (i) => {
      active = i;
      list.querySelectorAll("[role=option]").forEach((li, k) => li.setAttribute("aria-selected", String(k === i)));
      const li = list.querySelector(`#${CSS.escape(input.id)}-o${i}`);
      if (li) {
        input.setAttribute("aria-activedescendant", li.id);
        li.scrollIntoView({ block: "nearest" });
      }
    };
    const load = async () => {
      const my = ++seq;
      const q = input.value.trim();
      list.innerHTML = '<li class="picker-msg" role="presentation">Recherche…</li>';
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
      try {
        const res = await api("GET", `/api/e/${t.name}?per=20${order}${q ? `&q=${encodeURIComponent(q)}` : ""}`);
        if (my !== seq) return;
        items = res.rows;
        active = -1;
        list.innerHTML = items.length
          ? items.map((x, i) => `<li role="option" id="${esc(input.id)}-o${i}" data-i="${i}" aria-selected="false"><b>${esc(titleOf(t, x))}</b>${extra.length ? `<span class="opt-sub">${extra.map((f) => esc(plain(f, x[f.name], x._refs?.[f.name]))).join(" · ")}</span>` : ""}</li>`).join("") +
            (res.total > items.length ? `<li class="picker-msg" role="presentation">${esc(plural(res.total - items.length, "autre résultat", "autres résultats"))} : précisez la recherche</li>` : "")
          : `<li class="picker-msg" role="presentation">Aucun résultat${q ? ` pour « ${esc(q)} »` : ""}</li>`;
      } catch (x) {
        if (my === seq && !x.handled) list.innerHTML = `<li class="picker-msg error" role="presentation">${esc(explain(x).message)}</li>`;
      }
    };
    const choose = (i) => {
      const x = items[i];
      if (!x) return;
      hidden.value = String(x.id);
      input.value = titleOf(t, x);
      input.removeAttribute("aria-invalid");
      close();
      hidden.dispatchEvent(new Event("change", { bubbles: true }));
    };
    input.addEventListener("input", () => {
      if (hidden.value) {
        hidden.value = "";
        hidden.dispatchEvent(new Event("change", { bubbles: true }));
      }
      clearTimeout(timer);
      timer = setTimeout(load, 220);
    });
    // La liste s'ouvre sur une action de la personne (clic, saisie, flèche), pas sur un focus programmé
    input.addEventListener("click", () => {
      if (list.hidden && !hidden.value) load();
    });
    input.addEventListener("blur", () => {
      close();
      if (input.value.trim() && !hidden.value) input.setAttribute("aria-invalid", "true");
    });
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
        ev.preventDefault();
        if (list.hidden) return void load();
        if (!items.length) return;
        mark(ev.key === "ArrowDown" ? (active + 1) % items.length : (active - 1 + items.length) % items.length);
      } else if (ev.key === "Enter" && !list.hidden && active >= 0) {
        ev.preventDefault();
        choose(active);
      } else if (ev.key === "Escape" && !list.hidden) {
        ev.preventDefault();
        ev.stopPropagation();
        close();
      }
    });
    list.addEventListener("mousedown", (ev) => ev.preventDefault());
    list.addEventListener("click", (ev) => {
      const li = ev.target.closest("[data-i]");
      if (li) choose(Number(li.dataset.i));
    });
  });
}

/** Aperçu du calcul avant enregistrement, demandé au serveur (POST /api/rules/preview). */
function attachPreview(form, e, { fields, fixed = {}, id = null, panel: zone }) {
  let timer = null;
  let seq = 0;
  const labels = fields.filter((f) => f.required).map((f) => f.label);
  const idle = () => `<div class="pv idle"><p class="pv-title">Aperçu du calcul</p><p>${labels.length ? `Renseignez ${esc(labels.join(", "))} : ` : ""}le serveur calcule la ligne avant l'enregistrement.</p></div>`;
  const run = async () => {
    const my = ++seq;
    let values;
    try {
      values = collect(form, fields, { partial: true });
    } catch (x) {
      zone.innerHTML = `<div class="pv idle"><p class="pv-title">Aperçu en attente</p><p>${esc(x.message)}</p></div>`;
      return;
    }
    if (!Object.keys(values).some((k) => fields.find((f) => f.name === k)?.type !== "boolean")) {
      zone.innerHTML = idle();
      return;
    }
    zone.classList.add("busy");
    try {
      const res = await api("POST", "/api/rules/preview", { entity: e.name, ...(id ? { id } : {}), values: { ...values, ...fixed } });
      if (my === seq) zone.innerHTML = previewHtml(e, res);
    } catch (x) {
      if (my === seq && !x.handled) zone.innerHTML = problem(x).replace(' role="alert"', "");
    } finally {
      if (my === seq) zone.classList.remove("busy");
    }
  };
  const schedule = (delay) => {
    clearTimeout(timer);
    timer = setTimeout(run, delay);
  };
  form.addEventListener("input", () => schedule(350));
  form.addEventListener("change", () => schedule(0));
  zone.innerHTML = idle();
  return {
    cancel: () => {
      clearTimeout(timer);
      seq++;
      zone.classList.remove("busy");
    },
  };
}
function previewHtml(e, res) {
  const where = res.version ? `${cap(modelLabel(res.version))}${res.module ? ` · module ${res.module}` : ""}` : "";
  if (res.status === "ok") {
    const vals = Object.entries(res.values ?? {})
      .map(([k, v]) => {
        const f = fieldOf(e, k);
        return `<div><dt>${esc(f?.label ?? k)}</dt><dd class="num">${f ? format(f, v) : esc(v)}</dd></div>`;
      })
      .join("");
    const steps = (res.steps ?? [])
      .map(
        (s) =>
          `<li><span class="mono rid">${esc(s.rule_id ?? "")}</span><span class="lbl">${esc(s.label)}</span>${
            s.after !== null && s.after !== undefined ? `<span class="num res">= ${esc(nb(s.after))}${s.delta ? ` <span class="muted">(${s.delta > 0 ? "+" : "−"}${esc(nb(Math.abs(s.delta)))})</span>` : ""}</span>` : ""
          }</li>`,
      )
      .join("");
    return `<div class="pv ok"><div class="pv-head"><p class="pv-title">Aperçu du calcul</p><span>${esc(where)}</span></div><dl class="pv-values">${vals || '<div><dd class="muted">Aucune valeur calculée.</dd></div>'}</dl>${
      steps ? `<details class="pv-steps"><summary>Étapes appliquées par le modèle (${esc(int(res.steps.length))})</summary><ol>${steps}</ol></details>` : ""
    }<p class="pv-foot">Calcul effectué par le serveur ; rien n'est enregistré avant « Ajouter la ligne ». Les étapes indiquent la valeur obtenue après chaque règle, dans les unités du modèle.</p></div>`;
  }
  const msg = String(res.message ?? "");
  const blocking = !["none", "historical"].includes(res.status);
  const title = res.status === "none" ? "Pas de calcul pour cette saisie" : res.status === "historical" ? "Enregistrement historique" : res.status === "rejected" ? "Refusé par une règle du modèle métier" : /^Calcul impossible/i.test(msg) ? "Calcul impossible" : "Calcul non disponible";
  return `<div class="pv ${blocking ? "warn" : "idle"}"><div class="pv-head"><p class="pv-title">${esc(title)}</p>${where ? `<span>${esc(where)}</span>` : ""}</div><p>${esc(cap(msg.replace(/^Calcul (impossible|non disponible)\s*:\s*/i, "")))}</p>${blocking ? '<p class="pv-foot">Le serveur refusera l\'enregistrement tant que ce calcul est impossible.</p>' : ""}</div>`;
}

/**
 * Disponibilité pendant la saisie d'un élément dessiné dans un planning : dès que la ressource et la date de
 * début sont choisies, le serveur dit ce qui occupe déjà cette ressource sur la période (avertissement, jamais
 * bloquant : la décision reste à la personne).
 */
function attachAvailability(form, e, v, id, zone) {
  if (!zone) return;
  let timer = null;
  let seq = 0;
  const value = (n) => String(form.elements.namedItem(n)?.value ?? "").trim();
  const run = async () => {
    const my = ++seq;
    const res = value(v.resource);
    const start = value(v.start);
    const end = value(v.end);
    if (!res || !validIso(start)) {
      zone.innerHTML = "";
      return;
    }
    const stop = validIso(end) && end > start ? end : addDays(start, 1);
    if (daysBetween(start, stop) > 90) {
      zone.innerHTML = "";
      return;
    }
    try {
      const data = await api("GET", `/api/views/${encodeURIComponent(v.name)}?from=${start}&to=${addDays(stop, -1)}`);
      if (my !== seq) return;
      const typed = form.elements.namedItem(v.resource)?.closest?.("[data-picker]")?.querySelector(".picker-input")?.value;
      const where = data.resources.find((x) => String(x.id) === res)?.title ?? data.items.find((x) => String(x.resource) === res)?.resource_title ?? (typed || `#${res}`);
      const clash = data.items.filter((x) => String(x.resource) === res && String(x.id) !== String(id ?? ""));
      zone.innerHTML = clash.length
        ? noticeHtml(
            "warn",
            `<ul class="avail-list">${clash
              .slice(0, 5)
              .map((x) => `<li><a href="#/e/${esc(e.name)}/${esc(x.id)}">${esc(x.title ?? `${e.label_singular ?? e.label} #${x.id}`)}</a> · ${esc(rangeLabel(x.start, x.end))}</li>`)
              .join("")}</ul><p class="notice-sub">Vous pouvez enregistrer quand même ; vérifiez d'abord qu'il ne s'agit pas d'un doublon.</p>`,
            `Période déjà occupée : ${where}`,
          )
        : noticeHtml("ok", esc(`${where} est libre ${rangeLabel(start, stop)}.`));
    } catch (x) {
      if (my === seq && !x.handled) zone.innerHTML = "";
    }
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(run, 250);
  };
  form.addEventListener("change", (ev) => {
    if ([v.resource, v.start, v.end].includes(ev.target.name)) schedule();
  });
  run();
}

/* Formulaire ---------------------------------------------------------------- */
async function viewForm(name, id, t) {
  const e = entity(name);
  const current = id ? (await api("GET", `/api/e/${name}/${id}`)).record : {};
  const p = params();
  const presets = {};
  const titles = {};
  const records = {};
  if (!id) {
    for (const f of e.fields) if (p.get(f.name) !== null && p.get(f.name) !== "") presets[f.name] = f.type === "reference" ? Number(p.get(f.name)) : p.get(f.name);
    await Promise.all(
      e.fields
        .filter((f) => f.type === "reference" && presets[f.name])
        .map(async (f) => {
          try {
            const x = await api("GET", `/api/e/${f.references}/${presets[f.name]}`);
            titles[f.name] = titleOf(entity(f.references), x.record);
            records[f.name] = x.record;
          } catch {}
        }),
    );
  }
  if (t !== NAV) return;
  // Ligne d'un document : le serveur la calcule avec la version épinglée du document (sinon la version active)
  const docVia = isLine(e) ? (bindings().find((b) => b.entity === e.name && b.scope === "line")?.document?.via ?? null) : null;
  const version = !isLine(e) ? null : !id && docVia && records[docVia] ? (records[docVia]._rules_version ?? activeVersion()) : "document";
  const back = id ? `#/e/${name}/${id}` : `#/e/${name}`;
  const pageTitle = id ? `Modifier · ${headingOf(e, current)}` : `Nouveau · ${e.label_singular ?? e.label}`;
  const crumbs = id ? [[`#/e/${name}`, e.label], [`#/e/${name}/${id}`, headingOf(e, current)]] : [[`#/e/${name}`, e.label]];
  if (id && isProtectedLine(e, current)) {
    const lp = lineParent(e);
    shell(
      `${alertBox("lock", "Historique protégé", `Cet enregistrement appartient à un document historique (${lp.parent.label_singular ?? lp.parent.label}) : il n'est pas modifiable. Le document conserve ses montants d'origine ; pour toute correction, créez un nouveau document.`).replace(' role="alert" tabindex="-1"', "")}<p><a class="btn secondary" href="${back}">${icon("back")}Retour à la fiche</a></p>`,
      { title: pageTitle, crumbs, badges: lockStamp("Historique protégé", true) },
    );
    return;
  }
  // Formulaire simple : champs essentiels d'abord (dans leur ordre), les autres repliés sous « Informations
  // complémentaires » (enregistrés et modifiables), les champs techniques jamais proposés à la saisie
  const groups = fieldGroups(e);
  const editable = [];
  const control = (f) => {
    const reason = lockReason(e, f, id ? current : {}, "form", version);
    if (reason) return readOnlyField(e, f, id ? current : null, reason);
    editable.push(f);
    return fieldControl(e, f, id ? current[f.name] : (presets[f.name] ?? null), { title: id ? (current._refs?.[f.name] ?? null) : (titles[f.name] ?? null) });
  };
  const controls = groups.essential.map(control).join("");
  const moreFilled = id ? groups.more.filter((f) => !empty(current[f.name])).length : 0;
  const moreOpen = !id && groups.more.some((f) => presets[f.name] !== undefined);
  const more = groups.more.length
    ? `<details class="more form-more" id="form-more"${moreOpen ? " open" : ""}><summary>Informations complémentaires <span class="count">(${esc(plural(groups.more.length, "champ", "champs"))}${id ? `, ${esc(plural(moreFilled, "renseigné", "renseignés"))}` : ""})</span></summary><p class="hint more-hint">Facultatif : à compléter seulement si besoin. Tout est enregistré avec la fiche.</p><div class="form-grid">${groups.more.map(control).join("")}</div></details>`
    : "";
  const planned = viewFor(e);
  const protRec = id && isProtectedRecord(e, current);
  const intro = protRec
    ? noticeHtml("lock", esc("Les valeurs historiques protégées et les montants calculés sont en lecture seule. Les autres informations restent modifiables ; chaque modification est tracée dans le journal. Si une modification touche une donnée utilisée par le calcul d'origine, le serveur la refuse."), "Historique protégé")
    : "";
  const withPreview = isLine(e) && can("editor");
  const required = editable.some((f) => f.required);
  shell(
    `${intro}<section class="panel form-panel"><form id="form" class="record-form" novalidate aria-labelledby="page-title">
      <div data-summary></div><div id="err"></div>
      ${required ? '<p class="form-legend"><span class="req" aria-hidden="true">*</span> Champ obligatoire</p>' : ""}
      <div class="form-grid">${controls}</div>
      ${planned ? '<div id="form-avail" class="avail-zone" aria-live="polite"></div>' : ""}
      ${more}
      ${withPreview ? '<div id="form-preview" class="preview-zone" aria-live="polite"></div>' : ""}
      ${id && current._migrated ? '<div class="field justification"><label for="f-justification">Motif de la modification</label><input type="text" id="f-justification" name="_justification" aria-describedby="f-justification-hint"><p class="hint" id="f-justification-hint">Facultatif : enregistré dans le journal d\'audit avec la modification.</p></div>' : ""}
      <div class="form-actions"><button class="btn primary" type="submit">${id ? "Enregistrer" : "Créer"}</button><a class="btn secondary" href="${back}">Annuler</a></div></form></section>`,
    { title: pageTitle, crumbs, badges: protRec ? lockStamp("Historique protégé", true) : "" },
  );
  const form = root.querySelector("#form");
  bindPickers(form);
  liveClear(form);
  const preview = withPreview ? attachPreview(form, e, { fields: editable, id, panel: form.querySelector("#form-preview") }) : null;
  if (planned) attachAvailability(form, e, planned, id, form.querySelector("#form-avail"));
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    if (form.dataset.busy) return;
    const err = form.querySelector("#err");
    err.innerHTML = "";
    clearErrors(form);
    const errors = validate(form, editable);
    if (errors.length) return markErrors(form, errors.map((x) => toControl(form, x)));
    let body;
    try {
      body = collect(form, editable);
    } catch (x) {
      err.innerHTML = problem(x);
      err.querySelector(".notice")?.focus();
      return;
    }
    if (id) for (const k of Object.keys(body)) if (body[k] === (current[k] ?? null)) delete body[k];
    const just = form.elements.namedItem("_justification")?.value.trim();
    if (just) body._justification = just;
    form.dataset.busy = "1";
    const done = busy(form.querySelector('button[type="submit"]'), "Enregistrement…");
    preview?.cancel();
    try {
      const saved = id ? await api("PUT", `/api/e/${name}/${id}`, body) : await api("POST", `/api/e/${name}`, body);
      toast(id ? "Modifications enregistrées" : "Enregistrement créé");
      FOCUS_TITLE = true;
      go(`#/e/${name}/${saved.id}`);
    } catch (x) {
      delete form.dataset.busy;
      done();
      const fe = fieldErrors(x, editable);
      if (fe.length) markErrors(form, fe.map((y) => toControl(form, y)));
      else {
        err.innerHTML = problem(x);
        err.querySelector(".notice")?.focus();
      }
    }
  };
}

/* Modèle métier ------------------------------------------------------------ */
async function viewModel(t) {
  const rules = await api("GET", "/api/rules");
  if (t !== NAV) return;
  const av = rules.active_version;
  const versions = rules.versions.length
    ? rowsTableStatic(
        ["Version", "Origine", "Publiée", "Modules"],
        [...rules.versions].reverse().map((v) => [
          `<b>v${esc(v.version)}</b>${v.version === av ? ' <span class="stamp here"><span class="dot" aria-hidden="true"></span>active</span>' : ""}`,
          v.source === "fixture" ? '<span class="stamp lock">Jeu de test</span>' : esc(SOURCE_LABEL[v.source] ?? v.source ?? "Non précisée"),
          `${esc(dateTime(v.published_at))}${v.published_by ? ` · ${esc(v.published_by)}` : ""}`,
          esc(plural((v.modules ?? []).length, "module", "modules")),
        ]),
        "Versions publiées du modèle métier",
      )
    : emptyMini("Aucun modèle métier publié : les nouveaux enregistrements ne sont pas calculés automatiquement.");
  const fixture = versionMeta(av)?.source === "fixture";
  // Les notes du modèle sont écrites pour l'équipe qui l'a produit : réservées aux administrateurs, repliées
  const notes = av && versionMeta(av)?.notes && can("admin") ? `<details class="raw"><summary>Détails techniques (administrateurs)</summary><p class="muted small">${esc(versionMeta(av).notes)}</p></details>` : "";
  // Nom lisible d'un module : le calcul qu'il assure (ligne ou document, et la table concernée)
  const moduleLabel = (k) => {
    const b = (rules.bindings ?? []).find((x) => x.module === k);
    const be = b ? entity(b.entity) : null;
    return b ? `${b.scope === "line" ? "Calcul de chaque ligne" : "Calcul du document"} · ${be?.label ?? b.entity}` : k;
  };
  const binds = (rules.bindings ?? [])
    .map((b) => {
      const be = entity(b.entity);
      const outs = Object.values(b.outputs ?? {}).map((n) => fieldOf(be, n)?.label ?? n);
      return `<li><p><b>${esc(be?.label ?? b.entity)}</b> · ${b.scope === "line" ? "calcul de chaque ligne" : "calcul du document"}</p><p class="muted small">Champs calculés : ${esc(outs.join(", ") || "—")}</p></li>`;
    })
    .join("");
  const modules = Object.entries(rules.modules ?? {})
    .map(
      ([k, m]) =>
        `<details class="raw module"><summary>${esc(moduleLabel(k))} · ${esc(plural((m.rules ?? []).length, "règle", "règles"))}</summary><p class="muted small">Identifiant du module : <span class="mono">${esc(k)}</span></p>${rowsTableStatic(
          ["Règle", "Description", "Statut", "#Confiance déclarée"],
          (m.rules ?? []).map((x) => [
            `<span class="mono">${esc(x.id)}</span>`,
            esc(x.description ?? x.type ?? "—"),
            x.validation_status ? `<span class="stamp ${x.validation_status === "validated" ? "here" : "lock"}">${esc(STATUS_LABEL[x.validation_status] ?? x.validation_status)}</span>` : '<span class="muted">Non précisé</span>',
            typeof x.confidence === "number" ? `${esc(nb(Math.round(x.confidence * 100)))} %` : "—",
          ]),
          `Règles du module ${k}`,
        )}</details>`,
    )
    .join("");
  const nr = META.not_rebuilt ?? [];
  const notRebuilt = nr.length
    ? panel(
        "Éléments non reconstruits",
        rowsTableStatic(
          ["Type", "Élément", "Raison"],
          nr.map((x) => [esc(KIND_LABEL[x.kind] ?? x.kind), esc(x.name), esc(x.reason)]),
          "Éléments non reconstruits",
        ),
        { count: nr.length, raw: true },
      )
    : "";
  shell(
    `${fixture ? noticeHtml("warn", esc(`La version active (v${av}) provient d'un jeu de test au format du modèle métier : elle sert à vérifier le logiciel et ne résulte pas de l'analyse de l'ancien logiciel.`), "Jeu de test") : ""}
     ${noticeHtml("info", esc("Le modèle métier calcule les nouveaux enregistrements sur le serveur. Chaque enregistrement garde la version avec laquelle il a été calculé ; les enregistrements historiques migrés conservent leurs montants d'origine et ne sont jamais recalculés."))}
     <div class="detail-grid"><div class="detail-main">${panel("Versions publiées", versions, { raw: !!rules.versions.length, actions: av ? `<span class="stamp here"><span class="dot" aria-hidden="true"></span>active : v${esc(av)}</span>` : "" })}
       ${modules ? panel("Règles de la version active", `${notes}${modules}<p class="muted small">Confiance déclarée par l'auteur du modèle ; elle n'est pas mesurée par ce logiciel.</p>`, {}) : ""}</div>
       <div class="detail-side">${binds ? panel("Calculs en service", `<ul class="timeline">${binds}</ul>`, {}) : ""}${notRebuilt}</div></div>`,
    { title: "Modèle métier" },
  );
}

/* Mon mot de passe -------------------------------------------------------- */
async function viewAccount(t) {
  const me = await api("GET", "/api/auth/me");
  if (t !== NAV) return;
  shell(
    `<div class="narrow">
      ${panel(
        "Votre compte",
        `<dl class="kv-list"><div><dt>Identifiant</dt><dd>${esc(me.user)}</dd></div>${me.email && me.email !== me.user ? `<div><dt>Adresse e-mail</dt><dd>${esc(me.email)}</dd></div>` : ""}<div><dt>Rôle</dt><dd>${esc(ROLE_LABEL[me.role] ?? me.role)} <span class="muted">— ${esc(ROLE_HELP[me.role] ?? "")}</span></dd></div><div><dt>Mot de passe changé</dt><dd>${me.password_changed_at ? esc(dateTime(me.password_changed_at)) : '<span class="muted">jamais depuis la création du compte</span>'}</dd></div></dl>`,
        {},
      )}
      <section class="panel" aria-labelledby="pw-title"><header class="panel-head"><h2 id="pw-title">Changer mon mot de passe</h2></header>
        <form id="pw-form" class="panel-body stack-form" novalidate aria-labelledby="pw-title">
          <input type="text" name="username" value="${esc(me.user)}" autocomplete="username" hidden>
          <div data-summary></div><div id="pw-err"></div>
          <div class="field"><label for="pw-current">Mot de passe actuel</label>${pwInput("pw-current", "current", "current-password", "pw-current-err")}<p class="field-error" id="pw-current-err" hidden></p></div>
          <div class="field"><label for="pw-next">Nouveau mot de passe</label>${pwInput("pw-next", "next", "new-password", "pw-next-hint pw-next-err")}<p class="hint" id="pw-next-hint">12 caractères minimum. Une courte phrase de plusieurs mots est facile à retenir.</p><p class="field-error" id="pw-next-err" hidden></p></div>
          <div class="field"><label for="pw-confirm">Confirmez le nouveau mot de passe</label>${pwInput("pw-confirm", "confirm", "new-password", "pw-confirm-err")}<p class="field-error" id="pw-confirm-err" hidden></p></div>
          <p class="hint">Après le changement, vos autres sessions ouvertes (autres navigateurs ou appareils) sont fermées ; celle-ci reste ouverte.</p>
          <div class="form-actions"><button class="btn primary" type="submit">Changer le mot de passe</button></div>
        </form></section></div>`,
    { title: "Mon mot de passe" },
  );
  const form = root.querySelector("#pw-form");
  bindPasswordToggles(form);
  liveClear(form);
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    if (form.dataset.busy) return;
    clearErrors(form);
    root.querySelector("#pw-err").innerHTML = "";
    const v = (n) => form.elements.namedItem(n).value;
    const errs = [];
    if (!v("current")) errs.push({ id: "pw-current", label: "Mot de passe actuel", message: "Renseignez votre mot de passe actuel" });
    if (v("next").length < 12) errs.push({ id: "pw-next", label: "Nouveau mot de passe", message: `12 caractères minimum (${v("next").length} saisi${v("next").length > 1 ? "s" : ""})` });
    else if (v("next") === v("current")) errs.push({ id: "pw-next", label: "Nouveau mot de passe", message: "Le nouveau mot de passe doit être différent de l'actuel" });
    if (v("confirm") !== v("next")) errs.push({ id: "pw-confirm", label: "Confirmation", message: "Les deux saisies du nouveau mot de passe ne sont pas identiques" });
    if (errs.length) return markErrors(form, errs);
    form.dataset.busy = "1";
    const done = busy(form.querySelector('button[type="submit"]'), "Enregistrement…");
    try {
      await api("POST", "/api/auth/password", { current: v("current"), next: v("next") });
      AFTER_RENDER = () => {
        toast("Mot de passe changé. Vos autres sessions ont été fermées.");
        root.querySelector("#page-title")?.focus();
      };
      route();
    } catch (x) {
      delete form.dataset.busy;
      done();
      const map = { current: "pw-current", next: "pw-next" };
      if (map[x.details?.field]) markErrors(form, [{ id: map[x.details.field], label: "", message: x.message }]);
      else {
        root.querySelector("#pw-err").innerHTML = problem(x);
        root.querySelector("#pw-err .notice")?.focus();
      }
    }
  };
}

/* Administration --------------------------------------------------------- */
const adminTabs = (path) =>
  `<nav class="subnav" aria-label="Administration"><ul>${[
    ["#/admin", "/admin", "Utilisateurs et accès"],
    ["#/admin/sauvegardes", "/admin/sauvegardes", "Sauvegardes"],
    ["#/admin/journal", "/admin/journal", "Journal d'audit"],
  ]
    .map(([h, p, l]) => `<li><a href="${h}"${path === p ? ' aria-current="page"' : ""}>${esc(l)}</a></li>`)
    .join("")}</ul></nav>`;
const roleSelect = (id, value, extra = "") => `<select id="${id}"${extra}>${["viewer", "editor", "admin"].map((r) => `<option value="${r}"${r === value ? " selected" : ""}>${esc(ROLE_LABEL[r])}</option>`).join("")}</select>`;
/** Détail lisible d'une entrée du journal sans enregistrement (comptes, invitations, sauvegardes). */
function auditDetail(a) {
  let after = {};
  let before = {};
  try {
    after = a.after ? JSON.parse(a.after) : {};
    before = a.before ? JSON.parse(a.before) : {};
  } catch {}
  const parts = [];
  if (after.email) parts.push(after.email);
  if (after.username && a.action !== "user_updated") parts.push(after.username);
  if (a.action === "user_updated") {
    parts.push(after.username);
    if (before.role !== after.role) parts.push(`rôle : ${ROLE_LABEL[before.role] ?? before.role} → ${ROLE_LABEL[after.role] ?? after.role}`);
    if (before.disabled !== after.disabled) parts.push(after.disabled ? "compte désactivé" : "compte réactivé");
  } else if (after.role) parts.push(ROLE_LABEL[after.role] ?? after.role);
  if (after.expires_at) parts.push(`valable jusqu'au ${dateTime(after.expires_at)}`);
  if (after.name) parts.push(after.name);
  if (after.version) parts.push(`v${after.version}`);
  return parts.filter(Boolean).join(" · ");
}
async function viewAdmin(t, section) {
  const path = currentPath();
  if (section === "sauvegardes") return viewBackups(t, path);
  if (section === "journal") return viewAudit(t, path);
  const [users, invites] = await Promise.all([api("GET", "/api/admin/users"), api("GET", "/api/admin/invitations")]);
  if (t !== NAV) return;
  const fresh = FRESH_INVITE;
  FRESH_INVITE = null;
  const pending = invites.filter((i) => i.state === "pending");
  const past = invites.filter((i) => i.state !== "pending").slice(0, 20);
  const STATE = { consumed: "utilisée", revoked: "révoquée", expired: "expirée" };
  const freshBox = fresh
    ? `<div class="invite-result" id="invite-result" tabindex="-1"><p class="invite-result-title">${icon("check")}Lien d'invitation créé pour ${esc(fresh.email)} (${esc(ROLE_LABEL[fresh.role])})</p>
        <p>Copiez-le maintenant : <b>il ne sera plus affiché</b>. Transmettez-le à la personne par un canal sûr ; il ne sert qu'une fois et expire le ${esc(dateTime(fresh.expires_at))}.${fresh.existing_account ? " Un compte existe déjà pour cette adresse : le lien lui permettra de choisir un nouveau mot de passe." : ""}</p>
        <div class="copy-row"><label class="sr" for="inv-link">Lien d'invitation</label><input id="inv-link" type="text" readonly value="${esc(fresh.link)}" spellcheck="false"><button type="button" class="btn secondary" id="inv-copy">${icon("copy")}Copier le lien</button></div></div>`
    : "";
  const inviteForm = `<form id="invite-form" class="panel-body invite-form" novalidate aria-labelledby="inv-title">
      <div data-summary></div><div id="inv-err"></div>
      <div class="invite-grid">
        <div class="field"><label for="inv-email">Adresse e-mail</label><input id="inv-email" type="email" name="email" autocomplete="off" spellcheck="false" required aria-describedby="inv-email-hint inv-email-err"><p class="hint" id="inv-email-hint">Elle servira d'identifiant de connexion.</p><p class="field-error" id="inv-email-err" hidden></p></div>
        <div class="field"><label for="inv-role">Rôle</label>${roleSelect("inv-role", "editor", ' name="role" aria-describedby="inv-role-hint inv-role-err"')}<p class="hint" id="inv-role-hint">${esc(cap(ROLE_HELP.editor))}.</p><p class="field-error" id="inv-role-err" hidden></p></div>
        <div class="field"><label for="inv-hours">Validité du lien</label><select id="inv-hours" name="hours" aria-describedby="inv-hours-err"><option value="24">24 heures</option><option value="72" selected>3 jours</option><option value="168">7 jours</option></select><p class="field-error" id="inv-hours-err" hidden></p></div>
      </div>
      <div class="form-actions"><button class="btn primary" type="submit">${icon("link")}Créer le lien d'invitation</button></div>
    </form>`;
  const pendingTable = pending.length
    ? rowsTableStatic(
        ["Adresse e-mail", "Rôle", "Créée par", "Expire", "Action"],
        pending.map((i) => [
          `${esc(i.email)}${i.existing_account ? '<span class="muted small block">compte existant : nouveau mot de passe</span>' : ""}`,
          esc(ROLE_LABEL[i.role] ?? i.role),
          `${esc(i.created_by ?? "—")}<span class="muted small block">${esc(dateTime(i.created_at))}</span>`,
          esc(dateTime(i.expires_at)),
          `<button type="button" class="btn quiet sm danger-text" data-revoke="${i.id}" data-email="${esc(i.email)}">Révoquer<span class="sr"> l'invitation de ${esc(i.email)}</span></button>`,
        ]),
        "Invitations en attente",
      )
    : emptyMini("Aucune invitation en attente.");
  const pastList = past.length
    ? `<details class="raw past"><summary>Invitations passées (${esc(int(past.length))})</summary><ul class="plain-list">${past.map((i) => `<li>${esc(i.email)} · ${esc(ROLE_LABEL[i.role] ?? i.role)} · <span class="muted">${esc(STATE[i.state] ?? i.state)} ${esc(dateTime(i.consumed_at ?? i.revoked_at ?? i.expires_at))}</span></li>`).join("")}</ul></details>`
    : "";
  const admins = users.filter((u) => u.role === "admin" && !u.disabled).length;
  const usersTable = rowsTableStatic(
    ["Compte", "Rôle", "État", "Dernière connexion", "Action"],
    users.map((u) => {
      const lastAdmin = u.role === "admin" && !u.disabled && admins <= 1;
      const roleCell = `<div class="role-edit"><label class="sr" for="role-${u.id}">Rôle de ${esc(u.email ?? u.username)}</label>${roleSelect(`role-${u.id}`, u.role, ` data-role="${u.id}" data-current="${u.role}"${u.disabled ? " disabled" : ""}`)}<button type="button" class="btn secondary sm" data-apply="${u.id}" hidden>Appliquer</button></div>${lastAdmin ? '<span class="muted small block">seul administrateur actif</span>' : ""}`;
      const state = u.disabled ? '<span class="stamp neutral">Désactivé</span>' : '<span class="stamp here"><span class="dot" aria-hidden="true"></span>Actif</span>';
      const act = u.me
        ? '<span class="muted small">votre compte</span>'
        : `<button type="button" class="btn quiet sm${u.disabled ? "" : " danger-text"}" data-toggle="${u.id}" data-disabled="${u.disabled ? 1 : 0}" data-name="${esc(u.email ?? u.username)}">${u.disabled ? "Réactiver" : "Désactiver"}<span class="sr"> le compte ${esc(u.email ?? u.username)}</span></button>`;
      return [`<b>${esc(u.email ?? u.username)}</b>${u.me ? ' <span class="stamp neutral sm">vous</span>' : ""}${u.email && u.username !== u.email ? `<span class="muted small block">${esc(u.username)}</span>` : ""}`, roleCell, state, u.last_login_at ? timeTag(u.last_login_at) : '<span class="muted">jamais</span>', act];
    }),
    "Comptes du logiciel",
  );
  shell(
    `${adminTabs(path)}
     ${freshBox}
     <div class="detail-grid"><div class="detail-main">
       <section class="panel" aria-labelledby="inv-title"><header class="panel-head"><h2 id="inv-title">Inviter une personne</h2></header>
         <p class="panel-intro">La personne reçoit un lien personnel, à usage unique, pour choisir elle-même son mot de passe. Vous ne le connaissez jamais.</p>${inviteForm}</section>
       ${panel("Invitations en attente", `${pendingTable}${pastList ? `<div class="panel-body">${pastList}</div>` : ""}`, { count: pending.length, raw: true })}
       ${panel("Comptes", usersTable, { count: users.length, raw: true })}
     </div><div class="detail-side">
       ${panel("Rôles", `<dl class="kv-list">${["viewer", "editor", "admin"].map((r) => `<div><dt>${esc(ROLE_LABEL[r])}</dt><dd>${esc(cap(ROLE_HELP[r]))}.</dd></div>`).join("")}</dl>`, {})}
       ${panel("Sécurité des accès", `<ul class="bullets"><li>Les mots de passe sont choisis par chaque personne (12 caractères minimum) et conservés sous forme d'empreinte.</li><li>Un compte désactivé est déconnecté immédiatement ; un changement de rôle s'applique dès l'action suivante.</li><li>Il reste toujours au moins un administrateur actif.</li><li>Chaque invitation, activation et modification de compte est inscrite au journal d'audit.</li></ul>`, {})}
     </div></div>`,
    { title: "Utilisateurs et accès" },
  );
  if (fresh) {
    const box = root.querySelector("#invite-result");
    box.focus();
    root.querySelector("#inv-copy").onclick = async () => {
      const input = root.querySelector("#inv-link");
      let ok = false;
      try {
        await navigator.clipboard.writeText(input.value);
        ok = true;
      } catch {
        input.select();
        try {
          ok = document.execCommand("copy");
        } catch {}
      }
      if (ok) toast("Lien copié dans le presse-papiers");
      else {
        input.select();
        announce("Copie automatique impossible : le lien est sélectionné, copiez-le avec Ctrl+C ou Cmd+C.");
      }
    };
  }
  const form = root.querySelector("#invite-form");
  liveClear(form);
  // L'aide du rôle décrit le rôle choisi
  form.querySelector("#inv-role").addEventListener("change", (ev) => (form.querySelector("#inv-role-hint").textContent = `${cap(ROLE_HELP[ev.target.value] ?? "")}.`));
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    if (form.dataset.busy) return;
    clearErrors(form);
    root.querySelector("#inv-err").innerHTML = "";
    const email = form.elements.namedItem("email").value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return markErrors(form, [{ id: "inv-email", label: "Adresse e-mail", message: email ? "Adresse e-mail invalide, ex. nom@entreprise.fr" : "Renseignez l'adresse e-mail de la personne" }]);
    form.dataset.busy = "1";
    const done = busy(form.querySelector('button[type="submit"]'), "Création…");
    try {
      const out = await api("POST", "/api/admin/invitations", { email, role: form.elements.namedItem("role").value, hours: Number(form.elements.namedItem("hours").value) });
      FRESH_INVITE = { link: `${location.origin}${out.path}`, email: out.invitation.email, role: out.invitation.role, expires_at: out.invitation.expires_at, existing_account: out.invitation.existing_account };
      AFTER_RENDER = () => announce(`Lien d'invitation créé pour ${out.invitation.email}. Copiez-le maintenant : il ne sera plus affiché.`);
      route();
    } catch (x) {
      delete form.dataset.busy;
      done();
      const map = { email: "inv-email", role: "inv-role", hours: "inv-hours" };
      if (map[x.details?.field]) markErrors(form, [{ id: map[x.details.field], label: "", message: x.message }]);
      else root.querySelector("#inv-err").innerHTML = problem(x);
    }
  };
  root.querySelectorAll("[data-revoke]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!(await confirmDialog({ title: "Révoquer cette invitation ?", message: `Le lien envoyé à ${b.dataset.email} ne fonctionnera plus. Vous pourrez en créer un nouveau.`, confirm: "Révoquer", danger: true }))) return;
      const done = busy(b, "Révocation…");
      try {
        await api("POST", `/api/admin/invitations/${b.dataset.revoke}/revoke`);
        AFTER_RENDER = () => toast(`Invitation révoquée : ${b.dataset.email}`);
        route();
      } catch (x) {
        done();
        toastError(x);
      }
    }),
  );
  root.querySelectorAll("[data-role]").forEach((sel) => {
    const apply = root.querySelector(`[data-apply="${sel.dataset.role}"]`);
    sel.addEventListener("change", () => (apply.hidden = sel.value === sel.dataset.current));
    apply.addEventListener("click", async () => {
      const u = users.find((x) => String(x.id) === sel.dataset.role);
      const ok = await confirmDialog({
        title: "Changer le rôle de ce compte ?",
        message: `${u.email ?? u.username} : ${ROLE_LABEL[u.role]} → ${ROLE_LABEL[sel.value]}.\nLe changement s'applique dès sa prochaine action.`,
        confirm: "Changer le rôle",
      });
      if (!ok) return;
      const done = busy(apply, "…");
      try {
        await api("PUT", `/api/admin/users/${u.id}`, { role: sel.value });
        AFTER_RENDER = () => toast(`Rôle modifié : ${u.email ?? u.username} → ${ROLE_LABEL[sel.value]}`);
        route();
      } catch (x) {
        done();
        toastError(x);
      }
    });
  });
  root.querySelectorAll("[data-toggle]").forEach((b) =>
    b.addEventListener("click", async () => {
      const disable = b.dataset.disabled !== "1";
      const ok = await confirmDialog({
        title: disable ? "Désactiver ce compte ?" : "Réactiver ce compte ?",
        message: disable ? `${b.dataset.name} ne pourra plus se connecter ; ses sessions ouvertes sont fermées immédiatement. Ses données et son historique sont conservés.` : `${b.dataset.name} pourra de nouveau se connecter avec son mot de passe.`,
        confirm: disable ? "Désactiver" : "Réactiver",
        danger: disable,
      });
      if (!ok) return;
      const done = busy(b, "…");
      try {
        await api("PUT", `/api/admin/users/${b.dataset.toggle}`, { disabled: disable });
        AFTER_RENDER = () => toast(disable ? `Compte désactivé : ${b.dataset.name}` : `Compte réactivé : ${b.dataset.name}`);
        route();
      } catch (x) {
        done();
        toastError(x);
      }
    }),
  );
}
async function viewBackups(t, path) {
  const backups = await api("GET", "/api/admin/backups");
  if (t !== NAV) return;
  shell(
    `${adminTabs(path)}${panel(
      "Sauvegardes",
      `<p class="muted">Copie cohérente de la base, enregistrée dans le dossier <span class="mono">backups/</span> du logiciel. La restauration crée d'abord une sauvegarde de sécurité de l'état actuel.</p>${
        backups.length
          ? `<ul class="backup-list">${backups.map((b) => `<li><span class="mono">${esc(b.name)}</span><span class="muted small">${esc(nb(Math.round((b.size / 1048576) * 10) / 10))} Mo</span><button class="btn secondary sm" type="button" data-restore="${esc(b.name)}">Restaurer<span class="sr"> ${esc(b.name)}</span></button></li>`).join("")}</ul>`
          : emptyMini("Aucune sauvegarde.")
      }`,
      { count: backups.length, actions: `<button class="btn primary" type="button" id="backup">Sauvegarder maintenant</button>` },
    )}`,
    { title: "Sauvegardes" },
  );
  root.querySelector("#backup").onclick = async (ev) => {
    const done = busy(ev.currentTarget, "Sauvegarde…");
    try {
      const b = await api("POST", "/api/admin/backups");
      AFTER_RENDER = () => toast(`Sauvegarde créée : ${b.name}`);
      route();
    } catch (x) {
      done();
      toastError(x);
    }
  };
  root.querySelectorAll("[data-restore]").forEach((b) => {
    b.onclick = async () => {
      if (!(await confirmDialog({ title: "Restaurer cette sauvegarde ?", message: `${b.dataset.restore}\nL'état actuel de la base sera d'abord sauvegardé, puis remplacé par cette sauvegarde.`, confirm: "Restaurer", danger: true }))) return;
      const done = busy(b, "Restauration…");
      try {
        await api("POST", `/api/admin/backups/${encodeURIComponent(b.dataset.restore)}/restore`);
        AFTER_RENDER = () => toast("Base restaurée");
        route();
      } catch (x) {
        done();
        toastError(x);
      }
    };
  });
}
async function viewAudit(t, path) {
  const audit = await api("GET", "/api/admin/audit?limit=150");
  if (t !== NAV) return;
  const rows = audit.map((a) => {
    const e = a.entity ? entity(a.entity) : null;
    const what = a.entity ? (e ? `<a href="#/e/${e.name}/${a.record_id}">${esc(e.label_singular ?? e.label)} #${esc(a.record_id)}</a>` : `${esc(a.entity)} #${esc(a.record_id)}`) : esc(auditDetail(a) || "—");
    return [`<span class="num">${esc(dateTime(a.ts))}</span>`, esc(a.user), esc(ACTION[a.action] ?? a.action), what, a.justification ? esc(a.justification) : '<span class="muted">—</span>'];
  });
  shell(`${adminTabs(path)}${panel("Journal d'audit", rowsTableStatic(["Date", "Utilisateur", "Action", "Élément", "Motif"], rows, "Journal d'audit"), { count: audit.length, raw: true, actions: '<span class="muted small">150 dernières entrées</span>' })}`, { title: "Journal d'audit" });
}

/* Routeur ---------------------------------------------------------------- */
function notFound() {
  shell(`<div class="empty-state">${icon("search", "empty-ic")}<p><b>Page introuvable.</b></p><p class="muted">L'adresse ne correspond à aucune page de ce logiciel.</p><p><a class="btn secondary" href="#/">Retour au tableau de bord</a></p></div>`, { title: "Introuvable" });
}
async function route(fresh = false) {
  if (!META) return;
  const t = ++NAV;
  const path = currentPath();
  const parts = path.split("/").filter(Boolean);
  const fkey = document.activeElement?.dataset?.fkey ?? null;
  setLoading(true);
  try {
    // La spécification est relue à chaque navigation : un modèle métier publié à chaud est pris en compte
    if (!fresh) META = await api("GET", "/api/meta");
    if (t !== NAV) return;
    applyBranding(META.branding);
    if (!parts.length) await viewDashboard(t);
    else if (parts[0] === "recherche" && parts.length === 1) await viewSearch(t);
    else if (parts[0] === "compte" && parts.length === 1) await viewAccount(t);
    else if (parts[0] === "admin" && can("admin") && parts.length <= 2 && [undefined, "sauvegardes", "journal"].includes(parts[1])) await viewAdmin(t, parts[1]);
    else if (parts[0] === "modele" && parts.length === 1) await viewModel(t);
    else if (parts[0] === "vue" && parts.length === 2 && views().some((v) => v.name === parts[1])) await viewPlanning(parts[1], t);
    else if (parts[0] === "e" && entity(parts[1])) {
      const id = Number(parts[2]);
      if (parts.length === 2) await viewList(parts[1], t);
      else if (parts[2] === "new" && parts.length === 3 && can("editor")) await viewForm(parts[1], null, t);
      else if (Number.isInteger(id) && id > 0 && parts[3] === "edit" && parts.length === 4 && can("editor")) await viewForm(parts[1], id, t);
      else if (Number.isInteger(id) && id > 0 && parts.length === 3) await viewDetail(parts[1], id, t);
      else notFound();
    } else notFound();
    if (t !== NAV) return;
    const after = AFTER_RENDER;
    AFTER_RENDER = null;
    if (path !== LAST_PATH) window.scrollTo(0, 0);
    if (after) after();
    else if ((FOCUS_TITLE && path !== LAST_PATH) || fkey === "pg") root.querySelector("#page-title")?.focus();
    else if (fkey) root.querySelector(`[data-fkey="${CSS.escape(fkey)}"]`)?.focus();
    FOCUS_TITLE = false;
    LAST_PATH = path;
  } catch (x) {
    if (x.handled || t !== NAV || !META) return;
    AFTER_RENDER = null;
    shell(`${problem(x)}<p><a class="btn secondary" href="#/">Retour au tableau de bord</a></p>`, { title: x.status === 404 ? "Introuvable" : "Erreur" });
  } finally {
    if (t === NAV) setLoading(false);
  }
}

function renderFatal(x) {
  authScreen(`<h1 class="auth-title" id="page-title" tabindex="-1">Logiciel indisponible</h1>${problem(x)}<button class="btn primary block" type="button" id="retry">Réessayer</button>`, "Indisponible");
  root.querySelector("#retry").onclick = () => boot();
}
async function boot() {
  const m = ACTIVATION_RE.exec(location.hash);
  if (m || location.hash === "#/activation") return renderActivation(m?.[1] ?? null);
  await loadBranding();
  // Aucune session ouverte depuis ce navigateur (ou déconnexion) : la connexion, sans requête refusée
  if (!hasSessionHint()) return renderLogin();
  try {
    META = await api("GET", "/api/meta");
  } catch (x) {
    if (!x.handled) renderFatal(x);
    return;
  }
  applyBranding(META.branding);
  await route(true);
}
window.addEventListener("hashchange", () => {
  const m = ACTIVATION_RE.exec(location.hash);
  if (m) return void renderActivation(m[1]);
  if (!META) return void boot();
  FOCUS_TITLE = true;
  route();
});
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && root.querySelector("#app.drawer-open")) {
    setDrawer(false);
    return;
  }
  // « / » : recherche dans tout le logiciel (sauf pendant une saisie)
  if (ev.key !== "/" || ev.ctrlKey || ev.metaKey || ev.altKey || ev.target.closest?.("input, textarea, select, [contenteditable='true']") || document.querySelector("dialog[open]")) return;
  const gs = root.querySelector("#gs");
  if (!gs) return;
  ev.preventDefault();
  if (isMobile()) setDrawer(true, true);
  else gs.focus();
});
boot();

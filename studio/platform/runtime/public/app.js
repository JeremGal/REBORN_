// Interface du logiciel livré : entièrement pilotée par /api/meta (spécification générée).
// Rien n'est propre à un métier ici : entités, libellés, champs, règles et tableaux de bord viennent
// de l'API. Aucun calcul métier dans le navigateur : chaque montant affiché est celui que le serveur
// a calculé (modèle métier versionné) ou conservé (historique migré).
const root = document.getElementById("root");
let META = null;
/** Numéro de navigation : une réponse arrivée après une navigation plus récente est ignorée. */
let NAV = 0;
/** Action à exécuter après le prochain rendu (ex. remettre le curseur dans le formulaire de ligne). */
let AFTER_RENDER = null;
const LOCALE = "fr-FR";
const CUR = () => META?.app?.currency ?? "EUR";
const ROLES = { admin: 3, editor: 2, viewer: 1 };
const ROLE_LABEL = { admin: "Administration", editor: "Saisie", viewer: "Lecture" };
const NUMERIC = new Set(["money", "integer", "decimal", "percent"]);
const SOURCE_LABEL = { fixture: "Jeu de test", analyst: "Analyste", investigation: "Investigation du Studio", user: "Opérateur", publication: "Publication" };
const STATUS_LABEL = { hypothesis: "Hypothèse à confirmer", validated: "Validée", observed: "Observée", confirmed: "Confirmée", rejected: "Refusée" };
const KIND_LABEL = { table: "Table", field: "Champ", entity: "Entité", workflow: "Processus", rule: "Règle", attachment: "Pièces jointes" };

/* Utilitaires ---------------------------------------------------------- */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const int = (n) => Number(n ?? 0).toLocaleString(LOCALE);
const nb = (n) => Number(n).toLocaleString(LOCALE, { maximumFractionDigits: 4 });
const money = (c) => (c === null || c === undefined || c === "" ? "—" : (Number(c) / 100).toLocaleString(LOCALE, { style: "currency", currency: CUR() }));
const plural = (n, one, many) => `${int(n)} ${Math.abs(Number(n)) > 1 ? many : one}`;
const cap = (s) => (s ? String(s)[0].toUpperCase() + String(s).slice(1) : "");
const empty = (v) => v === null || v === undefined || v === "";
const dateFr = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s ?? ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s ? String(s) : "—";
};
const dateTime = (s) => {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? String(s) : d.toLocaleString(LOCALE, { dateStyle: "short", timeStyle: "short" });
};
const entity = (name) => META.entities.find((e) => e.name === name) ?? null;
const fieldOf = (e, name) => e?.fields.find((f) => f.name === name) ?? null;
const optionLabel = (f, v) => f?.options?.find((o) => o.value === v)?.label ?? v;
const titleOf = (e, row) => {
  const v = e?.title_field ? row?.[e.title_field] : null;
  return !empty(v) ? String(v) : `${e?.label_singular ?? e?.label ?? ""} #${row?.id ?? "?"}`.trim();
};

class ApiError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
const invalid = (message) => new ApiError(400, message);

/** Montant saisi (« 1 234,56 ») → centimes entiers, sans calcul flottant. */
function parseMoney(input) {
  let t = String(input).replace(/[\s  €]/g, "").replace(/EUR/i, "");
  if (!t) return null;
  let neg = t.startsWith("-");
  if (neg || t.startsWith("+")) t = t.slice(1);
  const sep = t.lastIndexOf(",") > t.lastIndexOf(".") ? "," : ".";
  const [i, f = "", extra] = t.split(sep);
  if (extra !== undefined || !/^\d+$/.test(i.replaceAll(sep === "," ? "." : ",", "")) || !/^\d{0,2}$/.test(f)) throw invalid(`Montant invalide : « ${input} »`);
  const cents = Number(i.replaceAll(sep === "," ? "." : ",", "")) * 100 + Number((f + "00").slice(0, 2));
  return neg ? -cents : cents;
}

/** Valeur affichée (HTML). */
function format(f, v, refTitle) {
  if (empty(v)) return '<span class="muted">—</span>';
  switch (f?.type) {
    case "money":
      return `<span class="num">${esc(money(v))}</span>`;
    case "date":
      return esc(dateFr(v));
    case "boolean":
      return v ? "Oui" : "Non";
    case "enum":
      return esc(optionLabel(f, v));
    case "percent":
      return `<span class="num">${esc(nb(v))} %</span>`;
    case "decimal":
    case "integer":
      return `<span class="num">${esc(nb(v))}</span>`;
    case "reference":
      return `<a href="#/e/${esc(f.references)}/${esc(v)}">${esc(refTitle ?? `#${v}`)}</a>`;
    case "email":
      return `<a href="mailto:${esc(v)}">${esc(v)}</a>`;
    case "phone":
      return `<a href="tel:${esc(String(v).replace(/[^\d+]/g, ""))}">${esc(v)}</a>`;
    default:
      return esc(v);
  }
}
/** Valeur affichée (texte brut : journal, confirmations). */
function plain(f, v, refTitle) {
  if (empty(v)) return "—";
  switch (f?.type) {
    case "money":
      return money(v);
    case "date":
      return dateFr(v);
    case "boolean":
      return v ? "Oui" : "Non";
    case "enum":
      return String(optionLabel(f, v));
    case "percent":
      return `${nb(v)} %`;
    case "decimal":
    case "integer":
      return nb(v);
    case "reference":
      return refTitle ?? `#${v}`;
    default:
      return String(v);
  }
}

/* API ------------------------------------------------------------------- */
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
    renderLogin(had ? "Votre session a expiré : reconnectez-vous." : "");
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
        kind: "lock",
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
    case 413:
      return { kind: "error", title: "Trop volumineux", message: msg, sub: "" };
    case 429:
      return { kind: "error", title: "Trop de tentatives", message: msg, sub: "" };
    case 0:
      return { kind: "error", title: "Serveur injoignable", message: msg, sub: "" };
    default:
      return { kind: "error", title: x?.status >= 500 ? "Erreur du serveur" : "Erreur", message: msg, sub: "" };
  }
}
const alertBox = (kind, title, message, sub = "") => `<div class="alert ${kind}" role="alert">${title ? `<b class="t">${esc(title)}</b>` : ""}<div>${esc(message)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ""}</div>`;
const problem = (x) => {
  const p = explain(x);
  return alertBox(p.kind, p.title, p.message, p.sub);
};

function toast(text, error = false) {
  document.querySelectorAll(".toast").forEach((t) => t.remove());
  const el = document.createElement("div");
  el.className = `toast${error ? " error" : ""}`;
  el.textContent = text;
  el.setAttribute("role", error ? "alert" : "status");
  document.body.append(el);
  setTimeout(() => el.remove(), error ? 8000 : 4000);
}
const toastError = (x) => {
  if (x?.handled) return;
  const p = explain(x);
  toast(`${p.title} — ${p.message}`, true);
};

const params = () => new URLSearchParams(location.hash.split("?")[1] ?? "");
const go = (h) => (location.hash === h ? route() : (location.hash = h));
const can = (role) => (ROLES[META?.user?.role] ?? 0) >= ROLES[role];
/** Action décrite comme indisponible par la spécification (app.json → actions) : pas de bouton. */
const allowed = (e, action) => !(META.actions ?? []).some((a) => a.entity === e?.name && a.action === action && a.available === false);
/** Réactive un bouton (et son libellé) après une opération. */
function busy(btn, label) {
  if (!btn) return () => {};
  const before = btn.textContent;
  btn.disabled = true;
  if (label) btn.textContent = label;
  return () => {
    btn.disabled = false;
    btn.textContent = before;
  };
}

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
const originChip = (r) => (r._migrated ? '<span class="chip origin">migré</span>' : '<span class="chip new">créé ici</span>');
/** Cellule de tableau : un champ calculé vide d'une ligne historique est signalé comme non calculé. */
function cell(e, f, r) {
  if (f.computed_by_rules && empty(r[f.name]) && r._migrated) return '<span class="muted" title="Non calculé pour l\'historique">—</span>';
  return format(f, r[f.name], r._refs?.[f.name]);
}

/* Marque ------------------------------------------------------------------ */
const brandName = () => META?.app?.branding?.name || META?.app?.name || "";
function applyBranding() {
  const b = META?.app?.branding ?? null;
  const color = typeof b?.primary_color === "string" && /^#[0-9a-f]{6}$/i.test(b.primary_color) ? b.primary_color : null;
  const st = document.documentElement.style;
  if (!color) {
    for (const k of ["--accent", "--accent-ink", "--accent-text"]) st.removeProperty(k);
    return;
  }
  const [r, g, bl] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const light = 0.2126 * r + 0.7152 * g + 0.0722 * bl > 0.18;
  st.setProperty("--accent", color);
  st.setProperty("--accent-ink", light ? "#141b29" : "#ffffff");
  st.setProperty("--accent-text", light ? `color-mix(in srgb, ${color} 45%, #000)` : color);
  const text = String(b.logo_text ?? "").slice(0, 4);
  let icon = document.querySelector('link[rel="icon"]');
  if (!icon) {
    icon = document.createElement("link");
    icon.rel = "icon";
    document.head.append(icon);
  }
  icon.href = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${color}"/><text x="32" y="41" font-family="system-ui,sans-serif" font-size="${text.length > 2 ? 20 : 26}" font-weight="700" text-anchor="middle" fill="${light ? "#141b29" : "#ffffff"}">${esc(text)}</text></svg>`)}`;
}

/* Connexion ------------------------------------------------------------- */
function renderLogin(msg = "") {
  document.title = "Connexion";
  root.innerHTML = `<div class="login"><div class="card"><form id="login" novalidate>
    <div><p class="eyebrow" id="login-app"></p><h1>Connexion</h1><p class="muted" style="margin:4px 0 0">Accès réservé aux utilisateurs autorisés.</p></div>
    <div id="login-err">${msg ? alertBox("info", "", msg) : ""}</div>
    <div class="fld"><label for="lg-user">Identifiant</label><input id="lg-user" type="text" name="username" autocomplete="username" required></div>
    <div class="fld"><label for="lg-pw">Mot de passe</label><input id="lg-pw" type="password" name="password" autocomplete="current-password" required></div>
    <button class="btn primary" type="submit">Se connecter</button></form></div></div>`;
  fetch("/api/health")
    .then((r) => r.json())
    .then((h) => {
      const el = root.querySelector("#login-app");
      if (el && h?.name) el.textContent = h.name;
    })
    .catch(() => {});
  const form = root.querySelector("#login");
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const f = new FormData(form);
    if (!String(f.get("username") ?? "").trim() || !f.get("password")) {
      form.querySelector("#login-err").innerHTML = alertBox("error", "Saisie à corriger", "Renseignez l'identifiant et le mot de passe.");
      return;
    }
    const done = busy(form.querySelector('button[type="submit"]'), "Connexion…");
    try {
      await api("POST", "/api/auth/login", { username: f.get("username"), password: f.get("password") });
      await boot();
    } catch (x) {
      done();
      form.querySelector("#login-err").innerHTML = problem(x);
    }
  };
  form.querySelector("#lg-user").focus();
}

/* Coquille -------------------------------------------------------------- */
function shell(content, { title, crumbs = "", actions = "", badge = "" }) {
  document.title = `${title} · ${brandName()}`;
  const route = location.hash.split("?")[0] || "#/";
  const link = (href, label, on) => `<a href="${href}"${on ? ' aria-current="page"' : ""}>${esc(label)}</a>`;
  const nav = META.navigation
    .map((n) => entity(n.entity))
    .filter(Boolean)
    .map((e) => link(`#/e/${e.name}`, e.label, route === `#/e/${e.name}` || route.startsWith(`#/e/${e.name}/`)))
    .join("");
  const b = META.app.branding;
  const logo = b?.logo_text ? `<span class="logo" aria-hidden="true">${esc(String(b.logo_text).slice(0, 4))}</span>` : "";
  root.innerHTML = `<a class="skip" href="#/" id="skip">Aller au contenu</a><div class="shell" id="shell">
    <aside class="side" id="side"><div class="brand">${logo}<div><b>${esc(brandName())}</b><span>${esc(META.app.tagline ?? "")}</span></div></div>
      <nav class="nav" aria-label="Navigation principale">${link("#/", "Tableau de bord", route === "#/" || route === "#")}<div class="group">Données</div>${nav}
      ${hasRules() ? `<div class="group">Référentiel</div>${link("#/modele", "Modèle métier", route === "#/modele")}` : ""}
      ${can("admin") ? `<div class="group">Administration</div>${link("#/admin", "Utilisateurs et sauvegardes", route === "#/admin")}` : ""}</nav>
      <div class="who"><span>${esc(META.user.name)} · ${esc(ROLE_LABEL[META.user.role] ?? META.user.role)}</span><button type="button" id="logout">Déconnexion</button></div></aside>
    <div class="scrim" id="scrim" aria-hidden="true"></div>
    <main class="main" id="main" tabindex="-1"><div class="top"><div class="top-title"><button class="btn ghost menu-toggle" id="menu" type="button" aria-label="Ouvrir le menu" aria-controls="side" aria-expanded="false">☰</button><div><div class="crumbs">${crumbs}</div><h1>${esc(title)}${badge ? ` ${badge}` : ""}</h1></div></div><div class="actions">${actions}</div></div>${content}</main></div>`;
  root.querySelector("#skip").onclick = (ev) => {
    ev.preventDefault();
    root.querySelector("#main").focus();
  };
  root.querySelector("#logout").onclick = async () => {
    try {
      await api("POST", "/api/auth/logout");
    } catch {}
    META = null;
    renderLogin();
  };
  const sh = root.querySelector("#shell");
  const menu = root.querySelector("#menu");
  const toggle = (open) => {
    sh.classList.toggle("open", open);
    menu.setAttribute("aria-expanded", String(open));
  };
  menu.onclick = () => toggle(!sh.classList.contains("open"));
  root.querySelector("#scrim").onclick = () => toggle(false);
  root.querySelectorAll("tr.link").forEach((tr) => (tr.onclick = (ev) => ev.target.closest("a, button, input, select, label") || go(tr.dataset.href)));
}
function setLoading(on) {
  const main = root.querySelector("#main");
  if (!main) return;
  main.classList.toggle("loading", on);
  main.setAttribute("aria-busy", on ? "true" : "false");
}

/* Tableaux ---------------------------------------------------------------- */
/** Tableau d'enregistrements : nombres alignés à droite, en-têtes lisibles, empilé sur petit écran. */
function rowsTable(e, cols, rows, { th = null, origin = false, tail = null, tailLabel = "Actions" } = {}) {
  const head =
    cols.map((f) => (th ? th(f) : `<th scope="col"${NUMERIC.has(f.type) ? ' class="num"' : ""}>${esc(f.label)}</th>`)).join("") +
    (origin ? '<th scope="col">Origine</th>' : "") +
    (tail ? `<th scope="col" class="act"><span class="sr">${esc(tailLabel)}</span></th>` : "");
  const body = rows
    .map((r) => {
      const cells = cols
        .map((f, i) => {
          const cls = NUMERIC.has(f.type) ? ' class="num"' : "";
          if (i === 0) {
            const txt = plain(f, r[f.name], r._refs?.[f.name]);
            return `<td data-label="${esc(f.label)}"${cls}><a class="row-link" href="#/e/${e.name}/${r.id}">${esc(txt === "—" ? titleOf(e, r) : txt)}</a></td>`;
          }
          return `<td data-label="${esc(f.label)}"${cls}>${cell(e, f, r)}</td>`;
        })
        .join("");
      return `<tr class="link" data-href="#/e/${e.name}/${r.id}">${cells}${origin ? `<td data-label="Origine">${originChip(r)}</td>` : ""}${tail ? `<td class="act">${tail(r)}</td>` : ""}</tr>`;
    })
    .join("");
  return `<div class="table-wrap"><table class="data stack"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

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
  password_changed: "a changé son mot de passe",
};
async function viewDashboard(t) {
  const d = await api("GET", "/api/dashboard");
  if (t !== NAV) return;
  const cards = d.cards
    .map((c) => {
      const e = entity(c.entity);
      const value = c.kind === "sum" ? money(c.value) : int(c.value);
      let sub;
      if (c.kind === "count") sub = !c.value ? "Aucun enregistrement" : c.migrated === c.value ? "Tous issus de la migration" : !c.migrated ? "Tous créés dans ce logiciel" : `${int(c.migrated)} migrés · ${int(c.value - c.migrated)} créés ici`;
      else sub = c.sub ?? (fieldOf(e, c.field) ? `Somme de « ${fieldOf(e, c.field).label} », historique inclus` : "");
      return `<a class="card kpi" href="#/e/${esc(c.entity)}"><div class="label">${esc(c.label)}</div><div class="value">${esc(value)}</div><div class="sub">${esc(sub)}</div></a>`;
    })
    .join("");
  const breakdowns = d.breakdowns
    .map((b) => {
      const e = entity(b.entity);
      const f = fieldOf(e, b.field);
      const total = b.values.reduce((s, x) => s + x.n, 0);
      const items = b.values.length
        ? `<ul class="plain breakdown">${b.values
            .map((v) => `<li><a href="#/e/${esc(b.entity)}?${esc(b.field)}=${encodeURIComponent(v.value ?? "")}">${esc(v.value === null ? "Non renseigné" : optionLabel(f, v.value))}</a><div class="bar" aria-hidden="true"><span style="width:${total ? (v.n / total) * 100 : 0}%"></span></div><span class="num">${int(v.n)}</span></li>`)
            .join("")}</ul>`
        : '<p class="muted" style="margin:0">Aucune donnée.</p>';
      return `<section class="card"><header><h2>${esc(b.label)}</h2></header><div class="body">${items}</div></section>`;
    })
    .join("");
  const recent = d.recent.length
    ? `<ul class="plain timeline">${d.recent
        .map((r) => {
          const e = entity(r.entity);
          return `<li><b>${esc(r.user)}</b> · ${esc(ACTION[r.action] ?? r.action)} ${e ? `<a href="#/e/${e.name}/${r.record_id}">${esc(e.label_singular ?? e.label)} #${esc(r.record_id)}</a>` : esc(r.entity)} <span class="muted">· ${esc(dateTime(r.ts))}</span></li>`;
        })
        .join("")}</ul>`
    : '<p class="muted" style="margin:0">Aucune modification depuis la mise en service.</p>';
  const av = activeVersion();
  const docs = META.entities.filter(isDocument);
  const model = docs.length
    ? av
      ? ` Les nouveaux enregistrements (${docs.map((e) => e.label).join(", ")}) sont calculés par le serveur avec le <a href="#/modele">${esc(modelLabel(av))}</a> ; les enregistrements historiques gardent leurs montants d'origine.`
      : " Aucun modèle métier actif : les nouveaux enregistrements ne sont pas calculés automatiquement."
    : "";
  const origin = d.migration
    ? `<div class="alert info">Données historiques migrées depuis <b>${esc(d.migration.source_system ?? "l'ancien logiciel")}</b> le ${esc(dateTime(d.migration.migrated_at))} (exécution ${esc(d.migration.run)}). Chaque fiche migrée indique son origine exacte.${model}</div>`
    : model
      ? `<div class="alert info">${model.trim()}</div>`
      : "";
  shell(`${origin}<div class="grid"><div class="kpis">${cards}</div><div class="two"><div class="grid">${breakdowns}</div><section class="card"><header><h2>Dernières modifications</h2></header><div class="body">${recent}</div></section></div></div>`, { title: "Tableau de bord" });
}

/* Liste -------------------------------------------------------------------- */
async function viewList(name, t) {
  const e = entity(name);
  const p = params();
  const page = Math.max(1, Number(p.get("page") ?? 1) || 1);
  const q = new URLSearchParams(p);
  q.set("per", "25");
  const data = await api("GET", `/api/e/${name}?${q}`);
  if (t !== NAV) return;
  const cols = e.list_fields.map((n) => fieldOf(e, n)).filter(Boolean);
  const without = (...keys) => {
    const x = new URLSearchParams(p);
    for (const k of keys) x.delete(k);
    x.delete("page");
    const s = x.toString();
    return `#/e/${name}${s ? `?${s}` : ""}`;
  };
  const filters = e.fields
    .filter((f) => p.get(f.name))
    .map((f) => {
      const v = p.get(f.name);
      const label = f.type === "reference" ? data.rows[0]?._refs?.[f.name] ?? `#${v}` : f.type === "boolean" ? (v === "1" ? "Oui" : "Non") : optionLabel(f, v);
      return `<span class="chip neutral">${esc(f.label)} : ${esc(label)} <a href="${without(f.name)}" aria-label="Retirer le filtre ${esc(f.label)}">×</a></span>`;
    });
  const sortLink = (f) => {
    const x = new URLSearchParams(p);
    x.set("sort", f.name);
    x.set("dir", p.get("sort") === f.name && p.get("dir") !== "desc" ? "desc" : "asc");
    x.delete("page");
    return `#/e/${name}?${x}`;
  };
  const th = (f) => {
    const on = p.get("sort") === f.name;
    const desc = p.get("dir") === "desc";
    return `<th scope="col"${NUMERIC.has(f.type) ? ' class="num"' : ""} aria-sort="${on ? (desc ? "descending" : "ascending") : "none"}"><a class="sort${on ? " on" : ""}" href="${sortLink(f)}" title="Trier par ${esc(f.label)}">${esc(f.label)}<span class="arrow" aria-hidden="true">${on ? (desc ? "↓" : "↑") : "↕"}</span></a></th>`;
  };
  const searching = !!(p.get("q") || filters.length || p.get("_migrated"));
  const createHref = `#/e/${name}/new${[...p].filter(([k]) => fieldOf(e, k)?.type === "reference").map(([k, v], i) => `${i ? "&" : "?"}${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("")}`;
  const canCreate = can("editor") && allowed(e, "create");
  const table = data.rows.length
    ? rowsTable(e, cols, data.rows, { th, origin: true })
    : `<div class="empty-state">${
        searching
          ? `<p><b>Aucun résultat</b>${p.get("q") ? ` pour « ${esc(p.get("q"))} »` : ""}.</p><p><a href="#/e/${name}">Effacer la recherche et les filtres</a></p>`
          : `<p><b>Aucun enregistrement pour l'instant.</b></p>${canCreate ? `<p><a class="btn primary" href="${createHref}">Créer : ${esc(e.label_singular ?? e.label)}</a></p>` : ""}`
      }</div>`;
  const pages = Math.max(1, Math.ceil(data.total / data.per));
  const pageLink = (n) => {
    const x = new URLSearchParams(p);
    x.set("page", n);
    return `#/e/${name}?${x}`;
  };
  const from = data.total ? (data.page - 1) * data.per + 1 : 0;
  const to = Math.min(data.total, data.page * data.per);
  const searchable = e.search_fields.map((n) => fieldOf(e, n)?.label ?? n).join(", ") || "titre";
  const mig = p.get("_migrated") ?? "";
  // Sur petit écran les en-têtes sont masqués (lignes empilées) : le tri passe par une liste
  const curSort = p.get("sort") ? `${p.get("sort")}:${p.get("dir") === "desc" ? "desc" : "asc"}` : "";
  const sortSelect = `<label class="inline-select mobile-only">Tri <select id="sort"><option value="">Par défaut</option>${cols
    .flatMap((f) => [
      [`${f.name}:asc`, `${f.label} ↑`],
      [`${f.name}:desc`, `${f.label} ↓`],
    ])
    .map(([v, l]) => `<option value="${esc(v)}"${v === curSort ? " selected" : ""}>${esc(l)}</option>`)
    .join("")}</select></label>`;
  shell(
    `<section class="card"><header class="toolbar"><form id="search" class="search-form" role="search"><input type="search" class="search" name="q" aria-label="Rechercher" placeholder="Rechercher (${esc(searchable)})" value="${esc(p.get("q") ?? "")}"><button class="btn ghost" type="submit">Rechercher</button>${p.get("q") ? `<a class="btn quiet" href="${without("q")}">Effacer</a>` : ""}</form>
       <div class="toolbar-end">${sortSelect}<label class="inline-select">Origine <select id="origin"><option value="">Toutes</option><option value="1"${mig === "1" ? " selected" : ""}>Migrés</option><option value="0"${mig === "0" ? " selected" : ""}>Créés ici</option></select></label><span class="muted count">${esc(plural(data.total, "enregistrement", "enregistrements"))}</span></div></header>
       ${filters.length ? `<div class="filters">${filters.join(" ")}</div>` : ""}
       ${table}
       ${data.total ? `<div class="pager"><span>${int(from)}–${int(to)} sur ${int(data.total)} · page ${int(page)} / ${int(pages)}</span><span class="actions">${page > 1 ? `<a class="btn ghost" href="${pageLink(page - 1)}">Précédente</a>` : ""}${page < pages ? `<a class="btn ghost" href="${pageLink(page + 1)}">Suivante</a>` : ""}</span></div>` : ""}</section>`,
    {
      title: e.label,
      actions: `${allowed(e, "export") ? `<a class="btn ghost" href="/api/export/${name}.csv">Exporter (CSV)</a>` : ""}${canCreate ? `<a class="btn primary" href="${createHref}">Nouveau</a>` : ""}`,
    },
  );
  root.querySelector("#search").onsubmit = (ev) => {
    ev.preventDefault();
    const x = new URLSearchParams(p);
    const v = String(new FormData(ev.target).get("q") ?? "").trim();
    if (v) x.set("q", v);
    else x.delete("q");
    x.delete("page");
    go(`#/e/${name}${x.toString() ? `?${x}` : ""}`);
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
    x.delete("page");
    go(`#/e/${name}${x.toString() ? `?${x}` : ""}`);
  };
  root.querySelector("#origin").onchange = (ev) => {
    const x = new URLSearchParams(p);
    if (ev.target.value) x.set("_migrated", ev.target.value);
    else x.delete("_migrated");
    x.delete("page");
    go(`#/e/${name}${x.toString() ? `?${x}` : ""}`);
  };
}

/* Fiche -------------------------------------------------------------------- */
/** Document calculé par le modèle métier : entité des lignes et référence vers le document. */
function documentLines(e, rules) {
  const bs = rules?.bindings ?? bindings();
  const db = bs.find((b) => b.entity === e.name && b.scope === "document") ?? null;
  const lb = bs.find((b) => b.scope === "line" && b.document?.entity === e.name) ?? null;
  let le = entity(db?.lines?.entity ?? lb?.entity ?? "");
  let via = db?.lines?.via ?? lb?.document?.via ?? null;
  if (!le || !fieldOf(le, via)) {
    le = META.entities.find((x) => isLine(x) && x.fields.some((f) => f.type === "reference" && f.references === e.name)) ?? null;
    via = le?.fields.find((f) => f.type === "reference" && f.references === e.name)?.name ?? null;
  }
  return le && via ? { db, lb, le, via } : null;
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
  const label = (k) => (k === "_rules_version" ? "Version du modèle métier" : fieldOf(e, k)?.label ?? k);
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

async function viewDetail(name, id, t) {
  const e = entity(name);
  const [d, rules] = await Promise.all([api("GET", `/api/e/${name}/${id}`), isDocument(e) ? api("GET", "/api/rules") : Promise.resolve(null)]);
  const doc = isDocument(e) ? documentLines(e, rules) : null;
  const lines = doc ? await api("GET", `/api/e/${doc.le.name}?${encodeURIComponent(doc.via)}=${id}&per=200`) : null;
  if (t !== NAV) return;
  const r = d.record;
  const title = titleOf(e, r);
  const protRec = isProtectedRecord(e, r);
  const protLine = isProtectedLine(e, r) ? lineParent(e) : null;
  const src = META.app.source_system || "l'ancien logiciel";

  const fields = e.fields
    .map((f) => {
      const note = lockReason(e, f, r, "detail");
      return `<div><dt>${esc(f.label)}${f.accounting && r._migrated ? ' <span class="chip lock" title="Valeur historique protégée : non modifiable">protégé</span>' : ""}</dt><dd>${format(f, r[f.name], r._refs?.[f.name])}</dd>${note && f.computed_by_rules ? `<dd class="note">${esc(note)}</dd>` : ""}</div>`;
    })
    .join("");

  const children = e.children
    .filter((c) => !(doc && c.entity === doc.le.name && c.via === doc.via))
    .map((c) => {
      const ce = entity(c.entity);
      const block = d.children[`${c.entity}.${c.via}`];
      if (!ce || !block) return "";
      const cols = ce.list_fields.filter((n) => n !== c.via).slice(0, 5).map((n) => fieldOf(ce, n)).filter(Boolean);
      const body = block.rows.length
        ? `${rowsTable(ce, cols, block.rows)}${block.total > block.rows.length ? `<div class="pager"><a href="#/e/${c.entity}?${c.via}=${r.id}">Voir les ${int(block.total)} enregistrements</a></div>` : ""}`
        : '<p class="empty">Aucun enregistrement lié.</p>';
      const lockedLines = protRec && lineOf(ce, e, c.via);
      const canAdd = can("editor") && allowed(ce, "create") && !lockedLines;
      return `<section class="card"><header><h2>${esc(c.label)} <span class="muted">(${int(block.total)})</span></h2>${canAdd ? `<a class="btn ghost" href="#/e/${c.entity}/new?${c.via}=${r.id}">Ajouter</a>` : lockedLines ? '<span class="chip lock">historique protégé</span>' : ""}</header>${body}</section>`;
    })
    .join("");

  const files = `<section class="card"><header><h2>Pièces jointes <span class="muted">(${int(d.files.length)})</span></h2>${can("editor") && allowed(e, "attach") ? '<label class="btn ghost">Joindre un fichier<input type="file" id="upload" hidden></label>' : ""}</header><div class="body">${
    d.files.length
      ? `<ul class="plain timeline">${d.files.map((f) => `<li><a href="/api/files/${f.id}">${esc(f.filename)}</a> <span class="muted">· ${esc(nb(Math.round((f.size / 1024) * 10) / 10))} Ko · ${f._migrated ? "migré" : `ajouté par ${esc(f.created_by)}`}</span> <span class="mono muted" title="Empreinte SHA-256">${esc(String(f.sha256 ?? "").slice(0, 12))}</span></li>`).join("")}</ul>`
      : '<p class="muted" style="margin:0">Aucune pièce jointe.</p>'
  }</div></section>`;
  const lineage = d.lineage
    ? `<section class="card"><header><h2>Origine de la donnée</h2><span class="chip origin">migré</span></header><div class="body"><dl class="fields">
        <div><dt>Logiciel source</dt><dd>${esc(d.lineage.source_system)}</dd></div><div><dt>Table et clé d'origine</dt><dd class="mono">${esc(d.lineage.source_table)} · ${esc(d.lineage.source_key)}</dd></div>
        <div><dt>Fichier extrait</dt><dd>${esc(d.lineage.source_file)} <span class="mono muted">${esc(String(d.lineage.source_file_sha256 ?? "").slice(0, 12))}</span></dd></div><div><dt>Migration</dt><dd>${esc(d.lineage.run_id)} · ${esc(dateTime(d.lineage.migrated_at))}</dd></div></dl>
        <details class="raw" style="margin-top:12px"><summary>Transformations appliquées</summary><pre>${esc(Object.entries(d.lineage.transforms ?? {}).map(([k, x]) => `${k} ← ${x.source}${x.transforms?.length ? `  [${x.transforms.join(" → ")}]` : ""}`).join("\n"))}</pre></details>
        <details class="raw" style="margin-top:8px"><summary>Ligne d'origine complète</summary><pre>${esc(JSON.stringify(d.lineage.source_row, null, 2))}</pre></details></div></section>`
    : `<section class="card"><header><h2>Origine de la donnée</h2><span class="chip new">créé dans ce logiciel</span></header><div class="body muted">Enregistrement créé le ${esc(dateTime(r._created_at))}.</div></section>`;
  const history = `<section class="card"><header><h2>Historique</h2></header><div class="body">${
    d.history.length
      ? `<ul class="plain timeline">${d.history
          .map((h) => {
            const ch = historyChanges(e, h);
            return `<li><b>${esc(h.user)}</b> · ${esc(ACTION[h.action] ?? h.action)} · <span class="muted">${esc(dateTime(h.ts))}</span>${ch ? `<div class="muted small">${esc(ch)}</div>` : ""}${h.justification ? `<div class="muted small">Motif : ${esc(h.justification)}</div>` : ""}</li>`;
          })
          .join("")}</ul>`
      : `<p class="muted" style="margin:0">Aucune modification${r._migrated ? " depuis la migration" : ""}.</p>`
  }</div></section>`;

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
      `Document comptable historique : valeurs d'origine (${e.fields.filter((f) => f.accounting).map((f) => f.label).join(", ")}) conservées telles qu'enregistrées dans ${src}. Elles ne sont pas modifiables et l'enregistrement ne peut pas être supprimé.`,
    );

  const canEdit = can("editor") && allowed(e, "update") && !protLine;
  const canDelete = can("editor") && allowed(e, "delete") && !protRec && !protLine;
  const docBlock = doc ? documentBlock(e, r, doc, lines, rules) : null;
  shell(
    `${banner}<div class="two"><div class="grid"><section class="card"><div class="body"><dl class="fields">${fields}</dl></div></section>${docBlock ? docBlock.html : ""}${children}</div><div class="grid">${lineage}${files}${history}</div></div>`,
    {
      title,
      badge: protRec || protLine ? '<span class="chip lock big">Historique protégé</span>' : "",
      crumbs: `<a href="#/e/${name}">${esc(e.label)}</a>${r._source_key ? ` · <span class="mono">${esc(r._source_key)}</span>` : ""}`,
      actions: `${canEdit ? `<a class="btn ghost" href="#/e/${name}/${id}/edit">Modifier</a>` : ""}${canDelete ? '<button class="btn danger" type="button" id="del">Supprimer</button>' : ""}`,
    },
  );
  docBlock?.bind();
  root.querySelector("#del")?.addEventListener("click", async (ev) => {
    if (!confirm(`Supprimer « ${title} » ? Cette action est enregistrée dans le journal.`)) return;
    const done = busy(ev.currentTarget, "Suppression…");
    try {
      await api("DELETE", `/api/e/${name}/${id}`);
      toast("Enregistrement supprimé");
      go(`#/e/${name}`);
    } catch (x) {
      done();
      toastError(x);
    }
  });
  root.querySelector("#upload")?.addEventListener("change", async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    const buf = new Uint8Array(await file.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    try {
      await api("POST", `/api/e/${name}/${id}/files`, { filename: file.name, mime: file.type || "application/octet-stream", content_base64: btoa(bin) });
      toast("Fichier joint");
      route();
    } catch (x) {
      toastError(x);
    }
  });
}

/* Éditeur de document à lignes --------------------------------------------- */
/**
 * Fiche d'un document calculé par le modèle métier : ses lignes, l'ajout d'une ligne avec aperçu
 * du calcul (POST /api/rules/preview), puis les totaux recalculés et renvoyés par le serveur.
 */
function documentBlock(e, r, doc, lines, rules) {
  const { le, via } = doc;
  const av = rules?.active_version ?? activeVersion();
  const docBound = (rules?.bindings ?? bindings()).some((b) => b.entity === e.name && b.scope === "document");
  const historical = !!r._migrated;
  const editable = !historical && can("editor") && allowed(le, "create");
  const cols = [...le.list_fields.filter((n) => n !== via).map((n) => fieldOf(le, n)).filter(Boolean), ...le.fields.filter((f) => f.computed_by_rules && !le.list_fields.includes(f.name))];
  const rows = lines?.rows ?? [];
  const canDeleteLine = editable && allowed(le, "delete");
  // Nom d'une ligne : sa première colonne (ex. la référence choisie), sinon « <libellé> #id »
  const lineName = (x) => {
    const v = cols[0] ? plain(cols[0], x?.[cols[0].name], x?._refs?.[cols[0].name]) : "—";
    return v === "—" ? titleOf(le, x) : v;
  };
  const table = rows.length
    ? rowsTable(le, cols, rows, { tail: canDeleteLine ? (x) => `<button class="btn quiet sm danger-text" type="button" data-del-line="${x.id}" aria-label="Supprimer la ligne ${esc(lineName(x))}">Supprimer</button>` : null })
    : `<p class="empty">${historical ? "Aucune ligne migrée pour ce document." : "Aucune ligne pour l'instant : ajoutez la première ci-dessous."}</p>`;
  const more = lines && lines.total > rows.length ? `<div class="pager"><a href="#/e/${le.name}?${via}=${r.id}">Voir les ${int(lines.total)} lignes</a></div>` : "";
  const uncomputed = historical ? le.fields.filter((f) => f.computed_by_rules && rows.length && rows.every((x) => empty(x[f.name]))) : [];
  const uncomputedNote = uncomputed.length
    ? `<p class="note-line">${esc(uncomputed.map((f) => `« ${f.label} »`).join(", "))} : non calculé pour les lignes historiques. Le document conserve ses totaux d'origine.</p>`
    : "";

  // État du calcul et version du modèle utilisée par ce document
  let status;
  let reprice = "";
  if (historical) status = `<span class="chip lock">Historique protégé</span> Montants d'origine conservés tels qu'enregistrés dans ${esc(META.app.source_system || "l'ancien logiciel")} : jamais recalculés.`;
  else if (!docBound) status = `<span class="chip neutral">Non calculé</span> Le modèle métier actif ne calcule pas ce document : ses montants ne sont pas recalculés automatiquement.`;
  else {
    const v = r._rules_version;
    status = v
      ? `<span class="chip new">Calculé par le serveur</span> Avec le <a href="#/modele">${esc(modelLabel(v))}</a>${av && av !== v ? ` · version active : <a href="#/modele">${esc(modelLabel(av))}</a>` : av === v ? " (version active)" : ""}.`
      : `<span class="chip neutral">Pas encore calculé</span> Ce document n'a pas encore été calculé par le modèle métier.`;
    if (av && av !== v && can("editor") && allowed(e, "reprice")) reprice = `<button class="btn ghost" type="button" id="reprice">Recalculer avec la version active (v${esc(av)})</button>`;
  }
  const totals = e.fields.filter((f) => f.computed_by_rules);
  const totalsHtml = totals.length
    ? `<div class="totals"><dl>${totals.map((f) => `<div><dt>${esc(f.label)}</dt><dd class="num">${format(f, r[f.name])}</dd></div>`).join("")}</dl><p class="totals-note">${
        historical ? "Montants d'origine (historique), non recalculés." : r._rules_version ? `Totaux calculés et enregistrés par le serveur (${esc(modelLabel(r._rules_version))}).` : "Totaux non calculés par le modèle métier."
      }</p></div>`
    : "";

  // Ligne à ajouter : tous les champs saisissables (ni la référence au document, ni les champs calculés)
  const inputs = le.fields.filter((f) => f.name !== via && !f.computed_by_rules && !(f.accounting && historical));
  const computedLine = le.fields.filter((f) => f.computed_by_rules);
  // Une ligne est calculée avec la version du document (épinglée), sinon avec la version active
  const lineVersion = r._rules_version ?? av;
  const form = editable
    ? `<form id="line-form" class="line-form" novalidate aria-label="Nouvelle ligne"><h3>Nouvelle ligne</h3>
        <div class="line-fields">${inputs.map((f) => fieldControl(le, f, null, { idPrefix: "ln", compact: true })).join("")}</div>
        ${computedLine.length ? `<p class="hint-line">${esc(computedLine.map((f) => f.label).join(", "))} : ${computedLine.length > 1 ? "calculés" : "calculé"} par le serveur à l'enregistrement${lineVersion ? ` (${esc(modelLabel(lineVersion))})` : ""}, jamais saisis.</p>` : ""}
        <div id="line-preview" class="preview-zone" aria-live="polite"></div>
        <div id="line-err"></div>
        <div class="actions"><button class="btn primary" type="submit">Enregistrer la ligne</button></div></form>`
    : historical
      ? ""
      : !can("editor")
        ? '<p class="note-line">Votre rôle (lecture) ne permet pas d\'ajouter des lignes.</p>'
        : "";

  const html = `<section class="card doc" id="doc"><header><h2>${esc(le.label)} <span class="muted">(${int(lines?.total ?? 0)})</span></h2><div class="actions">${reprice}</div></header>
      <div class="calc-status">${status}</div><div id="doc-err" class="pad-x"></div>
      ${table}${more}${uncomputedNote}${form}${totalsHtml}</section>`;

  const bind = () => {
    const sec = root.querySelector("#doc");
    if (!sec) return;
    sec.querySelector("#reprice")?.addEventListener("click", async (ev) => {
      const msg = `Recalculer « ${titleOf(e, r)} » avec la version active du modèle métier (v${av}) ?\n\nSes montants actuels${r._rules_version ? ` (calculés avec la v${r._rules_version})` : ""} seront remplacés par ceux que calcule le serveur. L'opération est tracée dans le journal.`;
      if (!confirm(msg)) return;
      const done = busy(ev.currentTarget, "Recalcul…");
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
        if (!confirm(`Supprimer la ligne « ${lineName(x)} » ? Les totaux du document seront recalculés par le serveur.`)) return;
        const done = busy(b, "…");
        try {
          await api("DELETE", `/api/e/${le.name}/${b.dataset.delLine}`);
          AFTER_RENDER = () => toast("Ligne supprimée : totaux recalculés par le serveur");
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
    const preview = attachPreview(f, le, { fields: inputs, fixed: { [via]: r.id }, panel: f.querySelector("#line-preview") });
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      const err = f.querySelector("#line-err");
      err.innerHTML = "";
      let body;
      try {
        body = { ...collect(f, inputs), [via]: r.id };
      } catch (x) {
        err.innerHTML = problem(x);
        return;
      }
      const done = busy(f.querySelector('button[type="submit"]'), "Enregistrement…");
      preview.cancel();
      try {
        const saved = await api("POST", `/api/e/${le.name}`, body);
        AFTER_RENDER = () => {
          toast(`Ligne enregistrée : totaux recalculés par le serveur${saved._rules_version ? ` (${modelLabel(saved._rules_version)})` : ""}`);
          const first = root.querySelector("#line-form input:not([type=hidden]), #line-form select");
          first?.focus();
        };
        await route();
      } catch (x) {
        done();
        err.innerHTML = problem(x);
      }
    };
  };
  return { html, bind };
}

/* Saisie --------------------------------------------------------------------- */
/** Contrôle de saisie d'un champ (libellé associé, aide, obligatoire). */
function fieldControl(e, f, v, { idPrefix = "f", title = null, compact = false } = {}) {
  const id = `${idPrefix}-${f.name}`;
  const req = f.required ? " required" : "";
  const label = `${esc(f.label)}${f.required ? ' <span class="req" aria-hidden="true">*</span>' : ""}`;
  const wide = f.type === "reference" || (!compact && f.type === "text" && ((f.max_length ?? 0) > 200 || /note|remarque|comment|description/.test(f.name)));
  const wrap = (control, hint = "") => `<div class="fld${wide ? " wide" : ""}"><label for="${id}">${label}</label>${control}${hint ? `<span class="hint">${hint}</span>` : ""}</div>`;
  switch (f.type) {
    case "boolean":
      // Trois états : une valeur vide de l'historique reste vide (jamais transformée en « Non »)
      return wrap(`<select id="${id}" name="${esc(f.name)}"${req}><option value=""${v === null || v === undefined ? " selected" : ""}>—</option><option value="1"${v === 1 || v === true ? " selected" : ""}>Oui</option><option value="0"${v === 0 || v === false ? " selected" : ""}>Non</option></select>`);
    case "enum":
      return wrap(`<select id="${id}" name="${esc(f.name)}"${req}><option value="">—</option>${(f.options ?? []).map((o) => `<option value="${esc(o.value)}"${o.value === v ? " selected" : ""}>${esc(o.label ?? o.value)}</option>`).join("")}</select>`);
    case "date":
      return wrap(`<input type="date" id="${id}" name="${esc(f.name)}" value="${esc(v ?? "")}"${req}>`);
    case "money":
      return wrap(`<input type="text" inputmode="decimal" id="${id}" name="${esc(f.name)}" value="${empty(v) ? "" : esc((Number(v) / 100).toFixed(2).replace(".", ","))}"${req} autocomplete="off">`, compact ? "" : `Montant, ex. ${esc(money(123456))}`);
    case "integer":
      return wrap(`<input type="text" inputmode="numeric" id="${id}" name="${esc(f.name)}" value="${esc(v ?? "")}"${req} autocomplete="off">`, compact ? "" : "Nombre entier");
    case "decimal":
    case "percent":
      return wrap(`<input type="text" inputmode="decimal" id="${id}" name="${esc(f.name)}" value="${esc(empty(v) ? "" : String(v).replace(".", ","))}"${req} autocomplete="off">`, f.type === "percent" && !compact ? "En %, ex. 5 ou 12,5" : "");
    case "reference": {
      const t = entity(f.references);
      return wrap(
        `<div class="picker" data-picker data-ref="${esc(f.references)}"><input type="text" class="picker-input" id="${id}" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${id}-list" autocomplete="off" placeholder="Rechercher : ${esc(t?.label_singular ?? t?.label ?? f.references)}" value="${esc(empty(v) ? "" : title ?? `#${v}`)}"${req}><input type="hidden" name="${esc(f.name)}" value="${esc(v ?? "")}"><ul class="picker-list" id="${id}-list" role="listbox" aria-label="${esc(t?.label ?? f.label)}" hidden></ul></div>`,
      );
    }
    case "email":
      return wrap(`<input type="email" id="${id}" name="${esc(f.name)}" value="${esc(v ?? "")}"${req} autocomplete="off">`);
    case "phone":
      return wrap(`<input type="tel" id="${id}" name="${esc(f.name)}" value="${esc(v ?? "")}"${req} autocomplete="off">`);
    default:
      return wide ? wrap(`<textarea id="${id}" name="${esc(f.name)}"${req}>${esc(v ?? "")}</textarea>`) : wrap(`<input type="text" id="${id}" name="${esc(f.name)}" value="${esc(v ?? "")}"${req} autocomplete="off">`);
  }
}
/** Champ affiché en lecture seule (calculé, ou valeur historique protégée) : jamais envoyé. */
function readOnlyField(e, f, r, reason) {
  return `<div class="fld ro${f.type === "reference" ? " wide" : ""}"><span class="lbl">${esc(f.label)}</span><div class="ro-value">${r?.id ? format(f, r[f.name], r._refs?.[f.name]) : '<span class="muted">—</span>'}</div><span class="hint">${esc(reason)}</span></div>`;
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

/** Sélecteur d'une référence : liste de l'entité référencée (GET /api/e/<entité>?q=…). */
function bindPickers(scope) {
  scope.querySelectorAll("[data-picker]").forEach((box) => {
    const input = box.querySelector(".picker-input");
    const hidden = box.querySelector('input[type="hidden"]');
    const list = box.querySelector(".picker-list");
    const t = entity(box.dataset.ref);
    if (!t) return;
    const extra = t.list_fields.filter((n) => n !== t.title_field).slice(0, 3).map((n) => fieldOf(t, n)).filter((f) => f && f.type !== "reference");
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
      list.innerHTML = '<li class="picker-msg">Recherche…</li>';
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
      try {
        const res = await api("GET", `/api/e/${t.name}?per=20${q ? `&q=${encodeURIComponent(q)}` : ""}`);
        if (my !== seq) return;
        items = res.rows;
        active = -1;
        list.innerHTML = items.length
          ? items.map((x, i) => `<li role="option" id="${esc(input.id)}-o${i}" data-i="${i}" aria-selected="false"><b>${esc(titleOf(t, x))}</b>${extra.length ? `<span class="opt-sub">${extra.map((f) => esc(plain(f, x[f.name], x._refs?.[f.name]))).join(" · ")}</span>` : ""}</li>`).join("") +
            (res.total > items.length ? `<li class="picker-msg">${esc(plural(res.total - items.length, "autre résultat", "autres résultats"))} : précisez la recherche</li>` : "")
          : `<li class="picker-msg">Aucun résultat${q ? ` pour « ${esc(q)} »` : ""}</li>`;
      } catch (x) {
        if (my === seq && !x.handled) list.innerHTML = `<li class="picker-msg error">${esc(explain(x).message)}</li>`;
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
    // La liste s'ouvre sur une action de l'utilisateur (clic, saisie, flèche), pas sur un focus programmé
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
function attachPreview(form, e, { fields, fixed = {}, id = null, panel }) {
  let timer = null;
  let seq = 0;
  const labels = fields.filter((f) => f.required).map((f) => f.label);
  const idle = () => `<div class="pv idle"><b>Aperçu du calcul</b><p>${labels.length ? `Renseignez ${esc(labels.join(", "))} : ` : ""}le serveur calcule la ligne avant l'enregistrement.</p></div>`;
  const run = async () => {
    const my = ++seq;
    let values;
    try {
      values = collect(form, fields, { partial: true });
    } catch (x) {
      panel.innerHTML = `<div class="pv idle"><b>Aperçu en attente</b><p>${esc(x.message)}</p></div>`;
      return;
    }
    if (!Object.keys(values).some((k) => fields.find((f) => f.name === k)?.type !== "boolean")) {
      panel.innerHTML = idle();
      return;
    }
    panel.classList.add("busy");
    try {
      const res = await api("POST", "/api/rules/preview", { entity: e.name, ...(id ? { id } : {}), values: { ...values, ...fixed } });
      if (my === seq) panel.innerHTML = previewHtml(e, res);
    } catch (x) {
      if (my === seq && !x.handled) panel.innerHTML = problem(x);
    } finally {
      if (my === seq) panel.classList.remove("busy");
    }
  };
  const schedule = (delay) => {
    clearTimeout(timer);
    timer = setTimeout(run, delay);
  };
  form.addEventListener("input", () => schedule(350));
  form.addEventListener("change", () => schedule(0));
  panel.innerHTML = idle();
  return {
    cancel: () => {
      clearTimeout(timer);
      seq++;
      panel.classList.remove("busy");
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
    return `<div class="pv ok"><div class="pv-head"><b>Aperçu du calcul</b><span>${esc(where)}</span></div><dl class="pv-values">${vals || '<div><dd class="muted">Aucune valeur calculée.</dd></div>'}</dl>${
      steps ? `<details class="pv-steps" open><summary>Étapes appliquées par le modèle (${int(res.steps.length)})</summary><ol>${steps}</ol></details>` : ""
    }<p class="pv-foot">Calcul effectué par le serveur ; rien n'est enregistré avant « Enregistrer ». Les étapes indiquent la valeur obtenue après chaque règle, dans les unités du modèle.</p></div>`;
  }
  const msg = String(res.message ?? "");
  const blocking = !["none", "historical"].includes(res.status);
  const title = res.status === "none" ? "Pas de calcul pour cette saisie" : res.status === "historical" ? "Enregistrement historique" : res.status === "rejected" ? "Refusé par une règle du modèle métier" : /^Calcul impossible/i.test(msg) ? "Calcul impossible" : "Calcul non disponible";
  return `<div class="pv ${blocking ? "warn" : "idle"}"><div class="pv-head"><b>${esc(title)}</b>${where ? `<span>${esc(where)}</span>` : ""}</div><p>${esc(cap(msg.replace(/^Calcul (impossible|non disponible)\s*:\s*/i, "")))}</p>${blocking ? '<p class="pv-foot">Le serveur refusera l\'enregistrement tant que ce calcul est impossible.</p>' : ""}</div>`;
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
  const docVia = isLine(e) ? bindings().find((b) => b.entity === e.name && b.scope === "line")?.document?.via ?? null : null;
  const version = !isLine(e) ? null : !id && docVia && records[docVia] ? records[docVia]._rules_version ?? activeVersion() : "document";
  const back = id ? `#/e/${name}/${id}` : `#/e/${name}`;
  const pageTitle = id ? `Modifier · ${titleOf(e, current)}` : `Nouveau · ${e.label_singular ?? e.label}`;
  const crumbs = `<a href="#/e/${name}">${esc(e.label)}</a>`;
  if (id && isProtectedLine(e, current)) {
    const lp = lineParent(e);
    shell(
      `${alertBox("lock", "Historique protégé", `Cet enregistrement appartient à un document historique (${lp.parent.label_singular ?? lp.parent.label}) : il n'est pas modifiable. Le document conserve ses montants d'origine ; pour toute correction, créez un nouveau document.`)}<p><a class="btn ghost" href="${back}">Retour à la fiche</a></p>`,
      { title: pageTitle, crumbs, badge: '<span class="chip lock big">Historique protégé</span>' },
    );
    return;
  }
  const editable = [];
  const controls = e.fields
    .map((f) => {
      const reason = lockReason(e, f, id ? current : {}, "form", version);
      if (reason) return readOnlyField(e, f, id ? current : null, reason);
      editable.push(f);
      return fieldControl(e, f, id ? current[f.name] : presets[f.name] ?? null, { title: id ? current._refs?.[f.name] ?? null : titles[f.name] ?? null });
    })
    .join("");
  const protRec = id && isProtectedRecord(e, current);
  const intro = protRec
    ? alertBox("lock", "Historique protégé", "Les valeurs historiques protégées et les montants calculés sont en lecture seule. Les autres informations restent modifiables ; chaque modification est tracée dans le journal. Si une modification touche une donnée utilisée par le calcul d'origine, le serveur la refuse.")
    : "";
  const withPreview = isLine(e) && can("editor");
  shell(
    `${intro}<section class="card"><form id="form" class="body" novalidate><div id="err"></div><div class="form">${controls}</div>
      ${withPreview ? '<div id="form-preview" class="preview-zone" aria-live="polite"></div>' : ""}
      ${id && current._migrated ? '<div class="fld" style="margin-top:14px"><label for="f-justification">Motif de la modification (journal d\'audit)</label><input type="text" id="f-justification" name="_justification" placeholder="Facultatif"></div>' : ""}
      <div class="actions" style="margin-top:18px"><button class="btn primary" type="submit">${id ? "Enregistrer" : "Créer"}</button><a class="btn ghost" href="${back}">Annuler</a></div></form></section>`,
    { title: pageTitle, crumbs, badge: protRec ? '<span class="chip lock big">Historique protégé</span>' : "" },
  );
  const form = root.querySelector("#form");
  bindPickers(form);
  const preview = withPreview ? attachPreview(form, e, { fields: editable, id, panel: form.querySelector("#form-preview") }) : null;
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const err = form.querySelector("#err");
    err.innerHTML = "";
    let body;
    try {
      body = collect(form, editable);
    } catch (x) {
      err.innerHTML = problem(x);
      err.scrollIntoView({ block: "nearest" });
      return;
    }
    if (id) for (const k of Object.keys(body)) if (body[k] === (current[k] ?? null)) delete body[k];
    const just = form.elements.namedItem("_justification")?.value.trim();
    if (just) body._justification = just;
    const done = busy(form.querySelector('button[type="submit"]'), "Enregistrement…");
    preview?.cancel();
    try {
      const saved = id ? await api("PUT", `/api/e/${name}/${id}`, body) : await api("POST", `/api/e/${name}`, body);
      toast(id ? "Modifications enregistrées" : "Enregistrement créé");
      go(`#/e/${name}/${saved.id}`);
    } catch (x) {
      done();
      err.innerHTML = problem(x);
      err.scrollIntoView({ block: "nearest" });
    }
  };
}

/* Modèle métier ------------------------------------------------------------ */
async function viewModel(t) {
  const rules = await api("GET", "/api/rules");
  if (t !== NAV) return;
  const av = rules.active_version;
  const versions = rules.versions.length
    ? `<div class="table-wrap"><table class="data stack"><thead><tr><th scope="col">Version</th><th scope="col">Origine</th><th scope="col">Publiée</th><th scope="col">Modules</th></tr></thead><tbody>${[...rules.versions]
        .reverse()
        .map(
          (v) =>
            `<tr><td data-label="Version"><b>v${esc(v.version)}</b>${v.version === av ? ' <span class="chip new">active</span>' : ""}</td><td data-label="Origine">${v.source === "fixture" ? '<span class="chip lock">Jeu de test</span>' : esc(SOURCE_LABEL[v.source] ?? v.source ?? "Non précisée")}</td><td data-label="Publiée">${esc(dateTime(v.published_at))}${v.published_by ? ` · ${esc(v.published_by)}` : ""}</td><td data-label="Modules" class="mono">${esc((v.modules ?? []).join(", "))}</td></tr>`,
        )
        .join("")}</tbody></table></div>`
    : '<p class="empty">Aucun modèle métier publié : les nouveaux enregistrements ne sont pas calculés automatiquement.</p>';
  const fixture = versionMeta(av)?.source === "fixture";
  const notes = av && versionMeta(av)?.notes ? `<p class="muted small" style="margin:0 0 10px">${esc(versionMeta(av).notes)}</p>` : "";
  const binds = (rules.bindings ?? [])
    .map((b) => {
      const be = entity(b.entity);
      const outs = Object.values(b.outputs ?? {}).map((n) => fieldOf(be, n)?.label ?? n);
      return `<li><b>${esc(be?.label ?? b.entity)}</b> · ${b.scope === "line" ? "calcul de chaque ligne" : "calcul du document"} <span class="mono muted">(module ${esc(b.module)})</span><div class="muted small">Champs calculés : ${esc(outs.join(", ") || "—")}</div></li>`;
    })
    .join("");
  const modules = Object.entries(rules.modules ?? {})
    .map(
      ([k, m]) =>
        `<details class="raw module"><summary>Module <span class="mono">${esc(k)}</span> · ${esc(plural((m.rules ?? []).length, "règle", "règles"))}</summary><div class="table-wrap"><table class="data stack"><thead><tr><th scope="col">Règle</th><th scope="col">Description</th><th scope="col">Statut</th><th scope="col" class="num">Confiance déclarée</th></tr></thead><tbody>${(m.rules ?? [])
          .map(
            (x) =>
              `<tr><td data-label="Règle" class="mono">${esc(x.id)}</td><td data-label="Description">${esc(x.description ?? x.type ?? "—")}</td><td data-label="Statut">${x.validation_status ? `<span class="chip ${x.validation_status === "validated" ? "new" : "lock"}">${esc(STATUS_LABEL[x.validation_status] ?? x.validation_status)}</span>` : '<span class="muted">Non précisé</span>'}</td><td data-label="Confiance déclarée" class="num">${typeof x.confidence === "number" ? `${esc(nb(Math.round(x.confidence * 100)))} %` : "—"}</td></tr>`,
          )
          .join("")}</tbody></table></div></details>`,
    )
    .join("");
  const nr = META.not_rebuilt ?? [];
  const notRebuilt = nr.length
    ? `<section class="card"><header><h2>Éléments non reconstruits <span class="muted">(${int(nr.length)})</span></h2></header><div class="table-wrap"><table class="data stack"><thead><tr><th scope="col">Type</th><th scope="col">Élément</th><th scope="col">Raison</th></tr></thead><tbody>${nr
        .map((x) => `<tr><td data-label="Type">${esc(KIND_LABEL[x.kind] ?? x.kind)}</td><td data-label="Élément" class="mono">${esc(x.name)}</td><td data-label="Raison">${esc(x.reason)}</td></tr>`)
        .join("")}</tbody></table></div></section>`
    : "";
  shell(
    `${fixture ? alertBox("warn", "Jeu de test", `La version active (v${av}) provient d'un jeu de test au format du modèle métier : elle sert à vérifier le logiciel et ne résulte pas de l'analyse de l'ancien logiciel.`) : ""}
     <div class="alert info">Le modèle métier calcule les nouveaux enregistrements sur le serveur. Chaque enregistrement garde la version avec laquelle il a été calculé ; les enregistrements historiques migrés conservent leurs montants d'origine et ne sont jamais recalculés.</div>
     <div class="two"><div class="grid"><section class="card"><header><h2>Versions publiées</h2>${av ? `<span class="chip new">active : v${esc(av)}</span>` : ""}</header>${versions}</section>
       ${modules ? `<section class="card"><header><h2>Règles de la version active</h2></header><div class="body">${notes}${modules}<p class="muted small" style="margin:10px 0 0">Confiance déclarée par l'auteur du modèle ; elle n'est pas mesurée par ce logiciel.</p></div></section>` : ""}</div>
       <div class="grid">${binds ? `<section class="card"><header><h2>Calculs en service</h2></header><div class="body"><ul class="plain timeline">${binds}</ul></div></section>` : ""}${notRebuilt}</div></div>`,
    { title: "Modèle métier" },
  );
}

/* Administration --------------------------------------------------------- */
async function viewAdmin(t) {
  const [users, backups, audit] = await Promise.all([api("GET", "/api/admin/users"), api("GET", "/api/admin/backups"), api("GET", "/api/admin/audit?limit=40")]);
  if (t !== NAV) return;
  const auditList = audit.length
    ? `<ul class="plain timeline">${audit
        .map((a) => {
          const e = a.entity ? entity(a.entity) : null;
          return `<li><b>${esc(a.user)}</b> · ${esc(ACTION[a.action] ?? a.action)}${a.entity ? ` ${e ? `<a href="#/e/${e.name}/${a.record_id}">${esc(e.label_singular ?? e.label)} #${esc(a.record_id)}</a>` : `${esc(a.entity)} #${esc(a.record_id)}`}` : ""} <span class="muted">· ${esc(dateTime(a.ts))}</span>${a.justification ? `<div class="muted small">Motif : ${esc(a.justification)}</div>` : ""}</li>`;
        })
        .join("")}</ul>`
    : '<p class="muted" style="margin:0">Journal vide.</p>';
  shell(
    `<div class="two"><div class="grid">
      <section class="card"><header><h2>Utilisateurs <span class="muted">(${int(users.length)})</span></h2></header>${rowsTableStatic(["Identifiant", "Rôle", "Créé le", "État"], users.map((u) => [esc(u.username), esc(ROLE_LABEL[u.role] ?? u.role), esc(dateTime(u.created_at)), u.disabled ? '<span class="chip neutral">désactivé</span>' : '<span class="chip new">actif</span>']))}
        <form id="newuser" class="body form" novalidate><div class="fld"><label for="nu-name">Identifiant</label><input type="text" id="nu-name" name="username" autocomplete="off" required></div><div class="fld"><label for="nu-pw">Mot de passe (10 caractères min.)</label><input type="password" id="nu-pw" name="password" autocomplete="new-password" required></div><div class="fld"><label for="nu-role">Rôle</label><select id="nu-role" name="role"><option value="viewer">Lecture</option><option value="editor">Saisie</option><option value="admin">Administration</option></select></div><div class="actions" style="align-self:end"><button class="btn primary" type="submit">Ajouter</button></div><div id="nu-err" style="grid-column:1/-1"></div></form></section>
      <section class="card"><header><h2>Journal d'audit</h2><span class="muted small">40 dernières entrées</span></header><div class="body">${auditList}</div></section></div>
      <section class="card"><header><h2>Sauvegardes</h2><button class="btn primary" type="button" id="backup">Sauvegarder maintenant</button></header><div class="body"><p class="muted" style="margin-top:0">Copie cohérente de la base. La restauration crée d'abord une sauvegarde de sécurité de l'état actuel.</p><ul class="plain timeline">${
        backups.map((b) => `<li class="backup"><span class="mono">${esc(b.name)}</span><span class="muted small">${esc(nb(Math.round((b.size / 1048576) * 10) / 10))} Mo</span><button class="btn ghost sm" type="button" data-restore="${esc(b.name)}">Restaurer</button></li>`).join("") || '<li class="muted">Aucune sauvegarde.</li>'
      }</ul></div></section></div>`,
    { title: "Administration" },
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
      if (!confirm(`Restaurer ${b.dataset.restore} ? L'état actuel sera sauvegardé avant la restauration.`)) return;
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
  root.querySelector("#newuser").onsubmit = async (ev) => {
    ev.preventDefault();
    const form = ev.target;
    const done = busy(form.querySelector('button[type="submit"]'), "Ajout…");
    try {
      await api("POST", "/api/admin/users", Object.fromEntries(new FormData(form)));
      AFTER_RENDER = () => toast("Utilisateur créé");
      route();
    } catch (x) {
      done();
      form.querySelector("#nu-err").innerHTML = problem(x);
    }
  };
}
function rowsTableStatic(head, rows) {
  if (!rows.length) return '<p class="empty">Aucun élément.</p>';
  return `<div class="table-wrap"><table class="data stack"><thead><tr>${head.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td data-label="${esc(head[i])}">${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

/* Routeur ---------------------------------------------------------------- */
async function route(fresh = false) {
  if (!META) return;
  const t = ++NAV;
  const path = (location.hash.slice(1) || "/").split("?")[0];
  const parts = path.split("/").filter(Boolean);
  setLoading(true);
  try {
    // La spécification est relue à chaque navigation : un modèle métier publié à chaud est pris en compte
    if (!fresh) META = await api("GET", "/api/meta");
    if (t !== NAV) return;
    applyBranding();
    if (!parts.length) await viewDashboard(t);
    else if (parts[0] === "admin" && can("admin")) await viewAdmin(t);
    else if (parts[0] === "modele") await viewModel(t);
    else if (parts[0] === "e" && entity(parts[1])) {
      const id = Number(parts[2]);
      if (parts.length === 2) await viewList(parts[1], t);
      else if (parts[2] === "new" && can("editor")) await viewForm(parts[1], null, t);
      else if (Number.isInteger(id) && id > 0 && parts[3] === "edit" && can("editor")) await viewForm(parts[1], id, t);
      else if (Number.isInteger(id) && id > 0 && parts.length === 3) await viewDetail(parts[1], id, t);
      else shell('<div class="empty-state"><p><b>Page introuvable.</b></p><p><a href="#/">Retour au tableau de bord</a></p></div>', { title: "Introuvable" });
    } else shell('<div class="empty-state"><p><b>Page introuvable.</b></p><p><a href="#/">Retour au tableau de bord</a></p></div>', { title: "Introuvable" });
    if (t === NAV && AFTER_RENDER) {
      const f = AFTER_RENDER;
      AFTER_RENDER = null;
      f();
    }
  } catch (x) {
    if (x.handled || t !== NAV || !META) return;
    AFTER_RENDER = null;
    shell(`${problem(x)}<p><a class="btn ghost" href="#/">Retour au tableau de bord</a></p>`, { title: x.status === 404 ? "Introuvable" : "Erreur" });
  } finally {
    if (t === NAV) setLoading(false);
  }
}

function renderFatal(x) {
  root.innerHTML = `<div class="login"><div class="card"><div class="body">${problem(x)}<button class="btn primary" type="button" id="retry">Réessayer</button></div></div></div>`;
  root.querySelector("#retry").onclick = () => boot();
}
async function boot() {
  try {
    META = await api("GET", "/api/meta");
  } catch (x) {
    if (!x.handled) renderFatal(x);
    return;
  }
  applyBranding();
  await route(true);
}
window.addEventListener("hashchange", () => route());
boot();

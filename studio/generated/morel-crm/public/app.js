// Interface du logiciel livré : entièrement pilotée par /api/meta (spécification générée).
const root = document.getElementById("root");
let META = null;
const CUR = () => META?.app?.currency ?? "EUR";

/* Utilitaires ---------------------------------------------------------- */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const money = (c) => (c === null || c === undefined ? "—" : (Number(c) / 100).toLocaleString("fr-FR", { style: "currency", currency: CUR() }));
const dateFr = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s ?? ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s ? esc(s) : "—";
};
const dateTime = (s) => (s ? new Date(s).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—");
const entity = (name) => META.entities.find((e) => e.name === name);
const fieldOf = (e, name) => e.fields.find((f) => f.name === name);
const optionLabel = (f, v) => f.options?.find((o) => o.value === v)?.label ?? v;

/** Montant saisi (« 1 234,56 ») → centimes entiers, sans calcul flottant. */
function parseMoney(input) {
  let t = String(input).replace(/[\s  €]/g, "").replace(/EUR/i, "");
  if (!t) return null;
  let neg = t.startsWith("-");
  if (neg || t.startsWith("+")) t = t.slice(1);
  const sep = t.lastIndexOf(",") > t.lastIndexOf(".") ? "," : ".";
  const [i, f = "", extra] = t.split(sep);
  if (extra !== undefined || !/^\d+$/.test(i.replaceAll(sep === "," ? "." : ",", "")) || !/^\d{0,2}$/.test(f)) throw new Error(`Montant invalide : « ${input} »`);
  const cents = Number(i.replaceAll(sep === "," ? "." : ",", "")) * 100 + Number((f + "00").slice(0, 2));
  return neg ? -cents : cents;
}

function format(f, v, refTitle) {
  if (v === null || v === undefined || v === "") return '<span class="muted">—</span>';
  switch (f.type) {
    case "money":
      return `<span class="num">${esc(money(v))}</span>`;
    case "date":
      return dateFr(v);
    case "boolean":
      return v ? "Oui" : "Non";
    case "enum":
      return esc(optionLabel(f, v));
    case "percent":
      return `${esc(Number(v).toLocaleString("fr-FR"))} %`;
    case "decimal":
    case "integer":
      return `<span class="num">${esc(Number(v).toLocaleString("fr-FR"))}</span>`;
    case "reference":
      return `<a href="#/e/${f.references}/${v}">${esc(refTitle ?? `#${v}`)}</a>`;
    case "email":
      return `<a href="mailto:${esc(v)}">${esc(v)}</a>`;
    default:
      return esc(v);
  }
}

async function api(method, url, body) {
  const res = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const type = res.headers.get("content-type") ?? "";
  const data = type.includes("json") ? await res.json() : await res.text();
  if (res.status === 401 && !url.includes("/auth/")) {
    META = null;
    renderLogin();
    throw new Error("Session expirée");
  }
  if (!res.ok) throw new Error(data?.error ?? `Erreur ${res.status}`);
  return data;
}

function toast(text, error = false) {
  const el = document.createElement("div");
  el.className = `toast${error ? " error" : ""}`;
  el.textContent = text;
  el.setAttribute("role", error ? "alert" : "status");
  document.body.append(el);
  setTimeout(() => el.remove(), error ? 6000 : 3000);
}

const params = () => new URLSearchParams(location.hash.split("?")[1] ?? "");
const go = (h) => (location.hash = h);
const can = (role) => ({ admin: 3, editor: 2, viewer: 1 })[META.user.role] >= ({ admin: 3, editor: 2, viewer: 1 })[role];

/* Connexion ------------------------------------------------------------- */
function renderLogin(msg = "") {
  document.title = "Connexion";
  root.innerHTML = `<div class="login"><div class="card"><form id="login"><div><h1>Connexion</h1><p class="muted" style="margin:4px 0 0">Accès réservé aux utilisateurs autorisés.</p></div>
    ${msg ? `<div class="alert error">${esc(msg)}</div>` : ""}
    <label>Identifiant<input type="text" name="username" autocomplete="username" required></label>
    <label>Mot de passe<input type="password" name="password" autocomplete="current-password" required></label>
    <button class="btn primary" type="submit">Se connecter</button></form></div></div>`;
  root.querySelector("#login").onsubmit = async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    try {
      await api("POST", "/api/auth/login", { username: f.get("username"), password: f.get("password") });
      await boot();
    } catch (e) {
      renderLogin(e.message);
    }
  };
}

/* Coquille -------------------------------------------------------------- */
function shell(content, { title, crumbs = "", actions = "" }) {
  document.title = `${title} · ${META.app.name}`;
  const route = location.hash.split("?")[0];
  const nav = META.navigation
    .map((n) => {
      const e = entity(n.entity);
      const on = route === `#/e/${e.name}` || route.startsWith(`#/e/${e.name}/`);
      return `<a href="#/e/${e.name}" ${on ? 'aria-current="page"' : ""}>${esc(e.label)}</a>`;
    })
    .join("");
  root.innerHTML = `<div class="shell" id="shell">
    <aside class="side"><div class="brand"><b>${esc(META.app.name)}</b><span>${esc(META.app.tagline ?? "")}</span></div>
      <nav class="nav" aria-label="Navigation"><a href="#/" ${route === "#/" || route === "" ? 'aria-current="page"' : ""}>Tableau de bord</a><div class="group">Données</div>${nav}
      ${can("admin") ? `<div class="group">Administration</div><a href="#/admin" ${route === "#/admin" ? 'aria-current="page"' : ""}>Utilisateurs et sauvegardes</a>` : ""}</nav>
      <div class="who"><span>${esc(META.user.name)} · ${esc(META.user.role)}</span><button id="logout">Déconnexion</button></div></aside>
    <main class="main"><div class="top"><div><button class="btn ghost menu-toggle" id="menu" aria-label="Menu">☰</button><div class="crumbs">${crumbs}</div><h1>${esc(title)}</h1></div><div class="actions">${actions}</div></div>${content}</main></div>`;
  root.querySelector("#logout").onclick = async () => {
    await api("POST", "/api/auth/logout");
    META = null;
    renderLogin();
  };
  root.querySelector("#menu").onclick = () => root.querySelector("#shell").classList.toggle("open");
}

/* Tableau de bord ----------------------------------------------------- */
async function viewDashboard() {
  const d = await api("GET", "/api/dashboard");
  const cards = d.cards
    .map((c) => {
      const e = entity(c.entity);
      const value = c.kind === "sum" ? money(c.value) : Number(c.value).toLocaleString("fr-FR");
      const sub = c.kind === "count" ? (c.migrated === c.value ? "toutes migrées" : `${Number(c.migrated).toLocaleString("fr-FR")} migrées · ${Number(c.value - c.migrated).toLocaleString("fr-FR")} créées ici`) : esc(c.sub ?? "");
      return `<a class="card kpi" href="#/e/${e.name}" style="color:inherit;text-decoration:none"><div class="label">${esc(c.label)}</div><div class="value">${esc(value)}</div><div class="sub">${sub}</div></a>`;
    })
    .join("");
  const breakdowns = d.breakdowns
    .map((b) => {
      const e = entity(b.entity);
      const f = fieldOf(e, b.field);
      const total = b.values.reduce((s, x) => s + x.n, 0) || 1;
      return `<section class="card"><header><h2>${esc(b.label)}</h2></header><div class="body"><ul class="plain breakdown">${b.values
        .map((v) => `<li><a href="#/e/${e.name}?${b.field}=${encodeURIComponent(v.value ?? "")}">${esc(v.value === null ? "Non renseigné" : optionLabel(f, v.value))}</a><div class="bar"><span style="width:${(v.n / total) * 100}%"></span></div><span class="num">${v.n.toLocaleString("fr-FR")}</span></li>`)
        .join("")}</ul></div></section>`;
    })
    .join("");
  const recent = d.recent.length
    ? `<ul class="plain timeline">${d.recent.map((r) => `<li><b>${esc(r.user)}</b> · ${esc(ACTION[r.action] ?? r.action)} <a href="#/e/${r.entity}/${r.record_id}">${esc(entity(r.entity)?.label_singular ?? r.entity)} #${r.record_id}</a> <span class="muted">· ${dateTime(r.ts)}</span></li>`).join("")}</ul>`
    : '<p class="muted" style="margin:0">Aucune modification depuis la mise en service.</p>';
  const origin = d.migration
    ? `<div class="alert info">Données historiques migrées depuis <b>${esc(d.migration.source_system)}</b> le ${dateTime(d.migration.migrated_at)} (exécution ${esc(d.migration.run)}). Chaque fiche migrée indique son origine exacte.</div>`
    : "";
  shell(`${origin}<div class="grid"><div class="kpis">${cards}</div><div class="two"><div class="grid">${breakdowns}</div><section class="card"><header><h2>Dernières modifications</h2></header><div class="body">${recent}</div></section></div></div>`, { title: "Tableau de bord" });
}
const ACTION = { create: "a créé", update: "a modifié", delete: "a supprimé", file_added: "a joint un fichier à" };

/* Liste -------------------------------------------------------------------- */
async function viewList(name) {
  const e = entity(name);
  const p = params();
  const page = Number(p.get("page") ?? 1);
  const data = await api("GET", `/api/e/${name}?${p.toString()}&per=25`);
  const cols = e.list_fields.map((n) => fieldOf(e, n)).filter(Boolean);
  const filters = e.fields.filter((f) => p.get(f.name)).map((f) => `<span class="chip neutral">${esc(f.label)} : ${esc(f.type === "reference" ? `#${p.get(f.name)}` : optionLabel(f, p.get(f.name)))} <a href="#/e/${name}" aria-label="Retirer le filtre">×</a></span>`);
  const sortLink = (f) => {
    const q = new URLSearchParams(p);
    q.set("sort", f.name);
    q.set("dir", p.get("sort") === f.name && p.get("dir") !== "desc" ? "desc" : "asc");
    q.delete("page");
    return `#/e/${name}?${q}`;
  };
  const rows = data.rows.length
    ? data.rows
        .map((r) => `<tr class="link" data-href="#/e/${name}/${r.id}">${cols.map((f, i) => `<td${["money", "integer", "decimal"].includes(f.type) ? ' class="num"' : ""}>${i === 0 ? `<a href="#/e/${name}/${r.id}">${format(f, r[f.name], r._refs?.[f.name])}</a>` : format(f, r[f.name], r._refs?.[f.name])}</td>`).join("")}<td>${r._migrated ? '<span class="chip origin">migré</span>' : '<span class="chip new">nouveau</span>'}</td></tr>`)
        .join("")
    : `<tr><td colspan="${cols.length + 1}" class="empty">Aucun enregistrement${p.get("q") ? ` pour « ${esc(p.get("q"))} »` : ""}.</td></tr>`;
  const pages = Math.max(1, Math.ceil(data.total / data.per));
  const pageLink = (n) => {
    const q = new URLSearchParams(p);
    q.set("page", n);
    return `#/e/${name}?${q}`;
  };
  shell(
    `<section class="card"><header><form id="search" class="actions" role="search"><input type="search" class="search" name="q" placeholder="Rechercher (${esc(e.search_fields.map((n) => fieldOf(e, n)?.label ?? n).join(", ") || "titre")})" value="${esc(p.get("q") ?? "")}">${filters.join(" ")}</form><span class="muted">${data.total.toLocaleString("fr-FR")} enregistrement(s)</span></header>
     <div class="table-wrap"><table><thead><tr>${cols.map((f) => `<th${["money", "integer", "decimal"].includes(f.type) ? ' class="num"' : ""}><a href="${sortLink(f)}" style="color:inherit">${esc(f.label)}${p.get("sort") === f.name ? (p.get("dir") === "desc" ? " ↓" : " ↑") : ""}</a></th>`).join("")}<th>Origine</th></tr></thead><tbody>${rows}</tbody></table></div>
     <div class="pager"><span>Page ${page} / ${pages}</span><span class="actions">${page > 1 ? `<a class="btn ghost" href="${pageLink(page - 1)}">Précédente</a>` : ""}${page < pages ? `<a class="btn ghost" href="${pageLink(page + 1)}">Suivante</a>` : ""}</span></div></section>`,
    {
      title: e.label,
      actions: `<a class="btn ghost" href="/api/export/${name}.csv">Exporter (CSV)</a>${can("editor") ? `<a class="btn primary" href="#/e/${name}/new${[...p].filter(([k]) => fieldOf(e, k)?.type === "reference").map(([k, v], i) => `${i ? "&" : "?"}${k}=${v}`).join("")}">Nouveau</a>` : ""}`,
    },
  );
  root.querySelector("#search").onsubmit = (ev) => {
    ev.preventDefault();
    const q = new URLSearchParams(p);
    q.set("q", new FormData(ev.target).get("q"));
    q.delete("page");
    go(`#/e/${name}?${q}`);
  };
  root.querySelectorAll("tr.link").forEach((tr) => (tr.onclick = (ev) => ev.target.closest("a") || go(tr.dataset.href)));
}

/* Fiche -------------------------------------------------------------------- */
async function viewDetail(name, id) {
  const e = entity(name);
  const d = await api("GET", `/api/e/${name}/${id}`);
  const r = d.record;
  const title = String(r[e.title_field] ?? `${e.label_singular} #${r.id}`);
  const locked = r._migrated && e.fields.some((f) => f.accounting);
  const fields = e.fields.map((f) => `<div><dt>${esc(f.label)}${f.accounting && r._migrated ? ' <span class="chip lock" title="Valeur historique : non modifiable">historique</span>' : ""}</dt><dd>${format(f, r[f.name], r._refs?.[f.name])}</dd></div>`).join("");
  const children = e.children
    .map((c) => {
      const ce = entity(c.entity);
      const block = d.children[`${c.entity}.${c.via}`];
      const cols = ce.list_fields.filter((n) => n !== c.via).slice(0, 5).map((n) => fieldOf(ce, n)).filter(Boolean);
      const body = block.rows.length
        ? `<div class="table-wrap"><table><thead><tr>${cols.map((f) => `<th>${esc(f.label)}</th>`).join("")}</tr></thead><tbody>${block.rows.map((x) => `<tr class="link" data-href="#/e/${c.entity}/${x.id}">${cols.map((f, i) => `<td>${i === 0 ? `<a href="#/e/${c.entity}/${x.id}">${format(f, x[f.name], x._refs?.[f.name])}</a>` : format(f, x[f.name], x._refs?.[f.name])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>${block.total > block.rows.length ? `<div class="pager"><a href="#/e/${c.entity}?${c.via}=${r.id}">Voir les ${block.total} enregistrements</a></div>` : ""}`
        : '<p class="empty">Aucun enregistrement lié.</p>';
      const canAdd = can("editor") && !(locked && (e.aggregates ?? []).some((a) => a.children === c.entity));
      return `<section class="card"><header><h2>${esc(c.label)} <span class="muted">(${block.total})</span></h2>${canAdd ? `<a class="btn ghost" href="#/e/${c.entity}/new?${c.via}=${r.id}">Ajouter</a>` : ""}</header>${body}</section>`;
    })
    .join("");
  const files = `<section class="card"><header><h2>Pièces jointes <span class="muted">(${d.files.length})</span></h2>${can("editor") ? '<label class="btn ghost">Joindre un fichier<input type="file" id="upload" hidden></label>' : ""}</header><div class="body">${
    d.files.length ? `<ul class="plain timeline">${d.files.map((f) => `<li><a href="/api/files/${f.id}">${esc(f.filename)}</a> <span class="muted">· ${(f.size / 1024).toFixed(1)} Ko · ${f._migrated ? "migré" : `ajouté par ${esc(f.created_by)}`}</span> <span class="mono muted" title="Empreinte SHA-256">${esc(f.sha256.slice(0, 12))}</span></li>`).join("")}</ul>` : '<p class="muted" style="margin:0">Aucune pièce jointe.</p>'
  }</div></section>`;
  const lineage = d.lineage
    ? `<section class="card"><header><h2>Origine de la donnée</h2><span class="chip origin">migré</span></header><div class="body"><dl class="fields">
        <div><dt>Logiciel source</dt><dd>${esc(d.lineage.source_system)}</dd></div><div><dt>Table et clé d'origine</dt><dd class="mono">${esc(d.lineage.source_table)} · ${esc(d.lineage.source_key)}</dd></div>
        <div><dt>Fichier extrait</dt><dd>${esc(d.lineage.source_file)} <span class="mono muted">${esc(String(d.lineage.source_file_sha256 ?? "").slice(0, 12))}</span></dd></div><div><dt>Migration</dt><dd>${esc(d.lineage.run_id)} · ${dateTime(d.lineage.migrated_at)}</dd></div></dl>
        <details class="raw" style="margin-top:12px"><summary>Transformations appliquées</summary><pre>${esc(Object.entries(d.lineage.transforms).map(([k, t]) => `${k} ← ${t.source}${t.transforms.length ? `  [${t.transforms.join(" → ")}]` : ""}`).join("\n"))}</pre></details>
        <details class="raw" style="margin-top:8px"><summary>Ligne d'origine complète</summary><pre>${esc(JSON.stringify(d.lineage.source_row, null, 2))}</pre></details></div></section>`
    : `<section class="card"><header><h2>Origine de la donnée</h2><span class="chip new">créé dans ce logiciel</span></header><div class="body muted">Enregistrement créé le ${dateTime(r._created_at)}.</div></section>`;
  const history = `<section class="card"><header><h2>Historique</h2></header><div class="body">${
    d.history.length ? `<ul class="plain timeline">${d.history.map((h) => `<li><b>${esc(h.user)}</b> · ${esc(ACTION[h.action] ?? h.action)} · <span class="muted">${dateTime(h.ts)}</span>${h.after && h.action === "update" ? `<div class="mono muted">${esc(Object.entries(JSON.parse(h.after)).map(([k, v]) => `${k} : ${JSON.stringify(JSON.parse(h.before ?? "{}")[k])} → ${JSON.stringify(v)}`).join(" · "))}</div>` : ""}</li>`).join("")}</ul>` : '<p class="muted" style="margin:0">Aucune modification depuis la migration.</p>'
  }</div></section>`;
  shell(
    `${locked ? '<div class="alert warn">Document comptable historique : ses montants sont conservés tels qu\'enregistrés dans l\'ancien logiciel et ne peuvent pas être modifiés.</div>' : ""}
     <div class="two"><div class="grid"><section class="card"><div class="body"><dl class="fields">${fields}</dl></div></section>${children}</div><div class="grid">${lineage}${files}${history}</div></div>`,
    {
      title,
      crumbs: `<a href="#/e/${name}">${esc(e.label)}</a>${r._source_key ? ` · <span class="mono">${esc(r._source_key)}</span>` : ""}`,
      actions: can("editor") ? `<a class="btn ghost" href="#/e/${name}/${id}/edit">Modifier</a>${locked ? "" : '<button class="btn danger" id="del">Supprimer</button>'}` : "",
    },
  );
  root.querySelectorAll("tr.link").forEach((tr) => (tr.onclick = (ev) => ev.target.closest("a") || go(tr.dataset.href)));
  root.querySelector("#del")?.addEventListener("click", async () => {
    if (!confirm(`Supprimer « ${title} » ? Cette action est enregistrée dans le journal.`)) return;
    try {
      await api("DELETE", `/api/e/${name}/${id}`);
      toast("Enregistrement supprimé");
      go(`#/e/${name}`);
    } catch (x) {
      toast(x.message, true);
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
      toast(x.message, true);
    }
  });
}

/* Formulaire ---------------------------------------------------------------- */
async function viewForm(name, id) {
  const e = entity(name);
  const current = id ? (await api("GET", `/api/e/${name}/${id}`)).record : {};
  const p = params();
  const computed = new Set((e.computed ?? []).map((c) => c.field));
  const aggregated = new Set((e.aggregates ?? []).map((a) => a.field));
  const input = (f) => {
    const v = id ? current[f.name] : p.get(f.name) ?? null;
    const lockedHist = id && current._migrated && f.accounting;
    const auto = !current._migrated && (computed.has(f.name) || aggregated.has(f.name));
    const dis = lockedHist || auto ? "disabled" : "";
    const req = f.required ? "required" : "";
    const hint = lockedHist ? '<span class="hint">Valeur historique (non modifiable)</span>' : auto ? '<span class="hint">Calculé automatiquement</span>' : "";
    const label = `${esc(f.label)}${f.required ? " *" : ""}`;
    switch (f.type) {
      case "boolean":
        return `<label class="check"><input type="checkbox" name="${f.name}" ${v ? "checked" : ""} ${dis}> ${label}</label>`;
      case "enum":
        return `<label>${label}<select name="${f.name}" ${req} ${dis}><option value="">—</option>${(f.options ?? []).map((o) => `<option value="${esc(o.value)}" ${o.value === v ? "selected" : ""}>${esc(o.label ?? o.value)}</option>`).join("")}</select>${hint}</label>`;
      case "date":
        return `<label>${label}<input type="date" name="${f.name}" value="${esc(v ?? "")}" ${req} ${dis}>${hint}</label>`;
      case "money":
        return `<label>${label}<input type="text" inputmode="decimal" name="${f.name}" value="${v === null || v === undefined ? "" : esc((Number(v) / 100).toFixed(2).replace(".", ","))}" ${req} ${dis}>${hint || '<span class="hint">En euros, ex. 1 234,56</span>'}</label>`;
      case "integer":
      case "decimal":
      case "percent":
        return `<label>${label}<input type="text" inputmode="decimal" name="${f.name}" value="${esc(v ?? "")}" ${req} ${dis}>${hint}</label>`;
      case "reference": {
        const t = entity(f.references);
        const refTitle = id ? current._refs?.[f.name] : null;
        return `<label>${label}<input type="search" name="${f.name}" list="dl-${f.name}" data-ref="${f.references}" value="${v ? esc(`${refTitle ?? ""} · #${v}`) : ""}" placeholder="Rechercher ${esc(t.label_singular ?? t.label)}" ${req} ${dis} autocomplete="off"><datalist id="dl-${f.name}"></datalist>${hint}</label>`;
      }
      default:
        return (f.max_length ?? 0) > 200 || /note|remarque|comment|description/.test(f.name)
          ? `<label style="grid-column:1/-1">${label}<textarea name="${f.name}" ${req} ${dis}>${esc(v ?? "")}</textarea></label>`
          : `<label>${label}<input type="text" name="${f.name}" value="${esc(v ?? "")}" ${req} ${dis}>${hint}</label>`;
    }
  };
  shell(`<section class="card"><form id="form" class="body" novalidate><div id="err"></div><div class="form">${e.fields.map(input).join("")}</div>
      ${id && current._migrated ? '<label style="display:flex;flex-direction:column;gap:5px;margin-top:14px;font-size:12.5px;font-weight:600">Motif de la modification (journal d\'audit)<input type="text" name="_justification" placeholder="Facultatif"></label>' : ""}
      <div class="actions" style="margin-top:18px"><button class="btn primary" type="submit">${id ? "Enregistrer" : "Créer"}</button><a class="btn ghost" href="${id ? `#/e/${name}/${id}` : `#/e/${name}`}">Annuler</a></div></form></section>`, {
    title: id ? `Modifier · ${current[e.title_field] ?? `#${id}`}` : `Nouveau · ${e.label_singular ?? e.label}`,
    crumbs: `<a href="#/e/${name}">${esc(e.label)}</a>`,
  });
  const form = root.querySelector("#form");
  form.querySelectorAll("input[data-ref]").forEach((el) => {
    let timer;
    el.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const res = await api("GET", `/api/e/${el.dataset.ref}?q=${encodeURIComponent(el.value.replace(/ · #\d+$/, ""))}&per=15`);
        const t = entity(el.dataset.ref);
        form.querySelector(`#dl-${el.name}`).innerHTML = res.rows.map((x) => `<option value="${esc(`${x[t.title_field] ?? ""} · #${x.id}`)}"></option>`).join("");
      }, 200);
    });
  });
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const body = {};
    try {
      for (const f of e.fields) {
        const el = form.elements[f.name];
        if (!el || el.disabled) continue;
        if (f.type === "boolean") body[f.name] = el.checked ? 1 : 0;
        else if (f.type === "money") body[f.name] = el.value.trim() ? parseMoney(el.value) : null;
        else if (f.type === "reference") {
          const m = /#(\d+)\s*$/.exec(el.value);
          if (el.value.trim() && !m) throw new Error(`${f.label} : choisissez une valeur dans la liste`);
          body[f.name] = m ? Number(m[1]) : null;
        } else if (["integer"].includes(f.type)) body[f.name] = el.value.trim() === "" ? null : el.value.trim();
        else body[f.name] = el.value.trim() === "" ? null : el.value;
        if (id && body[f.name] === current[f.name]) delete body[f.name];
      }
      if (form.elements._justification?.value) body._justification = form.elements._justification.value;
      const saved = id ? await api("PUT", `/api/e/${name}/${id}`, body) : await api("POST", `/api/e/${name}`, body);
      toast(id ? "Modifications enregistrées" : "Enregistrement créé");
      go(`#/e/${name}/${saved.id}`);
    } catch (x) {
      form.querySelector("#err").innerHTML = `<div class="alert error" role="alert">${esc(x.message)}</div>`;
    }
  };
}

/* Administration --------------------------------------------------------- */
async function viewAdmin() {
  const [users, backups, audit] = await Promise.all([api("GET", "/api/admin/users"), api("GET", "/api/admin/backups"), api("GET", "/api/admin/audit?limit=40")]);
  shell(
    `<div class="two"><div class="grid">
      <section class="card"><header><h2>Utilisateurs</h2></header><div class="table-wrap"><table><thead><tr><th>Identifiant</th><th>Rôle</th><th>Créé le</th></tr></thead><tbody>${users.map((u) => `<tr><td>${esc(u.username)}</td><td>${esc(u.role)}</td><td>${dateTime(u.created_at)}</td></tr>`).join("")}</tbody></table></div>
        <form id="newuser" class="body form"><label>Identifiant<input type="text" name="username" required></label><label>Mot de passe (10 caractères min.)<input type="password" name="password" required></label><label>Rôle<select name="role"><option value="viewer">Lecture</option><option value="editor">Saisie</option><option value="admin">Administration</option></select></label><div class="actions" style="align-self:end"><button class="btn primary">Ajouter</button></div></form></section>
      <section class="card"><header><h2>Journal d'audit</h2></header><div class="body"><ul class="plain timeline">${audit.map((a) => `<li><b>${esc(a.user)}</b> · ${esc(a.action)}${a.entity ? ` · ${esc(a.entity)} #${a.record_id}` : ""} <span class="muted">· ${dateTime(a.ts)}</span>${a.justification ? `<div class="muted">Motif : ${esc(a.justification)}</div>` : ""}</li>`).join("")}</ul></div></section></div>
      <section class="card"><header><h2>Sauvegardes</h2><button class="btn primary" id="backup">Sauvegarder maintenant</button></header><div class="body"><p class="muted" style="margin-top:0">Copie cohérente de la base. La restauration crée d'abord une sauvegarde de sécurité de l'état actuel.</p><ul class="plain timeline">${backups.map((b) => `<li style="display:flex;justify-content:space-between;gap:8px"><span class="mono">${esc(b.name)}</span><button class="btn ghost" data-restore="${esc(b.name)}">Restaurer</button></li>`).join("") || '<li class="muted">Aucune sauvegarde.</li>'}</ul></div></section></div>`,
    { title: "Administration" },
  );
  root.querySelector("#backup").onclick = async () => {
    try {
      await api("POST", "/api/admin/backups");
      toast("Sauvegarde créée");
      route();
    } catch (x) {
      toast(x.message, true);
    }
  };
  root.querySelectorAll("[data-restore]").forEach((b) => {
    b.onclick = async () => {
      if (!confirm(`Restaurer ${b.dataset.restore} ? L'état actuel sera sauvegardé avant la restauration.`)) return;
      try {
        await api("POST", `/api/admin/backups/${b.dataset.restore}/restore`);
        toast("Base restaurée");
        route();
      } catch (x) {
        toast(x.message, true);
      }
    };
  });
  root.querySelector("#newuser").onsubmit = async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    try {
      await api("POST", "/api/admin/users", Object.fromEntries(f));
      toast("Utilisateur créé");
      route();
    } catch (x) {
      toast(x.message, true);
    }
  };
}

/* Routeur ---------------------------------------------------------------- */
async function route() {
  if (!META) return;
  const path = (location.hash.slice(1) || "/").split("?")[0];
  const parts = path.split("/").filter(Boolean);
  try {
    if (!parts.length) return await viewDashboard();
    if (parts[0] === "admin") return await viewAdmin();
    if (parts[0] === "e" && entity(parts[1])) {
      if (parts.length === 2) return await viewList(parts[1]);
      if (parts[2] === "new") return await viewForm(parts[1], null);
      if (parts[3] === "edit") return await viewForm(parts[1], Number(parts[2]));
      return await viewDetail(parts[1], Number(parts[2]));
    }
    shell('<p class="empty">Page introuvable.</p>', { title: "Introuvable" });
  } catch (x) {
    if (META) shell(`<div class="alert error">${esc(x.message)}</div>`, { title: "Erreur" });
  }
}

async function boot() {
  try {
    META = await api("GET", "/api/meta");
  } catch {
    return renderLogin();
  }
  await route();
}
window.addEventListener("hashchange", route);
boot();

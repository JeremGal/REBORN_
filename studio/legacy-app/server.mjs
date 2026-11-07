#!/usr/bin/env node
/**
 * Quotix 98 — logiciel historique de test pour REBORN.
 *
 * Configurateur de devis industriel « boîte noire » : aucune API, uniquement
 * une interface HTML. Les règles de calcul sont cachées dans hidden-rules.json.
 *
 *   node server.mjs                       → http://localhost:4000
 *   PORT=4100 LEGACY_ADMIN_PORT=4101 LEGACY_ADMIN_TOKEN=xyz node server.mjs
 *
 * Console de maintenance (Blind Challenge) : serveur SÉPARÉ, lié à 127.0.0.1 uniquement
 * (port 4001 par défaut) et protégé par un jeton. Elle n'est donc ni exposée par un
 * tunnel du port 4000, ni atteignable sans le jeton par l'agent explorateur.
 *   LEGACY_ADMIN_TOKEN=… (fourni par npm run dev depuis .secrets/tokens.json ; sinon jeton
 *   aléatoire NON affiché : la console reste alors inaccessible). Ouverture : npm run maintenance.
 */
import http from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { computeQuote as computeWith, loadDefaultRules } from "./quotix-core.mjs";

const PORT = Number(process.env.PORT ?? 4000);
const HOST = process.env.LEGACY_HOST ?? "0.0.0.0";
const ADMIN_PORT = Number(process.env.LEGACY_ADMIN_PORT ?? 4001);
const ADMIN_TOKEN = process.env.LEGACY_ADMIN_TOKEN || randomBytes(24).toString("hex");
const DEFAULTS = loadDefaultRules();
let rules = structuredClone(DEFAULTS);
let quoteCounter = 417;

const computeQuote = (input) => computeWith(rules, input);

/* ------------------------------------------------------------------ */
/* Rendu                                                                */
/* ------------------------------------------------------------------ */

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
const money = (n) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ | /g, " ");

const CSS = `
*{box-sizing:border-box}
body{margin:0;min-height:100vh;background:#008080;font:11px "MS Sans Serif",Tahoma,Geneva,Verdana,sans-serif;color:#000;display:flex;align-items:flex-start;justify-content:center;padding:48px 12px;-webkit-font-smoothing:none}
.win{width:560px;max-width:100%;background:#c0c0c0;border:2px solid;border-color:#fff #000 #000 #fff;box-shadow:inset -1px -1px #808080,inset 1px 1px #dfdfdf;padding:3px}
.title{background:linear-gradient(90deg,#000080,#1084d0);color:#fff;font-weight:bold;padding:3px 4px;display:flex;justify-content:space-between;align-items:center}
.title .btns span{display:inline-block;width:16px;height:14px;margin-left:2px;background:#c0c0c0;color:#000;text-align:center;line-height:12px;font-size:10px;border:1px solid;border-color:#fff #000 #000 #fff}
.menu{padding:3px 2px;border-bottom:1px solid #808080}
.menu span{padding:2px 7px}
.menu span u{text-decoration:underline}
.body{padding:10px}
fieldset{border:1px solid #808080;box-shadow:1px 1px #fff;margin:0 0 10px;padding:8px 10px 10px}
legend{padding:0 3px}
.row{display:flex;align-items:center;margin:6px 0}
.row label{width:120px}
select,input[type=text]{font:inherit;background:#fff;border:2px solid;border-color:#808080 #fff #fff #808080;box-shadow:inset 1px 1px #000;padding:2px 3px;height:22px}
select{width:300px}
input[type=text]{width:80px;text-align:right}
.actions{display:flex;gap:6px;margin:4px 0 10px}
button{font:inherit;min-width:88px;height:24px;background:#c0c0c0;border:2px solid;border-color:#fff #000 #000 #fff;box-shadow:inset -1px -1px #808080;cursor:pointer}
button:active{border-color:#000 #fff #fff #000;box-shadow:inset 1px 1px #808080}
#resultat{background:#fff;border:2px solid;border-color:#808080 #fff #fff #808080;box-shadow:inset 1px 1px #000;padding:8px 10px;font:bold 14px "Courier New",monospace;min-height:36px}
#resultat.err{color:#a00000}
#resultat.vide{color:#808080;font-weight:normal}
.status{display:flex;gap:3px;margin-top:3px}
.status div{flex:1;border:1px solid;border-color:#808080 #fff #fff #808080;padding:2px 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.status div:first-child{flex:2}
.ref{color:#404040;margin-bottom:8px}
`;

function page({ values = {}, result = null }) {
  const v = { product: "A", quantity: "1", customer_type: "standard", ...values };
  const productOpts = Object.entries(rules.products)
    .map(([code, p]) => `<option value="${esc(code)}"${code === v.product ? " selected" : ""}>${esc(code)} - ${esc(p.label)}</option>`)
    .join("");
  const custOpts = Object.entries(rules.customer_types)
    .map(([code, c]) => `<option value="${esc(code)}"${code === v.customer_type ? " selected" : ""}>${esc(c.label)}</option>`)
    .join("");
  let res = `<div id="resultat" class="vide">Saisir les paramètres puis cliquer sur Calculer.</div>`;
  if (result?.error) res = `<div id="resultat" class="err">${esc(result.error)}</div>`;
  else if (result) res = `<div id="resultat">TOTAL HT : <span id="total">${money(result.total)}</span> EUR</div>`;

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Quotix 98 - Module Devis</title><style>${CSS}</style></head><body>
<div class="win" role="application" aria-label="Quotix 98">
  <div class="title"><span>Quotix 98 - [Devis N° 1998-${String(quoteCounter).padStart(4, "0")}]</span><span class="btns"><span>_</span><span>□</span><span>×</span></span></div>
  <div class="menu"><span><u>F</u>ichier</span><span><u>E</u>dition</span><span><u>D</u>evis</span><span><u>C</u>lients</span><span><u>O</u>utils</span><span><u>?</u></span></div>
  <div class="body">
    <div class="ref">Configurateur de devis industriel — Ateliers Morel SA</div>
    <form method="POST" action="/devis">
      <fieldset><legend>Article</legend>
        <div class="row"><label for="product">Code article :</label><select id="product" name="product">${productOpts}</select></div>
        <div class="row"><label for="quantity">Quantité :</label><input type="text" id="quantity" name="quantity" value="${esc(v.quantity)}" autocomplete="off"></div>
      </fieldset>
      <fieldset><legend>Client</legend>
        <div class="row"><label for="customer_type">Catégorie client :</label><select id="customer_type" name="customer_type">${custOpts}</select></div>
      </fieldset>
      <div class="actions"><button type="submit" id="calculer">Calculer</button><button type="reset">Effacer</button></div>
    </form>
    <fieldset><legend>Résultat</legend>${res}</fieldset>
  </div>
  <div class="status"><div>Prêt</div><div>MOREL.MDB</div><div>OPERATEUR</div><div>v3.1.4</div></div>
</div></body></html>`;
}

function adminPage(msg = "") {
  const t10 = rules.quantity_tiers.find((t) => t.min === 10);
  const t50 = rules.quantity_tiers.find((t) => t.min === 50);
  const field = (name, label, value) =>
    `<div class="row"><label for="${name}">${label}</label><input type="text" id="${name}" name="${name}" value="${esc(value)}"></div>`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Quotix 98 - Maintenance</title><style>${CSS}.row label{width:240px}</style></head><body>
<div class="win"><div class="title"><span>Maintenance — règles cachées (Blind Challenge)</span></div><div class="body">
${msg ? `<p><b>${esc(msg)}</b></p>` : ""}
<form method="POST" action="/apply">
<fieldset><legend>Remises volume</legend>${field("tier10", "Remise quantité ≥ 10 (%)", t10?.discount ?? 0)}${field("tier50", "Remise quantité ≥ 50 (%)", t50?.discount ?? 0)}</fieldset>
<fieldset><legend>Catégories client</legend>${Object.entries(rules.customer_types).map(([k, c]) => field(`cust_${k}`, `Remise ${c.label} (%)`, c.discount)).join("")}</fieldset>
<fieldset><legend>Prix unitaires</legend>${Object.entries(rules.products).map(([k, p]) => field(`price_${k}`, `Prix ${k} (EUR)`, p.price)).join("")}</fieldset>
<fieldset><legend>Livraison</legend>${field("ship_threshold", "Franco à partir de (EUR)", rules.shipping.threshold)}${field("ship_fee", "Frais sous le franco (EUR)", rules.shipping.fee)}</fieldset>
<div class="actions"><button type="submit">Appliquer</button><button type="submit" formaction="/reset">Réinitialiser</button></div>
</form></div></div></body></html>`;
}

/* ------------------------------------------------------------------ */
/* Serveur                                                              */
/* ------------------------------------------------------------------ */

function readForm(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (c) => {
      body += c;
      if (body.length > 1e5) req.destroy();
    });
    req.on("end", () => resolve(Object.fromEntries(new URLSearchParams(body))));
  });
}

function send(res, status, html) {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.end(html);
}

/* Application (port public) : aucune route d'administration ------------ */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  try {
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/devis")) {
      return send(res, 200, page({}));
    }
    if (req.method === "POST" && url.pathname === "/devis") {
      const form = await readForm(req);
      const result = computeQuote(form);
      if (!result.error) quoteCounter++;
      // Petite latence « mainframe »
      await new Promise((r) => setTimeout(r, 120));
      return send(res, 200, page({ values: form, result }));
    }
    send(res, 404, "Page introuvable");
  } catch (e) {
    console.error(e);
    send(res, 500, "ERREUR SYSTEME");
  }
});

/* Maintenance (127.0.0.1 uniquement, jeton requis) ------------------------ */
function adminAuthorized(req) {
  const m = /(?:^|;\s*)qx_admin=([^;]+)/.exec(req.headers.cookie ?? "");
  if (!m) return false;
  const a = Buffer.from(decodeURIComponent(m[1]));
  const b = Buffer.from(ADMIN_TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

const admin = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  try {
    // Ouverture de session : /?token=… → cookie HttpOnly, SameSite=Strict
    const t = url.searchParams.get("token");
    if (t !== null) {
      const ok = Buffer.from(t).length === Buffer.from(ADMIN_TOKEN).length && timingSafeEqual(Buffer.from(t), Buffer.from(ADMIN_TOKEN));
      if (!ok) return send(res, 403, "Accès refusé");
      res.writeHead(303, { location: "/", "set-cookie": `qx_admin=${encodeURIComponent(t)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=14400` });
      return res.end();
    }
    if (!adminAuthorized(req)) return send(res, 403, "Accès refusé");
    if (req.method === "GET" && url.pathname === "/") return send(res, 200, adminPage());
    if (req.method === "POST" && url.pathname === "/reset") {
      rules = structuredClone(DEFAULTS);
      console.log("[quotix] règles cachées réinitialisées");
      return send(res, 200, adminPage("Règles réinitialisées."));
    }
    if (req.method === "POST" && url.pathname === "/apply") {
      const f = await readForm(req);
      const num = (x, d) => (x !== undefined && x !== "" && !Number.isNaN(Number(x)) ? Number(x) : d);
      for (const t of rules.quantity_tiers) {
        if (t.min === 10) t.discount = num(f.tier10, t.discount);
        if (t.min === 50) t.discount = num(f.tier50, t.discount);
      }
      for (const [k, c] of Object.entries(rules.customer_types)) c.discount = num(f[`cust_${k}`], c.discount);
      for (const [k, p] of Object.entries(rules.products)) p.price = num(f[`price_${k}`], p.price);
      rules.shipping.threshold = num(f.ship_threshold, rules.shipping.threshold);
      rules.shipping.fee = num(f.ship_fee, rules.shipping.fee);
      console.log("[quotix] règles cachées modifiées depuis la console de maintenance");
      return send(res, 200, adminPage("Modification appliquée. Les agents n'en sont pas informés."));
    }
    send(res, 404, "Page introuvable");
  } catch (e) {
    console.error(e);
    send(res, 500, "ERREUR SYSTEME");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[quotix] Quotix 98 en écoute sur http://localhost:${PORT}`);
});
admin.listen(ADMIN_PORT, "127.0.0.1", () => {
  console.log(
    `[quotix] Console de maintenance (127.0.0.1:${ADMIN_PORT} uniquement, jeton requis) : ${process.env.LEGACY_ADMIN_TOKEN ? "npm run maintenance" : "désactivée (LEGACY_ADMIN_TOKEN non défini)"}`,
  );
});

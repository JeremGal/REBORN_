// Pile de test ISOLÉE, commune aux scripts d'acceptation et de navigateur (acceptance.mjs,
// e2e-parcours.mjs, e2e-browser.mjs, e2e-migration.mjs).
//
// - Studio construit dans un dossier dédié : REBORN_DIST_DIR=.next-<nom> (défaut .next-test), JAMAIS
//   .next (build du Studio en service). Reconstruit si une source est plus récente que le build
//   (REBORN_REBUILD=1 : toujours ; REBORN_NO_REBUILD=1 : jamais). next build réécrit tsconfig.json et
//   next-env.d.ts pour un dossier personnalisé : les deux fichiers sont restaurés à l'identique.
// - Studio, ancien logiciel de test (Relatio 2004) et logiciels livrés : dossier temporaire et ports
//   libres. Secrets de la pile (session des comptes, jetons des agents explorer et analyst) aléatoires,
//   en mémoire seulement, jamais affichés ni écrits sur le disque. Rien n'est lu ni écrit dans .secrets/,
//   platform/.data, platform/.keys ni generated/.
// - Comptes réels : inscription par l'API Better Auth (consentements aux versions courantes) ; rôle
//   opérateur donné par scripts/account.mjs sur la base temporaire, comme en production.
// - Fin : processus arrêtés (Studio, Relatio, logiciels livrés, Chrome), dossier temporaire supprimé
//   (REBORN_KEEP_TMP=1 pour le garder et lire les journaux).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PLATFORM = path.join(ROOT, "platform");
const NEXT_BIN = path.join(PLATFORM, "node_modules/next/dist/bin/next");

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Secret aléatoire (base64url), jamais affiché. */
export const secret = (bytes = 24) => randomBytes(bytes).toString("base64url");

/* ------------------------------------------------------------------ */
/* Vérifications                                                        */
/* ------------------------------------------------------------------ */

export function checker() {
  const results = [];
  const check = (name, ok, detail = "") => {
    results.push({ name, ok: !!ok });
    console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
    return !!ok;
  };
  const failed = () => results.filter((r) => !r.ok).length;
  return { check, results, failed };
}

/* ------------------------------------------------------------------ */
/* Ports et processus                                                   */
/* ------------------------------------------------------------------ */

const portFree = (port) =>
  new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(false));
    s.listen(port, "127.0.0.1", () => s.close(() => resolve(true)));
  });

const RESERVED = new Set([3000, 3100, 4000, 4001, 4100, 5050]);
const taken = new Set();
/** Port libre (jamais un port des serveurs en service), distinct des ports déjà distribués par ce processus. */
export async function freePort() {
  for (;;) {
    const p = await new Promise((resolve) => {
      const s = net.createServer().listen(0, "127.0.0.1", () => {
        const port = s.address().port;
        s.close(() => resolve(port));
      });
    });
    if (!RESERVED.has(p) && !taken.has(p)) {
      taken.add(p);
      return p;
    }
  }
}

/**
 * Port de base des logiciels livrés : le Studio attribue CRM_PORT, CRM_PORT + 1… (un par projet livré).
 * `count` ports consécutifs libres, hors ports réservés.
 */
export async function freePortRange(count) {
  for (let i = 0; i < 50; i++) {
    const base = 20000 + Math.floor(Math.random() * 30000);
    const range = Array.from({ length: count }, (_, k) => base + k);
    if (range.some((p) => RESERVED.has(p) || taken.has(p))) continue;
    if ((await Promise.all(range.map(portFree))).every(Boolean)) {
      range.forEach((p) => taken.add(p));
      return base;
    }
  }
  throw new Error("Aucune plage de ports libres");
}

/** Attend une réponse HTTP (statut < 500 par défaut). */
export async function up(url, ms = 30000, ok = (r) => r.status < 500) {
  for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(200)) {
    try {
      if (ok(await fetch(url, { signal: AbortSignal.timeout(1500) }))) return true;
    } catch {}
  }
  return false;
}

/** Attend que plus rien ne réponde. */
export async function down(url, ms = 10000) {
  for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(200)) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(500) });
    } catch {
      return true;
    }
  }
  return false;
}

export const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** Dossier courant d'un processus (vérifié avant de l'arrêter : un PID peut avoir été réattribué). */
function cwdOf(pid) {
  const out = spawnSync("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"], { encoding: "utf8" }).stdout ?? "";
  return out.split("\n").find((l) => l.startsWith("n"))?.slice(1) ?? "";
}
const real = (p) => {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
};

/** Signal à tout le groupe de processus (lancé avec detached: true). */
export function killGroup(proc, sig = "SIGTERM") {
  if (!proc?.pid) return;
  try {
    process.kill(-proc.pid, sig);
  } catch {
    try {
      process.kill(proc.pid, sig);
    } catch {}
  }
}

/* ------------------------------------------------------------------ */
/* Build isolé                                                          */
/* ------------------------------------------------------------------ */

/** Dossier de build de la pile de test : .next-<nom>, jamais .next (Studio en service). */
export function distDir() {
  const d = process.env.REBORN_DIST_DIR || ".next-test";
  if (!/^\.next-[a-z0-9][a-z0-9_-]{0,40}$/i.test(d)) {
    console.error(`REBORN_DIST_DIR=${d.slice(0, 60)} refusé : un dossier .next-<nom> est attendu (jamais .next, le build du Studio en service).`);
    process.exit(2);
  }
  return d;
}

function newestMtime(p) {
  let st;
  try {
    st = fs.statSync(p);
  } catch {
    return 0;
  }
  if (!st.isDirectory()) return st.mtimeMs;
  let m = 0;
  for (const e of fs.readdirSync(p)) if (e !== "node_modules" && !e.startsWith(".")) m = Math.max(m, newestMtime(path.join(p, e)));
  return m;
}

/** Construit le Studio dans `dist` s'il manque ou s'il est plus ancien que les sources. */
export function ensureBuild(dist = distDir()) {
  const id = path.join(PLATFORM, dist, "BUILD_ID");
  const built = fs.existsSync(id) ? fs.statSync(id).mtimeMs : 0;
  const sources = Math.max(...["src", "next.config.ts", "package.json", "postcss.config.mjs"].map((f) => newestMtime(path.join(PLATFORM, f))));
  const force = process.env.REBORN_REBUILD === "1";
  if (built && !force && (process.env.REBORN_NO_REBUILD === "1" || sources <= built)) return;
  console.log(`Construction du Studio dans platform/${dist} (${built ? "sources modifiées depuis le dernier build" : "premier build"})…`);
  // next build réécrit ces deux fichiers pour un distDir personnalisé : ils sont restaurés à l'identique.
  const keep = ["tsconfig.json", "next-env.d.ts"].map((f) => {
    const file = path.join(PLATFORM, f);
    return [file, fs.existsSync(file) ? fs.readFileSync(file) : null];
  });
  let status;
  try {
    status = spawnSync(process.execPath, [NEXT_BIN, "build"], { cwd: PLATFORM, stdio: "inherit", env: { ...process.env, REBORN_DIST_DIR: dist, NEXT_TELEMETRY_DISABLED: "1" } }).status;
  } finally {
    for (const [file, buf] of keep) {
      if (buf === null) continue;
      try {
        if (!fs.readFileSync(file).equals(buf)) fs.writeFileSync(file, buf);
      } catch {
        fs.writeFileSync(file, buf);
      }
    }
  }
  if (status) {
    console.error("Le build du Studio a échoué : aucun test lancé.");
    process.exit(1);
  }
}

/* ------------------------------------------------------------------ */
/* Pile                                                                 */
/* ------------------------------------------------------------------ */

/**
 * Crée le dossier temporaire de la pile et renvoie l'objet qui démarre et arrête ses processus.
 * Tout ce que la pile lance est arrêté par stop() ; le dossier est supprimé par cleanup().
 */
export function createStack(name) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `reborn-${name}-`));
  const procs = [];
  const logFile = (n) => fs.openSync(path.join(tmp, `${n}.log`), "a");
  const stack = {
    tmp,
    dataDir: path.join(tmp, "studio"),
    appsDir: path.join(tmp, "apps"),
    keysDir: path.join(tmp, "keys"),
    /** Jetons de service de cette pile (aléatoires) : jamais affichés. */
    tokens: { explorer: secret(), analyst: secret() },
    authSecret: secret(32),
    studio: null,
    relatio: null,

    /** Studio de production (next start) sur un port libre, données et logiciels livrés dans le dossier temporaire. */
    async startStudio({ dist = distDir(), crmBase, egress = [], env: extra = {} } = {}) {
      const port = await freePort();
      const crmPort = crmBase ?? (await freePortRange(3));
      const env = {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        NODE_ENV: "production",
        NEXT_TELEMETRY_DISABLED: "1",
        REBORN_DIST_DIR: dist,
        REBORN_DATA_DIR: this.dataDir,
        REBORN_APPS_DIR: this.appsDir,
        REBORN_KEYS_DIR: this.keysDir,
        CRM_PORT: String(crmPort),
        REBORN_AUTH_SECRET: this.authSecret,
        REBORN_EXPLORER_TOKEN: this.tokens.explorer,
        REBORN_ANALYST_TOKEN: this.tokens.analyst,
        // Garde SSRF (egress.ts) : seules les sorties vers l'ancien logiciel de test de CETTE pile sont permises.
        ...(egress.length ? { REBORN_EGRESS_ALLOW: egress.join(",") } : {}),
        ...extra,
      };
      const log = logFile("studio");
      // Groupe de processus propre : process.kill(-pid, "SIGINT") reproduit un Ctrl+C dans le terminal du Studio
      const proc = spawn(process.execPath, [NEXT_BIN, "start", "-p", String(port), "-H", "127.0.0.1"], { cwd: PLATFORM, env, detached: true, stdio: ["ignore", log, log] });
      procs.push(proc);
      this.studio = { proc, port, url: `http://127.0.0.1:${port}`, crmPort, env };
      return this.studio;
    },

    /** Relatio 2004 (ancien CRM de test, vraie base SQLite générée) sur un port libre. */
    async startRelatio(port) {
      port ??= await freePort();
      const log = logFile("relatio");
      const proc = spawn(process.execPath, ["--no-warnings", path.join(ROOT, "legacy-crm/server.mjs")], {
        env: { PATH: process.env.PATH ?? "", LEGACY_CRM_PORT: String(port), LEGACY_CRM_HOST: "127.0.0.1", LEGACY_CRM_DATA: path.join(tmp, "relatio") },
        detached: true,
        stdio: ["ignore", log, log],
      });
      procs.push(proc);
      this.relatio = { proc, port, url: `http://127.0.0.1:${port}` };
      return this.relatio;
    },

    /** Mot de passe du compte « migration » du Relatio de CETTE pile (jamais affiché). */
    relatioPassword() {
      return JSON.parse(fs.readFileSync(path.join(tmp, "relatio", ".credentials.json"), "utf8")).migration.password;
    },

    /** Logiciels livrés par le Studio de la pile : { id, pid } (fichiers run/server.pid). */
    deliveredApps() {
      if (!fs.existsSync(this.appsDir)) return [];
      return fs
        .readdirSync(this.appsDir)
        .map((id) => {
          try {
            return { id, pid: JSON.parse(fs.readFileSync(path.join(this.appsDir, id, "run", "server.pid"), "utf8")).pid };
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    },

    /** Processus lancé à part (CRM redémarré seul, Chrome…) : arrêté avec la pile. */
    track(proc) {
      procs.push(proc);
      return proc;
    },

    /** Arrête tout ce que la pile a lancé, y compris les logiciels livrés (détachés par le Studio). */
    async stop() {
      const apps = real(this.appsDir);
      for (const a of this.deliveredApps()) {
        if (a.pid && alive(a.pid) && real(cwdOf(a.pid)).startsWith(apps)) {
          try {
            process.kill(a.pid, "SIGTERM");
          } catch {}
        }
      }
      for (const p of procs) killGroup(p, "SIGTERM");
      await sleep(600);
      for (const p of procs) if (p.exitCode === null && p.signalCode === null) killGroup(p, "SIGKILL");
    },

    /** Supprime le dossier temporaire (comptes de test, données de test, journaux). */
    cleanup() {
      if (process.env.REBORN_KEEP_TMP === "1") {
        console.log(`Dossier de test conservé (REBORN_KEEP_TMP=1) : ${tmp}`);
        return;
      }
      for (let i = 0; i < 5; i++) {
        try {
          fs.rmSync(tmp, { recursive: true, force: true });
          return;
        } catch {
          spawnSync("sleep", ["0.5"]);
        }
      }
      console.log(`Dossier de test non supprimé (fichiers encore ouverts) : ${tmp}`);
    },

    /** Lignes de fin d'un journal de la pile (diagnostic d'un échec). */
    tail(n, lines = 30) {
      try {
        return fs.readFileSync(path.join(tmp, `${n}.log`), "utf8").split("\n").slice(-lines).join("\n");
      } catch {
        return "";
      }
    },
  };
  return stack;
}

/* ------------------------------------------------------------------ */
/* Appels HTTP                                                          */
/* ------------------------------------------------------------------ */

/**
 * Client HTTP du Studio. Chaque réponse est conservée (journal) pour le balayage final des secrets.
 * as : { cookie } (navigateur connecté : Origin du Studio ajoutée) · { bearer, executor? } (agent :
 * aucune Origin) · {} (anonyme).
 */
export function studioClient(base, journal = []) {
  const call = async (as, method, p, body, extraHeaders = {}) => {
    const headers = { ...(body !== undefined ? { "content-type": "application/json" } : {}) };
    if (as.cookie) Object.assign(headers, { cookie: as.cookie, origin: base });
    if (as.bearer) headers.authorization = `Bearer ${as.bearer}`;
    if (as.executor) headers["x-reborn-executor"] = as.executor;
    if (as.origin === false) delete headers.origin;
    Object.assign(headers, extraHeaders);
    for (const [k, v] of Object.entries(headers)) if (v === null) delete headers[k];
    const r = await fetch(base + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
    const text = await r.text();
    journal.push({ path: p, status: r.status, text });
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    return { status: r.status, body: json, headers: r.headers };
  };
  return { call, journal };
}

/** Cookie de session à partir des Set-Cookie d'une réponse (cookies effacés ignorés). */
export const cookieFrom = (res) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .filter((pair) => !pair.endsWith("="))
    .join("; ");

/** Versions courantes des textes juridiques (lues dans platform/src/lib/legal.ts, la source du Studio). */
export function legalVersions() {
  const src = fs.readFileSync(path.join(PLATFORM, "src/lib/legal.ts"), "utf8");
  const v = (id) => new RegExp(`${id}:\\s*\\{[^}]*version:\\s*"([^"]+)"`).exec(src)?.[1];
  const auth = /AUTHORIZATION_DECLARATION\s*=\s*Object\.freeze\(\{[^}]*version:\s*"([^"]+)"/.exec(src)?.[1];
  const out = { terms: v("conditions"), privacy: v("confidentialite"), credentials: v("identifiants"), authorization: auth };
  if (Object.values(out).some((x) => !x)) throw new Error("Versions des textes juridiques introuvables dans platform/src/lib/legal.ts");
  return out;
}

let accountSeq = 0;
/**
 * Inscription RÉELLE par l'API Better Auth (POST /api/auth/sign-up/email, consentements aux versions
 * courantes). Mot de passe aléatoire, jamais affiché. Renvoie { email, password, cookie, userId }.
 */
export async function signUp(base, who = {}) {
  accountSeq++;
  const v = legalVersions();
  const u = {
    firstName: who.firstName ?? `Prénom${accountSeq}`,
    lastName: who.lastName ?? `Nom${accountSeq}`,
    company: who.company ?? `Entreprise de test ${accountSeq}`,
    email: (who.email ?? `test${accountSeq}.${secret(4).toLowerCase().replace(/[^a-z0-9]/g, "x")}@exemple.test`).toLowerCase(),
    password: who.password ?? `Test-${secret(12)}`,
  };
  const r = await fetch(`${base}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ ...u, termsVersion: v.terms, privacyVersion: v.privacy }),
  });
  const body = await r.json().catch(() => ({}));
  if (r.status !== 200 || !body.user) throw new Error(`Inscription refusée (${r.status}) : ${body.code ?? ""} ${body.message ?? ""}`.trim());
  return { ...u, userId: body.user.id, cookie: cookieFrom(r) };
}

/** Connexion réelle : { status, cookie }. */
export async function signIn(base, email, password) {
  const r = await fetch(`${base}/api/auth/sign-in/email`, { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ email, password }) });
  await r.text();
  return { status: r.status, cookie: cookieFrom(r) };
}

/**
 * Rôle opérateur donné comme en production : `npm run account -- operator <email>` (scripts/account.mjs)
 * sur la base de comptes TEMPORAIRE de la pile (REBORN_DATA_DIR). Renvoie { ok, out }.
 */
export function makeOperator(stack, email) {
  const r = spawnSync(process.execPath, ["--no-warnings", path.join(ROOT, "scripts/account.mjs"), "operator", email], {
    env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", REBORN_DATA_DIR: stack.dataDir, REBORN_URL: stack.studio?.url ?? "" },
    encoding: "utf8",
  });
  return { ok: r.status === 0, out: `${r.stdout}${r.stderr}`.trim() };
}

/** Fichiers (récursivement) qui contiennent l'une des valeurs : [{ file, index }]. Aucune valeur affichée. */
export function filesContaining(dir, values, skip = () => false) {
  const needles = values.filter(Boolean).map((v) => Buffer.from(String(v)));
  const hits = [];
  const walk = (d) => {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const f = path.join(d, e.name);
      if (skip(f)) continue;
      if (e.isDirectory()) walk(f);
      else if (e.isFile()) {
        let buf;
        try {
          buf = fs.readFileSync(f);
        } catch {
          continue;
        }
        needles.forEach((n, i) => {
          if (buf.includes(n)) hits.push({ file: path.relative(dir, f), index: i });
        });
      }
    }
  };
  walk(dir);
  return hits;
}

/**
 * Validation JSON Schema, sous-ensemble utilisé par contracts/*.schema.json (type, required, properties,
 * additionalProperties, anyOf, const, enum, items, pattern, minItems, minimum, maximum, exclusiveMinimum).
 * Renvoie la liste des écarts (vide : conforme).
 */
export function schemaProblems(schema, value, at = "$") {
  if (schema === true || schema === undefined || schema === null) return [];
  if (schema === false) return [`${at} : non prévu`];
  const kind = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);
  const isType = (t, v) => (t === "integer" ? Number.isInteger(v) : t === "number" ? typeof v === "number" : kind(v) === t);
  const out = [];
  if (schema.anyOf && !schema.anyOf.some((s) => schemaProblems(s, value, at).length === 0)) out.push(`${at} : aucune forme autorisée`);
  if (schema.type) {
    const types = [].concat(schema.type);
    if (!types.some((t) => isType(t, value))) return [...out, `${at} : ${kind(value)} au lieu de ${types.join("|")}`];
  }
  if ("const" in schema && JSON.stringify(schema.const) !== JSON.stringify(value)) out.push(`${at} : ${JSON.stringify(schema.const)} attendu`);
  if (schema.enum && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) out.push(`${at} : valeur hors liste`);
  if (typeof value === "string" && schema.pattern) {
    let re = null;
    try {
      re = new RegExp(schema.pattern);
    } catch {}
    if (re && !re.test(value)) out.push(`${at} : format invalide`);
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) out.push(`${at} : < ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) out.push(`${at} : > ${schema.maximum}`);
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) out.push(`${at} : ≤ ${schema.exclusiveMinimum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) out.push(`${at} : moins de ${schema.minItems} élément(s)`);
    if (schema.items) value.forEach((v, i) => out.push(...schemaProblems(schema.items, v, `${at}[${i}]`)));
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const k of schema.required ?? []) if (!(k in value)) out.push(`${at}.${k} : requis`);
    for (const [k, v] of Object.entries(value)) {
      if (schema.properties && k in schema.properties) out.push(...schemaProblems(schema.properties[k], v, `${at}.${k}`));
      else if (schema.additionalProperties === false) out.push(`${at}.${k} : non prévu`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === "object") out.push(...schemaProblems(schema.additionalProperties, v, `${at}.${k}`));
    }
  }
  return out;
}

/** Schéma publié dans contracts/ (généré depuis la validation réelle du Studio). */
export const contractSchema = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, "contracts", `${name}.schema.json`), "utf8"));

/**
 * Connexion RÉELLE au logiciel de test Relatio 2004 (formulaire /login, cookie de session, page
 * authentifiée constatée, déconnexion). Utilisée par la doublure d'exécuteur des tests : jamais de
 * « connecté » sans page authentifiée vue.
 */
export async function relatioLogin(base, username, password) {
  const r = await fetch(`${base}/login`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ utilisateur: username, motdepasse: password }), redirect: "manual" });
  await r.text();
  const sid = r.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .find((c) => c.startsWith("RELATIOSESSID=") && !c.endsWith("="));
  if (!sid) return false;
  const page = await (await fetch(`${base}/`, { headers: { cookie: sid }, redirect: "manual" })).text();
  const ok = page.includes("Déconnexion") && page.includes("Utilisateur :");
  await fetch(`${base}/logout`, { headers: { cookie: sid }, redirect: "manual" })
    .then((x) => x.text())
    .catch(() => {});
  return ok;
}

/* ------------------------------------------------------------------ */
/* Chrome headless piloté par le protocole DevTools (sans dépendance)   */
/* ------------------------------------------------------------------ */

export const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/**
 * Dossier des captures : SHOTS_DIR, sinon <dossier temporaire du système>/reborn-captures/<nom>.
 * Jamais dans le dépôt.
 */
export function shotsDir(name) {
  const dir = path.resolve(process.env.SHOTS_DIR ?? path.join(os.tmpdir(), "reborn-captures", name));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Lance Chrome headless avec un profil dans le dossier de la pile (supprimé avec elle) et renvoie les
 * outils de pilotage. `base` : adresse par défaut des chemins relatifs de goto().
 */
export async function launchChrome(stack, { base, shotsDir, onDialog = "Test" } = {}) {
  const port = await freePort();
  const profile = fs.mkdtempSync(path.join(stack.tmp, "chrome-"));
  const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--disable-extensions", "about:blank"], { stdio: "ignore", detached: true });
  stack.track(chrome);
  let ws;
  let seq = 0;
  const pending = new Map();
  const exceptions = [];
  const consoleErrors = [];
  /** Violations de la politique de sécurité du contenu (CSP) et autres avertissements de sécurité du navigateur. */
  const securityIssues = [];
  const send = (method, params = {}) =>
    new Promise((res) => {
      const id = ++seq;
      pending.set(id, res);
      ws.send(JSON.stringify({ id, method, params }));
    });
  for (let i = 0; i < 100 && !ws; i++) {
    try {
      const page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page");
      if (page) {
        const sock = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((res, rej) => ((sock.onopen = res), (sock.onerror = rej)));
        sock.onmessage = (m) => {
          const msg = JSON.parse(m.data);
          if (msg.id && pending.has(msg.id)) {
            pending.get(msg.id)(msg);
            pending.delete(msg.id);
          } else if (msg.method === "Page.javascriptDialogOpening") send("Page.handleJavaScriptDialog", { accept: true, promptText: onDialog });
          else if (msg.method === "Runtime.exceptionThrown") exceptions.push(msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text);
          else if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") consoleErrors.push(msg.params.args?.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 300));
          else if (msg.method === "Log.entryAdded" && (msg.params.entry?.source === "security" || /Content Security Policy/i.test(msg.params.entry?.text ?? ""))) securityIssues.push(`${msg.params.entry.text ?? ""} (${msg.params.entry.url ?? ""})`.slice(0, 300));
        };
        ws = sock;
      }
    } catch {}
    if (!ws) await sleep(200);
  }
  if (!ws) throw new Error("Chrome injoignable");
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Log.enable");

  let lastEvalError = null;
  const evaluate = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.error || r.result?.exceptionDetails) lastEvalError = JSON.stringify(r.error ?? r.result.exceptionDetails).slice(0, 300);
    return r.result?.result?.value;
  };
  /** Attend que `pred` (expression, éventuellement asynchrone) soit vrai ; une promesse en attente n'est jamais prise pour « vrai ». */
  const waitFor = async (pred, timeout = 20000) => {
    for (const t0 = Date.now(); Date.now() - t0 < timeout; await sleep(150)) if (await evaluate(`(async () => { try { return !!(await (${pred})); } catch { return false } })()`)) return true;
    return false;
  };
  const norm = (s) => JSON.stringify(s.replace(/\s+/g, " "));
  // textContent (et non innerText) : insensible au text-transform CSS
  const hasText = (s, timeout) => waitFor(`document.body && document.body.textContent.replace(/\\s+/g, " ").includes(${norm(s)})`, timeout);
  const goto = async (url, viewport = { width: 1440, height: 1000, mobile: false }) => {
    await send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.mobile });
    await send("Page.navigate", { url: url.startsWith("http") ? url : base + url });
    await waitFor("document.readyState === 'complete'");
    await sleep(400);
  };
  /** Clique le premier élément visible et actif dont le texte contient `txt`. */
  const click = (txt, tags = "button, a, label, [role=radio], [role=tab]") =>
    evaluate(`(() => {
      const t = ${norm(txt)};
      const el = [...document.querySelectorAll(${JSON.stringify(tags)})].find((x) => x.textContent.replace(/\\s+/g, " ").includes(t) && !x.disabled && x.getAttribute("aria-disabled") !== "true" && x.offsetParent !== null);
      if (!el) return false; el.scrollIntoView({ block: "center" }); el.click(); return true; })()`);
  const clickWhen = async (txt, timeout = 20000, tags) => {
    for (const t0 = Date.now(); Date.now() - t0 < timeout; await sleep(200)) if (await click(txt, tags)) return true;
    return false;
  };
  /** Saisie compatible React : setter natif + évènements input/change (cases à cocher : clic réel). */
  const fill = (selector, value) =>
    evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false;
      if (el.type === "checkbox" || el.type === "radio") { if (el.checked !== ${JSON.stringify(!!value)}) el.click(); return true; }
      const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
  const shot = async (name) => {
    if (!shotsDir) return;
    const r = await send("Page.captureScreenshot", { format: "png" });
    if (r.result?.data) fs.writeFileSync(path.join(shotsDir, `${name}.png`), Buffer.from(r.result.data, "base64"));
  };
  // Débordement horizontal : largeur du contenu moins largeur VISIBLE du document (clientWidth). En émulation
  // mobile, window.innerWidth grandit avec le contenu qui déborde : scrollWidth − innerWidth vaudrait 0.
  const overflow = () => evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth");
  /** Change la taille de l'écran émulé SANS recharger la page (état affiché conservé). */
  const resize = (viewport = { width: 1440, height: 1000, mobile: false }) => send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.mobile });
  const close = async () => {
    try {
      ws.close();
    } catch {}
    killGroup(chrome, "SIGTERM");
    // Chrome écrit encore dans son profil pendant l'arrêt : on attend sa sortie avant de le supprimer
    await new Promise((r) => {
      if (chrome.exitCode !== null || chrome.signalCode !== null) return r();
      chrome.once("exit", r);
      setTimeout(r, 4000);
    });
    try {
      fs.rmSync(profile, { recursive: true, force: true });
    } catch {}
  };
  return { send, evaluate, waitFor, hasText, goto, click, clickWhen, fill, shot, overflow, resize, close, exceptions, consoleErrors, securityIssues, lastError: () => lastEvalError };
}

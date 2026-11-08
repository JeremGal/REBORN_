import http from "node:http";
import https from "node:https";
import net from "node:net";
import dns from "node:dns";

/**
 * Sorties réseau du Studio vers les anciens logiciels des clients (SPEC §7, cartographie r3.md §3).
 * Aucune dépendance : node:http / node:https.
 *
 * - Adresse : http(s) uniquement, sans identifiants dans l'URL (`user:motdepasse@` refusé), hôte non vide.
 * - IP littérales contrôlées avant toute connexion (Node n'appelle pas `lookup` pour une IP).
 * - Noms : `lookup` contrôle CHAQUE adresse résolue, au moment même de la connexion (pas de
 *   contrôle-puis-usage : un nom qui change d'adresse entre-temps — rebinding DNS — est recontrôlé).
 * - Plages refusées : bouclage, réseaux privés, lien local (dont 169.254.169.254, métadonnées des
 *   hébergeurs), CGNAT, plages réservées ou de documentation, multicast ; IPv6 : bouclage,
 *   non spécifiée, IPv4 mappées ou compatibles, NAT64, 6to4, Teredo, ULA, lien local, multicast.
 * - Redirections JAMAIS suivies (la réponse 3xx est rendue telle quelle à l'appelant).
 * - Délai global, taille maximale lue en flux (abandon dès le dépassement).
 * - `agent: false` : aucun mandataire (proxy) d'environnement n'est utilisé, le contrôle porte
 *   toujours sur la vraie cible (piège NODE_USE_ENV_PROXY + HTTP_PROXY).
 * - Liste blanche : REBORN_EGRESS_ALLOW = « hôte:port » séparés par des virgules (ex.
 *   127.0.0.1:4100,[::1]:4100), posée par scripts/dev.mjs pour les logiciels de test locaux.
 *   Les ports 3000 (Studio), 4001 (console de maintenance) et 5050 (logiciel livré) ne sont JAMAIS
 *   acceptés, même inscrits. Tests : liste blanche et résolveur injectés (setEgressOverrides).
 *
 * Messages d'erreur : jamais l'URL complète, jamais une adresse résolue (aucune information sur le
 * réseau interne n'est renvoyée au client).
 */

export type EgressErrorCode = "url" | "credentials_in_url" | "protocol" | "blocked" | "dns" | "timeout" | "too_large" | "network";

export class EgressError extends Error {
  constructor(
    public code: EgressErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "EgressError";
  }
}

/* ------------------------------------------------------------------ */
/* Plages refusées                                                      */
/* ------------------------------------------------------------------ */

const V4: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];
const V6: [string, number][] = [
  ["::", 96], // non spécifiée, bouclage ::1, IPv4 compatibles
  ["::ffff:0:0", 96], // IPv4 mappées (toutes refusées : aucune cible légitime ne s'écrit ainsi)
  ["64:ff9b::", 96], // NAT64
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23], // affectations IETF (dont Teredo 2001::/32)
  ["2001:db8::", 32],
  ["2002::", 16], // 6to4 (peut encapsuler une IPv4 privée)
  ["fc00::", 7], // ULA
  ["fe80::", 10], // lien local
  ["fec0::", 10],
  ["ff00::", 8], // multicast
];

// Deux listes distinctes : une règle IPv6 (::/96, ::ffff:0:0/96) correspondrait aussi à TOUTE adresse
// IPv4 vérifiée dans la même liste (comportement de net.BlockList, vérifié sous Node 25).
const DENY_V4 = new net.BlockList();
for (const [a, p] of V4) DENY_V4.addSubnet(a, p, "ipv4");
const DENY_V6 = new net.BlockList();
for (const [a, p] of V6) DENY_V6.addSubnet(a, p, "ipv6");

/** Adresse IP interne, réservée ou non routable sur Internet ? (IP invalide : refusée par prudence). */
export function isDeniedAddress(ip: string): boolean {
  const bare = stripBrackets(ip);
  if (net.isIPv4(bare)) return DENY_V4.check(bare, "ipv4");
  if (net.isIPv6(bare)) return DENY_V6.check(bare, "ipv6");
  return true;
}

const stripBrackets = (h: string) => (h.startsWith("[") && h.endsWith("]") ? h.slice(1, -1) : h);

/* ------------------------------------------------------------------ */
/* Liste blanche et résolveur                                           */
/* ------------------------------------------------------------------ */

/** Ports jamais accessibles, même inscrits dans la liste blanche (Studio, console de maintenance, logiciel livré). */
export const NEVER_ALLOWED_PORTS: ReadonlySet<number> = new Set([3000, 4001, 5050]);

export type Resolver = (hostname: string) => Promise<{ address: string; family: number }[]>;

interface Overrides {
  allow?: string[];
  resolve?: Resolver;
}
const g = globalThis as unknown as { __rebornEgress?: Overrides; __rebornEgressWarned?: Set<string> };

/** Tests : liste blanche et/ou résolveur DNS injectés. Renvoie la fonction de restauration. */
export function setEgressOverrides(o: Overrides): () => void {
  const prev = g.__rebornEgress;
  g.__rebornEgress = { ...prev, ...o };
  return () => {
    g.__rebornEgress = prev;
  };
}

const defaultResolver: Resolver = (hostname) =>
  new Promise((resolve, reject) => dns.lookup(hostname, { all: true, verbatim: true }, (err, list) => (err ? reject(err) : resolve(list))));

/** « hôte:port » normalisé (IPv6 entre crochets, minuscules), ou null si l'entrée est invalide. */
export function normalizeHostPort(entry: string): string | null {
  const e = entry.trim();
  if (!e) return null;
  try {
    const u = new URL(`http://${e}`);
    if (u.username || u.password || (u.pathname !== "/" && u.pathname !== "") || u.search || !u.port) return null;
    return `${u.hostname.toLowerCase()}:${u.port}`;
  } catch {
    return null;
  }
}

const keyOf = (host: string, port: number) => {
  const h = stripBrackets(host).toLowerCase();
  return `${net.isIPv6(h) ? new URL(`http://[${h}]/`).hostname : h}:${port}`;
};

/** Entrée de liste blanche acceptée ? (jamais pour un port interdit, même injecté.) */
const allowed = (allow: ReadonlySet<string>, host: string, port: number) => !NEVER_ALLOWED_PORTS.has(port) && allow.has(keyOf(host, port));

function warnOnce(key: string, message: string) {
  const w = (g.__rebornEgressWarned ??= new Set());
  if (w.has(key)) return;
  w.add(key);
  console.warn(`[reborn] sorties réseau : ${message}`);
}

/** Liste blanche effective : entrées injectées (tests) sinon REBORN_EGRESS_ALLOW ; ports interdits retirés. */
export function egressAllowList(): ReadonlySet<string> {
  const raw = g.__rebornEgress?.allow ?? (process.env.REBORN_EGRESS_ALLOW ?? "").split(",");
  const out = new Set<string>();
  const studioPort = Number(process.env.PORT);
  for (const entry of raw) {
    const k = normalizeHostPort(entry);
    if (!k) {
      if (entry.trim()) warnOnce(`invalid:${entry}`, "entrée de REBORN_EGRESS_ALLOW ignorée (format attendu : hôte:port)");
      continue;
    }
    const port = Number(k.slice(k.lastIndexOf(":") + 1));
    if (NEVER_ALLOWED_PORTS.has(port) || port === studioPort) {
      warnOnce(`never:${k}`, `entrée ${k} de REBORN_EGRESS_ALLOW ignorée : ce port n'est jamais accessible au connecteur`);
      continue;
    }
    out.add(k);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Contrôle de la cible                                                 */
/* ------------------------------------------------------------------ */

export interface EgressTarget {
  url: URL;
  /** Nom ou IP, sans crochets. */
  host: string;
  port: number;
  /** Hôte littéral (IP) ? */
  literal: boolean;
}

const BLOCKED = () => new EgressError("blocked", "Adresse refusée : le connecteur de REBORN ne contacte que des logiciels joignables sur Internet (adresse interne, locale ou réservée)");

/** Forme de l'adresse (http(s), sans identifiants, hôte non vide) et IP littérale ; sans aucune résolution DNS. */
export function checkEgressTarget(target: string | URL, allow: ReadonlySet<string> = egressAllowList()): EgressTarget {
  let url: URL;
  try {
    url = target instanceof URL ? new URL(target.href) : new URL(String(target));
  } catch {
    throw new EgressError("url", "Adresse du logiciel invalide");
  }
  if (url.username || url.password) throw new EgressError("credentials_in_url", "Adresse refusée : elle contient un identifiant ou un mot de passe. Indiquez l'adresse seule ; les identifiants se confient à part, chiffrés.");
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new EgressError("protocol", "Adresse refusée : seules les adresses http et https sont acceptées");
  const host = stripBrackets(url.hostname);
  if (!host) throw new EgressError("url", "Adresse du logiciel invalide : hôte manquant");
  const port = Number(url.port || (url.protocol === "https:" ? 443 : 80));
  const literal = net.isIP(host) !== 0;
  if (literal && isDeniedAddress(host) && !allowed(allow, host, port)) throw BLOCKED();
  return { url, host, port, literal };
}

/** `lookup` de node:net qui refuse toute résolution contenant une adresse interne (hors liste blanche). */
function guardedLookup(port: number, allow: ReadonlySet<string>, hostKeyAllowed: boolean): net.LookupFunction {
  const resolve = g.__rebornEgress?.resolve ?? defaultResolver;
  return ((hostname: string, options: dns.LookupOptions, callback: (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void) => {
    resolve(hostname).then(
      (list) => {
        if (!list.length) return callback(new EgressError("dns", "Nom de l'ancien logiciel introuvable (aucune adresse)") as NodeJS.ErrnoException, "", 0);
        // Une seule adresse interne suffit à refuser toute la résolution (pas de choix « au hasard »).
        const bad = list.some((a) => isDeniedAddress(a.address) && !hostKeyAllowed && !allowed(allow, a.address, port));
        if (bad) return callback(BLOCKED() as NodeJS.ErrnoException, "", 0);
        const wanted = options?.family === 4 || options?.family === 6 ? list.filter((a) => a.family === options.family) : list;
        const usable = wanted.length ? wanted : list;
        if (options?.all) callback(null, usable);
        else callback(null, usable[0].address, usable[0].family);
      },
      (err: NodeJS.ErrnoException) => callback(err, "", 0),
    );
  }) as net.LookupFunction;
}

/* ------------------------------------------------------------------ */
/* Requête                                                              */
/* ------------------------------------------------------------------ */

export interface EgressRequest {
  method?: "GET" | "POST" | "HEAD";
  headers?: Record<string, string>;
  body?: string | Buffer;
  /** Délai global (connexion + réponse complète). Défaut 30 s. */
  timeoutMs?: number;
  /** Taille maximale du corps d'une réponse 2xx (lu en flux). Défaut 200 Mo. */
  maxBytes?: number;
  /** Taille lue au plus pour une réponse non 2xx (refus, redirection) ; le reste est ignoré. Défaut 64 Ko. */
  maxErrorBytes?: number;
  /** Liste blanche explicite (sinon egressAllowList()). */
  allow?: ReadonlySet<string>;
}

export interface EgressResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  /** En-têtes Set-Cookie bruts. */
  setCookies: string[];
  body: Buffer;
  /** Corps tronqué (réponse non 2xx plus longue que maxErrorBytes). */
  truncated: boolean;
}

/** Message lisible (sans URL ni adresse) pour une erreur réseau de bas niveau. */
export function egressErrorMessage(e: unknown): string {
  if (e instanceof EgressError) return e.message;
  const code = (e as NodeJS.ErrnoException | undefined)?.code;
  switch (code) {
    case "ECONNREFUSED":
      return "Connexion refusée par l'ancien logiciel (aucun service à cette adresse)";
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return "Nom de l'ancien logiciel introuvable";
    case "ECONNRESET":
    case "EPIPE":
      return "Connexion interrompue par l'ancien logiciel";
    case "ETIMEDOUT":
      return "Délai de connexion dépassé";
    case "EHOSTUNREACH":
    case "ENETUNREACH":
      return "Ancien logiciel injoignable depuis REBORN";
    case "CERT_HAS_EXPIRED":
    case "DEPTH_ZERO_SELF_SIGNED_CERT":
    case "SELF_SIGNED_CERT_IN_CHAIN":
    case "UNABLE_TO_VERIFY_LEAF_SIGNATURE":
    case "ERR_TLS_CERT_ALTNAME_INVALID":
      return "Certificat HTTPS de l'ancien logiciel refusé";
    default:
      return "Échec de la connexion à l'ancien logiciel";
  }
}

/**
 * Requête HTTP(S) contrôlée. Ne suit jamais une redirection. Lève une EgressError (adresse refusée,
 * délai, taille) ; les erreurs réseau de bas niveau sont converties par egressErrorMessage().
 */
export function egressRequest(target: string | URL, opts: EgressRequest = {}): Promise<EgressResponse> {
  const allow = opts.allow ?? egressAllowList();
  const t = checkEgressTarget(target, allow);
  const hostKeyAllowed = !t.literal && allowed(allow, t.host, t.port);
  const mod = t.url.protocol === "https:" ? https : http;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const maxBytes = opts.maxBytes ?? 200 * 1024 * 1024;
  const maxErrorBytes = opts.maxErrorBytes ?? 64 * 1024;
  const body = opts.body === undefined ? undefined : Buffer.isBuffer(opts.body) ? opts.body : Buffer.from(opts.body, "utf8");
  const headers: Record<string, string> = { "user-agent": "REBORN-Studio-connecteur/1.1", ...opts.headers };
  if (body) headers["content-length"] = String(body.length);

  return new Promise<EgressResponse>((resolve, reject) => {
    let settled = false;
    const done = (err: Error | null, value?: EgressResponse) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err instanceof EgressError ? err : new EgressError(isTimeout(err) ? "timeout" : "network", egressErrorMessage(err)));
      else resolve(value!);
    };
    const req = mod.request(
      t.url,
      {
        method: opts.method ?? (body ? "POST" : "GET"),
        headers,
        agent: false,
        lookup: t.literal ? undefined : guardedLookup(t.port, allow, hostKeyAllowed),
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const ok = status >= 200 && status < 300;
        const limit = ok ? maxBytes : maxErrorBytes;
        const chunks: Buffer[] = [];
        let size = 0;
        let truncated = false;
        res.on("data", (c: Buffer) => {
          if (truncated) return;
          if (size + c.length > limit) {
            if (ok) {
              res.destroy();
              return done(new EgressError("too_large", `Réponse trop volumineuse (${Math.round(maxBytes / 1024 / 1024)} Mo au maximum)`));
            }
            chunks.push(c.subarray(0, limit - size));
            size = limit;
            truncated = true;
            res.destroy();
            return done(null, { status, headers: res.headers, setCookies: setCookiesOf(res.headers), body: Buffer.concat(chunks), truncated });
          }
          size += c.length;
          chunks.push(c);
        });
        res.on("end", () => done(null, { status, headers: res.headers, setCookies: setCookiesOf(res.headers), body: Buffer.concat(chunks), truncated }));
        res.on("error", (e) => done(e));
        res.on("close", () => {
          if (!res.complete) done(new EgressError("network", "Connexion interrompue par l'ancien logiciel"));
        });
      },
    );
    const timer = setTimeout(() => {
      req.destroy(new EgressError("timeout", "Délai dépassé : l'ancien logiciel ne répond pas"));
    }, timeoutMs);
    timer.unref?.();
    req.on("error", (e) => done(e));
    if (body) req.write(body);
    req.end();
  });
}

const isTimeout = (e: Error) => (e as NodeJS.ErrnoException).code === "ETIMEDOUT" || e.name === "TimeoutError";
const setCookiesOf = (h: http.IncomingHttpHeaders) => (Array.isArray(h["set-cookie"]) ? h["set-cookie"] : h["set-cookie"] ? [String(h["set-cookie"])] : []);

/* ------------------------------------------------------------------ */
/* Réseau requis par une adresse (file des missions, SPEC §6)           */
/* ------------------------------------------------------------------ */

const PRIVATE_SUFFIX = /(^|\.)(local|localhost|internal|intranet|lan|home|home\.arpa|corp)$/i;

/**
 * « private » : bouclage, IP interne, nom en .local/.localhost/…, nom sans domaine (une seule étiquette),
 * ou nom dont TOUTES les adresses résolues sont internes (résolution facultative, au mieux) ;
 * sinon « public ». Un exécuteur qui ne déclare que « public » (navigateur hébergé) ne prend jamais
 * une mission « private ».
 */
export async function requiredNetwork(target: string, opts: { resolve?: boolean; timeoutMs?: number } = {}): Promise<"public" | "private"> {
  let u: URL;
  try {
    u = new URL(target);
  } catch {
    return "public";
  }
  const host = stripBrackets(u.hostname).toLowerCase();
  if (net.isIP(host)) return isDeniedAddress(host) ? "private" : "public";
  if (!host.includes(".") || PRIVATE_SUFFIX.test(host)) return "private";
  if (opts.resolve === false) return "public";
  const resolve = g.__rebornEgress?.resolve ?? defaultResolver;
  try {
    const list = await Promise.race([resolve(host), new Promise<never>((_, rej) => setTimeout(() => rej(new Error("délai")), opts.timeoutMs ?? 1500).unref?.())]);
    return list.length && list.every((a) => isDeniedAddress(a.address)) ? "private" : "public";
  } catch {
    return "public";
  }
}

/** Origine affichable d'une adresse (protocole, hôte, port), sans identifiant ni chemin ; null si invalide. */
export function safeOrigin(target: string | undefined | null): string | null {
  if (!target) return null;
  try {
    const u = new URL(target);
    return u.protocol === "http:" || u.protocol === "https:" ? `${u.protocol}//${u.host}` : null;
  } catch {
    return null;
  }
}

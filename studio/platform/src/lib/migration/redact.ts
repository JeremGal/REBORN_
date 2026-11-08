import { readCredentials, redactWith, secretPattern } from "./credentials";
import { CRM_FIXTURES } from "./fixtures";

/**
 * Masquage des secrets dans ce que les agents envoient au Studio (r3.md, points d'attention n° 9 ; revue
 * finale SEC-01), AVANT tout enregistrement : évènements, observations, schémas d'écran, rapports de connexion
 * et fins de mission.
 *
 * - Secrets connus du Studio, sous TOUTES leurs formes (credentials.ts, secretVariants : brut, encodé pour une
 *   adresse ou un formulaire, échappé JSON / HTML, hexadécimal, base64 aux trois alignements) : mot de passe
 *   et identifiant confiés au projet, jetons de service, secret des sessions.
 * - Saisies de mot de passe : valeur d'une saisie visant un champ mot de passe (type password, ou nom / libellé
 *   de champ mot de passe), et « <champ mot de passe> = valeur » dans un texte libre.
 * - Valeurs métier (observations : entrées et sorties d'une expérience ; schémas : valeurs proposées) : seul un
 *   nom de champ mot de passe AU MOT PRÈS est masqué (« motdepasse », « mot_de_passe », « user_password »,
 *   « pwd »), jamais un champ métier qui contient ces lettres (« nb_passagers », « passeport »).
 * Le masque est unique (MASK) ; il ne révèle ni la longueur ni un caractère du secret.
 */

/** Nom, libellé ou sélecteur d'un champ de mot de passe (actions de l'agent : large, comme avant). */
export const PASSWORD_FIELD = /pass|mot.?de.?passe|pwd/i;
export const MASK = "•••";

export interface SecretContext {
  /** Valeurs exactes à masquer partout (les plus longues d'abord). */
  secrets: string[];
  /** Noms (minuscules) des champs « mot de passe » des plans d'extraction connus du Studio. */
  passwordFields: Set<string>;
  /** Motif de toutes les formes de ces secrets, compilé une fois (secretPattern). */
  pattern: RegExp | null;
}

const SERVER_SECRETS = ["REBORN_EXPLORER_TOKEN", "REBORN_ANALYST_TOKEN", "REBORN_API_TOKEN", "REBORN_AUTH_SECRET"];

/** Secrets connus pour les projets concernés (identifiants confiés, déchiffrés en mémoire seulement) et ceux du serveur. */
export function secretContext(projects: Iterable<string | null | undefined>): SecretContext {
  const secrets: string[] = [];
  for (const p of new Set([...projects].filter((x): x is string => typeof x === "string" && x.length > 0))) {
    try {
      const c = readCredentials(p);
      if (c) secrets.push(c.password, c.username);
    } catch {}
  }
  for (const k of SERVER_SECRETS) {
    const v = process.env[k];
    if (v && v.length >= 16) secrets.push(v);
  }
  const passwordFields = new Set<string>();
  const planField = (CRM_FIXTURES.extraction_plan as { login?: { password_field?: unknown } }).login?.password_field;
  if (typeof planField === "string" && planField) passwordFields.add(planField.trim().toLowerCase());
  // Les plus longs d'abord : un secret qui en contient un autre est masqué en entier.
  secrets.sort((a, b) => b.length - a.length);
  return { secrets, passwordFields, pattern: secretPattern(secrets) };
}

const isPasswordName = (name: unknown, ctx: SecretContext) => typeof name === "string" && (PASSWORD_FIELD.test(name) || ctx.passwordFields.has(name.trim().toLowerCase()));

/** Mots qui désignent un mot de passe dans un nom de champ (comparés mot à mot, jamais en sous-chaîne). */
const SECRET_WORDS = new Set(["password", "passwd", "pass", "pwd", "mdp", "motdepasse", "passphrase", "passcode", "passwort"]);

/**
 * Nom (ou libellé) de champ qui désigne un mot de passe, AU MOT PRÈS : « motdepasse », « mot_de_passe »,
 * « Mot de passe », « user_password », « userPassword », « pwd », « mdp » ; jamais « nb_passagers »,
 * « passeport » ni « compass ». Pour les valeurs métier (observations, schémas d'écran).
 */
export function isSecretFieldName(name: unknown, ctx?: SecretContext): boolean {
  if (typeof name !== "string" || !name.trim()) return false;
  if (ctx?.passwordFields.has(name.trim().toLowerCase())) return true;
  const flat = name.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase();
  if (/mot[\s_.-]*de[\s_.-]*passe/.test(flat)) return true;
  const words = name
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return words.some((w) => SECRET_WORDS.has(w));
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Clés qui désignent le champ visé par une saisie, et clés qui portent la valeur saisie. */
const NAME_KEYS = ["target", "field", "name", "label", "selector", "element", "placeholder", "aria_label", "ariaLabel", "id"];
const VALUE_KEYS = ["value", "text", "input", "typed", "content", "keys", "default"];

/** Texte libre : secrets masqués sous toutes leurs formes ; avec `fields`, aussi « <champ mot de passe> = valeur » / « : valeur ». */
export function redactFreeText(text: string, ctx: SecretContext, fields: boolean): string {
  let out = text;
  if (fields) {
    const names = ["pass\\w*", "mot.?de.?passe", "pwd", ...[...ctx.passwordFields].map(escapeRe)].join("|");
    out = out.replace(new RegExp(`((?:${names})\\s*(?:=|:|→)\\s*)("[^"]*"|'[^']*'|\\S+)`, "gi"), `$1${MASK}`);
  }
  return redactWith(out, ctx.pattern);
}

function redactValue(v: unknown, ctx: SecretContext, fields: boolean, depth: number): unknown {
  if (typeof v === "string") return redactWith(v, ctx.pattern);
  if (depth > 32 || v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map((x) => redactValue(x, ctx, fields, depth + 1));
  const o = v as Record<string, unknown>;
  const passwordInput = o.type === "password" || o.input_type === "password" || (fields && NAME_KEYS.some((k) => isPasswordName(o[k], ctx)));
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(o)) {
    const filled = x !== null && x !== undefined && x !== "" && (typeof x === "string" || typeof x === "number");
    if (filled && ((fields && isPasswordName(k, ctx)) || (passwordInput && VALUE_KEYS.includes(k)))) out[k] = MASK;
    else out[k] = redactValue(x, ctx, fields, depth + 1);
  }
  return out;
}

/** Valeur entièrement masquée (texte, nombre, ou chacune des valeurs d'une liste / d'un objet). */
function maskAll(v: unknown, depth = 0): unknown {
  if (typeof v === "string" || typeof v === "number") return v === "" ? v : MASK;
  if (depth > 32 || v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map((x) => maskAll(x, depth + 1));
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, maskAll(x, depth + 1)]));
}

/* ------------------------------------------------------------------ */
/* Schémas d'écran                                                      */
/* ------------------------------------------------------------------ */

/** Valeurs qu'un champ d'écran peut porter (valeur par défaut, exemple, choix proposés). */
const FIELD_VALUE_KEYS = new Set(["default", "value", "placeholder", "example", "examples", "options"]);

function redactField(f: unknown, ctx: SecretContext): unknown {
  if (!f || typeof f !== "object" || Array.isArray(f)) return redactValue(f, ctx, false, 0);
  const field = f as Record<string, unknown>;
  const secret = field.type === "password" || field.input_type === "password" || isSecretFieldName(field.name, ctx) || isSecretFieldName(field.label, ctx);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(field)) out[k] = secret && FIELD_VALUE_KEYS.has(k) ? maskAll(v) : redactValue(v, ctx, false, 0);
  return out;
}

/**
 * Schéma d'écran reçu (contrat app_schema, ou `data` d'un évènement form_discovered) : textes débarrassés des
 * secrets connus ; valeurs proposées d'un champ mot de passe (type password, ou nom / libellé de mot de passe
 * au mot près) masquées. Rattachement (investigation_id, project_id) conservé tel quel pour les contrôles.
 */
export function redactIncomingSchema(raw: unknown, ctx: SecretContext): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return redactValue(raw, ctx, false, 0);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (k === "investigation_id" || k === "project_id") out[k] = v;
    else if (k === "fields" && Array.isArray(v)) out[k] = v.map((f) => redactField(f, ctx));
    else out[k] = redactValue(v, ctx, false, 0);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Observations                                                         */
/* ------------------------------------------------------------------ */

/** Champs dont la valeur est une référence (jamais modifiée) ou traitée à part. */
const OBSERVATION_KEPT = new Set(["investigation_id", "request_id", "screenshot_url", "status", "project_id"]);

function redactObservation(item: unknown, ctx: SecretContext): unknown {
  if (!item || typeof item !== "object" || Array.isArray(item)) return item;
  const o = item as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (OBSERVATION_KEPT.has(k)) out[k] = v;
    else if ((k === "inputs" || k === "observed_output") && v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = Object.fromEntries(
        Object.entries(v as Record<string, unknown>).map(([name, value]) => [
          name,
          isSecretFieldName(name, ctx) && value !== null && value !== "" && (typeof value === "string" || typeof value === "number") ? MASK : typeof value === "string" ? redactWith(value, ctx.pattern) : value,
        ]),
      );
    } else if (k === "error" && typeof v === "string") out[k] = redactFreeText(v, ctx, true);
    else out[k] = redactValue(v, ctx, true, 0);
  }
  return out;
}

/**
 * Observations reçues (une, un tableau, ou { observations: [...] } : forme d'origine conservée) : saisies d'un
 * champ mot de passe masquées (nom au mot près : jamais une valeur métier), secrets connus masqués partout
 * (entrées, sorties, erreur, libellés), références (investigation, demande, capture) intactes.
 */
export function redactIncomingObservations(raw: unknown, ctx: SecretContext): unknown {
  if (Array.isArray(raw)) return raw.map((o) => redactObservation(o, ctx));
  if (raw && typeof raw === "object" && Array.isArray((raw as { observations?: unknown }).observations)) {
    return { ...(raw as Record<string, unknown>), observations: (raw as { observations: unknown[] }).observations.map((o) => redactObservation(o, ctx)) };
  }
  return redactObservation(raw, ctx);
}

/* ------------------------------------------------------------------ */
/* Évènements                                                           */
/* ------------------------------------------------------------------ */

/** Types d'évènements où l'agent rapporte ses actions (saisies comprises) : masquage par champ en plus des secrets. */
const ACTION_TYPES = new Set(["action", "log", "error"]);

/**
 * Évènements reçus (objet ou tableau, forme d'origine conservée, project_id compris pour le contrôle de
 * rattachement) : titre, détail et données débarrassés des saisies de mot de passe et des secrets connus ;
 * un écran découvert (form_discovered) est masqué comme un schéma d'écran (il en crée une version).
 */
export function redactIncomingEvents(raw: unknown, ctx: SecretContext): unknown {
  const one = (item: unknown): unknown => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    const e = item as Record<string, unknown>;
    const fields = ACTION_TYPES.has(typeof e.type === "string" ? e.type : "log");
    const out: Record<string, unknown> = { ...e };
    if (typeof e.title === "string") out.title = redactFreeText(e.title, ctx, fields).slice(0, 500);
    if (typeof e.detail === "string") out.detail = redactFreeText(e.detail, ctx, fields).slice(0, 5000);
    if (e.data !== undefined) out.data = e.type === "form_discovered" ? redactIncomingSchema(e.data, ctx) : redactValue(e.data, ctx, fields, 0);
    return out;
  };
  return Array.isArray(raw) ? raw.map(one) : one(raw);
}

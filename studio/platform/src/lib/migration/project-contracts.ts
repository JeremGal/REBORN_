import { z } from "zod";

/**
 * Contrats des projets, de la connexion et des missions de l'exécuteur (Studio ↔ propriétaire ↔
 * exécuteur de l'agent Computer Use). Utilisés par les routes /api/projects/* et /api/executor/*, et
 * exportés en JSON Schema dans contracts/ (contracts-export.ts). Évolutions additives et versionnées.
 */

/** Version historique (1.0) : conservée pour compatibilité des imports. */
export const PROJECT_CONTRACT_VERSION = "1.0";
/**
 * project_create 1.1 (additif) : authorized_by devient facultatif et n'est plus utilisé (l'autorisation
 * est enregistrée au nom du compte connecté) ; authorization_version et credentials_notice_version
 * (facultatifs) annoncent les versions des textes acceptés (lib/legal.ts).
 * project_create 1.2 : règle des 24 h (ttl_hours ≤ 24, refus au-delà) et adresse contrôlée
 * (LegacyUrlSchema : http(s), sans identifiants, hôte non vide).
 * project_create 1.3 : consentement jamais présumé — authorization_version exigée (400 sans elle), et
 * credentials_notice_version exigée dès que des identifiants sont confiés (400 sans elle) ; version périmée : 409.
 * (Exigences de la route : le schéma garde les deux champs facultatifs pour rester lisible par les clients 1.x.)
 */
export const PROJECT_CREATE_CONTRACT_VERSION = "1.3";
/** connection_report 1.1 (additif) : mission_id facultatif ; `by` accepté mais ignoré (identité authentifiée). */
export const CONNECTION_REPORT_CONTRACT_VERSION = "1.1";
/** connection_mission 1.1 (additif : tous les champs 1.0 conservés). */
export const CONNECTION_MISSION_CONTRACT_VERSION = "1.1";
export const EXECUTOR_HEARTBEAT_CONTRACT_VERSION = "1.0";
export const MISSION_COMPLETE_CONTRACT_VERSION = "1.0";

export const MISSION_ID = /^MIS_[a-f0-9]{10}$/;
const PROJECT_ID_PATTERN = /^MIG_[a-f0-9]{8}$/;

/** États d'une mission d'analyse (file de l'exécuteur). */
export const MISSION_STATUSES = ["queued", "claimed", "connecting", "connected", "exploring", "needs_human", "completed", "failed", "cancelled", "expired"] as const;
export type MissionStatus = (typeof MISSION_STATUSES)[number];
/** États « en cours » : une seule mission de ce type par projet. */
export const ACTIVE_MISSION_STATUSES = ["queued", "claimed", "connecting", "connected", "exploring", "needs_human"] as const satisfies readonly MissionStatus[];

/* ------------------------------------------------------------------ */
/* Adresse de l'ancien logiciel (SPEC §7)                               */
/* ------------------------------------------------------------------ */

export const LEGACY_URL_MAX = 500;
/** Approximation représentable en JSON Schema : http(s), autorité sans « @ » (donc sans identifiants), hôte non vide. */
export const LEGACY_URL_PATTERN = /^https?:\/\/[^\s/?#@]+(?:[/?#]\S*)?$/;
export const LEGACY_URL_WITH_CREDENTIALS =
  "Adresse refusée : elle contient un identifiant ou un mot de passe. Indiquez l'adresse seule ; les identifiants se confient à part, chiffrés.";

/** Problème de l'adresse (message sans jamais recopier l'adresse), ou null si elle est acceptable. */
export function legacyUrlProblem(raw: string): string | null {
  const v = raw.trim();
  if (!v) return "Adresse de l'ancien logiciel requise";
  if (v.length > LEGACY_URL_MAX) return `Adresse trop longue (${LEGACY_URL_MAX} caractères au maximum)`;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return "Adresse invalide : indiquez l'adresse complète, par exemple https://logiciel.exemple.fr";
  }
  if (u.username || u.password || /^[a-z][a-z0-9+.-]*:\/\/[^/?#]*@/i.test(v)) return LEGACY_URL_WITH_CREDENTIALS;
  if (u.protocol !== "http:" && u.protocol !== "https:") return "Adresse refusée : seules les adresses http et https sont acceptées";
  if (!u.hostname) return "Adresse invalide : hôte manquant";
  if (!LEGACY_URL_PATTERN.test(v)) return "Adresse invalide : indiquez l'adresse complète, par exemple https://logiciel.exemple.fr";
  return null;
}

/** Adresse de connexion de l'ancien logiciel : contrôlée à la création, à la modification et avant chaque connexion. */
export const LegacyUrlSchema = z
  .string()
  .trim()
  .max(LEGACY_URL_MAX, `Adresse trop longue (${LEGACY_URL_MAX} caractères au maximum)`)
  .superRefine((v, ctx) => {
    const problem = legacyUrlProblem(v);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  })
  // Représentable en JSON Schema (contrat publié) ; le contrôle exact est celui de legacyUrlProblem.
  .regex(LEGACY_URL_PATTERN, "URL http(s) attendue, sans identifiants");

/* ------------------------------------------------------------------ */
/* Création de projet                                                   */
/* ------------------------------------------------------------------ */

export const ProjectCreateSchema = z
  .object({
    company: z.string().trim().min(1, "Nom de l'entreprise requis").max(120),
    software: z.string().trim().max(120).optional(),
    legacy_url: LegacyUrlSchema.optional().or(z.literal("").transform(() => undefined)),
    software_type: z.string().trim().max(80).optional(),
    notes: z.string().trim().max(2000).optional(),
    /** Le propriétaire (ou son mandataire) confirme être autorisé : obligatoire. */
    authorized: z.literal(true, { error: "Confirmez être autorisé(e) à faire analyser et migrer ces données" }),
    /** Version de la déclaration d'autorisation affichée (refus si elle n'est plus la version courante). */
    authorization_version: z.string().trim().min(1).max(20).optional(),
    /** Compatibilité 1.0 : accepté mais ignoré, l'autorisation est enregistrée au nom du compte connecté. */
    authorized_by: z.string().trim().max(120).optional(),
    /** Identifiants de l'ancien logiciel : chiffrés, conservés 24 h au plus (refus au-delà), jamais renvoyés. */
    credentials: z
      .object({
        username: z.string().min(1).max(200),
        password: z.string().min(1).max(500),
        ttl_hours: z.number().min(0.25, "Durée de conservation : 15 minutes au minimum").max(24, "Durée de conservation : 24 h au maximum").optional(),
      })
      .strict()
      .optional(),
    /** Version du texte sur le traitement des identifiants affiché avec le formulaire d'accès. */
    credentials_notice_version: z.string().trim().min(1).max(20).optional(),
  })
  .strict();

/** Dépôt (ou remplacement) des identifiants d'un projet existant : POST /api/projects/[id]/credentials. */
export const CredentialsDepositSchema = z
  .object({
    username: z.string().min(1).max(200),
    password: z.string().min(1).max(500),
    ttl_hours: z.number().min(0.25, "Durée de conservation : 15 minutes au minimum").max(24, "Durée de conservation : 24 h au maximum").optional(),
    /** Version du texte sur le traitement des identifiants affiché avec le formulaire (version courante si absente). */
    credentials_notice_version: z.string().trim().min(1).max(20).optional(),
  })
  .strict();

/* ------------------------------------------------------------------ */
/* Rapport de connexion (exécuteur → Studio)                            */
/* ------------------------------------------------------------------ */

/** Rapport de connexion de l'exécuteur de l'agent Computer Use (Mouss) : réservé au titulaire de la mission. */
export const ConnectionReportSchema = z
  .object({
    status: z.enum(["pending", "connected", "failed", "mfa_required", "human_needed"]),
    detail: z.string().max(1000).optional(),
    /** Compatibilité 1.0 : accepté mais ignoré, le Studio enregistre l'identité authentifiée. */
    by: z.string().max(60).optional(),
    /** 1.1 : mission concernée (celle prise par l'exécuteur ; facultatif). */
    mission_id: z.string().regex(MISSION_ID).optional(),
  })
  .strict();

/* ------------------------------------------------------------------ */
/* Mission (Studio → exécuteur)                                         */
/* ------------------------------------------------------------------ */

const Endpoint = z.object({ method: z.string(), url: z.string(), body: z.string().optional() }).loose();

/** Consigne de manipulation des identifiants, transmise avec chaque mission qui en comporte. */
export const CREDENTIAL_HANDLING = "remplir hors du modèle : coffre H fill_secret_at ou CDP ; jamais dans la consigne";

/**
 * connection_mission 1.1 : mission remise à l'exécuteur (prise dans la file, POST
 * /api/executor/missions/claim, ou compatibilité 1.0 POST /api/projects/[id]/mission).
 * Champs 1.0 conservés à l'identique ; credential.expires_at garde son sens 1.0 (déprécié : échéance du
 * jeton s'il est présent, sinon des identifiants) — utiliser credentials_expires_at et token_expires_at.
 */
export const ConnectionMissionSchema = z
  .object({
    contract: z.literal("connection_mission"),
    contract_version: z.string().regex(/^1\.\d+$/),
    mission_id: z.string().regex(MISSION_ID),
    project_id: z.string().regex(PROJECT_ID_PATTERN),
    target: z.object({ url: z.string().nullable(), software: z.string().nullable(), software_type: z.string().nullable(), company: z.string().nullable() }).loose(),
    authorization: z.object({ by: z.string(), at: z.string(), statement: z.string(), version: z.string().optional() }).loose().nullable(),
    objectives: z.array(z.string()).min(1),
    constraints: z.array(z.string()).min(1),
    credential: z
      .object({
        username_hint: z.string(),
        /** Déprécié (sens 1.0) : échéance du jeton s'il est présent, sinon échéance des identifiants. */
        expires_at: z.string(),
        redeem_url: z.string().optional(),
        /** Jeton à usage unique (15 min), lié à la mission et à l'exécuteur : jamais transmis à un modèle. */
        token: z.string().optional(),
        /** 1.1 */
        credentials_expires_at: z.string(),
        token_expires_at: z.string().optional(),
        handling: z.string(),
      })
      .loose()
      .nullable(),
    report: z
      .object({
        connection_status: Endpoint,
        investigation: Endpoint,
        events: Endpoint,
        screens: Endpoint,
        observations: Endpoint,
        exports: Endpoint,
        /** 1.1 */
        heartbeat: Endpoint,
        complete: Endpoint,
      })
      .loose(),
    /* --- 1.1 --- */
    status: z.enum(MISSION_STATUSES),
    created_at: z.string(),
    /** Échéance de la mission : au plus tôt entre création + 24 h et échéance des identifiants. */
    expires_at: z.string(),
    requires_network: z.enum(["public", "private"]),
    investigation_id: z.string().nullable(),
    executor: z.object({ id: z.string(), lease_expires_at: z.string().nullable() }).loose().nullable(),
    consent: z.object({ privacy_notice_version: z.string().nullable(), authorization_version: z.string().nullable(), accepted_at: z.string().nullable() }).loose().nullable(),
    limits: z.object({ read_only: z.literal(true), login_screenshots: z.literal(false), max_duration_s: z.number().int().positive() }).loose(),
  })
  .loose();
export type ConnectionMission = z.output<typeof ConnectionMissionSchema>;

/* ------------------------------------------------------------------ */
/* Exécuteur : battement de cœur et fin de mission                      */
/* ------------------------------------------------------------------ */

/**
 * executor_heartbeat 1.0 : signe de vie de l'exécuteur (au moins toutes les 20 s) ; renouvelle le prêt
 * (120 s) des missions qu'il déclare en cours. Champs inconnus tolérés (exécuteurs plus récents).
 */
export const ExecutorHeartbeatSchema = z
  .object({
    /** Version du contrat connection_mission comprise par l'exécuteur (1.x). */
    version: z.string().trim().min(1).max(40),
    /** Réseaux réellement joignables : public (Internet), private (réseau local, bouclage, .local). */
    networks: z.array(z.enum(["public", "private"])).min(1).max(2),
    /** Saisie des identifiants hors du modèle : coffre H (fill_secret_at), CDP, ou aucune (missions sans identifiants seulement). */
    login: z.enum(["h_vault", "cdp", "none"]),
    max_concurrent: z.number().int().min(1).max(50),
    active_missions: z.array(z.string().regex(MISSION_ID)).max(100).default([]),
    /** Libellé lisible de l'exécuteur (facultatif). */
    label: z.string().trim().max(80).optional(),
  })
  .loose();

/** mission_complete 1.0 : fin de mission déclarée par l'exécuteur titulaire (jamais implicite). */
export const MissionCompleteSchema = z
  .object({
    outcome: z.enum(["completed", "failed"]),
    detail: z.string().max(1000).optional(),
    disposal: z.object({ h_vault_item_deleted: z.boolean().optional(), local_artifacts_purged: z.boolean().optional() }).strict().optional(),
  })
  .strict();

/** Exemple de FORMAT (valeurs fictives, jeu de test) publié dans contracts/ : jamais une vraie mission. */
export function connectionMissionExample(): ConnectionMission & { $comment: string } {
  const id = "MIG_00000000";
  const q = `?project=${id}`;
  return {
    $comment: "Exemple de FORMAT du contrat connection_mission 1.1 (valeurs fictives, jeu de test) : jamais une vraie mission, jamais un vrai jeton.",
    contract: "connection_mission",
    contract_version: CONNECTION_MISSION_CONTRACT_VERSION,
    mission_id: "MIS_0000000000",
    project_id: id,
    status: "claimed",
    created_at: "2026-11-07T09:00:00.000Z",
    expires_at: "2026-11-08T09:00:00.000Z",
    requires_network: "public",
    investigation_id: "INV_001",
    executor: { id: "EXE_000000000000", lease_expires_at: "2026-11-07T09:02:00.000Z" },
    target: { url: "https://logiciel.exemple.test", software: "Logiciel d'exemple", software_type: "CRM", company: "Entreprise d'exemple" },
    authorization: { by: "Prénom Nom", at: "2026-11-07T08:55:00.000Z", statement: "Texte de la déclaration d'autorisation acceptée", version: "1.0" },
    consent: { privacy_notice_version: "1.0", authorization_version: "1.0", accepted_at: "2026-11-07T08:55:00.000Z" },
    objectives: ["Se connecter à l'ancien logiciel avec le compte fourni et rapporter l'état de connexion"],
    constraints: ["Ne jamais transmettre les identifiants à un modèle de langage : seul le code technique de l'exécuteur les utilise"],
    credential: {
      username_hint: "e••••••e",
      expires_at: "2026-11-07T09:15:00.000Z",
      credentials_expires_at: "2026-11-08T08:55:00.000Z",
      redeem_url: `/api/projects/${id}/credentials/redeem`,
      token: "exemple-de-jeton-fictif-0000000000",
      token_expires_at: "2026-11-07T09:15:00.000Z",
      handling: CREDENTIAL_HANDLING,
    },
    limits: { read_only: true, login_screenshots: false, max_duration_s: 3600 },
    report: {
      connection_status: { method: "POST", url: `/api/projects/${id}/connection`, body: '{ "status": "pending|connected|failed|mfa_required|human_needed", "detail": "…", "mission_id": "MIS_0000000000" }' },
      investigation: { method: "POST", url: "/api/investigations", body: "déjà créée par le Studio : investigation_id INV_001 (ne pas en créer une autre)" },
      events: { method: "POST", url: `/api/events${q}` },
      screens: { method: "POST", url: `/api/schema${q}` },
      observations: { method: "POST", url: `/api/observations${q}` },
      exports: { method: "POST", url: `/api/migration/sources${q}`, body: '{ "name": "clients.csv", "content_base64": "…", "mechanism": "export CSV" }' },
      heartbeat: { method: "POST", url: "/api/executor/heartbeat", body: '{ "version": "1.1", "networks": ["public"], "login": "h_vault", "max_concurrent": 1, "active_missions": ["MIS_0000000000"] } — toutes les 20 s' },
      complete: { method: "POST", url: "/api/executor/missions/MIS_0000000000/complete", body: '{ "outcome": "completed|failed", "detail": "…", "disposal": { "h_vault_item_deleted": true, "local_artifacts_purged": true } }' },
    },
  };
}

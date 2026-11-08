import { LEGAL_DOCUMENTS, type ConsentKind } from "../legal";
import { getAuthDb } from "./auth";
import { consentRows, insertConsentRows, outsideTransaction, type ConsentRow } from "./db";

/**
 * Consentements enregistrés (table consents de auth.db, SPEC §8) :
 * inscription → terms_acceptance + privacy_acknowledgement (dans la transaction de création du compte) ;
 * création de projet → source_authorization (obligatoire) + credentials_notice (si identifiants confiés).
 * Chaque ligne garde le document, sa version et l'empreinte SHA-256 du texte exact accepté.
 */

export type ConsentView = Omit<ConsentRow, "user_id">;

/** Enregistre un ou plusieurs consentements, ensemble ou pas du tout, à la version courante des textes. */
export async function recordConsents(input: { userId: string; projectId?: string | null; kinds: ConsentKind[] }): Promise<ConsentView[]> {
  const db = await getAuthDb();
  const rows = consentRows(input.userId, input.projectId ?? null, input.kinds);
  await outsideTransaction(db, () => insertConsentRows(db, rows));
  return rows.map(({ user_id: _u, ...r }) => r);
}

export async function recordConsent(input: { userId: string; projectId?: string | null; kind: ConsentKind }): Promise<ConsentView> {
  return (await recordConsents({ userId: input.userId, projectId: input.projectId, kinds: [input.kind] }))[0];
}

/** Consentements d'un compte (tous, ou ceux d'un projet), du plus ancien au plus récent. */
export async function listConsents(userId: string, projectId?: string): Promise<ConsentView[]> {
  const db = await getAuthDb();
  const rows = (
    projectId === undefined
      ? db.prepare("SELECT id, project_id, kind, document, version, statement_sha256, accepted_at FROM consents WHERE user_id = ? ORDER BY accepted_at, rowid").all(userId)
      : db.prepare("SELECT id, project_id, kind, document, version, statement_sha256, accepted_at FROM consents WHERE user_id = ? AND project_id = ? ORDER BY accepted_at, rowid").all(userId, projectId)
  ) as unknown as ConsentView[];
  return rows.map((r) => ({ ...r }));
}

/** Compensation : un projet dont la création a échoué ne garde aucun consentement. */
export async function deleteProjectConsents(projectId: string): Promise<void> {
  const db = await getAuthDb();
  await outsideTransaction(db, () => db.prepare("DELETE FROM consents WHERE project_id = ?").run(projectId));
}

/**
 * Textes liés au COMPTE (acceptés à l'inscription) : conditions d'utilisation (acceptation contractuelle) et
 * politique de confidentialité (prise de connaissance). Une nouvelle version doit être acceptée à nouveau
 * (conditions, § « Évolution ») : tant qu'elle ne l'est pas, l'API refuse les écritures du compte (handler()).
 */
export const ACCOUNT_CONSENTS = Object.freeze([
  { kind: "terms_acceptance" as const, document: LEGAL_DOCUMENTS.conditions },
  { kind: "privacy_acknowledgement" as const, document: LEGAL_DOCUMENTS.confidentialite },
]);

export interface RequiredConsent {
  kind: "terms_acceptance" | "privacy_acknowledgement";
  document: string;
  version: string;
  title: string;
  path: string;
}

/** Textes du compte dont la version COURANTE n'a pas été acceptée (ou lue) : vide si tout est à jour. */
export async function requiredAccountConsents(userId: string): Promise<RequiredConsent[]> {
  const db = await getAuthDb();
  const rows = db.prepare("SELECT kind, version FROM consents WHERE user_id = ? AND project_id IS NULL AND kind IN ('terms_acceptance', 'privacy_acknowledgement')").all(userId) as unknown as { kind: string; version: string }[];
  return ACCOUNT_CONSENTS.filter((c) => !rows.some((r) => r.kind === c.kind && r.version === c.document.version)).map((c) => ({ kind: c.kind, document: c.document.id, version: c.document.version, title: c.document.title, path: c.document.path }));
}

/**
 * Documents juridiques versionnés et déclarations acceptées par les clients (SPEC §8).
 * Données seulement : aucune dépendance serveur, importable par les pages (/legal/*, inscription,
 * nouveau projet). Le contenu des pages est écrit par le lot B3 ; ce module fixe les identifiants,
 * versions, dates d'effet et le texte exact des cases que la personne coche.
 *
 * Changer une version (ou le texte d'une déclaration) oblige à recueillir un nouveau consentement :
 * le serveur refuse une inscription ou une création de projet qui annonce une version périmée.
 */

export type LegalDocumentId = "conditions" | "confidentialite" | "identifiants";

export interface LegalDocument {
  id: LegalDocumentId;
  version: string;
  title: string;
  /** Page qui présente le document (ou la section). */
  path: string;
  /** Date d'effet (AAAA-MM-JJ). */
  effective: string;
}

export const LEGAL_DOCUMENTS: Readonly<Record<LegalDocumentId, LegalDocument>> = Object.freeze({
  /** Conditions d'utilisation : acceptation contractuelle. */
  conditions: { id: "conditions", version: "1.0", title: "Conditions d'utilisation", path: "/legal/conditions", effective: "2026-11-07" },
  /** Politique de confidentialité : information (prise de connaissance, pas un contrat). */
  confidentialite: { id: "confidentialite", version: "1.0", title: "Politique de confidentialité", path: "/legal/confidentialite", effective: "2026-11-07" },
  /** Section de la politique : traitement des identifiants de l'ancien logiciel. */
  identifiants: { id: "identifiants", version: "1.0", title: "Traitement des identifiants de l'ancien logiciel", path: "/legal/confidentialite#identifiants", effective: "2026-11-07" },
});

/**
 * Déclaration d'autorisation d'accès à l'ancien logiciel (autorisation, ni contrat ni information).
 * Texte repris à l'identique de l'ancienne constante AUTHORIZATION_STATEMENT de project.ts.
 */
export const AUTHORIZATION_DECLARATION = Object.freeze({
  id: "autorisation-acces",
  version: "1.0",
  effective: "2026-11-07",
  text: "Je confirme être autorisé(e) par le propriétaire des données à faire analyser ce logiciel et à en migrer les données, dans la limite des accès fournis.",
});

/** Bandeau des pages juridiques : aucune affirmation de conformité. */
export const DRAFT_NOTICE = "Document de travail — à faire valider par un juriste avant tout usage commercial.";

/** Contact pour les demandes de suppression (REBORN_PRIVACY_CONTACT), ou null s'il n'est pas configuré. */
export function privacyContact(): string | null {
  const v = typeof process !== "undefined" ? process.env.REBORN_PRIVACY_CONTACT?.trim() : undefined;
  return v ? v : null;
}
export const PRIVACY_CONTACT_MISSING = "Adresse de contact à définir avant mise en service commerciale.";

export const CONSENT_KINDS = ["terms_acceptance", "privacy_acknowledgement", "source_authorization", "credentials_notice"] as const;
export type ConsentKind = (typeof CONSENT_KINDS)[number];

/** Nature de chaque consentement (distinction contrat / information / autorisation). */
export const CONSENT_NATURE: Readonly<Record<ConsentKind, "contrat" | "information" | "autorisation">> = Object.freeze({
  terms_acceptance: "contrat",
  privacy_acknowledgement: "information",
  source_authorization: "autorisation",
  credentials_notice: "information",
});

export interface ConsentStatement {
  kind: ConsentKind;
  /** Document ou déclaration concerné. */
  document: string;
  version: string;
  /** Texte exact affiché à côté de la case (son empreinte SHA-256 est enregistrée). */
  text: string;
}

/** Texte exact de chaque case, à la version courante. Les cases ne sont jamais pré-cochées. */
export function consentStatement(kind: ConsentKind): ConsentStatement {
  switch (kind) {
    case "terms_acceptance": {
      const d = LEGAL_DOCUMENTS.conditions;
      return { kind, document: d.id, version: d.version, text: `J'accepte les conditions d'utilisation (version ${d.version}).` };
    }
    case "privacy_acknowledgement": {
      const d = LEGAL_DOCUMENTS.confidentialite;
      return { kind, document: d.id, version: d.version, text: `J'ai pris connaissance de la politique de confidentialité (version ${d.version}).` };
    }
    case "source_authorization":
      return { kind, document: AUTHORIZATION_DECLARATION.id, version: AUTHORIZATION_DECLARATION.version, text: AUTHORIZATION_DECLARATION.text };
    case "credentials_notice": {
      const d = LEGAL_DOCUMENTS.identifiants;
      return { kind, document: d.id, version: d.version, text: `J'ai pris connaissance du traitement des identifiants de l'ancien logiciel (version ${d.version}).` };
    }
  }
}

/**
 * Champs du corps d'inscription (POST /api/auth/sign-up/email) qui annoncent les versions acceptées :
 * { …, termsVersion: LEGAL_DOCUMENTS.conditions.version, privacyVersion: LEGAL_DOCUMENTS.confidentialite.version }.
 * Création de projet (POST /api/projects) : authorization_version et, si des identifiants sont confiés,
 * credentials_notice_version (facultatifs : la version courante est retenue s'ils manquent).
 */
export const SIGN_UP_CONSENT_FIELDS = Object.freeze({ terms: "termsVersion", privacy: "privacyVersion" });

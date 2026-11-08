/**
 * Réponses de Better Auth (/api/auth/*) traduites pour les formulaires d'entrée : ce qui s'est passé
 * et quoi faire, sans jargon. Le serveur renvoie déjà des messages français (route /api/auth), mais
 * le titre et la conduite à tenir sont choisis ici. Fonctions pures (testées).
 */

export type FieldName = "email" | "password" | "confirm" | "firstName" | "lastName" | "company" | "terms" | "privacy";

export interface FormError {
  title: string;
  message: string;
  /** Champs concernés (bordure, aria-invalid, message sous le champ). */
  fields?: Partial<Record<FieldName, string>>;
}

interface AuthBody {
  code?: unknown;
  message?: unknown;
  issues?: unknown;
}

const asBody = (b: unknown): AuthBody => (b && typeof b === "object" ? (b as AuthBody) : {});
const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export const NETWORK_ERROR: FormError = {
  title: "REBORN est injoignable",
  message: "Vérifiez votre connexion internet, puis réessayez.",
};

const SERVER_ERROR: FormError = {
  title: "Service momentanément indisponible",
  message: "REBORN rencontre un problème de son côté. Réessayez dans un instant.",
};

const FOREIGN_ORIGIN: FormError = {
  title: "Demande refusée",
  message: "Le formulaire n'a pas été envoyé depuis REBORN. Rechargez la page, puis réessayez.",
};

export const FORGOTTEN_PASSWORD = "Mot de passe oublié ? Un administrateur REBORN peut vous transmettre un lien de réinitialisation.";

/** Connexion (POST /api/auth/sign-in/email). */
export function signInError(status: number, raw: unknown): FormError {
  const b = asBody(raw);
  if (status === 401) {
    return {
      title: "E-mail ou mot de passe incorrect",
      message: "Vérifiez l'adresse et le mot de passe (majuscules comprises). Après 8 essais infructueux en 15 minutes, le compte est bloqué 15 minutes.",
    };
  }
  if (status === 429 && b.code === "ACCOUNT_LOCKED") {
    return { title: "Compte temporairement bloqué", message: `${text(b.message) ?? "Trop de tentatives de connexion échouées pour ce compte. Réessayez plus tard."} ${FORGOTTEN_PASSWORD}` };
  }
  if (status === 429) return { title: "Trop de tentatives", message: "Patientez une minute avant de réessayer." };
  if (status === 403) return FOREIGN_ORIGIN;
  if (status === 400 && b.code === "INVALID_EMAIL") return { title: "Adresse e-mail invalide", message: "Vérifiez sa forme (exemple : prenom.nom@entreprise.fr).", fields: { email: "Adresse e-mail invalide." } };
  if (status >= 500) return SERVER_ERROR;
  return { title: "Connexion impossible", message: text(b.message) ?? "La connexion a échoué. Réessayez." };
}

const SIGN_UP_FIELD: Record<string, FieldName> = { email: "email", firstName: "firstName", lastName: "lastName", company: "company", password: "password" };

/** Inscription (POST /api/auth/sign-up/email). */
export function signUpError(status: number, raw: unknown): FormError {
  const b = asBody(raw);
  const code = typeof b.code === "string" ? b.code : "";
  const msg = text(b.message);
  if (code === "USER_ALREADY_EXISTS" || code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") {
    return {
      title: "Un compte existe déjà avec cette adresse",
      message: "Connectez-vous avec cette adresse, ou utilisez une autre adresse e-mail professionnelle.",
      fields: { email: "Un compte existe déjà avec cette adresse e-mail." },
    };
  }
  if (code === "PASSWORD_TOO_SHORT") return { title: "Mot de passe trop court", message: "Choisissez au moins 10 caractères.", fields: { password: "10 caractères au minimum." } };
  if (code === "PASSWORD_TOO_LONG") return { title: "Mot de passe trop long", message: "128 caractères au maximum.", fields: { password: "128 caractères au maximum." } };
  if (code === "INVALID_EMAIL") return { title: "Adresse e-mail invalide", message: "Vérifiez sa forme (exemple : prenom.nom@entreprise.fr).", fields: { email: "Adresse e-mail invalide." } };
  if (code === "CONSENT_REQUIRED") {
    return {
      title: "Consentements requis",
      message: msg ?? "Acceptez les conditions d'utilisation et confirmez avoir pris connaissance de la politique de confidentialité.",
      fields: { terms: "À cocher pour créer un compte.", privacy: "À cocher pour créer un compte." },
    };
  }
  if (code === "INVALID_FIELDS" && Array.isArray(b.issues)) {
    const fields: Partial<Record<FieldName, string>> = {};
    for (const i of b.issues as { path?: unknown; message?: unknown }[]) {
      const f = typeof i.path === "string" ? SIGN_UP_FIELD[i.path] : undefined;
      const m = text(i.message);
      if (f && m && !fields[f]) fields[f] = m;
    }
    return { title: "Formulaire à corriger", message: msg ?? "Certains champs sont à corriger.", fields };
  }
  if (status === 429) return { title: "Trop de tentatives", message: "Patientez une minute avant de réessayer." };
  if (status === 403) return FOREIGN_ORIGIN;
  if (status >= 500) return SERVER_ERROR;
  return { title: "Création du compte impossible", message: msg ?? "Réessayez dans un instant." };
}

/** Réinitialisation (POST /api/auth/reset-password). */
export function resetError(status: number, raw: unknown): FormError {
  const b = asBody(raw);
  const code = typeof b.code === "string" ? b.code : "";
  if (code === "INVALID_TOKEN" || code === "TOKEN_EXPIRED") {
    return {
      title: "Lien invalide, déjà utilisé ou expiré",
      message: "Chaque lien ne sert qu'une fois et expire au bout d'une heure. Demandez un nouveau lien à un administrateur REBORN.",
    };
  }
  if (code === "PASSWORD_TOO_SHORT") return { title: "Mot de passe trop court", message: "Choisissez au moins 10 caractères.", fields: { password: "10 caractères au minimum." } };
  if (code === "PASSWORD_TOO_LONG") return { title: "Mot de passe trop long", message: "128 caractères au maximum.", fields: { password: "128 caractères au maximum." } };
  if (status === 429) return { title: "Trop de tentatives", message: "Patientez une minute avant de réessayer." };
  if (status === 403) return FOREIGN_ORIGIN;
  if (status >= 500) return SERVER_ERROR;
  return { title: "Modification impossible", message: text(b.message) ?? "Réessayez dans un instant." };
}

/** Règles locales communes (mêmes bornes que le serveur : 10 à 128 caractères). */
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function checkEmail(v: string): string | null {
  if (!v.trim()) return "Indiquez votre adresse e-mail.";
  if (!EMAIL.test(v.trim())) return "Adresse e-mail invalide : vérifiez sa forme (exemple : prenom.nom@entreprise.fr).";
  return null;
}

export function checkNewPassword(pw: string): string | null {
  if (!pw) return "Choisissez un mot de passe.";
  if (pw.length < PASSWORD_MIN) return `10 caractères au minimum (actuellement ${pw.length}).`;
  if (pw.length > PASSWORD_MAX) return "128 caractères au maximum.";
  return null;
}

export function checkConfirmation(pw: string, confirm: string): string | null {
  if (!confirm) return "Saisissez à nouveau le mot de passe.";
  if (pw !== confirm) return "Les deux mots de passe ne sont pas identiques.";
  return null;
}

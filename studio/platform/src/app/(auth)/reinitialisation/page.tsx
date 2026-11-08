import type { Metadata } from "next";
import { ResetForm } from "./ResetForm";

export const metadata: Metadata = {
  title: "Nouveau mot de passe REBORN",
  description: "Choisissez un nouveau mot de passe pour votre compte REBORN.",
  referrer: "no-referrer",
};

/**
 * Réinitialisation du mot de passe avec un lien à usage unique (1 h) transmis par un administrateur
 * REBORN (`npm run account -- reset-link <email>`). Le jeton est dans le fragment (#token=…) : il
 * n'est jamais envoyé au serveur dans l'adresse ni journalisé, puis effacé de la barre d'adresse.
 */
export default function ReinitialisationPage() {
  return <ResetForm />;
}

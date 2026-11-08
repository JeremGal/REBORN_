import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { consentStatement, LEGAL_DOCUMENTS } from "@/lib/legal";
import { safeNextPath } from "@/components/shell/next-path";
import { getViewer } from "@/components/shell/session.server";
import { SignUpForm } from "./SignUpForm";

export const metadata: Metadata = {
  title: "Créer un compte REBORN",
  description: "Créez votre compte REBORN pour lancer la migration d'un logiciel historique.",
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Inscription. Déjà connecté : direction l'adresse de retour validée. */
export default async function InscriptionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = safeNextPath(first(sp.suite));
  const { viewer } = await getViewer();
  if (viewer) redirect(next);
  return (
    <SignUpForm
      next={next}
      terms={{ ...consentStatement("terms_acceptance"), path: LEGAL_DOCUMENTS.conditions.path, title: "conditions d'utilisation" }}
      privacy={{ ...consentStatement("privacy_acknowledgement"), path: LEGAL_DOCUMENTS.confidentialite.path, title: "politique de confidentialité" }}
    />
  );
}

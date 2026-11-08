import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isLoginReason, safeNextPath } from "@/components/shell/next-path";
import { getViewer } from "@/components/shell/session.server";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Se connecter à REBORN",
  description: "Connexion à votre espace REBORN : vos projets de migration.",
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Connexion à REBORN. Déjà connecté (session vérifiée en base) : direction l'adresse de retour
 * validée. La redirection se fait ici, après une vérification réelle, et non dans proxy.ts
 * (un cookie de session révoquée ferait sinon boucler les deux pages).
 */
export default async function ConnexionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = safeNextPath(first(sp.suite));
  const { viewer } = await getViewer();
  if (viewer) redirect(next);
  const reason = first(sp.raison);
  return <LoginForm next={next} reason={isLoginReason(reason) ? reason : null} />;
}

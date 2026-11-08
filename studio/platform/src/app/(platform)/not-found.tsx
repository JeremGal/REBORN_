import Link from "next/link";
import { buttonClasses } from "@/components/ds/styles";

/**
 * Page introuvable dans l'espace connecté (affichée dans le cadre, barre latérale comprise).
 * Aussi la réponse des pages de l'équipe REBORN pour un compte client : rien ne confirme qu'elles existent.
 */
export default function PlatformNotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-start gap-4 py-10">
      <p className="tabular font-mono text-small text-text-3">404</p>
      <h1 className="text-h1 font-semibold text-ink">Page introuvable</h1>
      <p className="text-body leading-relaxed text-text-2">Cette page n&apos;existe pas ou n&apos;est pas accessible avec votre compte. Vérifiez l&apos;adresse, ou repartez de vos projets.</p>
      <div className="flex flex-wrap gap-3">
        <Link href="/espace" className={buttonClasses({ variant: "primary" })}>
          Vue d&apos;ensemble
        </Link>
        <Link href="/projets" className={buttonClasses({ variant: "secondary" })}>
          Mes projets
        </Link>
      </div>
    </div>
  );
}

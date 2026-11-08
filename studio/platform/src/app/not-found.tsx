import Link from "next/link";
import { Wordmark } from "@/components/ds/Wordmark";
import { buttonClasses } from "@/components/ds/styles";

/**
 * Page introuvable (adresse inconnue, ou page réservée à l'équipe REBORN hors de l'espace connecté) :
 * en français, sans rien confirmer de l'existence d'une page protégée.
 */
export default function NotFound() {
  return (
    <main id="contenu" tabIndex={-1} className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center gap-4 px-4 py-12">
      <Link href="/" className="-mx-1 self-start rounded-control px-1 py-0.5">
        <Wordmark size="sm" />
      </Link>
      <p className="tabular mt-6 font-mono text-small text-text-3">404</p>
      <h1 className="text-h1 font-semibold text-ink">Page introuvable</h1>
      <p className="text-body leading-relaxed text-text-2">Cette adresse ne correspond à aucune page accessible. Vérifiez-la, ou repartez de l&apos;accueil.</p>
      <div className="flex flex-wrap gap-3">
        <Link href="/" className={buttonClasses({ variant: "primary" })}>
          Accueil
        </Link>
        <Link href="/espace" className={buttonClasses({ variant: "secondary" })}>
          Mon espace
        </Link>
      </div>
    </main>
  );
}

import Link from "next/link";
import { Wordmark } from "@/components/ds/Wordmark";
import { buttonClasses } from "@/components/ds/styles";
import { getViewer } from "@/components/shell/session.server";

/**
 * Site public (accueil, documents juridiques). Aucun sondage, aucune donnée de compte chargée côté
 * navigateur ; le serveur regarde seulement si une session valide existe pour adapter les liens.
 */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const { viewer } = await getViewer();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line">
        {/* Écran très étroit (320 px, zoom 400 %) : les deux liens passent sous le mot-symbole au lieu de déborder (WCAG 1.4.10). */}
        <div className="mx-auto flex min-h-16 w-full max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 sm:px-6 lg:px-8">
          <Link href="/" className="-mx-1 inline-flex min-h-11 items-center rounded-control px-1">
            <Wordmark size="sm" />
          </Link>
          <nav aria-label="Compte" className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1 sm:gap-2">
            {viewer ? (
              <Link href="/espace" className={buttonClasses({ variant: "primary", size: "sm" })}>
                Mon espace
              </Link>
            ) : (
              <>
                <Link href="/connexion" className={buttonClasses({ variant: "ghost", size: "sm" })}>
                  Se connecter
                </Link>
                <Link href="/inscription" className={buttonClasses({ variant: "secondary", size: "sm" })}>
                  Créer un compte
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main id="contenu" tabIndex={-1} className="flex-1">
        {children}
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-6 text-small text-text-3 sm:px-6 lg:px-8">
          <Wordmark size="sm" />
          <nav aria-label="Informations juridiques" className="flex flex-wrap gap-x-5 gap-y-1">
            <Link href="/legal/conditions" className="inline-flex min-h-6 items-center hover:text-ink hover:underline max-sm:min-h-11">
              Conditions d&apos;utilisation
            </Link>
            <Link href="/legal/confidentialite" className="inline-flex min-h-6 items-center hover:text-ink hover:underline max-sm:min-h-11">
              Politique de confidentialité
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

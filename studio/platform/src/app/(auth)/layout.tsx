import Link from "next/link";
import { Wordmark } from "@/components/ds/Wordmark";
import { Strata } from "@/components/shell/Strata";

/**
 * Pages d'entrée (connexion, inscription, réinitialisation).
 * Ordinateur : à gauche la marque (mot-symbole, message, présentation, strates restaurées), à droite
 * le formulaire. Mobile : le formulaire seul, précédé du mot-symbole.
 * Aucune donnée de compte n'est chargée ici (pas de RebornProvider, aucun sondage).
 */

const FACTS = [
  "Vos données historiques sont migrées puis vérifiées, contrôle par contrôle ; chaque écart est documenté.",
  "Les accès à votre ancien logiciel sont chiffrés et effacés au plus tard 24 heures après leur dépôt.",
  "Le logiciel livré fonctionne de façon autonome, sans dépendre de REBORN.",
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside aria-label="Présentation de REBORN" data-surface="dark" className="hidden bg-ink text-white lg:block">
        <div className="sticky top-0 flex min-h-dvh flex-col justify-between gap-10 px-12 py-10 xl:px-16 xl:py-12">
          <Link href="/" className="-mx-1 self-start rounded-control px-1 py-0.5">
            <Wordmark size="md" onDark />
          </Link>
          <div className="max-w-md">
            {/* Signature de la marque, en anglais (WCAG 3.1.2) */}
            <p lang="en" className="text-display font-semibold text-white">
              Your software. Reborn.
            </p>
            <p className="mt-4 text-lead leading-relaxed text-white/75">Transformez vos logiciels historiques en applications modernes, sans repartir de zéro.</p>
            <ul className="mt-8 flex flex-col gap-3.5">
              {FACTS.map((f) => (
                <li key={f} className="flex gap-3 text-body leading-relaxed text-white/75">
                  <span aria-hidden className="mt-2 h-0.5 w-3 shrink-0 bg-accent-bright" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
          <Strata onDark className="max-w-md text-white" />
        </div>
      </aside>

      <main id="contenu" tabIndex={-1} className="flex min-h-dvh flex-col px-4 pt-6 pb-8 sm:px-8">
        <div className="lg:hidden">
          <Link href="/" className="-mx-1 inline-block rounded-control px-1 py-0.5">
            <Wordmark size="sm" />
          </Link>
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}</div>
        <footer className="mx-auto flex w-full max-w-sm flex-wrap gap-x-5 gap-y-1 text-meta text-text-3">
          <Link href="/legal/conditions" className="inline-flex min-h-6 items-center hover:text-ink hover:underline max-sm:min-h-11">
            Conditions d&apos;utilisation
          </Link>
          <Link href="/legal/confidentialite" className="inline-flex min-h-6 items-center hover:text-ink hover:underline max-sm:min-h-11">
            Politique de confidentialité
          </Link>
          <Link href="/" className="inline-flex min-h-6 items-center hover:text-ink hover:underline max-sm:min-h-11">
            Accueil
          </Link>
        </footer>
      </main>
    </div>
  );
}

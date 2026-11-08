import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/ds/Badge";
import { buttonClasses } from "@/components/ds/styles";
import type { Tone } from "@/components/ds/styles";
import { LEGAL_DOCUMENTS } from "@/lib/legal";
import { Strata } from "@/components/shell/Strata";
import { getViewer } from "@/components/shell/session.server";

export const metadata: Metadata = {
  title: "REBORN — Vos logiciels historiques, remis à neuf",
  description: "Transformez vos logiciels historiques en applications modernes, sans repartir de zéro.",
};

/**
 * Accueil public. Les six étapes sont présentées dans l'ordre RÉEL du parcours de l'espace client (Connexion,
 * Découverte, Données, Correspondances, Migration, Validation, Reconstruction, Livraison : SPEC §10.3), avec les
 * mêmes noms et leur état RÉEL : l'exploration et l'analyse par les agents sont en cours d'intégration ; import de
 * fichiers, correspondances, migration, vérification, reconstruction et livraison sont opérationnels.
 * Aucune capacité annoncée à tort.
 */

const STAGES: { title: string; text: string; status: string; tone: Tone }[] = [
  {
    title: "Connexion",
    text: "Vous créez un projet, autorisez l'accès à votre ancien logiciel ou déposez directement ses exports (CSV, Excel, JSON, export SQL, SQLite, ZIP).",
    status: "Import de fichiers disponible",
    tone: "ok",
  },
  {
    title: "Découverte",
    text: "Un agent parcourt l'ancien logiciel comme le ferait un utilisateur, en lecture seule : écrans, champs, fonctions.",
    status: "En cours d'intégration",
    tone: "neutral",
  },
  {
    title: "Données et correspondances",
    text: "Les exports sont conservés tels quels, puis chaque champ de l'ancien logiciel est relié au nouveau. Les correspondances incertaines vous sont soumises ; l'agent d'analyse qui les proposera est en cours d'intégration.",
    status: "Opérationnel",
    tone: "ok",
  },
  {
    title: "Migration et vérification",
    text: "Les données historiques sont transformées, chargées puis contrôlées. Chaque écart est documenté, et vous décidez avant la mise en service.",
    status: "Opérationnel",
    tone: "ok",
  },
  {
    title: "Reconstruction",
    text: "Le nouveau logiciel est généré à partir du modèle métier validé, rejoué sur votre historique : écrans, règles de calcul, comptes utilisateurs.",
    status: "Opérationnel",
    tone: "ok",
  },
  {
    title: "Livraison",
    text: "Le logiciel est mis en service avec vos données. Il fonctionne de façon autonome, avec ses propres comptes, sans dépendre de REBORN.",
    status: "Opérationnel",
    tone: "ok",
  },
];

const TRUST = [
  {
    title: "Vos accès restent sous contrôle",
    text: "Les identifiants de l'ancien logiciel sont chiffrés, jamais affichés, et effacés au plus tard 24 heures après leur dépôt, ou dès que vous le demandez.",
  },
  {
    title: "Rien n'est arrondi ni masqué",
    text: "Contrôles réussis, contrôles en échec, écarts : le rapport de migration montre tout, avec les chiffres exacts.",
  },
  {
    title: "Rien ne démarre sans vous",
    text: "Chaque étape se lance depuis votre espace. Les points qui demandent une décision vous sont soumis avant la migration.",
  },
];

export default async function Home() {
  const { viewer } = await getViewer();
  const start = viewer ? "/projets/nouveau" : `/inscription?suite=${encodeURIComponent("/projets/nouveau")}`;
  const access = viewer ? "/espace" : "/connexion";

  return (
    <>
      <section aria-labelledby="accueil-titre" className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pt-14 pb-16 sm:px-6 md:pt-20 md:pb-24 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:px-8">
        <div className="max-w-2xl">
          {/* Signature de la marque, en anglais : langue déclarée pour la synthèse vocale (WCAG 3.1.2) */}
          <h1 id="accueil-titre" lang="en" className="text-display font-semibold text-ink">
            Your software. Reborn.
          </h1>
          <p className="mt-5 max-w-xl text-h3 leading-relaxed font-normal text-text-2">Transformez vos logiciels historiques en applications modernes, sans repartir de zéro.</p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link href={start} className={buttonClasses({ variant: "primary", size: "lg" })}>
              Commencer une migration
            </Link>
            <Link href={access} className={buttonClasses({ variant: "secondary", size: "lg" })}>
              Accéder à mes projets
            </Link>
          </div>
          {!viewer && (
            <p className="mt-4 text-small text-text-2">
              Déjà un compte ?{" "}
              <Link href="/connexion" className="ds-link">
                Se connecter
              </Link>
            </p>
          )}
        </div>
        <Strata className="hidden max-w-md justify-self-end text-ink lg:block" />
      </section>

      <section aria-labelledby="etapes-titre" className="border-t border-line bg-surface">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="max-w-2xl">
            <h2 id="etapes-titre" className="text-h1 font-semibold text-ink">
              De l&apos;ancien logiciel au nouveau, en six étapes
            </h2>
            <p className="mt-3 text-lead leading-relaxed text-text-2">Chaque étape affiche son état réel. Ce qui n&apos;est pas encore disponible est indiqué comme tel.</p>
          </div>
          <ol className="mt-12 grid gap-x-10 gap-y-0 md:grid-cols-2 lg:grid-cols-3">
            {STAGES.map((s, i) => (
              <li key={s.title} className="flex flex-col gap-2 border-t border-line-strong py-6 pr-2">
                <p aria-hidden className="font-mono text-small text-text-3">
                  <span className="tabular">{String(i + 1).padStart(2, "0")}</span>
                </p>
                <h3 className="text-h3 font-semibold text-ink">{s.title}</h3>
                <p className="text-body leading-relaxed text-text-2">{s.text}</p>
                <StatusBadge tone={s.tone} className="mt-1 self-start">
                  {s.status}
                </StatusBadge>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="confiance-titre" className="border-t border-line">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:px-8 lg:py-20">
          <div>
            <h2 id="confiance-titre" className="text-h1 font-semibold text-ink">
              Vos données, vos décisions
            </h2>
            <p className="mt-3 text-body leading-relaxed text-text-2">
              Le détail est dans la{" "}
              <Link href={LEGAL_DOCUMENTS.confidentialite.path} className="ds-link">
                politique de confidentialité
              </Link>
              .
            </p>
          </div>
          <ul className="grid gap-8 sm:grid-cols-3 sm:gap-6">
            {TRUST.map((t) => (
              <li key={t.title} className="flex flex-col gap-2">
                <span aria-hidden className="h-0.5 w-6 bg-accent" />
                <h3 className="text-lead font-semibold text-ink">{t.title}</h3>
                <p className="text-body leading-relaxed text-text-2">{t.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}

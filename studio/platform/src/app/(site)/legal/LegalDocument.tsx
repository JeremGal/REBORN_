import Link from "next/link";
import type { ReactNode } from "react";
import { Alert } from "@/components/ds/Alert";
import { DRAFT_NOTICE, type LegalDocument as Doc } from "@/lib/legal";

/**
 * Mise en page commune des documents juridiques : titre, version et date d'effet visibles, bandeau
 * « Document de travail », sommaire, sections numérotées (h2) avec ancres stables.
 * Aucune affirmation de conformité : le contenu décrit ce que fait réellement le Studio.
 */

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

const dateFr = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function LegalDocument({ doc, intro, sections, related }: { doc: Doc; intro: ReactNode; sections: LegalSection[]; related: { href: string; label: string } }) {
  return (
    <article className="mx-auto w-full max-w-3xl px-4 pt-10 pb-20 sm:px-6 lg:pt-14">
      <header className="flex flex-col gap-4">
        <h1 className="text-h1 font-semibold text-ink">{doc.title}</h1>
        <p className="tabular text-small text-text-2">
          Version {doc.version}, en vigueur depuis le {dateFr(doc.effective)}
        </p>
        <Alert tone="warn" live="off">
          <span className="font-semibold text-ink">{DRAFT_NOTICE}</span>
        </Alert>
        <div className="text-body leading-relaxed text-text-2">{intro}</div>
      </header>

      <nav aria-label="Sommaire" className="mt-8 rounded-panel bg-surface-sunken/70 px-5 py-4">
        <p className="text-small font-semibold text-ink">Sommaire</p>
        <ol className="mt-2 grid list-decimal gap-x-8 gap-y-1 pl-5 text-small text-text-2 sm:grid-cols-2">
          {sections.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="ds-link inline-flex min-h-6 items-center max-sm:min-h-11">
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-10 flex flex-col gap-10">
        {sections.map((s, i) => (
          <section key={s.id} id={s.id} aria-labelledby={`${s.id}-titre`} className="scroll-mt-6">
            <h2 id={`${s.id}-titre`} className="text-h3 font-semibold text-ink">
              {i + 1}. {s.title}
            </h2>
            <div className="mt-3 flex flex-col gap-3 text-body leading-relaxed text-text-2 [&_li]:pl-1 [&_strong]:font-semibold [&_strong]:text-ink [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-1.5 [&_ul]:pl-5">{s.body}</div>
          </section>
        ))}
      </div>

      <footer className="mt-14 border-t border-line pt-6 text-small text-text-2">
        Voir aussi :{" "}
        <Link href={related.href} className="ds-link">
          {related.label}
        </Link>
      </footer>
    </article>
  );
}

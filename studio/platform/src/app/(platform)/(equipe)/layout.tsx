import { requireOperator } from "@/components/shell/session.server";

/**
 * Pages de l'équipe REBORN (atelier découverte & règles, design system) : rôle opérateur exigé,
 * vérifié en base. Un compte client reçoit la même réponse qu'une page inexistante (404).
 * Les routes d'API de l'atelier ont leur propre contrôle (lot B1) : ce layout n'en dispense pas.
 */
export default async function TeamLayout({ children }: { children: React.ReactNode }) {
  await requireOperator();
  return children;
}

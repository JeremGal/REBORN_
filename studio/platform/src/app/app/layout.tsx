import type { Metadata } from "next";
import { RebornProvider } from "@/components/RebornProvider";
import { requireOperator } from "@/components/shell/session.server";

export const metadata: Metadata = {
  title: "Application reconstruite",
  description: "Application métier générée par REBORN à partir du modèle découvert.",
};

/**
 * Aperçu de l'application reconstruite (atelier) : réservé à l'équipe REBORN, session et rôle vérifiés
 * en base (un compte client reçoit une 404). L'application livrée a sa propre identité visuelle,
 * indépendante de la plateforme REBORN.
 */
export default async function DeliveredAppLayout({ children }: { children: React.ReactNode }) {
  await requireOperator();
  return (
    <RebornProvider>
      <div className="min-h-screen bg-ga-bg font-app text-ga-ink">{children}</div>
    </RebornProvider>
  );
}

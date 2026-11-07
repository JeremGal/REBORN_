import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Application reconstruite",
  description: "Application métier générée par REBORN à partir du modèle découvert.",
};

/** L'application livrée a sa propre identité visuelle, indépendante de la plateforme REBORN. */
export default function DeliveredAppLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-ga-bg font-app text-ga-ink">{children}</div>;
}

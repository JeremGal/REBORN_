import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Instrument_Sans } from "next/font/google";
import { SkipLink } from "@/components/ds/SkipLink";
import "./globals.css";

// Interface : Instrument Sans (variable, graisses 400 à 700)
const ui = Instrument_Sans({ subsets: ["latin"], variable: "--font-ui" });
// Identifiants, valeurs techniques, curseur du mot-symbole
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono" });
// Police de l'application générée (identité distincte de la plateforme), chargée à la demande
const appSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-plex-sans", preload: false });

export const metadata: Metadata = {
  title: "REBORN",
  description: "Comprendre, documenter et reconstruire un logiciel métier sans accéder à son code source.",
};

/**
 * Layout racine : polices, langue, lien d'évitement. Pas de fournisseur de données ici
 * (RebornProvider est monté par les layouts qui en ont besoin : (platform) et /app).
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${ui.variable} ${mono.variable} ${appSans.variable}`}>
      <body>
        <SkipLink />
        {children}
      </body>
    </html>
  );
}

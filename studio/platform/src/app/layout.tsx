import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Lato } from "next/font/google";
import { RebornProvider } from "@/components/RebornProvider";
import "./globals.css";

const lato = Lato({ subsets: ["latin"], weight: ["400", "700", "900"], variable: "--font-lato" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono" });
// Police de l'application générée (identité distincte de la plateforme)
const appSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-plex-sans" });

export const metadata: Metadata = {
  title: "REBORN — Autonomous Software Archaeologist",
  description: "Comprendre, documenter et reconstruire un logiciel métier sans accéder à son code source.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${lato.variable} ${mono.variable} ${appSans.variable}`}>
      <body>
        <RebornProvider>{children}</RebornProvider>
      </body>
    </html>
  );
}

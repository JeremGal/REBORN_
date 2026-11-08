import type { Metadata } from "next";
import { Overview } from "./Overview";

export const metadata: Metadata = {
  title: "Vue d'ensemble — REBORN",
};

/** Vue d'ensemble de l'espace connecté (session vérifiée par le layout). */
export default function EspacePage() {
  return <Overview />;
}

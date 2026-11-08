import type { Metadata } from "next";
import { ProjectList } from "@/components/shell/ProjectList";

export const metadata: Metadata = {
  title: "Mes projets — REBORN",
};

/** Mes projets : liste avec recherche, filtre par état et tri (session vérifiée par le layout). */
export default function ProjetsPage() {
  return <ProjectList />;
}

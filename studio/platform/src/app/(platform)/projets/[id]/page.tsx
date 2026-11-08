"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ds/Progress";
import { useReborn } from "@/components/RebornProvider";
import { useProject } from "@/components/project/ProjectProvider";
import { journey, nextAction } from "@/components/shell/journey";

/**
 * Racine d'un projet (/projets/MIG_…, liens de l'Activité) : ouvre l'étape utile, la même que « Mes projets »
 * et la vue d'ensemble (nextAction : intervention à faire, sinon prochaine étape, Livraison pour un logiciel
 * livré), au lieu de toujours ouvrir la Connexion. Projet introuvable : ProjectShell l'affiche (même réponse
 * que l'API pour un projet inexistant ou d'un autre compte).
 */
export default function ProjectIndex() {
  const { id, summary, details } = useProject();
  const { state } = useReborn();
  const router = useRouter();
  const investigations = state?.investigations?.filter((i) => i.project_id === id).length ?? 0;
  const slug = summary ? nextAction(summary, journey(summary, investigations, details)).slug : null;
  useEffect(() => {
    if (slug) router.replace(`/projets/${id}/${slug}`);
  }, [slug, id, router]);
  return <Skeleton lines={3} label="Ouverture du projet…" />;
}

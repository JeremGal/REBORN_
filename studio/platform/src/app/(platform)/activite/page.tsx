import type { Metadata } from "next";
import { Activity } from "./Activity";

export const metadata: Metadata = {
  title: "Activité — REBORN",
};

/** Chronologie des évènements réels des projets du compte (session vérifiée par le layout). */
export default function ActivitePage() {
  return <Activity />;
}

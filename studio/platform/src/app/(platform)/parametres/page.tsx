import type { Metadata } from "next";
import { connection } from "next/server";
import { PRIVACY_CONTACT_MISSING, privacyContact } from "@/lib/legal";
import { Settings } from "./Settings";

export const metadata: Metadata = {
  title: "Paramètres — REBORN",
};

/** Paramètres du compte : profil, sécurité, confidentialité (contact lu côté serveur). */
export default async function ParametresPage() {
  await connection();
  return <Settings privacyContact={privacyContact()} contactMissing={PRIVACY_CONTACT_MISSING} />;
}

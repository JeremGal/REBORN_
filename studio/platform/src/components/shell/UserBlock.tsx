"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ds/Button";
import { Badge } from "@/components/ds/Badge";
import { useToast } from "@/components/ds/Toast";
import { loginPath } from "./next-path";
import { displayName, useShell } from "./context";

/**
 * Déconnexion de REBORN (session de ce navigateur supprimée côté serveur), puis rechargement complet
 * sur la page de connexion : aucun état du compte ne reste en mémoire.
 */
export async function signOut(): Promise<void> {
  const r = await fetch("/api/auth/sign-out", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  if (!r.ok && r.status !== 401) throw new Error(`HTTP ${r.status}`);
  window.location.assign(loginPath(null, "deconnexion"));
}

const initials = (first: string, last: string, email: string) => ((first[0] ?? "") + (last[0] ?? "")).toUpperCase() || email.slice(0, 2).toUpperCase();

export function UserBlock() {
  const { user } = useShell();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const name = displayName(user);

  async function onSignOut() {
    setBusy(true);
    try {
      await signOut();
    } catch (e) {
      setBusy(false);
      toast({
        tone: "bad",
        title: "Déconnexion impossible",
        description: e instanceof TypeError ? "REBORN ne répond pas : vérifiez votre connexion internet, puis réessayez." : "Le serveur a refusé la demande. Rechargez la page, puis réessayez.",
      });
    }
  }

  return (
    <div className="flex flex-col gap-2 px-1">
      <div className="flex min-w-0 items-center gap-2.5">
        <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-small font-semibold text-white">
          {initials(user.firstName, user.lastName, user.email)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-body font-semibold text-ink" title={name}>
            {name}
          </p>
          <p className="truncate text-meta text-text-3" title={user.company ?? user.email}>
            {user.company ?? user.email}
          </p>
        </div>
      </div>
      {user.role === "operator" && (
        <Badge tone="neutral" className="self-start">
          Équipe REBORN
        </Badge>
      )}
      <Button variant="ghost" size="sm" icon={<LogOut size={15} />} loading={busy} loadingText="Déconnexion…" onClick={onSignOut} className="justify-start self-start">
        Se déconnecter
      </Button>
    </div>
  );
}

import { AppShell } from "@/components/AppShell";
import { RebornProvider } from "@/components/RebornProvider";
import { ToastProvider } from "@/components/ds/Toast";
import { requireViewer } from "@/components/shell/session.server";

/**
 * Espace connecté (SPEC §10.3). Server Component : la session est vérifiée EN BASE avant tout rendu
 * (sinon redirection vers /connexion?suite=… ; proxy.ts n'a fait qu'une redirection optimiste).
 * RebornProvider (synchronisation) n'est monté qu'ici et sur /app : aucun sondage avant la connexion.
 * La vraie barrière reste l'API : chaque route vérifie le compte et la propriété du projet.
 */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const { user, sessionId } = await requireViewer();
  return (
    <RebornProvider>
      <ToastProvider>
        <AppShell user={user} sessionId={sessionId}>
          {children}
        </AppShell>
      </ToastProvider>
    </RebornProvider>
  );
}

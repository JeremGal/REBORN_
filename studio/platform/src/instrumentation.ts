/**
 * Démarrage du serveur Studio (Next 16 : register() appelé une fois par processus, jamais pendant
 * `next build`). Balayage des identifiants de l'ancien logiciel et des missions d'analyse (SPEC §5, §6) :
 * au démarrage puis toutes les 60 s — identifiants échus (24 h) effacés même si personne ne revient,
 * jetons expirés, clés orphelines, prêts expirés. Minuterie `unref` (n'empêche pas l'arrêt), une seule par
 * processus (garde globalThis : rechargement à chaud). La branche est retirée de la compilation Edge.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startSweeper } = await import("./lib/migration/analysis");
    startSweeper();
  }
}

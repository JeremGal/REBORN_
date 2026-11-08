/**
 * Démarrage du serveur Studio (Next 16 : register() appelé une fois par processus, jamais pendant
 * `next build`). Balayage des identifiants de l'ancien logiciel et des missions d'analyse (SPEC §5, §6) :
 * au démarrage puis toutes les 60 s — identifiants échus (24 h) effacés même si personne ne revient,
 * jetons expirés, clés orphelines, prêts expirés. Minuterie `unref` (n'empêche pas l'arrêt), une seule par
 * processus (garde globalThis : rechargement à chaud). La branche est retirée de la compilation Edge.
 *
 * Vercel : seul /tmp est inscriptible (et il est propre à chaque instance) ; données, clés et logiciels
 * livrés y vont si aucun dossier n'est imposé. Comptes de départ créés depuis les variables REBORN_SEED_*
 * (lib/auth/seed.ts).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.VERCEL && !process.env.REBORN_DATA_DIR) {
      process.env.REBORN_DATA_DIR = "/tmp/reborn/data";
      process.env.REBORN_APPS_DIR ??= "/tmp/reborn/apps";
    }
    const { startSweeper } = await import("./lib/migration/analysis");
    startSweeper();
    const { seedAccounts } = await import("./lib/auth/seed");
    await seedAccounts().catch((e) => console.warn(`[reborn] comptes : création au démarrage impossible (${e instanceof Error ? e.message.slice(0, 200) : "erreur"})`));
  }
}

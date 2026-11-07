import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Le store vit en mémoire dans le process Node : on reste sur un seul serveur.
  devIndicators: false,
  // Mode réseau (npm run dev:lan) : IP du poste fournies par scripts/dev.mjs, pour que le
  // dashboard ouvert depuis un autre poste charge ses ressources de développement.
  ...(process.env.REBORN_DEV_ORIGINS ? { allowedDevOrigins: process.env.REBORN_DEV_ORIGINS.split(",").filter(Boolean) } : {}),
  // Journal du terminal lisible pendant la démo : les interrogations de synchronisation
  // (plusieurs par seconde et par onglet) ne sont pas journalisées.
  logging: {
    incomingRequests: {
      ignore: [/\/api\/(revision|state|health)\b/, /\/api\/investigations\?active=/, /\/api\/events\?.*type=experiment_request/],
    },
  },
  // Un package-lock.json existe plus haut dans l'arborescence : on fixe la racine.
  turbopack: { root: process.cwd() },
};

export default nextConfig;

import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: ["src/**/*.test.ts"],
    // Suite d'intégration (vrais processus, vrai chiffrement, délai constant de 250 ms sur chaque échec de
    // connexion) : 15 s par test au lieu de 5 s, pour qu'une machine chargée ne fasse pas échouer un test lent
    // mais correct (les plus longs durent ~2,5 s). Aucun contrôle n'en dépend.
    testTimeout: 15_000,
  },
});

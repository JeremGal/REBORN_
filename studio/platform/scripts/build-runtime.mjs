// Copie le moteur de règles de REBORN (src/lib/engine + types) dans le runtime du logiciel livré,
// transpilé en JavaScript sans dépendance : le Studio et le logiciel livré exécutent le même code.
// Un test (migration.test.ts « Runtime du logiciel livré ») vérifie que les copies sont à jour.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HEADER = (src) => `// GÉNÉRÉ depuis platform/${src} — ne pas modifier (npm --prefix platform run runtime)\n`;

/** Modules copiés dans runtime/lib/engine/ (les imports relatifs sont réécrits en ./<nom>.mjs). */
export const ENGINE_MODULES = {
  "types.mjs": "src/lib/types.ts",
  "expr.mjs": "src/lib/engine/expr.ts",
  "describe.mjs": "src/lib/engine/describe.ts",
  "inputs.mjs": "src/lib/engine/inputs.ts",
  "engine.mjs": "src/lib/engine/engine.ts",
  "bindings.mjs": "src/lib/engine/bindings.ts",
};

function transpile(rel) {
  const src = fs.readFileSync(path.join(root, rel), "utf8");
  const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, removeComments: false, verbatimModuleSyntax: false } }).outputText;
  return out.replace(/from "(\.\.?\/[^"]+)"/g, (_, spec) => `from "./${path.basename(spec)}.mjs"`);
}

/** Contenu attendu de chaque fichier généré (chemin relatif au runtime → texte). */
export function runtimeFiles() {
  const files = { "lib/expr.mjs": HEADER("src/lib/engine/expr.ts") + transpile("src/lib/engine/expr.ts") };
  for (const [name, rel] of Object.entries(ENGINE_MODULES)) files[`lib/engine/${name}`] = HEADER(rel) + transpile(rel);
  return files;
}

/** Compatibilité : ancien point d'entrée utilisé par les tests. */
export const transpileExpr = () => runtimeFiles()["lib/expr.mjs"];

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const [rel, content] of Object.entries(runtimeFiles())) {
    fs.mkdirSync(path.dirname(path.join(root, "runtime", rel)), { recursive: true });
    fs.writeFileSync(path.join(root, "runtime", rel), content);
    console.log(`runtime/${rel} à jour`);
  }
}

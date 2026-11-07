// Copie l'évaluateur d'expressions sûr de REBORN (src/lib/engine/expr.ts) dans le runtime du
// logiciel livré, transpilé en JavaScript : les règles s'exécutent à l'identique dans les deux.
// Un test (runtime.test.ts) vérifie que la copie est à jour.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export function transpileExpr() {
  const src = fs.readFileSync(path.join(root, "src/lib/engine/expr.ts"), "utf8");
  const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, removeComments: false } }).outputText;
  return `// GÉNÉRÉ depuis platform/src/lib/engine/expr.ts — ne pas modifier (npm --prefix platform run runtime)\n${out}`;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(path.join(root, "runtime/lib/expr.mjs"), transpileExpr());
  console.log("runtime/lib/expr.mjs à jour");
}

// Test helpers: work on throwaway copies of real targets, so a test can break a card without touching the repository.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Copies targets/<names> into a temp folder and points the tools at it (REBORN_TARGETS_DIR) and at an empty evidence store.
export function sandbox(...names) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reborn-test-"));
  for (const n of names.length ? names : ["gnucash"]) fs.cpSync(path.join(ROOT, "targets", n), path.join(dir, "targets", n), { recursive: true });
  process.env.REBORN_TARGETS_DIR = path.join(dir, "targets");
  process.env.REBORN_EVIDENCE_DIR = path.join(dir, "evidence");
  const t = (n) => path.join(dir, "targets", n);
  return {
    dir,
    root: t(names[0] ?? "gnucash"),
    targetRoot: t,
    evidence: path.join(dir, "evidence"),
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

export function edit(file, fn) {
  fs.writeFileSync(file, fn(fs.readFileSync(file, "utf8")));
}

export const inv = (root, rel) => path.join(root, "02-investigation", rel);

export async function lib(name) {
  return import(new URL(`../tools/lib/${name}.mjs`, import.meta.url));
}

export const errorsOf = (r) => r.errors.join("\n");

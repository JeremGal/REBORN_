// Loads every YAML file of a target and tells which contract each one follows.
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { targetDir, targetsRoot } from "./config.mjs";

const RULES = [
  [/^target\.yaml$/, "target"],
  [/^01-exploration\/missions\/[^/]+\.ya?ml$/, "mission"],
  [/^01-exploration\/runs\/[^/]+\/run\.ya?ml$/, "run"],
  [/^01-exploration\/observations\.ya?ml$/, "observations"],
  [/^02-investigation\/features\/[^/]+\.ya?ml$/, "feature"],
  [/^02-investigation\/rules\/[^/]+\.ya?ml$/, "rule"],
  [/^02-investigation\/screens\/[^/]+\.ya?ml$/, "screen"],
  [/^02-investigation\/domain\/[^/]+\.ya?ml$/, "entity"],
  [/^02-investigation\/unknowns\.ya?ml$/, "unknowns"],
  [/^02-investigation\/evidence\/index\.ya?ml$/, "evidence-index"],
  [/^03-reconstruction\/parity\/[^/]+\.ya?ml$/, "parity-report"],
];

export function listTargets() {
  const dir = targetsRoot();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("_") && !d.name.startsWith("."))
    .map((d) => d.name);
}

function walk(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, base, out);
    else if (/\.ya?ml$/.test(e.name)) out.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return out;
}

export function loadTarget(target) {
  const root = targetDir(target);
  if (!fs.existsSync(root)) throw new Error(`Unknown target: ${target} (no targets/${target})`);
  const docs = [];
  for (const rel of walk(root)) {
    const kind = RULES.find(([re]) => re.test(rel))?.[1] ?? null;
    let data = null;
    let parseError = null;
    try {
      data = YAML.parse(fs.readFileSync(path.join(root, rel), "utf8"));
    } catch (e) {
      parseError = e.message;
    }
    docs.push({ rel, kind, data, parseError });
  }
  const of = (k) => docs.filter((d) => d.kind === k && d.data).map((d) => d.data);
  const first = (k) => of(k)[0] ?? null;
  return {
    target,
    root,
    docs,
    meta: first("target"),
    missions: of("mission"),
    runs: of("run"),
    observations: first("observations")?.observations ?? [],
    features: of("feature"),
    rules: of("rule"),
    screens: of("screen"),
    entities: of("entity"),
    unknowns: first("unknowns")?.unknowns ?? [],
    evidence: first("evidence-index")?.entries ?? [],
    parity: of("parity-report"),
  };
}

// Guards that keep the clean room and the legal basis enforced by code instead of by good intentions.
import fs from "node:fs";
import path from "node:path";
import { evidenceDir } from "./config.mjs";

// REA commands that stay open on any target: they read what a program ships (resources, imports, exports, data files,
// installer contents) or inspect web pages and documents. Everything else may read code, so it needs a legal basis that
// allows deep analysis. Deny by default: a command REA adds later is blocked until someone lists it here.
const REA_OPEN = [
  /^inspect-pe-(imports|resources|certificates|load-config)$/,
  /^inspect-native-exports$/,
  /^inspect-(desktop-application|managed-artifact|go-binary|rust-binary|artifact|sqlite-database)$/,
  /^extract-artifact$/,
  /^inspect-web-[a-z-]+$/,
  /^list-[a-z-]+$/,
  /^(doctor|providers|capabilities|inspect-analysis-view|export-web-scripts|analyze-javascript-application)$/,
];
export const reaNeedsDeep = (command) => !REA_OPEN.some((re) => re.test(command));

// Craft Anything: clean room unless Deep mode was explicitly requested (and allowed). Without the flag, Craft follows its own
// global Settings, and an old "Ghidra enabled" setting is migrated to Deep mode, so a closed target could be read by accident.
export function craftModeArgs(args) {
  return args.includes("--deep") || args.includes("--clean-room") ? args : [...args, "--clean-room"];
}

// ---- clean-room leak scan ----
// Names of functions and symbols the investigation read out of the original program. They live in the local, gitignored
// evidence store. Nothing that block 3 receives may contain one of them.
const IDENT = /^[A-Za-z_][A-Za-z0-9_]{5,}$/;
const looksLikeSymbol = (s) => IDENT.test(s) && (/_/.test(s) || /[a-z][A-Z]/.test(s)) && !/^(ev|rb)_/.test(s);

// Only names of code (functions, procedures, symbols) are leak terms. Database column and table names are part of the data
// model block 3 must reproduce (the migration map needs them), so names the entity cards declare are allowed.
export function leakTerms(target, allowed = new Set()) {
  const terms = new Set();
  const dir = evidenceDir(target);
  const take = (v) => { if (typeof v === "string" && looksLikeSymbol(v)) terms.add(v); };
  const walk = (o) => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) { if (["name", "procedure", "symbol", "function", "callee", "caller"].includes(k)) take(v); walk(v); }
    else if (typeof o === "string") take(o);
  };
  for (const sub of ["rea", "craft"]) {
    const d = path.join(dir, sub);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) {
      const codeOutput = sub === "rea" ? /native/i.test(f) : /feature-find|function|decompile|xref|call-path|study/i.test(f);
      if (!codeOutput || !f.endsWith(".json")) continue;
      const file = path.join(d, f);
      if (fs.statSync(file).size > 80 * 1024 * 1024) continue;
      try { walk(JSON.parse(fs.readFileSync(file, "utf8"))); } catch { /* unreadable evidence file: skip */ }
    }
  }
  for (const a of allowed) terms.delete(a);
  return terms;
}

// Names the cards declare on purpose: tables and columns of the data model.
export function declaredDataNames(entities) {
  return new Set(entities.flatMap((e) => [e.storage?.observed_table, ...(e.fields || []).flatMap((f) => [f.observed_as, f.name])]).filter(Boolean));
}

export function scanLeaks(text, terms) {
  const hits = new Set();
  for (const t of terms) if (text.includes(t)) hits.add(t);
  return [...hits];
}

// Evidence references are kept with the kind of proof they are; the free text about where inside the original they were
// found (locator, note) is not. basisOf(ref) tells the kind of proof.
export function scrubEvidence(value, basisOf) {
  if (Array.isArray(value)) return value.map((v) => scrubEvidence(v, basisOf));
  if (value && typeof value === "object") {
    if (typeof value.ref === "string" && typeof value.kind === "string") return { ref: value.ref, kind: value.kind, ...(basisOf ? { basis: basisOf(value) } : {}) };
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrubEvidence(v, basisOf)]));
  }
  return value;
}

// Throws when text meant for block 3 contains an identifier read out of the original program.
export function assertNoLeak(target, text, what, entities = []) {
  const hits = scanLeaks(text, leakTerms(target, declaredDataNames(entities)));
  if (hits.length) {
    throw new Error(`${what} contains ${hits.length} identifier(s) read out of the original program (${hits.slice(0, 5).join(", ")}${hits.length > 5 ? ", ..." : ""}). Describe the behaviour instead and remove them from the cards. The raw names stay in the local evidence store.`);
  }
}

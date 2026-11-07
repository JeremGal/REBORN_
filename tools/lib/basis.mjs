// What KIND of proof a piece of evidence is. A claim is only as strong as the variety of its proofs: two tools that read
// the same binary are one proof, not two (REA grades this as "authority", Craft Anything as "confidence").
//
//   runtime        an observation of the program running (agent run, observation, screenshot)
//   shipped-data   exact data the program ships (SQL create script, UI definition files, resource tables, a database file)
//   static-code    reading or decompiling the program's code (Ghidra, Craft Deep mode, strings, function search)
//   documentation  the vendor's manual or public pages
//
// The basis is derived from the tool and operation that produced an index entry, so it cannot drift from the evidence.
// An index entry may override it with `basis:` when the derivation is wrong for a specific capture.
export const BASES = ["runtime", "shipped-data", "static-code", "documentation"];

const RUNTIME_KINDS = new Set(["h-run", "observation", "screenshot"]);

export function basisOfEntry(entry) {
  if (!entry) return "static-code";
  if (BASES.includes(entry.basis)) return entry.basis;
  const tool = String(entry.tool ?? "");
  const op = String(entry.operation ?? "");
  if (/^(reborn-schema|reborn-ui)$/.test(tool)) return "shipped-data";
  if (/^(crawl4ai|linkup|reborn-doc)$/.test(tool)) return "documentation";
  if (tool === "ghidra-mcp" || tool === "craft-anything") return "static-code";
  if (tool === "rea-agents") {
    if (/^(analyze|decompile|function|trace|search|xrefs|instructions|analyze-javascript-application|export-web-scripts|native-session)/.test(op)) return "static-code";
    return "shipped-data";
  }
  return "static-code";
}

// Basis of one evidence reference of a card: runtime kinds are runtime by nature; the others follow their index entry.
export function basisOfRef(ref, entryById) {
  if (RUNTIME_KINDS.has(ref.kind)) return "runtime";
  return basisOfEntry(entryById.get(ref.ref));
}

// Can this card be graded "confirmed"? Returns null when yes, otherwise the reason it cannot.
//   - one observation of the running program is enough;
//   - an entity built from an exact shipped artifact (a SQL create script) is enough;
//   - otherwise at least two different bases are needed: two static readings of one binary never confirm anything.
export function confirmedBlocker({ refs, entryById, isEntity = false, extraRuntime = false }) {
  const bases = new Set(refs.map((r) => basisOfRef(r, entryById)));
  if (extraRuntime) bases.add("runtime");
  if (bases.has("runtime")) return null;
  if (isEntity && bases.has("shipped-data")) return null;
  if (bases.size >= 2) return null;
  const have = [...bases].join(", ") || "no resolved evidence";
  return `confirmed needs an observation of the running program, or two different kinds of proof (has: ${have}). Use partial until then`;
}

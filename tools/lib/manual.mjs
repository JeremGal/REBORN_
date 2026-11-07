// A user manual is an inventory of what the program offers, written by its authors: an independent denominator for
// feature coverage (the cards say what we described; the manual says what exists). Topics are not features one to one,
// so the count is a documented-topic inventory, reported as such.

const decode = (s) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .trim();

// Front matter and back matter document the document, not the program.
const NOT_A_FEATURE = /^(about|introduction|using this document|getting help|accessing help|help$|glossary|index|appendix|copyright|legal|credits|authors|contributors|preface|table of contents)|licen[cs]e/i;

// Parses a CHM table of contents (.hhc: nested <UL><LI><OBJECT><param name="Name" ...>) into entries with their depth.
export function parseHhc(text) {
  const entries = [];
  let depth = 0;
  const re = /<\s*(\/?)\s*ul\b[^>]*>|<param\s+name\s*=\s*"Name"\s+value\s*=\s*"([^"]*)"/gi;
  let m;
  while ((m = re.exec(text))) {
    if (m[2] !== undefined) entries.push({ title: decode(m[2]), depth });
    else if (m[1]) depth = Math.max(0, depth - 1);
    else depth++;
  }
  return entries;
}

// Parses markdown headings (from a PDF or Word manual converted to markdown) into the same shape.
export function parseHeadings(markdown) {
  return [...markdown.matchAll(/^(#{1,6})\s+(.+?)\s*#*\s*$/gm)].map((m) => ({ title: m[2].trim(), depth: m[1].length }));
}

// Chapters (shallowest level) and the topics under them; front and back matter left out.
export function inventory(entries) {
  if (!entries.length) return { chapters: [], topics: 0, entries: 0, excluded: 0 };
  const top = Math.min(...entries.map((e) => e.depth));
  const chapters = [];
  let current = null, skipping = false, excluded = 0;
  for (const e of entries) {
    if (e.depth === top) {
      skipping = NOT_A_FEATURE.test(e.title);
      current = skipping ? null : { title: e.title, topics: [] };
      if (current) chapters.push(current); else excluded++;
      continue;
    }
    if (skipping || !current) { excluded++; continue; }
    current.topics.push(e.title);
  }
  // A manual whose whole content sits under one root (the book title) is unfolded one level.
  if (chapters.length === 1 && entries.filter((e) => e.depth === top + 1).length > 1) return inventory(entries.filter((e) => e.depth > top));
  return { chapters: chapters.map((c) => ({ title: c.title, topics: c.topics.length })), topics: chapters.reduce((n, c) => n + c.topics.length, 0), entries: entries.length, excluded, titles: chapters.flatMap((c) => c.topics) };
}

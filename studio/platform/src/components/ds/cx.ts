/** Concatène des classes en ignorant les valeurs fausses (même contrat que `cx` de components/ui). */
export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

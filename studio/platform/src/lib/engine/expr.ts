/**
 * Évaluateur d'expressions sûr — aucune exécution de JavaScript.
 *
 * L'expression est compilée une fois en arbre syntaxique (mis en cache), puis
 * évaluée contre un contexte de variables. Grammaire supportée :
 *   nombres, chaînes ('a' ou "a"), true/false/null, variables du contexte,
 *   + - * / %, < <= > >= == !=, && || !, ternaire a ? b : c, parenthèses,
 *   fonctions : min, max, abs, floor, ceil, round(x, décimales), clamp(x, min, max).
 * Pas d'accès aux propriétés, pas d'affectation, pas d'appel hors liste blanche.
 */

export type Value = number | string | boolean | null;
type Scope = Record<string, unknown>;

export class ExprError extends Error {}

const MAX_LENGTH = 1000;
const MAX_DEPTH = 48;
const MAX_TOKENS = 400;

type Token = { t: "num"; v: number } | { t: "str"; v: string } | { t: "id"; v: string } | { t: "op"; v: string } | { t: "eof" };

export type Node =
  | { k: "lit"; v: Value }
  | { k: "var"; name: string }
  | { k: "un"; op: "-" | "+" | "!"; a: Node }
  | { k: "bin"; op: string; a: Node; b: Node }
  | { k: "tern"; c: Node; a: Node; b: Node }
  | { k: "call"; fn: string; args: Node[] };

const OPS = ["===", "!==", "&&", "||", "==", "!=", "<=", ">=", "<", ">", "+", "-", "*", "/", "%", "!", "(", ")", ",", "?", ":"];

function tokenize(src: string): Token[] {
  if (src.length > MAX_LENGTH) throw new ExprError(`Expression trop longue (${src.length} > ${MAX_LENGTH} caractères)`);
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9._]/.test(src[j])) j++;
      const n = Number(src.slice(i, j).replace(/_/g, ""));
      if (Number.isNaN(n)) throw new ExprError(`Nombre invalide « ${src.slice(i, j)} »`);
      out.push({ t: "num", v: n });
      i = j;
    } else if (c === "'" || c === '"') {
      const j = src.indexOf(c, i + 1);
      if (j < 0) throw new ExprError("Chaîne non terminée");
      out.push({ t: "str", v: src.slice(i + 1, j) });
      i = j + 1;
    } else if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      if (src[j] === ".") throw new ExprError(`Accès aux propriétés interdit (« ${src.slice(i, j + 1)} »)`);
      out.push({ t: "id", v: src.slice(i, j) });
      i = j;
    } else {
      const op = OPS.find((o) => src.startsWith(o, i));
      if (!op) throw new ExprError(`Caractère inattendu « ${c} »`);
      out.push({ t: "op", v: op === "===" ? "==" : op === "!==" ? "!=" : op });
      i += op.length;
    }
    if (out.length > MAX_TOKENS) throw new ExprError("Expression trop complexe");
  }
  out.push({ t: "eof" });
  return out;
}

const FUNCS: Record<string, { arity: [number, number]; fn: (...a: number[]) => number }> = {
  min: { arity: [1, 20], fn: (...a) => Math.min(...a) },
  max: { arity: [1, 20], fn: (...a) => Math.max(...a) },
  abs: { arity: [1, 1], fn: (a) => Math.abs(a) },
  floor: { arity: [1, 1], fn: (a) => Math.floor(a) },
  ceil: { arity: [1, 1], fn: (a) => Math.ceil(a) },
  round: { arity: [1, 2], fn: (a, d = 0) => roundHalfUp(a, d) },
  clamp: { arity: [3, 3], fn: (x, lo, hi) => Math.min(Math.max(x, lo), hi) },
};

export function roundHalfUp(x: number, decimals = 2): number {
  const f = 10 ** decimals;
  const sign = x < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(x) * f + 1e-9)) / f;
}

/* ------------------------------------------------------------------ */
/* Analyse syntaxique                                                   */
/* ------------------------------------------------------------------ */

class Parser {
  private p = 0;
  private depth = 0;
  constructor(private toks: Token[]) {}

  private peek() {
    return this.toks[this.p];
  }
  private isOp(v: string) {
    const t = this.peek();
    return t.t === "op" && t.v === v;
  }
  private eat(v: string) {
    if (!this.isOp(v)) throw new ExprError(`« ${v} » attendu`);
    this.p++;
  }
  private enter() {
    if (++this.depth > MAX_DEPTH) throw new ExprError("Expression trop imbriquée");
  }

  parse(): Node {
    const n = this.ternary();
    if (this.peek().t !== "eof") throw new ExprError("Expression mal formée");
    return n;
  }

  private ternary(): Node {
    this.enter();
    const c = this.or();
    if (this.isOp("?")) {
      this.p++;
      const a = this.ternary();
      this.eat(":");
      const b = this.ternary();
      this.depth--;
      return { k: "tern", c, a, b };
    }
    this.depth--;
    return c;
  }
  private binary(next: () => Node, ops: string[]): Node {
    let l = next();
    while (ops.some((o) => this.isOp(o))) {
      const op = (this.toks[this.p++] as { v: string }).v;
      l = { k: "bin", op, a: l, b: next() };
    }
    return l;
  }
  private or = (): Node => this.binary(this.and, ["||"]);
  private and = (): Node => this.binary(this.eq, ["&&"]);
  private eq = (): Node => this.binary(this.cmp, ["==", "!="]);
  private cmp = (): Node => this.binary(this.add, ["<", "<=", ">", ">="]);
  private add = (): Node => this.binary(this.mul, ["+", "-"]);
  private mul = (): Node => this.binary(this.unary, ["*", "/", "%"]);
  private unary = (): Node => {
    for (const op of ["-", "+", "!"] as const) {
      if (this.isOp(op)) {
        this.p++;
        this.enter();
        const a = this.unary();
        this.depth--;
        return { k: "un", op, a };
      }
    }
    return this.primary();
  };
  private primary(): Node {
    const t = this.peek();
    if (t.t === "num" || t.t === "str") {
      this.p++;
      return { k: "lit", v: t.v };
    }
    if (t.t === "op" && t.v === "(") {
      this.p++;
      const n = this.ternary();
      this.eat(")");
      return n;
    }
    if (t.t === "id") {
      this.p++;
      if (t.v === "true" || t.v === "false") return { k: "lit", v: t.v === "true" };
      if (t.v === "null") return { k: "lit", v: null };
      if (this.isOp("(")) {
        const name = t.v.toLowerCase();
        const def = FUNCS[name];
        if (!def) throw new ExprError(`Fonction inconnue « ${t.v} »`);
        this.p++;
        const args: Node[] = [];
        if (!this.isOp(")")) {
          args.push(this.ternary());
          while (this.isOp(",")) {
            this.p++;
            args.push(this.ternary());
          }
        }
        this.eat(")");
        if (args.length < def.arity[0] || args.length > def.arity[1]) throw new ExprError(`${name}() : nombre d'arguments invalide`);
        return { k: "call", fn: name, args };
      }
      return { k: "var", name: t.v };
    }
    throw new ExprError("Expression mal formée");
  }
}

/* ------------------------------------------------------------------ */
/* Compilation (avec cache) et évaluation                               */
/* ------------------------------------------------------------------ */

export interface Compiled {
  ast: Node;
  vars: string[];
}

const cache = new Map<string, Compiled>();

export function compile(src: string): Compiled {
  const hit = cache.get(src);
  if (hit) return hit;
  const ast = new Parser(tokenize(src)).parse();
  const vars = new Set<string>();
  const walk = (n: Node) => {
    if (n.k === "var") vars.add(n.name);
    else if (n.k === "un") walk(n.a);
    else if (n.k === "bin") (walk(n.a), walk(n.b));
    else if (n.k === "tern") (walk(n.c), walk(n.a), walk(n.b));
    else if (n.k === "call") n.args.forEach(walk);
  };
  walk(ast);
  const c = { ast, vars: [...vars] };
  if (cache.size > 2000) cache.clear();
  cache.set(src, c);
  return c;
}

function run(n: Node, scope: Scope): Value {
  switch (n.k) {
    case "lit":
      return n.v;
    case "var": {
      if (!Object.prototype.hasOwnProperty.call(scope, n.name)) throw new ExprError(`Variable inconnue « ${n.name} »`);
      const v = scope[n.name];
      if (v === undefined || v === null) return null;
      if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") return v;
      throw new ExprError(`Variable non scalaire « ${n.name} »`);
    }
    case "un": {
      const a = run(n.a, scope);
      return n.op === "!" ? !a : n.op === "-" ? -num(a) : num(a);
    }
    case "tern":
      return run(n.c, scope) ? run(n.a, scope) : run(n.b, scope);
    case "call":
      return FUNCS[n.fn].fn(...n.args.map((x) => num(run(x, scope))));
    case "bin": {
      if (n.op === "&&") return !!run(n.a, scope) && !!run(n.b, scope);
      if (n.op === "||") return !!run(n.a, scope) || !!run(n.b, scope);
      const a = run(n.a, scope);
      const b = run(n.b, scope);
      switch (n.op) {
        case "==":
          return looseEqual(a, b);
        case "!=":
          return !looseEqual(a, b);
        case "<":
          return num(a) < num(b);
        case "<=":
          return num(a) <= num(b);
        case ">":
          return num(a) > num(b);
        case ">=":
          return num(a) >= num(b);
        case "+":
          return typeof a === "string" || typeof b === "string" ? `${a ?? ""}${b ?? ""}` : num(a) + num(b);
        case "-":
          return num(a) - num(b);
        case "*":
          return num(a) * num(b);
        case "/":
        case "%": {
          const d = num(b);
          if (d === 0) throw new ExprError("Division par zéro");
          return n.op === "/" ? num(a) / d : num(a) % d;
        }
      }
    }
  }
  throw new ExprError("Nœud inconnu");
}

function num(v: Value): number {
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new ExprError("Résultat numérique non fini");
    return v;
  }
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  throw new ExprError(`Valeur non numérique « ${String(v)} »`);
}

export function looseEqual(a: unknown, b: unknown): boolean {
  if (typeof a === "number" || typeof b === "number") {
    const na = Number(a),
      nb = Number(b);
    if (a !== null && b !== null && a !== "" && b !== "" && !Number.isNaN(na) && !Number.isNaN(nb)) return Math.abs(na - nb) < 1e-9;
  }
  if (typeof a === "string" && typeof b === "string") return a.trim().toLowerCase() === b.trim().toLowerCase();
  return a === b;
}

export function evaluate(src: string, scope: Scope): Value {
  return run(compile(src).ast, scope);
}

/** Résout une valeur d'action : nombre direct, chaîne numérique ou expression. */
export function resolveNumber(v: unknown, scope: Scope): number {
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new ExprError("Valeur numérique non finie");
    return v;
  }
  if (typeof v === "string") {
    const trimmed = v.trim().replace(/%$/, "");
    if (trimmed !== "" && !Number.isNaN(Number(trimmed))) return Number(trimmed);
    return num(evaluate(v, scope));
  }
  throw new ExprError(`Valeur numérique attendue, reçu ${JSON.stringify(v)}`);
}

/** Variables référencées par une valeur d'action (vide si littéral). */
export function referencedVars(v: unknown): string[] {
  if (typeof v !== "string") return [];
  const trimmed = v.trim().replace(/%$/, "");
  if (trimmed !== "" && !Number.isNaN(Number(trimmed))) return [];
  return compile(v).vars;
}

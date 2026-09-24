// Expressões com unidades para variáveis e cotas: "50 mm", "Ds/2 - g", "360 deg / n", "2*sin(15 deg)".
import { T } from '../i18n';
// Grandezas carregam expoentes de comprimento (L) e ângulo (A); comprimentos em mm, ângulos em graus.

export interface Q {
  v: number;
  L: number;
  A: number;
}

export class ExprError extends Error {}

export const LENGTH_UNITS: Record<string, number> = { um: 0.001, µm: 0.001, mm: 1, cm: 10, dm: 100, m: 1000, in: 25.4 };
export const ANGLE_UNITS: Record<string, number> = { deg: 1, '°': 1, rad: 180 / Math.PI };

export type LengthUnit = 'µm' | 'mm' | 'cm' | 'm' | 'in';
export const DISPLAY_UNITS: LengthUnit[] = ['µm', 'mm', 'cm', 'm', 'in'];

const FUNCS = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'sqrt', 'abs', 'min', 'max', 'round', 'floor', 'ceil', 'hypot', 'exp', 'log', 'ln', 'log10', 'pow'];
const CONSTS: Record<string, Q> = { pi: { v: Math.PI, L: 0, A: 0 } };

export const RESERVED = new Set([...Object.keys(LENGTH_UNITS), ...Object.keys(ANGLE_UNITS), ...FUNCS, ...Object.keys(CONSTS)]);
export const isValidName = (s: string) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(s) && !RESERVED.has(s);

type Node =
  | { k: 'num'; q: Q }
  | { k: 'var'; name: string }
  | { k: 'neg'; a: Node }
  | { k: 'bin'; op: '+' | '-' | '*' | '/' | '^'; a: Node; b: Node }
  | { k: 'call'; fn: string; args: Node[] };

// ---------- tokenização ----------
type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
    } else if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
      if (!m) throw new ExprError(T().expr.badNumber(src.slice(i)));
      out.push({ t: 'num', v: Number(m[0]) });
      i += m[0].length;
    } else if (/[A-Za-z_µ°]/.test(c)) {
      if (c === '°') {
        out.push({ t: 'id', v: '°' });
        i++;
        continue;
      }
      const m = /^[A-Za-z_µ][A-Za-z0-9_]*/.exec(src.slice(i))!;
      out.push({ t: 'id', v: m[0] });
      i += m[0].length;
    } else if ('+-*/^(),'.includes(c)) {
      out.push({ t: 'op', v: c });
      i++;
    } else {
      throw new ExprError(T().expr.badChar(c));
    }
  }
  return out;
}

// ---------- parser (descida recursiva) ----------
export function parseExpr(src: string): Node {
  const toks = tokenize(src);
  let i = 0;
  const peek = () => toks[i];
  const isOp = (v: string) => peek()?.t === 'op' && peek()!.v === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new ExprError(T().expr.expected(v));
    i++;
  };

  function expr(): Node {
    let a = term();
    while (isOp('+') || isOp('-')) {
      const op = toks[i++].v as '+' | '-';
      a = { k: 'bin', op, a, b: term() };
    }
    return a;
  }
  function term(): Node {
    let a = unary();
    while (isOp('*') || isOp('/')) {
      const op = toks[i++].v as '*' | '/';
      a = { k: 'bin', op, a, b: unary() };
    }
    return a;
  }
  function unary(): Node {
    if (isOp('-')) {
      i++;
      return { k: 'neg', a: unary() };
    }
    if (isOp('+')) {
      i++;
      return unary();
    }
    return power();
  }
  function power(): Node {
    const a = atom();
    if (isOp('^')) {
      i++;
      return { k: 'bin', op: '^', a, b: unary() };
    }
    return a;
  }
  function atom(): Node {
    const t = peek();
    if (!t) throw new ExprError(T().expr.incomplete);
    if (t.t === 'num') {
      i++;
      // Unidade logo após o número: "50 mm", "30°".
      const u = peek();
      if (u?.t === 'id' && (u.v in LENGTH_UNITS || u.v in ANGLE_UNITS)) {
        i++;
        if (u.v in LENGTH_UNITS) return { k: 'num', q: { v: t.v * LENGTH_UNITS[u.v], L: 1, A: 0 } };
        return { k: 'num', q: { v: t.v * ANGLE_UNITS[u.v], L: 0, A: 1 } };
      }
      return { k: 'num', q: { v: t.v, L: 0, A: 0 } };
    }
    if (t.t === 'id') {
      i++;
      if (FUNCS.includes(t.v)) {
        expect('(');
        const args = [expr()];
        while (isOp(',')) {
          i++;
          args.push(expr());
        }
        expect(')');
        return { k: 'call', fn: t.v, args };
      }
      if (t.v in LENGTH_UNITS || t.v in ANGLE_UNITS) throw new ExprError(T().expr.unitNoNumber(t.v));
      if (t.v in CONSTS) return { k: 'num', q: CONSTS[t.v] };
      return { k: 'var', name: t.v };
    }
    if (t.v === '(') {
      i++;
      const e = expr();
      expect(')');
      return e;
    }
    throw new ExprError(T().expr.unexpected(t.v));
  }

  const n = expr();
  if (i < toks.length) throw new ExprError(T().expr.leftover(toks.slice(i).map((t) => t.v).join(' ')));
  return n;
}

export function identifiers(n: Node, out = new Set<string>()): Set<string> {
  if (n.k === 'var') out.add(n.name);
  else if (n.k === 'neg') identifiers(n.a, out);
  else if (n.k === 'bin') {
    identifiers(n.a, out);
    identifiers(n.b, out);
  } else if (n.k === 'call') n.args.forEach((a) => identifiers(a, out));
  return out;
}

// ---------- avaliação ----------
const dimless = (q: Q) => q.L === 0 && q.A === 0;
const sameDim = (a: Q, b: Q) => a.L === b.L && a.A === b.A;

/** Contexto de avaliação: número puro somado a comprimento vira comprimento na unidade de exibição. */
export interface EvalCtx {
  env: Map<string, Q>;
  unit: LengthUnit;
}

function coerce(a: Q, b: Q, ctx: EvalCtx): [Q, Q] {
  if (sameDim(a, b)) return [a, b];
  const fix = (x: Q, like: Q): Q => {
    if (like.L === 1 && like.A === 0) return { v: x.v * LENGTH_UNITS[ctx.unit], L: 1, A: 0 };
    return { ...like, v: x.v };
  };
  if (dimless(a)) return [fix(a, b), b];
  if (dimless(b)) return [a, fix(b, a)];
  throw new ExprError(T().expr.mixedUnits);
}

function toRad(q: Q) {
  if (q.A === 1 && q.L === 0) return (q.v * Math.PI) / 180;
  if (dimless(q)) return q.v; // número puro em trigonometria = radianos
  throw new ExprError(T().expr.trigArg);
}

export function evalNode(n: Node, ctx: EvalCtx): Q {
  switch (n.k) {
    case 'num':
      return n.q;
    case 'var': {
      const q = ctx.env.get(n.name);
      if (!q) throw new ExprError(T().expr.undefinedVar(n.name));
      return q;
    }
    case 'neg': {
      const a = evalNode(n.a, ctx);
      return { ...a, v: -a.v };
    }
    case 'bin': {
      const a = evalNode(n.a, ctx);
      const b = evalNode(n.b, ctx);
      switch (n.op) {
        case '+':
        case '-': {
          const [x, y] = coerce(a, b, ctx);
          return { ...x, v: n.op === '+' ? x.v + y.v : x.v - y.v };
        }
        case '*':
          return { v: a.v * b.v, L: a.L + b.L, A: a.A + b.A };
        case '/':
          if (b.v === 0) throw new ExprError(T().expr.divZero);
          return { v: a.v / b.v, L: a.L - b.L, A: a.A - b.A };
        case '^':
          if (!dimless(b)) throw new ExprError(T().expr.exponent);
          return { v: Math.pow(a.v, b.v), L: a.L * b.v, A: a.A * b.v };
      }
      break;
    }
    case 'call': {
      const args = n.args.map((a) => evalNode(a, ctx));
      const need = (k: number) => {
        if (args.length !== k) throw new ExprError(T().expr.args(n.fn, k));
      };
      const ang = (rad: number): Q => ({ v: (rad * 180) / Math.PI, L: 0, A: 1 });
      switch (n.fn) {
        case 'sin':
        case 'cos':
        case 'tan':
          need(1);
          return { v: Math[n.fn](toRad(args[0])), L: 0, A: 0 };
        case 'asin':
        case 'acos':
        case 'atan':
          need(1);
          if (!dimless(args[0])) throw new ExprError(T().expr.pureNumber(n.fn));
          return ang(Math[n.fn](args[0].v));
        case 'atan2': {
          need(2);
          const [y, x] = coerce(args[0], args[1], ctx);
          return ang(Math.atan2(y.v, x.v));
        }
        case 'sqrt':
          need(1);
          return { v: Math.sqrt(args[0].v), L: args[0].L / 2, A: args[0].A / 2 };
        case 'abs':
        case 'round':
        case 'floor':
        case 'ceil':
          need(1);
          return { ...args[0], v: Math[n.fn](args[0].v) };
        case 'exp':
        case 'log':
        case 'ln':
        case 'log10': {
          need(1);
          if (!dimless(args[0])) throw new ExprError(T().expr.pureNumber(n.fn));
          const f = n.fn === 'exp' ? Math.exp : n.fn === 'log10' ? Math.log10 : Math.log;
          return { v: f(args[0].v), L: 0, A: 0 };
        }
        case 'pow': {
          need(2);
          if (!dimless(args[1])) throw new ExprError(T().expr.exponent);
          return { v: Math.pow(args[0].v, args[1].v), L: args[0].L * args[1].v, A: args[0].A * args[1].v };
        }
        case 'min':
        case 'max':
        case 'hypot': {
          if (args.length < 1) throw new ExprError(T().expr.noArgs(n.fn));
          let acc = args[0];
          const vals = [acc.v];
          for (const x of args.slice(1)) {
            const [p, q] = coerce(acc, x, ctx);
            acc = p;
            vals.push(q.v);
          }
          return { ...acc, v: Math[n.fn](...vals) };
        }
      }
    }
  }
  throw new ExprError(T().expr.incomplete);
}

export function evaluate(src: string, ctx: EvalCtx): Q {
  const q = evalNode(parseExpr(normalizeNumber(src)), ctx);
  if (!isFinite(q.v)) throw new ExprError(T().expr.notFinite);
  return q;
}

/** "12,5" -> "12.5" quando a entrada é só um número (vírgula decimal pt-BR). */
export function normalizeNumber(src: string) {
  // "=1+1" (estilo planilha) vale o mesmo que "1+1".
  const s = src.trim().replace(/^=\s*/, '');
  return /^[+-]?\d+,\d+(\s*[A-Za-zµ°]+)?$/.test(s) ? s.replace(',', '.') : s;
}

/** Converte para comprimento em mm (número puro = unidade de exibição). */
export function asLength(q: Q, unit: LengthUnit): number {
  if (q.L === 1 && q.A === 0) return q.v;
  if (dimless(q)) return q.v * LENGTH_UNITS[unit];
  throw new ExprError(T().expr.wantLength);
}

/** Converte para ângulo em graus (número puro = graus). */
export function asAngle(q: Q): number {
  if (q.A === 1 && q.L === 0) return q.v;
  if (dimless(q)) return q.v;
  throw new ExprError(T().expr.wantAngle);
}

/** A entrada é uma constante (sem variáveis)? Nesse caso a cota guarda só o valor. */
export function isConstant(src: string) {
  return identifiers(parseExpr(normalizeNumber(src))).size === 0;
}

const nf = (v: number) => Number(v.toPrecision(10)).toString().replace('.', ',');
const round = (v: number) => Number(v.toFixed(4));

export function formatLength(mm: number, unit: LengthUnit) {
  return `${nf(round(mm / LENGTH_UNITS[unit]))} ${unit}`;
}

export function formatQ(q: Q, unit: LengthUnit): string {
  if (q.L === 1 && q.A === 0) return formatLength(q.v, unit);
  if (q.A === 1 && q.L === 0) return `${nf(round(q.v))}°`;
  if (dimless(q)) return nf(Number(q.v.toPrecision(10)));
  const parts = [q.L ? `mm${q.L === 1 ? '' : `^${q.L}`}` : '', q.A ? `deg${q.A === 1 ? '' : `^${q.A}`}` : ''].filter(Boolean);
  return `${nf(round(q.v))} ${parts.join('·')}`;
}

export interface Variable {
  name: string;
  expr: string;
}

/** Avalia as variáveis em ordem de dependência. Erros (ciclos, nomes) por variável. */
export function evaluateVariables(vars: Variable[], unit: LengthUnit): { values: Map<string, Q>; errors: Map<string, string> } {
  const values = new Map<string, Q>();
  const errors = new Map<string, string>();
  const byName = new Map(vars.map((v) => [v.name, v]));
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (name: string, stack: string[]) => {
    if (state.get(name) === 'done') return;
    if (state.get(name) === 'visiting') throw new ExprError(T().expr.circular([...stack, name].join(' → ')));
    const v = byName.get(name)!;
    state.set(name, 'visiting');
    try {
      const node = parseExpr(normalizeNumber(v.expr));
      for (const dep of identifiers(node)) {
        if (!byName.has(dep)) throw new ExprError(T().expr.undefinedVar(dep));
        visit(dep, [...stack, name]);
        if (errors.has(dep)) throw new ExprError(T().expr.dependsOnError(dep));
      }
      values.set(name, evalNode(node, { env: values, unit }));
    } catch (e) {
      errors.set(name, e instanceof Error ? e.message : String(e));
    }
    state.set(name, 'done');
  };
  for (const v of vars) {
    if (!isValidName(v.name)) {
      errors.set(v.name, T().expr.badName);
      state.set(v.name, 'done');
      continue;
    }
    try {
      visit(v.name, []);
    } catch (e) {
      errors.set(v.name, e instanceof Error ? e.message : String(e));
    }
  }
  return { values, errors };
}

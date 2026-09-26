// Console de comandos (estilo console Python do FreeCAD): executa a mesma API do histórico.
// Subconjunto de Python: atribuição, chamadas s.metodo(...)/funcao(...), argumentos nomeados,
// strings, números, True/False/None, tuplas, listas, + − * / e comentários com #.
import { trim } from './trim';
import { T } from '../i18n';
import { q } from './code';
import type { SketchDoc } from './doc';
import { asAngle, asLength, evaluate, evaluateVariables, formatLength, isConstant, type LengthUnit } from './expr';
import { dist, pt, type Vec } from './geometry';
import { loopArea, minDistanceSets } from './inspect';
import { angleSectorAt, measure } from './measure';
import {
  adaptOrientationConstraints,
  createGroup,
  curvesUsing,
  deleteItems,
  detachFromPoint,
  Draft,
  expandSelection,
  getId,
  renameEntity,
  selectionPoints,
  toggleConstruction,
  transformPoints,
  ungroup,
  updateGroup,
} from './ops';
import { addNode, addPlot, addSchematic, addTable, addTableItem, addView, duplicateNode, movePlot, removeNode, updateNode } from './tree';
import { offsetCurves, setOffsetDistance } from './offset';
import { circularArray, ensureAxisLine, linearArray, mirrorEntities, setPattern } from './patterns';
import { BOUNDARY_TYPES, type Boundary, DEFAULT_MATERIALS, TABLE_ITEMS, type TableItem, type SchematicNode, type SchPart, type SchWire, emptySketch, isCurve, isDimension, ORIGIN_ID, PLOT_KINDS, type Constraint, type Group, type MaterialGroup, type PointEnt, PLOT_QUANTITIES, type PlotKind, type PlotQuantity, type BoundaryType, type ConstraintType, type Id, type Material, type ProblemType, type RegionAssign, type Sketch } from './types';
import { computeArrangement } from './regions';
import { duplicateMaterial, addBoundaryDef, addCircuit, findCircuit, removeCircuit, updateCircuit, addMaterial, assignOf, assignRegion, findBoundary, findMaterial, regionAtOrThrow, regionKey, removeMaterial, setBoundary, updateBoundaryDef, updateMaterial } from './mesh';
import { deleteVariable, renameVariable, setVariable } from './vars';

export type Value = number | string | boolean | null | Value[] | { tuple: Value[] } | { print: string };

export class ConsoleError extends Error {}

// ---------- tokenização e parser ----------
type Tok = { t: 'num'; v: number } | { t: 'str'; v: string } | { t: 'id'; v: string } | { t: 'op'; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '#') break;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let s = '';
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\' && j + 1 < src.length) {
          s += src[j + 1];
          j += 2;
        } else s += src[j++];
      }
      if (j >= src.length) throw new ConsoleError(T().consoleCmd.unclosedString);
      out.push({ t: 'str', v: s });
      i = j + 1;
      continue;
    }
    const num = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
    if (num) {
      out.push({ t: 'num', v: Number(num[0]) });
      i += num[0].length;
      continue;
    }
    const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
    if (id) {
      out.push({ t: 'id', v: id[0] });
      i += id[0].length;
      continue;
    }
    if ('()[],=.+-*/'.includes(c)) {
      out.push({ t: 'op', v: c });
      i++;
      continue;
    }
    throw new ConsoleError(T().consoleCmd.badChar(c));
  }
  return out;
}

type Node =
  | { k: 'lit'; v: Value }
  | { k: 'name'; v: string }
  | { k: 'tuple' | 'list'; items: Node[] }
  | { k: 'call'; obj: string | null; fn: string; args: Node[]; kw: Record<string, Node> }
  | { k: 'bin'; op: string; a: Node; b: Node }
  | { k: 'neg'; a: Node };

interface Stmt {
  target: string | null;
  expr: Node;
}

function parse(src: string): Stmt | null {
  const toks = tokenize(src);
  if (!toks.length) return null;
  let i = 0;
  const peek = () => toks[i];
  const isOp = (v: string) => peek()?.t === 'op' && peek()!.v === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new ConsoleError(T().consoleCmd.expected(v));
    i++;
  };

  function expr(): Node {
    let a = term();
    while (isOp('+') || isOp('-')) {
      const op = toks[i++].v as string;
      a = { k: 'bin', op, a, b: term() };
    }
    return a;
  }
  function term(): Node {
    let a = unary();
    while (isOp('*') || isOp('/')) {
      const op = toks[i++].v as string;
      a = { k: 'bin', op, a, b: unary() };
    }
    return a;
  }
  function unary(): Node {
    if (isOp('-')) {
      i++;
      return { k: 'neg', a: unary() };
    }
    return atom();
  }
  function args(): { args: Node[]; kw: Record<string, Node> } {
    const a: Node[] = [];
    const kw: Record<string, Node> = {};
    expect('(');
    while (!isOp(')')) {
      const t = peek();
      if (t?.t === 'id' && toks[i + 1]?.t === 'op' && toks[i + 1].v === '=') {
        i += 2;
        kw[t.v] = expr();
      } else a.push(expr());
      if (isOp(',')) i++;
      else if (!isOp(')')) throw new ConsoleError(T().consoleCmd.expected(')'));
    }
    expect(')');
    return { args: a, kw };
  }
  function atom(): Node {
    const t = peek();
    if (!t) throw new ConsoleError(T().consoleCmd.incomplete);
    if (t.t === 'num' || t.t === 'str') {
      i++;
      return { k: 'lit', v: t.v };
    }
    if (t.t === 'id') {
      i++;
      if (t.v === 'True' || t.v === 'False') return { k: 'lit', v: t.v === 'True' };
      if (t.v === 'None') return { k: 'lit', v: null };
      if (isOp('.')) {
        i++;
        const m = peek();
        if (m?.t !== 'id') throw new ConsoleError(T().consoleCmd.expected('nome'));
        i++;
        const { args: a, kw } = args();
        return { k: 'call', obj: t.v, fn: m.v, args: a, kw };
      }
      if (isOp('(')) {
        const { args: a, kw } = args();
        return { k: 'call', obj: null, fn: t.v, args: a, kw };
      }
      return { k: 'name', v: t.v };
    }
    if (t.v === '(' || t.v === '[') {
      const close = t.v === '(' ? ')' : ']';
      i++;
      const items: Node[] = [];
      let comma = false;
      while (!isOp(close)) {
        items.push(expr());
        if (isOp(',')) {
          i++;
          comma = true;
        } else if (!isOp(close)) throw new ConsoleError(T().consoleCmd.expected(close));
      }
      i++;
      if (t.v === '(' && items.length === 1 && !comma) return items[0];
      return { k: t.v === '(' ? 'tuple' : 'list', items };
    }
    throw new ConsoleError(T().consoleCmd.unexpected(String(t.v)));
  }

  let target: string | null = null;
  if (toks[0]?.t === 'id' && toks[1]?.t === 'op' && toks[1].v === '=') {
    target = toks[0].v;
    i = 2;
  }
  const e = expr();
  if (i < toks.length) throw new ConsoleError(T().consoleCmd.leftover(toks.slice(i).map((x) => String(x.v)).join(' ')));
  return { target, expr: e };
}

// ---------- valores ----------
export function repr(v: Value): string {
  if (v === null) return 'None';
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (typeof v === 'number') return String(Number(v.toPrecision(12)));
  if (typeof v === 'string') return q(v);
  if (Array.isArray(v)) return `[${v.map(repr).join(', ')}]`;
  if ('print' in v) return v.print; // texto para ler (help), sem aspas
  return `(${v.tuple.map(repr).join(', ')}${v.tuple.length === 1 ? ',' : ''})`;
}

const isTuple = (v: Value): v is { tuple: Value[] } => typeof v === 'object' && v !== null && !Array.isArray(v) && 'tuple' in v;
const seq = (v: Value): Value[] | null => (Array.isArray(v) ? v : isTuple(v) ? v.tuple : null);

// ---------- execução ----------
export interface ConsoleHost {
  doc: SketchDoc;
  /** Opcional: ações de vista (fit, desfazer) quando há editor. */
  fit?: () => void;
  undo?: () => void;
  redo?: () => void;
  /** Gera a malha do nó (assíncrono, no Worker). */
  mesh?: (id: string) => void | Promise<unknown>;
  /** Resolve a física do nó (assíncrono). */
  solve?: (id: string) => void | Promise<unknown>;
  /** Resultados numéricos (r.result, r.results, r.series), quando há editor com soluções. */
  results?: ResultsApi;
}

/** Variáveis de resultado de uma física resolvida (a primeira resolvida, se não for dada). */
export interface ResultsApi {
  list(physics?: string): { name: string; value: number; unit: string }[] | null;
  /** Transitório: a variável em todos os instantes (tempos em s). */
  series(name: string, physics?: string): { t: number[]; y: number[] } | null;
}

export interface RunResult {
  ok: boolean;
  /** Texto a mostrar (repr do resultado, ou mensagem de erro). */
  out: string | null;
  /** Valor do resultado em JSON (números, textos, listas), para a ponte com scripts. */
  value?: unknown;
}

/** Valor do console em JSON: tuplas viram listas. */
export function jsonOf(v: Value): unknown {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(jsonOf);
  if ('print' in v) return v.print;
  return v.tuple.map(jsonOf);
}


/** Troca um id por outro em todo o projeto (chaves de entidades e referências), sem tocar em nomes/expressões. */
export function renameId(sk: Sketch, from: string, to: string): Sketch {
  if (from === to) return sk;
  const walk = (v: unknown, key?: string): unknown => {
    if (key === 'name' || key === 'expr' || key === 'current' || key === 'magnetAngle' || key === 'meshSize' || key === 'value' && typeof v === 'string') return v;
    if (typeof v === 'string') return v === from ? to : v;
    if (Array.isArray(v)) return v.map((x) => walk(x));
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) out[k === from ? to : k] = walk(x, k);
      return out;
    }
    return v;
  };
  const next = walk(sk) as Sketch;
  // Só ids do contador (p12, l3, ra53, mat7…); ids fixos como mat_1010 não mexem no contador.
  const m = /^[a-z]+(\d+)$/.exec(to);
  if (m) next.nextId = Math.max(next.nextId, Number(m[1]) + 1);
  return next;
}

export class CommandConsole {
  /** Variáveis do console (ex.: l4 = s.line(...)). */
  env = new Map<string, Value>();

  constructor(private host: ConsoleHost) {}

  private get sk(): Sketch {
    return this.host.doc.sketch;
  }
  private get unit(): LengthUnit {
    return this.sk.settings.unit;
  }

  /** Executa uma linha; `code` (a linha digitada, sem comentário) vai para o histórico. */
  run(line: string): RunResult {
    const code = line.replace(/\s+#.*$/, '').trim();
    try {
      const st = parse(line);
      if (!st) return { ok: true, out: null };
      this.code = code;
      const v = this.eval(st.expr);
      if (st.target) {
        this.env.set(st.target, v);
        return { ok: true, out: null, value: jsonOf(v) };
      }
      return { ok: true, out: v === null || v === undefined ? null : repr(v), value: v === undefined ? null : jsonOf(v) };
    } catch (e) {
      return { ok: false, out: (e as Error).message };
    }
  }

  private code = '';
  /** Última tarefa assíncrona iniciada (malha, solução): a ponte com scripts espera por ela. */
  pending: Promise<unknown> | null = null;

  private eval(n: Node): Value {
    switch (n.k) {
      case 'lit':
        return n.v;
      case 'name': {
        if (!this.env.has(n.v)) {
          // Nome não atribuído, mas é id/nome do desenho: vale como a string do id.
          const id = getId(this.sk, n.v);
          if (id) return id;
          throw new ConsoleError(T().consoleCmd.undefinedName(n.v));
        }
        return this.env.get(n.v)!;
      }
      case 'tuple':
        return { tuple: n.items.map((x) => this.eval(x)) };
      case 'list':
        return n.items.map((x) => this.eval(x));
      case 'neg': {
        const a = this.eval(n.a);
        if (typeof a !== 'number') throw new ConsoleError(T().consoleCmd.notNumber);
        return -a;
      }
      case 'bin': {
        const a = this.eval(n.a);
        const b = this.eval(n.b);
        if (n.op === '+' && typeof a === 'string' && typeof b === 'string') return a + b;
        if (typeof a !== 'number' || typeof b !== 'number') throw new ConsoleError(T().consoleCmd.notNumber);
        return n.op === '+' ? a + b : n.op === '-' ? a - b : n.op === '*' ? a * b : a / b;
      }
      case 'call': {
        const args = n.args.map((x) => this.eval(x));
        const kw: Record<string, Value> = {};
        for (const [k, v] of Object.entries(n.kw)) kw[k] = this.eval(v);
        return this.call(resolveMethod(n.obj, n.fn), args, kw);
      }
    }
  }

  // ----- conversões de argumentos -----
  private id(v: Value): Id {
    if (typeof v !== 'string') throw new ConsoleError(T().consoleCmd.wantId(repr(v)));
    const id = getId(this.sk, v);
    if (!id) throw new ConsoleError(T().consoleCmd.notFound(v));
    return id;
  }
  private ids(list: Value[]): Id[] {
    return list.flatMap((v) => (seq(v) ?? [v]).map((x) => this.id(x)));
  }
  private xy(v: Value): Vec {
    const s = seq(v);
    if (!s || s.length !== 2 || typeof s[0] !== 'number' || typeof s[1] !== 'number') throw new ConsoleError(T().consoleCmd.wantXY(repr(v)));
    return { x: s[0], y: s[1] };
  }
  /** Ponto: id/nome existente ou (x, y) novo (criado no draft). */
  private pointOf(d: Draft, v: Value, free = false): Id {
    if (typeof v === 'string') {
      const id = this.id(v);
      if (d.sk.entities[id]?.type !== 'point') throw new ConsoleError(T().consoleCmd.wantPoint(v));
      return id;
    }
    const p = this.xy(v);
    return d.addPoint(p.x, p.y, free);
  }
  private length(v: Value): number {
    if (typeof v === 'number') return v * ({ 'µm': 1e-3, mm: 1, cm: 10, m: 1000, in: 25.4 }[this.unit] ?? 1);
    if (typeof v === 'string') return asLength(evaluate(v, this.ctx()), this.unit);
    throw new ConsoleError(T().consoleCmd.wantLength(repr(v)));
  }
  private angle(v: Value): number {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') return asAngle(evaluate(v, this.ctx()));
    throw new ConsoleError(T().consoleCmd.wantAngle(repr(v)));
  }
  private ctx() {
    return { env: evaluateVariables(this.sk.variables, this.unit).values, unit: this.unit };
  }
  private commit(next: Sketch) {
    const r = this.host.doc.commit(next, [this.code]);
    if (!r.ok) throw new ConsoleError(r.message!);
  }
  /** Commit com id explícito (reprodução exata por script): renomeia o criado para `id`. */
  private commitWithId(next: Sketch, created: string, id: Value | undefined): string {
    if (id === undefined || id === null) {
      this.commit(next);
      return created;
    }
    const want = String(id);
    if (want !== created && (next.entities[want] || next.constraints.some((c) => c.id === want) || next.groups.some((g) => g.id === want) || next.nodes.some((n) => n.id === want)))
      throw new ConsoleError(T().consoleCmd.idTaken(want));
    this.commit(renameId(next, created, want));
    return want;
  }
  /** Id explícito para itens de biblioteca (materiais, circuitos, contornos). */
  private commitWithIdOf(next: Sketch, created: string, id: Value | undefined): string {
    if (id === undefined || id === null || String(id) === created) {
      this.commit(next);
      return created;
    }
    const want = String(id);
    if (next.materials.some((m) => m.id === want) || next.circuits.some((c) => c.id === want) || next.boundaries.some((b) => b.id === want)) throw new ConsoleError(T().consoleCmd.idTaken(want));
    this.commit(renameId(next, created, want));
    return want;
  }
  /** Marcas de curva vindas do script (auxiliar, nome). */
  private flags(sk: Sketch, id: string, kw: Record<string, Value>) {
    const e = sk.entities[id] as { aux?: boolean; name?: string };
    if (kw.aux === true) e.aux = true;
    if (kw.name) e.name = String(kw.name);
  }

  /** Comprimento que pode ser negativo ("-(2 mm)" no histórico do offset para o outro lado). */
  private signedLength(v: Value): number {
    if (typeof v === 'number') return this.length(Math.abs(v)) * Math.sign(v);
    if (typeof v === 'string') return asLength(evaluate(v, this.ctx()), this.unit);
    throw new ConsoleError(T().consoleCmd.wantLength(repr(v)));
  }

  private commitGroup(r: { sketch: Sketch; groupId: Id }, optional: { type: ConstraintType; refs: Id[] }[] = []): Id {
    const res = this.host.doc.commitWithOptional(r.sketch, optional.map((o) => ({ ...o, quiet: true })), [this.code]);
    if (!res.ok) throw new ConsoleError(res.message!);
    return r.groupId;
  }

  /** Valor de cota: número (unidade atual / graus), string constante ou expressão com variáveis. */
  private dimValue(type: ConstraintType, v: Value): { value: number; expr?: string } {
    if (typeof v === 'number') return { value: type === 'angle' ? v : this.length(v) };
    if (typeof v !== 'string') throw new ConsoleError(T().consoleCmd.wantLength(repr(v)));
    const qv = evaluate(v, this.ctx());
    const value = type === 'angle' ? asAngle(qv) : asLength(qv, this.unit);
    if (!(value > 0)) throw new ConsoleError(T().msg.positive);
    return isConstant(v) ? { value } : { value, expr: v };
  }

  private addDimension(type: ConstraintType, refs: Id[], v: Value, kw: Record<string, Value>): Id {
    const d = new Draft(this.sk);
    const dv = this.dimValue(type, v);
    const extra: Record<string, unknown> = { value: dv.value, ...(dv.expr ? { expr: dv.expr } : {}) };
    if (type === 'angle') {
      const f = seq(kw.flip ?? null);
      extra.flip = f ? [!!f[0], !!f[1]] : angleSectorAt(this.sk, refs[0], refs[1], { x: 1, y: 1 });
    }
    const id = d.addConstraint(type, refs, extra);
    this.commit(d.sk);
    return id;
  }

  private geom(type: ConstraintType, refs: Id[]): Id {
    const d = new Draft(this.sk);
    const id = d.addConstraint(type, refs);
    this.commit(d.sk);
    return id;
  }

  private call(name: string, a: Value[], kw: Record<string, Value>): Value {
    // getid/getId/getID são o mesmo comando (a grafia não importa).
    const fn = name.toLowerCase() === 'getid' ? 'getid' : name;
    const t = T().consoleCmd;
    const need = (n: number) => {
      if (a.length < n) throw new ConsoleError(t.args(fn, n));
    };
    const sk = this.sk;
    switch (fn) {
      // ----- consulta -----
      case 'help':
        return { print: t.help };
      case 'getid':
        need(1);
        return getId(sk, String(a[0]));
      case 'get': {
        need(1);
        const id = this.id(a[0]);
        const e = sk.entities[id];
        const g = sk.groups.find((x) => x.id === id);
        return JSON.stringify(e ?? g);
      }
      case 'trim': {
        // g.trim("l5", (x, y)): remove o trecho da curva que contém o ponto, até as interseções mais próximas.
        need(2);
        const next = trim(sk, this.id(a[0]), this.xy(a[1]));
        if (!next) throw new ConsoleError(t.notFound(String(a[0])));
        this.commit(next);
        return null;
      }
      case 'list':
        return Object.keys(sk.entities);
      case 'value': {
        need(1);
        const c = sk.constraints.find((k) => k.id === a[0]);
        if (!c || !isDimension(c)) throw new ConsoleError(t.notFound(String(a[0])));
        return c.type === 'angle' ? measure(sk, c) : measure(sk, c) / ({ 'µm': 1e-3, mm: 1, cm: 10, m: 1000, in: 25.4 }[this.unit] ?? 1);
      }
      case 'measure': {
        need(2);
        const m = minDistanceSets(sk, expandSelection(sk, [this.id(a[0])]), expandSelection(sk, [this.id(a[1])]));
        return m ? Number(formatLength(m.d, this.unit).split(' ')[0].replace(',', '.')) : null;
      }
      case 'area': {
        need(1);
        const r = loopArea(sk, expandSelection(sk, this.ids(a)));
        if (!r) throw new ConsoleError(t.notClosed);
        const f = { 'µm': 1e-3, mm: 1, cm: 10, m: 1000, in: 25.4 }[this.unit] ?? 1;
        return r.area / (f * f);
      }
      case 'dof':
        return this.host.doc.dof;
      // ----- vista / histórico -----
      case 'fit':
        this.host.fit?.();
        return null;
      case 'undo':
        this.host.undo?.();
        return null;
      case 'redo':
        this.host.redo?.();
        return null;
      // ----- criação -----
      case 'point': {
        need(1);
        const d = new Draft(sk);
        const id = this.pointOf(d, a[0], kw.free !== false);
        const e = d.sk.entities[id] as PointEnt;
        if (kw.fixed === true) e.fixed = true;
        if (kw.aux === true) e.aux = true;
        if (kw.name) e.name = String(kw.name);
        return this.commitWithId(d.sk, id, kw.id);
      }
      case 'line': {
        need(2);
        const d = new Draft(sk);
        const p1 = this.pointOf(d, a[0]);
        const p2 = this.pointOf(d, a[1]);
        const id = d.addLine(p1, p2, kw.construction === true);
        this.flags(d.sk, id, kw);
        return this.commitWithId(d.sk, id, kw.id);
      }
      case 'circle': {
        need(1);
        const d = new Draft(sk);
        const c = this.pointOf(d, a[0]);
        const r = this.length(kw.r ?? a[1] ?? null);
        const id = d.addCircle(c, r, kw.construction === true);
        this.flags(d.sk, id, kw);
        return this.commitWithId(d.sk, id, kw.id);
      }
      case 'arc': {
        need(3);
        const d = new Draft(sk);
        const c = this.pointOf(d, a[0]);
        const s = this.pointOf(d, a[1]);
        const e = this.pointOf(d, a[2]);
        const id = d.addArc(c, s, e, dist(pt(d.sk, c), pt(d.sk, s)), kw.construction === true);
        this.flags(d.sk, id, kw);
        return this.commitWithId(d.sk, id, kw.id);
      }
      case 'rectangle':
      case 'rectangle_center': {
        need(2);
        const d = new Draft(sk);
        let c1: Id, c3: Id, A: Vec, B: Vec;
        let center: Id | null = null;
        if (fn === 'rectangle') {
          c1 = this.pointOf(d, a[0]);
          c3 = this.pointOf(d, a[1]);
          A = pt(d.sk, c1);
          B = pt(d.sk, c3);
        } else {
          center = this.pointOf(d, a[0], true);
          c3 = this.pointOf(d, a[1]);
          const C = pt(d.sk, center);
          B = pt(d.sk, c3);
          A = { x: 2 * C.x - B.x, y: 2 * C.y - B.y };
          c1 = d.addPoint(A.x, A.y);
        }
        const p2 = d.addPoint(B.x, A.y);
        const p4 = d.addPoint(A.x, B.y);
        const ls = [d.addLine(c1, p2), d.addLine(p2, c3), d.addLine(c3, p4), d.addLine(p4, c1)];
        const n = d.sk.groups.filter((g) => g.name.startsWith(T().tree.rectangle)).length + 1;
        const g = d.addGroup(`${T().tree.rectangle} ${n}`, center && typeof a[0] !== 'string' ? [...ls, center] : ls);
        const opt: { type: ConstraintType; refs: Id[]; quiet: boolean }[] = [
          { type: 'horizontal', refs: [ls[0]], quiet: true },
          { type: 'vertical', refs: [ls[1]], quiet: true },
          { type: 'horizontal', refs: [ls[2]], quiet: true },
          { type: 'vertical', refs: [ls[3]], quiet: true },
        ];
        if (center) opt.push({ type: 'symmetricPoint', refs: [c1, c3, center], quiet: true });
        const r = this.host.doc.commitWithOptional(d.sk, opt, [this.code]);
        if (!r.ok) throw new ConsoleError(r.message!);
        return g;
      }
      // ----- restrições -----
      case 'horizontal':
      case 'vertical': {
        need(1);
        const refs = this.ids(a);
        const d = new Draft(sk);
        if (refs.length === 2 && refs.every((r) => sk.entities[r].type === 'point')) d.addConstraint(fn, refs);
        else for (const r of refs) d.addConstraint(fn, [r]);
        this.commit(d.sk);
        return null;
      }
      case 'coincident': {
        need(2);
        const [x, y] = this.ids(a);
        const tx = sk.entities[x].type;
        const ty = sk.entities[y].type;
        if (tx === 'point' && ty === 'point') return this.geom('coincident', [x, y]);
        if (tx === 'point') return this.geom('pointOn', [x, y]);
        if (ty === 'point') return this.geom('pointOn', [y, x]);
        throw new ConsoleError(t.badCombination(fn));
      }
      case 'point_on':
        need(2);
        return this.geom('pointOn', this.ids(a).slice(0, 2));
      case 'parallel':
      case 'perpendicular':
      case 'tangent':
      case 'equal':
      case 'midpoint':
      case 'concentric':
        need(2);
        return this.geom(fn, this.ids(a).slice(0, 2));
      case 'symmetric': {
        need(2);
        const axisV = kw.axis ?? a[2];
        if (axisV === 'x' || axisV === 'y') {
          const d = new Draft(sk);
          const line = ensureAxisLine(d, axisV).line;
          const id = d.addConstraint('symmetric', [this.id(a[0]), this.id(a[1]), line]);
          this.commit(d.sk);
          return id;
        }
        need(3);
        const r = [this.id(a[0]), this.id(a[1]), this.id(axisV ?? null)];
        return this.geom(sk.entities[r[2]].type === 'point' ? 'symmetricPoint' : 'symmetric', r);
      }
      case 'distance':
      case 'hdistance':
      case 'vdistance': {
        need(2);
        const refs = this.ids(a.slice(0, a.length - 1));
        return this.addDimension(fn, refs, a[a.length - 1], kw);
      }
      case 'radius':
      case 'diameter':
        need(2);
        return this.addDimension(fn, [this.id(a[0])], a[1], kw);
      case 'angle':
        need(3);
        return this.addDimension('angle', [this.id(a[0]), this.id(a[1])], a[2], kw);
      case 'set_dimension': {
        need(2);
        const c = sk.constraints.find((k) => k.id === a[0]);
        if (!c || !isDimension(c)) throw new ConsoleError(t.notFound(String(a[0])));
        const dv = this.dimValue(c.type, a[1]);
        const next = { ...c, value: dv.value, expr: dv.expr };
        if (!dv.expr) delete next.expr;
        this.commit({ ...sk, constraints: sk.constraints.map((k) => (k.id === c.id ? next : k)) });
        return null;
      }
      // ----- variáveis -----
      case 'var':
        need(2);
        this.commit(setVariable(sk, String(a[0]), typeof a[1] === 'number' ? String(a[1]) : String(a[1])));
        return null;
      case 'del_var':
        need(1);
        this.commit(deleteVariable(sk, String(a[0])));
        return null;
      case 'rename_var':
        need(2);
        this.commit(renameVariable(sk, String(a[0]), String(a[1])));
        return null;
      // ----- edição -----
      case 'delete':
        need(1);
        this.commit(deleteItems(sk, this.ids(a)));
        return null;
      case 'rename': {
        need(2);
        const id = this.id(a[0]);
        if (sk.groups.some((g) => g.id === id)) this.commit(updateGroup(sk, id, { name: String(a[1]) }));
        else if (sk.nodes.some((n) => n.id === id)) this.commit(updateNode(sk, id, { name: String(a[1]) }));
        else this.commit(renameEntity(sk, id, String(a[1])));
        return null;
      }
      case 'construction': {
        need(1);
        const ids = this.ids([a[0]]).filter((x) => isCurve(sk.entities[x]));
        const on = a[1] !== false;
        const cur = ids.every((x) => (sk.entities[x] as { construction?: boolean }).construction);
        this.commit(cur === on ? sk : toggleConstruction(sk, ids));
        return null;
      }
      case 'fix':
      case 'unfix': {
        need(1);
        const entities = { ...sk.entities };
        for (const id of this.ids(a)) {
          const e = entities[id];
          if (e?.type === 'point' && id !== ORIGIN_ID) entities[id] = { ...e, fixed: fn === 'fix' };
        }
        this.commit({ ...sk, entities });
        return null;
      }
      case 'group': {
        need(1);
        const r = createGroup(sk, this.ids([a[0]]), kw.name ? String(kw.name) : undefined);
        if (!r) throw new ConsoleError(t.emptyGroup);
        this.commit(r.sketch);
        return r.id;
      }
      case 'ungroup':
        need(1);
        this.commit(ungroup(sk, this.ids(a)));
        return null;
      case 'hide':
      case 'show':
        need(1);
        this.commit(updateGroup(sk, this.id(a[0]), { hidden: fn === 'hide' }));
        return null;
      case 'move': {
        need(2);
        const id = this.id(a[0]);
        const to = this.xy(a[1]);
        const P = pt(sk, id);
        this.commit(transformPoints(sk, [id], { dx: to.x - P.x, dy: to.y - P.y, angle: 0, pivot: P }));
        return null;
      }
      case 'translate': {
        need(1);
        const ids = this.ids([a[0]]);
        const dx = this.length(kw.dx ?? a[1] ?? 0);
        const dy = this.length(kw.dy ?? a[2] ?? 0);
        this.commit(transformPoints(sk, selectionPoints(sk, ids), { dx, dy, angle: 0, pivot: { x: 0, y: 0 } }));
        return null;
      }
      case 'rotate': {
        need(2);
        const ids = this.ids([a[0]]);
        const ang = this.angle(a[1]);
        const pivot = kw.pivot !== undefined ? this.xy(kw.pivot) : { x: 0, y: 0 };
        const pts = selectionPoints(sk, ids);
        const { sketch } = adaptOrientationConstraints(sk, pts, ang);
        this.commit(transformPoints(sketch, pts, { dx: 0, dy: 0, angle: ang, pivot }));
        return null;
      }
      case 'set_radius': {
        need(2);
        const id = this.id(a[0]);
        const e = sk.entities[id];
        if (e?.type !== 'circle' && e?.type !== 'arc') throw new ConsoleError(t.badCombination(fn));
        this.commit({ ...sk, entities: { ...sk.entities, [id]: { ...e, r: this.length(a[1]) } } });
        return null;
      }
      case 'detach': {
        need(1);
        const p = this.id(a[0]);
        const users = a[1] !== undefined ? this.ids([a[1]]) : curvesUsing(sk, p);
        const r = detachFromPoint(sk, p, users);
        if (!r) throw new ConsoleError(t.badCombination(fn));
        this.commit(r.sketch);
        return r.newId;
      }
      // ----- offset, espelho e padrões -----
      case 'offset': {
        need(2);
        const ids = expandSelection(sk, this.ids([a[0]])).filter((x) => isCurve(sk.entities[x]));
        return this.commitGroup(offsetCurves(sk, ids, this.signedLength(a[1])));
      }
      case 'set_offset': {
        need(2);
        {
          const gid = this.id(a[0]);
          const d = this.signedLength(a[1]);
          const g = sk.groups.find((x) => x.id === gid);
          const d0 = g?.offset ? g.offset.side * g.offset.distance : d;
          if (Math.sign(d0) === Math.sign(d)) {
            const n = Math.max(1, Math.min(40, Math.ceil(Math.abs(d - d0) / (0.2 * Math.max(Math.min(Math.abs(d0), Math.abs(d)), 1e-9)))));
            const r = this.host.doc.commitStepped((cur, t) => setOffsetDistance(cur, gid, d0 + (d - d0) * t), n, [this.code]);
            if (!r.ok) throw new ConsoleError(r.message!);
          } else this.commit(setOffsetDistance(sk, gid, d));
        }
        return null;
      }
      case 'mirror': {
        need(1);
        const axisV = kw.axis ?? a[1] ?? 'y';
        const axis = axisV === 'x' || axisV === 'y' ? axisV : this.id(axisV);
        return this.commitGroup(mirrorEntities(sk, this.ids([a[0]]), axis));
      }
      case 'array': {
        need(1);
        const nx = Number(kw.nx ?? 2);
        const ny = Number(kw.ny ?? 1);
        return this.commitGroup(linearArray(sk, this.ids([a[0]]), nx, ny, this.length(kw.dx ?? 0), this.length(kw.dy ?? 0)));
      }
      case 'set_pattern': {
        need(1);
        const next: Record<string, number> = {};
        for (const k of ['nx', 'ny', 'n']) if (kw[k] !== undefined) next[k] = Number(kw[k]);
        if (kw.dx !== undefined) next.dx = this.length(kw.dx);
        if (kw.dy !== undefined) next.dy = this.length(kw.dy);
        if (kw.angle !== undefined) next.angle = this.angle(kw.angle);
        this.commit(setPattern(sk, this.id(a[0]), next));
        return null;
      }
      case 'array_circular': {
        need(1);
        const center = kw.center !== undefined ? (typeof kw.center === 'string' ? this.id(kw.center) : this.xy(kw.center)) : { x: 0, y: 0 };
        return this.commitGroup(circularArray(sk, this.ids([a[0]]), Number(kw.n ?? 4), this.angle(kw.angle ?? 360), center));
      }
      // ----- baixo nível (script exportado): restrições, grupos e contador de ids -----
      case 'constraint': {
        need(2);
        const refs = (seq(a[1]) ?? [a[1]]).map((r) => String(r));
        const c: Constraint = { id: kw.id ? String(kw.id) : `k${sk.nextId}`, type: String(a[0]) as ConstraintType, refs };
        if (kw.value !== undefined) c.value = Number(kw.value);
        if (kw.expr !== undefined) c.expr = String(kw.expr);
        if (kw.label !== undefined) c.label = this.xy(kw.label);
        if (kw.flip !== undefined) c.flip = (seq(kw.flip) ?? []).map((x) => !!x) as [boolean, boolean];
        if (kw.internal === true) c.internal = true;
        if (kw.sign !== undefined) c.sign = Number(kw.sign) < 0 ? -1 : 1;
        if (kw.param !== undefined) c.param = String(kw.param);
        if (kw.offset_dim !== undefined) c.offsetDim = String(kw.offset_dim);
        if (kw.axis !== undefined) c.axis = String(kw.axis) === 'y' ? 'y' : 'x';
        const n = Number(/\d+$/.exec(c.id)?.[0] ?? NaN);
        this.commit({ ...sk, constraints: [...sk.constraints, c], nextId: Number.isFinite(n) ? Math.max(sk.nextId, n + 1) : sk.nextId + 1 });
        return c.id;
      }
      case 'group_def': {
        need(1);
        const id = String(a[0]);
        const g: Group = { id, name: kw.name ? String(kw.name) : id, members: (seq(kw.members ?? []) ?? []).map(String) };
        if (kw.parent !== undefined) g.parent = String(kw.parent);
        if (kw.hidden === true) g.hidden = true;
        if (kw.offset !== undefined) {
          const o = seq(kw.offset) ?? [];
          g.offset = { parents: (seq(o[0]) ?? []).map(String), distance: Number(o[1]), side: Number(o[2]) < 0 ? -1 : 1 };
        }
        if (kw.pattern !== undefined) {
          const p = seq(kw.pattern) ?? [];
          const src = (seq(p[1]) ?? []).map(String);
          g.pattern = p[0] === 'circular' ? { kind: 'circular', src, n: Number(p[2]), angle: Number(p[3]), center: String(p[4]) } : { kind: 'linear', src, nx: Number(p[2]), ny: Number(p[3]), dx: Number(p[4]), dy: Number(p[5]) };
        }
        const n = Number(/\d+$/.exec(id)?.[0] ?? NaN);
        this.commit({ ...sk, groups: [...sk.groups.filter((x) => x.id !== id), g], nextId: Number.isFinite(n) ? Math.max(sk.nextId, n + 1) : sk.nextId });
        return id;
      }
      case 'next_id': {
        need(1);
        // Valor exato do script, mas nunca abaixo de um id já usado (p12, k40, ra7, n5…).
        let used = 0;
        const bump = (id: string) => {
          const m = /^[a-z]+(\d+)$/.exec(id);
          if (m) used = Math.max(used, Number(m[1]) + 1);
        };
        Object.keys(sk.entities).forEach(bump);
        [...sk.constraints, ...sk.groups, ...sk.nodes, ...sk.regionAssigns, ...sk.boundaries, ...sk.circuits, ...sk.materials].forEach((x) => bump(x.id));
        this.commit({ ...sk, nextId: Math.max(used, Number(a[0])) });
        return null;
      }
      // ----- problema e árvore -----
      case 'units':
        need(1);
        this.commit({ ...sk, settings: { ...sk.settings, unit: String(a[0]) as LengthUnit } });
        return null;
      case 'problem':
        this.commit({
          ...sk,
          settings: { ...sk.settings, ...(a[0] ? { problem: String(a[0]) as ProblemType } : {}), ...(kw.depth !== undefined ? { depth: String(kw.depth) } : {}) },
        });
        return null;
      case 'add_physics':
      case 'add_mesh':
      case 'add_post': {
        const kind = fn === 'add_physics' ? (kw.circuit === true ? 'physics-circuit' : 'physics-magnetic') : fn === 'add_mesh' ? 'mesh' : 'post';
        const name = kw.name ? String(kw.name) : fn === 'add_physics' ? T().tree.magnetic : fn === 'add_mesh' ? T().tree.addMesh : T().tree.addPost;
        const r = addNode(sk, kind, name);
        return this.commitWithId(r.sketch, r.node.id, kw.id);
      }
      case 'physics': {
        need(1);
        const id = String(a[0]);
        const patch: Record<string, string> = {};
        for (const k of ['analysis', 'frequency', 'dt', 'schematic']) if (kw[k] !== undefined) patch[k] = String(kw[k]);
        if (kw.t_end !== undefined) patch.tEnd = String(kw.t_end);
        this.commit(updateNode(sk, id, patch));
        return null;
      }
      // ----- malha: materiais, regiões e contornos -----
      case 'material': {
        need(1);
        const patch: Partial<Material> = {};
        for (const k of ['mur', 'sigma', 'br'] as const) if (kw[k] !== undefined) patch[k] = Number(kw[k]);
        // Steinmetz (None apaga).
        for (const k of ['kh', 'alpha', 'ke'] as const) if (kw[k] !== undefined) patch[k] = kw[k] === null ? undefined : Number(kw[k]);
        if (kw.color !== undefined) patch.color = String(kw.color);
        if (kw.bh !== undefined) patch.bh = kw.bh === null ? undefined : (seq(kw.bh) ?? []).map((p) => (seq(p) ?? []).map(Number) as [number, number]);
        if (kw.name !== undefined) patch.name = String(kw.name);
        if (kw.group !== undefined) patch.group = String(kw.group) as MaterialGroup;
        const cur = findMaterial(sk, String(a[0]));
        if (cur) {
          this.commit(updateMaterial(sk, cur.id, patch));
          return cur.id;
        }
        const r = addMaterial(sk, String(a[0]), patch, kw.group !== undefined ? (String(kw.group) as MaterialGroup) : 'custom');
        return this.commitWithIdOf(r.sketch, r.material.id, kw.id);
      }
      case 'circuit': {
        need(1);
        const patch: { current?: string; name?: string; kind?: 'series' | 'parallel' } = {};
        if (kw.current !== undefined) patch.current = String(kw.current);
        if (kw.name !== undefined) patch.name = String(kw.name);
        if (kw.kind !== undefined) patch.kind = String(kw.kind) === 'parallel' ? 'parallel' : 'series';
        const cur = findCircuit(sk, String(a[0]));
        if (cur) {
          this.commit(updateCircuit(sk, cur.id, patch));
          return cur.id;
        }
        const r = addCircuit(sk, String(a[0]), patch.current ?? '1');
        return this.commitWithIdOf(patch.kind ? updateCircuit(r.sketch, r.circuit.id, { kind: patch.kind }) : r.sketch, r.circuit.id, kw.id);
      }
      case 'del_circuit': {
        need(1);
        const c = findCircuit(sk, String(a[0]));
        if (!c) throw new ConsoleError(t.notFound(String(a[0])));
        this.commit(removeCircuit(sk, c.id));
        return null;
      }
      case 'duplicate_material': {
        need(1);
        const m = findMaterial(sk, String(a[0]));
        const r = m ? duplicateMaterial(sk, m.id) : null;
        if (!r) throw new ConsoleError(t.notFound(String(a[0])));
        this.commit(r.sketch);
        return r.material.id;
      }
      case 'restore_material': {
        need(1);
        const m = findMaterial(sk, String(a[0]));
        const orig = m ? DEFAULT_MATERIALS.find((d) => d.id === m.id) : undefined;
        if (!m || !orig) throw new ConsoleError(t.notFound(String(a[0])));
        this.commit(updateMaterial(sk, m.id, { ...orig, bh: orig.bh?.map((p) => [...p] as [number, number]) }));
        return null;
      }
      case 'del_material': {
        need(1);
        const m = findMaterial(sk, String(a[0]));
        if (!m) throw new ConsoleError(t.notFound(String(a[0])));
        this.commit(removeMaterial(sk, m.id));
        return null;
      }
      case 'region': {
        need(1);
        const arr = computeArrangement(sk);
        const r = regionAtOrThrow(arr, this.xy(a[0]));
        const patch: Partial<RegionAssign> = {};
        if (kw.material !== undefined) {
          const m = findMaterial(sk, String(kw.material));
          if (!m) throw new ConsoleError(t.notFound(String(kw.material)));
          patch.material = m.id;
        }
        if (kw.current !== undefined) patch.current = kw.current === null ? undefined : String(kw.current);
        if (kw.turns !== undefined) patch.turns = kw.turns === null ? undefined : Number(kw.turns);
        if (kw.angle !== undefined) patch.magnetAngle = kw.angle === null ? undefined : String(kw.angle);
        if (kw.circuit !== undefined) {
          if (kw.circuit === null) patch.circuit = undefined;
          else {
            const c = findCircuit(sk, String(kw.circuit));
            if (!c) throw new ConsoleError(t.notFound(String(kw.circuit)));
            patch.circuit = c.id;
          }
        }
        if (kw.label !== undefined) patch.labelOffset = kw.label === null ? undefined : this.xy(kw.label);
        if (kw.name !== undefined) patch.name = kw.name === null || !String(kw.name).trim() ? undefined : String(kw.name).trim();
        let next = assignRegion(sk, arr, regionKey(r), patch);
        if (kw.id !== undefined) {
          // Id explícito (script exportado): a atribuição recém-criada recebe o id pedido.
          const created = next.regionAssigns.find((x) => !sk.regionAssigns.some((y) => y.id === x.id));
          if (created && created.id !== String(kw.id)) next = renameId(next, created.id, String(kw.id));
        }
        this.commit(next);
        return r.area;
      }
      case 'boundary': {
        need(1);
        const ref = kw.type !== undefined ? kw.type : a.length > 1 ? a[1] : 'dirichlet';
        this.commit(setBoundary(sk, this.ids([a[0]]), ref === null ? null : String(ref)));
        return null;
      }
      case 'boundary_def': {
        need(1);
        const name = String(a[0]);
        const cur = findBoundary(sk, name);
        const patch: Partial<Omit<Boundary, 'id' | 'curves'>> = {};
        if (kw.type !== undefined) {
          if (!BOUNDARY_TYPES.includes(String(kw.type) as BoundaryType)) throw new ConsoleError(t.notFound(String(kw.type)));
          patch.type = String(kw.type) as BoundaryType;
        }
        if (kw.name !== undefined) patch.name = String(kw.name);
        // Parâmetros do FEMM (None apaga): value = A0, a1, a2, phi, mu, sigma, c0, c1, inner_angle, outer_angle; color.
        const params: [string, keyof Boundary][] = [['value', 'value'], ['a1', 'a1'], ['a2', 'a2'], ['phi', 'phi'], ['mu', 'mu'], ['sigma', 'sigma'], ['c0', 'c0'], ['c1', 'c1'], ['inner_angle', 'innerAngle'], ['outer_angle', 'outerAngle'], ['color', 'color']];
        for (const [k, f] of params) if (kw[k] !== undefined) (patch as Record<string, unknown>)[f] = kw[k] === null ? undefined : String(kw[k]);
        if (cur) {
          this.commit(updateBoundaryDef(sk, cur.id, patch));
          return cur.id;
        }
        const r = addBoundaryDef(sk, patch.type ?? 'dirichlet', name);
        const { type: _ty, name: _nm, ...rest } = patch;
        return this.commitWithIdOf(Object.keys(rest).length ? updateBoundaryDef(r.sketch, r.boundary.id, rest) : r.sketch, r.boundary.id, kw.id);
      }
      case 'curve_size': {
        // m.curve_size([curvas], "1 mm") — tamanho do elemento ao longo das curvas; None tira.
        need(1);
        const ids = (seq(a[0]) ?? [a[0]]).map((v) => this.id(v));
        const v = a.length > 1 ? a[1] : kw.size;
        const next = { ...(sk.curveSizes ?? {}) };
        for (const id of ids) {
          if (v === null || v === undefined || v === 'auto') delete next[id];
          else next[id] = String(v);
        }
        this.commit({ ...sk, curveSizes: Object.keys(next).length ? next : undefined });
        return null;
      }
      case 'mesh_size': {
        need(1);
        const arr = computeArrangement(sk);
        const r = regionAtOrThrow(arr, this.xy(a[0]));
        const v = a.length > 1 ? a[1] : kw.size;
        this.commit(assignRegion(sk, arr, regionKey(r), { meshSize: v === null || v === undefined || v === 'auto' ? undefined : String(v) }));
        return null;
      }
      case 'settings': {
        need(1);
        const id = String(a[0]);
        const patch: Record<string, unknown> = {};
        if (kw.size !== undefined) patch.size = kw.size === null || kw.size === 'auto' ? '' : String(kw.size);
        if (kw.min_angle !== undefined) patch.minAngle = Number(kw.min_angle);
        this.commit(updateNode(sk, id, patch));
        return null;
      }
      case 'solve': {
        const id = a.length ? String(a[0]) : sk.nodes.find((n) => n.kind === 'physics')?.id;
        if (!id || !this.host.solve) throw new ConsoleError(t.notFound(String(a[0] ?? 'physics')));
        const pr = this.host.solve(id);
        if (pr) this.pending = pr;
        return null;
      }
      case 'result': {
        // r.result("Fx_s", physics="n2"): valor de uma variável de resultado (no instante mostrado, se transitório).
        need(1);
        const list = this.host.results?.list(kw.physics ? String(kw.physics) : undefined);
        if (!list) throw new ConsoleError(t.noResults);
        const v = list.find((x) => x.name === String(a[0]));
        if (!v) throw new ConsoleError(t.notFound(String(a[0])));
        return v.value;
      }
      case 'results': {
        const list = this.host.results?.list(a.length ? String(a[0]) : kw.physics ? String(kw.physics) : undefined);
        if (!list) throw new ConsoleError(t.noResults);
        return list.map((x) => ({ tuple: [x.name, x.value, x.unit] }));
      }
      case 'series': {
        // r.series("I_bob"): (tempos em s, valores) no transitório.
        need(1);
        const s = this.host.results?.series(String(a[0]), kw.physics ? String(kw.physics) : undefined);
        if (!s) throw new ConsoleError(t.noSeries);
        return { tuple: [s.t, s.y] };
      }
      case 'plot': {
        need(2);
        // Alvo: uma vista, ou uma física (usa a primeira vista dela; cria uma se não houver).
        const target = sk.nodes.find((n) => n.id === String(a[0]));
        const kind = String(a[1]) as PlotKind;
        if (!target || (target.kind !== 'view' && target.kind !== 'physics')) throw new ConsoleError(t.notFound(String(a[0])));
        if (!PLOT_KINDS.includes(kind)) throw new ConsoleError(t.notFound(kind));
        const qty = kw.quantity !== undefined ? (String(kw.quantity) as PlotQuantity) : PLOT_QUANTITIES[kind][0];
        if (!PLOT_QUANTITIES[kind].includes(qty)) throw new ConsoleError(t.notFound(qty));
        let base = sk;
        let viewId = target.kind === 'view' ? target.id : sk.nodes.find((n) => n.kind === 'view' && n.physics === target.id && !n.level)?.id;
        if (!viewId) {
          const v = addView(sk, target.id);
          base = v.sketch;
          viewId = v.node.id;
        }
        const r = addPlot(base, viewId, kind, kw.name ? String(kw.name) : `${T().post.plots[kind]}: ${T().post.qty[qty].split(' —')[0]}`, qty);
        return this.commitWithId(r.sketch, r.node.id, kw.id);
      }
      case 'move': {
        need(2);
        this.commit(movePlot(sk, String(a[0]), String(a[1])));
        return null;
      }
      case 'table': {
        need(1);
        const r = addTable(sk, String(a[0]), kw.name ? String(kw.name) : undefined);
        return this.commitWithId(r.sketch, r.node.id, kw.id);
      }
      case 'item': {
        need(2);
        const kind = String(a[1]) as TableItem;
        if (!TABLE_ITEMS.includes(kind)) throw new ConsoleError(t.notFound(kind));
        const r = addTableItem(sk, String(a[0]), kind, kw.name ? String(kw.name) : T().table.items[kind]);
        return this.commitWithId(r.sketch, r.node.id, kw.id);
      }
      // ----- circuito externo (esquemático) -----
      case 'sch_add': {
        const r = addSchematic(sk, kw.name ? String(kw.name) : undefined);
        // Script exportado: sem blocos automáticos (eles vêm pelos c.part com id).
        const node = r.node as SchematicNode;
        const base = kw.empty === true ? { ...r.sketch, nodes: r.sketch.nodes.map((n) => (n.id === node.id ? { ...node, parts: [] } : n)) } : r.sketch;
        return this.commitWithId(base, node.id, kw.id);
      }
      case 'sch_part': {
        need(2);
        const sch = sk.nodes.find((n): n is SchematicNode => n.id === String(a[0]) && n.kind === 'schematic');
        if (!sch) throw new ConsoleError(t.notFound(String(a[0])));
        const kind = String(a[1]) as SchPart['kind'];
        const id = kw.id ? String(kw.id) : `sp${sk.nextId}`;
        const part: SchPart = { id, kind, name: kw.name ? String(kw.name) : id, x: Number(kw.x ?? 200), y: Number(kw.y ?? 200), rot: (Number(kw.rot ?? 0) % 360) as SchPart['rot'] };
        for (const k of ['value', 'amp', 'freq', 'phase', 'dc', 'circuit'] as const) if (kw[k] !== undefined && kw[k] !== null) part[k] = String(kw[k]);
        const m = /^[a-z]+(\d+)$/.exec(id);
        this.commit({ ...updateNode(sk, sch.id, { parts: [...sch.parts.filter((p) => p.id !== id), part] }), nextId: Math.max(sk.nextId + 1, m ? Number(m[1]) + 1 : 0) });
        return id;
      }
      case 'sch_wire': {
        need(3);
        const sch = sk.nodes.find((n): n is SchematicNode => n.id === String(a[0]) && n.kind === 'schematic');
        if (!sch) throw new ConsoleError(t.notFound(String(a[0])));
        const end = (v: Value) => {
          const s2 = seq(v) ?? [];
          return { part: String(s2[0]), pin: Number(s2[1] ?? 0) };
        };
        const id = kw.id ? String(kw.id) : `sw${sk.nextId}`;
        const m = /^[a-z]+(\d+)$/.exec(id);
        const wire: SchWire = { id, a: end(a[1]), b: end(a[2]) };
        if (kw.mid !== undefined && kw.mid !== null) wire.mid = Number(kw.mid);
        if (kw.mid_y !== undefined && kw.mid_y !== null) wire.midY = Number(kw.mid_y);
        this.commit({ ...updateNode(sk, sch.id, { wires: [...sch.wires, wire] }), nextId: Math.max(sk.nextId + 1, m ? Number(m[1]) + 1 : 0) });
        return id;
      }
      case 'sch_route': {
        // Traçado do fio: x do trecho vertical, ou y= do trecho horizontal (None/nada = automático).
        need(1);
        const wid = String(a[0]);
        const sch = sk.nodes.find((n): n is SchematicNode => n.kind === 'schematic' && n.wires.some((w) => w.id === wid));
        if (!sch) throw new ConsoleError(t.notFound(wid));
        const x = a.length > 1 ? a[1] : kw.x;
        const y = kw.y;
        const wires = sch.wires.map((w) => {
          if (w.id !== wid) return w;
          const { mid: _m, midY: _y, ...rest } = w;
          if (y !== undefined && y !== null) return { ...rest, midY: Number(y) };
          return x === null || x === undefined ? rest : { ...rest, mid: Number(x) };
        });
        this.commit(updateNode(sk, sch.id, { wires }));
        return null;
      }
      case 'sch_set':
      case 'sch_move':
      case 'sch_rotate':
      case 'sch_remove': {
        need(1);
        const pid = String(a[0]);
        const sch = sk.nodes.find((n): n is SchematicNode => n.kind === 'schematic' && (n.parts.some((p) => p.id === pid) || n.wires.some((w) => w.id === pid)));
        if (!sch) throw new ConsoleError(t.notFound(pid));
        let parts = sch.parts, wires = sch.wires;
        if (fn === 'sch_remove') {
          parts = parts.filter((p) => p.id !== pid);
          wires = wires.filter((w) => w.id !== pid && w.a.part !== pid && w.b.part !== pid);
        } else
          parts = parts.map((p) => {
            if (p.id !== pid) return p;
            if (fn === 'sch_rotate') return { ...p, rot: ((p.rot + 90) % 360) as SchPart['rot'] };
            if (fn === 'sch_move') {
              const xy2 = this.xy(a[1]);
              return { ...p, x: xy2.x, y: xy2.y };
            }
            const q2: SchPart = { ...p };
            for (const k of ['value', 'amp', 'freq', 'phase', 'dc', 'circuit', 'name'] as const) if (kw[k] !== undefined && kw[k] !== null) q2[k] = String(kw[k]);
            return q2;
          });
        this.commit(updateNode(sk, sch.id, { parts, wires }));
        return null;
      }
      case 'duplicate': {
        need(1);
        const r = duplicateNode(sk, String(a[0]));
        if (!r) throw new ConsoleError(t.notFound(String(a[0])));
        this.commit(r.sketch);
        return r.node.id;
      }
      case 'view': {
        need(1);
        const r = addView(sk, String(a[0]), kw.name ? String(kw.name) : undefined);
        return this.commitWithId(r.sketch, r.node.id, kw.id);
      }
      case 'interpolate': {
        need(1);
        const r = addView(sk, String(a[0]), kw.name ? String(kw.name) : undefined, Math.max(1, Math.min(6, Math.round(kw.level !== undefined ? Number(kw.level) : 3))));
        return this.commitWithId(r.sketch, r.node.id, kw.id);
      }
      case 'post_show': {
        need(1);
        const patch: Record<string, unknown> = {};
        if (kw.visible !== undefined) patch.hidden = !kw.visible;
        if (kw.n_lines !== undefined) patch.nLines = Number(kw.n_lines);
        if (kw.range !== undefined) patch.range = kw.range === null ? undefined : (seq(kw.range) as number[]);
        if (kw.spacing !== undefined) patch.spacing = kw.spacing === null ? undefined : Number(kw.spacing);
        if (kw.scale !== undefined) patch.scale = Number(kw.scale);
        if (kw.curve !== undefined) patch.curve = kw.curve === null ? undefined : this.id(kw.curve);
        if (kw.quantity !== undefined) patch.quantity = String(kw.quantity);
        if (kw.component !== undefined) patch.component = String(kw.component);
        if (kw.color !== undefined) patch.color = kw.color === null ? undefined : String(kw.color);
        if (kw.color_by_value !== undefined) patch.colorByValue = !!kw.color_by_value;
        if (kw.colormap !== undefined) patch.colormap = String(kw.colormap);
        if (kw.outputs !== undefined) patch.outputs = kw.outputs === null ? undefined : (seq(kw.outputs) ?? []).map((o) => { const t2 = seq(o) ?? []; return { q: String(t2[0]), name: String(t2[1]) }; });
        if (kw.var_name !== undefined) patch.varName = kw.var_name === null ? undefined : String(kw.var_name);
        if (kw.expr !== undefined) patch.expr = kw.expr === null ? undefined : String(kw.expr);
        if (kw.unit_label !== undefined) patch.unitLabel = kw.unit_label === null ? undefined : String(kw.unit_label);
        if (kw.at_time !== undefined) patch.atTime = kw.at_time === null ? undefined : Math.max(0, Math.round(Number(kw.at_time)));
        if (kw.regions !== undefined) {
          const arr = computeArrangement(sk);
          patch.regions = (seq(kw.regions) ?? []).map((p) => regionKey(regionAtOrThrow(arr, this.xy(p))));
        }
        if (kw.legend !== undefined || kw.legend_bg !== undefined || kw.legend_h !== undefined) {
          const cur = (sk.nodes.find((n) => n.id === String(a[0])) as { legend?: Record<string, unknown> } | undefined)?.legend ?? {};
          const L = kw.legend !== undefined && kw.legend !== null ? seq(kw.legend) : null;
          const next: Record<string, unknown> = { ...cur };
          if (kw.legend === null) {
            delete next.x;
            delete next.y;
            delete next.s;
            delete next.h;
          } else if (L) Object.assign(next, { x: Number(L[0]), y: Number(L[1]), s: Number(L[2] ?? 1), ...(L[3] !== undefined ? { h: Number(L[3]) } : {}) });
          if (kw.legend_h !== undefined) {
            if (kw.legend_h === null) delete next.h;
            else next.h = Math.min(900, Math.max(60, Number(kw.legend_h)));
          }
          if (kw.legend_bg !== undefined) {
            if (kw.legend_bg === null) delete next.bg;
            else next.bg = String(kw.legend_bg);
          }
          patch.legend = Object.keys(next).length ? next : undefined;
        }
        if (kw.level !== undefined) patch.level = Math.max(1, Math.min(6, Math.round(Number(kw.level))));
        this.commit(updateNode(sk, String(a[0]), patch));
        return null;
      }
      case 'generate': {
        const id = a.length ? String(a[0]) : sk.nodes.find((n) => n.kind === 'mesh')?.id;
        if (!id || !this.host.mesh) throw new ConsoleError(t.notFound(String(a[0] ?? 'mesh')));
        const pr = this.host.mesh(id);
        if (pr) this.pending = pr;
        return null;
      }
      case 'regions': {
        const arr = computeArrangement(sk);
        return arr.regions.map((r) => {
          const as = assignOf(sk, arr, regionKey(r));
          const m = as ? sk.materials.find((x) => x.id === as.material) : undefined;
          return { tuple: [{ tuple: [Number(r.label.x.toFixed(4)), Number(r.label.y.toFixed(4))] }, Number(r.area.toFixed(6)), m?.name ?? null] };
        });
      }
      case 'remove':
        need(1);
        this.commit(removeNode(sk, String(a[0])));
        return null;
      case 'clear': {
        // Projeto vazio (sem nós, materiais, regiões, contornos nem circuitos): ponto de partida do script exportado.
        const e = emptySketch();
        this.commit({ ...e, nodes: [], materials: [], regionAssigns: [], boundaries: [], circuits: [], nextId: 1 });
        return null;
      }
      case 'reset':
        // Projeto novo com as bibliotecas padrão (materiais, contornos, malha), para scripts; o arquivo aberto não muda.
        this.commit(emptySketch());
        return null;
      case 'new':
      case 'open':
        throw new ConsoleError(t.useMenu);
    }
    throw new ConsoleError(t.unknownFunction(fn));
  }
}


/**
 * Objetos da API (também aparecem na árvore): g = Geometria (d é apelido), m = Malha,
 * s = Solucionador, r = Resultados. Sem objeto, vale como geometria (atalho do console).
 */
export const NAMESPACES = ['g', 'd', 'm', 's', 'r', 'c'] as const;

/** Método do objeto → comando interno. */
function resolveMethod(obj: string | null, fn: string): string {
  if (obj === null || obj === 'g' || obj === 'd') return fn;
  if (obj === 'm') return fn === 'add' ? 'add_mesh' : fn;
  if (obj === 'r') return fn === 'add' ? 'add_post' : fn === 'show' ? 'post_show' : fn;
  if (obj === 's') return fn === 'add' ? 'add_physics' : fn; // e comandos de geometria antigos com s. (compatibilidade)
  if (obj === 'c') return `sch_${fn}`;
  throw new ConsoleError(T().consoleCmd.unknownObject(obj));
}

const NODE_METHODS = {
  c: {
    add: 'add(name="Circuito 1")',
    part: 'part("n5", "V" | "I" | "R" | "L" | "C" | "gnd" | "coil", x=200, y=120, rot=90, value="10", amp="10", freq="50", phase="0", dc="0", circuit="c3")',
    wire: 'wire("n5", ("sp7", 1), ("sp8", 0), mid=240)',
    route: 'route("sw9", 240) ou route("sw9", y=80)  # trecho vertical em x / horizontal em y; None = automático',
    set: 'set("sp7", value="0.5", name="R1")',
    move: 'move("sp7", (240, 120))',
    rotate: 'rotate("sp7")',
    remove: 'remove("sp7")',
  },
  m: {
    add: 'add(name="Malha")',
    rename: 'rename("n1", "fina")',
    remove: 'remove("n1")',
    material: 'material("Cobre", mur=1, sigma=58, br=0, color="#e0914f")',
    del_material: 'del_material("Cobre")',
    circuit: 'circuit("Bobina", current="10", kind="series")',
    del_circuit: 'del_circuit("Bobina")',
    region: 'region((x, y), name="Bobina", material="Cobre", circuit="Bobina", current="10", turns=100, angle="90", label=(dx, dy))',
    boundary: 'boundary(["l1", "l2"], "nome do contorno" | "dirichlet" | "neumann" | "periodic" | "antiperiodic" | None)',
    boundary_def: 'boundary_def("Blindagem", type="dirichlet", value="0")',
    mesh_size: 'mesh_size((x, y), "0.5 mm" | "auto")',
    settings: 'settings("n1", size="2 mm" | "auto", min_angle=30)',
    generate: 'generate("n1")',
    regions: 'regions()  # [((x, y), área, material)]',
  },
  s: {
    add_physics: 'add_physics(name="Campo magnético")',
      rename: 'rename("n2", "...")',
    remove: 'remove("n2")',
    solve: 'solve("n2")',
  },
  r: {
    view: 'view("n2", name="Vista 2")',
    duplicate: 'duplicate("n5")  # camada ou vista',
    table: 'table("n2", name="Resultados")',
    item: 'item("n6", "lineint" | "surfint" | "formula" | "circuits", name="...")',
    move: 'move("n5", "n7")  # camada para outra vista',
    plot: 'plot("n4 (vista) | n2 (física)", "surface" | "contour" | "arrow" | "line", quantity="b" | "h" | "a" | "j" | "bn" | "bt", name="...")',
    show: 'show("n5", visible=True, n_lines=20, range=(0, 1.5), spacing=5, scale=1, curve="l3", quantity="bn", color="#1f6fd1", color_by_value=False, colormap="viridis")',
    interpolate: 'interpolate("n2", level=3)  # vista interpolada',
    result: 'result("Fx_s", physics="n2")  # número de uma variável de resultado',
    results: 'results("n2")  # [(nome, valor, unidade), ...]',
    series: 'series("I_bob")  # transitório: (tempos em s, valores)',
    rename: 'rename("n5", "...")',
    remove: 'remove("n5")',
  },
};

/** Assinaturas da API de geometria (autocompletar e dicas). */
export const API_SIGNATURES: Record<string, string> = {
  point: 'point((x, y))',
  line: 'line(a, b, construction=False)',
  circle: 'circle(centro, r=5)',
  arc: 'arc(centro, inicio, fim)',
  rectangle: 'rectangle(canto, oposto)',
  rectangle_center: 'rectangle_center(centro, canto)',
  horizontal: 'horizontal(l)',
  vertical: 'vertical(l)',
  parallel: 'parallel(a, b)',
  perpendicular: 'perpendicular(a, b)',
  tangent: 'tangent(a, b)',
  equal: 'equal(a, b)',
  coincident: 'coincident(a, b)',
  point_on: 'point_on(p, curva)',
  midpoint: 'midpoint(p, l)',
  symmetric: 'symmetric(p1, p2, axis="y" | linha)',
  concentric: 'concentric(c1, c2)',
  distance: 'distance(a, [b,] "50 mm")',
  hdistance: 'hdistance(a, b, "10 mm")',
  vdistance: 'vdistance(a, b, "10 mm")',
  radius: 'radius(c, "L/2")',
  diameter: 'diameter(c, 10)',
  angle: 'angle(l1, l2, "30 deg")',
  set_dimension: 'set_dimension("k5", "g*2")',
  var: 'var("g", "0.5 mm")',
  del_var: 'del_var("g")',
  rename_var: 'rename_var("g", "gap")',
  delete: 'delete(ids...)',
  rename: 'rename(id, "nome")',
  group: 'group([ids], name="rotor")',
  ungroup: 'ungroup(g)',
  hide: 'hide(g)',
  show: 'show(g)',
  move: 'move(p, (x, y))',
  translate: 'translate(ids, dx=5, dy=0)',
  rotate: 'rotate(ids, "15 deg", pivot=(0, 0))',
  set_radius: 'set_radius(c, 5)',
  detach: 'detach("O")',
  fix: 'fix(p)',
  unfix: 'unfix(p)',
  construction: 'construction(ids, True)',
  units: 'units("mm")',
  problem: 'problem("planar", depth="100 mm")',
  offset: 'offset(ids, "2 mm")',
  set_offset: 'set_offset(g, "-5 mm")',
  mirror: 'mirror(ids, axis="y")',
  array: 'array(ids, nx=3, ny=1, dx="20 mm", dy=0)',
  array_circular: 'array_circular(ids, n=6, angle="360 deg", center=(0, 0))',
  set_pattern: 'set_pattern(g, nx=4, dx="25 mm")',
  getid: 'getid("nome")',
  get: 'get(id)',
  list: 'list()',
  measure: 'measure(a, b)',
  area: 'area(ids)',
  value: 'value("k5")',
  dof: 'dof()',
};

const GLOBAL_FUNCS: Record<string, string> = { getid: 'getid("nome")', help: 'help()', fit: 'fit()', undo: 'undo()', redo: 'redo()' };

export interface Completion {
  /** Texto a inserir no lugar de `line.slice(start, cursor)`. */
  insert: string;
  label: string;
  detail?: string;
}

/**
 * Sugestões para o texto antes do cursor: métodos depois de "s.", funções/nomes no começo,
 * ids/nomes/variáveis dentro de aspas.
 */
export function completions(sk: Sketch, env: Map<string, Value>, before: string): { start: number; items: Completion[] } {
  // Dentro de aspas abertas?
  const quotes = (before.match(/"/g) ?? []).length + (before.match(/'/g) ?? []).length;
  if (quotes % 2 === 1) {
    const qi = Math.max(before.lastIndexOf('"'), before.lastIndexOf("'"));
    const prefix = before.slice(qi + 1);
    const items: Completion[] = [];
    const push = (insert: string, detail: string) => insert.toLowerCase().startsWith(prefix.toLowerCase()) && items.push({ insert, label: insert, detail });
    for (const e of Object.values(sk.entities)) {
      push(e.id, e.name ? `${e.type} · ${e.name}` : e.type);
      if (e.name) push(e.name, `${e.type} · ${e.id}`);
    }
    for (const g of sk.groups) push(g.name, `grupo · ${g.id}`);
    for (const v of sk.variables) push(v.name, `var = ${v.expr}`);
    for (const c of sk.constraints) push(c.id, c.type);
    for (const n of sk.nodes) push(n.id, `${n.kind} · ${n.name}`);
    return { start: qi + 1, items: items.slice(0, 60) };
  }
  const m = /(?:\b([gdmsrc])\.)?([A-Za-z_][A-Za-z0-9_]*)?$/.exec(before)!;
  const word = m[2] ?? '';
  const start = before.length - word.length;
  if (m[1]) {
    const ns = m[1];
    const table: Record<string, string> = ns === 'g' || ns === 'd' ? API_SIGNATURES : NODE_METHODS[ns as 'm' | 's' | 'r' | 'c'];
    const items = Object.entries(table)
      .filter(([k]) => k.startsWith(word))
      .map(([k, sig]) => ({ insert: `${k}(`, label: k, detail: `${ns}.${sig}` }));
    return { start, items };
  }
  if (!word) return { start, items: [] };
  const items: Completion[] = [];
  const nsInfo: Record<string, string> = { g: T().tree.geometry, m: T().tree.addMesh, s: T().tree.solver, r: T().tree.results, c: T().sch.section };
  for (const [k, info] of Object.entries(nsInfo)) if (k.startsWith(word) && word.length <= 1) items.push({ insert: `${k}.`, label: k, detail: info });
  for (const [k, sig] of Object.entries(GLOBAL_FUNCS)) if (k.startsWith(word)) items.push({ insert: `${k}(`, label: k, detail: sig });
  // Os comandos também funcionam sem o "s." (atalho do console).
  for (const [k, sig] of Object.entries(API_SIGNATURES)) if (k.startsWith(word) && !(k in GLOBAL_FUNCS)) items.push({ insert: `${k}(`, label: k, detail: sig });
  for (const [k, v] of env) if (k.startsWith(word)) items.push({ insert: k, label: k, detail: repr(v) });
  for (const e of Object.values(sk.entities)) if (e.name?.startsWith(word)) items.push({ insert: e.name, label: e.name, detail: e.id });
  return { start, items };
}

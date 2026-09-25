// Console de comandos (estilo console Python do FreeCAD): executa a mesma API do histórico.
// Subconjunto de Python: atribuição, chamadas s.metodo(...)/funcao(...), argumentos nomeados,
// strings, números, True/False/None, tuplas, listas, + − * / e comentários com #.
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
import { addNode, removeNode, updateNode } from './tree';
import { offsetCurves, setOffsetDistance } from './offset';
import { circularArray, ensureAxisLine, linearArray, mirrorEntities, setPattern } from './patterns';
import { isCurve, isDimension, ORIGIN_ID, type BoundaryType, type ConstraintType, type Id, type Material, type ProblemType, type RegionAssign, type Sketch } from './types';
import { computeArrangement } from './regions';
import { addBoundaryDef, addMaterial, assignOf, assignRegion, findBoundary, findMaterial, regionAtOrThrow, regionKey, removeMaterial, setBoundary, updateBoundaryDef, updateMaterial } from './mesh';
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
  mesh?: (id: string) => void;
}

export interface RunResult {
  ok: boolean;
  /** Texto a mostrar (repr do resultado, ou mensagem de erro). */
  out: string | null;
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
        return { ok: true, out: null };
      }
      return { ok: true, out: v === null || v === undefined ? null : repr(v) };
    } catch (e) {
      return { ok: false, out: (e as Error).message };
    }
  }

  private code = '';

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
        const id = this.pointOf(d, a[0], true);
        this.commit(d.sk);
        return id;
      }
      case 'line': {
        need(2);
        const d = new Draft(sk);
        const p1 = this.pointOf(d, a[0]);
        const p2 = this.pointOf(d, a[1]);
        const id = d.addLine(p1, p2, kw.construction === true);
        this.commit(d.sk);
        return id;
      }
      case 'circle': {
        need(1);
        const d = new Draft(sk);
        const c = this.pointOf(d, a[0]);
        const r = this.length(kw.r ?? a[1] ?? null);
        const id = d.addCircle(c, r, kw.construction === true);
        this.commit(d.sk);
        return id;
      }
      case 'arc': {
        need(3);
        const d = new Draft(sk);
        const c = this.pointOf(d, a[0]);
        const s = this.pointOf(d, a[1]);
        const e = this.pointOf(d, a[2]);
        const id = d.addArc(c, s, e, dist(pt(d.sk, c), pt(d.sk, s)), kw.construction === true);
        this.commit(d.sk);
        return id;
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
        this.commit(setOffsetDistance(sk, this.id(a[0]), this.signedLength(a[1])));
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
        const kind = fn === 'add_physics' ? 'physics-magnetic' : fn === 'add_mesh' ? 'mesh' : 'post';
        const name = kw.name ? String(kw.name) : fn === 'add_physics' ? T().tree.magnetic : fn === 'add_mesh' ? T().tree.addMesh : T().tree.addPost;
        const r = addNode(sk, kind, name);
        this.commit(r.sketch);
        return r.node.id;
      }
      case 'physics': {
        need(1);
        const id = String(a[0]);
        const patch: Record<string, string> = {};
        for (const k of ['analysis', 'frequency', 'dt']) if (kw[k] !== undefined) patch[k] = String(kw[k]);
        if (kw.t_end !== undefined) patch.tEnd = String(kw.t_end);
        this.commit(updateNode(sk, id, patch));
        return null;
      }
      // ----- malha: materiais, regiões e contornos -----
      case 'material': {
        need(1);
        const patch: Partial<Material> = {};
        for (const k of ['mur', 'sigma', 'br'] as const) if (kw[k] !== undefined) patch[k] = Number(kw[k]);
        if (kw.color !== undefined) patch.color = String(kw.color);
        if (kw.name !== undefined) patch.name = String(kw.name);
        const cur = findMaterial(sk, String(a[0]));
        if (cur) {
          this.commit(updateMaterial(sk, cur.id, patch));
          return cur.id;
        }
        const r = addMaterial(sk, String(a[0]), patch);
        this.commit(r.sketch);
        return r.material.id;
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
        this.commit(assignRegion(sk, arr, regionKey(r), patch));
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
        const patch: { type?: BoundaryType; value?: string; name?: string } = {};
        if (kw.type !== undefined) patch.type = String(kw.type) as BoundaryType;
        if (kw.value !== undefined) patch.value = String(kw.value);
        if (kw.name !== undefined) patch.name = String(kw.name);
        if (cur) {
          this.commit(updateBoundaryDef(sk, cur.id, patch));
          return cur.id;
        }
        const r = addBoundaryDef(sk, patch.type ?? 'dirichlet', name);
        this.commit(patch.value !== undefined ? updateBoundaryDef(r.sketch, r.boundary.id, { value: patch.value }) : r.sketch);
        return r.boundary.id;
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
      case 'generate': {
        const id = a.length ? String(a[0]) : sk.nodes.find((n) => n.kind === 'mesh')?.id;
        if (!id || !this.host.mesh) throw new ConsoleError(t.notFound(String(a[0] ?? 'mesh')));
        this.host.mesh(id);
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
export const NAMESPACES = ['g', 'd', 'm', 's', 'r'] as const;

/** Método do objeto → comando interno. */
function resolveMethod(obj: string | null, fn: string): string {
  if (obj === null || obj === 'g' || obj === 'd') return fn;
  if (obj === 'm') return fn === 'add' ? 'add_mesh' : fn;
  if (obj === 'r') return fn === 'add' ? 'add_post' : fn;
  if (obj === 's') return fn === 'add' ? 'add_physics' : fn; // e comandos de geometria antigos com s. (compatibilidade)
  throw new ConsoleError(T().consoleCmd.unknownObject(obj));
}

const NODE_METHODS = {
  m: {
    add: 'add(name="Malha")',
    rename: 'rename("n1", "fina")',
    remove: 'remove("n1")',
    material: 'material("Cobre", mur=1, sigma=58, br=0, color="#e0914f")',
    del_material: 'del_material("Cobre")',
    region: 'region((x, y), material="Cobre", current="10", turns=100, angle="90")',
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
  },
  r: { add: 'add(name="Resultado")', rename: 'rename("n3", "...")', remove: 'remove("n3")' },
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
  const m = /(?:\b([gdmsr])\.)?([A-Za-z_][A-Za-z0-9_]*)?$/.exec(before)!;
  const word = m[2] ?? '';
  const start = before.length - word.length;
  if (m[1]) {
    const ns = m[1];
    const table: Record<string, string> = ns === 'g' || ns === 'd' ? API_SIGNATURES : NODE_METHODS[ns as 'm' | 's' | 'r'];
    const items = Object.entries(table)
      .filter(([k]) => k.startsWith(word))
      .map(([k, sig]) => ({ insert: `${k}(`, label: k, detail: `${ns}.${sig}` }));
    return { start, items };
  }
  if (!word) return { start, items: [] };
  const items: Completion[] = [];
  const nsInfo: Record<string, string> = { g: T().tree.geometry, m: T().tree.addMesh, s: T().tree.solver, r: T().tree.results };
  for (const [k, info] of Object.entries(nsInfo)) if (k.startsWith(word) && word.length <= 1) items.push({ insert: `${k}.`, label: k, detail: info });
  for (const [k, sig] of Object.entries(GLOBAL_FUNCS)) if (k.startsWith(word)) items.push({ insert: `${k}(`, label: k, detail: sig });
  // Os comandos também funcionam sem o "s." (atalho do console).
  for (const [k, sig] of Object.entries(API_SIGNATURES)) if (k.startsWith(word) && !(k in GLOBAL_FUNCS)) items.push({ insert: `${k}(`, label: k, detail: sig });
  for (const [k, v] of env) if (k.startsWith(word)) items.push({ insert: k, label: k, detail: repr(v) });
  for (const e of Object.values(sk.entities)) if (e.name?.startsWith(word)) items.push({ insert: e.name, label: e.name, detail: e.id });
  return { start, items };
}

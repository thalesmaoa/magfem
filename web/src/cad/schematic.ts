// Circuito externo: geometria dos terminais no esquemático e netlist para o solver acoplado.
import { T } from '../i18n';
import { evaluate, evaluateVariables } from './expr';
import { depthOf } from './solve';
import { findRegion, type Arrangement } from './regions';
import type { Id, SchematicNode, SchPart, Sketch } from './types';

/** Terminais do componente (coordenadas do esquemático). Terra tem um terminal. */
export function pinsOf(p: SchPart): { x: number; y: number }[] {
  const local = p.kind === 'gnd' ? [{ x: 0, y: -20 }] : [{ x: -40, y: 0 }, { x: 40, y: 0 }];
  const a = (p.rot * Math.PI) / 180;
  const c = Math.round(Math.cos(a)), s = Math.round(Math.sin(a));
  return local.map((q) => ({ x: p.x + q.x * c - q.y * s, y: p.y + q.x * s + q.y * c }));
}

export interface Netlist {
  netNodes: number;
  elType: number[];
  elA: number[];
  elB: number[];
  elCoil: number[];
  elValue: number[];
  elFreq: number[];
  elPhase: number[];
  elDC: number[];
  coilStart: number[];
  coilRegion: number[];
  coilTurns: number[];
  coilR: number[];
  depth: number;
  /** Componente de cada elemento (na ordem de elType) e nó (1..) de cada terminal. */
  partOf: Id[];
  nodeOf: Map<string, number>;
  /** Circuitos do FEM ligados ao esquemático (as regiões deles recebem J = 0: a corrente vem do circuito). */
  coupledCircuits: Set<Id>;
}

const TYPE: Record<Exclude<SchPart['kind'], 'gnd'>, number> = { R: 0, L: 1, C: 2, V: 3, I: 4, coil: 5 };

/** Monta o netlist; devolve os problemas (terra, terminal solto, valores) em vez de lançar. */
export function buildNetlist(sk: Sketch, sch: SchematicNode, arr: Arrangement): { net: Netlist | null; problems: string[] } {
  const t = T();
  const problems: string[] = [];
  const key = (part: Id, pin: number) => `${part}:${pin}`;
  // União dos terminais ligados por fios.
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    const p = parent.get(k) ?? k;
    if (p === k) return k;
    const r = find(p);
    parent.set(k, r);
    return r;
  };
  for (const p of sch.parts) pinsOf(p).forEach((_, i) => parent.set(key(p.id, i), key(p.id, i)));
  for (const w of sch.wires) {
    const a = find(key(w.a.part, w.a.pin)), b = find(key(w.b.part, w.b.pin));
    if (a !== b) parent.set(a, b);
  }
  const grounds = sch.parts.filter((p) => p.kind === 'gnd');
  if (!grounds.length) problems.push(t.sch.noGround);
  const groundRoots = new Set(grounds.map((g) => find(key(g.id, 0))));
  // Terminais soltos: um terminal que não é ligado a mais nada.
  const count = new Map<string, number>();
  for (const k of parent.keys()) count.set(find(k), (count.get(find(k)) ?? 0) + 1);
  const nodeOf = new Map<string, number>();
  let nv = 0;
  for (const k of parent.keys()) {
    const r = find(k);
    if (groundRoots.has(r)) nodeOf.set(k, 0);
    else {
      if (!nodeOf.has(r)) nodeOf.set(r, ++nv);
      nodeOf.set(k, nodeOf.get(r)!);
    }
  }
  const { values } = evaluateVariables(sk.variables, sk.settings.unit);
  const val = (p: SchPart, expr: string | undefined, def: number) => {
    if (!expr?.trim()) return def;
    try {
      return evaluate(expr, { env: values, unit: sk.settings.unit }).v;
    } catch (e) {
      problems.push(`${p.name}: ${(e as Error).message}`);
      return def;
    }
  };
  const net: Netlist = {
    netNodes: nv,
    elType: [],
    elA: [],
    elB: [],
    elCoil: [],
    elValue: [],
    elFreq: [],
    elPhase: [],
    elDC: [],
    coilStart: [0],
    coilRegion: [],
    coilTurns: [],
    coilR: [],
    depth: depthOf(sk),
    partOf: [],
    nodeOf,
    coupledCircuits: new Set(),
  };
  const mats = new Map(sk.materials.map((m) => [m.id, m]));
  let coilIdx = 0;
  for (const p of sch.parts) {
    if (p.kind === 'gnd') continue;
    const a = nodeOf.get(key(p.id, 0))!, b = nodeOf.get(key(p.id, 1))!;
    if ((count.get(find(key(p.id, 0))) ?? 0) < 2 || (count.get(find(key(p.id, 1))) ?? 0) < 2) problems.push(t.sch.floating(p.name));
    net.elType.push(TYPE[p.kind]);
    net.elA.push(a);
    net.elB.push(b);
    net.partOf.push(p.id);
    const isSrc = p.kind === 'V' || p.kind === 'I';
    net.elValue.push(isSrc ? val(p, p.amp, 0) : p.kind === 'coil' ? 0 : val(p, p.value, p.kind === 'R' ? 1 : 1e-3));
    net.elFreq.push(isSrc ? val(p, p.freq, 50) : 0);
    net.elPhase.push(isSrc ? (val(p, p.phase, 0) * Math.PI) / 180 : 0);
    net.elDC.push(isSrc ? val(p, p.dc, 0) : 0);
    if (p.kind === 'coil') {
      const c = sk.circuits.find((x) => x.id === p.circuit);
      if (!c) {
        problems.push(`${p.name}: ${t.sch.coilMissing}`);
        net.elCoil.push(-1);
        continue;
      }
      net.coupledCircuits.add(c.id);
      net.elCoil.push(coilIdx++);
      let R = 0;
      for (const as of sk.regionAssigns) {
        if (as.circuit !== c.id) continue;
        const r = findRegion(arr, as);
        if (!r) continue;
        const N = as.turns ?? 1;
        net.coilRegion.push(r.index);
        net.coilTurns.push(N);
        // Resistência CC da região (σ do material; fator de enchimento 1).
        const sigma = (as.material ? mats.get(as.material)?.sigma ?? 0 : 0) * 1e6;
        const A = Math.abs(r.area) * 1e-6;
        const len = sk.settings.problem === 'axisymmetric' ? 2 * Math.PI * Math.abs(r.label.x) * 1e-3 : net.depth;
        if (sigma > 0 && A > 0) R += (N * N * len) / (sigma * A);
      }
      net.coilStart.push(net.coilRegion.length);
      net.coilR.push(R);
    } else net.elCoil.push(-1);
  }
  return { net: problems.length ? null : net, problems };
}

/** Tensão (a − b) e corrente de um componente no passo k (resultado do solver acoplado). */
export function partSignal(res: { nodeV: Float64Array; elI: Float64Array; netNodes: number; partOf: Id[]; nodeOf: Map<string, number> }, part: Id, k: number) {
  const e = res.partOf.indexOf(part);
  if (e < 0) return null;
  const ne = res.partOf.length;
  const a = res.nodeOf.get(`${part}:0`) ?? 0, b = res.nodeOf.get(`${part}:1`) ?? 0;
  const V = (n: number) => (n > 0 ? res.nodeV[k * res.netNodes + n - 1] : 0);
  return { i: res.elI[k * ne + e], v: V(a) - V(b) };
}

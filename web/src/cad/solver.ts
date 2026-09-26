// Ponte entre o modelo do sketch e o PlaneGCS (solver de restrições do FreeCAD, em WASM).
import { DebugMode, GcsWrapper, init_planegcs_module, SolveStatus, type SketchPrimitive } from '@salusoft89/planegcs';
import { pt } from './geometry';
import { dimPointIds, pointLineFoot, signedLineAngle } from './measure';
import type { Constraint, Id, Sketch } from './types';

let gcs: GcsWrapper | null = null;

/** Inicializa o módulo WASM (uma vez). `wasmUrl` é necessário no browser (Vite). */
export async function initSolver(wasmUrl?: string) {
  if (gcs) return;
  const mod = await init_planegcs_module(wasmUrl ? { locateFile: () => wasmUrl } : undefined);
  gcs = new GcsWrapper(new mod.GcsSystem());
  gcs.debug_mode = DebugMode.NoDebug;
}

/** Alvo de arraste: puxa um ponto para (x, y) ou o raio de um círculo/arco para r. */
export type DragTarget = { pointId: Id; x: number; y: number } | { radiusOf: Id; r: number };

export interface SolveResult {
  sketch: Sketch;
  ok: boolean;
  /** Curvas que colapsaram (linha de comprimento ~0 ou raio ~0) — sinal de restrições incompatíveis. */
  degenerate: Id[];
  dof: number;
  conflicting: Id[];
  redundant: Id[];
}

type Prim = Record<string, unknown> & { id: string; type: string };

const sgn = (v: number) => (v < 0 ? -1 : 1);

/** Traduz uma restrição do modelo em primitivas do PlaneGCS (ids `<id>#k`). */
function constraintPrims(sk: Sketch, c: Constraint): Prim[] {
  const E = (i: number) => sk.entities[c.refs[i]];
  const id = (k = 0) => `${c.id}#${k}`;
  const t0 = E(0)?.type;
  const t1 = E(1)?.type;
  const pair = (a: string, b: string) => (t0 === a && t1 === b) || (t0 === b && t1 === a);
  const byType = (t: string) => (t0 === t ? c.refs[0] : c.refs[1]);

  switch (c.type) {
    case 'coincident':
      return [{ id: id(), type: 'p2p_coincident', p1_id: c.refs[0], p2_id: c.refs[1] }];
    case 'concentric': {
      const [a, b] = [E(0), E(1)];
      if ((a?.type !== 'circle' && a?.type !== 'arc') || (b?.type !== 'circle' && b?.type !== 'arc')) return [];
      return [{ id: id(), type: 'p2p_coincident', p1_id: a.c, p2_id: b.c }];
    }
    case 'horizontal':
    case 'vertical': {
      const h = c.type === 'horizontal';
      if (c.refs.length === 1) return [{ id: id(), type: h ? 'horizontal_l' : 'vertical_l', l_id: c.refs[0] }];
      return [{ id: id(), type: h ? 'horizontal_pp' : 'vertical_pp', p1_id: c.refs[0], p2_id: c.refs[1] }];
    }
    case 'parallel':
      return [{ id: id(), type: 'parallel', l1_id: c.refs[0], l2_id: c.refs[1] }];
    case 'perpendicular':
      return [{ id: id(), type: 'perpendicular_ll', l1_id: c.refs[0], l2_id: c.refs[1] }];
    case 'tangent':
      if (pair('line', 'circle')) return [{ id: id(), type: 'tangent_lc', l_id: byType('line'), c_id: byType('circle') }];
      if (pair('line', 'arc')) return [{ id: id(), type: 'tangent_la', l_id: byType('line'), a_id: byType('arc') }];
      if (pair('circle', 'arc')) return [{ id: id(), type: 'tangent_ca', c_id: byType('circle'), a_id: byType('arc') }];
      if (t0 === 'circle' && t1 === 'circle') return [{ id: id(), type: 'tangent_cc', c1_id: c.refs[0], c2_id: c.refs[1] }];
      if (t0 === 'arc' && t1 === 'arc') return [{ id: id(), type: 'tangent_aa', a1_id: c.refs[0], a2_id: c.refs[1] }];
      return [];
    case 'equal':
      if (t0 === 'line' && t1 === 'line') return [{ id: id(), type: 'equal_length', l1_id: c.refs[0], l2_id: c.refs[1] }];
      if (t0 === 'circle' && t1 === 'circle') return [{ id: id(), type: 'equal_radius_cc', c1_id: c.refs[0], c2_id: c.refs[1] }];
      if (t0 === 'arc' && t1 === 'arc') return [{ id: id(), type: 'equal_radius_aa', a1_id: c.refs[0], a2_id: c.refs[1] }];
      if (pair('circle', 'arc')) return [{ id: id(), type: 'equal_radius_ca', c1_id: byType('circle'), a2_id: byType('arc') }];
      return [];
    case 'pointOn': {
      const cv = E(1);
      if (cv?.type === 'line') return [{ id: id(), type: 'point_on_line_pl', p_id: c.refs[0], l_id: cv.id }];
      if (cv?.type === 'circle') return [{ id: id(), type: 'point_on_circle', p_id: c.refs[0], c_id: cv.id }];
      if (cv?.type === 'arc') return [{ id: id(), type: 'point_on_arc', p_id: c.refs[0], a_id: cv.id }];
      return [];
    }
    case 'midpoint': {
      const l = E(1);
      if (l?.type !== 'line') return [];
      return [{ id: id(), type: 'p2p_symmetric_ppp', p1_id: l.p1, p2_id: l.p2, p_id: c.refs[0] }];
    }
    case 'radiusDiff': {
      // raio(filho) − raio(pai) = sign·valor; com parâmetro do solver a ordem troca para o sinal.
      const grows = (c.sign ?? 1) > 0;
      const [p1, p2] = grows ? [c.refs[0], c.refs[1]] : [c.refs[1], c.refs[0]];
      return [
        {
          id: id(),
          type: 'difference',
          param1: { o_id: p1, prop: 'radius' },
          param2: { o_id: p2, prop: 'radius' },
          difference: c.param ?? c.value ?? 0,
        },
      ];
    }
    case 'midpointOnLine':
      return [{ id: id(), type: 'midpoint_on_line_ll', l1_id: c.refs[0], l2_id: c.refs[1] }];
    case 'coordDiff': {
      const ax = c.axis ?? 'x';
      return [{ id: id(), type: 'difference', param1: { o_id: c.refs[0], prop: ax }, param2: { o_id: c.refs[1], prop: ax }, difference: c.param ?? c.value ?? 0 }];
    }
    case 'symmetricPoint':
      return [{ id: id(), type: 'p2p_symmetric_ppp', p1_id: c.refs[0], p2_id: c.refs[1], p_id: c.refs[2] }];
    case 'symmetric':
      return [{ id: id(), type: 'p2p_symmetric_ppl', p1_id: c.refs[0], p2_id: c.refs[1], l_id: c.refs[2] }];
    case 'distance': {
      const v = c.value ?? 0;
      const pp = dimPointIds(sk, c);
      if (pp) return [{ id: id(), type: 'p2p_distance', p1_id: pp[0], p2_id: pp[1], distance: c.param ?? v }];
      const pl = pointLineFoot(sk, c);
      if (pl) return [{ id: id(), type: 'p2l_distance', p_id: pl.pointId, l_id: pl.lineId, distance: v }];
      return [];
    }
    case 'hdistance':
    case 'vdistance': {
      const pp = dimPointIds(sk, c);
      if (!pp) return [];
      const prop = c.type === 'hdistance' ? 'x' : 'y';
      const a = pt(sk, pp[0]);
      const b = pt(sk, pp[1]);
      const s = sgn(prop === 'x' ? b.x - a.x : b.y - a.y);
      return [
        {
          id: id(),
          type: 'difference',
          param1: { o_id: pp[0], prop },
          param2: { o_id: pp[1], prop },
          difference: s * (c.value ?? 0),
        },
      ];
    }
    case 'radius':
    case 'diameter': {
      const e = E(0);
      const v = c.value ?? 0;
      if (e?.type === 'circle')
        return [c.type === 'radius' ? { id: id(), type: 'circle_radius', c_id: e.id, radius: v } : { id: id(), type: 'circle_diameter', c_id: e.id, diameter: v }];
      if (e?.type === 'arc')
        return [c.type === 'radius' ? { id: id(), type: 'arc_radius', a_id: e.id, radius: v } : { id: id(), type: 'arc_diameter', a_id: e.id, diameter: v }];
      return [];
    }
    case 'angle': {
      if (c.param) return [{ id: id(), type: 'l2l_angle_ll', l1_id: c.refs[0], l2_id: c.refs[1], angle: c.param }];
      if (c.sign) return [{ id: id(), type: 'l2l_angle_ll', l1_id: c.refs[0], l2_id: c.refs[1], angle: (c.sign * (c.value ?? 0) * Math.PI) / 180 }];
      // Ângulo do setor (direções invertidas conforme `flip`); o PlaneGCS usa as direções p1→p2,
      // e inverter uma direção soma π ao ângulo.
      const f = c.flip ?? [false, false];
      const s = sgn(signedLineAngle(sk, c.refs[0], c.refs[1], f));
      let a = (s * (c.value ?? 0) * Math.PI) / 180 + (f[0] !== f[1] ? Math.PI : 0);
      while (a > Math.PI) a -= 2 * Math.PI;
      while (a <= -Math.PI) a += 2 * Math.PI;
      return [{ id: id(), type: 'l2l_angle_ll', l1_id: c.refs[0], l2_id: c.refs[1], angle: a }];
    }
  }
}

function toPrimitives(sk: Sketch, drag: DragTarget[]): Prim[] {
  const points: Prim[] = [];
  const curves: Prim[] = [];
  for (const e of Object.values(sk.entities)) {
    if (e.type === 'point') points.push({ id: e.id, type: 'point', x: e.x, y: e.y, fixed: !!e.fixed });
  }
  for (const e of Object.values(sk.entities)) {
    if (e.type === 'line') curves.push({ id: e.id, type: 'line', p1_id: e.p1, p2_id: e.p2 });
    else if (e.type === 'circle') curves.push({ id: e.id, type: 'circle', c_id: e.c, radius: e.r });
    else if (e.type === 'arc') {
      const c = pt(sk, e.c);
      const s = pt(sk, e.s);
      const en = pt(sk, e.e);
      const start = Math.atan2(s.y - c.y, s.x - c.x);
      let end = Math.atan2(en.y - c.y, en.x - c.x);
      while (end <= start) end += 2 * Math.PI;
      curves.push({ id: e.id, type: 'arc', c_id: e.c, start_id: e.s, end_id: e.e, radius: e.r, start_angle: start, end_angle: end });
      curves.push({ id: `${e.id}#rules`, type: 'arc_rules', a_id: e.id });
    }
  }
  const cons = sk.constraints.flatMap((c) => constraintPrims(sk, c));
  const tmp: Prim[] = drag.flatMap((d): Prim[] => {
    if ('pointId' in d)
      return [
        { id: `drag#x#${d.pointId}`, type: 'coordinate_x', p_id: d.pointId, x: d.x, temporary: true },
        { id: `drag#y#${d.pointId}`, type: 'coordinate_y', p_id: d.pointId, y: d.y, temporary: true },
      ];
    const e = sk.entities[d.radiusOf];
    if (e?.type === 'circle') return [{ id: `drag#r#${e.id}`, type: 'circle_radius', c_id: e.id, radius: d.r, temporary: true }];
    if (e?.type === 'arc') return [{ id: `drag#r#${e.id}`, type: 'arc_radius', a_id: e.id, radius: d.r, temporary: true }];
    return [];
  });
  return [...points, ...curves, ...cons, ...tmp];
}

const ownerId = (gcsId: string) => gcsId.split('#')[0];

/** Resolve o sketch. Não altera a entrada; devolve um sketch novo com as posições resolvidas. */
export const offsetParam = (groupId: Id) => `off_${groupId}`;

/** Parâmetros do solver de um grupo: offset (distância) e padrões (passos). */
export function groupParams(g: Sketch['groups'][number]): { name: string; value: number }[] {
  if (g.offset) return [{ name: offsetParam(g.id), value: g.offset.distance }];
  const p = g.pattern;
  if (p?.kind === 'linear')
    return [
      { name: `pdx_${g.id}`, value: p.dx },
      { name: `pdy_${g.id}`, value: p.dy },
    ];
  if (p?.kind === 'circular') return [{ name: `pang_${g.id}`, value: circularStep(p.angle, p.n) }];
  return [];
}

/** Passo angular (rad) do padrão circular: volta completa divide por n; arco parcial por n−1. */
export function circularStep(angleDeg: number, n: number) {
  const full = Math.abs(Math.abs(angleDeg) - 360) < 1e-9;
  return (angleDeg * Math.PI) / 180 / (full ? n : n - 1);
}

/** Componentes conectados: curvas ligam seus pontos; restrições ligam suas referências. Devolve o representante de cada id. */
function componentsOf(sk: Sketch): (id: Id) => Id {
  const parent = new Map<Id, Id>();
  const find = (x: Id): Id => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  const union = (a: Id, b: Id) => parent.set(find(a), find(b));
  const ents = Object.values(sk.entities);
  for (const e of ents) parent.set(e.id, e.id);
  for (const e of ents) {
    if (e.type === 'line') [e.p1, e.p2].forEach((p) => union(e.id, p));
    else if (e.type === 'circle') union(e.id, e.c);
    else if (e.type === 'arc') [e.c, e.s, e.e].forEach((p) => union(e.id, p));
  }
  for (const c of sk.constraints) {
    const refs = c.refs.filter((r) => sk.entities[r]);
    for (const r of refs.slice(1)) union(refs[0], r);
  }
  return find;
}

/** Sketch só com as entidades de um conjunto de componentes (e as restrições delas). */
function subSketch(sk: Sketch, keep: (id: Id) => boolean): Sketch {
  const entities: Sketch['entities'] = {};
  for (const e of Object.values(sk.entities)) if (keep(e.id)) entities[e.id] = e;
  return { ...sk, entities, constraints: sk.constraints.filter((c) => c.refs.some((r) => entities[r])) };
}

/** Graus de liberdade de entidades sem restrições: 2 por ponto livre, 1 por círculo (raio), −1 por arco. */
function looseDof(ents: Sketch['entities'][string][]): number {
  let d = 0;
  for (const e of ents) {
    if (e.type === 'point') d += e.fixed ? 0 : 2;
    else if (e.type === 'circle') d += 1;
    else if (e.type === 'arc') d -= 1;
  }
  return d;
}

/**
 * Resolve o sketch. Não altera a entrada; devolve um sketch novo com as posições resolvidas.
 * `free`: parâmetros de offset liberados (arrastar o offset muda a distância).
 */
export function solve(sk: Sketch, drag: DragTarget[] = [], free: Set<string> = new Set()): SolveResult {
  if (!gcs) throw new Error('solver não inicializado (initSolver)');
  // Só os componentes com restrições (ou arrastados) vão ao PlaneGCS: geometria solta (ex.: importada)
  // já está consistente, e o custo do solver cresce rápido com o número de incógnitas.
  const find = componentsOf(sk);
  const active = new Set<Id>();
  for (const c of sk.constraints) for (const r of c.refs) if (sk.entities[r]) active.add(find(r));
  for (const d of drag) {
    const id = 'pointId' in d ? d.pointId : d.radiusOf;
    if (sk.entities[id]) active.add(find(id));
  }
  const loose = Object.values(sk.entities).filter((e) => !active.has(find(e.id)));
  const solved = loose.length ? subSketch(sk, (id) => active.has(find(id))) : sk;
  gcs.clear_data();
  for (const g of sk.groups) for (const p of groupParams(g)) gcs.push_sketch_param(p.name, p.value, !free.has(p.name));
  gcs.push_primitives_and_params(toPrimitives(solved, drag) as unknown as SketchPrimitive[]);
  const status = gcs.solve();
  const ok = status === SolveStatus.Success || status === SolveStatus.Converged;
  const conflicting = [...new Set(gcs.get_gcs_conflicting_constraints().map(ownerId))];
  const redundant = [...new Set(gcs.get_gcs_redundant_constraints().map(ownerId))];
  const dof = gcs.gcs.dof() + looseDof(loose);

  const entities = { ...sk.entities };
  if (ok) {
    gcs.apply_solution();
    for (const p of gcs.sketch_index.get_primitives()) {
      const e = entities[p.id];
      if (!e) continue;
      if (p.type === 'point' && e.type === 'point') entities[p.id] = { ...e, x: p.x, y: p.y };
      else if ((p.type === 'circle' && e.type === 'circle') || (p.type === 'arc' && e.type === 'arc'))
        entities[p.id] = { ...e, r: p.radius };
    }
  }
  let groups = sk.groups;
  if (ok && free.size) {
    // Distâncias de offset liberadas voltam atualizadas (o arraste muda o valor).
    groups = sk.groups.map((g) => {
      const read = (n: string) => (free.has(n) ? gcs!.get_sketch_param_value(n) : undefined);
      if (g.offset) {
        const v = read(offsetParam(g.id));
        return v !== undefined && v > 1e-9 ? { ...g, offset: { ...g.offset, distance: v } } : g;
      }
      const p = g.pattern;
      if (p?.kind === 'linear') {
        const dx = read(`pdx_${g.id}`);
        const dy = read(`pdy_${g.id}`);
        return dx === undefined && dy === undefined ? g : { ...g, pattern: { ...p, dx: dx ?? p.dx, dy: dy ?? p.dy } };
      }
      if (p?.kind === 'circular') {
        const st = read(`pang_${g.id}`);
        if (st === undefined) return g;
        const full = Math.abs(Math.abs(p.angle) - 360) < 1e-9;
        return full ? g : { ...g, pattern: { ...p, angle: (st * 180) / Math.PI * (p.n - 1) } };
      }
      return g;
    });
  }
  const out = { ...sk, entities, groups };
  return { sketch: out, ok, dof, conflicting, redundant, degenerate: ok ? degenerateCurves(out) : [] };
}

const DEGENERATE_TOL = 1e-6;

function degenerateCurves(sk: Sketch): Id[] {
  const bad: Id[] = [];
  for (const e of Object.values(sk.entities)) {
    if (e.type === 'line') {
      const a = pt(sk, e.p1);
      const b = pt(sk, e.p2);
      if (Math.hypot(b.x - a.x, b.y - a.y) < DEGENERATE_TOL) bad.push(e.id);
    } else if ((e.type === 'circle' || e.type === 'arc') && Math.abs(e.r) < DEGENERATE_TOL) bad.push(e.id);
  }
  return bad;
}

/** DOF do sistema com primitivas extras (sondagem); não aplica a solução. */
function dofWith(sk: Sketch, extra: Prim[]): number {
  gcs!.clear_data();
  for (const g of sk.groups) for (const p of groupParams(g)) gcs!.push_sketch_param(p.name, p.value, true);
  gcs!.push_primitives_and_params([...toPrimitives(sk, []), ...extra] as unknown as SketchPrimitive[]);
  gcs!.solve();
  return gcs!.gcs.dof();
}

/**
 * Entidades totalmente definidas (pintadas de preto, como no Onshape; não podem ser arrastadas).
 * Um ponto está definido se prendê-lo na posição atual não reduz o DOF; um raio, idem.
 * Testa primeiro cada componente conectado inteiro e só desce ponto a ponto quando necessário.
 */
export function definedEntities(sk: Sketch, dof: number): Set<Id> {
  if (!gcs) throw new Error('solver não inicializado (initSolver)');
  const ents = Object.values(sk.entities);
  const all = new Set(ents.map((e) => e.id));
  if (dof === 0) return all;
  const find = componentsOf(sk);

  // Sondas: ponto (x e y presos) ou raio preso.
  type Probe = { id: Id; prims: Prim[] };
  const probeOf = (id: Id): Probe | null => {
    const e = sk.entities[id];
    if (e.type === 'point') {
      if (e.fixed) return null;
      return {
        id,
        prims: [
          { id: `probe#x#${id}`, type: 'coordinate_x', p_id: id, x: e.x },
          { id: `probe#y#${id}`, type: 'coordinate_y', p_id: id, y: e.y },
        ],
      };
    }
    if (e.type === 'circle') return { id, prims: [{ id: `probe#r#${id}`, type: 'circle_radius', c_id: id, radius: e.r }] };
    return null; // linha e arco dependem só dos pontos (o raio do arco segue os pontos)
  };
  const comps = new Map<Id, Probe[]>();
  for (const e of ents) {
    const pr = probeOf(e.id);
    if (!pr) continue;
    const k = find(e.id);
    comps.set(k, [...(comps.get(k) ?? []), pr]);
  }
  const constrained = new Set<Id>();
  for (const c of sk.constraints) for (const r of c.refs) if (sk.entities[r]) constrained.add(find(r));
  const free = new Set<Id>();
  for (const [k, probes] of comps) {
    // Componente sem restrições: tudo que não é fixo é livre (sem chamar o solver).
    if (!constrained.has(k)) {
      probes.forEach((p) => free.add(p.id));
      continue;
    }
    // Sondagem só no sistema do componente (pequeno), não no desenho inteiro.
    const comp = subSketch(sk, (id) => find(id) === k);
    const d0 = dofWith(comp, []);
    if (dofWith(comp, probes.flatMap((p) => p.prims)) === d0) continue; // componente todo definido
    for (const p of probes) if (dofWith(comp, p.prims) !== d0) free.add(p.id);
  }
  const defined = new Set<Id>();
  for (const e of ents) {
    let ok: boolean;
    if (e.type === 'point') ok = !free.has(e.id);
    else if (e.type === 'line') ok = !free.has(e.p1) && !free.has(e.p2);
    else if (e.type === 'circle') ok = !free.has(e.c) && !free.has(e.id);
    else ok = !free.has(e.c) && !free.has(e.s) && !free.has(e.e);
    if (ok) defined.add(e.id);
  }
  return defined;
}

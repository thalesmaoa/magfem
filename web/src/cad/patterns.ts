// Espelhar e padrões (linear x/y e circular): copiam entidades e as restrições internas.
import { T } from '../i18n';
import { curvePoints, pt, type Vec } from './geometry';
import { Draft, expandSelection } from './ops';
import { isCurve, ORIGIN_ID, type Constraint, type Id, type LineEnt, type PatternSpec, type PointEnt, type Sketch } from './types';
import { circularStep } from './solver';

type MapPoint = (p: Vec) => Vec;

/** Restrições de orientação que só continuam válidas em translações (ou espelho em eixo X/Y). */
const ORIENTATION = new Set<Constraint['type']>(['horizontal', 'vertical', 'hdistance', 'vdistance']);

/**
 * Copia `ids` (curvas e pontos soltos) aplicando `map` aos pontos. `mirror` inverte o sentido dos
 * arcos (espelho troca anti-horário por horário). Restrições com todas as referências dentro da
 * seleção são copiadas, exceto as de orientação quando `keepOrientation` é falso.
 */
function copyInto(
  d: Draft,
  sk: Sketch,
  ids: Id[],
  map: MapPoint,
  mirror: boolean,
  keepOrientation: boolean,
  opts: { copyConstraints?: boolean; shareFixedPoints?: boolean } = {},
): { created: Id[]; idMap: Map<Id, Id> } {
  const idMap = new Map<Id, Id>();
  const created: Id[] = [];
  const pointCopy = (pid: Id): Id => {
    if (opts.shareFixedPoints) {
      // Ponto que não se move com a transformação (ex.: sobre o eixo do espelho) é compartilhado.
      const P = pt(sk, pid);
      const q = map(P);
      if (Math.hypot(q.x - P.x, q.y - P.y) < 1e-9) return pid;
    }
    if (pid === ORIGIN_ID) {
      // A origem é fixa: a cópia ganha um ponto próprio na posição transformada.
      const q = map(pt(sk, pid));
      if (Math.hypot(q.x, q.y) < 1e-12) return ORIGIN_ID;
    }
    let n = idMap.get(pid);
    if (!n) {
      const q = map(pt(sk, pid));
      // Só é "ponto solto" a cópia de um ponto solto selecionado (nunca a cópia da origem ou de pontas de curva).
      const standalone = pid !== ORIGIN_ID && ids.includes(pid) && !!(sk.entities[pid] as { free?: boolean }).free;
      n = d.addPoint(q.x, q.y, standalone);
      idMap.set(pid, n);
    }
    return n;
  };
  for (const id of ids) {
    const e = sk.entities[id];
    if (!e) continue;
    if (e.type === 'point') {
      if (id !== ORIGIN_ID) created.push(pointCopy(id));
      continue;
    }
    let n: Id;
    if (e.type === 'line') n = d.addLine(pointCopy(e.p1), pointCopy(e.p2), e.construction);
    else if (e.type === 'circle') n = d.addCircle(pointCopy(e.c), e.r, e.construction);
    else n = mirror ? d.addArc(pointCopy(e.c), pointCopy(e.e), pointCopy(e.s), e.r, e.construction) : d.addArc(pointCopy(e.c), pointCopy(e.s), pointCopy(e.e), e.r, e.construction);
    idMap.set(id, n);
    created.push(n);
  }
  // Restrições internas: mesmas relações entre as cópias (mantêm a forma).
  const inside = new Set([...ids, ...ids.flatMap((i) => (isCurve(sk.entities[i]) ? curvePoints(sk.entities[i] as never) : []))]);
  for (const c of opts.copyConstraints === false ? [] : sk.constraints) {
    if (!c.refs.every((r) => inside.has(r) && idMap.has(r))) continue;
    if (!keepOrientation && ORIENTATION.has(c.type)) continue;
    const extra: Partial<Constraint> = {};
    if (c.value !== undefined) extra.value = c.value;
    if (c.expr) extra.expr = c.expr;
    if (c.label) extra.label = c.label;
    if (c.flip) extra.flip = mirror ? [!c.flip[0], c.flip[1]] : c.flip;
    d.addConstraint(c.type, c.refs.map((r) => idMap.get(r)!), extra);
  }
  return { created, idMap };
}

function groupName(d: Draft, base: string) {
  const n = d.sk.groups.filter((g) => g.name.startsWith(base)).length + 1;
  return `${base} ${n}`;
}

export type MirrorAxis = 'x' | 'y' | Id;

/**
 * Espelho associativo (como no Onshape): a cópia fica presa ao original por restrições de simetria
 * em relação ao eixo — mexer no original atualiza o espelho. Eixo: X, Y (linha auxiliar invisível)
 * ou uma linha do desenho. Pontos sobre o eixo são compartilhados (as metades ficam ligadas).
 */
export function mirrorEntities(sk: Sketch, sel: Id[], axis: MirrorAxis): { sketch: Sketch; groupId: Id; created: Id[] } {
  const ids = expandSelection(sk, sel).filter((id) => id !== axis);
  if (!ids.length) throw new Error(T().patterns.nothing);
  const d = new Draft(sk);
  const aux: Id[] = [];
  let axisLine: Id;
  let a: Vec, b: Vec;
  if (axis === 'x' || axis === 'y') {
    a = { x: 0, y: 0 };
    b = axis === 'x' ? { x: 1, y: 0 } : { x: 0, y: 1 };
    const r = ensureAxisLine(d, axis);
    axisLine = r.line;
    if (r.created) aux.push(...r.created);
  } else {
    const l = sk.entities[axis];
    if (l?.type !== 'line') throw new Error(T().patterns.axisMustBeLine);
    axisLine = axis;
    [a, b] = [pt(sk, l.p1), pt(sk, l.p2)];
  }
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const L2 = ux * ux + uy * uy;
  const map: MapPoint = (p) => {
    const t = ((p.x - a.x) * ux + (p.y - a.y) * uy) / L2;
    const fx = a.x + t * ux;
    const fy = a.y + t * uy;
    return { x: 2 * fx - p.x, y: 2 * fy - p.y };
  };
  const { created, idMap } = copyInto(d, sk, ids, map, true, false, { copyConstraints: false, shareFixedPoints: true });
  // Simetria ponto a ponto (define a cópia inteira); círculos também com raio igual.
  for (const [orig, copy] of idMap) {
    const e = sk.entities[orig];
    if (e?.type === 'point' && copy !== orig) d.addConstraint('symmetric', [orig, copy, axisLine], { internal: true });
    if (e?.type === 'circle') d.addConstraint('equal', [orig, copy], { internal: true });
  }
  const groupId = d.addGroup(groupName(d, T().patterns.mirrorGroup), [...created, ...aux]);
  return { sketch: d.sk, groupId, created };
}

/** Pontos de origem que as cópias precisam seguir (pontos soltos e pontos das curvas). */
function sourcePoints(sk: Sketch, ids: Id[]): Id[] {
  const out: Id[] = [];
  const add = (p: Id) => !out.includes(p) && out.push(p);
  for (const id of ids) {
    const e = sk.entities[id];
    if (e?.type === 'point') add(id);
    else if (isCurve(e)) curvePoints(e).forEach(add);
  }
  return out;
}

/** Grupo de padrão: filho do grupo que contém toda a origem (ou raiz). */
function patternGroup(sk: Sketch, d: Draft, ids: Id[], base: string, created: Id[], pattern: PatternSpec, opts: { groupId?: Id; name?: string }) {
  const parent = sk.groups.find((g) => ids.every((i) => g.members.includes(i)));
  const id = opts.groupId ?? `g${d.sk.nextId++}`;
  const group = { id, name: opts.name ?? groupName(d, base), members: created, ...(parent ? { parent: parent.id } : {}), pattern };
  d.sk.groups = [...d.sk.groups.filter((g) => g.id !== id), group];
  return id;
}

/**
 * Padrão linear associativo: nx × ny (a origem é a primeira). Cada cópia fica a (dx, 0) da vizinha
 * da coluna anterior ou a (0, dy) da da linha anterior — dx e dy são parâmetros do solver
 * (editáveis; arrastar uma cópia muda o espaçamento). Mexer na origem leva as cópias junto.
 */
export function linearArray(sk: Sketch, sel: Id[], nx: number, ny: number, dx: number, dy: number, opts: { groupId?: Id; name?: string } = {}): { sketch: Sketch; groupId: Id; created: Id[] } {
  const ids = expandSelection(sk, sel).filter((id) => !(sk.entities[id] as { aux?: boolean })?.aux);
  if (!ids.length) throw new Error(T().patterns.nothing);
  if (nx < 1 || ny < 1 || nx * ny < 2 || nx * ny > 400) throw new Error(T().patterns.badCount);
  const d = new Draft(sk);
  const created: Id[] = [];
  const gid = opts.groupId ?? `g${d.sk.nextId++}`;
  const srcPts = sourcePoints(sk, ids);
  const grid = new Map<string, Map<Id, Id>>(); // "i,j" → (ponto da origem → ponto da cópia)
  grid.set('0,0', new Map(srcPts.map((p) => [p, p])));
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      if (i === 0 && j === 0) continue;
      const { created: c, idMap } = copyInto(d, sk, ids, (p) => ({ x: p.x + i * dx, y: p.y + j * dy }), false, true, { copyConstraints: false });
      created.push(...c);
      grid.set(`${i},${j}`, new Map(srcPts.map((p) => [p, idMap.get(p) ?? p])));
      // Vizinha anterior: na mesma linha (i−1) ou, na primeira coluna, a linha anterior (j−1).
      const prev = grid.get(i > 0 ? `${i - 1},${j}` : `${i},${j - 1}`)!;
      for (const p of srcPts) {
        const a = prev.get(p)!;
        const b = idMap.get(p);
        if (!b || a === b) continue;
        d.addConstraint('coordDiff', [a, b], { axis: 'x', internal: true, ...(i > 0 ? { param: `pdx_${gid}`, value: dx } : { value: 0 }) });
        d.addConstraint('coordDiff', [a, b], { axis: 'y', internal: true, ...(i > 0 ? { value: 0 } : { param: `pdy_${gid}`, value: dy }) });
      }
      for (const src of ids) if (sk.entities[src]?.type === 'circle') d.addConstraint('equal', [src, idMap.get(src)!], { internal: true });
    }
  patternGroup(sk, d, ids, T().patterns.arrayGroup, created, { kind: 'linear', src: ids, nx, ny, dx, dy }, { groupId: gid, name: opts.name });
  return { sketch: d.sk, groupId: gid, created };
}

/**
 * Padrão circular associativo: n posições (a origem conta) em `angle` graus em torno do ponto `center`.
 * Para cada ponto, linhas auxiliares centro→ponto de cópias vizinhas têm o mesmo comprimento e
 * o ângulo entre elas é o passo (parâmetro do solver). Mexer na origem leva as cópias junto.
 */
export function circularArray(sk: Sketch, sel: Id[], n: number, angle: number, center: Vec | Id, opts: { groupId?: Id; name?: string } = {}): { sketch: Sketch; groupId: Id; created: Id[] } {
  const ids = expandSelection(sk, sel).filter((id) => !(sk.entities[id] as { aux?: boolean })?.aux);
  if (!ids.length) throw new Error(T().patterns.nothing);
  if (n < 2 || n > 400) throw new Error(T().patterns.badCount);
  const d = new Draft(sk);
  const gid = opts.groupId ?? `g${d.sk.nextId++}`;
  // Centro: um ponto do desenho (id), ou a coordenada (usa a origem se for (0,0), senão um ponto fixo auxiliar).
  let cid: Id;
  const aux: Id[] = [];
  if (typeof center === 'string') cid = center;
  else if (Math.hypot(center.x, center.y) < 1e-12) cid = ORIGIN_ID;
  else {
    cid = d.addPoint(center.x, center.y);
    d.sk.entities[cid] = { ...(d.sk.entities[cid] as PointEnt), fixed: true, aux: true };
    aux.push(cid);
  }
  const C = pt(d.sk, cid);
  const step = circularStep(angle, n);
  const param = `pang_${gid}`;
  const srcPts = sourcePoints(sk, ids).filter((p) => p !== cid && Math.hypot(pt(sk, p).x - C.x, pt(sk, p).y - C.y) > 1e-9);
  // Linha auxiliar centro→ponto (para "mesmo raio" e "ângulo do passo").
  const spoke = (p: Id) => {
    const l = d.addLine(cid, p, true);
    d.sk.entities[l] = { ...(d.sk.entities[l] as LineEnt), aux: true };
    aux.push(l);
    return l;
  };
  const prevSpoke = new Map(srcPts.map((p) => [p, spoke(p)]));
  const created: Id[] = [];
  for (let k = 1; k < n; k++) {
    const c = Math.cos(k * step);
    const s2 = Math.sin(k * step);
    const map: MapPoint = (p) => ({ x: C.x + c * (p.x - C.x) - s2 * (p.y - C.y), y: C.y + s2 * (p.x - C.x) + c * (p.y - C.y) });
    const { created: cr, idMap } = copyInto(d, sk, ids, map, false, false, { copyConstraints: false, shareFixedPoints: true });
    created.push(...cr);
    for (const p of srcPts) {
      const q = idMap.get(p);
      if (!q || q === p) continue;
      const l = spoke(q);
      d.addConstraint('equal', [prevSpoke.get(p)!, l], { internal: true });
      d.addConstraint('angle', [prevSpoke.get(p)!, l], { internal: true, param, value: (step * 180) / Math.PI });
      prevSpoke.set(p, l);
    }
    for (const src of ids) if (sk.entities[src]?.type === 'circle') d.addConstraint('equal', [src, idMap.get(src)!], { internal: true });
  }
  patternGroup(sk, d, ids, T().patterns.circularGroup, [...created, ...aux], { kind: 'circular', src: ids, n, angle, center: cid }, { groupId: gid, name: opts.name });
  return { sketch: d.sk, groupId: gid, created };
}

/**
 * Muda os parâmetros de um padrão. Só passo/ângulo: recoloca as cópias (mesmos ids);
 * quantidade mudou: refaz o padrão no mesmo grupo (mesmo nome e lugar na árvore).
 */
export function setPattern(sk: Sketch, gid: Id, next: Partial<{ nx: number; ny: number; dx: number; dy: number; n: number; angle: number }>): Sketch {
  const g = sk.groups.find((x) => x.id === gid);
  const p = g?.pattern;
  if (!g || !p) throw new Error(T().patterns.nothing);
  const spec: PatternSpec = p.kind === 'linear' ? { ...p, ...pick(next, ['nx', 'ny', 'dx', 'dy']) } : { ...p, ...pick(next, ['n', 'angle']) };
  // Remove as cópias antigas e recria no mesmo grupo; as cópias ficam na posição exata (sem mexer na origem).
  const kill = new Set(g.members);
  const entities = { ...sk.entities };
  for (const id of kill) if (id !== ORIGIN_ID) delete entities[id];
  const used = new Set<Id>();
  for (const e of Object.values(entities)) if (isCurve(e)) curvePoints(e).forEach((q) => used.add(q));
  for (const e of Object.values(entities)) if (e.type === 'point' && !e.free && !used.has(e.id) && e.id !== ORIGIN_ID && !(spec.kind === 'circular' && e.id === spec.center)) delete entities[e.id];
  const base: Sketch = { ...sk, entities, constraints: sk.constraints.filter((c) => c.refs.every((r) => entities[r])), groups: sk.groups.filter((x) => x.id !== gid) };
  const r =
    spec.kind === 'linear'
      ? linearArray(base, spec.src, spec.nx, spec.ny, spec.dx, spec.dy, { groupId: gid, name: g.name })
      : circularArray(base, spec.src, spec.n, spec.angle, entities[spec.center] ? spec.center : { x: 0, y: 0 }, { groupId: gid, name: g.name });
  return r.sketch;
}

function pick<T extends object>(o: T, keys: string[]): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([k, v]) => keys.includes(k) && v !== undefined)) as Partial<T>;
}

/**
 * Linha auxiliar (invisível, fixa) sobre o eixo X ou Y, da origem até (1,0)/(0,1).
 * Reaproveita a existente — usada por espelho e simetria em relação aos eixos.
 */
export function ensureAxisLine(d: Draft, axis: 'x' | 'y'): { line: Id; created?: Id[] } {
  const tip = axis === 'x' ? { x: 1, y: 0 } : { x: 0, y: 1 };
  for (const e of Object.values(d.sk.entities)) {
    if (e.type !== 'line' || !e.aux || e.p1 !== ORIGIN_ID) continue;
    const q = d.sk.entities[e.p2];
    if (q?.type === 'point' && q.fixed && q.aux && Math.abs(q.x - tip.x) < 1e-12 && Math.abs(q.y - tip.y) < 1e-12) return { line: e.id };
  }
  const far = d.addPoint(tip.x, tip.y);
  d.sk.entities[far] = { ...(d.sk.entities[far] as PointEnt), fixed: true, aux: true };
  const line = d.addLine(ORIGIN_ID, far, true);
  d.sk.entities[line] = { ...(d.sk.entities[line] as LineEnt), aux: true };
  return { line, created: [far, line] };
}

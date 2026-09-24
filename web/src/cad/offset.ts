// Offset de curvas (linhas, arcos, círculos; cadeias abertas ou contornos fechados).
// Distância positiva: para fora de contornos fechados; à esquerda do percurso em cadeias abertas.
import { T } from '../i18n';
import { add, arcAngles, dist, dot, lineIntersection, mul, norm, perp, pt, sub, type Vec } from './geometry';
import { Draft } from './ops';
import { offsetParam } from './solver';
import { isCurve, type ArcEnt, type Curve, type Id, type LineEnt, type PointEnt, type Sketch } from './types';

type Elem = { cv: LineEnt | ArcEnt; fwd: boolean }; // fwd: percorrido p1→p2 (linha) ou s→e (arco)

const endsOf = (c: LineEnt | ArcEnt): [Id, Id] => (c.type === 'line' ? [c.p1, c.p2] : [c.s, c.e]);

/** Agrupa linhas/arcos em cadeias conectadas pelas pontas (grau ≤ 2). */
function chains(curves: (LineEnt | ArcEnt)[]): { elems: Elem[]; closed: boolean }[] {
  const byPoint = new Map<Id, (LineEnt | ArcEnt)[]>();
  for (const c of curves) for (const p of endsOf(c)) byPoint.set(p, [...(byPoint.get(p) ?? []), c]);
  for (const [, list] of byPoint) if (list.length > 2) throw new Error(T().offset.branching);
  const used = new Set<Id>();
  const out: { elems: Elem[]; closed: boolean }[] = [];
  for (const c0 of curves) {
    if (used.has(c0.id)) continue;
    // Anda para trás até a ponta livre (ou volta ao começo, se fechado).
    let start = c0;
    let startFrom = endsOf(c0)[0];
    for (let guard = 0; guard < curves.length; guard++) {
      const other = (byPoint.get(startFrom) ?? []).find((x) => x.id !== start.id);
      if (!other || other.id === c0.id) break;
      const [a, b] = endsOf(other);
      startFrom = a === startFrom ? b : a;
      start = other;
    }
    const elems: Elem[] = [];
    let cur = start;
    let from = startFrom;
    let closed = false;
    for (let guard = 0; guard <= curves.length; guard++) {
      used.add(cur.id);
      const [a, b] = endsOf(cur);
      const fwd = a === from;
      elems.push({ cv: cur, fwd });
      const to = fwd ? b : a;
      const next = (byPoint.get(to) ?? []).find((x) => x.id !== cur.id);
      if (!next) break;
      if (next.id === start.id) {
        closed = true;
        break;
      }
      from = to;
      cur = next;
    }
    out.push({ elems, closed });
  }
  return out;
}

/** Área assinada (×2) de uma cadeia fechada, para saber o sentido do percurso. */
function signedArea2(sk: Sketch, elems: Elem[]): number {
  let a2 = 0;
  for (const { cv, fwd } of elems) {
    const [p, q] = endsOf(cv);
    const A = pt(sk, fwd ? p : q);
    const B = pt(sk, fwd ? q : p);
    if (cv.type === 'line') a2 += A.x * B.y - B.x * A.y;
    else {
      const { c, start, end } = arcAngles(sk, cv);
      const r = cv.r;
      const I = r * r * (end - start) + r * (c.x * (Math.sin(end) - Math.sin(start)) - c.y * (Math.cos(end) - Math.cos(start)));
      a2 += fwd ? I : -I;
    }
  }
  return a2;
}

/** Suporte deslocado de um elemento: reta (ponto + direção) ou círculo (centro + raio). */
type Support = { kind: 'line'; a: Vec; b: Vec } | { kind: 'circle'; c: Vec; r: number };

function offsetSupport(sk: Sketch, e: Elem, off: number): Support {
  const { cv, fwd } = e;
  if (cv.type === 'line') {
    const A = pt(sk, fwd ? cv.p1 : cv.p2);
    const B = pt(sk, fwd ? cv.p2 : cv.p1);
    const n = perp(norm(sub(B, A))); // esquerda do percurso
    return { kind: 'line', a: add(A, mul(n, off)), b: add(B, mul(n, off)) };
  }
  // Arco anti-horário percorrido s→e: a esquerda aponta para o centro (raio diminui).
  const r = fwd ? cv.r - off : cv.r + off;
  if (r <= 1e-9) throw new Error(T().offset.radiusCollapses);
  return { kind: 'circle', c: pt(sk, cv.c), r };
}

function intersections(s1: Support, s2: Support): Vec[] {
  if (s1.kind === 'line' && s2.kind === 'line') {
    const p = lineIntersection(s1.a, s1.b, s2.a, s2.b);
    return p ? [p] : [];
  }
  if (s1.kind === 'circle' && s2.kind === 'line') return intersections(s2, s1);
  if (s1.kind === 'line' && s2.kind === 'circle') {
    const d = norm(sub(s1.b, s1.a));
    const f = sub(s1.a, s2.c);
    const b = dot(f, d);
    const c = dot(f, f) - s2.r * s2.r;
    const disc = b * b - c;
    if (disc < -1e-12) return [];
    const sq = Math.sqrt(Math.max(0, disc));
    return [add(s1.a, mul(d, -b - sq)), add(s1.a, mul(d, -b + sq))];
  }
  // círculo-círculo
  const c1 = (s1 as { c: Vec }).c;
  const c2 = (s2 as { c: Vec }).c;
  const r1 = (s1 as { r: number }).r;
  const r2 = (s2 as { r: number }).r;
  const D = dist(c1, c2);
  if (D < 1e-12 || D > r1 + r2 + 1e-9 || D < Math.abs(r1 - r2) - 1e-9) return [];
  const a = (r1 * r1 - r2 * r2 + D * D) / (2 * D);
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const u = norm(sub(c2, c1));
  const m = add(c1, mul(u, a));
  return [add(m, mul(perp(u), h)), add(m, mul(perp(u), -h))];
}

/** Ponto deslocado da ponta do elemento (vértice original + normal à esquerda × off). */
function naiveEnd(sk: Sketch, e: Elem, atEnd: boolean, off: number): Vec {
  const { cv, fwd } = e;
  const [p, q] = endsOf(cv);
  const vid = atEnd === fwd ? q : p;
  const V = pt(sk, vid);
  if (cv.type === 'line') {
    const A = pt(sk, fwd ? cv.p1 : cv.p2);
    const B = pt(sk, fwd ? cv.p2 : cv.p1);
    return add(V, mul(perp(norm(sub(B, A))), off));
  }
  const C = pt(sk, cv.c);
  const outward = norm(sub(V, C));
  return add(V, mul(outward, fwd ? -off : off));
}

export interface OffsetResult {
  sketch: Sketch;
  created: Id[];
  groupId: Id;
}

/**
 * Offset associativo (como no Onshape): um grupo com um parâmetro — a distância.
 * Todos os lados ficam à mesma distância do pai (parâmetro do solver `off_<grupo>`):
 * - linha: paralela ao pai + conector auxiliar perpendicular (ângulo com sinal fixa o lado);
 * - arco/círculo: mesmo centro, raio = raio do pai ± distância;
 * - cantos: pontos compartilhados entre vizinhos (interseção);
 * - pontas de cadeia aberta: linhas de construção perpendiculares ao pai.
 * A distância fica presa, mas é liberada ao arrastar o offset (o valor acompanha o mouse).
 * `d` em mm: o sinal escolhe o lado (+ para fora / esquerda). `groupId`: reaproveitar (inverter lado).
 */
export function offsetCurves(sk: Sketch, ids: Id[], d: number, opts: { groupId?: Id; name?: string } = {}): OffsetResult {
  const all = ids.map((id) => sk.entities[id]).filter(isCurve) as Curve[];
  if (!all.length) throw new Error(T().offset.nothing);
  if (Math.abs(d) < 1e-12) throw new Error(T().offset.zero);
  const draft = new Draft(sk);
  const created: Id[] = [];
  const groupId = opts.groupId ?? `g${draft.sk.nextId++}`;
  const param = offsetParam(groupId);
  const side: 1 | -1 = d > 0 ? 1 : -1;
  const radiusRel = (parent: Id, child: Id, grows: boolean) =>
    draft.addConstraint('radiusDiff', [parent, child], { internal: true, param, value: Math.abs(d), sign: grows ? 1 : -1 });

  for (const c of all) {
    if (c.type !== 'circle') continue;
    if (c.r + d <= 1e-9) throw new Error(T().offset.radiusCollapses);
    const id = draft.addCircle(c.c, c.r + d, c.construction);
    created.push(id);
    radiusRel(c.id, id, d > 0);
  }
  const la = all.filter((c): c is LineEnt | ArcEnt => c.type !== 'circle');
  for (const ch of chains(la)) {
    // Fechado: positivo = para fora. Aberto: positivo = esquerda do percurso.
    const off = ch.closed ? (signedArea2(sk, ch.elems) > 0 ? -d : d) : d;
    const sup = ch.elems.map((e) => offsetSupport(sk, e, off));
    const n = ch.elems.length;
    const corners: Vec[] = [];
    for (let i = 0; i < n; i++) {
      if (!ch.closed && i === 0) {
        corners.push(naiveEnd(sk, ch.elems[0], false, off));
        continue;
      }
      const prev = (i - 1 + n) % n;
      const guess = naiveEnd(sk, ch.elems[prev], true, off);
      const cand = intersections(sup[prev], sup[i]);
      corners.push(cand.length ? cand.reduce((b, p) => (dist(p, guess) < dist(b, guess) ? p : b)) : guess);
    }
    if (!ch.closed) corners.push(naiveEnd(sk, ch.elems[n - 1], true, off));
    const pids = corners.map((p) => draft.addPoint(p.x, p.y));
    for (let i = 0; i < n; i++) {
      const e = ch.elems[i];
      const a = pids[i];
      const b = pids[ch.closed ? (i + 1) % n : i + 1];
      if (e.cv.type === 'line') {
        const id = draft.addLine(a, b, e.cv.construction);
        created.push(id);
        draft.addConstraint('parallel', [e.cv.id, id], { internal: true });
        // Conector auxiliar (invisível) da ponta do pai até a linha nova: perpendicular com ângulo de
        // sinal fixo (+90° = esquerda do pai) e comprimento = parâmetro da distância.
        const A = e.cv.p1;
        const PA = pt(sk, A);
        const dir = norm(sub(pt(sk, e.cv.p2), PA));
        const left = e.fwd ? off : -off; // deslocamento para a esquerda do sentido p1→p2
        const nrm = perp(dir);
        const foot = draft.addPoint(PA.x + nrm.x * left, PA.y + nrm.y * left);
        const conn = draft.addLine(A, foot, true);
        draft.sk.entities[foot] = { ...(draft.sk.entities[foot] as PointEnt), aux: true };
        draft.sk.entities[conn] = { ...(draft.sk.entities[conn] as LineEnt), aux: true };
        created.push(conn, foot);
        draft.addConstraint('pointOn', [foot, id], { internal: true });
        draft.addConstraint('angle', [e.cv.id, conn], { value: 90, sign: left > 0 ? 1 : -1, internal: true });
        // A primeira destas é a cota visível do offset (mostra/edita a distância no desenho).
        const first = !draft.sk.constraints.some((k) => k.offsetDim === groupId);
        draft.addConstraint('distance', [conn], { value: Math.abs(d), param, internal: true, ...(first ? { offsetDim: groupId } : {}) });
      } else {
        const r = (sup[i] as { r: number }).r;
        const id = e.fwd ? draft.addArc(e.cv.c, a, b, r, e.cv.construction) : draft.addArc(e.cv.c, b, a, r, e.cv.construction);
        created.push(id);
        radiusRel(e.cv.id, id, r > e.cv.r);
      }
    }
    if (!ch.closed) {
      const tie = (e: Elem, atEnd: boolean, pid: Id) => {
        const [p, q] = endsOf(e.cv);
        const parentEnd = atEnd === e.fwd ? q : p;
        const conn = draft.addLine(e.cv.type === 'line' ? parentEnd : e.cv.c, pid, true);
        created.push(conn);
        if (e.cv.type === 'line') draft.addConstraint('perpendicular', [conn, e.cv.id], { internal: true });
        else draft.addConstraint('pointOn', [parentEnd, conn], { internal: true });
      };
      tie(ch.elems[0], false, pids[0]);
      tie(ch.elems[n - 1], true, pids[n]);
    }
  }
  // Pai na árvore: o grupo que contém todas as curvas de origem.
  const parentGroup = sk.groups.find((g) => all.every((c) => g.members.includes(c.id)));
  const n = draft.sk.groups.filter((g) => g.offset).length + 1;
  const group = {
    id: groupId,
    name: opts.name ?? `Offset ${n}`,
    members: created,
    ...(parentGroup ? { parent: parentGroup.id } : {}),
    offset: { parents: all.map((c) => c.id), distance: Math.abs(d), side },
  };
  draft.sk.groups = [...draft.sk.groups.filter((g) => g.id !== groupId), group];
  return { sketch: draft.sk, created, groupId };
}

/**
 * Muda a distância do offset (sinal = lado). Mesmo lado: só atualiza o parâmetro;
 * lado trocado: refaz o offset no mesmo grupo (mantém nome e posição na árvore).
 */
export function setOffsetDistance(sk: Sketch, groupId: Id, d: number): Sketch {
  const g = sk.groups.find((x) => x.id === groupId);
  if (!g?.offset) throw new Error(T().offset.nothing);
  if (Math.abs(d) < 1e-12) throw new Error(T().offset.zero);
  const side: 1 | -1 = d > 0 ? 1 : -1;
  if (side === g.offset.side) {
    // Mesmo lado: nova distância e o offset recolocado na posição exata (o pai não se move).
    const withD: Sketch = { ...sk, groups: sk.groups.map((x) => (x.id === groupId ? { ...x, offset: { ...x.offset!, distance: Math.abs(d) } } : x)) };
    return repositionOffset(withD, groupId);
  }
  // Remove as curvas antigas (e seus pontos/restrições), preservando o grupo para recriar.
  const kill = new Set(g.members);
  const entities = { ...sk.entities };
  for (const id of kill) delete entities[id];
  const used = new Set<Id>();
  for (const e of Object.values(entities)) if (isCurve(e)) (e.type === 'line' ? [e.p1, e.p2] : e.type === 'circle' ? [e.c] : [e.c, e.s, e.e]).forEach((p) => used.add(p));
  for (const e of Object.values(entities)) if (e.type === 'point' && !e.free && !used.has(e.id) && e.id !== 'O') delete entities[e.id];
  const base: Sketch = { ...sk, entities, constraints: sk.constraints.filter((c) => c.refs.every((r) => entities[r])) };
  return offsetCurves(base, g.offset.parents, d, { groupId, name: g.name }).sketch;
}

/**
 * Recoloca as entidades do offset na posição exata para a distância atual, a partir do pai,
 * mantendo os ids (o offset é refeito "de mentira" e as coordenadas são copiadas na mesma ordem).
 */
export function repositionOffset(sk: Sketch, groupId: Id): Sketch {
  const g = sk.groups.find((x) => x.id === groupId);
  if (!g?.offset) return sk;
  const tmp = offsetCurves({ ...sk, groups: sk.groups.filter((x) => x.id !== groupId) }, g.offset.parents, g.offset.side * g.offset.distance, { groupId: `${groupId}__tmp` });
  const oldIds = g.members;
  const newIds = tmp.created;
  if (oldIds.length !== newIds.length) return sk; // topologia diferente (não deveria acontecer)
  const entities = { ...sk.entities };
  const pointPairs = new Map<Id, Id>();
  for (let i = 0; i < oldIds.length; i++) {
    const a = entities[oldIds[i]];
    const b = tmp.sketch.entities[newIds[i]];
    if (!a || !b || a.type !== b.type) return sk;
    if (a.type === 'point' && b.type === 'point') pointPairs.set(a.id, b.id);
    else if (a.type === 'line' && b.type === 'line') {
      pointPairs.set(a.p1, b.p1);
      pointPairs.set(a.p2, b.p2);
    } else if (a.type === 'circle' && b.type === 'circle') entities[a.id] = { ...a, r: b.r };
    else if (a.type === 'arc' && b.type === 'arc') {
      entities[a.id] = { ...a, r: b.r };
      pointPairs.set(a.s, b.s);
      pointPairs.set(a.e, b.e);
    }
  }
  const parentPts = new Set<Id>();
  for (const pid of g.offset.parents) {
    const e = sk.entities[pid];
    if (e?.type === 'line') [e.p1, e.p2].forEach((p) => parentPts.add(p));
    if (e?.type === 'arc' || e?.type === 'circle') parentPts.add(e.c);
    if (e?.type === 'arc') [e.s, e.e].forEach((p) => parentPts.add(p));
  }
  for (const [o, n] of pointPairs) {
    if (parentPts.has(o)) continue; // pontos do pai (conectores começam neles) não se movem
    const P = entities[o];
    const Q = tmp.sketch.entities[n];
    if (P?.type === 'point' && Q?.type === 'point') entities[o] = { ...P, x: Q.x, y: Q.y };
  }
  return { ...sk, entities };
}

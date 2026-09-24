import { cross, dist, dot, projectOnLine, pt, sub, type Vec } from './geometry';
import { formatLength, type LengthUnit } from './expr';
import type { Constraint, Id, Sketch } from './types';

/** Os dois pontos (ids) medidos por uma cota linear: ponto-ponto ou uma linha. */
export function dimPointIds(sk: Sketch, c: Constraint): [Id, Id] | null {
  if (c.refs.length === 2 && sk.entities[c.refs[0]]?.type === 'point' && sk.entities[c.refs[1]]?.type === 'point') {
    return [c.refs[0], c.refs[1]];
  }
  if (c.refs.length === 1) {
    const l = sk.entities[c.refs[0]];
    if (l?.type === 'line') return [l.p1, l.p2];
  }
  return null;
}

/** Cota ponto-linha: retorna o ponto e o pé da perpendicular. */
export function pointLineFoot(sk: Sketch, c: Constraint): { p: Vec; f: Vec; lineId: Id; pointId: Id } | null {
  if (c.refs.length !== 2) return null;
  const [a, b] = c.refs.map((id) => sk.entities[id]);
  let pointId: Id, lineId: Id;
  if (a?.type === 'point' && b?.type === 'line') [pointId, lineId] = [a.id, b.id];
  else if (a?.type === 'line' && b?.type === 'point') [pointId, lineId] = [b.id, a.id];
  else return null;
  const l = sk.entities[lineId];
  if (l.type !== 'line') return null;
  const p = pt(sk, pointId);
  const f = projectOnLine(p, pt(sk, l.p1), pt(sk, l.p2));
  return { p, f, lineId, pointId };
}

export function lineDir(sk: Sketch, id: Id): Vec {
  const l = sk.entities[id];
  if (l?.type !== 'line') throw new Error(`linha ${id} não existe`);
  return sub(pt(sk, l.p2), pt(sk, l.p1));
}

/** Ângulo assinado (rad) da direção da linha 1 para a da linha 2 (com as inversões do setor). */
export function signedLineAngle(sk: Sketch, l1: Id, l2: Id, flip: [boolean, boolean] = [false, false]) {
  const d1 = lineDir(sk, l1);
  const d2 = lineDir(sk, l2);
  const u = flip[0] ? { x: -d1.x, y: -d1.y } : d1;
  const v = flip[1] ? { x: -d2.x, y: -d2.y } : d2;
  return Math.atan2(cross(u, v), dot(u, v));
}

/** Setor (inversões das linhas) que contém a direção `dir` a partir do vértice. */
export function angleSectorAt(sk: Sketch, l1: Id, l2: Id, dir: Vec): [boolean, boolean] {
  const d1 = lineDir(sk, l1);
  const d2 = lineDir(sk, l2);
  const t = Math.atan2(dir.y, dir.x);
  for (const f of [
    [false, false],
    [true, false],
    [true, true],
    [false, true],
  ] as [boolean, boolean][]) {
    const u = f[0] ? { x: -d1.x, y: -d1.y } : d1;
    const v = f[1] ? { x: -d2.x, y: -d2.y } : d2;
    const a0 = Math.atan2(u.y, u.x);
    const sweep = Math.atan2(cross(u, v), dot(u, v)); // de u para v, (-π, π]
    // Setor menor entre u e v: começa em u (sweep>0) ou em v (sweep<0).
    const start = sweep >= 0 ? a0 : a0 + sweep;
    let k = t - start;
    while (k < 0) k += 2 * Math.PI;
    while (k >= 2 * Math.PI) k -= 2 * Math.PI;
    if (k <= Math.abs(sweep) + 1e-12) return f;
  }
  return [false, false];
}

/** Valor atual (sempre ≥ 0) que a cota mede na geometria: mm ou graus. */
export function measure(sk: Sketch, c: Constraint): number {
  switch (c.type) {
    case 'distance': {
      const pp = dimPointIds(sk, c);
      if (pp) return dist(pt(sk, pp[0]), pt(sk, pp[1]));
      const pl = pointLineFoot(sk, c);
      return pl ? dist(pl.p, pl.f) : NaN;
    }
    case 'hdistance':
    case 'vdistance': {
      const pp = dimPointIds(sk, c);
      if (!pp) return NaN;
      const a = pt(sk, pp[0]);
      const b = pt(sk, pp[1]);
      return c.type === 'hdistance' ? Math.abs(b.x - a.x) : Math.abs(b.y - a.y);
    }
    case 'radius':
    case 'diameter': {
      const e = sk.entities[c.refs[0]];
      if (e?.type !== 'circle' && e?.type !== 'arc') return NaN;
      return c.type === 'radius' ? e.r : 2 * e.r;
    }
    case 'angle':
      return (Math.abs(signedLineAngle(sk, c.refs[0], c.refs[1], c.flip)) * 180) / Math.PI;
    default:
      return NaN;
  }
}

/** Texto da cota: "50 mm", "R8 mm", "Ø30 mm", "30°"; com expressão: "L = 50 mm". */
export function formatValue(c: Constraint, unit: LengthUnit): string {
  const v = c.value ?? 0;
  let s: string;
  if (c.type === 'angle') s = `${Number(v.toFixed(3)).toString().replace('.', ',')}°`;
  else if (c.offsetDim) return `offset ${formatLength(v, unit)}`;
  else s = formatLength(v, unit);
  if (c.type === 'radius') s = `R${s}`;
  if (c.type === 'diameter') s = `Ø${s}`;
  if (c.expr) {
    const e = c.expr.length > 24 ? `${c.expr.slice(0, 23)}…` : c.expr;
    return `${e} = ${s}`;
  }
  return s;
}

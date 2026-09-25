import type { ArcEnt, Curve, Entity, Id, PointEnt, Sketch } from './types';

export interface Vec {
  x: number;
  y: number;
}

export const TAU = Math.PI * 2;

export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const mul = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k });
export const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y;
export const cross = (a: Vec, b: Vec) => a.x * b.y - a.y * b.x;
export const len = (a: Vec) => Math.hypot(a.x, a.y);
export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
export const mid = (a: Vec, b: Vec): Vec => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export const norm = (a: Vec): Vec => {
  const l = len(a) || 1;
  return { x: a.x / l, y: a.y / l };
};
export const perp = (a: Vec): Vec => ({ x: -a.y, y: a.x });

/** Ângulo em [0, 2π). */
export function normAngle(a: number) {
  a %= TAU;
  return a < 0 ? a + TAU : a;
}

export function pt(sk: Sketch, id: Id): PointEnt {
  const e = sk.entities[id];
  if (!e || e.type !== 'point') throw new Error(`ponto ${id} não existe`);
  return e;
}

export function arcAngles(sk: Sketch, a: ArcEnt) {
  const c = pt(sk, a.c);
  const s = pt(sk, a.s);
  const e = pt(sk, a.e);
  const start = Math.atan2(s.y - c.y, s.x - c.x);
  let end = Math.atan2(e.y - c.y, e.x - c.x);
  while (end <= start) end += TAU;
  return { c, start, end };
}

/** O ângulo `t` está dentro do arco anti-horário [start, end]? */
export function angleInArc(t: number, start: number, end: number) {
  return normAngle(t - start) <= end - start + 1e-12;
}

export function projectOnSegment(p: Vec, a: Vec, b: Vec): { q: Vec; t: number } {
  const ab = sub(b, a);
  const l2 = dot(ab, ab) || 1e-30;
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  return { q: add(a, mul(ab, t)), t };
}

/** Projeção sobre a reta infinita que passa por a e b. */
export function projectOnLine(p: Vec, a: Vec, b: Vec): Vec {
  const ab = sub(b, a);
  const l2 = dot(ab, ab) || 1e-30;
  return add(a, mul(ab, dot(sub(p, a), ab) / l2));
}

/** Ponto mais próximo de `p` sobre a curva e a distância até ele. */
export function closestOnCurve(sk: Sketch, cv: Curve, p: Vec): { q: Vec; d: number } {
  if (cv.type === 'line') {
    const { q } = projectOnSegment(p, pt(sk, cv.p1), pt(sk, cv.p2));
    return { q, d: dist(p, q) };
  }
  if (cv.type === 'circle') {
    const c = pt(sk, cv.c);
    const u = norm(sub(p, c));
    const q = add(c, mul(u, cv.r));
    return { q, d: dist(p, q) };
  }
  const { c, start, end } = arcAngles(sk, cv);
  const t = Math.atan2(p.y - c.y, p.x - c.x);
  if (angleInArc(t, start, end)) {
    const q = { x: c.x + cv.r * Math.cos(t), y: c.y + cv.r * Math.sin(t) };
    return { q, d: dist(p, q) };
  }
  const s = pt(sk, cv.s);
  const e = pt(sk, cv.e);
  return dist(p, s) < dist(p, e) ? { q: s, d: dist(p, s) } : { q: e, d: dist(p, e) };
}

/** Pontos que definem uma curva (para mover a curva inteira). */
export function curvePoints(cv: Curve): Id[] {
  if (cv.type === 'line') return [cv.p1, cv.p2];
  if (cv.type === 'circle') return [cv.c];
  return [cv.c, cv.s, cv.e];
}

/** Círculo que passa por três pontos (null se colineares). */
export function circleFrom3(a: Vec, b: Vec, c: Vec): { c: Vec; r: number } | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-12) return null;
  const a2 = dot(a, a);
  const b2 = dot(b, b);
  const c2 = dot(c, c);
  const x = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
  const y = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
  const ctr = { x, y };
  return { c: ctr, r: dist(ctr, a) };
}

export function entityBBox(sk: Sketch, e: Entity): { x0: number; y0: number; x1: number; y1: number } {
  if (e.type === 'point') return { x0: e.x, y0: e.y, x1: e.x, y1: e.y };
  if (e.type === 'line') {
    const a = pt(sk, e.p1);
    const b = pt(sk, e.p2);
    return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
  }
  if (e.type === 'circle') {
    const c = pt(sk, e.c);
    return { x0: c.x - e.r, y0: c.y - e.r, x1: c.x + e.r, y1: c.y + e.r };
  }
  const { c, start, end } = arcAngles(sk, e);
  const xs = [Math.cos(start), Math.cos(end)];
  const ys = [Math.sin(start), Math.sin(end)];
  for (let k = 0; k < 4; k++) {
    const t = (k * Math.PI) / 2;
    if (angleInArc(t, start, end)) {
      xs.push(Math.cos(t));
      ys.push(Math.sin(t));
    }
  }
  return {
    x0: c.x + e.r * Math.min(...xs),
    y0: c.y + e.r * Math.min(...ys),
    x1: c.x + e.r * Math.max(...xs),
    y1: c.y + e.r * Math.max(...ys),
  };
}

/** A entidade toca a caixa (seleção por cruzamento, arrastando para a esquerda como nos CADs)? */
export function entityTouchesBox(sk: Sketch, e: Entity, box: { x0: number; y0: number; x1: number; y1: number }): boolean {
  const bb = entityBBox(sk, e);
  if (bb.x1 < box.x0 || bb.x0 > box.x1 || bb.y1 < box.y0 || bb.y0 > box.y1) return false;
  const inBox = (p: { x: number; y: number }) => p.x >= box.x0 && p.x <= box.x1 && p.y >= box.y0 && p.y <= box.y1;
  // Segmento × retângulo (Liang-Barsky).
  const segHits = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    if (inBox(a) || inBox(b)) return true;
    let t0 = 0, t1 = 1;
    const dx = b.x - a.x, dy = b.y - a.y;
    const clip = (p: number, q: number) => {
      if (p === 0) return q >= 0;
      const r = q / p;
      if (p < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
      return true;
    };
    return clip(-dx, a.x - box.x0) && clip(dx, box.x1 - a.x) && clip(-dy, a.y - box.y0) && clip(dy, box.y1 - a.y) && t0 <= t1;
  };
  if (e.type === 'point') return inBox(e);
  if (e.type === 'line') return segHits(pt(sk, e.p1), pt(sk, e.p2));
  // Círculo/arco: polilinha fina.
  let c: { x: number; y: number }, start: number, end: number;
  if (e.type === 'circle') (c = pt(sk, e.c)), (start = 0), (end = 2 * Math.PI);
  else ({ c, start, end } = arcAngles(sk, e));
  let sweep = end - start;
  while (sweep <= 0) sweep += 2 * Math.PI;
  const n = Math.max(16, Math.ceil(sweep / (Math.PI / 90)));
  let prev = { x: c.x + e.r * Math.cos(start), y: c.y + e.r * Math.sin(start) };
  for (let k = 1; k <= n; k++) {
    const t = start + (sweep * k) / n;
    const q = { x: c.x + e.r * Math.cos(t), y: c.y + e.r * Math.sin(t) };
    if (segHits(prev, q)) return true;
    prev = q;
  }
  return false;
}

export function sketchBBox(sk: Sketch) {
  let b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const e of Object.values(sk.entities)) {
    const eb = entityBBox(sk, e);
    b = { x0: Math.min(b.x0, eb.x0), y0: Math.min(b.y0, eb.y0), x1: Math.max(b.x1, eb.x1), y1: Math.max(b.y1, eb.y1) };
  }
  return b;
}

/** Ponto de interseção das retas infinitas (a1,a2) e (b1,b2); null se paralelas. */
export function lineIntersection(a1: Vec, a2: Vec, b1: Vec, b2: Vec): Vec | null {
  const r = sub(a2, a1);
  const s = sub(b2, b1);
  const d = cross(r, s);
  if (Math.abs(d) < 1e-12 * len(r) * len(s)) return null;
  const t = cross(sub(b1, a1), s) / d;
  return add(a1, mul(r, t));
}

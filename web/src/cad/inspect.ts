// Medições para o painel de propriedades e a régua: distância mínima, área e perímetro.
import { arcAngles, closestOnCurve, dist, pt, type Vec } from './geometry';
import { isCurve, type Curve, type Id, type Sketch } from './types';

type Param = { at: (t: number) => Vec; t0: number; t1: number };

function paramOf(sk: Sketch, id: Id): Param | null {
  const e = sk.entities[id];
  if (!e) return null;
  if (e.type === 'point') return { at: () => ({ x: e.x, y: e.y }), t0: 0, t1: 0 };
  if (e.type === 'line') {
    const a = pt(sk, e.p1);
    const b = pt(sk, e.p2);
    return { at: (t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }), t0: 0, t1: 1 };
  }
  if (e.type === 'circle') {
    const c = pt(sk, e.c);
    return { at: (t) => ({ x: c.x + e.r * Math.cos(t), y: c.y + e.r * Math.sin(t) }), t0: 0, t1: 2 * Math.PI };
  }
  const { c, start, end } = arcAngles(sk, e);
  return { at: (t) => ({ x: c.x + e.r * Math.cos(t), y: c.y + e.r * Math.sin(t) }), t0: start, t1: end };
}

/** Ponto de `id` mais próximo de `p`. */
function closestOn(sk: Sketch, id: Id, p: Vec): Vec {
  const e = sk.entities[id];
  if (e.type === 'point') return { x: e.x, y: e.y };
  return closestOnCurve(sk, e as Curve, p).q;
}

/** Amostra A, encontra o melhor trecho e refina por seção áurea. */
function minFrom(sk: Sketch, a: Id, b: Id): { d: number; pa: Vec; pb: Vec } {
  const P = paramOf(sk, a)!;
  const f = (t: number) => {
    const pa = P.at(t);
    const pb = closestOn(sk, b, pa);
    return { d: dist(pa, pb), pa, pb };
  };
  if (P.t0 === P.t1) return f(P.t0);
  const N = 256;
  const h = (P.t1 - P.t0) / N;
  let bi = 0;
  let best = f(P.t0);
  for (let i = 1; i <= N; i++) {
    const r = f(P.t0 + i * h);
    if (r.d < best.d) {
      best = r;
      bi = i;
    }
  }
  let lo = P.t0 + Math.max(0, bi - 1) * h;
  let hi = P.t0 + Math.min(N, bi + 1) * h;
  const g = (Math.sqrt(5) - 1) / 2;
  for (let k = 0; k < 80 && hi - lo > 1e-13; k++) {
    const m1 = hi - g * (hi - lo);
    const m2 = lo + g * (hi - lo);
    if (f(m1).d < f(m2).d) hi = m2;
    else lo = m1;
  }
  const r = f((lo + hi) / 2);
  return r.d < best.d ? r : best;
}

/** Distância mínima entre duas entidades e os pontos onde ela ocorre. */
export function minDistance(sk: Sketch, a: Id, b: Id): { d: number; pa: Vec; pb: Vec } | null {
  if (!paramOf(sk, a) || !paramOf(sk, b)) return null;
  const r1 = minFrom(sk, a, b);
  const r2 = minFrom(sk, b, a);
  const r = r1.d <= r2.d ? r1 : { d: r2.d, pa: r2.pb, pb: r2.pa };
  return r.d < 1e-9 ? { ...r, d: 0 } : r;
}

function curveLength(sk: Sketch, cv: Curve): number {
  if (cv.type === 'line') return dist(pt(sk, cv.p1), pt(sk, cv.p2));
  if (cv.type === 'circle') return 2 * Math.PI * cv.r;
  const { start, end } = arcAngles(sk, cv);
  return cv.r * (end - start);
}

/**
 * Área e perímetro de um contorno fechado formado pelas curvas dadas (linhas e arcos ligados
 * pelas pontas, ou um círculo sozinho). null se não formam exatamente um laço fechado.
 */
export function loopArea(sk: Sketch, ids: Id[]): { area: number; perimeter: number } | null {
  const curves = ids.map((id) => sk.entities[id]).filter(isCurve).filter((c) => !c.construction);
  if (!curves.length) return null;
  if (curves.length === 1 && curves[0].type === 'circle') {
    const r = curves[0].r;
    return { area: Math.PI * r * r, perimeter: 2 * Math.PI * r };
  }
  if (curves.some((c) => c.type === 'circle')) return null;
  const ends = (c: Curve): [Id, Id] => (c.type === 'line' ? [c.p1, c.p2] : c.type === 'arc' ? [c.s, c.e] : ['', '']);
  const deg = new Map<Id, number>();
  for (const c of curves) for (const p of ends(c)) deg.set(p, (deg.get(p) ?? 0) + 1);
  if ([...deg.values()].some((d) => d !== 2)) return null;

  // Percorre o laço a partir da primeira curva.
  const used = new Set<Id>();
  let cur = curves[0];
  let [from, to] = ends(cur);
  const start = from;
  let area2 = 0; // 2 × área assinada
  let perimeter = 0;
  for (;;) {
    used.add(cur.id);
    perimeter += curveLength(sk, cur);
    const A = pt(sk, from);
    const B = pt(sk, to);
    if (cur.type === 'line') area2 += A.x * B.y - B.x * A.y;
    else if (cur.type === 'arc') {
      // ∮ (x dy − y dx) ao longo do arco anti-horário s→e; negativo se percorrido e→s.
      const { c, start: t0, end: t1 } = arcAngles(sk, cur);
      const r = cur.r;
      const I = r * r * (t1 - t0) + r * (c.x * (Math.sin(t1) - Math.sin(t0)) - c.y * (Math.cos(t1) - Math.cos(t0)));
      area2 += from === cur.s ? I : -I;
    }
    if (to === start) break;
    const next = curves.find((c) => !used.has(c.id) && ends(c).includes(to));
    if (!next) return null;
    const [n1, n2] = ends(next);
    from = to;
    to = n1 === to ? n2 : n1;
    cur = next;
  }
  if (used.size !== curves.length) return null; // mais de um laço
  return { area: Math.abs(area2) / 2, perimeter };
}

/** Distância mínima entre dois conjuntos de entidades (ex.: um grupo e um círculo). */
export function minDistanceSets(sk: Sketch, a: Id[], b: Id[]): { d: number; pa: Vec; pb: Vec } | null {
  let best: { d: number; pa: Vec; pb: Vec } | null = null;
  for (const x of a)
    for (const y of b) {
      if (x === y) continue;
      const m = minDistance(sk, x, y);
      if (m && (!best || m.d < best.d)) best = m;
    }
  return best;
}

/**
 * Distância com sinal do ponto `p` às curvas `ids`:
 * contorno fechado → positivo fora, negativo dentro; senão → lado da curva mais próxima
 * (esquerda de p1→p2 numa linha, fora do raio num arco/círculo).
 */
export function signedDistanceTo(sk: Sketch, ids: Id[], p: Vec): number {
  const cvs = ids.map((id) => sk.entities[id]).filter(isCurve) as Curve[];
  let best: { d: number; cv: Curve; q: Vec } | null = null;
  for (const cv of cvs) {
    const { q, d } = closestOnCurve(sk, cv, p);
    if (!best || d < best.d) best = { d, cv, q };
  }
  if (!best) return 0;
  if (loopArea(sk, ids)) {
    // Dentro/fora do contorno (raio para a direita contra o contorno amostrado).
    // Os pedaços não estão ordenados: usa a paridade de cruzamentos com os segmentos de cada curva.
    let inside = false;
    for (const cv of cvs) {
      const P = paramOf(sk, cv.id)!;
      const N = cv.type === 'line' ? 1 : 48;
      for (let i = 0; i < N; i++) {
        const a = P.at(P.t0 + ((P.t1 - P.t0) * i) / N);
        const b = P.at(P.t0 + ((P.t1 - P.t0) * (i + 1)) / N);
        if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
      }
    }
    return inside ? -best.d : best.d;
  }
  const cv = best.cv;
  if (cv.type === 'line') {
    const A = pt(sk, cv.p1);
    const B = pt(sk, cv.p2);
    return (B.x - A.x) * (p.y - A.y) - (B.y - A.y) * (p.x - A.x) >= 0 ? best.d : -best.d;
  }
  return dist(p, pt(sk, cv.c)) >= cv.r ? best.d : -best.d;
}

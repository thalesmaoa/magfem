// Regiões fechadas do desenho (arranjo planar): cruzamentos → arestas → faces com furos.
// Usado pela Malha para atribuir materiais e contornos.
import { arcAngles, dist, normAngle, pt, type Vec } from './geometry';
import { isCurve, type Curve, type Id, type Sketch } from './types';

const TAU = Math.PI * 2;

/** Pedaço de uma curva entre dois nós (parâmetros t0 < t1 da curva de origem). */
export interface Edge {
  id: number;
  curve: Id;
  t0: number;
  t1: number;
  a: number; // nó inicial
  b: number; // nó final
}

export interface Loop {
  /** Meias-arestas na ordem do percurso: aresta e sentido (true = de a para b). */
  steps: { edge: number; fwd: boolean }[];
  /** Polígono amostrado (arcos discretizados), no sentido do percurso. */
  poly: Vec[];
  /** Área com sinal (positiva = anti-horário). */
  area: number;
}

export interface Region {
  /** Índice estável só dentro de um cálculo; a identidade persistente é `curves`. */
  index: number;
  outer: Loop;
  holes: Loop[];
  /** Área líquida (mm²). */
  area: number;
  /** Curvas de origem que delimitam a região (ordenadas) — identidade para materiais. */
  curves: Id[];
  /** Ponto interno (para rótulo e para reencontrar a região). */
  label: Vec;
}

export interface Arrangement {
  nodes: Vec[];
  edges: Edge[];
  regions: Region[];
  /** Curvas na borda externa (um lado fora de qualquer região) — contorno A = 0 por padrão. */
  outer: Id[];
  /** Tamanho do desenho (maior coordenada/raio). */
  span: number;
  /** Ponto da aresta no parâmetro normalizado u ∈ [0, 1]. */
  sample: (e: Edge, u: number) => Vec;
  /** Comprimento da aresta e se é curva (arco/círculo). */
  edgeLen: (e: Edge) => { len: number; curved: boolean; angle: number };
}

type Param = { at: (t: number) => Vec; t0: number; t1: number; closed: boolean };

function paramOf(sk: Sketch, c: Curve): Param {
  if (c.type === 'line') {
    const a = pt(sk, c.p1);
    const b = pt(sk, c.p2);
    return { at: (t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }), t0: 0, t1: 1, closed: false };
  }
  if (c.type === 'circle') {
    const o = pt(sk, c.c);
    return { at: (t) => ({ x: o.x + c.r * Math.cos(t), y: o.y + c.r * Math.sin(t) }), t0: 0, t1: TAU, closed: true };
  }
  const { c: o, start, end } = arcAngles(sk, c);
  return { at: (t) => ({ x: o.x + c.r * Math.cos(t), y: o.y + c.r * Math.sin(t) }), t0: start, t1: end, closed: false };
}

/** Parâmetro (na curva) do ponto `p`, supondo que ele está sobre a curva. */
function paramAt(sk: Sketch, c: Curve, p: Vec): number | null {
  if (c.type === 'line') {
    const a = pt(sk, c.p1);
    const b = pt(sk, c.p2);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L2 = dx * dx + dy * dy || 1e-30;
    return ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2;
  }
  const o = pt(sk, c.c);
  let t = Math.atan2(p.y - o.y, p.x - o.x);
  if (c.type === 'circle') return normAngle(t);
  const { start, end } = arcAngles(sk, c);
  while (t < start - 1e-12) t += TAU;
  while (t > start + TAU) t -= TAU;
  return t <= end + 1e-9 ? t : null;
}

type Shape = { kind: 'seg'; a: Vec; b: Vec } | { kind: 'circ'; c: Vec; r: number };

function shapeOf(sk: Sketch, c: Curve): Shape {
  if (c.type === 'line') return { kind: 'seg', a: pt(sk, c.p1), b: pt(sk, c.p2) };
  return { kind: 'circ', c: pt(sk, c.c), r: c.r };
}

/** Pontos de interseção entre as formas-suporte (segmento ou círculo completo). */
function intersect(s1: Shape, s2: Shape): Vec[] {
  if (s1.kind === 'seg' && s2.kind === 'seg') {
    const r = { x: s1.b.x - s1.a.x, y: s1.b.y - s1.a.y };
    const s = { x: s2.b.x - s2.a.x, y: s2.b.y - s2.a.y };
    const den = r.x * s.y - r.y * s.x;
    if (Math.abs(den) < 1e-14 * (Math.hypot(r.x, r.y) * Math.hypot(s.x, s.y) + 1e-30)) return []; // paralelas/colineares
    const qp = { x: s2.a.x - s1.a.x, y: s2.a.y - s1.a.y };
    const t = (qp.x * s.y - qp.y * s.x) / den;
    const u = (qp.x * r.y - qp.y * r.x) / den;
    const e = 1e-9;
    if (t < -e || t > 1 + e || u < -e || u > 1 + e) return [];
    return [{ x: s1.a.x + r.x * t, y: s1.a.y + r.y * t }];
  }
  if (s1.kind === 'circ' && s2.kind === 'seg') return intersect(s2, s1);
  if (s1.kind === 'seg' && s2.kind === 'circ') {
    const d = { x: s1.b.x - s1.a.x, y: s1.b.y - s1.a.y };
    const L = Math.hypot(d.x, d.y) || 1e-30;
    const u = { x: d.x / L, y: d.y / L };
    const f = { x: s1.a.x - s2.c.x, y: s1.a.y - s2.c.y };
    const b = f.x * u.x + f.y * u.y;
    const c = f.x * f.x + f.y * f.y - s2.r * s2.r;
    const disc = b * b - c;
    if (disc < -1e-9 * s2.r * s2.r) return [];
    const sq = Math.sqrt(Math.max(0, disc));
    const out: Vec[] = [];
    for (const k of sq < 1e-12 ? [-b] : [-b - sq, -b + sq]) if (k >= -1e-9 * L && k <= L * (1 + 1e-9)) out.push({ x: s1.a.x + u.x * k, y: s1.a.y + u.y * k });
    return out;
  }
  const a = s1 as { c: Vec; r: number };
  const b = s2 as { c: Vec; r: number };
  const D = dist(a.c, b.c);
  if (D < 1e-12 || D > a.r + b.r + 1e-9 || D < Math.abs(a.r - b.r) - 1e-9) return [];
  const x = (a.r * a.r - b.r * b.r + D * D) / (2 * D);
  const h = Math.sqrt(Math.max(0, a.r * a.r - x * x));
  const ux = (b.c.x - a.c.x) / D;
  const uy = (b.c.y - a.c.y) / D;
  const m = { x: a.c.x + ux * x, y: a.c.y + uy * x };
  if (h < 1e-9) return [m];
  return [
    { x: m.x - uy * h, y: m.y + ux * h },
    { x: m.x + uy * h, y: m.y - ux * h },
  ];
}

function inside(p: Vec, poly: Vec[]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

/** Ponto interno do polígono com furos: meio do maior intervalo interno numa linha horizontal. */
function labelPoint(outer: Vec[], holes: Vec[][]): Vec {
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of outer) {
    y0 = Math.min(y0, p.y);
    y1 = Math.max(y1, p.y);
  }
  let best: { p: Vec; w: number } | null = null;
  for (const f of [0.5, 0.37, 0.63, 0.25, 0.75, 0.13, 0.87]) {
    const y = y0 + (y1 - y0) * f;
    const xs: number[] = [];
    for (const poly of [outer, ...holes])
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i];
        const b = poly[j];
        if (a.y > y !== b.y > y) xs.push(((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x);
      }
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const w = xs[k + 1] - xs[k];
      if (!best || w > best.w) best = { p: { x: (xs[k] + xs[k + 1]) / 2, y }, w };
    }
    if (best && best.w > (y1 - y0) * 0.2) break;
  }
  return best?.p ?? outer[0];
}

/** Calcula o arranjo: nós, arestas e regiões (faces limitadas, com furos). */
export function computeArrangement(sk: Sketch): Arrangement {
  const curves = Object.values(sk.entities).filter(isCurve).filter((c) => !c.construction && !(c.type === 'line' && c.aux)) as Curve[];
  // Tolerância relativa ao tamanho do desenho.
  let span = 1;
  for (const c of curves) {
    const P = paramOf(sk, c);
    const a = P.at(P.t0);
    span = Math.max(span, Math.abs(a.x), Math.abs(a.y), c.type !== 'line' ? c.r : 0);
  }
  const tol = span * 1e-9;

  const nodes: Vec[] = [];
  const nodeOf = (p: Vec) => {
    for (let i = 0; i < nodes.length; i++) if (Math.abs(nodes[i].x - p.x) <= tol && Math.abs(nodes[i].y - p.y) <= tol) return i;
    nodes.push(p);
    return nodes.length - 1;
  };
  const params = curves.map((c) => paramOf(sk, c));
  const shapes = curves.map((c) => shapeOf(sk, c));
  const splits: { t: number; node: number }[][] = curves.map(() => []);
  const addSplit = (i: number, p: Vec) => {
    const t = paramAt(sk, curves[i], p);
    if (t === null) return;
    const P = params[i];
    if (!P.closed && (t < P.t0 - 1e-9 || t > P.t1 + 1e-9)) return;
    splits[i].push({ t: Math.min(Math.max(t, P.t0), P.t1), node: nodeOf(p) });
  };
  // Pontas das curvas abertas.
  curves.forEach((_c, i) => {
    const P = params[i];
    if (P.closed) return;
    addSplit(i, P.at(P.t0));
    addSplit(i, P.at(P.t1));
  });
  // Cruzamentos entre todas as curvas (vale também para ponta tocando o meio de outra curva).
  for (let i = 0; i < curves.length; i++)
    for (let j = i + 1; j < curves.length; j++)
      for (const p of intersect(shapes[i], shapes[j])) {
        // Só se o ponto estiver dentro do trecho real de ambos (arcos limitam o ângulo).
        const ti = paramAt(sk, curves[i], p);
        const tj = paramAt(sk, curves[j], p);
        if (ti === null || tj === null) continue;
        if (curves[i].type === 'line' && (ti < -1e-9 || ti > 1 + 1e-9)) continue;
        if (curves[j].type === 'line' && (tj < -1e-9 || tj > 1 + 1e-9)) continue;
        addSplit(i, p);
        addSplit(j, p);
      }

  // Arestas: trechos entre parâmetros consecutivos.
  const edges: Edge[] = [];
  curves.forEach((c, i) => {
    const P = params[i];
    const list = splits[i].sort((m, n) => m.t - n.t).filter((s, k, arr) => k === 0 || s.t - arr[k - 1].t > 1e-12 || s.node !== arr[k - 1].node);
    if (P.closed) {
      if (!list.length) list.push({ t: 0, node: nodeOf(P.at(0)) });
      for (let k = 0; k < list.length; k++) {
        const s = list[k];
        const e = list[(k + 1) % list.length];
        const t1 = k + 1 < list.length ? e.t : e.t + TAU;
        if (t1 - s.t > 1e-12) edges.push({ id: edges.length, curve: c.id, t0: s.t, t1, a: s.node, b: e.node });
      }
    } else {
      for (let k = 0; k + 1 < list.length; k++) {
        const s = list[k];
        const e = list[k + 1];
        if (e.t - s.t > 1e-12 && !(s.node === e.node && c.type === 'line')) edges.push({ id: edges.length, curve: c.id, t0: s.t, t1: e.t, a: s.node, b: e.node });
      }
    }
  });

  // Direção de saída de cada meia-aresta num nó (sonda um pouco para dentro da aresta — resolve tangências).
  const curveById = new Map(curves.map((c, i) => [c.id, i]));
  const sample = (e: Edge, u: number) => params[curveById.get(e.curve)!].at(e.t0 + (e.t1 - e.t0) * u);
  const out = new Map<number, { edge: number; fwd: boolean; ang: number }[]>();
  for (const e of edges) {
    for (const fwd of [true, false]) {
      const from = fwd ? e.a : e.b;
      const p0 = nodes[from];
      const probe = sample(e, fwd ? 1e-4 : 1 - 1e-4);
      const ang = Math.atan2(probe.y - p0.y, probe.x - p0.x);
      const list = out.get(from) ?? [];
      list.push({ edge: e.id, fwd, ang });
      out.set(from, list);
    }
  }
  for (const list of out.values()) list.sort((m, n) => m.ang - n.ang);

  /** Área com sinal exata: ∮(x dy − y dx)/2 — reta pelo laço de polígono, arco pela fórmula fechada. */
  const exactArea = (steps: { edge: number; fwd: boolean }[]) => {
    let a2 = 0;
    for (const st of steps) {
      const ed = edges[st.edge];
      const c = curves[curveById.get(ed.curve)!];
      const A = sample(ed, 0);
      const B = sample(ed, 1);
      let I: number;
      if (c.type === 'line') I = A.x * B.y - B.x * A.y;
      else {
        const o = pt(sk, c.c);
        const r = c.r;
        I = r * r * (ed.t1 - ed.t0) + r * (o.x * (Math.sin(ed.t1) - Math.sin(ed.t0)) - o.y * (Math.cos(ed.t1) - Math.cos(ed.t0)));
      }
      a2 += st.fwd ? I : -I;
    }
    return a2 / 2;
  };

  // Percorre as faces: a partir de cada meia-aresta, no nó de chegada vira para a próxima no sentido horário.
  const used = new Set<string>();
  const loops: Loop[] = [];
  const key = (h: { edge: number; fwd: boolean }) => `${h.edge}${h.fwd ? '+' : '-'}`;
  for (const e of edges)
    for (const fwd of [true, false]) {
      if (used.has(key({ edge: e.id, fwd }))) continue;
      const steps: { edge: number; fwd: boolean }[] = [];
      let h = { edge: e.id, fwd };
      for (let guard = 0; guard < edges.length * 2 + 2; guard++) {
        if (used.has(key(h))) break;
        used.add(key(h));
        steps.push(h);
        const ed = edges[h.edge];
        const at = h.fwd ? ed.b : ed.a;
        // Direção de chegada invertida (a "gêmea" saindo do nó).
        const list = out.get(at)!;
        const twinIdx = list.findIndex((o) => o.edge === h.edge && o.fwd === !h.fwd);
        const next = list[(twinIdx - 1 + list.length) % list.length];
        h = { edge: next.edge, fwd: next.fwd };
      }
      // Polígono amostrado.
      const poly: Vec[] = [];
      for (const st of steps) {
        const ed = edges[st.edge];
        const isLine = curves[curveById.get(ed.curve)!].type === 'line';
        const n = isLine ? 1 : Math.max(4, Math.ceil(((ed.t1 - ed.t0) / TAU) * 96));
        for (let k = 0; k < n; k++) poly.push(sample(ed, st.fwd ? k / n : 1 - k / n));
      }
      loops.push({ steps, poly, area: exactArea(steps) });
    }

  // Faces: laços anti-horários; laços horários são furos (ou o contorno externo de um componente).
  const ccw = loops.filter((l) => l.area > 1e-12 * span * span);
  const cw = loops.filter((l) => l.area < -1e-12 * span * span);
  const faces = ccw.map((outer) => ({ outer, holes: [] as Loop[] }));
  for (const h of cw) {
    // Furo pertence à menor face que o contém (por um ponto do laço, levemente fora dele).
    const probe = h.poly[0];
    let best: { f: (typeof faces)[number]; a: number } | null = null;
    for (const f of faces) {
      if (Math.abs(f.outer.area) <= Math.abs(h.area) + 1e-12) continue;
      if (!inside(probe, f.outer.poly)) continue;
      // O próprio contorno externo do componente (mesmas arestas, sentido oposto) não é furo dele.
      const same = f.outer.steps.length === h.steps.length && f.outer.steps.every((s) => h.steps.some((t) => t.edge === s.edge));
      if (same) continue;
      if (!best || f.outer.area < best.a) best = { f, a: f.outer.area };
    }
    if (best) best.f.holes.push(h);
  }
  const regions: Region[] = faces.map((f, index) => {
    const ids = new Set<Id>();
    for (const l of [f.outer, ...f.holes]) for (const s of l.steps) ids.add(edges[s.edge].curve);
    return {
      index,
      outer: f.outer,
      holes: f.holes,
      area: f.outer.area + f.holes.reduce((s, h) => s + h.area, 0),
      curves: [...ids].sort(),
      label: labelPoint(f.outer.poly, f.holes.map((h) => h.poly)),
    };
  });
  // Borda externa: arestas com só um dos lados dentro de alguma região.
  const sides = new Map<number, number>();
  for (const f of faces) for (const l of [f.outer, ...f.holes]) for (const st of l.steps) sides.set(st.edge, (sides.get(st.edge) ?? 0) + 1);
  const outer = new Set<Id>();
  for (const [e, n] of sides) if (n === 1) outer.add(edges[e].curve);
  const edgeLen = (e: Edge) => {
    const c = curves[curveById.get(e.curve)!];
    if (c.type === 'line') return { len: dist(sample(e, 0), sample(e, 1)), curved: false, angle: 0 };
    return { len: c.r * (e.t1 - e.t0), curved: true, angle: e.t1 - e.t0 };
  };
  return { nodes, edges, regions, outer: [...outer].sort(), span, sample, edgeLen };
}

/** Região que contém o ponto (a mais interna). */
export function regionAt(arr: Arrangement, p: Vec): Region | null {
  let best: Region | null = null;
  for (const r of arr.regions) {
    if (!inside(p, r.outer.poly)) continue;
    if (r.holes.some((h) => inside(p, h.poly))) continue;
    if (!best || r.outer.area < best.outer.area) best = r;
  }
  return best;
}

/**
 * Reencontra, após uma mudança paramétrica, a região de uma atribuição: mesmas curvas de contorno
 * (identidade robusta); senão a que contém o ponto guardado.
 */
export function findRegion(arr: Arrangement, key: { curves: Id[]; seed: Vec }): Region | null {
  const k = key.curves.join('|');
  const exact = arr.regions.find((r) => r.curves.join('|') === k);
  if (exact) return exact;
  return regionAt(arr, key.seed);
}

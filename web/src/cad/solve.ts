// Monta a entrada do solver magnetostático a partir do projeto e da malha; pós-processamento simples.
import { T } from '../i18n';
import { asLength, evaluate, evaluateVariables } from './expr';
import { arcAngles } from './geometry';
import type { MeshResult } from './meshgen';
import { findRegion, type Arrangement } from './regions';
import type { Id, Sketch } from './types';

export const MU0 = 4e-7 * Math.PI;

/** Entrada do solver (ver core/src/magstatic.h); coordenadas em metros. */
export interface MagInput {
  xy: Float64Array | number[];
  triangles: Int32Array | number[];
  triRegion: Int32Array | number[];
  nu: number[];
  J: number[];
  brx: number[];
  bry: number[];
  axisymmetric: boolean;
  dirichletNodes: number[];
  dirichletValues: number[];
  periodicSlave: number[];
  periodicMaster: number[];
  periodicSign: number[];
}

export interface Solution {
  /** Potencial por nó: A_z (Wb/m) no plano, ψ = r·A_φ (Wb/rad) no axissimétrico. */
  A: Float64Array;
  bx: Float64Array;
  by: Float64Array;
  /** |B| por triângulo (T). */
  bmag: Float64Array;
  bmax: number;
  /** Energia magnética total (J): no plano já multiplicada pela profundidade. */
  energy: number;
  axisymmetric: boolean;
  /** Malha usada (para desenhar e para saber se ficou desatualizada). */
  mesh: MeshResult;
  /** Parâmetros por região (índice do arranjo) usados na solução — para a sonda. */
  nu: number[];
  brx: number[];
  bry: number[];
  /** Densidade de corrente por região (A/m²). */
  J: number[];
  /** Tamanho típico do elemento (mm). */
  meshSize: number;
  ms: number;
}

const num = (sk: Sketch, expr: string | undefined, def: number): number => {
  if (!expr?.trim()) return def;
  const { values } = evaluateVariables(sk.variables, sk.settings.unit);
  const q = evaluate(expr, { env: values, unit: sk.settings.unit });
  return q.v;
};

/** Profundidade do problema plano (m). */
export function depthOf(sk: Sketch): number {
  try {
    const { values } = evaluateVariables(sk.variables, sk.settings.unit);
    return asLength(evaluate(sk.settings.depth, { env: values, unit: sk.settings.unit }), sk.settings.unit) * 1e-3;
  } catch {
    return 1;
  }
}

/** Ordena os nós de duas curvas pareadas para casar ponto a ponto (periódico/antiperiódico). */
function pairOrder(xy: Float64Array, a: number[], b: number[]): [number[], number[]] {
  const P = (i: number) => ({ x: xy[2 * i], y: xy[2 * i + 1] });
  const same = (i: number, j: number) => i === j || Math.hypot(P(i).x - P(j).x, P(i).y - P(j).y) < 1e-12;
  const A = [...a];
  const B = [...b];
  const last = (l: number[]) => l[l.length - 1];
  // Setor (rotação): as duas curvas saem do mesmo ponto → as duas começam nele.
  if (same(last(A), B[0]) || same(last(A), last(B))) A.reverse();
  if (same(A[0], last(B))) B.reverse();
  else if (!same(A[0], B[0])) {
    // Translação: mesmo sentido.
    const da = { x: P(last(A)).x - P(A[0]).x, y: P(last(A)).y - P(A[0]).y };
    const db = { x: P(last(B)).x - P(B[0]).x, y: P(last(B)).y - P(B[0]).y };
    if (da.x * db.x + da.y * db.y < 0) B.reverse();
  }
  return [A, B];
}

export function buildMagInput(sk: Sketch, arr: Arrangement, mesh: MeshResult, outerDefault: Id[]): { input: MagInput; problems: string[] } {
  const t = T();
  const problems: string[] = [];
  const axisymmetric = sk.settings.problem === 'axisymmetric';
  const mats = new Map(sk.materials.map((m) => [m.id, m]));
  const nr = arr.regions.length;
  const nu = new Array<number>(nr).fill(1 / MU0);
  const J = new Array<number>(nr).fill(0);
  const brx = new Array<number>(nr).fill(0);
  const bry = new Array<number>(nr).fill(0);
  const assigned = new Set<number>();
  for (const a of sk.regionAssigns) {
    const r = findRegion(arr, a);
    if (!r || assigned.has(r.index)) continue;
    const m = a.material ? mats.get(a.material) : undefined;
    if (!m) continue;
    assigned.add(r.index);
    nu[r.index] = 1 / (MU0 * m.mur);
    try {
      const I = num(sk, a.current, 0);
      const N = a.turns ?? 1;
      if (I) J[r.index] = (I * N) / (Math.abs(r.area) * 1e-6);
      if (m.br) {
        const ang = (num(sk, a.magnetAngle, 0) * Math.PI) / 180;
        brx[r.index] = m.br * Math.cos(ang);
        bry[r.index] = m.br * Math.sin(ang);
      }
    } catch (e) {
      problems.push(`${a.name ?? t.mesh.region(r.index + 1)}: ${(e as Error).message}`);
    }
  }
  for (const r of arr.regions) if (!assigned.has(r.index)) problems.push(t.solve.noMaterial(r.index + 1));

  const xy = mesh.xy;
  const nn = xy.length / 2;
  const dirichlet = new Map<number, number>();
  const setD = (ids: Id[], v: number) => {
    for (const c of ids) for (const n of mesh.curveNodes[c] ?? []) dirichlet.set(n, v);
  };
  setD(outerDefault, 0);
  const slave: number[] = [];
  const master: number[] = [];
  const sign: number[] = [];
  for (const b of sk.boundaries) {
    if (b.type === 'dirichlet') {
      let v = 0;
      try {
        v = num(sk, b.value, 0);
      } catch (e) {
        problems.push(`${b.name}: ${(e as Error).message}`);
      }
      setD(b.curves, v);
    } else if (b.type === 'periodic' || b.type === 'antiperiodic') {
      if (b.curves.length !== 2) {
        problems.push(`${b.name}: ${t.mesh.periodicNeedsTwo}`);
        continue;
      }
      const la = mesh.curveNodes[b.curves[0]] ?? [];
      const lb = mesh.curveNodes[b.curves[1]] ?? [];
      if (la.length !== lb.length || !la.length) {
        problems.push(t.solve.periodicMismatch(b.name));
        continue;
      }
      const [A, B] = pairOrder(xy, la, lb);
      for (let i = 0; i < A.length; i++) {
        if (A[i] === B[i]) continue;
        slave.push(B[i]);
        master.push(A[i]);
        sign.push(b.type === 'periodic' ? 1 : -1);
      }
    }
  }
  if (axisymmetric) {
    // No eixo (r = 0) ψ = 0; região com r < 0 não faz sentido.
    let neg = false;
    for (let i = 0; i < nn; i++) {
      if (Math.abs(xy[2 * i]) < 1e-9) dirichlet.set(i, 0);
      if (xy[2 * i] < -1e-9) neg = true;
    }
    if (neg) problems.push(t.solve.negativeR);
  }
  if (!dirichlet.size) problems.push(t.solve.noDirichlet);

  const xym = new Float64Array(xy.length);
  for (let i = 0; i < xy.length; i++) xym[i] = xy[i] * 1e-3;
  return {
    input: {
      xy: xym,
      triangles: mesh.triangles,
      triRegion: mesh.triRegion,
      nu,
      J,
      brx,
      bry,
      axisymmetric,
      dirichletNodes: [...dirichlet.keys()],
      dirichletValues: [...dirichlet.values()],
      periodicSlave: slave,
      periodicMaster: master,
      periodicSign: sign,
    },
    problems,
  };
}

/** Triângulo que contém o ponto (mm) e as coordenadas baricêntricas. */
export function locate(mesh: MeshResult, p: { x: number; y: number }): { tri: number; w: [number, number, number] } | null {
  const { xy, triangles } = mesh;
  for (let t = 0; t < triangles.length; t += 3) {
    const a = triangles[t], b = triangles[t + 1], c = triangles[t + 2];
    const x1 = xy[2 * a], y1 = xy[2 * a + 1], x2 = xy[2 * b], y2 = xy[2 * b + 1], x3 = xy[2 * c], y3 = xy[2 * c + 1];
    const d = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3);
    if (d === 0) continue;
    const l1 = ((y2 - y3) * (p.x - x3) + (x3 - x2) * (p.y - y3)) / d;
    const l2 = ((y3 - y1) * (p.x - x3) + (x1 - x3) * (p.y - y3)) / d;
    const l3 = 1 - l1 - l2;
    if (l1 >= -1e-9 && l2 >= -1e-9 && l3 >= -1e-9) return { tri: t / 3, w: [l1, l2, l3] };
  }
  return null;
}

/** Valores num ponto: B (T), H (A/m), A. */
export function probe(sol: Solution, p: { x: number; y: number }) {
  const hit = locate(sol.mesh, p);
  if (!hit) return null;
  const t = hit.tri;
  const tr = sol.mesh.triangles;
  const A = hit.w[0] * sol.A[tr[3 * t]] + hit.w[1] * sol.A[tr[3 * t + 1]] + hit.w[2] * sol.A[tr[3 * t + 2]];
  const r = sol.mesh.triRegion[t];
  const nu = r >= 0 ? sol.nu[r] : 1 / MU0;
  const bx = sol.bx[t], by = sol.by[t];
  const hx = nu * (bx - (r >= 0 ? sol.brx[r] : 0));
  const hy = nu * (by - (r >= 0 ? sol.bry[r] : 0));
  return { region: r, A, bx, by, b: Math.hypot(bx, by), hx, hy, h: Math.hypot(hx, hy), mur: 1 / (nu * MU0) };
}

/** |H| por triângulo (A/m). */
export function hmagOf(sol: Solution): Float64Array {
  const n = sol.bx.length;
  const out = new Float64Array(n);
  for (let t = 0; t < n; t++) {
    const r = sol.mesh.triRegion[t];
    const nu = r >= 0 ? sol.nu[r] : 1 / MU0;
    out[t] = nu * Math.hypot(sol.bx[t] - (r >= 0 ? sol.brx[r] : 0), sol.by[t] - (r >= 0 ? sol.bry[r] : 0));
  }
  return out;
}

/** Potencial médio por triângulo. */
export function aTriOf(sol: Solution): Float64Array {
  const tr = sol.mesh.triangles;
  const out = new Float64Array(tr.length / 3);
  for (let t = 0; t < out.length; t++) out[t] = (sol.A[tr[3 * t]] + sol.A[tr[3 * t + 1]] + sol.A[tr[3 * t + 2]]) / 3;
  return out;
}

/** Pontos ao longo de uma curva do desenho (mm), com comprimento acumulado e tangente unitária. */
export function sampleCurve(sk: Sketch, id: Id, n = 200): { pts: { x: number; y: number }[]; s: number[]; tan: { x: number; y: number }[] } | null {
  const c = sk.entities[id];
  if (!c) return null;
  const P = (pid: Id) => sk.entities[pid] as unknown as { x: number; y: number };
  const pts: { x: number; y: number }[] = [];
  const tan: { x: number; y: number }[] = [];
  const s: number[] = [];
  if (c.type === 'line') {
    const a = P(c.p1), b = P(c.p2);
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (!L) return null;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      pts.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
      tan.push({ x: (b.x - a.x) / L, y: (b.y - a.y) / L });
      s.push(L * u);
    }
  } else if (c.type === 'circle' || c.type === 'arc') {
    const o = P(c.c);
    let a0 = 0, a1 = 2 * Math.PI;
    if (c.type === 'arc') {
      const g = arcAngles(sk, c);
      a0 = g.start;
      a1 = g.end;
    }
    for (let i = 0; i <= n; i++) {
      const th = a0 + ((a1 - a0) * i) / n;
      pts.push({ x: o.x + c.r * Math.cos(th), y: o.y + c.r * Math.sin(th) });
      tan.push({ x: -Math.sin(th), y: Math.cos(th) });
      s.push(c.r * (th - a0));
    }
  } else return null;
  return { pts, s, tan };
}

export interface LineProfile {
  s: number[];
  b: number[];
  bn: number[];
  bt: number[];
  h: number[];
  a: number[];
  /** Fluxo que atravessa a curva (Wb), no sentido da normal à esquerda do percurso. */
  flux: number;
  bAvg: number;
  bMax: number;
  length: number;
}

/**
 * Grandezas ao longo da curva. Normal n = tangente girada 90° (à esquerda do sentido da curva).
 * Fluxo: plano Φ = −(A_fim − A_início)·profundidade; axissimétrico Φ = 2π (ψ_fim − ψ_início).
 */
export function lineProfile(sol: Solution, sk: Sketch, id: Id, n = 200): LineProfile | null {
  const smp = sampleCurve(sk, id, n);
  if (!smp) return null;
  const out: LineProfile = { s: [], b: [], bn: [], bt: [], h: [], a: [], flux: 0, bAvg: 0, bMax: 0, length: smp.s[smp.s.length - 1] };
  for (let i = 0; i < smp.pts.length; i++) {
    const pr = probe(sol, smp.pts[i]);
    if (!pr) continue;
    const t = smp.tan[i];
    out.s.push(smp.s[i]);
    out.b.push(pr.b);
    out.bt.push(pr.bx * t.x + pr.by * t.y);
    out.bn.push(-pr.bx * t.y + pr.by * t.x);
    out.h.push(pr.h);
    out.a.push(pr.A);
  }
  if (out.s.length < 2) return null;
  const dA = out.a[out.a.length - 1] - out.a[0];
  out.flux = sol.axisymmetric ? 2 * Math.PI * dA : -dA * depthOf(sk);
  let area = 0;
  for (let i = 1; i < out.s.length; i++) area += ((out.b[i] + out.b[i - 1]) / 2) * (out.s[i] - out.s[i - 1]);
  out.bAvg = area / (out.s[out.s.length - 1] - out.s[0] || 1);
  out.bMax = Math.max(...out.b);
  return out;
}

/** Tamanho típico do elemento (mm): lado do triângulo equilátero de área média. */
export function typicalSize(mesh: MeshResult): number {
  const { xy, triangles } = mesh;
  let A = 0;
  for (let t = 0; t < triangles.length; t += 3) {
    const a = triangles[t], b = triangles[t + 1], c = triangles[t + 2];
    A += Math.abs((xy[2 * b] - xy[2 * a]) * (xy[2 * c + 1] - xy[2 * a + 1]) - (xy[2 * c] - xy[2 * a]) * (xy[2 * b + 1] - xy[2 * a + 1])) / 2;
  }
  const n = triangles.length / 3 || 1;
  return Math.sqrt(((A / n) * 4) / Math.sqrt(3));
}

export type Component = 'mag' | 'x' | 'y';

/** Valor por triângulo de uma grandeza (e componente) — base de superfícies, contornos e legendas. */
export function triValues(sol: Solution, q: 'b' | 'h' | 'a' | 'j', comp: Component = 'mag'): Float64Array {
  const n = sol.bx.length;
  const out = new Float64Array(n);
  const tr = sol.mesh.triangles;
  for (let t = 0; t < n; t++) {
    const r = sol.mesh.triRegion[t];
    if (q === 'a') out[t] = (sol.A[tr[3 * t]] + sol.A[tr[3 * t + 1]] + sol.A[tr[3 * t + 2]]) / 3;
    else if (q === 'j') out[t] = r >= 0 ? sol.J[r] * 1e-6 : 0; // A/mm²
    else {
      let x = sol.bx[t], y = sol.by[t];
      if (q === 'h') {
        const nu = r >= 0 ? sol.nu[r] : 1 / MU0;
        x = nu * (x - (r >= 0 ? sol.brx[r] : 0));
        y = nu * (y - (r >= 0 ? sol.bry[r] : 0));
      }
      out[t] = comp === 'x' ? x : comp === 'y' ? y : Math.hypot(x, y);
    }
  }
  return out;
}

/** Valor por nó: A é nodal; as demais, média dos triângulos vizinhos ponderada pela área. */
export function nodeValues(sol: Solution, q: 'b' | 'h' | 'a' | 'j', comp: Component = 'mag'): Float64Array {
  if (q === 'a') return sol.A;
  const tv = triValues(sol, q, comp);
  const { xy, triangles } = sol.mesh;
  const nn = xy.length / 2;
  const sum = new Float64Array(nn), w = new Float64Array(nn);
  for (let t = 0; t < tv.length; t++) {
    const a = triangles[3 * t], b = triangles[3 * t + 1], c = triangles[3 * t + 2];
    const ar = Math.abs((xy[2 * b] - xy[2 * a]) * (xy[2 * c + 1] - xy[2 * a + 1]) - (xy[2 * c] - xy[2 * a]) * (xy[2 * b + 1] - xy[2 * a + 1]));
    for (const v of [a, b, c]) {
      sum[v] += tv[t] * ar;
      w[v] += ar;
    }
  }
  for (let i = 0; i < nn; i++) sum[i] = w[i] ? sum[i] / w[i] : 0;
  return sum;
}

/** Rótulo da grandeza para legendas e gráficos. */
export function quantityLabel(q: string, comp: Component, axisymmetric: boolean): string {
  const c = comp === 'mag' ? '' : axisymmetric ? (comp === 'x' ? '_r' : '_z') : comp === 'x' ? '_x' : '_y';
  if (q === 'b') return comp === 'mag' ? '|B| (T)' : `B${c} (T)`;
  if (q === 'h') return comp === 'mag' ? '|H| (A/m)' : `H${c} (A/m)`;
  if (q === 'a') return axisymmetric ? 'ψ (Wb/rad)' : 'A (Wb/m)';
  if (q === 'j') return 'J (A/mm²)';
  if (q === 'bn') return 'B normal (T)';
  if (q === 'bt') return 'B tang. (T)';
  return q;
}

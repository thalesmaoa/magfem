// Monta a entrada do solver magnetostático a partir do projeto e da malha; pós-processamento simples.
import { T } from '../i18n';
import { asLength, evaluate, evaluateVariables } from './expr';
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

// Monta a entrada do solver magnetostático a partir do projeto e da malha; pós-processamento simples.
import { T } from '../i18n';
import { asLength, evaluate, evaluateVariables } from './expr';
import { arcAngles } from './geometry';
import type { MeshResult } from './meshgen';
import { findRegion, type Arrangement } from './regions';
import { BOUNDARY_UNSUPPORTED, OUTER_BOUNDARY, type Boundary, type Id, type Sketch } from './types';

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
  /** Contorno misto: arestas (robinA[k], robinB[k]) com ν ∂A/∂n + c0 A + c1 = 0. */
  robinA?: number[];
  robinB?: number[];
  robinC0?: number[];
  robinC1?: number[];
  /** Curvas B-H: região r usa bhB/bhH[bhStart[r] .. bhStart[r+1]). */
  bhStart?: number[];
  bhB?: number[];
  bhH?: number[];
  /** Transitório: σ por região (S/m, só condutores sem fonte), fase da fonte (rad), frequência, passo, número de passos. */
  sigma?: number[];
  jPhase?: number[];
  freq?: number;
  dt?: number;
  steps?: number;
  /** Fontes por passo: J das regiões (steps × regiões) e das fontes do circuito (steps × elementos). */
  jSteps?: number[];
  elSteps?: number[];
  /** Circuito externo acoplado (ver core/src/magstatic.h). */
  netNodes?: number;
  elType?: number[];
  elA?: number[];
  elB?: number[];
  elCoil?: number[];
  elValue?: number[];
  elFreq?: number[];
  elPhase?: number[];
  elDC?: number[];
  coilStart?: number[];
  coilRegion?: number[];
  coilTurns?: number[];
  coilR?: number[];
  depth?: number;
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
  /** Iterações de Newton (materiais não lineares). */
  iterations?: number;
  /** Transitório: A de cada passo (steps × nós), tempos (s) e o passo mostrado. */
  At?: Float64Array;
  times?: Float64Array;
  freq?: number;
  jPhase?: number[];
  /** J de cada região em cada passo (transitório com correntes em função de t). */
  jSteps?: number[];
  /** Circuito externo acoplado: tensões de nó e correntes de elemento por passo. */
  circuit?: { schematic: Id; nodeV: Float64Array; elI: Float64Array; netNodes: number; partOf: Id[]; nodeOf: Map<string, number> };
  /** Quadro derivado: a solução transitória de origem e o índice do passo. */
  frameOf?: Solution;
  frame?: number;
}

/** Ambiente das expressões: variáveis do projeto + t (s, sem unidade). */
export function envAt(sk: Sketch, t: number): Map<string, { v: number; L: number; A: number }> {
  const { values } = evaluateVariables(sk.variables, sk.settings.unit);
  const env = new Map(values);
  env.set('t', { v: t, L: 0, A: 0 });
  return env;
}

const num = (sk: Sketch, expr: string | undefined, def: number, env = envAt(sk, 0)): number => {
  if (!expr?.trim()) return def;
  return evaluate(expr, { env, unit: sk.settings.unit }).v;
};

/**
 * J (A/m²) de cada região no instante t: corrente (da região ou do circuito, expressão que pode usar t)
 * × espiras / área. Regiões de circuitos em `skip` ficam com J = 0 (a corrente vem do circuito externo).
 */
export function regionJ(sk: Sketch, arr: Arrangement, t: number, skip: Set<Id> = new Set()): number[] {
  const env = envAt(sk, t);
  const J = new Array<number>(arr.regions.length).fill(0);
  const seen = new Set<number>();
  for (const a of sk.regionAssigns) {
    const r = findRegion(arr, a);
    if (!r || seen.has(r.index) || !a.material) continue;
    seen.add(r.index);
    if (a.circuit && skip.has(a.circuit)) continue;
    const circ = a.circuit ? sk.circuits.find((c) => c.id === a.circuit) : undefined;
    const I = circ ? num(sk, circ.current, 0, env) : num(sk, a.current, 0, env);
    if (I) J[r.index] = (I * (a.turns ?? 1)) / (Math.abs(r.area) * 1e-6);
  }
  return J;
}

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
  const sigma = new Array<number>(nr).fill(0);
  const jPhase = new Array<number>(nr).fill(0);
  const bhRegion = new Array<[number, number][] | undefined>(nr).fill(undefined);
  for (const a of sk.regionAssigns) {
    const r = findRegion(arr, a);
    if (!r || assigned.has(r.index)) continue;
    const m = a.material ? mats.get(a.material) : undefined;
    if (!m) continue;
    assigned.add(r.index);
    nu[r.index] = 1 / (MU0 * m.mur);
    if (m.bh && m.bh.length >= 2) bhRegion[r.index] = m.bh.filter(([h, b]) => h > 0 && b > 0).map(([h, b]) => [b, h]);
    // Correntes parasitas só em condutores sem fonte (bobina com corrente imposta = enrolamento, σ ignorado).
    if (!a.current && !a.circuit && m.sigma > 0) sigma[r.index] = m.sigma * 1e6;
    try {
      // Corrente: do circuito (se a região estiver ligada a um) ou da própria região.
      const circ = a.circuit ? sk.circuits.find((c) => c.id === a.circuit) : undefined;
      const I = circ ? num(sk, circ.current, 0) : num(sk, a.current, 0);
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
  // Prescribed A (FEMM): A = A0 + A1·x + A2·y, x e y em metros.
  const prescribed = (b: Boundary, ids: Id[]) => {
    let a0 = 0, a1 = 0, a2 = 0;
    try {
      a0 = num(sk, b.value, 0);
      a1 = num(sk, b.a1, 0);
      a2 = num(sk, b.a2, 0);
    } catch (e) {
      problems.push(`${b.name}: ${(e as Error).message}`);
    }
    for (const c of ids) for (const n of mesh.curveNodes[c] ?? []) dirichlet.set(n, a0 + a1 * xy[2 * n] * 1e-3 + a2 * xy[2 * n + 1] * 1e-3);
  };
  // Borda externa sem contorno: segue o "Dirichlet (A = 0)" da biblioteca (ou A = 0 se ele foi removido).
  const outerB = sk.boundaries.find((b) => b.id === OUTER_BOUNDARY && b.type === 'dirichlet');
  if (outerB) prescribed(outerB, outerDefault);
  else setD(outerDefault, 0);
  const slave: number[] = [];
  const master: number[] = [];
  const sign: number[] = [];
  const robinA: number[] = [], robinB: number[] = [], robinC0: number[] = [], robinC1: number[] = [];
  let anchored = false; // contorno misto com c0 > 0 também fixa o potencial
  for (const b of sk.boundaries) {
    if (!b.curves.length) continue; // condição da biblioteca ainda não usada
    if (BOUNDARY_UNSUPPORTED.includes(b.type)) {
      problems.push(t.solve.boundaryUnsupported(b.name, t.mesh[b.type]));
      continue;
    }
    if (b.type === 'dirichlet') prescribed(b, b.curves);
    else if (b.type === 'mixed') {
      if (axisymmetric) {
        problems.push(t.solve.mixedAxi(b.name));
        continue;
      }
      let c0 = 0, c1 = 0;
      try {
        c0 = num(sk, b.c0, 0);
        c1 = num(sk, b.c1, 0);
      } catch (e) {
        problems.push(`${b.name}: ${(e as Error).message}`);
      }
      if (c0 > 0) anchored = true;
      for (const c of b.curves) {
        const nodes = mesh.curveNodes[c] ?? [];
        for (let k = 0; k + 1 < nodes.length; k++) {
          robinA.push(nodes[k]);
          robinB.push(nodes[k + 1]);
          robinC0.push(c0);
          robinC1.push(c1);
        }
      }
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
  if (!dirichlet.size && !anchored) problems.push(t.solve.noDirichlet);

  const bhStart: number[] = [0];
  const bhB: number[] = [];
  const bhH: number[] = [];
  for (let r = 0; r < nr; r++) {
    for (const [b, h] of bhRegion[r] ?? []) {
      bhB.push(b);
      bhH.push(h);
    }
    bhStart.push(bhB.length);
  }
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
      ...(robinA.length ? { robinA, robinB, robinC0, robinC1 } : {}),
      bhStart,
      bhB,
      bhH,
      sigma,
      jPhase,
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
  /** H tangencial (A/m), para ∮H·dl. */
  ht: number[];
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
export function lineProfile(sol: Solution, sk: Sketch, id: Id, n = 200, smooth = false): LineProfile | null {
  const smp = sampleCurve(sk, id, n);
  if (!smp) return null;
  const out: LineProfile = { s: [], b: [], bn: [], bt: [], h: [], ht: [], a: [], flux: 0, bAvg: 0, bMax: 0, length: smp.s[smp.s.length - 1] };
  for (let i = 0; i < smp.pts.length; i++) {
    const pr = smooth ? probeSmooth(sol, smp.pts[i]) : probe(sol, smp.pts[i]);
    if (!pr) continue;
    const t = smp.tan[i];
    out.s.push(smp.s[i]);
    out.b.push(pr.b);
    out.bt.push(pr.bx * t.x + pr.by * t.y);
    out.bn.push(-pr.bx * t.y + pr.by * t.x);
    out.h.push(pr.h);
    out.ht.push(pr.hx * t.x + pr.hy * t.y);
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

// ---------- Interpolação de alta ordem (filtro "suavizar") ----------

/**
 * Gradiente de A recuperado nos nós, por região (média dos triângulos da mesma região, ponderada
 * pela área) — não mistura materiais diferentes, onde a derivada normal salta.
 */
function recoveredGradients(sol: Solution): (t: number, k: number) => [number, number] {
  const { xy, triangles, triRegion } = sol.mesh;
  const nt = triangles.length / 3;
  const gx = new Float64Array(nt), gy = new Float64Array(nt), ar = new Float64Array(nt);
  for (let t = 0; t < nt; t++) {
    const v = [triangles[3 * t], triangles[3 * t + 1], triangles[3 * t + 2]];
    const x = v.map((i) => xy[2 * i]), y = v.map((i) => xy[2 * i + 1]);
    const a2 = (x[1] - x[0]) * (y[2] - y[0]) - (x[2] - x[0]) * (y[1] - y[0]);
    let dx = 0, dy = 0;
    for (let k = 0; k < 3; k++) {
      const j = (k + 1) % 3, l = (k + 2) % 3;
      dx += ((y[j] - y[l]) * sol.A[v[k]]) / a2;
      dy += ((x[l] - x[j]) * sol.A[v[k]]) / a2;
    }
    gx[t] = dx;
    gy[t] = dy;
    ar[t] = Math.abs(a2);
  }
  const acc = new Map<number, [number, number, number]>();
  const key = (node: number, reg: number) => node * 4096 + (reg + 1);
  for (let t = 0; t < nt; t++)
    for (let k = 0; k < 3; k++) {
      const kk = key(triangles[3 * t + k], triRegion[t]);
      const a = acc.get(kk) ?? [0, 0, 0];
      a[0] += gx[t] * ar[t];
      a[1] += gy[t] * ar[t];
      a[2] += ar[t];
      acc.set(kk, a);
    }
  return (t, k) => {
    const a = acc.get(key(triangles[3 * t + k], triRegion[t]))!;
    return [a[0] / a[2], a[1] / a[2]];
  };
}

const quadCache = new WeakMap<Solution, ReturnType<typeof buildQuadratic>>();
function quadratic(sol: Solution) {
  let q = quadCache.get(sol);
  if (!q) quadCache.set(sol, (q = buildQuadratic(sol)));
  return q;
}

/** Interpolante quadrático por triângulo: valores nos vértices e nos meios das arestas (Hermite). */
function buildQuadratic(sol: Solution) {
  const { xy, triangles } = sol.mesh;
  const g = recoveredGradients(sol);
  const nt = triangles.length / 3;
  // mids[t*3 + e]: meio da aresta e = (k, k+1)
  const mids = new Float64Array(nt * 3);
  for (let t = 0; t < nt; t++)
    for (let e = 0; e < 3; e++) {
      const i = triangles[3 * t + e], j = triangles[3 * t + ((e + 1) % 3)];
      const gi = g(t, e), gj = g(t, (e + 1) % 3);
      const dx = xy[2 * j] - xy[2 * i], dy = xy[2 * j + 1] - xy[2 * i + 1];
      mids[3 * t + e] = (sol.A[i] + sol.A[j]) / 2 + ((gi[0] - gj[0]) * dx + (gi[1] - gj[1]) * dy) / 8;
    }
  /** Valor e gradiente no triângulo t, coordenadas baricêntricas l. */
  const evalAt = (t: number, l: [number, number, number]) => {
    const v = [triangles[3 * t], triangles[3 * t + 1], triangles[3 * t + 2]];
    const A = v.map((i) => sol.A[i]);
    const m = [mids[3 * t], mids[3 * t + 1], mids[3 * t + 2]]; // m01, m12, m20
    const val =
      A[0] * l[0] * (2 * l[0] - 1) + A[1] * l[1] * (2 * l[1] - 1) + A[2] * l[2] * (2 * l[2] - 1) + 4 * m[0] * l[0] * l[1] + 4 * m[1] * l[1] * l[2] + 4 * m[2] * l[2] * l[0];
    const dl = [A[0] * (4 * l[0] - 1) + 4 * m[0] * l[1] + 4 * m[2] * l[2], A[1] * (4 * l[1] - 1) + 4 * m[0] * l[0] + 4 * m[1] * l[2], A[2] * (4 * l[2] - 1) + 4 * m[1] * l[1] + 4 * m[2] * l[0]];
    const x = v.map((i) => xy[2 * i]), y = v.map((i) => xy[2 * i + 1]);
    const a2 = (x[1] - x[0]) * (y[2] - y[0]) - (x[2] - x[0]) * (y[1] - y[0]);
    let dx = 0, dy = 0;
    for (let k = 0; k < 3; k++) {
      const j = (k + 1) % 3, q = (k + 2) % 3;
      dx += (dl[k] * (y[j] - y[q])) / a2;
      dy += (dl[k] * (x[q] - x[j])) / a2;
    }
    return { val, dx, dy };
  };
  return evalAt;
}

/** B a partir do gradiente de A (mm → m) no ponto (x em mm para o raio axissimétrico). */
function bFromGrad(sol: Solution, dx: number, dy: number, xmm: number): [number, number] {
  const k = 1e3; // dA/dx em Wb/m por mm → por m
  if (sol.axisymmetric) {
    const r = Math.max(xmm * 1e-3, 1e-12);
    return [(-dy * k) / r, (dx * k) / r];
  }
  return [dy * k, -dx * k];
}

const smoothCache = new WeakMap<Solution, Map<number, Solution>>();

/** Solução refinada: cada triângulo em level² subtriângulos com valores do interpolante quadrático. */
export function smoothSolution(sol: Solution, level: number): Solution {
  const n = Math.max(1, Math.min(6, Math.round(level)));
  let byLevel = smoothCache.get(sol);
  if (!byLevel) smoothCache.set(sol, (byLevel = new Map()));
  const hit = byLevel.get(n);
  if (hit) return hit;
  const evalAt = quadratic(sol);
  const { xy, triangles, triRegion } = sol.mesh;
  const nt = triangles.length / 3;
  const per = ((n + 1) * (n + 2)) / 2;
  const nxy = new Float64Array(nt * per * 2);
  const nA = new Float64Array(nt * per);
  const ntri: number[] = [];
  const nreg: number[] = [];
  const bx: number[] = [];
  const by: number[] = [];
  for (let t = 0; t < nt; t++) {
    const v = [triangles[3 * t], triangles[3 * t + 1], triangles[3 * t + 2]];
    const base = t * per;
    const idx = (i: number, j: number) => base + (i * (2 * n + 3 - i)) / 2 + j; // i: linha (l0 = 1 − i/n), j: coluna
    for (let i = 0; i <= n; i++)
      for (let j = 0; j <= n - i; j++) {
        const l: [number, number, number] = [1 - (i + j) / n, i / n, j / n];
        const p = idx(i, j);
        nxy[2 * p] = l[0] * xy[2 * v[0]] + l[1] * xy[2 * v[1]] + l[2] * xy[2 * v[2]];
        nxy[2 * p + 1] = l[0] * xy[2 * v[0] + 1] + l[1] * xy[2 * v[1] + 1] + l[2] * xy[2 * v[2] + 1];
        nA[p] = evalAt(t, l).val;
      }
    const addTri = (a: number, b: number, c: number, lc: [number, number, number]) => {
      ntri.push(a, b, c);
      nreg.push(triRegion[t]);
      const e = evalAt(t, lc);
      const xc = (nxy[2 * a] + nxy[2 * b] + nxy[2 * c]) / 3;
      const [Bx, By] = bFromGrad(sol, e.dx, e.dy, xc);
      bx.push(Bx);
      by.push(By);
    };
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n - i; j++) {
        addTri(idx(i, j), idx(i + 1, j), idx(i, j + 1), [1 - (i + j + 2 / 3) / n, (i + 1 / 3) / n, (j + 1 / 3) / n]);
        if (j < n - i - 1) addTri(idx(i + 1, j), idx(i + 1, j + 1), idx(i, j + 1), [1 - (i + j + 4 / 3) / n, (i + 2 / 3) / n, (j + 2 / 3) / n]);
      }
  }
  const BX = new Float64Array(bx), BY = new Float64Array(by);
  const bmag = new Float64Array(BX.length);
  let bmax = 0;
  for (let i = 0; i < bmag.length; i++) {
    bmag[i] = Math.hypot(BX[i], BY[i]);
    if (bmag[i] > bmax) bmax = bmag[i];
  }
  const tris = new Int32Array(ntri);
  const out: Solution = {
    ...sol,
    A: nA,
    bx: BX,
    by: BY,
    bmag,
    bmax,
    mesh: { ...sol.mesh, xy: nxy, triangles: tris, triRegion: new Int32Array(nreg), nodes: nA.length, elements: tris.length / 3 },
    meshSize: sol.meshSize / n,
  };
  byLevel.set(n, out);
  return out;
}

/** Sonda com o interpolante quadrático (usada por gráficos sobre linha com fonte interpolada). */
export function probeSmooth(sol: Solution, p: { x: number; y: number }) {
  const hit = locate(sol.mesh, p);
  if (!hit) return null;
  const evalAt = quadratic(sol);
  const e = evalAt(hit.tri, hit.w);
  const [bx, by] = bFromGrad(sol, e.dx, e.dy, p.x);
  const r = sol.mesh.triRegion[hit.tri];
  const nu = r >= 0 ? sol.nu[r] : 1 / MU0;
  const hx = nu * (bx - (r >= 0 ? sol.brx[r] : 0)), hy = nu * (by - (r >= 0 ? sol.bry[r] : 0));
  return { region: r, A: e.val, bx, by, b: Math.hypot(bx, by), hx, hy, h: Math.hypot(hx, hy), mur: 1 / (nu * MU0) };
}

// ---------- Circuitos: fluxo concatenado, indutância, resistência e perdas ----------

export interface CircuitResult {
  id: Id;
  name: string;
  /** Corrente (A). */
  I: number;
  /** Fluxo concatenado λ = Σ (N/A) ∫ A dΩ × profundidade (plano) ou Σ (N/A) ∫ 2πψ dΩ (axissimétrico), Wb. */
  lambda: number;
  /** Indutância aparente λ/I (H); null se I = 0. */
  L: number | null;
  /** Resistência CC (Ω): Σ N² ℓ / (σ A), ℓ = profundidade (plano) ou 2π r̄ (axissimétrico); null se σ = 0. */
  R: number | null;
  /** Tensão CC = R·I (V) e perdas Joule R·I² (W). */
  V: number | null;
  P: number | null;
  regions: number;
  turns: number;
}

export function circuitResults(sk: Sketch, arr: Arrangement, sol: Solution): CircuitResult[] {
  const { xy, triangles, triRegion } = sol.mesh;
  const nt = triangles.length / 3;
  // ∫A dΩ (m²·valor), área (m²) e raio médio (m) por região, a partir da malha.
  const nr = arr.regions.length;
  const intA = new Float64Array(nr), area = new Float64Array(nr), rA = new Float64Array(nr);
  for (let t = 0; t < nt; t++) {
    const r = triRegion[t];
    if (r < 0 || r >= nr) continue;
    const a = triangles[3 * t], b = triangles[3 * t + 1], c = triangles[3 * t + 2];
    const ar = (Math.abs((xy[2 * b] - xy[2 * a]) * (xy[2 * c + 1] - xy[2 * a + 1]) - (xy[2 * c] - xy[2 * a]) * (xy[2 * b + 1] - xy[2 * a + 1])) / 2) * 1e-6;
    intA[r] += ((sol.A[a] + sol.A[b] + sol.A[c]) / 3) * ar;
    area[r] += ar;
    rA[r] += (((xy[2 * a] + xy[2 * b] + xy[2 * c]) / 3) * 1e-3) * ar;
  }
  const depth = depthOf(sk);
  const mats = new Map(sk.materials.map((m) => [m.id, m]));
  return sk.circuits.map((c) => {
    let I = 0;
    try {
      I = num(sk, c.current, 0);
    } catch {
      I = 0;
    }
    let lambda = 0, R = 0, rOk = true, regions = 0, turns = 0;
    for (const a of sk.regionAssigns) {
      if (a.circuit !== c.id) continue;
      const reg = findRegion(arr, a);
      if (!reg || !area[reg.index]) continue;
      const i = reg.index;
      const N = a.turns ?? 1;
      regions++;
      turns += Math.abs(N);
      lambda += sol.axisymmetric ? (N / area[i]) * 2 * Math.PI * intA[i] : (N / area[i]) * intA[i] * depth;
      const sigma = (a.material ? mats.get(a.material)?.sigma ?? 0 : 0) * 1e6; // MS/m → S/m
      const len = sol.axisymmetric ? 2 * Math.PI * (rA[i] / area[i]) : depth;
      if (sigma > 0) R += (N * N * len) / (sigma * area[i]);
      else rOk = false;
    }
    const Rv = rOk && regions ? R : null;
    return { id: c.id, name: c.name, I, lambda, L: I ? lambda / I : null, R: Rv, V: Rv !== null ? Rv * I : null, P: Rv !== null ? Rv * I * I : null, regions, turns };
  });
}

// ---------- Integrais (tabelas de resultados) ----------

const trapz = (s: number[], y: number[]) => {
  let v = 0;
  for (let i = 1; i < s.length; i++) v += ((y[i] + y[i - 1]) / 2) * (s[i] - s[i - 1]);
  return v;
};

export interface LineIntegrals {
  length: number; // mm
  flux: number; // Wb (plano: × profundidade)
  intB: number; // ∫|B| dl (T·m)
  intBn: number; // ∫B·n dl (T·m) = fluxo por metro no plano
  mmf: number; // ∫H·dl (A)
  bAvg: number;
}

export function lineIntegrals(sol: Solution, sk: Sketch, curve: Id, smooth = false): LineIntegrals | null {
  const p = lineProfile(sol, sk, curve, 400, smooth);
  if (!p) return null;
  const sm = p.s.map((x) => x * 1e-3);
  return { length: p.length, flux: p.flux, intB: trapz(sm, p.b), intBn: trapz(sm, p.bn), mmf: trapz(sm, p.ht), bAvg: p.bAvg };
}

export interface SurfaceIntegrals {
  area: number; // m²
  volume: number; // m³ (plano: área × profundidade; axissimétrico: ∫2πr dA)
  current: number; // ∫J dA (A)
  energy: number; // ½∫ν|B−Br|² dV (J)
  bAvg: number; // média de |B| na área (T)
  b2: number; // ∫|B|² dV (T²·m³)
  bx: number; // média de B_x (ou B_r) (T)
  by: number; // média de B_y (ou B_z) (T)
  intA: number; // ∫A dS (Wb·m no plano; ∫ψ dS no axissimétrico)
}

/** Integrais sobre as regiões dadas (índices do arranjo). */
export function surfaceIntegrals(sol: Solution, sk: Sketch, regions: Set<number>): SurfaceIntegrals {
  const { xy, triangles, triRegion } = sol.mesh;
  const depth = depthOf(sk);
  const out: SurfaceIntegrals = { area: 0, volume: 0, current: 0, energy: 0, bAvg: 0, b2: 0, bx: 0, by: 0, intA: 0 };
  for (let t = 0; t < triangles.length / 3; t++) {
    const r = triRegion[t];
    if (!regions.has(r)) continue;
    const a = triangles[3 * t], b = triangles[3 * t + 1], c = triangles[3 * t + 2];
    const ar = (Math.abs((xy[2 * b] - xy[2 * a]) * (xy[2 * c + 1] - xy[2 * a + 1]) - (xy[2 * c] - xy[2 * a]) * (xy[2 * b + 1] - xy[2 * a + 1])) / 2) * 1e-6;
    const rc = ((xy[2 * a] + xy[2 * b] + xy[2 * c]) / 3) * 1e-3;
    const dV = sol.axisymmetric ? 2 * Math.PI * Math.max(rc, 0) * ar : ar * depth;
    const bx = sol.bx[t], by = sol.by[t], bb = bx * bx + by * by;
    const nu = r >= 0 ? sol.nu[r] : 1 / MU0;
    const hx = bx - (r >= 0 ? sol.brx[r] : 0), hy = by - (r >= 0 ? sol.bry[r] : 0);
    out.area += ar;
    out.volume += dV;
    out.current += (r >= 0 ? sol.J[r] : 0) * ar;
    out.energy += 0.5 * nu * (hx * hx + hy * hy) * dV;
    out.bAvg += Math.sqrt(bb) * ar;
    out.b2 += bb * dV;
    out.bx += bx * ar;
    out.by += by * ar;
    out.intA += ((sol.A[a] + sol.A[b] + sol.A[c]) / 3) * ar;
  }
  if (out.area > 0) {
    out.bAvg /= out.area;
    out.bx /= out.area;
    out.by /= out.area;
  }
  return out;
}

/** Solução num passo de tempo (A do passo; B recalculado por elemento). */
export function frameOf(sol: Solution, k: number): Solution {
  if (!sol.At || !sol.times || !sol.times.length) return sol;
  const i = Math.max(0, Math.min(sol.times.length - 1, Math.round(k)));
  const cache = frameCache.get(sol) ?? new Map<number, Solution>();
  frameCache.set(sol, cache);
  const hit = cache.get(i);
  if (hit) return hit;
  const nn = sol.mesh.xy.length / 2;
  const A = sol.At.subarray(i * nn, (i + 1) * nn);
  const { xy, triangles } = sol.mesh;
  const nt = triangles.length / 3;
  const bx = new Float64Array(nt), by = new Float64Array(nt), bmag = new Float64Array(nt);
  let bmax = 0;
  for (let t = 0; t < nt; t++) {
    const v = [triangles[3 * t], triangles[3 * t + 1], triangles[3 * t + 2]];
    const x = v.map((j) => xy[2 * j] * 1e-3), y = v.map((j) => xy[2 * j + 1] * 1e-3);
    const a2 = (x[1] - x[0]) * (y[2] - y[0]) - (x[2] - x[0]) * (y[1] - y[0]);
    let gx = 0, gy = 0;
    for (let q = 0; q < 3; q++) {
      const j = (q + 1) % 3, l = (q + 2) % 3;
      gx += ((y[j] - y[l]) * A[v[q]]) / a2;
      gy += ((x[l] - x[j]) * A[v[q]]) / a2;
    }
    if (sol.axisymmetric) {
      const rc = Math.max((x[0] + x[1] + x[2]) / 3, 1e-12);
      bx[t] = -gy / rc;
      by[t] = gx / rc;
    } else {
      bx[t] = gy;
      by[t] = -gx;
    }
    bmag[t] = Math.hypot(bx[t], by[t]);
    if (bmag[t] > bmax) bmax = bmag[t];
  }
  // J do passo (fonte senoidal) para mapas de J.
  const w = 2 * Math.PI * (sol.freq ?? 0);
  const nr = sol.J.length;
  const J = sol.jSteps ? sol.J.map((_, r) => sol.jSteps![i * nr + r]) : sol.J.map((j, r) => (w ? j * Math.sin(w * sol.times![i] + (sol.jPhase?.[r] ?? 0)) : j));
  const f: Solution = { ...sol, A: new Float64Array(A), bx, by, bmag, bmax, J, At: undefined, times: undefined, frameOf: sol, frame: i };
  cache.set(i, f);
  return f;
}
const frameCache = new WeakMap<Solution, Map<number, Solution>>();

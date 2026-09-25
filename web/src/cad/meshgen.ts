// Monta a entrada do gerador de malha (PSLG) a partir das regiões do desenho e lê o resultado.
import { evaluate, evaluateVariables, asLength } from './expr';
import { findRegion, type Arrangement, type Edge } from './regions';
import type { Vec } from './geometry';
import type { Id, MeshNode, Sketch } from './types';

/** Entrada do Triangle (ver core/src/mesh2d.h). */
export interface MeshInput {
  xy: number[];
  segments: number[];
  segMarkers: number[];
  holes: number[];
  regions: number[];
  minAngle: number;
  maxArea: number;
  keepBoundary: boolean;
}

export interface MeshResult {
  xy: Float64Array;
  triangles: Int32Array;
  /** Índice da região (arranjo) de cada triângulo, ou -1. */
  triRegion: Int32Array;
  nodes: number;
  elements: number;
  /** Menor ângulo interno encontrado (graus). */
  minAngle: number;
  /** Assinatura da entrada (PSLG + tamanhos); se mudar, a malha está desatualizada. */
  key: string;
  ms: number;
}

/** Passo angular máximo nos arcos (fidelidade da geometria curva). */
const ARC_STEP = (7.5 * Math.PI) / 180;

/** Tamanho automático: ~1/25 da diagonal do desenho. */
export function autoSize(arr: Arrangement): number {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of arr.regions)
    for (const p of r.outer.poly) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
  if (!isFinite(x0)) return 1;
  return Math.hypot(x1 - x0, y1 - y0) / 25;
}

/** Avalia um tamanho (expressão de comprimento) em mm; vazio/inválido → null. */
export function sizeOf(sk: Sketch, expr: string | undefined): number | null {
  if (!expr?.trim()) return null;
  try {
    const { values } = evaluateVariables(sk.variables, sk.settings.unit);
    const v = asLength(evaluate(expr, { env: values, unit: sk.settings.unit }), sk.settings.unit);
    return v > 0 ? v : null;
  } catch {
    return null;
  }
}

/** Tamanho de elemento de cada região (explícito na região, senão o da malha, senão automático). */
export function regionSizes(sk: Sketch, arr: Arrangement, node: MeshNode): number[] {
  const global = sizeOf(sk, node.size) ?? autoSize(arr);
  const own = new Map<number, number>();
  for (const a of sk.regionAssigns) {
    const h = sizeOf(sk, a.meshSize);
    const r = h ? findRegion(arr, a) : null;
    if (r && h) own.set(r.index, h);
  }
  // Automático também respeita regiões pequenas (≈ 3 elementos na menor dimensão típica).
  return arr.regions.map((r) => own.get(r.index) ?? Math.min(global, Math.sqrt(Math.abs(r.area)) / 3));
}

export function buildMeshInput(sk: Sketch, arr: Arrangement, node: MeshNode): { input: MeshInput; curveIds: Id[] } {
  const h = regionSizes(sk, arr, node);
  // Arestas → regiões vizinhas (tamanho da aresta = menor tamanho entre as vizinhas).
  const edgeH = new Map<number, number>();
  for (const r of arr.regions)
    for (const l of [r.outer, ...r.holes])
      for (const st of l.steps) edgeH.set(st.edge, Math.min(edgeH.get(st.edge) ?? Infinity, h[r.index]));

  const count = (e: Edge) => {
    const { len, curved, angle } = arr.edgeLen(e);
    const he = edgeH.get(e.id) ?? Infinity;
    let n = isFinite(he) ? Math.ceil(len / he - 1e-9) : 1;
    if (curved) n = Math.max(n, Math.ceil(angle / ARC_STEP - 1e-9));
    return Math.max(1, n);
  };
  const nSeg = new Map<number, number>();
  for (const e of arr.edges) if (edgeH.has(e.id)) nSeg.set(e.id, count(e));

  // Contornos periódicos: as duas curvas precisam do mesmo número de divisões (nós casados).
  for (const b of sk.boundaries) {
    if ((b.type !== 'periodic' && b.type !== 'antiperiodic') || b.curves.length !== 2) continue;
    const es = b.curves.map((c) => arr.edges.filter((e) => e.curve === c && nSeg.has(e.id)));
    if (es[0].length !== 1 || es[1].length !== 1) continue;
    const n = Math.max(nSeg.get(es[0][0].id)!, nSeg.get(es[1][0].id)!);
    nSeg.set(es[0][0].id, n);
    nSeg.set(es[1][0].id, n);
  }

  const xy: number[] = [];
  for (const p of arr.nodes) xy.push(p.x, p.y);
  const segments: number[] = [];
  const segMarkers: number[] = [];
  const curveIds: Id[] = [];
  const curveIdx = new Map<Id, number>();
  for (const e of arr.edges) {
    const n = nSeg.get(e.id);
    if (!n) continue; // aresta solta (não delimita região)
    if (!curveIdx.has(e.curve)) {
      curveIdx.set(e.curve, curveIds.length + 1);
      curveIds.push(e.curve);
    }
    let prev = e.a;
    for (let k = 1; k <= n; k++) {
      let cur: number;
      if (k === n) cur = e.b;
      else {
        const p: Vec = arr.sample(e, k / n);
        cur = xy.length / 2;
        xy.push(p.x, p.y);
      }
      segments.push(prev, cur);
      segMarkers.push(curveIdx.get(e.curve)!);
      prev = cur;
    }
  }
  const regions: number[] = [];
  for (const r of arr.regions) regions.push(r.label.x, r.label.y, r.index + 1, (Math.sqrt(3) / 4) * h[r.index] * h[r.index]);
  return {
    input: { xy, segments, segMarkers, holes: [], regions, minAngle: node.minAngle ?? 30, maxArea: 0, keepBoundary: true },
    curveIds,
  };
}

/** Assinatura curta da entrada (detecta malha desatualizada). */
export function inputKey(input: MeshInput): string {
  let h = 2166136261;
  const s = JSON.stringify(input);
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return `${s.length}:${(h >>> 0).toString(36)}`;
}

/** Menor ângulo interno (graus) de todos os triângulos. */
export function minTriangleAngle(xy: Float64Array, tri: Int32Array): number {
  let min = 180;
  for (let t = 0; t < tri.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = tri[t + k], b = tri[t + ((k + 1) % 3)], c = tri[t + ((k + 2) % 3)];
      const ux = xy[2 * b] - xy[2 * a], uy = xy[2 * b + 1] - xy[2 * a + 1];
      const vx = xy[2 * c] - xy[2 * a], vy = xy[2 * c + 1] - xy[2 * a + 1];
      const ang = (Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy))))) * 180) / Math.PI;
      if (ang < min) min = ang;
    }
  }
  return min;
}

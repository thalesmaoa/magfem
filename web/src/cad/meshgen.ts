// Monta a entrada do gerador de malha (PSLG) a partir das regiões do desenho e lê o resultado.
import { evaluate, evaluateVariables, asLength } from './expr';
import { findRegion, type Arrangement, type Edge } from './regions';
import type { Vec } from './geometry';
import type { Id, MeshNode, Sketch } from './types';

/** Entrada da Tangle (ver core/src/mesh2d.h). */
export interface MeshInput {
  xy: number[];
  segments: number[];
  segMarkers: number[];
  holes: number[];
  regions: number[];
  minAngle: number;
  maxArea: number;
  /** Contornos periódicos para a Tangle: (marcador A, marcador B, 0 periódico / 1 antiperiódico). */
  pbc: number[];
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
  /** Nós da malha sobre cada curva, na ordem da curva (inclui os pontos que a Tangle acrescentou na curva). */
  curveNodes: Record<Id, number[]>;
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

export function buildMeshInput(sk: Sketch, arr: Arrangement, node: MeshNode): { input: MeshInput; curveIds: Id[]; curveNodes: Record<Id, number[]> } {
  const h = regionSizes(sk, arr, node);
  // Arestas → regiões vizinhas (tamanho da aresta = menor tamanho entre as vizinhas).
  const edgeH = new Map<number, number>();
  for (const r of arr.regions)
    for (const l of [r.outer, ...r.holes])
      for (const st of l.steps) edgeH.set(st.edge, Math.min(edgeH.get(st.edge) ?? Infinity, h[r.index]));

  const count = (e: Edge) => {
    const { len, curved, angle } = arr.edgeLen(e);
    // Menor entre o tamanho das regiões vizinhas e o da curva (se definido).
    const hc = sizeOf(sk, sk.curveSizes?.[e.curve]) ?? Infinity;
    const he = Math.min(edgeH.get(e.id) ?? Infinity, hc > 0 ? hc : Infinity);
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
  const chains: { curve: Id; t0: number; nodes: number[] }[] = [];
  for (const e of arr.edges) {
    const n = nSeg.get(e.id);
    if (!n) continue; // aresta solta (não delimita região)
    if (!curveIdx.has(e.curve)) {
      curveIdx.set(e.curve, curveIds.length + 1);
      curveIds.push(e.curve);
    }
    let prev = e.a;
    const chain = [e.a];
    chains.push({ curve: e.curve, t0: e.t0, nodes: chain });
    for (let k = 1; k <= n; k++) {
      let cur: number;
      if (k === n) cur = e.b;
      else {
        const p: Vec = arr.sample(e, k / n);
        cur = xy.length / 2;
        xy.push(p.x, p.y);
      }
      segments.push(prev, cur);
      chain.push(cur);
      segMarkers.push(curveIdx.get(e.curve)!);
      prev = cur;
    }
  }
  const regions: number[] = [];
  const noMesh = new Set(sk.regionAssigns.filter((a) => a.noMesh).map((a) => findRegion(arr, a)?.index));
  for (const r of arr.regions) if (!noMesh.has(r.index)) regions.push(r.label.x, r.label.y, r.index + 1, (Math.sqrt(3) / 4) * h[r.index] * h[r.index]);
  // Nós por curva: pedaços em ordem de parâmetro, sem repetir o nó da emenda.
  const curveNodes: Record<Id, number[]> = {};
  for (const c of [...chains].sort((a, b) => a.t0 - b.t0)) {
    const list = (curveNodes[c.curve] ??= []);
    for (const n of c.nodes) if (list[list.length - 1] !== n) list.push(n);
  }
  // Regiões "sem malha" viram furos (ponto interno de cada uma).
  const holes: number[] = [];
  for (const a of sk.regionAssigns) if (a.noMesh) {
    const r = findRegion(arr, a);
    if (r) holes.push(r.label.x, r.label.y);
  }
  // Periódicos: as duas curvas são divididas em sincronia pela Tangle (nós casados).
  const pbc: number[] = [];
  for (const b of sk.boundaries) {
    if ((b.type !== 'periodic' && b.type !== 'antiperiodic') || b.curves.length !== 2) continue;
    const [ma, mb] = b.curves.map((c) => curveIdx.get(c));
    if (ma && mb && ma !== mb) pbc.push(ma, mb, b.type === 'periodic' ? 0 : 1);
  }
  return {
    input: { xy, segments, segMarkers, holes, regions, minAngle: node.minAngle ?? 30, maxArea: 0, pbc },
    curveIds,
    curveNodes,
  };
}

/**
 * Nós de cada curva depois da malha: cada par consecutivo (u, v) da lista de entrada é um segmento, que a
 * Tangle pode ter dividido; troca o par pela sequência de nós que o C++ devolve para aquele segmento.
 */
export function expandCurveNodes(curveNodes: Record<Id, number[]>, segments: number[], chainStart: Int32Array, chain: Int32Array): Record<Id, number[]> {
  const segOf = new Map<string, number>();
  for (let s = 0; s < segments.length / 2; s++) segOf.set(`${segments[2 * s]},${segments[2 * s + 1]}`, s);
  const out: Record<Id, number[]> = {};
  for (const [c, list] of Object.entries(curveNodes)) {
    const res: number[] = list.length ? [list[0]] : [];
    for (let i = 0; i + 1 < list.length; i++) {
      const u = list[i], v = list[i + 1];
      let s = segOf.get(`${u},${v}`);
      let seq: number[] | null = null;
      if (s !== undefined) seq = Array.from(chain.subarray(chainStart[s], chainStart[s + 1]));
      else if ((s = segOf.get(`${v},${u}`)) !== undefined) seq = Array.from(chain.subarray(chainStart[s], chainStart[s + 1])).reverse();
      for (const n of seq ?? [u, v]) if (res[res.length - 1] !== n) res.push(n);
    }
    out[c] = res;
  }
  return out;
}

/** Assinatura curta da entrada (detecta malha desatualizada). */
export function inputKey(input: MeshInput | Record<string, unknown>): string {
  let h = 2166136261;
  const s = JSON.stringify(input);
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return `${s.length}:${(h >>> 0).toString(36)}`;
}

/** Menor ângulo interno (graus) de todos os triângulos. */
/** Faixas de qualidade (menor ângulo, graus) e as cores do mapa de qualidade. */
export const QUALITY_BANDS: { max: number; color: string }[] = [
  { max: 20, color: '#d93025' },
  { max: 25, color: '#e8893d' },
  { max: 30, color: '#e3c93b' },
  { max: 181, color: '#2ea043' },
];
const angleCache = new WeakMap<Int32Array, Float32Array>();
/** Menor ângulo (graus) de cada triângulo (guardado por malha). */
export function triangleMinAngles(xy: Float64Array, tri: Int32Array): Float32Array {
  const hit = angleCache.get(tri);
  if (hit) return hit;
  const out = new Float32Array(tri.length / 3);
  for (let t = 0; t < tri.length; t += 3) {
    let min = 180;
    for (let k = 0; k < 3; k++) {
      const a = tri[t + k], b = tri[t + ((k + 1) % 3)], c = tri[t + ((k + 2) % 3)];
      const ux = xy[2 * b] - xy[2 * a], uy = xy[2 * b + 1] - xy[2 * a + 1];
      const vx = xy[2 * c] - xy[2 * a], vy = xy[2 * c + 1] - xy[2 * a + 1];
      min = Math.min(min, (Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy))))) * 180) / Math.PI);
    }
    out[t / 3] = min;
  }
  angleCache.set(tri, out);
  return out;
}
/** Quantos triângulos em cada faixa de QUALITY_BANDS. */
export function qualityCounts(xy: Float64Array, tri: Int32Array): number[] {
  const counts = QUALITY_BANDS.map(() => 0);
  for (const a of triangleMinAngles(xy, tri)) counts[QUALITY_BANDS.findIndex((b) => a < b.max)]++;
  return counts;
}

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

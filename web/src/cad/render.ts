// Desenho do sketch em Canvas2D.
import { dimDrawing } from './dimgeom';
import { add, arcAngles, mid, mul, norm, perp, pt, sub, type Vec } from './geometry';
import { formatValue } from './measure';
import { isDimension, ORIGIN_ID, type Constraint, type Entity, type Id, PLOT_QUANTITIES, type Colormap, type LegendLayout, type PostNode, type Sketch } from './types';
import type { View } from './view';
import { nodeValues, quantityLabel, sampleCurve, triValues, type Solution } from './solve';
import type { LengthUnit } from './expr';

const LIGHT = {
  bg: '#ffffff',
  gridMinor: '#f0f3f7',
  gridMajor: '#dfe5ec',
  axis: '#b9c4d0',
  axisLabel: '#8795a3',
  origin: '#5b6b7c',
  curve: '#1f6fd1', // sub-definido (padrão Onshape: azul)
  defined: '#1b1f24', // totalmente definido
  construction: '#8fa1b5',
  selected: '#f08c1a',
  hover: '#43a0ff',
  conflict: '#d93025',
  dim: '#34495e',
  badgeBg: '#ffffff',
  badgeBorder: '#b8c3cf',
  badgeText: '#4a5a6b',
  badgeHotBg: '#fff4e6',
  muted: '#6b7a8a',
  preview: '#43a0ff',
  measure: '#8e44ad',
  offsetDim: '#2e8b57',
};

const DARK: typeof LIGHT = {
  bg: '#141a21',
  gridMinor: '#1b232c',
  gridMajor: '#26313d',
  axis: '#3c4a59',
  axisLabel: '#6f8194',
  origin: '#9fb0c2',
  curve: '#5aa2ff',
  defined: '#e8eef5',
  construction: '#6f8196',
  selected: '#f5a524',
  hover: '#7cc0ff',
  conflict: '#ff6b61',
  dim: '#b9c6d3',
  badgeBg: '#1d2631',
  badgeBorder: '#3b4958',
  badgeText: '#b9c6d3',
  badgeHotBg: '#3a2c14',
  muted: '#8a9aab',
  preview: '#7cc0ff',
  measure: '#c98ce8',
  offsetDim: '#5fd38a',
};

/** Paleta do desenho atual (trocada a cada render conforme o tema). */
export let COLORS = LIGHT;

export interface Preview {
  /** Linha de construção: pré-visualização tracejada. */
  dashed?: boolean;
  lines: [Vec, Vec][];
  circles: { c: Vec; r: number }[];
  arcs: { c: Vec; r: number; a0: number; a1: number }[];
  points: Vec[];
}

export interface RenderState {
  selection: Set<Id>;
  hover: Id | null;
  /** Ids destacados (ex.: referências da restrição sob o mouse). */
  related: Set<Id>;
  hidden: Set<Id>;
  unit: LengthUnit;
  axisymmetric: boolean;
  /** Entidades totalmente definidas (pretas). */
  defined: Set<Id>;
  preview: Preview | null;
  previewDim: { sketch: Sketch; c: Constraint } | null;
  snap: { pos: Vec; kind: 'point' | 'curve' | 'mid' } | null;
  inference: { pos: Vec; text: string } | null;
  box: { a: Vec; b: Vec } | null;
  groupBoxes: { x0: number; y0: number; x1: number; y1: number; name: string; entered: boolean }[];
  hideDim: Id | null;
  /** Régua / distância mínima: linha tracejada com o valor. */
  measure: { a: Vec; b: Vec; text: string } | null;
  /** Exportação de imagem: sem grade, eixos e símbolos de restrição; traço mais grosso. */
  plain?: boolean;
  /** Tema escuro. */
  dark?: boolean;
  /** Modo malha: regiões preenchidas pelo material e contornos coloridos (sem cotas/símbolos). */
  mesh?: {
    regions: { index: number; outer: Vec[]; holes: Vec[][]; color: string | null; label: string; at: Vec; labelOffset: Vec | null; selected: boolean; hovered: boolean }[];
    boundaryOf: Map<Id, 'dirichlet' | 'neumann' | 'periodic' | 'antiperiodic'>;
    selectedCurves: Set<Id>;
    hoverCurve: Id | null;
    /** Malha gerada (triângulos); `stale` = o desenho mudou depois. */
    tri?: { xy: Float64Array; triangles: Int32Array; stale: boolean };
  };
  /** Escala dos elementos de interface desenhados (legenda) — maior na imagem exportada. */
  uiScale?: number;
  /** Modo resultados: mapa de |B|, linhas de fluxo, sonda. */
  post?: { sol: Solution | null; layers: PostNode[]; layerSols?: Map<Id, Solution>; stale: boolean; probe: Vec | null; legend?: LegendLayout };
}

/** Mapa de cores "turbo" (aproximação polinomial), t ∈ [0, 1] → rgb. */
export function turbo(t: number): [number, number, number] {
  t = Math.min(1, Math.max(0, t));
  const r = 0.13572138 + t * (4.6153926 + t * (-42.66032258 + t * (132.13108234 + t * (-152.94239396 + t * 59.28637943))));
  const g = 0.09140261 + t * (2.19418839 + t * (4.84296658 + t * (-14.18503333 + t * (4.27729857 + t * 2.82956604))));
  const b = 0.1066733 + t * (12.64194608 + t * (-60.58204836 + t * (110.36276771 + t * (-89.90310912 + t * 27.34824973))));
  const c = (v: number) => Math.round(255 * Math.min(1, Math.max(0, v)));
  return [c(r), c(g), c(b)];
}

/** Viridis (aproximação polinomial). */
function viridis(t: number): [number, number, number] {
  t = Math.min(1, Math.max(0, t));
  const r = 0.2777 + t * (0.105 + t * (-0.3308 + t * (-4.6342 + t * (6.2283 + t * (4.7764 + t * -5.4355)))));
  const g = 0.0054 + t * (1.4046 + t * (0.2148 + t * (-5.7991 + t * (14.1799 + t * (-13.7451 + t * 4.6459)))));
  const b = 0.334 + t * (1.3846 + t * (0.0951 + t * (-19.3324 + t * (56.6906 + t * (-65.353 + t * 26.3124)))));
  const c = (v: number) => Math.round(255 * Math.min(1, Math.max(0, v)));
  return [c(r), c(g), c(b)];
}

/** Cor do mapa escolhido, t ∈ [0, 1]. */
export function colormap(name: Colormap | undefined, t: number): [number, number, number] {
  t = Math.min(1, Math.max(0, t));
  if (name === 'viridis') return viridis(t);
  if (name === 'gray') {
    const g = Math.round(20 + 225 * t);
    return [g, g, g];
  }
  if (name === 'coolwarm') {
    // Azul → branco → vermelho (divergente).
    const a: [number, number, number] = [59, 76, 192], m: [number, number, number] = [221, 221, 221], z: [number, number, number] = [180, 4, 38];
    const [p, q, u] = t < 0.5 ? [a, m, t * 2] : [m, z, (t - 0.5) * 2];
    return [0, 1, 2].map((i) => Math.round(p[i] + (q[i] - p[i]) * u)) as [number, number, number];
  }
  return turbo(t);
}

/** Cor clara ou escura para o halo, oposta à cor da linha. */
const haloFor = (hex: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 'rgba(255,255,255,0.75)';
  const n = parseInt(m[1], 16);
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.55 ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.75)';
};

/** Segmentos de curvas de nível de um campo nodal (mm); guardados por solução, grandeza e quantidade. */
const contourCache = new WeakMap<Solution, Map<string, { segs: Float64Array; lev: Float32Array }>>();
function contourSegments(sol: Solution, key: string, A: Float64Array, n: number, range?: [number, number]): { segs: Float64Array; lev: Float32Array } {
  let byKey = contourCache.get(sol);
  if (!byKey) contourCache.set(sol, (byKey = new Map()));
  const k = `${key}|${n}|${range?.join(',') ?? ''}`;
  const hit = byKey.get(k);
  if (hit) return hit;
  const { xy, triangles } = sol.mesh;
  let lo = Infinity, hi = -Infinity;
  for (const a of A) {
    if (a < lo) lo = a;
    if (a > hi) hi = a;
  }
  if (range) [lo, hi] = range;
  const out: number[] = [];
  const levs: number[] = [];
  if (hi - lo > 0) {
    const step = (hi - lo) / n;
    for (let t = 0; t < triangles.length; t += 3) {
      const v = [triangles[t], triangles[t + 1], triangles[t + 2]];
      const a = v.map((i) => A[i]);
      const amin = Math.min(a[0], a[1], a[2]), amax = Math.max(a[0], a[1], a[2]);
      const k0 = Math.max(0, Math.ceil((amin - lo) / step - 0.5)), k1 = Math.min(n - 1, Math.floor((amax - lo) / step - 0.5));
      for (let kk = k0; kk <= k1; kk++) {
        const L = lo + (kk + 0.5) * step;
        const pts: number[] = [];
        for (let e = 0; e < 3; e++) {
          const i = e, j = (e + 1) % 3;
          if ((a[i] - L) * (a[j] - L) < 0) {
            const f = (L - a[i]) / (a[j] - a[i]);
            pts.push(xy[2 * v[i]] + f * (xy[2 * v[j]] - xy[2 * v[i]]), xy[2 * v[i] + 1] + f * (xy[2 * v[j] + 1] - xy[2 * v[i] + 1]));
          }
        }
        if (pts.length === 4) {
          out.push(...pts);
          levs.push((kk + 0.5) / n);
        }
      }
    }
  }
  const res = { segs: new Float64Array(out), lev: new Float32Array(levs) };
  byKey.set(k, res);
  return res;
}

/** Vetores de B: um triângulo por célula de uma grade (mm), guardado por solução/espaçamento. */
const vectorCache = new WeakMap<Solution, { h: number; q: string; v: Float64Array; max: number }>();
function vectorSamples(sol: Solution, h: number, q: 'b' | 'h'): { v: Float64Array; max: number } {
  const hit = vectorCache.get(sol);
  if (hit && hit.h === h && hit.q === q) return hit;
  const hx = q === 'h' ? triValues(sol, 'h', 'x') : sol.bx;
  const hy = q === 'h' ? triValues(sol, 'h', 'y') : sol.by;
  const { xy, triangles } = sol.mesh;
  const best = new Map<string, { d: number; t: number; x: number; y: number }>();
  for (let t = 0; t < triangles.length / 3; t++) {
    const a = triangles[3 * t], b = triangles[3 * t + 1], c = triangles[3 * t + 2];
    const x = (xy[2 * a] + xy[2 * b] + xy[2 * c]) / 3, y = (xy[2 * a + 1] + xy[2 * b + 1] + xy[2 * c + 1]) / 3;
    const i = Math.floor(x / h), j = Math.floor(y / h);
    const d = Math.hypot(x - (i + 0.5) * h, y - (j + 0.5) * h);
    const k = `${i},${j}`;
    const cur = best.get(k);
    if (!cur || d < cur.d) best.set(k, { d, t, x, y });
  }
  const out: number[] = [];
  let max = 0;
  for (let t = 0; t < hx.length; t++) max = Math.max(max, Math.hypot(hx[t], hy[t]));
  for (const { t, x, y } of best.values()) out.push(x, y, hx[t], hy[t]);
  const res = { h, q, v: new Float64Array(out), max };
  vectorCache.set(sol, res);
  return res;
}

function drawPost(ctx: CanvasRenderingContext2D, v: View, sk: Sketch, p: NonNullable<RenderState['post']>, slot = 0, hits: HitRegion[] = [], ui = 1): number {
  const base = p.sol;
  if (!base) return 0;
  const legends: { lo: number; hi: number; label: string; map?: Colormap; layer: Id }[] = [];
  for (const layer of p.layers) {
    const sol = p.layerSols?.get(layer.id) ?? base;
    const { xy, triangles } = sol.mesh;
    const nn = xy.length / 2;
    const sx = new Float64Array(nn), sy = new Float64Array(nn);
    if (layer.plot === 'surface')
      for (let i = 0; i < nn; i++) {
        const q = v.toScreen({ x: xy[2 * i], y: xy[2 * i + 1] });
        sx[i] = q.x;
        sy[i] = q.y;
      }
    const plot = layer.plot ?? 'surface';
    const qty = (layer.quantity ?? PLOT_QUANTITIES[plot][0]) as 'b' | 'h' | 'a' | 'j';
    const comp = layer.component ?? 'mag';
    if (plot === 'surface') {
      const mv = { v: triValues(sol, qty, comp), label: quantityLabel(qty, comp, sol.axisymmetric) };
      let lo = Infinity, hi = -Infinity;
      for (const x of mv.v) {
        if (x < lo) lo = x;
        if (x > hi) hi = x;
      }
      if ((qty === 'b' || qty === 'h') && comp === 'mag') lo = 0;
      if (layer.range) [lo, hi] = layer.range;
      if (!(hi > lo)) hi = lo + 1e-12;
      // Um caminho por faixa de cor (64 faixas): muito mais rápido que um fill por triângulo.
      const BUCKETS = 64;
      const paths: Path2D[] = Array.from({ length: BUCKETS }, () => new Path2D());
      for (let t = 0; t < triangles.length; t += 3) {
        const k = Math.min(BUCKETS - 1, Math.max(0, Math.floor(((mv.v[t / 3] - lo) / (hi - lo)) * BUCKETS)));
        const a = triangles[t], b = triangles[t + 1], c = triangles[t + 2];
        const P = paths[k];
        P.moveTo(sx[a], sy[a]);
        P.lineTo(sx[b], sy[b]);
        P.lineTo(sx[c], sy[c]);
        P.closePath();
      }
      for (let k = 0; k < BUCKETS; k++) {
        const [r, g, b] = colormap(layer.colormap, (k + 0.5) / BUCKETS);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.strokeStyle = ctx.fillStyle; // cobre as frestas entre triângulos
        ctx.lineWidth = 0.5;
        ctx.fill(paths[k]);
        ctx.stroke(paths[k]);
      }
      legends.push({ lo, hi, label: mv.label, map: layer.colormap, layer: layer.id });
    } else if (plot === 'contour') {
      const { segs, lev } = contourSegments(sol, `${qty}${comp}`, nodeValues(sol, qty, comp), layer.nLines ?? 20, layer.range);
      const color = layer.color ?? '#0d1319';
      const line = (i: number) => {
        const a = v.toScreen({ x: segs[i], y: segs[i + 1] });
        const b = v.toScreen({ x: segs[i + 2], y: segs[i + 3] });
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      };
      if (layer.colorByValue) {
        const nv = nodeValues(sol, qty, comp);
        let lo = Infinity, hi = -Infinity;
        for (const x of nv) {
          if (x < lo) lo = x;
          if (x > hi) hi = x;
        }
        if (layer.range) [lo, hi] = layer.range;
        legends.push({ lo, hi, label: quantityLabel(qty, comp, sol.axisymmetric), map: layer.colormap, layer: layer.id });
        // Uma faixa de cor por nível.
        const byLevel = new Map<number, number[]>();
        for (let i = 0, j = 0; i < segs.length; i += 4, j++) {
          const key = lev[j];
          if (!byLevel.has(key)) byLevel.set(key, []);
          byLevel.get(key)!.push(i);
        }
        ctx.lineWidth = 1.6;
        for (const [f, list] of byLevel) {
          ctx.beginPath();
          for (const i of list) line(i);
          const [r, g, b] = colormap(layer.colormap, f);
          ctx.strokeStyle = `rgb(${r},${g},${b})`;
          ctx.stroke();
        }
      } else {
        ctx.beginPath();
        for (let i = 0; i < segs.length; i += 4) line(i);
        // Linha com halo contrastante: legível sobre qualquer cor do mapa.
        ctx.strokeStyle = haloFor(color);
        ctx.lineWidth = 2.6;
        ctx.stroke();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    } else if (plot === 'arrow') {
      const h = layer.spacing && layer.spacing > 0 ? layer.spacing : Math.max(sol.meshSize, 1e-6) * 1.5;
      const { v: vs, max: vmax } = vectorSamples(sol, h, qty === 'h' ? 'h' : 'b');
      if (layer.colorByValue) legends.push({ lo: 0, hi: vmax, label: quantityLabel(qty, 'mag', sol.axisymmetric), map: layer.colormap, layer: layer.id });
      const scale = (layer.scale ?? 1) * 0.9 * h;
      const solid = layer.color ?? (legends.length ? '#0d1319' : COLORS.dim);
      ctx.strokeStyle = solid;
      ctx.fillStyle = solid;
      ctx.lineWidth = 1.2;
      for (let i = 0; i < vs.length; i += 4) {
        const bm = Math.hypot(vs[i + 2], vs[i + 3]);
        if (!(bm > 0) || !(vmax > 0)) continue;
        const L = (scale * bm) / vmax;
        const ux = vs[i + 2] / bm, uy = vs[i + 3] / bm;
        const a = v.toScreen({ x: vs[i] - (ux * L) / 2, y: vs[i + 1] - (uy * L) / 2 });
        const b = v.toScreen({ x: vs[i] + (ux * L) / 2, y: vs[i + 1] + (uy * L) / 2 });
        if (Math.hypot(b.x - a.x, b.y - a.y) < 2) continue;
        if (layer.colorByValue) {
          const [r, g, bb] = colormap(layer.colormap, bm / vmax);
          ctx.strokeStyle = ctx.fillStyle = `rgb(${r},${g},${bb})`;
        }
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        arrow(ctx, b, { x: b.x - a.x, y: b.y - a.y });
      }
    } else if (plot === 'line' && layer.curve) {
      const smp = sampleCurve(sk, layer.curve, 64);
      if (!smp) continue;
      ctx.beginPath();
      smp.pts.forEach((pt, i) => {
        const q = v.toScreen(pt);
        if (i === 0) ctx.moveTo(q.x, q.y);
        else ctx.lineTo(q.x, q.y);
      });
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 5;
      ctx.stroke();
      const lc = layer.color ?? '#e8408a';
      ctx.strokeStyle = lc;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      // Seta da normal positiva (à esquerda do percurso), no meio da curva.
      const m = Math.floor(smp.pts.length / 2);
      const q = v.toScreen(smp.pts[m]);
      const n = { x: -smp.tan[m].y, y: smp.tan[m].x };
      const tip = { x: q.x + n.x * 22, y: q.y - n.y * 22 };
      ctx.beginPath();
      ctx.moveTo(q.x, q.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.stroke();
      ctx.fillStyle = lc;
      arrow(ctx, tip, { x: tip.x - q.x, y: tip.y - q.y });
    }
  }
  // Superfícies: só a de cima (é a que aparece); contornos/glifos coloridos: uma cada.
  const shown = p.layers.every((l) => l.plot === 'surface') ? legends.slice(-1) : legends;
  shown.forEach((lg, i) => hits.push(drawLegend(ctx, v, lg, slot + i, ui, p.legend)));
  if (p.probe) {
    const q = v.toScreen(p.probe);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(q.x, q.y, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#0d1319';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  return shown.length;
}

const tick = (val: number) => {
  const a = Math.abs(val);
  return a === 0 ? '0' : a >= 1e4 || a < 1e-2 ? val.toExponential(1) : val.toFixed(a >= 10 ? 1 : a >= 1 ? 2 : 3);
};

/** Barra de cores (canto superior direito; várias legendas lado a lado). */
function drawLegend(
  ctx: CanvasRenderingContext2D,
  v: View,
  lg: { lo: number; hi: number; label: string; map?: Colormap; layer: Id },
  index: number,
  ui0 = 1,
  pos?: LegendLayout,
): HitRegion {
  // Posição/escala escolhidas pelo usuário (fração do canvas), ou o canto superior direito.
  const ui = ui0 * (pos?.s ?? 1);
  const placed = pos?.x !== undefined && pos?.y !== undefined;
  const x = placed ? pos!.x! * v.w - index * 84 * ui : v.w - (72 + index * 84) * ui;
  const y = placed ? pos!.y! * v.h : 16 * ui;
  const w = 14 * ui, h = 180 * ui;
  // Fundo próprio (cor escolhida, ou nenhum): legível sobre qualquer cor do mapa.
  const bx0 = x - 6 * ui, by0 = y - 8 * ui, bw = 74 * ui, bh = h + 30 * ui;
  if (pos?.bg !== 'none') {
    ctx.fillStyle = pos?.bg ?? COLORS.bg;
    ctx.globalAlpha = 0.88;
    ctx.fillRect(bx0, by0, bw, bh);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = COLORS.gridMajor;
    ctx.lineWidth = 1;
    ctx.strokeRect(bx0 + 0.5, by0 + 0.5, bw, bh);
  }
  // Alça de redimensionar (canto inferior direito).
  ctx.strokeStyle = COLORS.dim;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (const k of [4, 8, 12]) {
    ctx.moveTo(bx0 + bw - 2, by0 + bh - 2 - k * Math.min(ui, 1.5));
    ctx.lineTo(bx0 + bw - 2 - k * Math.min(ui, 1.5), by0 + bh - 2);
  }
  ctx.stroke();
  for (let i = 0; i < h; i++) {
    const [r, g, b] = colormap(lg.map, 1 - i / h);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(x, y + i, w, 1);
  }
  ctx.strokeStyle = COLORS.dim;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  ctx.font = `${11 * ui}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COLORS.dim;
  for (let k = 0; k <= 4; k++) ctx.fillText(tick(lg.hi - ((lg.hi - lg.lo) * k) / 4), x + w + 4 * ui, y + (h * k) / 4);
  ctx.textAlign = 'center';
  ctx.fillText(lg.label, x + w / 2 + 10 * ui, y + h + 14 * ui);
  // Área clicável (barra + números): abre o ajuste de limites.
  return { id: lg.layer, kind: 'legend', x0: bx0, y0: by0, x1: bx0 + bw, y1: by0 + bh, data: [lg.lo, lg.hi] };
}

const BOUNDARY_COLORS = { dirichlet: '#d93025', neumann: '#2e8b57', periodic: '#8e44ad', antiperiodic: '#d4880f' } as const;

/** Deslocamento padrão da etiqueta (px de tela, para cima e à direita). */
export const LABEL_DEFAULT_PX = { x: 34, y: -28 };

/** Etiquetas das regiões (estilo desenho técnico): bolinha na região, linha de chamada e caixa com o nome. */
function drawRegionLabels(ctx: CanvasRenderingContext2D, v: View, m: NonNullable<RenderState['mesh']>, hits: HitRegion[]) {
  ctx.font = '11.5px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const r of m.regions) {
    const dot = v.toScreen(r.at);
    const c = r.labelOffset ? v.toScreen({ x: r.at.x + r.labelOffset.x, y: r.at.y + r.labelOffset.y }) : { x: dot.x + LABEL_DEFAULT_PX.x, y: dot.y + LABEL_DEFAULT_PX.y };
    const w = ctx.measureText(r.label).width + 12;
    const h = 18;
    const box = { x0: c.x - w / 2, y0: c.y - h / 2, x1: c.x + w / 2, y1: c.y + h / 2 };
    const ink = r.selected || r.hovered ? COLORS.defined : COLORS.dim;
    // Linha de chamada até a borda da caixa (a caixa fica por cima).
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(dot.x, dot.y);
    ctx.lineTo(Math.min(Math.max(dot.x, box.x0), box.x1), Math.min(Math.max(dot.y, box.y0), box.y1));
    ctx.stroke();
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(box.x0, box.y0, w, h);
    ctx.strokeRect(box.x0 + 0.5, box.y0 + 0.5, w - 1, h - 1);
    ctx.fillStyle = r.color ? COLORS.dim : COLORS.muted;
    ctx.fillText(r.label, c.x, c.y + 0.5);
    hits.push({ id: String(r.index), kind: 'regionLabel', ...box });
  }
}

function drawMeshRegions(ctx: CanvasRenderingContext2D, v: View, m: NonNullable<RenderState['mesh']>) {
  let hatch: CanvasPattern | null = null;
  const pc = document.createElement('canvas');
  pc.width = pc.height = 8;
  const pctx = pc.getContext('2d');
  if (pctx) {
    pctx.strokeStyle = COLORS.muted;
    pctx.globalAlpha = 0.35;
    pctx.beginPath();
    pctx.moveTo(0, 8);
    pctx.lineTo(8, 0);
    pctx.stroke();
    hatch = ctx.createPattern(pc, 'repeat');
  }
  for (const r of m.regions) {
    ctx.beginPath();
    for (const loop of [r.outer, ...r.holes]) {
      loop.forEach((p, i) => {
        const q = v.toScreen(p);
        if (i === 0) ctx.moveTo(q.x, q.y);
        else ctx.lineTo(q.x, q.y);
      });
      ctx.closePath();
    }
    ctx.globalAlpha = (r.selected ? 0.85 : r.hovered ? 0.7 : 0.5) * (m.tri ? 0.75 : 1);
    ctx.fillStyle = r.color ?? hatch ?? COLORS.gridMajor;
    ctx.fill('evenodd');
    ctx.globalAlpha = 1;
    if (r.selected || r.hovered) {
      // Seleção no modo malha: contorno branco (escuro) / preto (claro), mais grosso — amarelo confundia com o cobre.
      ctx.strokeStyle = COLORS.defined;
      ctx.lineWidth = r.selected ? 4 : 2;
      ctx.stroke();
    }
  }
  if (m.tri) {
    // Arestas dos triângulos num único caminho.
    const { xy, triangles } = m.tri;
    const sx = new Float64Array(xy.length / 2);
    const sy = new Float64Array(xy.length / 2);
    for (let i = 0; i < sx.length; i++) {
      const q = v.toScreen({ x: xy[2 * i], y: xy[2 * i + 1] });
      sx[i] = q.x;
      sy[i] = q.y;
    }
    ctx.beginPath();
    for (let t = 0; t < triangles.length; t += 3) {
      const a = triangles[t], b = triangles[t + 1], c = triangles[t + 2];
      ctx.moveTo(sx[a], sy[a]);
      ctx.lineTo(sx[b], sy[b]);
      ctx.lineTo(sx[c], sy[c]);
      ctx.closePath();
    }
    // Traço escuro: os preenchimentos dos materiais são claros nos dois temas.
    ctx.strokeStyle = '#0d1319';
    ctx.globalAlpha = m.tri.stale ? 0.3 : 0.7;
    ctx.lineWidth = 0.7;
    ctx.setLineDash(m.tri.stale ? [3, 3] : []);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
}

export interface HitRegion {
  id: Id;
  kind: 'dim' | 'badge' | 'regionLabel' | 'legend';
  /** Dados extras (legenda: [mín, máx] atuais). */
  data?: number[];
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const BADGE_GLYPH: Partial<Record<Constraint['type'], string>> = {
  coincident: '●',
  horizontal: 'H',
  vertical: 'V',
  parallel: '∥',
  perpendicular: '⊥',
  tangent: 'T',
  equal: '=',
  pointOn: '⊙',
  midpoint: 'M',
  symmetric: '⇋',
  symmetricPoint: '⇋',
  concentric: '◎',
};

function niceStep(minPx: number, scale: number) {
  const raw = minPx / scale;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 5, 10]) if (m * p >= raw) return m * p;
  return 10 * p;
}

function drawGrid(ctx: CanvasRenderingContext2D, v: View, axisymmetric: boolean) {
  const step = niceStep(12, v.scale);
  const major = step * 5;
  const tl = v.toWorld({ x: 0, y: 0 });
  const br = v.toWorld({ x: v.w, y: v.h });
  for (const [s, color] of [
    [step, COLORS.gridMinor],
    [major, COLORS.gridMajor],
  ] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = Math.ceil(tl.x / s) * s; x <= br.x; x += s) {
      const sx = Math.round(v.toScreen({ x, y: 0 }).x) + 0.5;
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, v.h);
    }
    for (let y = Math.ceil(br.y / s) * s; y <= tl.y; y += s) {
      const sy = Math.round(v.toScreen({ x: 0, y }).y) + 0.5;
      ctx.moveTo(0, sy);
      ctx.lineTo(v.w, sy);
    }
    ctx.stroke();
  }
  const o = v.toScreen({ x: 0, y: 0 });
  ctx.strokeStyle = COLORS.axis;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(0, Math.round(o.y) + 0.5);
  ctx.lineTo(v.w, Math.round(o.y) + 0.5);
  ctx.moveTo(Math.round(o.x) + 0.5, 0);
  ctx.lineTo(Math.round(o.x) + 0.5, v.h);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = COLORS.axisLabel;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(axisymmetric ? 'r' : 'x', v.w - 14, Math.round(o.y) - 5);
  ctx.fillText(axisymmetric ? 'z' : 'y', Math.round(o.x) + 5, 13);
}

function arcPath(ctx: CanvasRenderingContext2D, v: View, c: Vec, r: number, a0: number, a1: number) {
  const s = v.toScreen(c);
  // Tela tem y invertido: ângulos trocam de sinal e o sentido vira horário.
  ctx.arc(s.x, s.y, r * v.scale, -a0, -a1, true);
}

function entityColor(e: Entity, st: RenderState) {
  if (st.selection.has(e.id)) return COLORS.selected;
  if (st.hover === e.id || st.related.has(e.id)) return COLORS.hover;
  if ('construction' in e && e.construction) return COLORS.construction;
  return st.defined.has(e.id) ? COLORS.defined : COLORS.curve;
}

function drawCurve(ctx: CanvasRenderingContext2D, v: View, sk: Sketch, e: Entity, st: RenderState) {
  if (e.type === 'point') return;
  const hot = st.selection.has(e.id) || st.hover === e.id || st.related.has(e.id);
  const ov = st as RenderState & { colorOverride?: string; widthOverride?: number };
  ctx.strokeStyle = ov.colorOverride ?? entityColor(e, st);
  ctx.lineWidth = ov.widthOverride ?? (hot ? 2.5 : 1.6);
  ctx.setLineDash(e.construction ? [7, 5] : []);
  ctx.beginPath();
  if (e.type === 'line') {
    const a = v.toScreen(pt(sk, e.p1));
    const b = v.toScreen(pt(sk, e.p2));
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  } else if (e.type === 'circle') {
    const c = v.toScreen(pt(sk, e.c));
    ctx.arc(c.x, c.y, e.r * v.scale, 0, Math.PI * 2);
  } else {
    const { c, start, end } = arcAngles(sk, e);
    arcPath(ctx, v, c, e.r, start, end);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawPoint(ctx: CanvasRenderingContext2D, v: View, e: Entity, st: RenderState) {
  if (e.type !== 'point') return;
  const s = v.toScreen(e);
  if (e.id === ORIGIN_ID) {
    const hot = st.selection.has(e.id) || st.hover === e.id || st.related.has(e.id);
    ctx.fillStyle = hot ? entityColor(e, st) : COLORS.origin;
    ctx.beginPath();
    ctx.arc(s.x, s.y, hot ? 5 : 4, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const hot = st.selection.has(e.id) || st.hover === e.id || st.related.has(e.id);
  const r = hot ? 4.5 : 3;
  ctx.fillStyle = entityColor(e, st);
  if (e.fixed) {
    ctx.fillRect(s.x - r, s.y - r, 2 * r, 2 * r);
  } else {
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function arrow(ctx: CanvasRenderingContext2D, at: Vec, dir: Vec) {
  // dir em coordenadas de tela
  const d = norm(dir);
  const n = perp(d);
  const L = 9;
  const W = 3.2;
  const base = sub(at, mul(d, L));
  ctx.beginPath();
  ctx.moveTo(at.x, at.y);
  ctx.lineTo(base.x + n.x * W, base.y + n.y * W);
  ctx.lineTo(base.x - n.x * W, base.y - n.y * W);
  ctx.closePath();
  ctx.fill();
}

function drawDimension(
  ctx: CanvasRenderingContext2D,
  v: View,
  sk: Sketch,
  c: Constraint,
  color: string,
  hits: HitRegion[] | null,
  hideText: boolean,
  unit: LengthUnit,
  override?: string,
) {
  if (override) color = override;
  const d = dimDrawing(sk, c, v.px(1));
  if (!d) return;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const [a, b] of d.segments) {
    const A = v.toScreen(a);
    const B = v.toScreen(b);
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
  }
  ctx.stroke();
  if (d.arc) {
    ctx.beginPath();
    arcPath(ctx, v, d.arc.c, d.arc.r, d.arc.a0, d.arc.a1);
    ctx.stroke();
  }
  for (const a of d.arrows) arrow(ctx, v.toScreen(a.at), { x: a.dir.x, y: -a.dir.y });

  if (hideText) return;
  const t = v.toScreen(d.text);
  const txt = formatValue(c, unit);
  ctx.font = '12px system-ui, sans-serif';
  const w = ctx.measureText(txt).width + 8;
  const h = 18;
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(t.x - w / 2, t.y - h / 2, w, h);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(txt, t.x, t.y + 0.5);
  hits?.push({ id: c.id, kind: 'dim', x0: t.x - w / 2, y0: t.y - h / 2, x1: t.x + w / 2, y1: t.y + h / 2 });
}

/** Posição (tela) de um badge de restrição sobre a entidade `id`; `slot` empilha badges. */
function badgeAnchor(v: View, sk: Sketch, id: Id, slot: number): Vec | null {
  const e = sk.entities[id];
  if (!e) return null;
  const step = 17;
  if (e.type === 'point') {
    const s = v.toScreen(e);
    return { x: s.x + 12 + slot * step, y: s.y - 12 };
  }
  if (e.type === 'line') {
    const a = v.toScreen(pt(sk, e.p1));
    const b = v.toScreen(pt(sk, e.p2));
    const u = norm(sub(b, a));
    let n = perp(u);
    if (n.y > 0) n = mul(n, -1); // badges acima da linha
    return add(add(mid(a, b), mul(n, 13)), mul(u, (slot - 0.5) * step + step / 2));
  }
  const c = pt(sk, e.c);
  let ang = Math.PI / 4;
  if (e.type === 'arc') {
    const { start, end } = arcAngles(sk, e);
    ang = (start + end) / 2;
  }
  const s = v.toScreen({ x: c.x + e.r * Math.cos(ang), y: c.y + e.r * Math.sin(ang) });
  const out = { x: Math.cos(ang), y: -Math.sin(ang) };
  return add(add(s, mul(out, 13)), mul(perp(out), slot * step));
}

function drawBadges(ctx: CanvasRenderingContext2D, v: View, sk: Sketch, st: RenderState, hits: HitRegion[]) {
  const slots = new Map<Id, number>();
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const c of sk.constraints) {
    const glyph = BADGE_GLYPH[c.type];
    if (!glyph || c.internal || c.refs.some((r) => st.hidden.has(r))) continue;
    // Badge em cada entidade referenciada que não seja ponto (exceto quando só há pontos).
    const onCurves = c.refs.filter((r) => sk.entities[r]?.type !== 'point');
    const targets = c.type === 'midpoint' || c.type === 'pointOn' ? [c.refs[0]] : onCurves.length ? onCurves : [c.refs[0]];
    for (const id of targets) {
      const slot = slots.get(id) ?? 0;
      slots.set(id, slot + 1);
      const p = badgeAnchor(v, sk, id, slot);
      if (!p) continue;
      const hot = st.selection.has(c.id) || st.hover === c.id;
      const s = 7.5;
      ctx.fillStyle = hot ? COLORS.badgeHotBg : COLORS.badgeBg;
      ctx.strokeStyle = hot ? COLORS.selected : COLORS.badgeBorder;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(p.x - s, p.y - s, 2 * s, 2 * s, 3);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = hot ? COLORS.selected : COLORS.badgeText;
      ctx.fillText(glyph, p.x, p.y + 0.5);
      hits.push({ id: c.id, kind: 'badge', x0: p.x - s, y0: p.y - s, x1: p.x + s, y1: p.y + s });
    }
  }
}

function drawPreview(ctx: CanvasRenderingContext2D, v: View, p: Preview) {
  ctx.strokeStyle = p.dashed ? COLORS.construction : COLORS.preview;
  ctx.fillStyle = COLORS.preview;
  ctx.lineWidth = 1.5;
  ctx.setLineDash(p.dashed ? [7, 5] : []);
  ctx.beginPath();
  for (const [a, b] of p.lines) {
    const A = v.toScreen(a);
    const B = v.toScreen(b);
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
  }
  ctx.stroke();
  for (const c of p.circles) {
    const s = v.toScreen(c.c);
    ctx.beginPath();
    ctx.arc(s.x, s.y, c.r * v.scale, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const a of p.arcs) {
    ctx.beginPath();
    arcPath(ctx, v, a.c, a.r, a.a0, a.a1);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  for (const q of p.points) {
    const s = v.toScreen(q);
    ctx.beginPath();
    ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function render(ctx: CanvasRenderingContext2D, v: View, sk: Sketch, st: RenderState): HitRegion[] {
  const hits: HitRegion[] = [];
  COLORS = st.dark && !st.plain ? DARK : LIGHT;
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, v.w, v.h);
  if (!st.plain) drawGrid(ctx, v, st.axisymmetric);

  const ents = Object.values(sk.entities).filter((e) => !st.hidden.has(e.id) && !(e.type !== 'circle' && e.type !== 'arc' && e.aux));
  if (st.post) {
    // Modo resultados: campo por baixo, contorno das peças por cima.
    const hasMap = !!st.post.sol && st.post.layers.some((l) => l.plot === 'surface');
    // Superfícies primeiro; o contorno das peças fica entre elas e as linhas/vetores/curvas.
    const maps = st.post.layers.filter((l) => l.plot === 'surface');
    const rest = st.post.layers.filter((l) => !maps.includes(l));
    const nLegends = drawPost(ctx, v, sk, { ...st.post, layers: maps, probe: null }, 0, hits, st.uiScale ?? 1);
    for (const e of ents) {
      if (e.type === 'point') continue;
      const color = e.construction ? COLORS.construction : hasMap ? 'rgba(10,14,20,0.9)' : COLORS.defined;
      drawCurve(ctx, v, sk, e, { ...st, selection: new Set(), hover: st.hover, related: new Set(), defined: new Set(), colorOverride: st.hover === e.id ? COLORS.hover : color, widthOverride: st.hover === e.id ? 3 : 1.4 } as RenderState);
    }
    drawPost(ctx, v, sk, { ...st.post, layers: rest }, nLegends, hits, st.uiScale ?? 1);
    return hits;
  }
  if (st.mesh) {
    // Modo malha: regiões, contornos coloridos e nada de cotas/símbolos.
    drawMeshRegions(ctx, v, st.mesh);
    const m = st.mesh;
    for (const e of ents) {
      if (e.type === 'point') continue;
      const b = m.boundaryOf.get(e.id);
      const sel = m.selectedCurves.has(e.id);
      const hot = m.hoverCurve === e.id;
      const color = sel || hot ? COLORS.defined : b ? BOUNDARY_COLORS[b] : e.construction ? COLORS.construction : COLORS.defined;
      drawCurve(ctx, v, sk, e, { ...st, selection: new Set(), hover: null, related: new Set(), defined: new Set(), colorOverride: color, widthOverride: sel ? 5 : hot ? 3.5 : b ? 3 : 1.4 } as RenderState);
    }
    // Etiquetas por último: ficam sobre as linhas (com a malha à mostra, ficam ocultas).
    if (!m.tri) drawRegionLabels(ctx, v, m, hits);
    return hits;
  }
  for (const e of ents) drawCurve(ctx, v, sk, e, st);

  for (const c of sk.constraints) {
    if (!isDimension(c)) continue;
    const color = st.selection.has(c.id) ? COLORS.selected : st.hover === c.id ? COLORS.hover : COLORS.dim;
    if (c.offsetDim) {
      // Cota do offset: mostra a distância atual do grupo (com sinal = lado).
      const g = sk.groups.find((x) => x.id === c.offsetDim);
      if (!g?.offset || g.hidden) continue;
      drawDimension(ctx, v, sk, { ...c, value: g.offset.side * g.offset.distance }, COLORS.offsetDim ?? color, hits, st.hideDim === c.id, st.unit, st.selection.has(c.id) || st.hover === c.id ? color : undefined);
      continue;
    }
    if (c.internal || c.refs.some((r) => st.hidden.has(r))) continue;
    drawDimension(ctx, v, sk, c, color, hits, st.hideDim === c.id, st.unit);
  }
  if (!st.plain) drawBadges(ctx, v, sk, st, hits);
  for (const e of ents) drawPoint(ctx, v, e, st);

  for (const g of st.groupBoxes) {
    if (!isFinite(g.x0)) continue;
    const a = v.toScreen({ x: g.x0, y: g.y1 });
    const b = v.toScreen({ x: g.x1, y: g.y0 });
    const pad = 8;
    ctx.strokeStyle = g.entered ? COLORS.muted : COLORS.selected;
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(a.x - pad + 0.5, a.y - pad + 0.5, b.x - a.x + 2 * pad, b.y - a.y + 2 * pad);
    ctx.setLineDash([]);
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = g.entered ? COLORS.muted : COLORS.selected;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(g.entered ? `${g.name} (editando)` : g.name, a.x - pad, a.y - pad - 2);
  }
  if (st.measure) {
    const a = v.toScreen(st.measure.a);
    const b = v.toScreen(st.measure.b);
    ctx.strokeStyle = COLORS.measure;
    ctx.fillStyle = COLORS.measure;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const p of [a, b]) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    ctx.font = '12px system-ui, sans-serif';
    const w = ctx.measureText(st.measure.text).width + 10;
    ctx.fillStyle = COLORS.measure;
    ctx.beginPath();
    ctx.roundRect(m.x - w / 2, m.y - 20, w, 17, 4);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(st.measure.text, m.x, m.y - 11);
  }
  if (st.preview) drawPreview(ctx, v, st.preview);
  if (st.previewDim) drawDimension(ctx, v, st.previewDim.sketch, st.previewDim.c, COLORS.preview, null, false, st.unit);

  if (st.snap) {
    const s = v.toScreen(st.snap.pos);
    ctx.strokeStyle = COLORS.selected;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (st.snap.kind === 'point') ctx.arc(s.x, s.y, 7, 0, Math.PI * 2);
    else if (st.snap.kind === 'mid') {
      // Triângulo = ponto médio (como no Onshape).
      ctx.moveTo(s.x, s.y - 7);
      ctx.lineTo(s.x + 6.5, s.y + 5);
      ctx.lineTo(s.x - 6.5, s.y + 5);
      ctx.closePath();
    } else {
      ctx.moveTo(s.x - 5, s.y - 5);
      ctx.lineTo(s.x + 5, s.y + 5);
      ctx.moveTo(s.x + 5, s.y - 5);
      ctx.lineTo(s.x - 5, s.y + 5);
    }
    ctx.stroke();
  }
  if (st.inference) {
    const s = v.toScreen(st.inference.pos);
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillStyle = COLORS.selected;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(st.inference.text, s.x + 12, s.y + 14);
  }
  if (st.box) {
    const { a, b } = st.box;
    ctx.fillStyle = 'rgba(67,160,255,0.08)';
    ctx.strokeStyle = COLORS.hover;
    ctx.lineWidth = 1;
    ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    ctx.strokeRect(Math.min(a.x, b.x) + 0.5, Math.min(a.y, b.y) + 0.5, Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  }
  return hits;
}

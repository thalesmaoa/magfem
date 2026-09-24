// Desenho do sketch em Canvas2D.
import { dimDrawing } from './dimgeom';
import { add, arcAngles, mid, mul, norm, perp, pt, sub, type Vec } from './geometry';
import { formatValue } from './measure';
import { isDimension, ORIGIN_ID, type Constraint, type Entity, type Id, type Sketch } from './types';
import type { View } from './view';
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
}

export interface HitRegion {
  id: Id;
  kind: 'dim' | 'badge';
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
  ctx.strokeStyle = entityColor(e, st);
  ctx.lineWidth = hot ? 2.5 : 1.6;
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

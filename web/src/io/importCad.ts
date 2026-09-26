// Importação de DXF e SVG: linhas, arcos e círculos entram no desenho (em mm), com pontos coincidentes
// unidos para as regiões fecharem. Curvas sem equivalente (splines, elipses, Bézier) viram polilinhas.
import { Draft } from '../cad/ops';
import type { Id, Sketch } from '../cad/types';

type P = { x: number; y: number };
export type Shape = { kind: 'line'; a: P; b: P } | { kind: 'arc'; c: P; r: number; a0: number; a1: number } | { kind: 'circle'; c: P; r: number };
export interface Imported {
  shapes: Shape[];
  /** Entidades ignoradas, por tipo (ex.: { SPLINE: 2 }). */
  skipped: Record<string, number>;
}

// ---------- DXF ----------
const DXF_UNITS: Record<number, number> = { 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000, 8: 25.4e-6, 9: 25.4e-3, 10: 914.4, 13: 1e-3, 14: 1e-3 };

/** Trecho de polilinha com "bulge" (tan(θ/4)): linha ou arco entre p e q. */
export function bulgeSeg(p: P, q: P, bulge: number): Shape {
  if (Math.abs(bulge) < 1e-12) return { kind: 'line', a: p, b: q };
  const th = 4 * Math.atan(bulge);
  const d = Math.hypot(q.x - p.x, q.y - p.y);
  const r = d / (2 * Math.sin(Math.abs(th) / 2));
  const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
  const h = r * Math.cos(th / 2); // distância do centro à corda (com sinal do bulge)
  const ux = -(q.y - p.y) / d, uy = (q.x - p.x) / d; // normal à esquerda de p→q
  const c = { x: mx + ux * h * Math.sign(bulge), y: my + uy * h * Math.sign(bulge) };
  const ang = (v: P) => Math.atan2(v.y - c.y, v.x - c.x);
  // bulge > 0: anti-horário de p para q; < 0: horário (= anti-horário de q para p).
  return bulge > 0 ? { kind: 'arc', c, r, a0: ang(p), a1: ang(q) } : { kind: 'arc', c, r, a0: ang(q), a1: ang(p) };
}

export function parseDXF(text: string): Imported {
  const lines = text.split(/\r?\n/);
  const pairs: [number, string][] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) pairs.push([Number(lines[i].trim()), lines[i + 1].trim()]);
  let scale = 1;
  for (let i = 0; i < pairs.length; i++)
    if (pairs[i][0] === 9 && pairs[i][1] === '$INSUNITS' && pairs[i + 1]?.[0] === 70) scale = DXF_UNITS[Number(pairs[i + 1][1])] ?? 1;
  const shapes: Shape[] = [];
  const skipped: Record<string, number> = {};
  // Agrupa em entidades (cada uma começa num código 0), só dentro da seção ENTITIES.
  let inEntities = false;
  const ents: { type: string; g: [number, string][] }[] = [];
  for (let i = 0; i < pairs.length; i++) {
    const [c, v] = pairs[i];
    if (c === 2 && pairs[i - 1]?.[0] === 0 && pairs[i - 1][1] === 'SECTION') inEntities = v === 'ENTITIES';
    if (c === 0) {
      if (v === 'ENDSEC') inEntities = false;
      else if (inEntities) ents.push({ type: v, g: [] });
      continue;
    }
    if (inEntities && ents.length) ents[ents.length - 1].g.push([c, v]);
  }
  const num = (g: [number, string][], code: number, def = 0) => {
    const f = g.find((x) => x[0] === code);
    return f ? Number(f[1]) * 1 : def;
  };
  const pt = (x: number, y: number): P => ({ x: x * scale, y: y * scale });
  let poly: { verts: { p: P; bulge: number }[]; closed: boolean } | null = null;
  const flushPoly = () => {
    if (!poly) return;
    const v = poly.verts;
    for (let i = 0; i + 1 < v.length; i++) shapes.push(bulgeSeg(v[i].p, v[i + 1].p, v[i].bulge));
    if (poly.closed && v.length > 2) shapes.push(bulgeSeg(v[v.length - 1].p, v[0].p, v[v.length - 1].bulge));
    poly = null;
  };
  for (const e of ents) {
    const g = e.g;
    if (e.type === 'VERTEX' && poly) {
      poly.verts.push({ p: pt(num(g, 10), num(g, 20)), bulge: num(g, 42) });
      continue;
    }
    if (e.type === 'SEQEND') {
      flushPoly();
      continue;
    }
    flushPoly();
    if (e.type === 'LINE') shapes.push({ kind: 'line', a: pt(num(g, 10), num(g, 20)), b: pt(num(g, 11), num(g, 21)) });
    else if (e.type === 'CIRCLE') shapes.push({ kind: 'circle', c: pt(num(g, 10), num(g, 20)), r: num(g, 40) * scale });
    else if (e.type === 'ARC')
      shapes.push({ kind: 'arc', c: pt(num(g, 10), num(g, 20)), r: num(g, 40) * scale, a0: (num(g, 50) * Math.PI) / 180, a1: (num(g, 51) * Math.PI) / 180 });
    else if (e.type === 'LWPOLYLINE') {
      // Vértices: cada 10 abre um vértice; 20 e 42 (bulge) se aplicam ao último.
      const verts: { p: P; bulge: number }[] = [];
      for (const [c, v] of g) {
        if (c === 10) verts.push({ p: { x: Number(v) * scale, y: 0 }, bulge: 0 });
        else if (c === 20 && verts.length) verts[verts.length - 1].p.y = Number(v) * scale;
        else if (c === 42 && verts.length) verts[verts.length - 1].bulge = Number(v);
      }
      poly = { verts, closed: (num(g, 70) & 1) === 1 };
      flushPoly();
    } else if (e.type === 'POLYLINE') poly = { verts: [], closed: (num(g, 70) & 1) === 1 };
    else if (!['POINT', 'TEXT', 'MTEXT', 'DIMENSION', 'HATCH', 'ATTDEF', 'ATTRIB', 'VIEWPORT'].includes(e.type)) skipped[e.type] = (skipped[e.type] ?? 0) + 1;
  }
  flushPoly();
  return { shapes, skipped };
}

// ---------- SVG ----------
type M = [number, number, number, number, number, number]; // a b c d e f
const mul = (m: M, n: M): M => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const ID: M = [1, 0, 0, 1, 0, 0];

function parseTransform(s: string | null): M {
  let m: M = ID;
  if (!s) return m;
  for (const [, fn, args] of s.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const a = args.split(/[\s,]+/).filter(Boolean).map(Number);
    let t: M = ID;
    if (fn === 'matrix' && a.length === 6) t = a as M;
    else if (fn === 'translate') t = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0];
    else if (fn === 'scale') t = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0];
    else if (fn === 'rotate') {
      const r = ((a[0] ?? 0) * Math.PI) / 180, c = Math.cos(r), sn = Math.sin(r);
      t = [c, sn, -sn, c, 0, 0];
      if (a.length === 3) t = mul(mul([1, 0, 0, 1, a[1], a[2]], t), [1, 0, 0, 1, -a[1], -a[2]]);
    }
    m = mul(m, t);
  }
  return m;
}

export function parseSVG(text: string): Imported {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = doc.documentElement;
  const shapes: Shape[] = [];
  const skipped: Record<string, number> = {};
  // Escala para mm: largura em mm com viewBox, senão px a 96 dpi. O y do SVG cresce para baixo.
  let k = 25.4 / 96;
  const vb = root.getAttribute('viewBox')?.split(/[\s,]+/).map(Number);
  const wAttr = root.getAttribute('width') ?? '';
  const unitMm: Record<string, number> = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, px: 25.4 / 96, '': 25.4 / 96 };
  const wm = /^([\d.]+)\s*(mm|cm|in|pt|px)?$/.exec(wAttr);
  if (wm && vb && vb.length === 4 && vb[2] > 0) k = (Number(wm[1]) * (unitMm[wm[2] ?? ''] ?? 1)) / vb[2];
  const base: M = [k, 0, 0, -k, 0, 0];
  const walk = (el: Element, m0: M) => {
    const m = mul(m0, parseTransform(el.getAttribute('transform')));
    const tag = el.tagName.toLowerCase().replace(/^svg:/, '');
    if (['defs', 'clippath', 'mask', 'symbol', 'style', 'title', 'desc', 'metadata', 'text'].includes(tag)) return;
    const f = (n: string) => Number(el.getAttribute(n) ?? 0);
    if (tag === 'line') addPath(`M${f('x1')},${f('y1')}L${f('x2')},${f('y2')}`, m, shapes);
    else if (tag === 'rect') addPath(`M${f('x')},${f('y')}h${f('width')}v${f('height')}h${-f('width')}Z`, m, shapes);
    else if (tag === 'circle') addEllipse(f('cx'), f('cy'), f('r'), f('r'), m, shapes);
    else if (tag === 'ellipse') addEllipse(f('cx'), f('cy'), f('rx'), f('ry'), m, shapes);
    else if (tag === 'polyline' || tag === 'polygon') {
      const pts = (el.getAttribute('points') ?? '').trim().split(/[\s,]+/).map(Number);
      if (pts.length >= 4) addPath(`M${pts.slice(0, 2).join(',')}L${pts.slice(2).join(' ')}${tag === 'polygon' ? 'Z' : ''}`, m, shapes);
    } else if (tag === 'path') addPath(el.getAttribute('d') ?? '', m, shapes);
    else if (tag === 'use' || tag === 'image') skipped[tag] = (skipped[tag] ?? 0) + 1;
    for (const ch of Array.from(el.children)) walk(ch, m);
  };
  walk(root, base);
  return { shapes, skipped };
}

const apply = (m: M, x: number, y: number): P => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
/** A transformação é semelhança (preserva círculos)? Devolve a escala, ou null. */
function similarity(m: M): number | null {
  const sx = Math.hypot(m[0], m[1]), sy = Math.hypot(m[2], m[3]);
  const dotp = m[0] * m[2] + m[1] * m[3];
  return Math.abs(sx - sy) < 1e-9 * Math.max(sx, 1) && Math.abs(dotp) < 1e-9 * Math.max(sx * sy, 1) ? sx : null;
}
const flipped = (m: M) => m[0] * m[3] - m[1] * m[2] < 0;

function addEllipse(cx: number, cy: number, rx: number, ry: number, m: M, out: Shape[]) {
  const s = similarity(m);
  if (s && Math.abs(rx - ry) < 1e-9) {
    out.push({ kind: 'circle', c: apply(m, cx, cy), r: rx * s });
    return;
  }
  const n = 48;
  let prev = apply(m, cx + rx, cy);
  for (let i = 1; i <= n; i++) {
    const t = (2 * Math.PI * i) / n;
    const q = apply(m, cx + rx * Math.cos(t), cy + ry * Math.sin(t));
    out.push({ kind: 'line', a: prev, b: q });
    prev = q;
  }
}

/** Arco elíptico do SVG (conversão do ponto final para centro, SVG 1.1 F.6.5). */
function svgArc(p0: P, rx: number, ry: number, phiDeg: number, large: boolean, sweep: boolean, p1: P, m: M, out: Shape[]) {
  if (rx === 0 || ry === 0) {
    out.push({ kind: 'line', a: apply(m, p0.x, p0.y), b: apply(m, p1.x, p1.y) });
    return;
  }
  const phi = (phiDeg * Math.PI) / 180, cp = Math.cos(phi), sp = Math.sin(phi);
  const dx = (p0.x - p1.x) / 2, dy = (p0.y - p1.y) / 2;
  const x1 = cp * dx + sp * dy, y1 = -sp * dx + cp * dy;
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lam > 1) (rx *= Math.sqrt(lam)), (ry *= Math.sqrt(lam));
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const co = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / (rx * rx * y1 * y1 + ry * ry * x1 * x1)));
  const cxp = (co * rx * y1) / ry, cyp = (-co * ry * x1) / rx;
  const cx = cp * cxp - sp * cyp + (p0.x + p1.x) / 2, cy = sp * cxp + cp * cyp + (p0.y + p1.y) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const th1 = ang(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry);
  let dth = ang((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
  if (!sweep && dth > 0) dth -= 2 * Math.PI;
  if (sweep && dth < 0) dth += 2 * Math.PI;
  const s = similarity(m);
  if (s && Math.abs(rx - ry) < 1e-9 * Math.max(rx, 1)) {
    // Arco circular: no desenho, anti-horário de a0 a a1 (a transformação pode inverter o sentido).
    const c = apply(m, cx, cy);
    const pa = apply(m, p0.x, p0.y), pb = apply(m, p1.x, p1.y);
    const a = Math.atan2(pa.y - c.y, pa.x - c.x), b = Math.atan2(pb.y - c.y, pb.x - c.x);
    const ccw = (dth > 0) !== flipped(m);
    out.push(ccw ? { kind: 'arc', c, r: rx * s, a0: a, a1: b } : { kind: 'arc', c, r: rx * s, a0: b, a1: a });
    return;
  }
  const n = Math.max(8, Math.ceil(Math.abs(dth) / (Math.PI / 24)));
  let prev = apply(m, p0.x, p0.y);
  for (let i = 1; i <= n; i++) {
    const t = th1 + (dth * i) / n;
    const ex = rx * Math.cos(t), ey = ry * Math.sin(t);
    const q = apply(m, cp * ex - sp * ey + cx, sp * ex + cp * ey + cy);
    out.push({ kind: 'line', a: prev, b: q });
    prev = q;
  }
}

function addPath(d: string, m: M, out: Shape[]) {
  const toks = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? [];
  let i = 0, cmd = '';
  let cur: P = { x: 0, y: 0 }, start: P = { x: 0, y: 0 }, ctrl: P | null = null;
  const nextNum = () => Number(toks[i++]);
  const line = (q: P) => {
    out.push({ kind: 'line', a: apply(m, cur.x, cur.y), b: apply(m, q.x, q.y) });
    cur = q;
  };
  const bezier = (pts: P[]) => {
    // Bézier (quadrática ou cúbica) como polilinha.
    const n = 16;
    for (let s = 1; s <= n; s++) {
      const t = s / n;
      let q: P;
      if (pts.length === 3) q = { x: (1 - t) ** 2 * pts[0].x + 2 * (1 - t) * t * pts[1].x + t * t * pts[2].x, y: (1 - t) ** 2 * pts[0].y + 2 * (1 - t) * t * pts[1].y + t * t * pts[2].y };
      else q = { x: (1 - t) ** 3 * pts[0].x + 3 * (1 - t) ** 2 * t * pts[1].x + 3 * (1 - t) * t * t * pts[2].x + t ** 3 * pts[3].x, y: (1 - t) ** 3 * pts[0].y + 3 * (1 - t) ** 2 * t * pts[1].y + 3 * (1 - t) * t * t * pts[2].y + t ** 3 * pts[3].y };
      line(q);
    }
  };
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase();
    const R = (x: number, y: number): P => (rel ? { x: cur.x + x, y: cur.y + y } : { x, y });
    switch (cmd.toUpperCase()) {
      case 'M': {
        cur = R(nextNum(), nextNum());
        start = cur;
        cmd = rel ? 'l' : 'L'; // coordenadas seguintes são linhas
        ctrl = null;
        break;
      }
      case 'L':
        line(R(nextNum(), nextNum()));
        ctrl = null;
        break;
      case 'H':
        line({ x: rel ? cur.x + nextNum() : nextNum(), y: cur.y });
        ctrl = null;
        break;
      case 'V':
        line({ x: cur.x, y: rel ? cur.y + nextNum() : nextNum() });
        ctrl = null;
        break;
      case 'Z':
        if (Math.hypot(cur.x - start.x, cur.y - start.y) > 1e-12) line(start);
        cur = start;
        ctrl = null;
        if (i < toks.length && !/[a-zA-Z]/.test(toks[i])) cmd = rel ? 'l' : 'L';
        break;
      case 'C': {
        const c1: P = R(nextNum(), nextNum()), c2: P = R(nextNum(), nextNum()), e: P = R(nextNum(), nextNum());
        bezier([cur, c1, c2, e]);
        ctrl = c2;
        break;
      }
      case 'S': {
        const c1: P = ctrl ? { x: 2 * cur.x - ctrl.x, y: 2 * cur.y - ctrl.y } : cur;
        const c2: P = R(nextNum(), nextNum()), e: P = R(nextNum(), nextNum());
        bezier([cur, c1, c2, e]);
        ctrl = c2;
        break;
      }
      case 'Q': {
        const c1: P = R(nextNum(), nextNum()), e: P = R(nextNum(), nextNum());
        bezier([cur, c1, e]);
        ctrl = c1;
        break;
      }
      case 'T': {
        const c1: P = ctrl ? { x: 2 * cur.x - ctrl.x, y: 2 * cur.y - ctrl.y } : cur;
        const e: P = R(nextNum(), nextNum());
        bezier([cur, c1, e]);
        ctrl = c1;
        break;
      }
      case 'A': {
        const rx = nextNum(), ry = nextNum(), phi = nextNum(), large = nextNum() !== 0, sweep = nextNum() !== 0;
        const e: P = R(nextNum(), nextNum());
        svgArc(cur, rx, ry, phi, large, sweep, e, m, out);
        cur = e;
        ctrl = null;
        break;
      }
      default:
        i++; // comando desconhecido: pula
    }
  }
}

// ---------- para o desenho ----------
/** Acrescenta as formas ao desenho, unindo pontos coincidentes (tolerância relativa ao tamanho). */
export function addShapes(sk: Sketch, shapes: Shape[]): { sketch: Sketch; counts: { lines: number; arcs: number; circles: number }; ids: (Id | null)[] } {
  const d = new Draft(sk);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const grow = (p: P) => ((x0 = Math.min(x0, p.x)), (x1 = Math.max(x1, p.x)), (y0 = Math.min(y0, p.y)), (y1 = Math.max(y1, p.y)));
  const endsOf = (s: Shape): P[] =>
    s.kind === 'line' ? [s.a, s.b] : s.kind === 'arc' ? [{ x: s.c.x + s.r * Math.cos(s.a0), y: s.c.y + s.r * Math.sin(s.a0) }, { x: s.c.x + s.r * Math.cos(s.a1), y: s.c.y + s.r * Math.sin(s.a1) }] : [s.c];
  for (const s of shapes) endsOf(s).forEach(grow);
  const tol = Math.max(1e-9, 1e-6 * Math.hypot(x1 - x0, y1 - y0));
  const grid = new Map<string, Id[]>();
  const key = (x: number, y: number) => `${Math.round(x / tol)},${Math.round(y / tol)}`;
  const pointAt = (p: P): Id => {
    const gx = Math.round(p.x / tol), gy = Math.round(p.y / tol);
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (const id of grid.get(`${gx + i},${gy + j}`) ?? []) {
          const e = d.sk.entities[id] as { x: number; y: number };
          if (Math.hypot(e.x - p.x, e.y - p.y) <= tol) return id;
        }
    const id = d.addPoint(p.x, p.y);
    const k = key(p.x, p.y);
    grid.set(k, [...(grid.get(k) ?? []), id]);
    return id;
  };
  const counts = { lines: 0, arcs: 0, circles: 0 };
  // Id da curva criada para cada forma (null se ficou de fora: degenerada).
  const ids: (Id | null)[] = [];
  for (const s of shapes) {
    ids.push(null);
    const set = (id: Id) => (ids[ids.length - 1] = id);
    if (s.kind === 'line') {
      if (Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) <= tol) continue;
      const a = pointAt(s.a), b = pointAt(s.b);
      if (a !== b) set(d.addLine(a, b)), counts.lines++;
    } else if (s.kind === 'circle') {
      if (s.r > tol) set(d.addCircle(d.addPoint(s.c.x, s.c.y), s.r)), counts.circles++;
    } else if (s.r > tol) {
      const [pa, pb] = endsOf(s);
      // Arco de volta inteira (ex.: ARC 0°–360° no DXF): vira círculo.
      if (Math.hypot(pa.x - pb.x, pa.y - pb.y) <= tol) {
        set(d.addCircle(d.addPoint(s.c.x, s.c.y), s.r));
        counts.circles++;
        continue;
      }
      set(d.addArc(d.addPoint(s.c.x, s.c.y), pointAt(pa), pointAt(pb), s.r));
      counts.arcs++;
    }
  }
  return { sketch: d.sk, counts, ids };
}

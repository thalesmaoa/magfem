// Geometria de desenho das cotas (em mm): linhas, setas, arco de ângulo e posição do texto.
import { add, cross, dist, dot, len, lineIntersection, mid, mul, norm, perp, pt, sub, type Vec } from './geometry';
import { dimPointIds, lineDir, pointLineFoot } from './measure';
import type { Constraint, Sketch } from './types';

export interface DimDrawing {
  segments: [Vec, Vec][];
  arrows: { at: Vec; dir: Vec }[]; // dir aponta para onde a seta aponta
  arc?: { c: Vec; r: number; a0: number; a1: number }; // anti-horário de a0 a a1
  text: Vec;
}

/** Âncora da cota: ponto de referência ao qual `label` é relativo. */
export function dimAnchor(sk: Sketch, c: Constraint): Vec | null {
  switch (c.type) {
    case 'distance':
    case 'hdistance':
    case 'vdistance': {
      const pp = dimPointIds(sk, c);
      if (pp) return mid(pt(sk, pp[0]), pt(sk, pp[1]));
      const pl = pointLineFoot(sk, c);
      return pl ? mid(pl.p, pl.f) : null;
    }
    case 'radius':
    case 'diameter': {
      const e = sk.entities[c.refs[0]];
      return e?.type === 'circle' || e?.type === 'arc' ? pt(sk, e.c) : null;
    }
    case 'angle': {
      const l1 = sk.entities[c.refs[0]];
      const l2 = sk.entities[c.refs[1]];
      if (l1?.type !== 'line' || l2?.type !== 'line') return null;
      const a1 = pt(sk, l1.p1);
      const a2 = pt(sk, l1.p2);
      const b1 = pt(sk, l2.p1);
      const b2 = pt(sk, l2.p2);
      return lineIntersection(a1, a2, b1, b2) ?? mid(mid(a1, a2), mid(b1, b2));
    }
    default:
      return null;
  }
}

/** Posição padrão do texto (relativa à âncora) para uma cota recém-criada. */
export function defaultLabel(sk: Sketch, c: Constraint, pxToMm: number): { x: number; y: number } {
  const off = 30 * pxToMm;
  if (c.type === 'radius' || c.type === 'diameter') {
    const e = sk.entities[c.refs[0]];
    const r = e?.type === 'circle' || e?.type === 'arc' ? e.r : 0;
    return { x: (r + off) * Math.SQRT1_2, y: (r + off) * Math.SQRT1_2 };
  }
  if (c.type === 'angle') {
    const f = c.flip ?? [false, false];
    const d = norm(add(mul(norm(lineDir(sk, c.refs[0])), f[0] ? -1 : 1), mul(norm(lineDir(sk, c.refs[1])), f[1] ? -1 : 1)));
    return mul(d, 3 * off);
  }
  if (c.type === 'hdistance') return { x: 0, y: off };
  if (c.type === 'vdistance') return { x: off, y: 0 };
  const pp = dimPointIds(sk, c);
  const pl = pointLineFoot(sk, c);
  const [a, b] = pp ? [pt(sk, pp[0]), pt(sk, pp[1])] : pl ? [pl.p, pl.f] : [{ x: 0, y: 0 }, { x: 1, y: 0 }];
  return mul(perp(norm(sub(b, a))), off);
}

export function dimDrawing(sk: Sketch, c: Constraint, pxToMm: number): DimDrawing | null {
  const anchor = dimAnchor(sk, c);
  if (!anchor) return null;
  const label = c.label ?? defaultLabel(sk, c, pxToMm);
  const text = add(anchor, label);
  const gap = 4 * pxToMm;
  const over = 6 * pxToMm;

  if (c.type === 'distance' || c.type === 'hdistance' || c.type === 'vdistance') {
    const pp = dimPointIds(sk, c);
    const pl = pointLineFoot(sk, c);
    const [A, B] = pp ? [pt(sk, pp[0]), pt(sk, pp[1])] : pl ? [pl.p, pl.f] : [null, null];
    if (!A || !B) return null;
    let A2: Vec, B2: Vec;
    if (c.type === 'hdistance') {
      const y = text.y;
      A2 = { x: A.x, y };
      B2 = { x: B.x, y };
    } else if (c.type === 'vdistance') {
      const x = text.x;
      A2 = { x, y: A.y };
      B2 = { x, y: B.y };
    } else {
      const u = norm(sub(B, A));
      const n = perp(u);
      const k = dot(sub(text, anchor), n);
      A2 = add(A, mul(n, k));
      B2 = add(B, mul(n, k));
    }
    const ext = (P: Vec, P2: Vec): [Vec, Vec] => {
      const d = sub(P2, P);
      const l = len(d);
      if (l < gap) return [P2, P2];
      const u = mul(d, 1 / l);
      return [add(P, mul(u, gap)), add(P2, mul(u, over))];
    };
    const u = norm(sub(B2, A2));
    // Dimensão da linha estendida até o texto, se o texto estiver fora do intervalo.
    const t = dot(sub(text, A2), u);
    const L = len(sub(B2, A2));
    // Cota ponto-linha: a linha de chamada parte do ponto do segmento mais próximo da cota,
    // não do pé da perpendicular (que pode cair no prolongamento, fora da linha).
    let Bfrom = B;
    const ln = pl ? sk.entities[pl.lineId] : null;
    if (ln?.type === 'line') {
      const s1 = pt(sk, ln.p1);
      const sd = sub(pt(sk, ln.p2), s1);
      const L2 = dot(sd, sd);
      const tt = L2 > 0 ? Math.min(1, Math.max(0, dot(sub(B2, s1), sd) / L2)) : 0;
      Bfrom = add(s1, mul(sd, tt));
    }
    const segs: [Vec, Vec][] = [ext(A, A2), ext(Bfrom, B2), [A2, B2]];
    if (t < 0) segs.push([A2, add(A2, mul(u, t))]);
    if (t > L) segs.push([B2, add(A2, mul(u, t))]);
    return { segments: segs, arrows: [{ at: A2, dir: mul(u, -1) }, { at: B2, dir: u }], text };
  }

  if (c.type === 'radius' || c.type === 'diameter') {
    const e = sk.entities[c.refs[0]];
    if (e?.type !== 'circle' && e?.type !== 'arc') return null;
    const ctr = pt(sk, e.c);
    const d = norm(label);
    const edge = add(ctr, mul(d, e.r));
    const segs: [Vec, Vec][] = [];
    const arrows = [{ at: edge, dir: d }];
    if (c.type === 'radius') segs.push([ctr, edge]);
    else {
      const opp = add(ctr, mul(d, -e.r));
      segs.push([opp, edge]);
      arrows.push({ at: opp, dir: mul(d, -1) });
    }
    if (len(label) > e.r) segs.push([edge, text]);
    return { segments: segs, arrows, text };
  }

  if (c.type === 'angle') {
    const f = c.flip ?? [false, false];
    const d1 = mul(norm(lineDir(sk, c.refs[0])), f[0] ? -1 : 1);
    const d2 = mul(norm(lineDir(sk, c.refs[1])), f[1] ? -1 : 1);
    const r = Math.max(len(label), 10 * pxToMm);
    // Arco do setor menor entre d1 e d2 (anti-horário de a0 a a1).
    let a0 = Math.atan2(d1.y, d1.x);
    const sweep = Math.atan2(cross(d1, d2), dot(d1, d2));
    if (sweep < 0) a0 += sweep;
    const a1 = a0 + Math.abs(sweep);
    const p0 = add(anchor, { x: r * Math.cos(a0), y: r * Math.sin(a0) });
    const p1 = add(anchor, { x: r * Math.cos(a1), y: r * Math.sin(a1) });
    const segs: [Vec, Vec][] = [];
    // Extensões das linhas até o arco, quando o arco passa além do segmento.
    for (const [id, p] of [
      [c.refs[0], sweep >= 0 ? p0 : p1],
      [c.refs[1], sweep >= 0 ? p1 : p0],
    ] as [string, Vec][]) {
      const l = sk.entities[id];
      if (l?.type !== 'line') continue;
      const A = pt(sk, l.p1);
      const B = pt(sk, l.p2);
      const far = dist(anchor, A) > dist(anchor, B) ? A : B;
      if (dist(anchor, p) > dist(anchor, far)) segs.push([far, p]);
    }
    return {
      segments: segs,
      arc: { c: anchor, r, a0, a1 },
      arrows: [
        { at: p0, dir: { x: Math.sin(a0), y: -Math.cos(a0) } },
        { at: p1, dir: { x: -Math.sin(a1), y: Math.cos(a1) } },
      ],
      text,
    };
  }
  return null;
}

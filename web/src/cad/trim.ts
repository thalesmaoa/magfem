// Aparar (tesoura), como no Onshape: remove o trecho da curva entre as interseções mais próximas do clique.
import { closestOnCurve, dist, normAngle, type Vec } from './geometry';
import { deleteItems, Draft } from './ops';
import { intersect, paramAt, paramOf, shapeOf } from './regions';
import { isCurve, type Curve, type Id, type Sketch } from './types';

const TAU = 2 * Math.PI;

/** Interseções da curva com as outras (parâmetro na curva, ponto e a curva que cruza). */
function cuts(sk: Sketch, c: Curve): { t: number; p: Vec; by: Id }[] {
  const out: { t: number; p: Vec; by: Id }[] = [];
  const s1 = shapeOf(sk, c);
  for (const o of Object.values(sk.entities)) {
    if (!isCurve(o) || o.id === c.id || (o as { aux?: boolean }).aux) continue;
    for (const p of intersect(s1, shapeOf(sk, o))) {
      // O suporte de arcos é o círculo inteiro: fica só o que cai nos dois arcos.
      if (o.type === 'arc' && paramAt(sk, o, p) === null) continue;
      const t = paramAt(sk, c, p);
      if (t === null) continue;
      out.push({ t, p, by: o.id });
    }
  }
  return out;
}

export interface TrimPiece {
  curve: Id;
  /** Parâmetros do trecho removido (linha: 0..1; arco/círculo: ângulo) e as curvas que o limitam. */
  t0: number;
  t1: number;
  by0?: Id;
  by1?: Id;
  /** Pontos do trecho, para destacar no desenho. */
  pts: Vec[];
  /** A curva inteira some (não cruza nada, ou só uma vez num círculo). */
  whole: boolean;
}

/** Trecho que o clique em `p` removeria na curva `id`. */
export function trimPiece(sk: Sketch, id: Id, p: Vec): TrimPiece | null {
  const c = sk.entities[id];
  if (!c || !isCurve(c)) return null;
  const P = paramOf(sk, c);
  const q = closestOnCurve(sk, c, p).q;
  let tc = paramAt(sk, c, q);
  if (tc === null) return null;
  const eps = 1e-7;
  const list = cuts(sk, c).filter((x) => (P.closed ? true : x.t > P.t0 + eps && x.t < P.t1 - eps));
  const sample = (a: number, b: number) => Array.from({ length: 33 }, (_, k) => P.at(a + ((b - a) * k) / 32));
  if (P.closed) {
    // Círculo: precisa de duas interseções distintas; o trecho vai do ângulo anterior ao seguinte.
    const angs = [...new Set(list.map((x) => Math.round(normAngle(x.t) * 1e9) / 1e9))].sort((a, b) => a - b);
    tc = normAngle(tc);
    if (angs.length < 2) return { curve: id, t0: 0, t1: TAU, pts: sample(0, TAU), whole: true };
    let prev = angs[angs.length - 1] - TAU, next = angs[0];
    for (const a of angs) {
      if (a <= tc) prev = a;
      if (a > tc) {
        next = a;
        break;
      }
    }
    if (next <= tc) next = angs[0] + TAU;
    const byAt = (a: number) => list.find((x) => Math.abs(normAngle(x.t) - normAngle(a)) < 1e-6)?.by;
    return { curve: id, t0: prev, t1: next, by0: byAt(prev), by1: byAt(next), pts: sample(prev, next), whole: false };
  }
  let t0 = P.t0, t1 = P.t1, by0: Id | undefined, by1: Id | undefined;
  for (const x of list) {
    if (x.t <= tc && x.t > t0) (t0 = x.t), (by0 = x.by);
    if (x.t >= tc && x.t < t1) (t1 = x.t), (by1 = x.by);
  }
  return { curve: id, t0, t1, by0, by1, pts: sample(t0, t1), whole: !by0 && !by1 };
}

/** Aplica o corte. Devolve o sketch novo (ou null se não houver o que aparar). */
export function trim(sk: Sketch, id: Id, p: Vec): Sketch | null {
  const piece = trimPiece(sk, id, p);
  if (!piece) return null;
  if (piece.whole) return deleteItems(sk, [id]);
  const c = sk.entities[id] as Curve;
  const P = paramOf(sk, c);
  const d = new Draft(sk);
  // Ponto novo na interseção, preso à curva que cruza.
  const cutPoint = (t: number, by?: Id): Id => {
    const q = P.at(t);
    // Reaproveita um ponto existente ali (ex.: canto já compartilhado).
    const near = Object.values(d.sk.entities).find((e) => e.type === 'point' && dist(e, q) < 1e-7) as { id: Id } | undefined;
    if (near) return near.id;
    const nid = d.addPoint(q.x, q.y);
    if (by) d.addConstraint('pointOn', [nid, by]);
    return nid;
  };
  const groupsOf = (eid: Id) => d.sk.groups.filter((g) => g.members.includes(eid)).map((g) => g.id);
  const addToGroups = (gids: Id[], ids: Id[]) => {
    d.sk.groups = d.sk.groups.map((g) => (gids.includes(g.id) ? { ...g, members: [...g.members, ...ids] } : g));
  };
  const gids = groupsOf(id);
  // Um ponto que vira ponta da curva já está nela: "ponto sobre" a própria curva ficaria redundante (o solver recusa).
  const done = (ids: Id[]) => {
    d.sk.constraints = d.sk.constraints.filter((k) => {
      if (k.type !== 'pointOn' || !ids.includes(k.refs[1])) return true;
      const e = d.sk.entities[k.refs[1]] as Curve & Record<string, unknown>;
      const ends = e.type === 'line' ? [e.p1, e.p2] : e.type === 'arc' ? [e.s, e.e] : [];
      return !ends.includes(k.refs[0]);
    });
    return deleteItems(d.sk, []);
  };
  // Cotas de comprimento/raio e "igual" da curva cortada deixam de valer.
  d.sk.constraints = d.sk.constraints.filter(
    (k) => !((k.refs.length === 1 && k.refs[0] === id && (k.type === 'distance' || k.type === 'diameter')) || (k.type === 'equal' && k.refs.includes(id))),
  );
  if (c.type === 'circle') {
    // Sobra o arco do fim do trecho (t1) até o início (t0), no sentido anti-horário.
    const s = cutPoint(piece.t1, piece.by1), e = cutPoint(piece.t0, piece.by0);
    d.sk.entities[id] = { id, type: 'arc', c: c.c, s, e, r: c.r, ...(c.construction ? { construction: true } : {}) };
    addToGroups(gids, [s, e]);
    return done([id]);
  }
  const atStart = Math.abs(piece.t0 - P.t0) < 1e-9, atEnd = Math.abs(piece.t1 - P.t1) < 1e-9;
  const startKey = c.type === 'line' ? 'p1' : 's', endKey = c.type === 'line' ? 'p2' : 'e';
  const cur = d.sk.entities[id] as Curve & Record<string, unknown>;
  const touched: Id[] = [id];
  if (atStart) {
    const np = cutPoint(piece.t1, piece.by1);
    d.sk.entities[id] = { ...cur, [startKey]: np } as Curve;
    addToGroups(gids, [np]);
  } else if (atEnd) {
    const np = cutPoint(piece.t0, piece.by0);
    d.sk.entities[id] = { ...cur, [endKey]: np } as Curve;
    addToGroups(gids, [np]);
  } else {
    // Trecho no meio: a curva fica com o começo; uma curva nova leva o fim.
    const a = cutPoint(piece.t0, piece.by0), b = cutPoint(piece.t1, piece.by1);
    const oldEnd = cur[endKey] as Id;
    d.sk.entities[id] = { ...cur, [endKey]: a } as Curve;
    let nid: Id;
    if (c.type === 'line') {
      nid = d.addLine(b, oldEnd, !!c.construction);
      for (const k of sk.constraints) if ((k.type === 'horizontal' || k.type === 'vertical') && k.refs.length === 1 && k.refs[0] === id) d.addConstraint(k.type, [nid]);
    } else {
      // Os dois pedaços compartilham o centro.
      nid = d.addArc((c as { c: Id }).c, b, oldEnd, c.r, !!c.construction);
    }
    addToGroups(gids, [a, b, nid]);
    touched.push(nid);
  }
  return done(touched);
}

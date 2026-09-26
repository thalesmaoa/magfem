// Operações puras de edição do sketch (sempre devolvem cópias).
import { T } from '../i18n';
import { curvePoints, entityBBox, type Vec } from './geometry';
import { asAngle, asLength, evaluate, evaluateVariables, isConstant, type Q } from './expr';
import { ORIGIN_ID, isCurve, type Constraint, type ConstraintType, type Curve, type Entity, type Group, type Id, type Sketch } from './types';

/** Cópia mutável do sketch para montar uma alteração em várias etapas. */
export class Draft {
  sk: Sketch;
  constructor(base: Sketch) {
    this.sk = { ...base, entities: { ...base.entities }, constraints: [...base.constraints], groups: [...base.groups], nodes: [...base.nodes], nextId: base.nextId };
  }
  private newId(prefix: string) {
    return `${prefix}${this.sk.nextId++}`;
  }
  addPoint(x: number, y: number, free = false): Id {
    const id = this.newId('p');
    this.sk.entities[id] = { id, type: 'point', x, y, ...(free ? { free: true } : {}) };
    return id;
  }
  addLine(p1: Id, p2: Id, construction = false): Id {
    const id = this.newId('l');
    this.sk.entities[id] = { id, type: 'line', p1, p2, ...(construction ? { construction } : {}) };
    return id;
  }
  addCircle(c: Id, r: number, construction = false): Id {
    const id = this.newId('c');
    this.sk.entities[id] = { id, type: 'circle', c, r, ...(construction ? { construction } : {}) };
    return id;
  }
  addArc(c: Id, s: Id, e: Id, r: number, construction = false): Id {
    const id = this.newId('a');
    this.sk.entities[id] = { id, type: 'arc', c, s, e, r, ...(construction ? { construction } : {}) };
    return id;
  }
  addConstraint(type: ConstraintType, refs: Id[], extra: Partial<Constraint> = {}): Id {
    const id = this.newId('k');
    this.sk.constraints.push({ id, type, refs, ...extra });
    return id;
  }
  addGroup(name: string, members: Id[]): Id {
    const id = this.newId('g');
    this.sk.groups = [...this.sk.groups, { id, name, members }];
    return id;
  }
  setEntity(e: Entity) {
    this.sk.entities[e.id] = e;
  }
}

/** Apaga entidades e restrições; remove dependências e pontos órfãos. */
export function deleteItems(sk: Sketch, ids: Iterable<Id>): Sketch {
  const kill = new Set(ids);
  // Apagar um grupo apaga seus membros; offsets dependentes de curvas apagadas também saem.
  for (const g of sk.groups) if (kill.has(g.id)) g.members.forEach((m) => kill.add(m));
  for (const g of sk.groups)
    if ((g.offset && g.offset.parents.some((p) => kill.has(p))) || (g.pattern && g.pattern.src.some((p) => kill.has(p)))) {
      kill.add(g.id);
      g.members.forEach((m) => kill.add(m));
    }
  kill.delete(ORIGIN_ID);
  const entities = { ...sk.entities };
  const killedEntities = new Set<Id>();
  const removeEntity = (id: Id) => {
    if (id === ORIGIN_ID || !entities[id]) return;
    delete entities[id];
    killedEntities.add(id);
  };

  for (const id of kill) if (entities[id]) removeEntity(id);
  // Curvas que usam pontos apagados também saem.
  for (const e of Object.values(entities)) {
    if (isCurve(e) && curvePoints(e).some((p) => killedEntities.has(p))) removeEntity(e.id);
  }
  // Pontos que não pertencem a nenhuma curva (e não são pontos livres) saem.
  const used = new Set<Id>();
  for (const e of Object.values(entities)) if (isCurve(e)) curvePoints(e).forEach((p) => used.add(p));
  for (const e of Object.values(entities)) {
    if (e.type === 'point' && !e.free && !used.has(e.id)) removeEntity(e.id);
  }
  const constraints = sk.constraints.filter((c) => !kill.has(c.id) && c.refs.every((r) => entities[r]));
  const groups = sk.groups
    .filter((g) => !kill.has(g.id))
    .map((g) => ({ ...g, members: g.members.filter((m) => entities[m]) }))
    .filter((g) => g.members.length > 0);
  return { ...sk, entities, constraints, groups };
}

export function toggleConstruction(sk: Sketch, ids: Iterable<Id>): Sketch {
  const entities = { ...sk.entities };
  const curves = [...ids].map((id) => entities[id]).filter(isCurve);
  const on = !curves.every((c) => c.construction);
  for (const c of curves) entities[c.id] = { ...c, construction: on } as Curve;
  return { ...sk, entities };
}

/** Fixa/solta os pontos selecionados (ou os pontos das curvas selecionadas). */
export function toggleFixed(sk: Sketch, ids: Iterable<Id>): Sketch {
  const entities = { ...sk.entities };
  const pts = new Set<Id>();
  for (const id of ids) {
    const e = entities[id];
    if (e?.type === 'point') pts.add(id);
    else if (isCurve(e)) curvePoints(e).forEach((p) => pts.add(p));
  }
  pts.delete(ORIGIN_ID);
  const list = [...pts].map((id) => entities[id]).filter((e) => e?.type === 'point');
  const on = !list.every((p) => p.type === 'point' && p.fixed);
  for (const p of list) if (p.type === 'point') entities[p.id] = { ...p, fixed: on };
  if (!on) return { ...sk, entities };
  // Restrições cujos pontos ficaram todos fixos não têm mais o que restringir (seriam redundantes).
  const isFixed = (pid: Id) => (entities[pid] as { fixed?: boolean })?.fixed;
  const involved = (c: Constraint) =>
    c.refs.flatMap((r) => {
      const e = entities[r];
      return e?.type === 'point' ? [r] : isCurve(e) ? curvePoints(e) : [];
    });
  const constraints = sk.constraints.filter((c) => c.internal || c.type === 'radius' || c.type === 'diameter' || !involved(c).every(isFixed));
  return { ...sk, entities, constraints };
}

export type GeomTool =
  | 'coincident'
  | 'horizontal'
  | 'vertical'
  | 'parallel'
  | 'perpendicular'
  | 'tangent'
  | 'equal'
  | 'midpoint'
  | 'symmetric'
  | 'concentric';

/**
 * Restrições que a ferramenta criaria para a seleção atual (lista vazia = não se aplica).
 * Segue o comportamento do Onshape: "coincidente" entre ponto e curva vira "ponto sobre".
 */
export function constraintsFor(sk: Sketch, tool: GeomTool, selection: Id[]): { type: ConstraintType; refs: Id[] }[] {
  const ents = selection.map((id) => sk.entities[id]).filter((e): e is Entity => !!e);
  if (ents.length !== selection.length) return [];
  const points = ents.filter((e) => e.type === 'point');
  const lines = ents.filter((e) => e.type === 'line');
  const rounds = ents.filter((e) => e.type === 'circle' || e.type === 'arc');
  const curves = ents.filter(isCurve);
  const n = ents.length;

  switch (tool) {
    case 'coincident':
      if (n === 2 && points.length === 2) return [{ type: 'coincident', refs: [points[0].id, points[1].id] }];
      if (n === 2 && points.length === 1 && curves.length === 1) return [{ type: 'pointOn', refs: [points[0].id, curves[0].id] }];
      // Duas linhas: colineares (paralelas + uma ponta da segunda sobre a primeira), como no Onshape.
      if (n === 2 && lines.length === 2 && lines[1].type === 'line')
        return [
          { type: 'parallel', refs: [lines[0].id, lines[1].id] },
          { type: 'pointOn', refs: [lines[1].p1, lines[0].id] },
        ];
      return [];
    case 'horizontal':
    case 'vertical':
      if (n === 2 && points.length === 2) return [{ type: tool, refs: [points[0].id, points[1].id] }];
      // Ponto + linha: alinha o ponto com uma ponta da linha (mesma altura / mesmo x).
      if (n === 2 && points.length === 1 && lines.length === 1 && lines[0].type === 'line') return [{ type: tool, refs: [points[0].id, lines[0].p1] }];
      if (n >= 1 && lines.length === n) return lines.map((l) => ({ type: tool, refs: [l.id] }));
      return [];
    case 'parallel':
      if (n >= 2 && lines.length === n) return lines.slice(1).map((l) => ({ type: 'parallel', refs: [lines[0].id, l.id] }));
      return [];
    case 'perpendicular':
      if (n === 2 && lines.length === 2) return [{ type: 'perpendicular', refs: [lines[0].id, lines[1].id] }];
      return [];
    case 'tangent':
      if (n === 2 && curves.length === 2 && rounds.length >= 1) return [{ type: 'tangent', refs: [curves[0].id, curves[1].id] }];
      return [];
    case 'equal':
      if (n >= 2 && lines.length === n) return lines.slice(1).map((l) => ({ type: 'equal', refs: [lines[0].id, l.id] }));
      if (n >= 2 && rounds.length === n) return rounds.slice(1).map((r) => ({ type: 'equal', refs: [rounds[0].id, r.id] }));
      return [];
    case 'midpoint':
      if (n === 2 && points.length === 1 && lines.length === 1) return [{ type: 'midpoint', refs: [points[0].id, lines[0].id] }];
      return [];
    case 'symmetric':
      // Só dois pontos: o eixo é escolhido depois (X, Y ou uma linha) — ver SketchEditor.symmetricPoints.
      if (n === 2 && points.length === 2) return [{ type: 'symmetric', refs: [points[0].id, points[1].id] }];
      if (n === 3 && points.length === 2 && lines.length === 1)
        return [{ type: 'symmetric', refs: [points[0].id, points[1].id, lines[0].id] }];
      return [];
    case 'concentric':
      if (n === 2 && rounds.length === 2) return [{ type: 'concentric', refs: [rounds[0].id, rounds[1].id] }];
      return [];
  }
}

// ---------- grupos ----------

export const groupOf = (sk: Sketch, id: Id): Group | undefined => sk.groups.find((g) => g.members.includes(id));

/** Troca ids de grupo pelos membros e devolve só entidades. */
export function expandSelection(sk: Sketch, sel: Id[]): Id[] {
  const out = new Set<Id>();
  for (const id of sel) {
    const g = sk.groups.find((x) => x.id === id);
    if (g) g.members.forEach((m) => out.add(m));
    else if (sk.entities[id]) out.add(id);
  }
  return [...out];
}

/** Pontos movidos quando a seleção (entidades/grupos) é movida. */
export function selectionPoints(sk: Sketch, sel: Id[]): Id[] {
  const pts = new Set<Id>();
  for (const id of expandSelection(sk, sel)) {
    const e = sk.entities[id];
    if (e?.type === 'point') pts.add(id);
    else if (isCurve(e)) curvePoints(e).forEach((p) => pts.add(p));
  }
  return [...pts];
}

export function createGroup(sk: Sketch, sel: Id[], name?: string): { sketch: Sketch; id: Id } | null {
  const members = expandSelection(sk, sel).filter((id) => id !== ORIGIN_ID);
  if (!members.length) return null;
  const id = `g${sk.nextId}`;
  const n = name ?? `Grupo ${sk.groups.length + 1}`;
  // Uma entidade pertence a no máximo um grupo: sai dos grupos antigos.
  const groups = sk.groups
    .map((g) => ({ ...g, members: g.members.filter((m) => !members.includes(m)) }))
    .filter((g) => g.members.length > 0);
  groups.push({ id, name: n, members });
  return { sketch: { ...sk, groups, nextId: sk.nextId + 1 }, id };
}

export function ungroup(sk: Sketch, groupIds: Id[]): Sketch {
  return { ...sk, groups: sk.groups.filter((g) => !groupIds.includes(g.id)) };
}

export function updateGroup(sk: Sketch, id: Id, patch: Partial<Group>): Sketch {
  if (patch.name && nameTaken(sk, patch.name, id)) throw new Error(T().msg.nameTaken(patch.name));
  return { ...sk, groups: sk.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)) };
}

export function isHidden(sk: Sketch, id: Id): boolean {
  return sk.groups.some((g) => g.hidden && g.members.includes(id));
}

// ---------- fundir pontos (arrastar um ponto sobre outro) ----------

/** Substitui `from` por `into` em curvas e restrições e apaga `from`. null se não fizer sentido. */
export function mergePoints(sk: Sketch, from: Id, into: Id): Sketch | null {
  if (from === into || from === ORIGIN_ID) return null;
  const A = sk.entities[from];
  const B = sk.entities[into];
  if (A?.type !== 'point' || B?.type !== 'point') return null;
  // Não funde as duas pontas de uma mesma curva.
  for (const e of Object.values(sk.entities)) {
    if (isCurve(e)) {
      const p = curvePoints(e);
      if (p.includes(from) && p.includes(into)) return null;
    }
  }
  const sub = (id: Id) => (id === from ? into : id);
  const entities: Record<Id, Entity> = {};
  for (const e of Object.values(sk.entities)) {
    if (e.id === from) continue;
    if (e.type === 'line') entities[e.id] = { ...e, p1: sub(e.p1), p2: sub(e.p2) };
    else if (e.type === 'circle') entities[e.id] = { ...e, c: sub(e.c) };
    else if (e.type === 'arc') entities[e.id] = { ...e, c: sub(e.c), s: sub(e.s), e: sub(e.e) };
    else entities[e.id] = e;
  }
  if (A.fixed && B.type === 'point' && !B.fixed) entities[into] = { ...B, fixed: true };
  const constraints = sk.constraints
    .map((c) => ({ ...c, refs: c.refs.map(sub) }))
    .filter((c) => new Set(c.refs).size === c.refs.length);
  const groups = sk.groups.map((g) => ({ ...g, members: g.members.filter((m) => m !== from) })).filter((g) => g.members.length);
  return { ...sk, entities, constraints, groups };
}

// ---------- mover / girar ----------

export interface Transform {
  dx: number;
  dy: number;
  /** graus, anti-horário */
  angle: number;
  pivot: Vec;
}

export function transformPoints(sk: Sketch, pointIds: Id[], t: Transform): Sketch {
  const entities = { ...sk.entities };
  const a = (t.angle * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  for (const id of pointIds) {
    const p = entities[id];
    if (p?.type !== 'point' || p.fixed) continue;
    const x = p.x - t.pivot.x;
    const y = p.y - t.pivot.y;
    entities[id] = { ...p, x: t.pivot.x + c * x - s * y + t.dx, y: t.pivot.y + s * x + c * y + t.dy };
  }
  return { ...sk, entities };
}

/**
 * Restrições de orientação (H/V) internas à parte girada: em múltiplos de 90° trocam H↔V;
 * em outros ângulos deixariam de valer e são removidas. Devolve o sketch e quantas saíram.
 */
export function adaptOrientationConstraints(sk: Sketch, pointIds: Id[], angle: number): { sketch: Sketch; removed: number } {
  const turns = (((Math.round(angle / 90) % 4) + 4) % 4);
  const exact90 = Math.abs(angle / 90 - Math.round(angle / 90)) < 1e-9;
  if (exact90 && turns % 2 === 0) return { sketch: sk, removed: 0 };
  const pts = new Set(pointIds);
  const inside = (id: Id) => {
    const e = sk.entities[id];
    if (e?.type === 'point') return pts.has(id);
    return isCurve(e) && curvePoints(e).every((p) => pts.has(p));
  };
  const swap: Partial<Record<ConstraintType, ConstraintType>> = {
    horizontal: 'vertical',
    vertical: 'horizontal',
    hdistance: 'vdistance',
    vdistance: 'hdistance',
  };
  let removed = 0;
  const constraints: Constraint[] = [];
  for (const c of sk.constraints) {
    const to = swap[c.type];
    if (!to || !c.refs.every(inside)) {
      constraints.push(c);
      continue;
    }
    if (exact90) {
      // O texto da cota gira junto.
      const label = c.label && turns % 2 === 1 ? { x: -c.label.y, y: c.label.x } : c.label;
      constraints.push({ ...c, type: to, ...(label ? { label } : {}) });
    } else removed++;
  }
  return { sketch: { ...sk, constraints }, removed };
}

/**
 * Depois de mover/girar: ligações de pontos movidos com a Origem (coincidente, H/V do snap nos eixos) que deixaram
 * de valer. Um giro de 90° em torno da origem troca H↔V; nos outros casos a ligação sai (devolve quantas saíram).
 */
export function adaptOriginLinks(sk: Sketch, pointIds: Id[]): { sketch: Sketch; removed: number } {
  const moved = new Set(pointIds);
  const tol = 1e-9;
  const holds = (type: ConstraintType, p: { x: number; y: number }) =>
    type === 'horizontal' ? Math.abs(p.y) < tol : type === 'vertical' ? Math.abs(p.x) < tol : Math.hypot(p.x, p.y) < tol;
  let removed = 0;
  const constraints: Constraint[] = [];
  for (const c of sk.constraints) {
    const other = c.refs.length === 2 && c.refs.includes(ORIGIN_ID) ? c.refs.find((r) => r !== ORIGIN_ID)! : null;
    const p = other ? sk.entities[other] : null;
    if (!other || !moved.has(other) || p?.type !== 'point' || !['horizontal', 'vertical', 'coincident'].includes(c.type) || holds(c.type, p)) {
      constraints.push(c);
      continue;
    }
    const to: ConstraintType | null = c.type === 'horizontal' ? 'vertical' : c.type === 'vertical' ? 'horizontal' : null;
    if (to && holds(to, p)) constraints.push({ ...c, type: to });
    else removed++;
  }
  return { sketch: { ...sk, constraints }, removed };
}

export function selectionCenter(sk: Sketch, sel: Id[]): Vec {
  let b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const id of expandSelection(sk, sel)) {
    const eb = entityBBox(sk, sk.entities[id]);
    b = { x0: Math.min(b.x0, eb.x0), y0: Math.min(b.y0, eb.y0), x1: Math.max(b.x1, eb.x1), y1: Math.max(b.y1, eb.y1) };
  }
  if (!isFinite(b.x0)) return { x: 0, y: 0 };
  return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
}

// ---------- expressões das cotas ----------

/** Recalcula os valores das cotas com expressão. Lança erro com mensagem legível. */
export function resolveExpressions(sk: Sketch): Sketch {
  const unit = sk.settings.unit;
  const { values, errors } = evaluateVariables(sk.variables, unit);
  let changed = false;
  const constraints = sk.constraints.map((c) => {
    if (!c.expr) return c; // cotas e restrições com valor (ex.: offset) ligadas a expressões
    let q: Q;
    try {
      q = evaluate(c.expr, { env: values, unit });
    } catch (e) {
      const bad = [...errors.keys()].find((n) => c.expr!.includes(n));
      throw new Error(T().expr.dimError(c.expr!, bad ? T().expr.varError(bad, errors.get(bad)!) : (e as Error).message));
    }
    const v = c.type === 'angle' ? asAngle(q) : asLength(q, unit);
    if (!(v > 0)) throw new Error(T().expr.mustBePositive(c.expr!, v));
    if (v === c.value) return c;
    changed = true;
    return { ...c, value: v };
  });
  return changed ? { ...sk, constraints } : sk;
}

/** Interpreta o texto digitado numa cota: número/constante vira valor; com variáveis vira expressão. */
export function parseDimensionInput(sk: Sketch, c: Constraint, text: string): { value: number; expr?: string } {
  const unit = sk.settings.unit;
  const { values } = evaluateVariables(sk.variables, unit);
  const src = text.trim();
  const q = evaluate(src, { env: values, unit });
  const value = c.type === 'angle' ? asAngle(q) : asLength(q, unit);
  if (!(value > 0)) throw new Error(T().msg.positive);
  return isConstant(src) ? { value } : { value, expr: src };
}


/** Curvas que usam o ponto `pointId`. */
export function curvesUsing(sk: Sketch, pointId: Id): Id[] {
  return Object.values(sk.entities)
    .filter((e) => isCurve(e) && curvePoints(e).includes(pointId))
    .map((e) => e.id);
}

/**
 * Solta as curvas `curveIds` do ponto `pointId`: elas passam a compartilhar um ponto novo
 * na mesma posição (o contorno continua fechado). O ponto original e suas restrições ficam.
 */
export function detachFromPoint(sk: Sketch, pointId: Id, curveIds: Id[]): { sketch: Sketch; newId: Id } | null {
  const P = sk.entities[pointId];
  if (P?.type !== 'point' || !curveIds.length) return null;
  const newId = `p${sk.nextId}`;
  const entities: Record<Id, Entity> = { ...sk.entities, [newId]: { id: newId, type: 'point', x: P.x, y: P.y } };
  const sub = (id: Id) => (id === pointId ? newId : id);
  for (const cid of curveIds) {
    const e = entities[cid];
    if (e?.type === 'line') entities[cid] = { ...e, p1: sub(e.p1), p2: sub(e.p2) };
    else if (e?.type === 'circle') entities[cid] = { ...e, c: sub(e.c) };
    else if (e?.type === 'arc') entities[cid] = { ...e, c: sub(e.c), s: sub(e.s), e: sub(e.e) };
  }
  return { sketch: { ...sk, entities, nextId: sk.nextId + 1 }, newId };
}

/** Pontos fixos (ex.: origem) usados pelas curvas da seleção — o que "prende" a seleção. */
export function fixedPointsOf(sk: Sketch, sel: Id[]): Id[] {
  const out = new Set<Id>();
  for (const id of expandSelection(sk, sel)) {
    const e = sk.entities[id];
    // Auxiliares (conectores do offset) não "prendem" a seleção para o usuário.
    if (isCurve(e) && !(e.type === 'line' && e.aux)) for (const p of curvePoints(e)) if ((sk.entities[p] as { fixed?: boolean }).fixed) out.add(p);
  }
  return [...out];
}

/**
 * Resgata o id pelo nome dado pelo usuário: getId(sk, "kru1") → "l4".
 * Também aceita o próprio id (e nomes de grupos). null se não existir.
 */
export function getId(sk: Sketch, nameOrId: string): Id | null {
  const k = nameOrId.trim();
  if (sk.entities[k] || sk.groups.some((g) => g.id === k)) return k;
  const e = Object.values(sk.entities).find((x) => x.name === k);
  if (e) return e.id;
  const g = sk.groups.find((x) => x.name === k);
  return g ? g.id : null;
}

/** Nome já usado por outra entidade/grupo, ou igual ao id de outro elemento? */
export function nameTaken(sk: Sketch, name: string, except: Id): boolean {
  const owner = getId(sk, name);
  return owner !== null && owner !== except;
}

/** Renomeia uma entidade (nome vazio volta ao padrão). Nomes são únicos no desenho. */
export function renameEntity(sk: Sketch, id: Id, name: string): Sketch {
  const e = sk.entities[id];
  if (!e) return sk;
  const n = name.trim();
  if (n && nameTaken(sk, n, id)) throw new Error(T().msg.nameTaken(n));
  const next = { ...e } as Entity;
  if (n) next.name = n;
  else delete next.name;
  return { ...sk, entities: { ...sk.entities, [id]: next } };
}

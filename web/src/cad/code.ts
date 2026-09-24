// Código equivalente (Python, API `magfem`) para cada ação do usuário — mostrado no Histórico.
// É o esboço da API que o bridge local (Fase 7) vai expor: g (geometria), m (malha), s (solucionador), r (resultados).
import type { Constraint, Id, Sketch } from './types';

const num = (v: number) => {
  const r = Number(v.toFixed(4));
  return Object.is(r, -0) ? '0' : String(r);
};
export const xy = (p: { x: number; y: number }) => `(${num(p.x)}, ${num(p.y)})`;
export const q = (s: string) => JSON.stringify(s);
const ids = (list: Id[]) => list.map(q).join(', ');

/** Ponto para o código: id existente ou coordenada nova. */
export function pointArg(sk: Sketch, id: Id, created: Set<Id>) {
  const p = sk.entities[id];
  if (created.has(id) && p?.type === 'point') return xy(p);
  return q(id);
}

const GEOM_FN: Partial<Record<Constraint['type'], string>> = {
  coincident: 'coincident',
  horizontal: 'horizontal',
  vertical: 'vertical',
  parallel: 'parallel',
  perpendicular: 'perpendicular',
  tangent: 'tangent',
  equal: 'equal',
  pointOn: 'point_on',
  midpoint: 'midpoint',
  symmetric: 'symmetric',
  symmetricPoint: 'symmetric',
  concentric: 'concentric',
  radiusDiff: 'radius_offset',
  coordDiff: 'coord_diff',
  midpointOnLine: 'midpoint_on_line',
};

const DIM_FN: Partial<Record<Constraint['type'], string>> = {
  distance: 'distance',
  hdistance: 'hdistance',
  vdistance: 'vdistance',
  radius: 'radius',
  diameter: 'diameter',
  angle: 'angle',
};

export function dimValueArg(c: Constraint) {
  if (c.expr) return q(c.expr);
  return q(`${num(c.value ?? 0)} ${c.type === 'angle' ? 'deg' : 'mm'}`);
}

export function constraintCode(c: Constraint): string {
  const g = GEOM_FN[c.type];
  if (g) return `g.${g}(${ids(c.refs)})`;
  const d = DIM_FN[c.type];
  if (d) {
    const f = c.type === 'angle' && c.flip && (c.flip[0] || c.flip[1]) ? `, flip=(${c.flip.map((b) => (b ? 'True' : 'False')).join(', ')})` : '';
    return `g.${d}(${ids(c.refs)}, ${dimValueArg(c)}${f})`;
  }
  return `# ${c.type}(${ids(c.refs)})`;
}

/** Linhas de código para as entidades criadas entre `before` e `after` (na ordem de criação). */
export function creationCode(before: Sketch, after: Sketch): string[] {
  const created = new Set(Object.keys(after.entities).filter((id) => !before.entities[id]));
  const lines: string[] = [];
  const used = new Set<Id>();
  // Um ponto novo aparece como coordenada só na primeira curva que o usa; depois, pelo id.
  const shown = new Set<Id>();
  const arg = (pid: Id) => {
    if (created.has(pid) && !shown.has(pid)) {
      shown.add(pid);
      return { text: pointArg(after, pid, created), note: pid };
    }
    return { text: q(pid), note: null };
  };
  for (const id of created) {
    const e = after.entities[id];
    if (e.type === 'point') continue;
    const cons = e.construction ? ', construction=True' : '';
    const pts = e.type === 'line' ? [e.p1, e.p2] : e.type === 'circle' ? [e.c] : [e.c, e.s, e.e];
    const args = pts.map(arg);
    pts.forEach((p) => used.add(p));
    const notes = args.map((a) => a.note).filter(Boolean);
    const tail = notes.length ? `  # cria ${notes.join(', ')}` : '';
    const a = args.map((x) => x.text).join(', ');
    if (e.type === 'line') lines.push(`${id} = g.line(${a}${cons})${tail}`);
    else if (e.type === 'circle') lines.push(`${id} = g.circle(${a}, r=${num(e.r)}${cons})${tail}`);
    else lines.push(`${id} = g.arc(${a}${cons})${tail}`);
  }
  // Pontos criados soltos (ferramenta Ponto, centro do retângulo...).
  for (const id of created) {
    const e = after.entities[id];
    if (e.type === 'point' && !used.has(id)) lines.unshift(`${id} = g.point(${xy(e)})`);
  }
  return lines;
}

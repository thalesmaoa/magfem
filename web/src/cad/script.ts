// Script da API que recria o modelo exatamente (mesmos ids), para rodar no console ou pelo WebSocket.
import { q } from './code';
import { computeArrangement, findRegion } from './regions';
import type { Constraint, Material, Sketch } from './types';

const n = (v: number) => {
  const r = Number(v.toPrecision(12));
  return Number.isInteger(r) ? String(r) : String(r);
};
const xy = (p: { x: number; y: number }) => `(${n(p.x)}, ${n(p.y)})`;
const list = (ids: string[]) => `[${ids.map(q).join(', ')}]`;
const bool = (b: boolean) => (b ? 'True' : 'False');

function constraintLine(c: Constraint): string {
  const kw: string[] = [`id=${q(c.id)}`];
  if (c.value !== undefined) kw.push(`value=${n(c.value)}`);
  if (c.expr !== undefined) kw.push(`expr=${q(c.expr)}`);
  if (c.label) kw.push(`label=${xy(c.label)}`);
  if (c.flip) kw.push(`flip=(${bool(c.flip[0])}, ${bool(c.flip[1])})`);
  if (c.internal) kw.push('internal=True');
  if (c.sign !== undefined) kw.push(`sign=${c.sign}`);
  if (c.param !== undefined) kw.push(`param=${q(c.param)}`);
  if (c.offsetDim !== undefined) kw.push(`offset_dim=${q(c.offsetDim)}`);
  if (c.axis !== undefined) kw.push(`axis=${q(c.axis)}`);
  return `g.constraint(${q(c.type)}, ${list(c.refs)}, ${kw.join(', ')})`;
}

/** Gera o script (uma instrução por linha, comentários com #). */
export function generateScript(sk: Sketch, title = 'MagFEM'): string {
  const L: string[] = [];
  const add = (s: string) => L.push(s);
  add(`# ${title} — script gerado pelo MagFEM (recria o modelo com os mesmos ids)`);
  add('# Rode no console do MagFEM (colar linha a linha ou tudo) ou envie pelo WebSocket da API.');
  add('clear()');
  add('\n# Problema e unidade (coordenadas e raios do script estão sempre em mm)');
  add(`g.problem(${q(sk.settings.problem)}, depth=${q(sk.settings.depth)})`);
  add(`g.units(${q(sk.settings.unit)})`);
  if (sk.variables.length) add('\n# Variáveis');
  for (const v of sk.variables) add(`g.var(${q(v.name)}, ${q(v.expr)})`);

  add('\n# Geometria: pontos e curvas (ids explícitos)');
  for (const e of Object.values(sk.entities)) {
    if (e.type !== 'point' || e.id === 'O') continue;
    const kw = [`id=${q(e.id)}`];
    if (!e.free) kw.push('free=False');
    if (e.fixed) kw.push('fixed=True');
    if (e.aux) kw.push('aux=True');
    if (e.name) kw.push(`name=${q(e.name)}`);
    add(`g.point(${xy(e)}, ${kw.join(', ')})`);
  }
  for (const e of Object.values(sk.entities)) {
    if (e.type === 'point') continue;
    const kw = [`id=${q(e.id)}`];
    if (e.construction) kw.push('construction=True');
    if ((e as { aux?: boolean }).aux) kw.push('aux=True');
    if (e.name) kw.push(`name=${q(e.name)}`);
    if (e.type === 'line') add(`g.line(${q(e.p1)}, ${q(e.p2)}, ${kw.join(', ')})`);
    else if (e.type === 'circle') add(`g.circle(${q(e.c)}, r="${n(e.r)} mm", ${kw.join(', ')})`);
    else add(`g.arc(${q(e.c)}, ${q(e.s)}, ${q(e.e)}, ${kw.join(', ')})`);
  }
  if (sk.groups.length) add('\n# Grupos (retângulos, offsets, espelhos, padrões)');
  for (const g of sk.groups) {
    const kw = [`name=${q(g.name)}`, `members=${list(g.members)}`];
    if (g.parent) kw.push(`parent=${q(g.parent)}`);
    if (g.hidden) kw.push('hidden=True');
    if (g.offset) kw.push(`offset=(${list(g.offset.parents)}, ${n(g.offset.distance)}, ${g.offset.side})`);
    if (g.pattern)
      kw.push(
        g.pattern.kind === 'linear'
          ? `pattern=("linear", ${list(g.pattern.src)}, ${g.pattern.nx}, ${g.pattern.ny}, ${n(g.pattern.dx)}, ${n(g.pattern.dy)})`
          : `pattern=("circular", ${list(g.pattern.src)}, ${g.pattern.n}, ${n(g.pattern.angle)}, ${q(g.pattern.center)})`,
      );
    add(`g.group_def(${q(g.id)}, ${kw.join(', ')})`);
  }
  if (sk.constraints.length) add('\n# Restrições e cotas');
  for (const c of sk.constraints) add(constraintLine(c));

  add('\n# Materiais');
  for (const m of sk.materials) add(materialLine(m));
  if (sk.circuits.length) add('\n# Circuitos');
  for (const c of sk.circuits) add(`m.circuit(${q(c.name)}, id=${q(c.id)}, current=${q(c.current)}, kind=${q(c.kind)})`);
  if (sk.boundaries.length) add('\n# Contornos');
  for (const b of sk.boundaries) {
    const kw = [`id=${q(b.id)}`, `type=${q(b.type)}`];
    const params: [string, string | undefined][] = [['value', b.value], ['a1', b.a1], ['a2', b.a2], ['phi', b.phi], ['mu', b.mu], ['sigma', b.sigma], ['c0', b.c0], ['c1', b.c1], ['inner_angle', b.innerAngle], ['outer_angle', b.outerAngle], ['color', b.color]];
    for (const [k, v] of params) if (v !== undefined) kw.push(`${k}=${q(v)}`);
    add(`m.boundary_def(${q(b.name)}, ${kw.join(', ')})`);
    if (b.curves.length) add(`m.boundary(${list(b.curves)}, ${q(b.name)})`);
  }

  // Regiões: identificadas por um ponto interno (recalculado no modelo atual).
  const arr = computeArrangement(sk);
  const assigns = sk.regionAssigns.map((a) => ({ a, r: findRegion(arr, a) })).filter((x) => x.r);
  if (assigns.length) add('\n# Regiões (ponto interno de cada região)');
  const mats = new Map(sk.materials.map((m) => [m.id, m.name]));
  const circs = new Map(sk.circuits.map((c) => [c.id, c.name]));
  for (const { a, r } of assigns) {
    const kw: string[] = [`id=${q(a.id)}`];
    if (a.name) kw.push(`name=${q(a.name)}`);
    if (a.material) kw.push(`material=${q(mats.get(a.material) ?? a.material)}`);
    if (a.circuit) kw.push(`circuit=${q(circs.get(a.circuit) ?? a.circuit)}`);
    if (a.current) kw.push(`current=${q(a.current)}`);
    if (a.turns !== undefined) kw.push(`turns=${n(a.turns)}`);
    if (a.magnetAngle) kw.push(`angle=${q(a.magnetAngle)}`);
    if (a.labelOffset) kw.push(`label=${xy(a.labelOffset)}`);
    add(`m.region(${xy(r!.label)}, ${kw.join(', ')})`);
    if (a.meshSize) add(`m.mesh_size(${xy(r!.label)}, ${q(a.meshSize)})`);
  }

  add('\n# Malha, física e resultados');
  for (const node of sk.nodes) {
    if (node.kind === 'mesh') {
      add(`m.add(name=${q(node.name)}, id=${q(node.id)})`);
      add(`m.settings(${q(node.id)}, size=${node.size?.trim() ? q(node.size) : '"auto"'}, min_angle=${n(node.minAngle ?? 30)})`);
    } else if (node.kind === 'physics') {
      add(`s.add_physics(name=${q(node.name)}, id=${q(node.id)})`);
      add(`s.physics(${q(node.id)}, analysis=${q(node.analysis)}, frequency=${q(node.frequency)}, dt=${q(node.dt)}, t_end=${q(node.tEnd)}${node.schematic ? `, schematic=${q(node.schematic)}` : ''})`);
    }
  }
  // Vistas e gráficos na ordem da árvore.
  for (const p of sk.nodes) {
    if (p.kind === 'view') {
      if (p.level) add(`r.interpolate(${q(p.physics)}, level=${p.level}, name=${q(p.name)}, id=${q(p.id)})`);
      else add(`r.view(${q(p.physics)}, name=${q(p.name)}, id=${q(p.id)})`);
      if (p.legend) {
        const kw: string[] = [];
        if (p.legend.x !== undefined && p.legend.y !== undefined) kw.push(`legend=(${n(p.legend.x)}, ${n(p.legend.y)}, ${n(p.legend.s ?? 1)}${p.legend.h !== undefined ? `, ${n(p.legend.h)}` : ''})`);
        else if (p.legend.h !== undefined) kw.push(`legend_h=${n(p.legend.h)}`);
        if (p.legend.bg !== undefined) kw.push(`legend_bg=${q(p.legend.bg)}`);
        if (kw.length) add(`r.show(${q(p.id)}, ${kw.join(', ')})`);
      }
      continue;
    }
    if (p.kind === 'table') {
      add(`r.table(${q(p.physics)}, name=${q(p.name)}, id=${q(p.id)})`);
      continue;
    }
    if (p.kind === 'post' && p.item && p.view) {
      add(`r.item(${q(p.view)}, ${q(p.item)}, name=${q(p.name)}, id=${q(p.id)})`);
      const kw: string[] = [];
      if (p.varName) kw.push(`var_name=${q(p.varName)}`);
      if (p.outputs) kw.push(`outputs=[${p.outputs.map((o) => `(${q(o.q)}, ${q(o.name)})`).join(', ')}]`);
      if (p.expr) kw.push(`expr=${q(p.expr)}`);
      if (p.unitLabel) kw.push(`unit_label=${q(p.unitLabel)}`);
      if (p.atTime !== undefined) kw.push(`at_time=${p.atTime}`);
      if (p.curve) kw.push(`curve=${q(p.curve)}`);
      if (p.regions?.length) {
        const pts = p.regions.map((k) => findRegion(arr, k)).filter((r) => r).map((r) => xy(r!.label));
        kw.push(`regions=[${pts.join(', ')}]`);
      }
      if (kw.length) add(`r.show(${q(p.id)}, ${kw.join(', ')})`);
      continue;
    }
    if (p.kind !== 'post' || !p.view || !p.plot) continue;
    add(`r.plot(${q(p.view)}, ${q(p.plot)}, quantity=${q(p.quantity ?? 'b')}, name=${q(p.name)}, id=${q(p.id)})`);
    const kw: string[] = [];
    if (p.hidden) kw.push('visible=False');
    if (p.component) kw.push(`component=${q(p.component)}`);
    if (p.nLines !== undefined) kw.push(`n_lines=${p.nLines}`);
    if (p.range) kw.push(`range=(${n(p.range[0])}, ${n(p.range[1])})`);
    if (p.spacing !== undefined) kw.push(`spacing=${n(p.spacing)}`);
    if (p.scale !== undefined) kw.push(`scale=${n(p.scale)}`);
    if (p.curve) kw.push(`curve=${q(p.curve)}`);
    if (p.color) kw.push(`color=${q(p.color)}`);
    if (p.colorByValue) kw.push('color_by_value=True');
    if (p.colormap) kw.push(`colormap=${q(p.colormap)}`);
    if (kw.length) add(`r.show(${q(p.id)}, ${kw.join(', ')})`);
  }

  // Circuitos externos (esquemáticos): componentes e fios com os mesmos ids.
  for (const node of sk.nodes) {
    if (node.kind !== 'schematic') continue;
    add(`\n# Circuito externo: ${node.name}`);
    add(`c.add(name=${q(node.name)}, id=${q(node.id)}, empty=True)`);
    for (const p of node.parts) {
      const kw = [`id=${q(p.id)}`, `name=${q(p.name)}`, `x=${n(p.x)}`, `y=${n(p.y)}`, `rot=${p.rot}`];
      for (const k of ['value', 'amp', 'freq', 'phase', 'dc', 'circuit'] as const) if (p[k] !== undefined) kw.push(`${k}=${q(p[k]!)}`);
      add(`c.part(${q(node.id)}, ${q(p.kind)}, ${kw.join(', ')})`);
    }
    for (const w of node.wires) add(`c.wire(${q(node.id)}, (${q(w.a.part)}, ${w.a.pin}), (${q(w.b.part)}, ${w.b.pin}), id=${q(w.id)}${w.mid !== undefined ? `, mid=${n(w.mid)}` : ''}${w.midY !== undefined ? `, mid_y=${n(w.midY)}` : ''})`);
  }

  add('\n# Contador de ids (para novos itens seguirem a mesma numeração do original)');
  add(`g.next_id(${sk.nextId})`);
  add('\n# Para calcular: m.generate() e s.solve()');
  return L.join('\n') + '\n';
}

/** Comando que recria um material (com id), usado no script e na importação do FEMM. */
export function materialLine(m: Material): string {
  const kw = [`id=${q(m.id)}`, `group=${q(m.group ?? 'custom')}`, `color=${q(m.color)}`, `mur=${n(m.mur)}`, `sigma=${n(m.sigma)}`];
  if (m.br) kw.push(`br=${n(m.br)}`);
  if (m.bh) kw.push(`bh=[${m.bh.map((p) => `(${n(p[0])}, ${n(p[1])})`).join(', ')}]`);
  return `m.material(${q(m.name)}, ${kw.join(', ')})`;
}

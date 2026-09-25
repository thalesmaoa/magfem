import { beforeAll, describe, expect, test } from 'vitest';
import { setLang } from '../i18n';
import { CommandConsole } from './console';
import { SketchDoc } from './doc';
import { addBoundaryDef, addCircuit, assignBoundary, assignRegion, regionKey } from './mesh';
import { offsetCurves } from './offset';
import { Draft } from './ops';
import { computeArrangement } from './regions';
import { generateScript } from './script';
import { initSolver, solve } from './solver';
import { addPlot, addView } from './tree';
import { emptySketch, ORIGIN_ID, type Sketch } from './types';

beforeAll(async () => {
  setLang('pt');
  await initSolver();
});

/** Modelo de exemplo: retângulo com cotas (uma por variável), offset, círculo, materiais, circuito, contorno, regiões, vistas. */
function model(): Sketch {
  const d = new Draft(emptySketch());
  const p = [ORIGIN_ID, d.addPoint(40, 0), d.addPoint(40, 20), d.addPoint(0, 20)];
  const rect = [d.addLine(p[0], p[1]), d.addLine(p[1], p[2]), d.addLine(p[2], p[3]), d.addLine(p[3], p[0])];
  d.addConstraint('horizontal', [rect[0]]);
  d.addConstraint('vertical', [rect[1]]);
  d.addConstraint('horizontal', [rect[2]]);
  d.addConstraint('vertical', [rect[3]]);
  d.addConstraint('distance', [rect[0]], { value: 40, expr: 'W', label: { x: 0, y: -6 } });
  d.addConstraint('distance', [rect[1]], { value: 20 });
  const c = d.addCircle(d.addPoint(20, 10), 4);
  d.addConstraint('radius', [c], { value: 4 });
  d.sk.entities[c] = { ...d.sk.entities[c], name: 'Furo' } as never;
  let sk: Sketch = { ...d.sk, variables: [{ name: 'W', expr: '40 mm' }] };
  sk = solve(sk).sketch;
  sk = solve(offsetCurves(sk, rect, 5).sketch).sketch;
  const arr = computeArrangement(sk);
  const ring = arr.regions.find((r) => r.holes.length === 1 && Math.abs(r.area - (800 - Math.PI * 16)) < 1)!;
  const hole = arr.regions.find((r) => Math.abs(r.area - Math.PI * 16) < 1e-6)!;
  const circ = addCircuit(sk, 'Bobina', '12');
  sk = circ.sketch;
  sk = assignRegion(sk, arr, regionKey(ring), { material: 'mat_1010', name: 'Núcleo', labelOffset: { x: 3, y: 4 } });
  sk = assignRegion(sk, arr, regionKey(hole), { material: 'mat_cu', circuit: circ.circuit.id, turns: -50, meshSize: '1 mm' });
  const b = addBoundaryDef(sk, 'neumann', 'Lado');
  sk = assignBoundary(b.sketch, [c], b.boundary.id);
  sk = { ...sk, materials: sk.materials.map((m) => (m.id === 'mat_cu' ? { ...m, color: '#aa5500' } : m)), settings: { ...sk.settings, unit: 'cm', depth: '50 mm' } };
  const phys = sk.nodes.find((n) => n.kind === 'physics')!;
  const v1 = addView(sk, phys.id);
  const pl = addPlot(v1.sketch, v1.node.id, 'surface', 'Superfície: B', 'b');
  const v2 = addView(pl.sketch, phys.id, undefined, 4);
  const p2 = addPlot(v2.sketch, v2.node.id, 'contour', 'Contorno: A', 'a');
  sk = { ...p2.sketch, nodes: p2.sketch.nodes.map((n) => (n.id === p2.node.id ? { ...n, nLines: 33, color: '#112233' } : n)) };
  return sk;
}

const strip = (sk: Sketch) => {
  const round = (v: unknown): unknown =>
    typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : Array.isArray(v) ? v.map(round) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort().map(([k, x]) => [k, round(x)])) : v;
  // A semente da região é recalculada (ponto interno atual); a identidade é pelas curvas.
  return round({ ...sk, regionAssigns: sk.regionAssigns.map(({ seed: _s, ...a }) => a) });
};

describe('exportar código', () => {
  test('o script recria o modelo idêntico (mesmos ids, restrições, grupos, bibliotecas, árvore)', () => {
    const original = model();
    const script = generateScript(original);
    const doc = new SketchDoc();
    const con = new CommandConsole({ doc });
    for (const line of script.split('\n')) {
      if (!line.trim() || line.trim().startsWith('#')) continue;
      const r = con.run(line);
      if (!r.ok) throw new Error(`${line}\n→ ${r.out}`);
    }
    const a = strip(doc.sketch) as Record<string, unknown>, b = strip(original) as Record<string, unknown>;
    expect(a).toEqual(b);
  });
});

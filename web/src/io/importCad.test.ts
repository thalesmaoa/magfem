import { describe, expect, it } from 'vitest';
import { addShapes, parseDXF } from './importCad';
import { toDXF } from './export';
import { emptySketch } from '../cad/types';
import { computeArrangement } from '../cad/regions';

const dxf = (body: string[], units = 4) =>
  ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', String(units), '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES', ...body, '0', 'ENDSEC', '0', 'EOF'].join('\n');

describe('importar DXF', () => {
  it('LINE, ARC, CIRCLE e LWPOLYLINE com bulge; unidades em cm', () => {
    const text = dxf(
      [
        '0', 'LINE', '8', '0', '10', '0', '20', '0', '11', '2', '21', '0',
        '0', 'ARC', '8', '0', '10', '0', '20', '0', '40', '1', '50', '0', '51', '90',
        '0', 'CIRCLE', '8', '0', '10', '5', '20', '5', '40', '0.5',
        // Quadrado 1×1 com o último lado em semicírculo (bulge 1), fechado.
        '0', 'LWPOLYLINE', '8', '0', '90', '4', '70', '1', '10', '10', '20', '0', '10', '11', '20', '0', '10', '11', '20', '1', '10', '10', '20', '1', '42', '1',
        '0', 'SPLINE', '8', '0',
      ],
      5,
    );
    const imp = parseDXF(text);
    expect(imp.skipped).toEqual({ SPLINE: 1 });
    const line = imp.shapes[0];
    expect(line).toEqual({ kind: 'line', a: { x: 0, y: 0 }, b: { x: 20, y: 0 } }); // cm → mm
    const arc = imp.shapes[1] as any;
    expect(arc.r).toBeCloseTo(10);
    expect(arc.a1).toBeCloseTo(Math.PI / 2);
    expect((imp.shapes[2] as any).r).toBeCloseTo(5);
    // Polilinha: 3 linhas + 1 arco (bulge 1 = semicírculo de raio 5 mm).
    const poly = imp.shapes.slice(3);
    expect(poly.map((s) => s.kind)).toEqual(['line', 'line', 'line', 'arc']);
    expect((poly[3] as any).r).toBeCloseTo(5);
    // No desenho: pontos coincidentes unidos → a polilinha fecha uma região.
    const { sketch, counts } = addShapes(emptySketch(), imp.shapes);
    expect(counts).toEqual({ lines: 4, arcs: 2, circles: 1 });
    expect(computeArrangement(sketch).regions.length).toBeGreaterThanOrEqual(2);
  });

  it('ida e volta: exportar DXF e importar recria as curvas', () => {
    const base = addShapes(emptySketch(), [
      { kind: 'line', a: { x: 0, y: 0 }, b: { x: 40, y: 0 } },
      { kind: 'line', a: { x: 40, y: 0 }, b: { x: 40, y: 20 } },
      { kind: 'arc', c: { x: 20, y: 20 }, r: 20, a0: 0, a1: Math.PI },
      { kind: 'line', a: { x: 0, y: 20 }, b: { x: 0, y: 0 } },
      { kind: 'circle', c: { x: 20, y: 10 }, r: 4 },
    ]).sketch;
    const back = addShapes(emptySketch(), parseDXF(toDXF(base)).shapes);
    expect(back.counts).toEqual({ lines: 3, arcs: 1, circles: 1 });
    expect(computeArrangement(back.sketch).regions.length).toBe(computeArrangement(base).regions.length);
  });
});

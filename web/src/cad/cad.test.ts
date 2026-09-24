import { beforeAll, describe, expect, test } from 'vitest';
import { SketchDoc } from './doc';
import { dist, pt } from './geometry';
import { measure } from './measure';
import { constraintsFor, deleteItems, Draft } from './ops';
import { initSolver, solve } from './solver';
import { emptySketch, ORIGIN_ID, type Sketch } from './types';

beforeAll(async () => {
  await initSolver();
});

/** Retângulo com canto na origem, lados H/V. */
function rect(w: number, h: number) {
  const d = new Draft(emptySketch());
  const a = ORIGIN_ID;
  const b = d.addPoint(w + 1, 0.3);
  const c = d.addPoint(w - 0.5, h + 0.7);
  const e = d.addPoint(0.2, h);
  const l1 = d.addLine(a, b);
  const l2 = d.addLine(b, c);
  const l3 = d.addLine(c, e);
  const l4 = d.addLine(e, a);
  d.addConstraint('horizontal', [l1]);
  d.addConstraint('vertical', [l2]);
  d.addConstraint('horizontal', [l3]);
  d.addConstraint('vertical', [l4]);
  return { d, pts: { a, b, c, e }, lines: { l1, l2, l3, l4 } };
}

describe('solver', () => {
  test('retângulo cotado fica totalmente definido', () => {
    const { d, pts, lines } = rect(40, 20);
    d.addConstraint('distance', [lines.l1], { value: 40 });
    d.addConstraint('distance', [lines.l2], { value: 20 });
    const r = solve(d.sk);
    expect(r.ok).toBe(true);
    expect(r.dof).toBe(0);
    const c = pt(r.sketch, pts.c);
    expect(c.x).toBeCloseTo(40, 8);
    expect(c.y).toBeCloseTo(20, 8);
  });

  test('restrição conflitante é detectada', () => {
    const { d, lines } = rect(40, 20);
    d.addConstraint('parallel', [lines.l1, lines.l2]);
    const doc = new SketchDoc();
    expect(doc.commit(d.sk, []).ok).toBe(false);
  });

  test('cotas horizontal/vertical e ângulo', () => {
    const d = new Draft(emptySketch());
    const p = d.addPoint(10, 5);
    const l = d.addLine(ORIGIN_ID, p);
    const q = d.addPoint(3, 0);
    const lh = d.addLine(ORIGIN_ID, q);
    d.addConstraint('horizontal', [lh]);
    d.addConstraint('distance', [lh], { value: 10 });
    d.addConstraint('hdistance', [ORIGIN_ID, p], { value: 30 });
    d.addConstraint('angle', [lh, l], { value: 30 });
    const r = solve(d.sk);
    expect(r.ok).toBe(true);
    const P = pt(r.sketch, p);
    expect(P.x).toBeCloseTo(30, 6);
    expect(P.y).toBeCloseTo(30 * Math.tan(Math.PI / 6), 6);
    expect(measure(r.sketch, r.sketch.constraints[3])).toBeCloseTo(30, 6);
  });

  test('arco tangente a duas linhas com raio', () => {
    const d = new Draft(emptySketch());
    const a = d.addPoint(0, 10);
    const s = d.addPoint(10, 10);
    const c = d.addPoint(10, 5);
    const e = d.addPoint(15, 5);
    const f = d.addPoint(15, -10);
    const l1 = d.addLine(a, s);
    const arc = d.addArc(c, e, s, 5); // anti-horário de e (0°) até s (90°)
    const l2 = d.addLine(e, f);
    d.addConstraint('horizontal', [l1]);
    d.addConstraint('vertical', [l2]);
    d.addConstraint('tangent', [l1, arc]);
    d.addConstraint('tangent', [l2, arc]);
    d.addConstraint('radius', [arc], { value: 8 });
    const r = solve(d.sk);
    expect(r.ok).toBe(true);
    const sk = r.sketch;
    expect(dist(pt(sk, c), pt(sk, s))).toBeCloseTo(8, 6);
    expect(dist(pt(sk, c), pt(sk, e))).toBeCloseTo(8, 6);
  });

  test('arraste com restrição temporária move o ponto livre', () => {
    const d = new Draft(emptySketch());
    const p = d.addPoint(5, 5);
    d.addLine(ORIGIN_ID, p);
    const r = solve(d.sk, [{ pointId: p, x: 12, y: -3 }]);
    expect(r.ok).toBe(true);
    expect(pt(r.sketch, p).x).toBeCloseTo(12, 4);
    expect(pt(r.sketch, ORIGIN_ID).x).toBe(0);
  });
});

describe('ops', () => {
  test('apagar linha remove pontos órfãos e restrições dependentes', () => {
    const { d, lines, pts } = rect(10, 5);
    const sk = deleteItems(d.sk, [lines.l2]);
    expect(sk.entities[lines.l2]).toBeUndefined();
    expect(sk.entities[pts.b]).toBeDefined(); // ainda usado por l1
    expect(sk.constraints.some((c) => c.refs.includes(lines.l2))).toBe(false);
    const sk2 = deleteItems(sk, [lines.l1]);
    expect(sk2.entities[pts.b]).toBeUndefined(); // ficou órfão
    expect(sk2.entities[ORIGIN_ID]).toBeDefined();
  });

  test('coincidente entre ponto e curva vira "ponto sobre"', () => {
    const { d, lines } = rect(10, 5);
    const p = d.addPoint(3, 3, true);
    expect(constraintsFor(d.sk, 'coincident', [p, lines.l1])).toEqual([{ type: 'pointOn', refs: [p, lines.l1] }]);
    expect(constraintsFor(d.sk, 'perpendicular', [p, lines.l1])).toEqual([]);
  });
});

describe('doc', () => {
  test('commit rejeita redundância e desfazer volta ao estado anterior', () => {
    const doc = new SketchDoc();
    const { d, lines } = rect(10, 5);
    expect(doc.commit(d.sk, []).ok).toBe(true);
    const before: Sketch = doc.sketch;
    const d2 = new Draft(before);
    d2.addConstraint('horizontal', [lines.l1]);
    const res = doc.commit(d2.sk, []);
    expect(res.ok).toBe(false);
    expect(doc.sketch).toBe(before);
    doc.undo();
    expect(Object.keys(doc.sketch.entities)).toEqual([ORIGIN_ID]);
  });
});

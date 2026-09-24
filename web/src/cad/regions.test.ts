import { beforeAll, describe, expect, test } from 'vitest';
import { setLang } from '../i18n';
import { Draft } from './ops';
import { computeArrangement, findRegion, regionAt } from './regions';
import { initSolver } from './solver';
import { emptySketch, type Sketch } from './types';

beforeAll(async () => {
  setLang('pt');
  await initSolver();
});

function rect(d: Draft, x0: number, y0: number, x1: number, y1: number) {
  const p = [d.addPoint(x0, y0), d.addPoint(x1, y0), d.addPoint(x1, y1), d.addPoint(x0, y1)];
  return [d.addLine(p[0], p[1]), d.addLine(p[1], p[2]), d.addLine(p[2], p[3]), d.addLine(p[3], p[0])];
}
const areas = (sk: Sketch) =>
  computeArrangement(sk)
    .regions.map((r) => Math.round(r.area * 1e6) / 1e6)
    .sort((a, b) => a - b);

describe('regiões', () => {
  test('borda externa: só as curvas de fora (o círculo interno e a linha divisória não)', () => {
    const d = new Draft(emptySketch());
    const r = rect(d, 0, 0, 40, 20);
    const c = d.addCircle(d.addPoint(10, 10), 3);
    const mid = d.addLine(d.addPoint(20, 0), d.addPoint(20, 20));
    const outer = computeArrangement(d.sk).outer;
    expect(outer.sort()).toEqual([...r].sort());
    expect(outer).not.toContain(c);
    expect(outer).not.toContain(mid);
  });
  test('retângulo sozinho: 1 região com a área certa', () => {
    const d = new Draft(emptySketch());
    rect(d, 0, 0, 40, 20);
    expect(areas(d.sk)).toEqual([800]);
  });
  test('círculo dentro do retângulo: anel (com furo) + disco', () => {
    const d = new Draft(emptySketch());
    rect(d, 0, 0, 40, 20);
    d.addCircle(d.addPoint(20, 10), 5);
    const a = areas(d.sk);
    expect(a).toHaveLength(2);
    expect(a[0]).toBeCloseTo(Math.PI * 25, 5); // disco (área exata)
    expect(a[1]).toBeCloseTo(800 - Math.PI * 25, 5);
    const arr = computeArrangement(d.sk);
    const ring = arr.regions.find((r) => r.holes.length === 1)!;
    expect(ring).toBeTruthy();
    // O rótulo do anel fica fora do furo.
    expect(regionAt(arr, ring.label)).toBe(ring);
  });
  test('dois retângulos sobrepostos: 3 regiões', () => {
    const d = new Draft(emptySketch());
    rect(d, 0, 0, 20, 20);
    rect(d, 10, 10, 30, 30);
    expect(areas(d.sk)).toEqual([100, 300, 300]);
  });
  test('linha atravessando o retângulo divide em 2', () => {
    const d = new Draft(emptySketch());
    rect(d, 0, 0, 40, 20);
    d.addLine(d.addPoint(10, -5), d.addPoint(10, 25));
    expect(areas(d.sk)).toEqual([200, 600]);
  });
  test('anel de dois círculos concêntricos e "D" (linha + arco)', () => {
    const d = new Draft(emptySketch());
    const c = d.addPoint(0, 0);
    d.addCircle(c, 10);
    d.addCircle(c, 20);
    const q1 = d.addPoint(100, -10);
    const q2 = d.addPoint(100, 10);
    d.addLine(q2, q1);
    d.addArc(d.addPoint(100, 0), q1, q2, 10);
    const a = areas(d.sk);
    expect(a).toHaveLength(3);
    expect(a[0]).toBeCloseTo((Math.PI * 100) / 2, 5); // D
    expect(a[1]).toBeCloseTo(Math.PI * 100, 5); // disco interno
    expect(a[2]).toBeCloseTo(Math.PI * 300, 5); // anel
  });
  test('linha solta (sem fechar) não cria região; construção é ignorada', () => {
    const d = new Draft(emptySketch());
    rect(d, 0, 0, 10, 10);
    d.addLine(d.addPoint(2, 2), d.addPoint(8, 8)); // dentro, solta
    const cons = d.addLine(d.addPoint(-5, 5), d.addPoint(15, 5), true); // construção atravessando
    void cons;
    expect(areas(d.sk)).toEqual([100]);
  });
  test('identidade: a região é reencontrada pelas curvas depois de mudar de tamanho', () => {
    const d = new Draft(emptySketch());
    const ls = rect(d, 0, 0, 40, 20);
    const arr = computeArrangement(d.sk);
    const key = { curves: arr.regions[0].curves, seed: arr.regions[0].label };
    // Aumenta o retângulo (move os cantos da direita).
    const sk2 = { ...d.sk, entities: { ...d.sk.entities } };
    for (const id of Object.keys(sk2.entities)) {
      const e = sk2.entities[id];
      if (e.type === 'point' && e.x === 40) sk2.entities[id] = { ...e, x: 400 };
    }
    const r2 = findRegion(computeArrangement(sk2), key)!;
    expect(r2.area).toBeCloseTo(8000, 6);
    expect(r2.curves).toEqual([...ls].sort());
  });
});

import { describe, expect, it } from 'vitest';
import { solveThermalProblem, type ThermalEdgeBC } from './thermal';

/** Malha retangular estruturada (mm): nx × ny quadrados divididos em 2 triângulos. */
function grid(x0: number, x1: number, y0: number, y1: number, nx: number, ny: number) {
  const xy: number[] = [], tri: number[] = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) xy.push(x0 + ((x1 - x0) * i) / nx, y0 + ((y1 - y0) * j) / ny);
  const id = (i: number, j: number) => j * (nx + 1) + i;
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      tri.push(id(i, j), id(i + 1, j), id(i + 1, j + 1));
      tri.push(id(i, j), id(i + 1, j + 1), id(i, j + 1));
    }
  const edge = (side: 'left' | 'right' | 'bottom' | 'top') => {
    const out: [number, number][] = [];
    if (side === 'left' || side === 'right') for (let j = 0; j < ny; j++) out.push([id(side === 'left' ? 0 : nx, j), id(side === 'left' ? 0 : nx, j + 1)]);
    else for (let i = 0; i < nx; i++) out.push([id(i, side === 'bottom' ? 0 : ny), id(i + 1, side === 'bottom' ? 0 : ny)]);
    return out;
  };
  return { xy, tri, edge, id };
}

describe('condução de calor em regime', () => {
  it('placa com geração interna e convecção nos dois lados: T(x) parabólica', () => {
    // Espessura L = 20 mm em x, geração q, k, convecção h nos dois lados; bordas em y isoladas.
    const L = 0.02, q = 1e6, k = 20, h = 50, Tamb = 25;
    const g = grid(0, 20, 0, 5, 40, 4);
    const nt = g.tri.length / 3;
    const edges: ThermalEdgeBC[] = [...g.edge('left'), ...g.edge('right')].map(([a, b]) => ({ a, b, kind: 'convection', h, tRef: Tamb }));
    const r = solveThermalProblem({ xy: g.xy, triangles: g.tri, k: new Array(nt).fill(k), q: new Array(nt).fill(q), axisymmetric: false, depth: 1, edges, channels: [] });
    const exact = (x: number) => Tamb + (q * L) / (2 * h) + (q / (2 * k)) * (x * (L - x));
    for (const i of [0, 10, 20, 30, 40]) expect(r.T[g.id(i, 2)]).toBeCloseTo(exact((L * i) / 40), 1);
    // Balanço: tudo o que é gerado sai pela convecção.
    expect(Math.abs(r.pOut - r.pIn) / r.pIn).toBeLessThan(1e-6);
  });

  it('cilindro axissimétrico com geração e convecção no raio externo', () => {
    const R = 0.01, q = 2e6, k = 50, h = 100, Tamb = 20;
    const g = grid(0, 10, 0, 4, 40, 4);
    const nt = g.tri.length / 3;
    const edges: ThermalEdgeBC[] = g.edge('right').map(([a, b]) => ({ a, b, kind: 'convection', h, tRef: Tamb }));
    const r = solveThermalProblem({ xy: g.xy, triangles: g.tri, k: new Array(nt).fill(k), q: new Array(nt).fill(q), axisymmetric: true, depth: 1, edges, channels: [] });
    const exact = (rr: number) => Tamb + (q * R) / (2 * h) + (q * (R * R - rr * rr)) / (4 * k);
    for (const i of [0, 20, 40]) expect(r.T[g.id(i, 2)]).toBeCloseTo(exact((R * i) / 40), 1);
    expect(Math.abs(r.pOut - r.pIn) / r.pIn).toBeLessThan(1e-6);
  });

  it('faces da frente e de trás (plano) e temperatura fixa', () => {
    // Placa fina com geração uniforme, só as faces resfriam: T = T_amb + q·profundidade/(2h).
    const q = 1e5, h = 20, depth = 0.01, Tamb = 30;
    const g = grid(0, 50, 0, 50, 10, 10);
    const nt = g.tri.length / 3;
    const r = solveThermalProblem({ xy: g.xy, triangles: g.tri, k: new Array(nt).fill(10), q: new Array(nt).fill(q), axisymmetric: false, depth, faces: { h, t: Tamb }, edges: [], channels: [] });
    expect(r.T[g.id(5, 5)]).toBeCloseTo(Tamb + (q * depth) / (2 * h), 6);
    // Temperatura fixa numa borda, sem geração: tudo na temperatura fixa.
    const e2: ThermalEdgeBC[] = g.edge('left').map(([a, b]) => ({ a, b, kind: 'temperature', t: 80 }));
    const r2 = solveThermalProblem({ xy: g.xy, triangles: g.tri, k: new Array(nt).fill(10), q: new Array(nt).fill(0), axisymmetric: false, depth: 1, edges: e2, channels: [] });
    expect(r2.T[g.id(10, 5)]).toBeCloseTo(80, 6);
  });

  it('canal de ar (ventilador): o ar leva o calor gerado, T_saída = T_entrada + P/(ρ·c_p·Q)', () => {
    const q = 5e5, k = 200, h = 80, depth = 0.1, flow = 0.01, tIn = 25;
    const g = grid(0, 20, 0, 10, 20, 10);
    const nt = g.tri.length / 3;
    const edges: ThermalEdgeBC[] = [...g.edge('top'), ...g.edge('bottom')].map(([a, b]) => ({ a, b, kind: 'convection', h, channel: 0 }));
    const r = solveThermalProblem({ xy: g.xy, triangles: g.tri, k: new Array(nt).fill(k), q: new Array(nt).fill(q), axisymmetric: false, depth, edges, channels: [{ flow, tIn }] });
    const P = q * 0.02 * 0.01 * depth;
    expect(r.channels[0].power / P).toBeCloseTo(1, 4);
    expect(r.channels[0].tOut).toBeCloseTo(tIn + P / (1.2 * 1005 * flow), 3);
    expect(r.channels[0].tAir).toBeCloseTo((tIn + r.channels[0].tOut) / 2, 3);
    // Menos vazão → ar mais quente → peça mais quente.
    const r2 = solveThermalProblem({ xy: g.xy, triangles: g.tri, k: new Array(nt).fill(k), q: new Array(nt).fill(q), axisymmetric: false, depth, edges, channels: [{ flow: flow / 10, tIn }] });
    // O problema é linear: a peça toda sobe exatamente o quanto subiu o ar médio.
    const dT = Math.max(...r2.T.filter(Number.isFinite)) - Math.max(...r.T.filter(Number.isFinite));
    expect(dT).toBeCloseTo(r2.channels[0].tAir - r.channels[0].tAir, 2);
    expect(dT).toBeGreaterThan(3);
  });
});

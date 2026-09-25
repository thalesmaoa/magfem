import { describe, expect, test } from 'vitest';
import type { MeshResult } from './meshgen';
import { MU0, probe, probeSmooth, smoothSolution, type Solution } from './solve';

/** Malha estruturada n×n em [0, L]² (mm) com A(x, y) dado nos nós. */
function gridSolution(n: number, L: number, f: (x: number, y: number) => number): Solution {
  const xy: number[] = [];
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) xy.push((L * i) / n, (L * j) / n);
  const tri: number[] = [];
  const id = (i: number, j: number) => j * (n + 1) + i;
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      tri.push(id(i, j), id(i + 1, j), id(i + 1, j + 1));
      tri.push(id(i, j), id(i + 1, j + 1), id(i, j + 1));
    }
  const A = new Float64Array((n + 1) * (n + 1));
  for (let k = 0; k < A.length; k++) A[k] = f(xy[2 * k], xy[2 * k + 1]);
  const nt = tri.length / 3;
  const mesh: MeshResult = { xy: new Float64Array(xy), triangles: new Int32Array(tri), triRegion: new Int32Array(nt), nodes: A.length, elements: nt, minAngle: 45, key: '', ms: 0, curveNodes: {} };
  const z = new Float64Array(nt);
  return { A, bx: z, by: z, bmag: z, bmax: 0, energy: 0, axisymmetric: false, mesh, nu: [1 / MU0], brx: [0], bry: [0], J: [0], meshSize: L / n, ms: 0 };
}

describe('interpolação de alta ordem (suavizar)', () => {
  // A quadrático (como na faixa com corrente): o interpolante de 2º grau deve quase reproduzi-lo.
  const f = (x: number, y: number) => 1e-3 * (x * (40 - x) + 0.5 * y * y);
  const sol = gridSolution(8, 40, f);

  test('valores refinados muito mais próximos do exato que a interpolação linear', () => {
    let errLin = 0, errQ = 0;
    for (const p of [
      { x: 7.3, y: 11.1 },
      { x: 19.9, y: 23.4 },
      { x: 31.2, y: 6.7 },
      { x: 12.5, y: 33.3 },
    ]) {
      const exact = f(p.x, p.y);
      errLin = Math.max(errLin, Math.abs(probe(sol, p)!.A - exact));
      errQ = Math.max(errQ, Math.abs(probeSmooth(sol, p)!.A - exact));
    }
    expect(errQ).toBeLessThan(errLin / 4);
  });

  test('B do interpolante segue o gradiente exato (B = (∂A/∂y, −∂A/∂x), mm → m)', () => {
    const p = { x: 20.3, y: 20.1 };
    const pr = probeSmooth(sol, p)!;
    const dAdx = 1e-3 * (40 - 2 * p.x), dAdy = 1e-3 * p.y;
    expect(pr.bx).toBeCloseTo(dAdy * 1e3, 2);
    expect(pr.by).toBeCloseTo(-dAdx * 1e3, 2);
  });

  test('subdivisão: level² subtriângulos por triângulo e A contínuo nas arestas compartilhadas', () => {
    const s3 = smoothSolution(sol, 3);
    expect(s3.mesh.elements).toBe(sol.mesh.elements * 9);
    // Mesmo ponto (sobre aresta compartilhada) em triângulos vizinhos → mesmo valor.
    const seen = new Map<string, number>();
    let maxJump = 0;
    for (let i = 0; i < s3.A.length; i++) {
      const k = `${s3.mesh.xy[2 * i].toFixed(6)},${s3.mesh.xy[2 * i + 1].toFixed(6)}`;
      const prev = seen.get(k);
      if (prev === undefined) seen.set(k, s3.A[i]);
      else maxJump = Math.max(maxJump, Math.abs(prev - s3.A[i]));
    }
    expect(maxJump).toBeLessThan(1e-12);
  });
});

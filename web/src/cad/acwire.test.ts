import { describe, expect, it } from 'vitest';
import { proximityLossFoil, proximityLossRound, skinDepth, skinFactorFoil, skinFactorRound } from './acwire';

const MU0 = 4e-7 * Math.PI;
const sigma = 58e6;

describe('efeito pelicular e de proximidade', () => {
  it('δ do cobre a 50 Hz ≈ 9,3 mm', () => {
    expect(skinDepth(50, sigma) * 1e3).toBeCloseTo(9.35, 1);
  });
  it('pelicular, fio redondo: baixa frequência 1 + x⁴/48 e alta frequência x/2 + 1/4', () => {
    for (const x of [0.1, 0.3, 0.5]) expect(skinFactorRound(x, 1)).toBeCloseTo(1 + x ** 4 / 48, 5);
    // Continuidade entre a série exata e a assintótica.
    expect(Math.abs(skinFactorRound(7.999, 1) - skinFactorRound(8.001, 1))).toBeLessThan(2e-3);
    expect(skinFactorRound(20, 1)).toBeCloseTo(10 + 0.25 + 3 / 640, 9);
    // Valor tabelado: a/δ = 2 → R_ac/R_cc ≈ 1,26.
    expect(skinFactorRound(2, 1)).toBeCloseTo(1.263, 2);
  });
  it('proximidade, fio redondo: π·σ·ω²·B²·a⁴/8 em baixa frequência e continuidade com o assintótico', () => {
    const f = 50, d = skinDepth(f, sigma), a = 0.05 * d, B = 0.1, w = 2 * Math.PI * f;
    const low = (Math.PI * sigma * w * w * B * B * a ** 4) / 8;
    expect(proximityLossRound(a, d, sigma, B) / low).toBeCloseTo(1, 3);
    const p1 = proximityLossRound(7.999 * d, d, sigma, B), p2 = proximityLossRound(8.001 * d, d, sigma, B);
    expect(Math.abs(p1 - p2) / p2).toBeLessThan(1e-3);
  });
  it('lâmina (Dowell): limites de baixa frequência e fator pelicular', () => {
    const f = 1000, d = skinDepth(f, sigma), t = 0.02 * d, B = 0.05, w = 2 * Math.PI * f;
    expect(proximityLossFoil(t, d, sigma, B) / ((sigma * w * w * B * B * t ** 3) / 24)).toBeCloseTo(1, 3);
    expect(skinFactorFoil(0.1 * d, d)).toBeCloseTo(1, 4);
    expect(skinFactorFoil(40 * d, d)).toBeCloseTo(20, 6);
    void MU0;
  });
});

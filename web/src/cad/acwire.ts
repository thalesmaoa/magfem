// Efeito pelicular e de proximidade em fios de bobina (análise harmônica), por fórmulas analíticas clássicas:
// condutor redondo (Bessel) e lâmina/retangular (Dowell). O campo local vem do FEM; as correntes parasitas nos fios
// não realimentam o campo (válido para bobinas de fio fino em relação à profundidade de penetração).

const MU0 = 4e-7 * Math.PI;

/** Profundidade de penetração δ = √(2/(ω·μ0·σ)) (m). */
export const skinDepth = (freq: number, sigma: number) => Math.sqrt(2 / (2 * Math.PI * freq * MU0 * sigma));

type C = [number, number];
const cmul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cdiv = (a: C, b: C): C => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};

/** J0 e J1 de argumento complexo pela série (usada só para |z| ≤ ~12, onde a série é precisa em double). */
function besselJ01(z: C): [C, C] {
  const z2: C = cmul(z, z);
  const q: C = [-z2[0] / 4, -z2[1] / 4];
  let t0: C = [1, 0], j0: C = [1, 0];
  let t1: C = [z[0] / 2, z[1] / 2], j1: C = [...t1];
  for (let m = 1; m < 200; m++) {
    t0 = cmul(t0, q).map((v) => v / (m * m)) as C;
    t1 = cmul(t1, q).map((v) => v / (m * (m + 1))) as C;
    j0 = [j0[0] + t0[0], j0[1] + t0[1]];
    j1 = [j1[0] + t1[0], j1[1] + t1[1]];
    if (Math.hypot(...t0) + Math.hypot(...t1) < 1e-17 * (Math.hypot(...j0) + Math.hypot(...j1))) break;
  }
  return [j0, j1];
}

/** Acima deste a/δ, as fórmulas assintóticas (erro < 1e-3 aqui). */
const X_ASYM = 8;

/**
 * Fio redondo de raio a: fator do efeito pelicular R_ac/R_cc = Re[(ka/2)·J0(ka)/J1(ka)], k = (1 − j)/δ.
 * Assintótico: a/(2δ) + 1/4 + 3δ/(32a).
 */
export function skinFactorRound(a: number, delta: number): number {
  const x = a / delta;
  if (x > X_ASYM) return x / 2 + 0.25 + 3 / (32 * x);
  const ka: C = [x, -x];
  const [j0, j1] = besselJ01(ka);
  return cmul([x / 2, -x / 2], cdiv(j0, j1))[0];
}

/**
 * Fio redondo de raio a num campo transversal uniforme de pico B̂: perda média por metro de fio (W/m),
 * P' = (π·ω²·σ/2)·|D|²·∫₀ᵃ |J1(kr)|² r dr, com D = 2·B̂/(k·J0(ka)). Baixa frequência: π·σ·ω²·B̂²·a⁴/8;
 * alta: 2π·a·H0²/(σ·δ)·(1 − δ/(2a) − δ²/(16a²)).
 */
export function proximityLossRound(a: number, delta: number, sigma: number, bpk: number): number {
  const x = a / delta;
  const w = 2 / (MU0 * sigma * delta * delta);
  // Assintótico com as correções de ordem δ/a (ajustadas à solução exata; erro < 1e-4 em a/δ = 8).
  if (x > X_ASYM) return ((2 * Math.PI * a * (bpk / MU0) ** 2) / (sigma * delta)) * (1 - 1 / (2 * x) - 1 / (16 * x * x));
  const k: C = [1 / delta, -1 / delta];
  const [j0] = besselJ01([x, -x]);
  const D = cdiv([2 * bpk, 0], cmul(k, j0));
  // ∫₀ᵃ |J1(kr)|² r dr por Simpson (a integranda é suave).
  const n = 200;
  let s = 0;
  for (let i = 0; i <= n; i++) {
    const r = (a * i) / n;
    const [, j1] = besselJ01([r / delta, -r / delta]);
    const f = (j1[0] * j1[0] + j1[1] * j1[1]) * r;
    s += (i === 0 || i === n ? 1 : i % 2 ? 4 : 2) * f;
  }
  const integral = (s * a) / (3 * n);
  return ((Math.PI * w * w * sigma) / 2) * (D[0] * D[0] + D[1] * D[1]) * integral;
}

/** Lâmina de espessura t (Dowell): fator pelicular (ξ/2)·(sinh ξ + sin ξ)/(cosh ξ − cos ξ), ξ = t/δ. */
export function skinFactorFoil(t: number, delta: number): number {
  const x = t / delta;
  if (x < 1e-3) return 1;
  if (x > 30) return x / 2;
  return ((x / 2) * (Math.sinh(x) + Math.sin(x))) / (Math.cosh(x) - Math.cos(x));
}

/**
 * Lâmina de espessura t num campo paralelo de pico B̂ igual dos dois lados: perda média por metro de fio e por metro
 * de largura (W/m²), (H0²/(σδ))·(sinh ξ − sin ξ)/(cosh ξ + cos ξ). Baixa frequência: σ·ω²·B̂²·t³/24.
 */
export function proximityLossFoil(t: number, delta: number, sigma: number, bpk: number): number {
  const x = t / delta;
  const H0 = bpk / MU0;
  if (x < 1e-3) return (sigma * (2 / (MU0 * sigma * delta * delta)) ** 2 * bpk * bpk * t ** 3) / 24;
  const g = x > 30 ? 1 : (Math.sinh(x) - Math.sin(x)) / (Math.cosh(x) + Math.cos(x));
  return ((H0 * H0) / (sigma * delta)) * g;
}

// Fio de bobina: seção (AWG, redondo ou retangular) e descrição curta.
import type { Wire } from './types';

/** Diâmetro (mm) de um fio AWG: d = 0,127·92^((36 − n)/39); 0 = "1/0", −1 = "2/0"… */
export function awgDiameter(awg: number): number {
  return 0.127 * Math.pow(92, (36 - awg) / 39);
}

/** Seção de cobre de um condutor (m²), sem contar os fios em paralelo; null se o fio está incompleto. */
export function wireArea(w: Wire): number | null {
  const d = w.kind === 'awg' ? (w.awg !== undefined ? awgDiameter(w.awg) : undefined) : w.kind === 'round' ? w.d : undefined;
  if (d !== undefined) return d > 0 ? (Math.PI * d * d * 1e-6) / 4 : null;
  if (w.kind === 'rect' && w.w && w.h && w.w > 0 && w.h > 0) return w.w * w.h * 1e-6;
  return null;
}

/** Seção total de uma espira (m²): seção do fio × fios em paralelo. */
export const turnArea = (w: Wire) => {
  const a = wireArea(w);
  return a === null ? null : a * Math.max(1, Math.round(w.parallel ?? 1));
};

export function wireLabel(w: Wire): string {
  const par = (w.parallel ?? 1) > 1 ? ` × ${w.parallel}` : '';
  if (w.kind === 'awg') return `AWG ${w.awg}${par}`;
  if (w.kind === 'round') return `⌀ ${w.d} mm${par}`;
  return `${w.w} × ${w.h} mm${par}`;
}

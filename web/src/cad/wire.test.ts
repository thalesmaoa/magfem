import { describe, expect, it } from 'vitest';
import { awgDiameter, turnArea, wireArea } from './wire';

describe('fio', () => {
  it('AWG pela fórmula padrão (tabela ASTM B258)', () => {
    expect(awgDiameter(18)).toBeCloseTo(1.024, 3);
    expect(awgDiameter(10)).toBeCloseTo(2.588, 3);
    expect(awgDiameter(36)).toBeCloseTo(0.127, 6);
    expect(awgDiameter(0)).toBeCloseTo(8.251, 3);
  });
  it('seções: redondo, retangular e fios em paralelo', () => {
    expect(wireArea({ kind: 'round', d: 2 })).toBeCloseTo(Math.PI * 1e-6, 12);
    expect(wireArea({ kind: 'rect', w: 2, h: 5 })).toBeCloseTo(10e-6, 12);
    expect(turnArea({ kind: 'rect', w: 2, h: 5, parallel: 3 })).toBeCloseTo(30e-6, 12);
    expect(wireArea({ kind: 'awg' })).toBeNull();
  });
});

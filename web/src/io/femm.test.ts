import { describe, expect, it } from 'vitest';
import { parseMatlib } from './femm';

const LIB = [
  '<BeginBlock>', '<BlockName> = "Air"', '<Mu_x> = 1', '<Sigma> = 0', '<H_c> = 0', '<BHPoints> = 0', '<EndBlock>',
  '<BeginFolder>', '<FolderName> = "Soft Magnetic Materials"',
  '<BeginBlock>', '<BlockName> = "M-19"', '<Mu_x> = 4416', '<Sigma> = 0', '<H_c> = 0', '<BHPoints> = 3', '\t0\t0', '\t1.0\t100', '\t1.5\t1000', '<EndBlock>',
  '<EndFolder>',
  '<BeginFolder>', '<FolderName> = "Hard Magnetic Materials"',
  '<BeginBlock>', '<BlockName> = "N42"', '<Mu_x> = 1.05', '<Sigma> = 0.667', '<H_c> = 1000000', '<BHPoints> = 0', '<EndBlock>',
  '<EndFolder>',
].join('\r\n');

describe('matlib.dat do FEMM', () => {
  it('converte pastas, curva B-H e ímãs', () => {
    const m = parseMatlib(LIB);
    expect(m.map((x) => x.material.name)).toEqual(['Air', 'M-19', 'N42']);
    expect(m[0].material.group).toBe('air');
    expect(m[1].path).toEqual(['Soft Magnetic Materials']);
    expect(m[1].material.group).toBe('steel');
    expect(m[1].material.bh).toEqual([[0, 0], [100, 1], [1000, 1.5]]);
    expect(m[2].material.group).toBe('magnet');
    expect(m[2].material.br).toBeCloseTo(4e-7 * Math.PI * 1.05 * 1e6, 3);
    expect(m[2].material.sigma).toBe(0.667);
  });
});

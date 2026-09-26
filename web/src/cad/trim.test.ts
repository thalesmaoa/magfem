import { describe, expect, it } from 'vitest';
import { trim, trimPiece } from './trim';
import { emptySketch, type Sketch } from './types';

/** Círculo na Origem cortado por uma linha (de construção) cujas pontas estão sobre ele. */
const base = (): Sketch =>
  ({
    ...emptySketch(),
    entities: {
      O: { id: 'O', type: 'point', x: 0, y: 0, fixed: true, free: true },
      c3: { id: 'c3', type: 'circle', c: 'O', r: 250 },
      p5: { id: 'p5', type: 'point', x: 0, y: 250 },
      p9: { id: 'p9', type: 'point', x: 0, y: -250 },
      l6: { id: 'l6', type: 'line', p1: 'p9', p2: 'p5', construction: true },
    },
    constraints: [
      { id: 'k7', type: 'pointOn', refs: ['p5', 'c3'] },
      { id: 'k8', type: 'vertical', refs: ['l6'] },
      { id: 'k10', type: 'pointOn', refs: ['p9', 'c3'] },
      { id: 'k11', type: 'pointOn', refs: ['O', 'l6'] },
    ],
  }) as unknown as Sketch;

describe('tesoura', () => {
  it('círculo cortado nas pontas de uma linha vira arco (lado esquerdo removido)', () => {
    const sk = base();
    const piece = trimPiece(sk, 'c3', { x: -250, y: 0 })!;
    expect(piece.whole).toBe(false);
    const next = trim(sk, 'c3', { x: -250, y: 0 })!;
    const arc = next.entities.c3 as any;
    expect(arc.type).toBe('arc');
    // Sobra o lado direito: do ponto de baixo ao de cima (anti-horário).
    expect(arc.s).toBe('p9');
    expect(arc.e).toBe('p5');
    // As pontas não ficam com "ponto sobre" o próprio arco (redundante: o solver recusaria).
    expect(next.constraints.some((k: any) => k.type === 'pointOn' && k.refs[1] === 'c3')).toBe(false);
  });
});

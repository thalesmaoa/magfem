import { describe, expect, it } from 'vitest';
import { parseFem } from './femmFile';
import { computeArrangement, findRegion } from '../cad/regions';

// Problema pequeno escrito para o teste: quadrado 0..10 (cm) com uma região em "D" (segmentos + arco);
// borda de baixo com A prescrito, as outras sem propriedade (no FEMM, Neumann).
const FEM = `[Format]      =  4.0
[Frequency]   =  60
[Precision]   =  1e-008
[LengthUnits] =  centimeters
[ProblemType] =  planar
[Coordinates] =  cartesian
[Depth]       =  5
[BdryProps]  = 1
  <BeginBdry>
    <BdryName> = "Chao"
    <BdryType> = 0
    <A_0> = 0.001
    <A_1> = 0
  <EndBdry>
[BlockProps]  = 2
  <BeginBlock>
    <BlockName> = "Air"
    <Mu_x> = 1
    <Sigma> = 0
    <H_c> = 0
    <BHPoints> = 0
  <EndBlock>
  <BeginBlock>
    <BlockName> = "Ferro"
    <Mu_x> = 1000
    <Sigma> = 5
    <H_c> = 0
    <BHPoints> = 3
      0	0
      1	200
      1.5	2000
  <EndBlock>
[CircuitProps]  = 1
  <BeginCircuit>
    <CircuitName> = "Bob"
    <TotalAmps_re> = 12
    <CircuitType> = 1
  <EndCircuit>
[NumPoints] = 8
0	0	0	0
10	0	0	0
10	10	0	0
0	10	0	0
3	3	0	0
5	3	0	0
5	7	0	0
3	7	0	0
[NumSegments] = 7
0	1	-1	1	0	0
1	2	-1	0	0	0
2	3	-1	0	0	0
3	0	-1	0	0	0
4	5	-1	0	0	0
6	7	-1	0	0	0
7	4	-1	0	0	0
[NumArcSegments] = 1
5	6	180	1	0	0	0
[NumHoles] = 0
[NumBlockLabels] = 2
1	1	1	-1	0	0	0	1	0
4	5	2	0.5	1	0	0	50	0
`;

describe('importar .fem do FEMM', () => {
  it('geometria, unidades, materiais, contornos, circuito e rótulos', () => {
    const r = parseFem(FEM);
    const sk = r.sketch;
    expect(sk.settings).toMatchObject({ unit: 'cm', problem: 'planar', depth: '5 cm' });
    expect(r.counts).toMatchObject({ curves: 8, materials: 2, boundaries: 1, circuits: 1, labels: 2 });
    expect(r.lostLabels).toBe(0);
    // Coordenadas em mm (cm × 10): o canto oposto do quadrado.
    expect(Object.values(sk.entities).some((e: any) => e.type === 'point' && e.x === 100 && e.y === 100)).toBe(true);
    // O arco de 180° (anti-horário de (5,3) a (5,7)) tem raio 2 cm = 20 mm.
    const arc = Object.values(sk.entities).find((e: any) => e.type === 'arc') as any;
    expect(arc.r).toBeCloseTo(20, 9);
    // Material com curva B-H ([H, B]) e σ.
    const ferro = sk.materials.find((m) => m.name === 'Ferro')!;
    expect(ferro.bh).toEqual([[0, 0], [200, 1], [2000, 1.5]]);
    expect(ferro.sigma).toBe(5);
    // Rótulo 2: dentro do "D" → Ferro, circuito Bob, 50 espiras, malha 0,5 cm.
    const arr = computeArrangement(sk);
    const dRegion = arr.regions.find((x) => Math.abs(x.area - (20 * 40 + (Math.PI * 20 * 20) / 2)) < 1)!;
    const a = sk.regionAssigns.find((x) => findRegion(arr, x) === dRegion)!;
    expect(a).toMatchObject({ material: ferro.id, turns: 50, meshSize: '0.5 cm' });
    expect(sk.circuits.find((c) => c.id === a.circuit)).toMatchObject({ name: 'Bob', current: '12', kind: 'series' });
    // Contorno "Chao" (A prescrito 0,001) na borda de baixo; as outras bordas externas viram Neumann.
    const chao = sk.boundaries.find((b) => b.name === 'Chao')!;
    expect(chao).toMatchObject({ type: 'dirichlet', value: '0.001' });
    expect(chao.curves).toHaveLength(1);
    expect(sk.boundaries.find((b) => b.id === 'bd_neumann')!.curves).toHaveLength(3);
    // Frequência no arquivo → física harmônica.
    expect(sk.nodes.find((n) => n.kind === 'physics')).toMatchObject({ analysis: 'harmonic', frequency: '60' });
  });
});

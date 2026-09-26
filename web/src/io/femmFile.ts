// Leitura de problemas magnéticos do FEMM (.fem): geometria, materiais, contornos, circuitos e rótulos de
// bloco viram um projeto do MagFEM. Coordenadas convertidas para mm; a unidade de exibição segue a do arquivo.
import { addBoundaryDef, addCircuit, addMaterial, assignBoundary, assignRegion, updateBoundaryDef } from '../cad/mesh';
import { computeArrangement, findRegion, regionAt } from '../cad/regions';
import { emptySketch, newPhysics, type Boundary, type BoundaryType, type Id, type Sketch } from '../cad/types';
import type { LengthUnit } from '../cad/expr';
import { parseMatlib } from './femm';
import { addShapes, bulgeSeg, type Shape } from './importCad';

const UNITS: Record<string, { mm: number; unit: LengthUnit }> = {
  inches: { mm: 25.4, unit: 'in' },
  millimeters: { mm: 1, unit: 'mm' },
  centimeters: { mm: 10, unit: 'cm' },
  meters: { mm: 1000, unit: 'm' },
  mils: { mm: 0.0254, unit: 'mm' },
  micrometers: { mm: 1e-3, unit: 'µm' },
};
// Tipos de contorno do FEMM (BdryType), na ordem do programa.
const BDRY: BoundaryType[] = ['dirichlet', 'skin', 'mixed', 'dualImage', 'periodic', 'antiperiodic', 'periodicAirGap', 'antiperiodicAirGap'];
const GROUP_COLOR: Record<string, string> = { air: '#dfe9f3', conductor: '#e8a15c', steel: '#9aa5b1', magnet: '#c77dd6', custom: '#b5d98a' };

export interface FemImport {
  sketch: Sketch;
  counts: { curves: number; materials: number; boundaries: number; circuits: number; labels: number };
  /** Rótulos de bloco fora de qualquer região fechada (ficaram sem atribuição). */
  lostLabels: number;
}

/** Blocos <BeginX> ... <EndX> como listas de pares chave → valor (chaves em minúsculas). */
function blocks(text: string, begin: string, end: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  let cur: Record<string, string> | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.toLowerCase() === `<${begin}>`) cur = {};
    else if (line.toLowerCase() === `<${end}>` && cur) (out.push(cur), (cur = null));
    else if (cur) {
      const m = /^<([^>]+)>\s*=\s*(.*)$/.exec(line);
      if (m) cur[m[1].toLowerCase()] = m[2].trim().replace(/^"|"$/g, '');
    }
  }
  return out;
}

/** Linhas numéricas de uma seção "[NumX] = n". */
function table(text: string, name: string): number[][] {
  const lines = text.split(/\r?\n/);
  const i = lines.findIndex((l) => l.trim().toLowerCase().startsWith(`[${name.toLowerCase()}]`));
  if (i < 0) return [];
  const n = Number(lines[i].split('=')[1]);
  return lines.slice(i + 1, i + 1 + n).map((l) => l.trim().split(/\s+/).map(Number));
}

const header = (text: string, key: string) => {
  const m = new RegExp(`^\\[${key}\\]\\s*=\\s*(.*)$`, 'im').exec(text);
  return m ? m[1].trim().replace(/^"|"$/g, '') : undefined;
};

export function parseFem(text: string): FemImport {
  const u = UNITS[(header(text, 'LengthUnits') ?? 'millimeters').toLowerCase()] ?? UNITS.millimeters;
  const k = u.mm;
  const axi = (header(text, 'ProblemType') ?? '').toLowerCase().startsWith('axi');
  const depth = Number(header(text, 'Depth') ?? 1);
  const freq = Number(header(text, 'Frequency') ?? 0);
  let sk: Sketch = emptySketch();
  sk = { ...sk, settings: { ...sk.settings, unit: u.unit, problem: axi ? 'axisymmetric' : 'planar', depth: `${depth} ${u.unit}` } };

  // Geometria: pontos, segmentos e arcos (anti-horário de n0 a n1, ângulo em graus).
  const pts = table(text, 'NumPoints').map((r) => ({ x: r[0] * k, y: r[1] * k }));
  const segs = table(text, 'NumSegments');
  const arcs = table(text, 'NumArcSegments');
  const shapes: Shape[] = [];
  const bdryOf: number[] = [];
  for (const s of segs) {
    if (!pts[s[0]] || !pts[s[1]]) continue;
    shapes.push({ kind: 'line', a: pts[s[0]], b: pts[s[1]] });
    bdryOf.push(s[3] ?? 0);
  }
  for (const a of arcs) {
    if (!pts[a[0]] || !pts[a[1]]) continue;
    shapes.push(bulgeSeg(pts[a[0]], pts[a[1]], Math.tan(((a[2] ?? 0) * Math.PI) / 180 / 4)));
    bdryOf.push(a[4] ?? 0);
  }
  const geo = addShapes(sk, shapes);
  sk = geo.sketch;

  // Materiais (blocos no mesmo formato do matlib.dat).
  const mats = parseMatlib(text).map((f) => {
    const { name, ...src } = f.material;
    const r = addMaterial(sk, name, { ...src, color: GROUP_COLOR[src.group ?? 'custom'] }, src.group);
    sk = r.sketch;
    return r.material.id;
  });

  // Contornos: propriedades do arquivo, aplicadas às curvas marcadas.
  const bdryIds: (Id | null)[] = blocks(text, 'beginbdry', 'endbdry').map((b) => {
    const type = BDRY[Number(b.bdrytype ?? 0)] ?? 'dirichlet';
    const r = addBoundaryDef(sk, type, b.bdryname || undefined);
    const num = (x?: string) => (x !== undefined && Number(x) !== 0 ? x : undefined);
    const patch: Partial<Omit<Boundary, 'id' | 'curves'>> = {
      value: num(b.a_0),
      a1: num(b.a_1),
      a2: num(b.a_2),
      phi: num(b.phi),
      c0: num(b.c0),
      c1: num(b.c1),
      mu: num(b.mu_ssd),
      sigma: num(b.sigma_ssd),
      innerAngle: num(b.innerangle),
      outerAngle: num(b.outerangle),
    };
    sk = updateBoundaryDef(r.sketch, r.boundary.id, patch);
    return r.boundary.id;
  });
  const byBdry = new Map<Id, Id[]>();
  geo.ids.forEach((cid, i) => {
    const b = bdryOf[i] > 0 ? bdryIds[bdryOf[i] - 1] : null;
    if (cid && b) byBdry.set(b, [...(byBdry.get(b) ?? []), cid]);
  });
  for (const [b, ids] of byBdry) sk = assignBoundary(sk, ids, b);

  // Circuitos (série/paralelo, corrente total).
  const circIds = blocks(text, 'begincircuit', 'endcircuit').map((c) => {
    const r = addCircuit(sk, c.circuitname || undefined, c.totalamps_re ?? '0');
    sk = { ...r.sketch, circuits: r.sketch.circuits.map((x) => (x.id === r.circuit.id ? { ...x, kind: Number(c.circuittype ?? 1) === 0 ? 'parallel' : 'series' } : x)) };
    return r.circuit.id;
  });

  // Rótulos de bloco: material, circuito, espiras, magnetização e tamanho de malha da região.
  let arr = computeArrangement(sk);
  let lostLabels = 0;
  const labels = table(text, 'NumBlockLabels');
  for (const l of labels) {
    const p = { x: l[0] * k, y: l[1] * k };
    const reg = regionAt(arr, p);
    if (!reg) {
      lostLabels++;
      continue;
    }
    const mat = l[2] > 0 ? mats[l[2] - 1] : undefined;
    const circ = l[4] > 0 ? circIds[l[4] - 1] : undefined;
    const patch: Record<string, unknown> = {};
    if (mat) patch.material = mat;
    if (circ) patch.circuit = circ;
    if (l[7] && l[7] !== 1) patch.turns = l[7];
    else if (circ) patch.turns = 1;
    if (l[5]) patch.magnetAngle = String(l[5]);
    if (l[3] > 0) patch.meshSize = `${l[3]} ${u.unit}`;
    sk = assignRegion(sk, arr, { curves: reg.curves, seed: p }, patch);
  }

  // Regiões sem rótulo (ou com rótulo "<No Mesh>") não são malhadas no FEMM: ficam fora do domínio.
  arr = computeArrangement(sk);
  for (const r of arr.regions) {
    const has = sk.regionAssigns.some((a) => a.material && findRegion(arr, a)?.index === r.index);
    if (!has) sk = assignRegion(sk, arr, { curves: r.curves, seed: r.label }, { noMesh: true });
  }
  // Borda externa sem propriedade: no FEMM é Neumann (aqui, sem nada, viraria A = 0).
  arr = computeArrangement(sk);
  const assigned = new Set(sk.boundaries.flatMap((b) => b.curves));
  const outer: Id[] = [];
  for (const cid of geo.ids) {
    if (!cid || assigned.has(cid)) continue;
    const e = sk.entities[cid];
    let m: { x: number; y: number }, nx: number, ny: number, len: number;
    if (e.type === 'line') {
      const a = sk.entities[e.p1] as { x: number; y: number }, b = sk.entities[e.p2] as { x: number; y: number };
      m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      len = Math.hypot(b.x - a.x, b.y - a.y);
      nx = -(b.y - a.y) / len;
      ny = (b.x - a.x) / len;
    } else if (e.type === 'arc') {
      const c = sk.entities[e.c] as { x: number; y: number }, s = sk.entities[e.s] as { x: number; y: number }, f = sk.entities[e.e] as { x: number; y: number };
      let a0 = Math.atan2(s.y - c.y, s.x - c.x), a1 = Math.atan2(f.y - c.y, f.x - c.x);
      if (a1 <= a0) a1 += 2 * Math.PI;
      const am = (a0 + a1) / 2;
      m = { x: c.x + e.r * Math.cos(am), y: c.y + e.r * Math.sin(am) };
      nx = Math.cos(am);
      ny = Math.sin(am);
      len = e.r;
    } else continue;
    const eps = Math.max(1e-6, 1e-3 * len);
    const inA = regionAt(arr, { x: m.x + nx * eps, y: m.y + ny * eps }), inB = regionAt(arr, { x: m.x - nx * eps, y: m.y - ny * eps });
    if (!inA !== !inB) outer.push(cid);
  }
  if (outer.length) sk = assignBoundary(sk, outer, 'bd_neumann');

  // Física: magnetostática, ou harmônica se o arquivo tiver frequência.
  const phys = newPhysics(`n${sk.nextId}`, 'Campo magnético');
  sk = { ...sk, nodes: [...sk.nodes, freq > 0 ? { ...phys, analysis: 'harmonic', frequency: String(freq) } : phys], nextId: sk.nextId + 1 };
  return {
    sketch: sk,
    counts: { curves: geo.ids.filter(Boolean).length, materials: mats.length, boundaries: bdryIds.length, circuits: circIds.length, labels: labels.length - lostLabels },
    lostLabels,
  };
}

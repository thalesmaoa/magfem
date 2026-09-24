// Pré-processamento da malha: materiais, atribuição de regiões e contornos (funções puras).
import { T } from '../i18n';
import { findRegion, regionAt, type Arrangement, type Region } from './regions';
import type { Vec } from './geometry';
import type { BoundaryType, Id, Material, RegionAssign, Sketch } from './types';

export type RegionKey = { curves: Id[]; seed: Vec };

export const regionKey = (r: Region): RegionKey => ({ curves: r.curves, seed: r.label });

/** Atribuição existente da região (a primeira que ainda a reencontra). */
export function assignOf(sk: Sketch, arr: Arrangement, key: RegionKey): RegionAssign | undefined {
  const r = findRegion(arr, key);
  if (!r) return undefined;
  return sk.regionAssigns.find((a) => findRegion(arr, a) === r);
}

/** Cria ou atualiza a atribuição (material/fonte) da região. */
export function assignRegion(sk: Sketch, arr: Arrangement, key: RegionKey, patch: Partial<RegionAssign>): Sketch {
  const cur = assignOf(sk, arr, key);
  if (cur) return { ...sk, regionAssigns: sk.regionAssigns.map((a) => (a.id === cur.id ? { ...a, ...patch, curves: key.curves, seed: key.seed } : a)) };
  const a: RegionAssign = { id: `ra${sk.nextId}`, curves: key.curves, seed: key.seed, material: 'mat_air', ...patch };
  return { ...sk, regionAssigns: [...sk.regionAssigns, a], nextId: sk.nextId + 1 };
}

/** Região que contém o ponto, ou erro. */
export function regionAtOrThrow(arr: Arrangement, p: Vec): Region {
  const r = regionAt(arr, p);
  if (!r) throw new Error(T().mesh.noRegionAt(p.x, p.y));
  return r;
}

/** Aplica (ou remove, com `type` null) uma condição de contorno; cada curva fica em no máximo um contorno. */
export function setBoundary(sk: Sketch, ids: Id[], type: BoundaryType | null): Sketch {
  if (type && (type === 'periodic' || type === 'antiperiodic') && ids.length !== 2) throw new Error(T().mesh.periodicNeedsTwo);
  let boundaries = sk.boundaries.map((b) => ({ ...b, curves: b.curves.filter((c) => !ids.includes(c)) })).filter((b) => b.curves.length);
  let nextId = sk.nextId;
  if (type) {
    const names: Record<BoundaryType, string> = { dirichlet: 'A = 0', neumann: 'Neumann', periodic: T().mesh.periodic, antiperiodic: T().mesh.antiperiodic };
    const n = boundaries.filter((b) => b.type === type).length + 1;
    boundaries = [...boundaries, { id: `b${nextId++}`, name: `${names[type]} ${n}`, type, curves: [...ids] }];
  }
  return { ...sk, boundaries, nextId };
}

/** Material pelo id ou pelo nome. */
export function findMaterial(sk: Sketch, ref: string): Material | undefined {
  return sk.materials.find((m) => m.id === ref) ?? sk.materials.find((m) => m.name.toLowerCase() === ref.toLowerCase());
}

const PALETTE = ['#9fd3a8', '#f2c46d', '#c7a6e0', '#8ec5e8', '#f0a3a3', '#b5d98a', '#e8b98e'];

/** Novo material (linear, μr = 1) com nome único. */
export function addMaterial(sk: Sketch, name?: string, patch: Partial<Material> = {}): { sketch: Sketch; material: Material } {
  const base = name ?? T().mesh.newMaterial;
  let n = name ?? `${base} ${sk.materials.length + 1}`;
  for (let k = 2; sk.materials.some((m) => m.name === n); k++) n = `${base} ${k}`;
  const material: Material = { id: `mat${sk.nextId}`, name: n, color: PALETTE[sk.materials.length % PALETTE.length], mur: 1, sigma: 0, ...patch };
  return { sketch: { ...sk, materials: [...sk.materials, material], nextId: sk.nextId + 1 }, material };
}

export function updateMaterial(sk: Sketch, id: Id, patch: Partial<Material>): Sketch {
  if (patch.name !== undefined && sk.materials.some((m) => m.id !== id && m.name === patch.name)) throw new Error(T().mesh.nameTaken(patch.name));
  return { ...sk, materials: sk.materials.map((m) => (m.id === id ? { ...m, ...patch } : m)) };
}

export function removeMaterial(sk: Sketch, id: Id): Sketch {
  if (sk.regionAssigns.some((a) => a.material === id)) throw new Error(T().mesh.materialInUse);
  return { ...sk, materials: sk.materials.filter((m) => m.id !== id) };
}

/** Coordenada curta para o código gerado. */
export const pointCode = (p: Vec) => `(${Number(p.x.toFixed(4))}, ${Number(p.y.toFixed(4))})`;

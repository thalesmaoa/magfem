// Pré-processamento da malha: materiais, atribuição de regiões e contornos (funções puras).
import { T } from '../i18n';
import { findRegion, regionAt, type Arrangement, type Region } from './regions';
import type { Vec } from './geometry';
import type { Boundary, BoundaryType, Id, Material, MaterialGroup, RegionAssign, Sketch } from './types';

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
  const a: RegionAssign = { id: `ra${sk.nextId}`, curves: key.curves, seed: key.seed, ...patch };
  return { ...sk, regionAssigns: [...sk.regionAssigns, a], nextId: sk.nextId + 1 };
}

/** Região que contém o ponto, ou erro. */
export function regionAtOrThrow(arr: Arrangement, p: Vec): Region {
  const r = regionAt(arr, p);
  if (!r) throw new Error(T().mesh.noRegionAt(p.x, p.y));
  return r;
}

/**
 * Atalho do console: liga curvas a um contorno pelo nome/id, ou a um contorno novo do tipo dado
 * ("dirichlet", "neumann", "periodic", "antiperiodic"); null tira as curvas de qualquer contorno.
 */
export function setBoundary(sk: Sketch, ids: Id[], ref: string | null): Sketch {
  if (ref === null) return assignBoundary(sk, ids, null);
  const existing = findBoundary(sk, ref);
  if (existing) return assignBoundary(sk, ids, existing.id);
  if (!['dirichlet', 'neumann', 'periodic', 'antiperiodic'].includes(ref)) throw new Error(T().consoleCmd.notFound(ref));
  const type = ref as BoundaryType;
  if ((type === 'periodic' || type === 'antiperiodic') && ids.length !== 2) throw new Error(T().mesh.periodicNeedsTwo);
  const r = addBoundaryDef(sk, type);
  return assignBoundary(r.sketch, ids, r.boundary.id);
}

const BOUNDARY_BASE = (type: BoundaryType) =>
  ({ dirichlet: 'A = 0', neumann: 'Neumann', periodic: T().mesh.periodic, antiperiodic: T().mesh.antiperiodic })[type];

/** Nova propriedade de contorno (como no FEMM), ainda sem curvas. */
export function addBoundaryDef(sk: Sketch, type: BoundaryType, name?: string): { sketch: Sketch; boundary: Boundary } {
  let n = name ?? `${BOUNDARY_BASE(type)} ${sk.boundaries.filter((b) => b.type === type).length + 1}`;
  for (let k = 2; sk.boundaries.some((b) => b.name === n); k++) n = `${name ?? BOUNDARY_BASE(type)} ${k}`;
  const boundary: Boundary = { id: `b${sk.nextId}`, name: n, type, curves: [] };
  return { sketch: { ...sk, boundaries: [...sk.boundaries, boundary], nextId: sk.nextId + 1 }, boundary };
}

export function updateBoundaryDef(sk: Sketch, id: Id, patch: Partial<Omit<Boundary, 'id' | 'curves'>>): Sketch {
  const b = sk.boundaries.find((x) => x.id === id);
  if (!b) return sk;
  if (patch.name !== undefined && sk.boundaries.some((x) => x.id !== id && x.name === patch.name)) throw new Error(T().mesh.nameTaken(patch.name));
  const type = patch.type ?? b.type;
  if ((type === 'periodic' || type === 'antiperiodic') && b.curves.length > 2) throw new Error(T().mesh.periodicNeedsTwo);
  // Nome padrão ("A = 0 1") acompanha a troca de tipo; nomes dados pelo usuário ficam.
  const next = { ...patch };
  const base = BOUNDARY_BASE(b.type);
  const isDefault = b.name.startsWith(`${base} `) && /^\d+$/.test(b.name.slice(base.length + 1));
  if (patch.type && patch.type !== b.type && patch.name === undefined && isDefault) {
    const others = sk.boundaries.filter((x) => x.id !== id);
    let k = others.filter((x) => x.type === patch.type).length + 1;
    while (others.some((x) => x.name === `${BOUNDARY_BASE(patch.type!)} ${k}`)) k++;
    next.name = `${BOUNDARY_BASE(patch.type)} ${k}`;
  }
  return { ...sk, boundaries: sk.boundaries.map((x) => (x.id === id ? { ...x, ...next } : x)) };
}

export function removeBoundaryDef(sk: Sketch, id: Id): Sketch {
  return { ...sk, boundaries: sk.boundaries.filter((b) => b.id !== id) };
}

/** Liga curvas a uma propriedade de contorno (null = tira de qualquer contorno). */
export function assignBoundary(sk: Sketch, ids: Id[], boundaryId: Id | null): Sketch {
  const target = boundaryId ? sk.boundaries.find((b) => b.id === boundaryId) : null;
  if (boundaryId && !target) throw new Error(boundaryId);
  if (target && (target.type === 'periodic' || target.type === 'antiperiodic')) {
    const all = new Set([...target.curves, ...ids]);
    if (all.size > 2) throw new Error(T().mesh.periodicNeedsTwo);
  }
  return {
    ...sk,
    boundaries: sk.boundaries.map((b) => {
      const rest = b.curves.filter((c) => !ids.includes(c));
      return b.id === boundaryId ? { ...b, curves: [...rest, ...ids] } : { ...b, curves: rest };
    }),
  };
}

export function findBoundary(sk: Sketch, ref: string): Boundary | undefined {
  return sk.boundaries.find((b) => b.id === ref) ?? sk.boundaries.find((b) => b.name.toLowerCase() === ref.toLowerCase());
}

/** Material pelo id ou pelo nome. */
export function findMaterial(sk: Sketch, ref: string): Material | undefined {
  return sk.materials.find((m) => m.id === ref) ?? sk.materials.find((m) => m.name.toLowerCase() === ref.toLowerCase());
}

const PALETTE = ['#9fd3a8', '#f2c46d', '#c7a6e0', '#8ec5e8', '#f0a3a3', '#b5d98a', '#e8b98e'];

/** Novo material (linear, μr = 1) com nome único. */
export function addMaterial(sk: Sketch, name?: string, patch: Partial<Material> = {}, group: MaterialGroup = 'custom'): { sketch: Sketch; material: Material } {
  const base = name ?? T().mesh.newMaterial;
  let n = name ?? `${base} ${sk.materials.length + 1}`;
  for (let k = 2; sk.materials.some((m) => m.name === n); k++) n = `${base} ${k}`;
  const material: Material = { id: `mat${sk.nextId}`, name: n, group, color: PALETTE[sk.materials.length % PALETTE.length], mur: 1, sigma: 0, ...patch };
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

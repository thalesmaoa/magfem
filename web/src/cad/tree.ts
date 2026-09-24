// Árvore do modelo: Pré-processador (Geometria + físicas), Malha e Pós-processador.
import { q } from './code';
import { newPhysics, type Id, type Sketch, type TreeNode } from './types';

export type AddKind = 'physics-magnetic' | 'mesh' | 'post';

/** Seleção na árvore (estado da interface, não do documento). */
export type TreeSel =
  | { kind: 'geometry' }
  | { kind: 'node'; id: Id }
  | { kind: 'var'; name: string }
  // Malha: a seção em si (regiões/contornos no canvas), um material ou um contorno ('outer' = borda externa padrão).
  | { kind: 'mesh' }
  | { kind: 'material'; id: Id }
  | { kind: 'boundary'; id: Id };

export const isMeshSel = (s: TreeSel, sk: { nodes: TreeNode[] }) =>
  s.kind === 'mesh' || s.kind === 'material' || s.kind === 'boundary' || (s.kind === 'node' && sk.nodes.some((n) => n.id === s.id && n.kind === 'mesh'));

export function addNode(sk: Sketch, kind: AddKind, name: string): { sketch: Sketch; node: TreeNode; code: string } {
  const id = `n${sk.nextId}`;
  let node: TreeNode;
  let code: string;
  if (kind === 'physics-magnetic') {
    node = newPhysics(id, name);
    code = `${id} = s.add_physics(name=${q(name)})`;
  } else if (kind === 'mesh') {
    node = { id, kind: 'mesh', name };
    code = `${id} = m.add(name=${q(name)})`;
  } else {
    node = { id, kind: 'post', name };
    code = `${id} = r.add(name=${q(name)})`;
  }
  return { sketch: { ...sk, nodes: [...sk.nodes, node], nextId: sk.nextId + 1 }, node, code };
}

export function updateNode(sk: Sketch, id: Id, patch: Partial<TreeNode>): Sketch {
  return { ...sk, nodes: sk.nodes.map((n) => (n.id === id ? ({ ...n, ...patch } as TreeNode) : n)) };
}

export function removeNode(sk: Sketch, id: Id): Sketch {
  return { ...sk, nodes: sk.nodes.filter((n) => n.id !== id) };
}

/** Objeto da API de cada seção da árvore: g (geometria), m (malha), s (solucionador), r (resultados). */
export const NS: Record<TreeNode['kind'], string> = { mesh: 'm', physics: 's', post: 'r' };

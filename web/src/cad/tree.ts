// Árvore do modelo: Pré-processador (Geometria + físicas), Malha e Pós-processador.
import { T } from '../i18n';
import { q } from './code';
import { newPhysics, PLOT_QUANTITIES, type Id, type PlotKind, type PlotQuantity, type Sketch, type TreeNode } from './types';

export type AddKind = 'physics-magnetic' | 'mesh' | 'post';

/** Seleção na árvore (estado da interface, não do documento). */
export type TreeSel =
  | { kind: 'geometry' }
  | { kind: 'node'; id: Id }
  | { kind: 'var'; name: string }
  // Malha: a seção em si (regiões/contornos no canvas), um material ou um contorno ('outer' = borda externa padrão).
  | { kind: 'mesh'; sub?: MeshSub }
  | { kind: 'boundary'; id: Id }
  | { kind: 'circuit'; id: Id }
  // Resultados de uma física (o grupo com o nome dela).
  | { kind: 'results'; id: Id };

/** Subseções da Malha, na ordem de trabalho. */
export type MeshSub = 'materials' | 'circuits' | 'boundaries' | 'regions';

export const isMeshSel = (s: TreeSel, sk: { nodes: TreeNode[] }) =>
  s.kind === 'mesh' || s.kind === 'boundary' || s.kind === 'circuit' || (s.kind === 'node' && sk.nodes.some((n) => n.id === s.id && n.kind === 'mesh'));

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

/** Nova camada de visualização para os resultados de uma física. */
export function addPlot(sk: Sketch, view: Id, plot: PlotKind, name: string, quantity?: PlotQuantity): { sketch: Sketch; node: TreeNode; code: string } {
  const v = sk.nodes.find((n) => n.id === view && n.kind === 'view');
  const physics = v?.kind === 'view' ? v.physics : undefined;
  const id = `n${sk.nextId}`;
  const qty = quantity ?? PLOT_QUANTITIES[plot][0];
  const node: TreeNode = { id, kind: 'post', name, physics, view, plot, quantity: qty };
  return { sketch: { ...sk, nodes: [...sk.nodes, node], nextId: sk.nextId + 1 }, node, code: `${id} = r.plot(${q(view)}, ${q(plot)}, quantity=${q(qty)})` };
}

/** Nova vista (aba) de resultados de uma física. */
export function addView(sk: Sketch, physics: Id, name?: string, level?: number): { sketch: Sketch; node: TreeNode; code: string } {
  const id = `n${sk.nextId}`;
  const count = (interp: boolean) => sk.nodes.filter((x) => x.kind === 'view' && x.physics === physics && !!x.level === interp).length + 1;
  const n = name ?? (level ? `${T().post.interp} ${count(true)}` : `${T().post.view} ${count(false)}`);
  const node: TreeNode = level ? { id, kind: 'view', name: n, physics, level } : { id, kind: 'view', name: n, physics };
  const code = level ? `${id} = r.interpolate(${q(physics)}, level=${level})` : `${id} = r.view(${q(physics)}, name=${q(n)})`;
  return { sketch: { ...sk, nodes: [...sk.nodes, node], nextId: sk.nextId + 1 }, node, code };
}

/** Duplica uma camada (na mesma vista) ou uma vista inteira com as camadas dela. */
export function duplicateNode(sk: Sketch, id: Id): { sketch: Sketch; node: TreeNode; code: string } | null {
  const src = sk.nodes.find((n) => n.id === id);
  if (!src || (src.kind !== 'post' && src.kind !== 'view')) return null;
  let nextId = sk.nextId;
  const copyName = `${src.name} (${T().post.copy})`;
  const copy = { ...src, id: `n${nextId++}`, name: copyName } as TreeNode;
  const added: TreeNode[] = [copy];
  if (src.kind === 'view')
    for (const p of sk.nodes) if (p.kind === 'post' && p.view === src.id) added.push({ ...p, id: `n${nextId++}`, view: copy.id });
  // A cópia entra logo depois do original (e das camadas dele, se for vista).
  const nodes = [...sk.nodes];
  const lastIdx = Math.max(nodes.indexOf(src), ...nodes.map((n, i) => (n.kind === 'post' && n.view === src.id ? i : -1)));
  nodes.splice(lastIdx + 1, 0, ...added);
  return { sketch: { ...sk, nodes, nextId }, node: copy, code: `${copy.id} = r.duplicate(${q(id)})` };
}

/** Move uma camada para outra vista (pai); entra no fim da lista da vista de destino. */
export function movePlot(sk: Sketch, id: Id, viewId: Id): Sketch {
  const p = sk.nodes.find((n) => n.id === id);
  const v = sk.nodes.find((n) => n.id === viewId);
  if (p?.kind !== 'post' || v?.kind !== 'view' || p.view === viewId) return sk;
  const moved: TreeNode = { ...p, view: viewId, physics: v.physics };
  const rest = sk.nodes.filter((n) => n.id !== id);
  const last = Math.max(rest.indexOf(v), ...rest.map((n, i) => (n.kind === 'post' && n.view === viewId ? i : -1)));
  rest.splice(last + 1, 0, moved);
  return { ...sk, nodes: rest };
}

export function updateNode(sk: Sketch, id: Id, patch: Partial<TreeNode>): Sketch {
  return { ...sk, nodes: sk.nodes.map((n) => (n.id === id ? ({ ...n, ...patch } as TreeNode) : n)) };
}

export function removeNode(sk: Sketch, id: Id): Sketch {
  // Remover uma vista leva junto as camadas dela; remover uma física leva vistas e camadas.
  const gone = new Set([id]);
  for (const n of sk.nodes) if ((n.kind === 'view' && n.physics === id) || (n.kind === 'post' && (n.view === id || n.physics === id))) gone.add(n.id);
  for (const n of sk.nodes) if (n.kind === 'post' && n.view && gone.has(n.view)) gone.add(n.id);
  return { ...sk, nodes: sk.nodes.filter((n) => !gone.has(n.id)) };
}

/** Objeto da API de cada seção da árvore: g (geometria), m (malha), s (solucionador), r (resultados). */
export const NS: Record<TreeNode['kind'], string> = { mesh: 'm', physics: 's', post: 'r', view: 'r' };

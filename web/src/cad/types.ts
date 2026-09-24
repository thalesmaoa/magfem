// Modelo de dados do sketch 2D. Unidades internas: mm e graus (ângulos das cotas).
import type { LengthUnit, Variable } from './expr';

export type Id = string;

/** Id reservado da origem (ponto fixo em 0,0, sempre presente). */
export const ORIGIN_ID = 'O';

export interface PointEnt {
  id: Id;
  type: 'point';
  /** Auxiliar interno de uma operação (ex.: conector do offset): não é desenhado nem selecionável. */
  aux?: boolean;
  /** Nome dado pelo usuário (a árvore mostra o nome; o id continua valendo na API). */
  name?: string;
  x: number;
  y: number;
  fixed?: boolean;
  /** Ponto criado pela ferramenta Ponto (não é apagado quando fica órfão). */
  free?: boolean;
}

export interface LineEnt {
  id: Id;
  type: 'line';
  /** Auxiliar interno de uma operação (ex.: conector do offset): não é desenhado nem selecionável. */
  aux?: boolean;
  /** Nome dado pelo usuário (a árvore mostra o nome; o id continua valendo na API). */
  name?: string;
  p1: Id;
  p2: Id;
  construction?: boolean;
}

export interface CircleEnt {
  id: Id;
  type: 'circle';
  /** Nome dado pelo usuário (a árvore mostra o nome; o id continua valendo na API). */
  name?: string;
  c: Id;
  r: number;
  construction?: boolean;
}

/** Arco anti-horário de `s` até `e`, centro `c`. */
export interface ArcEnt {
  id: Id;
  type: 'arc';
  /** Nome dado pelo usuário (a árvore mostra o nome; o id continua valendo na API). */
  name?: string;
  c: Id;
  s: Id;
  e: Id;
  r: number;
  construction?: boolean;
}

export type Curve = LineEnt | CircleEnt | ArcEnt;
export type Entity = PointEnt | Curve;

export type GeomConstraintType =
  | 'coincident'
  | 'horizontal'
  | 'vertical'
  | 'parallel'
  | 'perpendicular'
  | 'tangent'
  | 'equal'
  | 'pointOn'
  | 'midpoint'
  | 'symmetric'
  | 'symmetricPoint'
  | 'concentric'
  /** raio(refs[1]) − raio(refs[0]) = sign·value (offset de arcos/círculos). */
  | 'radiusDiff'
  /** coordenada `axis` de refs[1] − a de refs[0] = valor ou parâmetro (padrão linear). */
  | 'coordDiff'
  /** Ponto médio da linha refs[0] sobre a linha refs[1] (metade de uma simetria). */
  | 'midpointOnLine';

export type DimensionType = 'distance' | 'hdistance' | 'vdistance' | 'radius' | 'diameter' | 'angle';

export type ConstraintType = GeomConstraintType | DimensionType;

export interface Constraint {
  id: Id;
  type: ConstraintType;
  refs: Id[];
  /** Valor das cotas (mm ou graus), sempre positivo; o sentido vem da geometria atual. */
  value?: number;
  /** Expressão que define o valor (ex.: "Ds/2 - g"); ausente = valor fixo. */
  expr?: string;
  /**
   * Cota de ângulo: setor medido. Cada flag inverte a direção (p1→p2) da respectiva linha;
   * o valor é o ângulo entre as duas direções resultantes (0–180°).
   */
  flip?: [boolean, boolean];
  /** Restrição criada por uma operação (ex.: offset): não é desenhada no canvas. */
  internal?: boolean;
  /** Sentido: 'radiusDiff' (+1: filho maior que o pai) ou ângulo com sinal fixo (conector do offset). */
  sign?: 1 | -1;
  /** Nome do parâmetro do solver usado como valor (distância do offset, livre durante o arraste). */
  param?: string;
  /** Cota visível que representa a distância do offset deste grupo (duplo clique edita). */
  offsetDim?: Id;
  /** Eixo de 'coordDiff'. */
  axis?: 'x' | 'y';
  /** Posição do texto da cota, relativa à âncora da cota (mm). */
  label?: { x: number; y: number };
}

export interface Group {
  id: Id;
  name: string;
  /** Curvas e pontos livres do grupo (os pontos das curvas vêm junto). */
  members: Id[];
  hidden?: boolean;
  /** Grupo-pai na árvore (ex.: o offset aparece dentro do retângulo de origem). */
  parent?: Id;
  /** Grupo gerado por offset: curvas de origem, distância (mm, ≥ 0) e lado (+1 para fora/esquerda). */
  offset?: { parents: Id[]; distance: number; side: 1 | -1 };
  /** Grupo gerado por padrão (associativo): origem e parâmetros. */
  pattern?: PatternSpec;
}

export type PatternSpec =
  | { kind: 'linear'; src: Id[]; nx: number; ny: number; dx: number; dy: number }
  | { kind: 'circular'; src: Id[]; n: number; angle: number; center: Id };

export type ProblemType = 'planar' | 'axisymmetric';
export type AnalysisType = 'magnetostatic' | 'harmonic' | 'transient';

/** Configurações globais do problema (valem para todas as físicas). */
export interface Settings {
  unit: LengthUnit;
  problem: ProblemType;
  /** Profundidade (problema planar), expressão. */
  depth: string;
}

export const DEFAULT_SETTINGS: Settings = {
  unit: 'mm',
  problem: 'planar',
  depth: '100 mm',
};

/** Física incluída na árvore do modelo (hoje só magnética; a árvore já comporta várias). */
export interface PhysicsNode {
  id: Id;
  kind: 'physics';
  physics: 'magnetic';
  name: string;
  analysis: AnalysisType;
  /** Frequência (harmônico), expressão em Hz. */
  frequency: string;
  /** Passo e tempo final (transiente), expressões em s. */
  dt: string;
  tEnd: string;
}

export interface MeshNode {
  id: Id;
  kind: 'mesh';
  name: string;
}

export interface PostNode {
  id: Id;
  kind: 'post';
  name: string;
}

/** Nós que o usuário inclui na árvore (o Pré-processador/Geometria é fixo). */
export type TreeNode = PhysicsNode | MeshNode | PostNode;

export const newPhysics = (id: Id, name: string): PhysicsNode => ({
  id,
  kind: 'physics',
  physics: 'magnetic',
  name,
  analysis: 'magnetostatic',
  frequency: '60',
  dt: '0.0005',
  tEnd: '0.05',
});

/** Estado completo do modelo (é o que vai para o arquivo e para o histórico). */
export interface Sketch {
  entities: Record<Id, Entity>;
  constraints: Constraint[];
  variables: Variable[];
  groups: Group[];
  settings: Settings;
  nodes: TreeNode[];
  nextId: number;
}

export const DIMENSION_TYPES: ReadonlySet<ConstraintType> = new Set<ConstraintType>([
  'distance',
  'hdistance',
  'vdistance',
  'radius',
  'diameter',
  'angle',
]);

export const isDimension = (c: Constraint) => DIMENSION_TYPES.has(c.type);
export const isCurve = (e: Entity | undefined): e is Curve =>
  !!e && (e.type === 'line' || e.type === 'circle' || e.type === 'arc');

export function emptySketch(): Sketch {
  return {
    entities: { [ORIGIN_ID]: { id: ORIGIN_ID, type: 'point', x: 0, y: 0, fixed: true, free: true } },
    constraints: [],
    variables: [],
    groups: [],
    settings: { ...DEFAULT_SETTINGS },
    nodes: [{ id: 'n1', kind: 'mesh', name: 'Malha' }, newPhysics('n2', 'Campo magnético')],
    nextId: 3,
  };
}

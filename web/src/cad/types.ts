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
  /** Tamanho padrão do elemento (expressão de comprimento); vazio = automático. */
  size?: string;
  /** Ângulo mínimo dos triângulos (qualidade, graus). */
  minAngle?: number;
}

/** Tipos de gráfico dos resultados (a grandeza é escolhida dentro de cada um). */
export type PlotKind = 'surface' | 'contour' | 'arrow' | 'line';
export const PLOT_KINDS: PlotKind[] = ['surface', 'contour', 'arrow', 'line'];
/** Grandezas: |B|, |H|, A (ou ψ), J; no gráfico sobre curva também B normal/tangencial. */
export type PlotQuantity = 'b' | 'h' | 'a' | 'j' | 'bn' | 'bt';
export const PLOT_QUANTITIES: Record<PlotKind, PlotQuantity[]> = {
  surface: ['b', 'h', 'a', 'j'],
  contour: ['a', 'b', 'h'],
  arrow: ['b', 'h'],
  line: ['b', 'bn', 'bt', 'h', 'a'],
};

/** Camada de visualização de uma física (em Resultados, dentro do nome da física). */
export interface PostNode {
  id: Id;
  kind: 'post';
  name: string;
  /** Física cujos resultados a camada mostra. */
  physics?: Id;
  /** Vista (aba do canvas) onde a camada aparece. */
  view?: Id;
  plot?: PlotKind;
  hidden?: boolean;
  /** Grandeza mostrada (padrão: a primeira do tipo). */
  quantity?: PlotQuantity;
  /** Componente de grandezas vetoriais (B, H): magnitude, x (r) ou y (z), como no ParaView. */
  component?: 'mag' | 'x' | 'y';
  /** Linhas de contorno: quantidade (padrão 20). */
  nLines?: number;
  /** Mapas: faixa de cores manual [mín, máx] (ausente = automática). */
  range?: [number, number];
  /** Vetores: espaçamento (mm; ausente = automático) e escala (1 = padrão). */
  spacing?: number;
  scale?: number;
  /** Gráfico sobre curva: a curva do desenho. */
  curve?: Id;
}

/** Vista de resultados: uma aba do canvas com camadas (como uma "view" do ParaView). */
export interface ViewNode {
  id: Id;
  kind: 'view';
  name: string;
  physics: Id;
}

/** Nós que o usuário inclui na árvore (o Pré-processador/Geometria é fixo). */
export type TreeNode = PhysicsNode | MeshNode | PostNode | ViewNode;

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

/** Grupo do material na biblioteca (organiza as listas). */
export type MaterialGroup = 'air' | 'conductor' | 'steel' | 'magnet' | 'custom';
export const MATERIAL_GROUPS: MaterialGroup[] = ['air', 'conductor', 'steel', 'magnet', 'custom'];

/** Material magnético/elétrico da biblioteca do projeto. */
export interface Material {
  id: Id;
  name: string;
  group?: MaterialGroup;
  /** Cor de preenchimento das regiões com este material. */
  color: string;
  /** Permeabilidade relativa (linear) — ignorada se houver curva B-H. */
  mur: number;
  /** Condutividade elétrica (MS/m), para correntes induzidas. */
  sigma: number;
  /** Ímã permanente: remanência (T); direção fica na região. */
  br?: number;
  /** Curva B-H não linear: pares [H (A/m), B (T)]. */
  bh?: [number, number][];
}

/** Material (e fonte) atribuído a uma região; a região é reencontrada pelas curvas do contorno. */
export interface RegionAssign {
  id: Id;
  curves: Id[];
  seed: { x: number; y: number };
  /** Nome dado pelo usuário (ex.: "Bobina primário"); ausente = "Região N". */
  name?: string;
  /** Posição da etiqueta no desenho: deslocamento (mm) do ponto interno da região; ausente = padrão. */
  labelOffset?: { x: number; y: number };
  /** Material da região (sem material: não pode resolver). */
  material?: Id;
  /** Tamanho do elemento na região (expressão de comprimento); ausente = o da malha (automático). */
  meshSize?: string;
  /** Corrente total na região (A, expressão) — condutores/bobinas. */
  current?: string;
  /** Espiras (bobina). */
  turns?: number;
  /** Direção de magnetização (graus, expressão) — ímãs. */
  magnetAngle?: string;
}

export type BoundaryType = 'dirichlet' | 'neumann' | 'periodic' | 'antiperiodic';

/** Condição de contorno aplicada a curvas do desenho. */
export interface Boundary {
  id: Id;
  name: string;
  type: BoundaryType;
  curves: Id[];
  /** Valor de A (Wb/m) para Dirichlet (padrão 0). */
  value?: string;
}

/** Biblioteca inicial de materiais (cada projeto novo leva uma cópia editável). */
export const DEFAULT_MATERIALS: Material[] = [
  { id: 'mat_air', group: 'air', name: 'Ar', color: '#dbe9f6', mur: 1, sigma: 0 },
  { id: 'mat_cu', group: 'conductor', name: 'Cobre', color: '#e0914f', mur: 1, sigma: 58 },
  { id: 'mat_al', group: 'conductor', name: 'Alumínio', color: '#b8c2cc', mur: 1, sigma: 35 },
  {
    id: 'mat_m400',
    group: 'steel',
    name: 'Aço M400-50A',
    color: '#7d8a99',
    mur: 4000,
    sigma: 0,
    bh: [
      [0, 0],
      [60, 0.5],
      [100, 0.9],
      [150, 1.1],
      [250, 1.25],
      [500, 1.4],
      [1000, 1.5],
      [2500, 1.6],
      [5000, 1.7],
      [10000, 1.8],
      [25000, 1.95],
      [50000, 2.05],
      [100000, 2.15],
    ],
  },
  {
    id: 'mat_1010',
    group: 'steel',
    name: 'Aço 1010',
    color: '#6b7684',
    mur: 1000,
    sigma: 5,
    bh: [
      [0, 0],
      [240, 0.5],
      [480, 1.0],
      [800, 1.25],
      [1600, 1.45],
      [4000, 1.6],
      [8000, 1.7],
      [16000, 1.8],
      [40000, 1.95],
      [100000, 2.1],
    ],
  },
  { id: 'mat_ndfeb', group: 'magnet', name: 'NdFeB N42', color: '#9d6bd1', mur: 1.05, sigma: 0.667, br: 1.3 },
  { id: 'mat_ferrite', group: 'magnet', name: 'Ferrite', color: '#5f9ea0', mur: 1.1, sigma: 0, br: 0.4 },
];

/** Estado completo do modelo (é o que vai para o arquivo e para o histórico). */
export interface Sketch {
  entities: Record<Id, Entity>;
  constraints: Constraint[];
  variables: Variable[];
  groups: Group[];
  settings: Settings;
  nodes: TreeNode[];
  materials: Material[];
  regionAssigns: RegionAssign[];
  boundaries: Boundary[];
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
    nodes: [{ id: 'n1', kind: 'mesh', name: 'Malha 1', size: '', minAngle: 30 }, newPhysics('n2', 'Campo magnético')],
    materials: DEFAULT_MATERIALS.map((m) => ({ ...m })),
    regionAssigns: [],
    boundaries: [],
    nextId: 3,
  };
}

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
  /** Campo magnético + circuito: acoplado ao esquemático `schematic` (sempre transitório). */
  coupled?: boolean;
  schematic?: Id;
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

export type Colormap = 'turbo' | 'viridis' | 'coolwarm' | 'gray';
export const COLORMAPS: Colormap[] = ['turbo', 'viridis', 'coolwarm', 'gray'];

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
  /** Gráfico sobre curva / integral sobre linha: a curva do desenho. */
  curve?: Id;
  /** Item de tabela de resultados (quando o pai é uma tabela). */
  item?: TableItem;
  /** Nome das variáveis de resultado deste item (ex.: "S1" → S1_area, S1_intA…); fórmula: nome do resultado. */
  varName?: string;
  /** Integrais: grandezas escolhidas e o nome da variável de cada uma (ausente = todas, nomes padrão). */
  outputs?: { q: string; name: string }[];
  /** Fórmula (item 'formula'): expressão com variáveis do projeto e de resultado; unidade só para exibir. */
  expr?: string;
  unitLabel?: string;
  /** Transitório: instante (índice do passo) para mostrar como tabela; ausente = curva no tempo. */
  atTime?: number;
  /** Integral de superfície: regiões escolhidas (identidade pelas curvas + ponto interno). */
  regions?: { curves: Id[]; seed: { x: number; y: number } }[];
  /** Cor sólida (contorno, glifos, curva). */
  color?: string;
  /** Contorno/glifos coloridos pela grandeza (mapa de cores) em vez da cor sólida. */
  colorByValue?: boolean;
  /** Mapa de cores (superfície e coloração pela grandeza). */
  colormap?: Colormap;
}

/** Legenda de uma vista: posição (fração do canvas), escala e fundo (cor, ou 'none' sem caixa). */
export interface LegendLayout {
  x?: number;
  y?: number;
  s?: number;
  /** Altura da barra de cores (px na escala 1). */
  h?: number;
  bg?: string;
}

/** Vista de resultados: uma aba do canvas com camadas (como uma "view" do ParaView). */
export interface ViewNode {
  id: Id;
  kind: 'view';
  name: string;
  physics: Id;
  /** Vista interpolada (suavizar): subdivisões por aresta (1–6); ausente = solução da malha. */
  level?: number;
  /** Legenda: canto superior esquerdo (fração da largura/altura do canvas) e escala; ausente = padrão. */
  legend?: LegendLayout;
}

/** Circuito externo (esquemático): componentes ligados por fios; bobinas = circuitos do FEM. */
export type PartKind = 'V' | 'I' | 'R' | 'L' | 'C' | 'coil' | 'gnd';
export interface SchPart {
  id: Id;
  kind: PartKind;
  name: string;
  x: number;
  y: number;
  rot: 0 | 90 | 180 | 270;
  /** Espelhado (troca os terminais de lado). */
  flip?: boolean;
  /** R (Ω), L (H), C (F): valor (expressão). */
  value?: string;
  /** Fontes: amplitude (V ou A), frequência (Hz), fase (graus) e nível CC. */
  amp?: string;
  freq?: string;
  phase?: string;
  dc?: string;
  /** Bobina: circuito do FEM representado. */
  circuit?: Id;
}
export interface SchWire {
  id: Id;
  a: { part: Id; pin: number };
  b: { part: Id; pin: number };
  /** x do trecho vertical do fio (arrastado para os lados); ausente = no meio entre os terminais. */
  mid?: number;
  /** y do trecho horizontal (arrastado para cima/baixo): o fio sobe/desce do terminal, corre nessa altura e volta. */
  midY?: number;
}
export interface SchematicNode {
  id: Id;
  kind: 'schematic';
  name: string;
  parts: SchPart[];
  wires: SchWire[];
}

/** Itens de uma tabela de resultados. */
export type TableItem = 'circuits' | 'lineint' | 'surfint' | 'formula';
export const TABLE_ITEMS: TableItem[] = ['circuits', 'lineint', 'surfint', 'formula'];

/** Tabela de resultados: uma aba com itens numéricos (circuitos, integrais). */
export interface TableNode {
  id: Id;
  kind: 'table';
  name: string;
  physics: Id;
}

/** Nós que o usuário inclui na árvore (o Pré-processador/Geometria é fixo). */
export type TreeNode = PhysicsNode | MeshNode | PostNode | ViewNode | TableNode | SchematicNode;

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
  /** Perdas no ferro (Steinmetz, W/m³): p = kh·f·B^alpha + ke·(f·B)², B = pico. Ausente = sem perdas no ferro. */
  kh?: number;
  alpha?: number;
  ke?: number;
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
  /** Região fora do domínio (não é malhada), como uma região sem rótulo no FEMM. */
  noMesh?: boolean;
  /** Circuito da região (a corrente vem dele; as espiras continuam na região). */
  circuit?: Id;
  /** Tamanho do elemento na região (expressão de comprimento); ausente = o da malha (automático). */
  meshSize?: string;
  /** Corrente total na região (A, expressão) — condutores/bobinas. */
  current?: string;
  /** Espiras (bobina). */
  turns?: number;
  /** Direção de magnetização (graus, expressão) — ímãs. */
  magnetAngle?: string;
}

/** Circuito (como no FEMM): regiões ligadas a ele recebem a corrente do circuito × espiras da região. */
export interface Circuit {
  id: Id;
  name: string;
  /** Corrente do circuito (A, expressão). */
  current: string;
  /** Série (a mesma corrente em todas as regiões). Paralelo fica para o transitório/harmônico. */
  kind: 'series' | 'parallel';
}

/**
 * Tipos de contorno do FEMM (mesma ordem): Prescribed A (dirichlet), Small skin depth, Mixed, Strategic dual image,
 * Periodic, Anti-periodic, Periodic/Anti-periodic air gap; e Neumann (no FEMM, a curva sem condição).
 */
export type BoundaryType = 'dirichlet' | 'skin' | 'mixed' | 'dualImage' | 'periodic' | 'antiperiodic' | 'periodicAirGap' | 'antiperiodicAirGap' | 'neumann';
export const BOUNDARY_TYPES: BoundaryType[] = ['dirichlet', 'skin', 'mixed', 'dualImage', 'periodic', 'antiperiodic', 'periodicAirGap', 'antiperiodicAirGap', 'neumann'];
/** Tipos que o solver ainda não resolve (harmônico ou entreferro móvel). */
export const BOUNDARY_UNSUPPORTED: BoundaryType[] = ['skin', 'dualImage', 'periodicAirGap', 'antiperiodicAirGap'];
export const BOUNDARY_COLOR: Record<BoundaryType, string> = {
  dirichlet: '#2ea043',
  skin: '#c2185b',
  mixed: '#1f78c8',
  dualImage: '#6d4c41',
  periodic: '#8e44ad',
  antiperiodic: '#d4880f',
  periodicAirGap: '#00897b',
  antiperiodicAirGap: '#7cb342',
  neumann: '#d93025',
};
export const boundaryColor = (b: { type: BoundaryType; color?: string }) => b.color ?? BOUNDARY_COLOR[b.type];

/** Condição de contorno aplicada a curvas do desenho. */
export interface Boundary {
  id: Id;
  name: string;
  type: BoundaryType;
  curves: Id[];
  /** Prescribed A: A = A0 + A1·x + A2·y (x, y em m), fase φ (graus, só no harmônico). value = A0 (Wb/m). */
  value?: string;
  a1?: string;
  a2?: string;
  phi?: string;
  /** Small skin depth: μr e σ (MS/m). */
  mu?: string;
  sigma?: string;
  /** Mixed: ν ∂A/∂n + c0·A + c1 = 0. */
  c0?: string;
  c1?: string;
  /** Air gap: ângulos interno e externo (graus). */
  innerAngle?: string;
  outerAngle?: string;
  /** Cor no desenho (ausente = a do tipo). */
  color?: string;
}

/**
 * Condições de contorno prontas em todo projeto (como os materiais padrão); recebem curvas ao serem usadas.
 * A primeira (OUTER_BOUNDARY) vale também, automaticamente, para a borda mais externa do desenho.
 */
export const OUTER_BOUNDARY = 'bd_a0';
export const DEFAULT_BOUNDARIES: Boundary[] = [
  { id: 'bd_a0', name: 'Dirichlet (A = 0)', type: 'dirichlet', curves: [] },
  { id: 'bd_neumann', name: 'Neumann', type: 'neumann', curves: [] },
  { id: 'bd_periodic', name: 'Periódico', type: 'periodic', curves: [] },
  { id: 'bd_antiperiodic', name: 'Antiperiódico', type: 'antiperiodic', curves: [] },
];

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
  circuits: Circuit[];
  /** Tamanho do elemento ao longo de curvas (id da curva → expressão de comprimento), ex. no entreferro. */
  curveSizes?: Record<Id, string>;
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
    nodes: [{ id: 'n1', kind: 'mesh', name: 'Malha 1', size: '', minAngle: 30 }],
    materials: DEFAULT_MATERIALS.map((m) => ({ ...m })),
    regionAssigns: [],
    boundaries: DEFAULT_BOUNDARIES.map((b) => ({ ...b, curves: [] })),
    circuits: [],
    nextId: 3,
  };
}

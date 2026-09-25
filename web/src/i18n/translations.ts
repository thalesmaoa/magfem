// Textos da interface em português e inglês (mesmo padrão do im-calc-map).
import type { ConstraintType } from '../cad/types';

export type Lang = 'pt' | 'en';

export interface Translations {
  app: { loading: string; solverFail: (e: string) => string; untitled: string };
  file: {
    new: string;
    open: string;
    save: string;
    saveAs: string;
    unsaved: string;
    savedTo: (n: string) => string;
    downloadedAs: (n: string) => string;
    saveError: (e: string) => string;
    openError: (e: string) => string;
    newDone: string;
    invalidFile: string;
    unsupportedVersion: (v: unknown) => string;
    projectName: string;
    renameHint: string;
    saveHint: string;
    export: string;
    exportHint: string;
    exportSvg: string;
    exportDxf: string;
    exportImg: string;
    exportChart: string;
    exportCsv: string;
    exportView: string;
  };
  bench: { pre: string; mesh: string; post: string; soon: (phase: string) => string };
  tree: {
    title: string;
    geometry: string;
    add: string;
    addPhysics: string;
    magnetic: string;
    addMesh: string;
    addPost: string;
    moreSoon: string;
    remove: string;
    rename: string;
    props: string;
    physicsProps: string;
    meshProps: string;
    postProps: string;
    only: string;
    rectangle: string;
    solver: string;
    addToSolver: string;
    results: string;
    addToMesh: string;
    addToResults: string;
    addToGeometry: string;
    variable: string;
    groupFromSelection: string;
    groupNeedsSelection: string;
  };
  drawer: { open: string; close: string };
  theme: { title: string; auto: string; light: string; dark: string };
  phase: (n: number) => string;
  console: { title: string; show: string; hide: string; popout: string; dock: string; resize: string; windowTitle: string };
  cite: {
    button: string;
    title: string;
    intro: string;
    full: string;
    bibtex: string;
    copy: string;
    copied: string;
    close: string;
  };
  tools: {
    select: string;
    measure: string;
    line: string;
    cline: string;
    rect: string;
    rectc: string;
    circle: string;
    arc3: string;
    arcc: string;
    point: string;
    dimension: string;
    undo: string;
    redo: string;
    fix: string;
    group: string;
    ungroup: string;
    construction: string;
    delete: string;
    fit: string;
    variants: string;
  };
  geom: Record<'coincident' | 'horizontal' | 'vertical' | 'parallel' | 'perpendicular' | 'tangent' | 'equal' | 'midpoint' | 'symmetric' | 'concentric', string>;
  constraintNames: Record<ConstraintType, string>;
  entity: { point: string; line: string; circle: string; arc: string; origin: string; group: (n: string) => string };
  hints: {
    select: string[];
    measure: string[];
    line: string[];
    cline: string[];
    rect: string[];
    rectc: string[];
    circle: string[];
    arc3: string[];
    arcc: string[];
    point: string[];
    dimension: string[];
  };
  msg: {
    notApplicable: string;
    noDimension: string;
    pickOther: string;
    pickOtherFromPoint: string;
    notConverged: string;
    conflicting: string;
    redundant: string;
    degenerate: string;
    dimension: (e: string) => string;
    positive: string;
    orientationRemoved: (n: number) => string;
    cannotDrag: string;
    originFixed: string;
    gluedToFixed: string;
    nameTaken: (n: string) => string;
    fixDropped: (n: number) => string;
    pickGroupMember: string;
  };
  status: {
    empty: string;
    defined: string;
    dof: (n: number) => string;
    coreLoading: string;
    core: (v: string) => string;
    coreError: (e: string) => string;
    polar: string;
    cartesian: string;
    toggleCoords: string;
    dofHint: string;
    legendFree: string;
    legendDefined: string;
  };
  problem: {
    title: string;
    unit: string;
    type: string;
    planar: string;
    axisymmetric: string;
    depth: string;
    analysis: string;
    magnetostatic: string;
    harmonic: string;
    transient: string;
    frequency: string;
    dt: string;
    tEnd: string;
  };
  vars: {
    title: string;
    add: string;
    name: string;
    expr: string;
    value: string;
    empty: string;
    del: string;
    help: string;
  };
  groups: {
    title: string;
    empty: string;
    members: (n: number) => string;
    show: string;
    hide: string;
    rename: string;
  };
  sel: {
    title: string;
    none: string;
    more: (n: number) => string;
    length: string;
    radius: string;
    fixed: string;
    construction: string;
    transform: string;
    dx: string;
    dy: string;
    angle: string;
    pivot: string;
    pivotCenter: string;
    pivotOrigin: string;
    apply: string;
    transformError: (e: string) => string;
    detach: string;
    detachHelp: string;
  };
  cons: { title: string; none: string; del: string; edit: string };
  consoleCmd: {
    placeholder: string;
    unclosedString: string;
    badChar: (c: string) => string;
    expected: (c: string) => string;
    incomplete: string;
    unexpected: (s: string) => string;
    leftover: (s: string) => string;
    undefinedName: (n: string) => string;
    notNumber: string;
    unknownObject: (o: string) => string;
    wantId: (v: string) => string;
    notFound: (v: string) => string;
    wantXY: (v: string) => string;
    wantPoint: (v: string) => string;
    wantLength: (v: string) => string;
    wantAngle: (v: string) => string;
    args: (fn: string, n: number) => string;
    notClosed: string;
    badCombination: (fn: string) => string;
    emptyGroup: string;
    useMenu: string;
    unknownFunction: (fn: string) => string;
    help: string;
  };
  offset: {
    tool: string;
    distance: string;
    flip: string;
    apply: string;
    branching: string;
    radiusCollapses: string;
    nothing: string;
    zero: string;
    hint: string;
    editHint: string;
    useOffsetDim: string;
    dimConflict: string;
  };
  patterns: {
    mirror: string;
    linear: string;
    circular: string;
    axis: string;
    axisX: string;
    axisY: string;
    axisLine: string;
    count: string;
    countX: string;
    countY: string;
    stepX: string;
    stepY: string;
    angle: string;
    center: string;
    centerOrigin: string;
    apply: string;
    nothing: string;
    axisMustBeLine: string;
    badCount: string;
    mirrorGroup: string;
    arrayGroup: string;
    circularGroup: string;
    pickButton: string;
    pickCancel: string;
    pickHint: string;
    editHint: string;
    symmetryTitle: string;
  };
  meas: {
    title: string;
    distance: string;
    minDistance: string;
    length: string;
    angle: string;
    center: string;
    radius: string;
    diameter: string;
    area: string;
    perimeter: string;
    sweep: string;
    arcLength: string;
  };
  mesh: {
    periodic: string;
    antiperiodic: string;
    dirichlet: string;
    neumann: string;
    noMaterial: string;
    materials: string;
    regions: string;
    boundaries: string;
    outerDefault: string;
    region: (n: number) => string;
    material: string;
    area: string;
    current: string;
    turns: string;
    magnetAngle: string;
    boundaryType: string;
    none: string;
    curves: (n: number) => string;
    hint: string;
    periodicNeedsTwo: string;
    addMaterial: string;
    newMaterial: string;
    name: string;
    color: string;
    mur: string;
    sigma: string;
    br: string;
    bh: string;
    bhPoints: (n: number) => string;
    removeMaterial: string;
    materialInUse: string;
    removeBoundary: string;
    noRegions: string;
    nodeHint: string;
    noRegionAt: (x: number, y: number) => string;
    failed: (e: string) => string;
    groups: Record<'air' | 'conductor' | 'steel' | 'magnet' | 'custom', string>;
    group: string;
    pickMaterial: string;
    editLibrary: string;
    editMaterial: string;
    libMaterials: string;
    libBoundaries: string;
    newBoundary: string;
    boundaryValue: string;
    boundary: string;
    newBoundaryFor: string;
    meshSize: string;
    auto: (v: string) => string;
    meshes: string;
    generate: string;
    generating: string;
    stats: (nodes: number, elements: number, angle: number, ms: number) => string;
    notGenerated: string;
    stale: string;
    globalSize: string;
    minAngle: string;
    mesher: string;
    sizeHint: string;
    stepMaterials: string;
    stepBoundaries: string;
    stepRegions: string;
    stepMeshes: string;
    curvesOf: (n: number) => string;
    unassigned: string;
    elements: (n: number) => string;
    elementsNode: string;
    regionName: string;
    outerHelp: string;
    bhAdd: string;
    turnsNonZero: string;
    bhPoint: string;
    bhClickHint: string;
    bhOpen: string;
    bhAddPoint: string;
    bhRemove: string;
    bhMonotonic: string;
    bhHelp: string;
    outerName: string;
    outerMakeEditable: string;
    minAngleHelp: string;
    nameTaken: (n: string) => string;
  };
  solve: {
    noMaterial: (n: number) => string;
    periodicMismatch: (name: string) => string;
    negativeR: string;
    noDirichlet: string;
    onlyStatic: string;
    failed: (e: string) => string;
    run: string;
    running: string;
    notSolved: string;
    stale: string;
    stats: (el: number, ms: number) => string;
    bmax: string;
    energy: string;
    map: string;
    lines: string;
    nLines: string;
    probeHint: string;
    probeOut: string;
    probeRegion: string;
    noSolution: string;
    linearNote: string;
    goResults: string;
  };
  post: {
    plots: Record<'surface' | 'contour' | 'arrow' | 'line', string>;
    plotHelp: Record<'surface' | 'contour' | 'arrow' | 'line', string>;
    by: Record<'surface' | 'contour' | 'arrow' | 'line', string>;
    qty: Record<'b' | 'h' | 'a' | 'j' | 'bn' | 'bt', string>;
    component: string;
    comps: Record<'mag' | 'x' | 'y', string>;
    view: string;
    parentView: string;
    copy: string;
    duplicate: string;
    rangeMin: string;
    rangeMax: string;
    rangeInvalid: string;
    rangeAutoBtn: string;
    interp: string;
    interpMenu: string;
    interpHelp: string;
    level: string;
    source: string;
    sourceSolution: string;
    filterStats: (tri: number) => string;
    colors: string;
    color: string;
    colormap: string;
    colormaps: Record<'turbo' | 'viridis' | 'coolwarm' | 'gray', string>;
    colorByValue: string;
    newView: string;
    addToView: string;
    drawing: string;
    closeTab: string;
    openChart: string;
    chart: string;
    logX: string;
    logY: string;
    bhTab: string;
    add: string;
    range: string;
    rangeAuto: string;
    spacing: string;
    scale: string;
    pickCurve: string;
    picking: string;
    curve: string;
    noCurve: string;
    quantity: string;
    flux: string;
    fluxHint: string;
    bAvg: string;
    bMax: string;
    length: string;
    outside: string;
    hide: string;
    show: string;
  };
  circuit: {
    name: string;
    title: string;
    add: string;
    current: string;
    kind: string;
    series: string;
    parallel: string;
    parallelSoon: string;
    remove: string;
    none: string;
    fromCircuit: (name: string, i: string) => string;
    regions: (n: number) => string;
    help: string;
    results: string;
    table: string;
    tableMenu: string;
    openTable: string;
    cols: { name: string; I: string; turns: string; lambda: string; L: string; R: string; V: string; P: string };
    note: string;
    empty: string;
  };
  hist: { title: string; empty: string; copy: string; copied: string; help: string };
  expr: {
    badNumber: (s: string) => string;
    badChar: (c: string) => string;
    expected: (c: string) => string;
    incomplete: string;
    unitNoNumber: (u: string) => string;
    unexpected: (s: string) => string;
    leftover: (s: string) => string;
    undefinedVar: (n: string) => string;
    mixedUnits: string;
    trigArg: string;
    divZero: string;
    exponent: string;
    args: (fn: string, n: number) => string;
    pureNumber: (fn: string) => string;
    noArgs: (fn: string) => string;
    notFinite: string;
    wantLength: string;
    wantAngle: string;
    circular: (path: string) => string;
    dependsOnError: (n: string) => string;
    badName: string;
    inUse: (n: string, where: string) => string;
    exists: (n: string) => string;
    dimError: (expr: string, why: string) => string;
    varError: (n: string, e: string) => string;
    mustBePositive: (expr: string, v: number) => string;
  };
}

const PT: Translations = {
  app: { loading: 'Carregando…', solverFail: (e) => `Falha ao carregar o solver de restrições: ${e}`, untitled: 'sem-titulo' },
  file: {
    new: 'Novo',
    open: 'Abrir…',
    save: 'Salvar',
    saveAs: 'Salvar como…',
    unsaved: 'Alterações não salvas no arquivo',
    savedTo: (n) => `Salvo em ${n}`,
    downloadedAs: (n) => `Baixado como ${n}`,
    saveError: (e) => `Erro ao salvar: ${e}`,
    openError: (e) => `Erro ao abrir: ${e}`,
    newDone: 'Novo projeto. Ctrl+Z recupera o anterior.',
    invalidFile: 'Arquivo não é um projeto magfem válido.',
    unsupportedVersion: (v) => `Versão de arquivo não suportada (${String(v)}). Atualize a página.`,
    projectName: 'Nome do projeto',
    renameHint: 'Nome do projeto — duplo clique para renomear',
    saveHint: 'Salvar o projeto inteiro (geometria, variáveis, árvore) em .magfem',
    export: 'Exportar',
    exportHint: 'Exportar a geometria (SVG, DXF) ou uma imagem (PNG, JPG)',
    exportSvg: 'vetorial, em mm',
    exportDxf: 'CAD (LibreCAD, FreeCAD...), em mm',
    exportImg: 'imagem do desenho',
    exportChart: 'gráfico desta aba',
    exportCsv: 'dados desta aba (planilha)',
    exportView: 'imagem da vista (campo)',
  },
  bench: {
    pre: 'Pré-processador',
    mesh: 'Malha',
    post: 'Pós-processador',
    soon: (p) => `Em construção — chega na ${p} do plano.`,
  },
  tree: {
    title: 'Modelo',
    geometry: 'Geometria',
    add: 'Adicionar à árvore',
    addPhysics: 'Física',
    magnetic: 'Campo magnético',
    addMesh: 'Malha',
    addPost: 'Resultado',
    moreSoon: 'Outras físicas (térmica, elétrica, mecânica) virão depois.',
    remove: 'Remover',
    rename: 'Duplo clique para renomear',
    props: 'Propriedades',
    physicsProps: 'Física',
    meshProps: 'Malha',
    postProps: 'Resultado',
    only: 'Selecione um item da árvore.',
    rectangle: 'Retângulo',
    solver: 'Método de resolução',
    addToSolver: 'Incluir no método de resolução',
    results: 'Resultados',
    addToMesh: 'Incluir malha',
    addToResults: 'Incluir resultado',
    addToGeometry: 'Incluir na geometria',
    variable: 'Variável',
    groupFromSelection: 'Grupo (da seleção)',
    groupNeedsSelection: 'Selecione entidades no desenho primeiro',
  },
  drawer: { open: 'Problema e bibliotecas', close: 'Fechar painel' },
  theme: { title: 'Tema', auto: 'automático (segue o sistema)', light: 'claro', dark: 'escuro' },
  phase: (n) => `Fase ${n}`,
  console: { title: 'Console', show: 'Mostrar console', hide: 'Ocultar console', popout: 'Abrir em outra janela', dock: 'Voltar para baixo do desenho', resize: 'Arraste para mudar a altura', windowTitle: 'MagFEM — console' },
  cite: {
    button: 'Citar',
    title: 'Cite este trabalho',
    intro: 'Se o MagFEM ajudou na sua pesquisa ou no seu projeto, por favor cite:',
    full: 'Citação completa',
    bibtex: 'BibTeX',
    copy: 'Copiar',
    copied: 'Copiado!',
    close: 'Fechar',
  },
  tools: {
    select: 'Selecionar',
    measure: 'Régua (medir)',
    line: 'Linha',
    cline: 'Linha de construção',
    rect: 'Retângulo por vértices',
    rectc: 'Retângulo pelo centro',
    circle: 'Círculo',
    arc3: 'Arco por 3 pontos',
    arcc: 'Arco pelo centro',
    point: 'Ponto',
    dimension: 'Cota (1 ou 2 entidades)',
    undo: 'Desfazer',
    redo: 'Refazer',
    fix: 'Fixar / soltar pontos',
    group: 'Agrupar',
    ungroup: 'Desagrupar',
    construction: 'Construção',
    delete: 'Apagar',
    fit: 'Ajustar vista',
    variants: 'outras opções',
  },
  geom: {
    coincident: 'Coincidente',
    horizontal: 'Horizontal',
    vertical: 'Vertical',
    parallel: 'Paralela',
    perpendicular: 'Perpendicular',
    tangent: 'Tangente',
    equal: 'Igual',
    midpoint: 'Ponto médio',
    symmetric: 'Simétrica',
    concentric: 'Concêntrica',
  },
  constraintNames: {
    coincident: 'Coincidente',
    horizontal: 'Horizontal',
    vertical: 'Vertical',
    parallel: 'Paralela',
    perpendicular: 'Perpendicular',
    tangent: 'Tangente',
    equal: 'Igual',
    pointOn: 'Ponto sobre',
    midpoint: 'Ponto médio',
    symmetric: 'Simétrica',
    symmetricPoint: 'Simétrica (centro)',
    concentric: 'Concêntrica',
    radiusDiff: 'Raio relativo (offset)',
    coordDiff: 'Passo (padrão)',
    midpointOnLine: 'Simétrica (ponto médio no eixo)',
    distance: 'Distância',
    hdistance: 'Distância horizontal',
    vdistance: 'Distância vertical',
    radius: 'Raio',
    diameter: 'Diâmetro',
    angle: 'Ângulo',
  },
  entity: { point: 'Ponto', line: 'Linha', circle: 'Círculo', arc: 'Arco', origin: 'Origem', group: (n) => `Grupo "${n}"` },
  hints: {
    select: ['Clique para selecionar (Shift soma). Arraste para mover; solte um ponto sobre outro para uni-los. Duplo clique entra num grupo.'],
    measure: ['Régua: clique o primeiro ponto (encaixa em pontos e curvas).', 'Clique o segundo ponto.', 'Clique para medir de novo; Esc limpa.'],
    line: ['Clique o ponto inicial.', 'Clique o próximo ponto. Duplo clique ou Esc termina.'],
    cline: ['Linha de construção (tracejada, só apoio; não vira região): clique o ponto inicial.', 'Clique o próximo ponto. Duplo clique ou Esc termina.'],
    rect: ['Clique o primeiro vértice.', 'Clique o vértice oposto.'],
    rectc: ['Clique o centro do retângulo.', 'Clique um vértice.'],
    circle: ['Clique o centro.', 'Clique para definir o raio.'],
    arc3: ['Clique o início do arco.', 'Clique o fim do arco.', 'Clique um ponto por onde o arco passa.'],
    arcc: ['Clique o centro do arco.', 'Clique o início (define o raio).', 'Clique o fim; o sentido segue o movimento do mouse.'],
    point: ['Clique para criar um ponto.'],
    dimension: [
      'Clique a primeira entidade (linha, ponto, círculo ou arco).',
      'Clique outra entidade para cotar entre as duas (ângulo, distância), ou clique no vazio para posicionar.',
      'Clique para posicionar a cota.',
    ],
  },
  msg: {
    notApplicable: 'Essa restrição não se aplica à seleção atual.',
    noDimension: 'Essa seleção não forma uma cota.',
    pickOther: 'Essas duas entidades não formam uma cota.',
    pickOtherFromPoint: 'Clique outra entidade para cotar a partir do ponto.',
    notConverged: 'O solver não convergiu com essa alteração.',
    conflicting: 'Restrição conflitante com as existentes.',
    redundant: 'Restrição redundante (já está definida por outras).',
    degenerate: 'A alteração colapsaria uma curva (restrições incompatíveis).',
    dimension: (e) => `Cota: ${e}`,
    positive: 'O valor da cota deve ser positivo',
    orientationRemoved: (n) => `${n} restrição(ões) horizontal/vertical removida(s): deixariam de valer após a rotação.`,
    cannotDrag: 'Totalmente definido pelas restrições (preto): não pode ser arrastado. Edite ou apague uma cota/restrição para liberar.',
    originFixed: 'A origem é fixa.',
    fixDropped: (n) => `${n} restrição(ões) entre pontos agora fixos foram removidas (ficariam redundantes).`,
    pickGroupMember: 'A seleção tem um grupo inteiro. Para restringir, pegue o lado específico: Shift+clique na linha do grupo.',
    nameTaken: (n) => `O nome "${n}" já está em uso no desenho (nomes são únicos para que getid("${n}") seja inequívoco).`,
    gluedToFixed: 'Está preso à origem (um canto é o próprio ponto de origem). Use "Soltar da origem" no painel de propriedades para poder mover.',
  },
  status: {
    empty: 'Sketch vazio',
    defined: 'Totalmente definido',
    dof: (n) => `${n} grau${n > 1 ? 's' : ''} de liberdade`,
    coreLoading: 'núcleo FEM: carregando…',
    core: (v) => `núcleo FEM v${v}`,
    coreError: (e) => `núcleo FEM: erro (${e})`,
    polar: 'polar',
    cartesian: 'cartesiano',
    toggleCoords: 'Clique para alternar entre coordenadas cartesianas e polares',
    dofHint: 'O desenho ainda pode se mover: cote e restrinja até chegar a zero (tudo preto/branco).',
    legendFree: 'livre',
    legendDefined: 'definido',
  },
  problem: {
    title: 'Problema',
    unit: 'Unidade',
    type: 'Tipo',
    planar: 'Planar (x, y)',
    axisymmetric: 'Axissimétrico (r, z)',
    depth: 'Profundidade',
    analysis: 'Análise',
    magnetostatic: 'Magnetostática',
    harmonic: 'Harmônica (AC)',
    transient: 'Transiente',
    frequency: 'Frequência (Hz)',
    dt: 'Passo de tempo (s)',
    tEnd: 'Tempo final (s)',
  },
  vars: {
    title: 'Variáveis',
    add: '+ variável',
    name: 'Nome',
    expr: 'Expressão',
    value: 'Valor',
    empty: 'Nenhuma. Crie variáveis e use-as nas cotas (ex.: "Ds/2 - g").',
    del: 'Apagar variável',
    help: 'Aceita contas e funções: =1+1, Ds/2 - g, 50 mm, 15 deg, + − * / ^, abs, sqrt, sin, cos, tan, atan2, exp, ln, log10, pow, min, max, round, pi.',
  },
  groups: {
    title: 'Grupos',
    empty: 'Selecione entidades e use Ctrl+G para agrupar.',
    members: (n) => `${n} ${n === 1 ? 'item' : 'itens'}`,
    show: 'Mostrar',
    hide: 'Ocultar',
    rename: 'Duplo clique para renomear',
  },
  sel: {
    title: 'Seleção',
    none: 'Nada selecionado. Clique numa entidade (Shift adiciona) ou arraste uma caixa.',
    more: (n) => `… e mais ${n}`,
    length: 'comprimento',
    radius: 'raio',
    fixed: 'fixo',
    construction: 'construção',
    transform: 'Mover / girar',
    dx: 'Δx',
    dy: 'Δy',
    angle: 'Ângulo',
    pivot: 'Pivô',
    pivotCenter: 'centro da seleção',
    pivotOrigin: 'origem',
    apply: 'Aplicar',
    transformError: (e) => `Mover/girar: ${e}`,
    detach: 'Soltar da origem',
    detachHelp: 'A seleção está ligada à origem (ponto fixo) e por isso não se move. Soltar cria um ponto próprio no mesmo lugar.',
  },
  cons: { title: 'Restrições', none: 'Nenhuma ainda.', del: 'Apagar restrição', edit: 'Editar valor' },
  consoleCmd: {
    placeholder: 'Digite um comando (ex.: g.line((0, 0), (40, 0))) — Tab completa, help() lista os comandos',
    unclosedString: 'Texto entre aspas sem fechar',
    badChar: (c) => `Caractere inesperado "${c}"`,
    expected: (c) => `Esperado "${c}"`,
    incomplete: 'Comando incompleto',
    unexpected: (s) => `Símbolo inesperado "${s}"`,
    leftover: (s) => `Sobrou "${s}"`,
    undefinedName: (n) => `"${n}" não existe (nem variável do console, nem id/nome do desenho)`,
    notNumber: 'Conta só com números',
    unknownObject: (o) => `Objeto desconhecido "${o}" (use s.)`,
    wantId: (v) => `Esperado um id ou nome entre aspas, veio ${v}`,
    notFound: (v) => `Não existe "${v}" no desenho`,
    wantXY: (v) => `Esperado um ponto (x, y), veio ${v}`,
    wantPoint: (v) => `"${v}" não é um ponto`,
    wantLength: (v) => `Esperado um comprimento (número ou "50 mm"), veio ${v}`,
    wantAngle: (v) => `Esperado um ângulo (número em graus ou "30 deg"), veio ${v}`,
    args: (fn, n) => `${fn}() precisa de pelo menos ${n} argumento(s)`,
    notClosed: 'As entidades não formam um contorno fechado',
    badCombination: (fn) => `${fn}() não se aplica a essas entidades`,
    emptyGroup: 'Nada para agrupar',
    useMenu: 'Use o menu Novo/Abrir para isso',
    unknownFunction: (fn) => `Comando desconhecido "${fn}" — help() lista os comandos`,
    help: `Comandos — g = Geometria (d também), m = Malha, s = Método de resolução, r = Resultados; sem objeto vale geometria (mesma sintaxe do histórico; ids ou nomes; números na unidade atual; strings aceitam unidades e variáveis):
  g.point((x, y))  g.line(a, b, construction=False)  g.circle(c, r=5)  g.arc(c, início, fim)
  g.rectangle(canto, oposto)  g.rectangle_center(centro, canto)
  g.horizontal(l)  g.vertical(l)  g.parallel(a, b)  g.perpendicular(a, b)  g.tangent(a, b)  g.equal(a, b)
  g.coincident(a, b)  g.midpoint(p, l)  g.symmetric(p1, p2, l)  g.concentric(c1, c2)
  g.distance(a, [b,] "50 mm")  g.hdistance(...)  g.vdistance(...)  g.radius(c, "L/2")  g.diameter(c, 10)  g.angle(l1, l2, "30 deg")
  g.set_dimension("k5", "g*2")  g.var("g", "0.5 mm")  g.del_var("g")  g.rename_var("g", "gap")
  g.delete(ids...)  g.rename(id, "nome")  g.group([ids], name="rotor")  g.ungroup(g)  g.hide(g)  g.show(g)
  g.move(p, (x, y))  g.translate(ids, dx=5, dy=0)  g.rotate(ids, "15 deg", pivot=(0, 0))  g.detach("O")
  g.fix(p)  g.unfix(p)  g.construction(ids, True)  g.units("mm")  g.problem("planar", depth="100 mm")
  Malha: m.add()  m.rename(id, "fina")  m.remove(id)   Método de resolução: s.add()  s.physics("n2", analysis="harmonic", frequency="60")   Resultados: r.add()
  Modificar: g.offset(ids, "2 mm")  g.mirror(ids, axis="y")  g.array(ids, nx=3, dx="20 mm")  g.array_circular(ids, n=6, angle="360 deg")
Consulta: getid("kru1")  g.get(id)  g.list()  g.measure(a, b)  g.area(ids)  g.value("k5")  g.dof()  fit()  undo()  redo()
Atribuição: l = g.line((0, 0), (10, 0)) e depois use l. Setas ↑/↓ = comandos anteriores.`,
  },
  offset: {
    tool: 'Offset',
    distance: 'Distância',
    flip: 'Inverter lado',
    apply: 'Aplicar',
    branching: 'Offset: a seleção tem pontos com mais de duas curvas (bifurcação).',
    radiusCollapses: 'Offset: o raio de um arco/círculo ficaria zero ou negativo.',
    nothing: 'Offset: selecione linhas, arcos ou círculos.',
    zero: 'Offset: a distância não pode ser zero.',
    hint: 'Positivo = para fora do contorno fechado (ou à esquerda de uma cadeia aberta).',
    editHint: 'Negativo inverte o lado. Arrastar o offset no desenho também muda a distância.',
    useOffsetDim: 'A distância entre o offset e o original é a cota do offset (verde): edite o valor dela.',
    dimConflict: 'Essa cota conflita com o offset (ele é definido pelo original e pela distância). Edite a cota verde do offset ou cote o original.',
  },
  patterns: {
    mirror: 'Espelhar',
    linear: 'Padrão linear (x, y)',
    circular: 'Padrão circular',
    axis: 'Eixo',
    axisX: 'eixo X',
    axisY: 'eixo Y',
    axisLine: 'linha selecionada',
    count: 'Quantidade',
    countX: 'Qtd. em x',
    countY: 'Qtd. em y',
    stepX: 'Passo x',
    stepY: 'Passo y',
    angle: 'Ângulo total',
    center: 'Centro',
    centerOrigin: 'origem',
    apply: 'Aplicar',
    nothing: 'Selecione o que copiar.',
    axisMustBeLine: 'O eixo do espelho precisa ser uma linha.',
    badCount: 'Quantidade inválida (entre 2 e 400 cópias no total).',
    mirrorGroup: 'Espelho',
    arrayGroup: 'Padrão',
    circularGroup: 'Padrão circular',
    pickButton: 'Escolher linha no desenho',
    pickCancel: 'Cancelar escolha',
    pickHint: 'Clique na linha que será o eixo do espelho (Esc cancela).',
    editHint: 'As cópias seguem o original. Arrastar uma cópia também muda o espaçamento.',
    symmetryTitle: 'Simetria entre os dois pontos',
  },
  meas: {
    title: 'Medidas',
    distance: 'Distância',
    minDistance: 'Distância mínima',
    length: 'Comprimento',
    angle: 'Ângulo',
    center: 'Centro',
    radius: 'Raio',
    diameter: 'Diâmetro',
    area: 'Área',
    perimeter: 'Perímetro',
    sweep: 'Abertura',
    arcLength: 'Comprimento do arco',
  },
  mesh: {
    periodic: 'Periódico',
    antiperiodic: 'Antiperiódico',
    dirichlet: 'A = 0 (Dirichlet)',
    neumann: 'Neumann (fluxo tangente)',
    noMaterial: 'sem material',
    materials: 'Materiais',
    regions: 'Regiões',
    boundaries: 'Contornos',
    outerDefault: 'Borda externa (A = 0)',
    region: (n) => `Região ${n}`,
    material: 'Material',
    area: 'Área',
    current: 'Corrente por espira (A)',
    turns: 'Espiras',
    magnetAngle: 'Direção da magnetização (°)',
    boundaryType: 'Condição de contorno',
    none: '— nenhuma —',
    curves: (n) => `${n} curva${n === 1 ? '' : 's'} selecionada${n === 1 ? '' : 's'}`,
    hint: 'Clique numa região para escolher o material; clique nas bordas (Shift para várias) para definir o contorno. A borda externa é A = 0 por padrão.',
    periodicNeedsTwo: 'Periódico/antiperiódico liga pares de curvas: selecione duas.',
    addMaterial: 'Novo material',
    newMaterial: 'Material',
    name: 'Nome',
    color: 'Cor',
    mur: 'μr (permeabilidade relativa)',
    sigma: 'σ (MS/m)',
    br: 'Br do ímã (T)',
    bh: 'Curva B-H',
    bhPoints: (n) => `não linear, ${n} pontos`,
    removeMaterial: 'Remover material',
    materialInUse: 'Material em uso por uma região.',
    removeBoundary: 'Remover contorno',
    noRegions: 'Nenhuma região fechada no desenho.',
    nodeHint: 'Geração da malha (Triangle) chega na próxima etapa. Defina antes materiais e contornos.',
    noRegionAt: (x, y) => `Nenhuma região fechada contém o ponto (${x}, ${y}).`,
    nameTaken: (n) => `Já existe um material "${n}".`,
    failed: (e) => `Falha ao gerar a malha: ${e}`,
    groups: { air: 'Ar e gases', conductor: 'Condutores', steel: 'Aços elétricos', magnet: 'Ímãs', custom: 'Personalizados' },
    group: 'Grupo',
    pickMaterial: 'Escolher material',
    editLibrary: 'Editar biblioteca…',
    editMaterial: 'Editar este material',
    libMaterials: 'Materiais',
    libBoundaries: 'Contornos',
    newBoundary: 'Novo contorno',
    boundaryValue: 'A prescrito (Wb/m)',
    boundary: 'Contorno',
    newBoundaryFor: 'Novo contorno…',
    meshSize: 'Tamanho do elemento',
    auto: (v) => `automático (${v})`,
    meshes: 'Malhas',
    generate: 'Gerar malha',
    generating: 'Gerando…',
    stats: (n, e, a, ms) => `${n} nós · ${e} triângulos · ângulo mín. ${a.toFixed(1)}° · ${Math.round(ms)} ms`,
    notGenerated: 'Ainda não gerada.',
    stale: 'O desenho ou as configurações mudaram: gere a malha de novo.',
    globalSize: 'Tamanho padrão do elemento',
    minAngle: 'Ângulo mínimo (qualidade, °)',
    mesher: 'Gerador: Triangle (J. R. Shewchuk), Delaunay com qualidade.',
    sizeHint: 'Vazio = automático. Aceita expressões com variáveis ("g/4").',
    stepMaterials: '1. Clique numa região (aqui ou no desenho) e escolha o material.',
    stepBoundaries: '2. Clique nas bordas no desenho (Shift para várias) e escolha o contorno. A borda externa é A = 0 por padrão.',
    stepRegions: '3. Ajuste o tamanho dos elementos por região (vazio = automático).',
    stepMeshes: '4. Gere a malha.',
    curvesOf: (n) => `${n} curva${n === 1 ? '' : 's'}`,
    unassigned: 'sem contorno (Neumann natural)',
    elements: (n) => `${n} el.`,
    elementsNode: 'Elementos',
    regionName: 'Nome da região',
    bhAdd: 'Incluir curva B-H (não linear)',
    turnsNonZero: 'Espiras: qualquer número diferente de zero (negativo inverte o sentido).',
    bhPoint: 'Ponto',
    bhClickHint: 'Clique num ponto para editar.',
    bhOpen: 'Ver curva B-H (aba)',
    bhAddPoint: 'Ponto',
    bhRemove: 'Remover curva (usar μr linear)',
    bhMonotonic: 'A curva precisa ter H e B crescentes.',
    bhHelp: 'Pares (H, B) crescentes a partir de (0, 0). O solver ainda usa o μr linear; a curva entra na próxima etapa (não linear).',
    outerHelp: 'Curvas da borda externa que não têm contorno recebem A = 0 automaticamente.',
    outerName: 'Borda externa',
    outerMakeEditable: 'Tornar editável (virar um contorno)',
    minAngleHelp: 'Nenhum triângulo terá ângulo interno menor que este. Triângulos achatados pioram a precisão do campo; valores maiores dão elementos mais regulares, porém mais elementos. 30° é um bom padrão; o máximo aceito é 34°.',
  },
  solve: {
    noMaterial: (n) => `Região ${n} sem material.`,
    periodicMismatch: (b) => `${b}: as duas curvas precisam do mesmo número de nós (gere a malha de novo).`,
    negativeR: 'Axissimétrico: há geometria com r < 0 (o eixo é x = 0).',
    noDirichlet: 'Falta um contorno com A prescrito (sem ele o potencial fica indefinido).',
    onlyStatic: 'Por enquanto só a análise magnetostática resolve; harmônica e transitória vêm depois.',
    failed: (e) => `Falha ao resolver: ${e}`,
    run: 'Resolver',
    running: 'Resolvendo…',
    notSolved: 'Ainda não resolvido.',
    stale: 'O projeto mudou depois da solução: resolva de novo.',
    stats: (el, ms) => `${el} triângulos · ${Math.round(ms)} ms`,
    bmax: '|B| máximo',
    energy: 'Energia magnética',
    map: 'Mapa de |B|',
    lines: 'Linhas de fluxo',
    nLines: 'Número de linhas',
    probeHint: 'Clique no desenho para ver B, H e A no ponto.',
    probeOut: 'Ponto fora da malha.',
    probeRegion: 'Região',
    noSolution: 'Resolva o problema em Método de resolução (▶).',
    linearNote: 'Materiais com curva B-H usam o μr linear por enquanto (não linear na próxima etapa).',
    goResults: 'Ver resultados',
  },
  post: {
    plots: { surface: 'Superfície', contour: 'Contorno', arrow: 'Glifos', line: 'Gráfico sobre linha' },
    plotHelp: { surface: 'mapa de cores 2D', contour: 'isolinhas (A = linhas de fluxo)', arrow: 'vetores', line: 'valores e fluxo ao longo de uma curva' },
    by: { surface: 'Colorir por', contour: 'Contorno por', arrow: 'Orientação', line: 'Grandeza' },
    qty: { b: 'B — densidade de fluxo', h: 'H — intensidade de campo', a: 'A — potencial vetor', j: 'J — densidade de corrente', bn: 'B normal', bt: 'B tangencial' },
    component: 'Componente',
    comps: { mag: 'Magnitude', x: 'X (r)', y: 'Y (z)' },
    view: 'Vista',
    parentView: 'Vista (pai)',
    copy: 'cópia',
    duplicate: 'Duplicar',
    rangeMin: 'Limite inferior',
    rangeMax: 'Limite superior',
    rangeInvalid: 'O superior precisa ser maior que o inferior.',
    rangeAutoBtn: 'Automático',
    interp: 'Interpolação',
    interpMenu: 'Nova vista interpolada (suavizar)',
    interpHelp: 'Interpolante de 2º grau por triângulo (gradiente recuperado nos nós, sem misturar materiais) e subdivisão: contornos curvos e transições suaves. Todos os gráficos desta vista usam os dados interpolados.',
    level: 'Subdivisões por aresta',
    source: 'Dados',
    sourceSolution: 'Solução (malha)',
    filterStats: (n) => `${n} triângulos refinados`,
    colors: 'Cores',
    color: 'Cor',
    colormap: 'Mapa de cores',
    colormaps: { turbo: 'Turbo (arco-íris)', viridis: 'Viridis', coolwarm: 'Frio-quente (divergente)', gray: 'Cinza' },
    colorByValue: 'Colorir pela grandeza',
    newView: 'Nova vista (aba) com…',
    addToView: 'Incluir nesta vista',
    drawing: 'Desenho',
    closeTab: 'Fechar aba',
    openChart: 'Abrir gráfico em aba',
    chart: 'Gráfico',
    logX: 'eixo x log',
    logY: 'eixo y log',
    bhTab: 'Curva B-H',
    add: 'Incluir visualização',
    range: 'Faixa de cores',
    rangeAuto: 'automática (ex.: 0; 1,5)',
    spacing: 'Espaçamento (mm)',
    scale: 'Escala',
    pickCurve: 'Escolher curva no desenho',
    picking: 'Clique numa linha, arco ou círculo do desenho…',
    curve: 'Curva',
    noCurve: 'Escolha uma curva (pode ser uma linha de construção desenhada só para isso).',
    quantity: 'Grandeza',
    flux: 'Fluxo através da curva',
    fluxHint: 'Sentido positivo: normal à esquerda do percurso (seta rosa). No plano, por metro × profundidade do problema.',
    bAvg: '|B| médio',
    bMax: '|B| máximo',
    length: 'Comprimento',
    outside: 'A curva está fora da malha.',
    hide: 'Ocultar',
    show: 'Mostrar',
  },
  circuit: {
    name: 'Circuito',
    title: 'Circuitos',
    add: 'Novo circuito',
    current: 'Corrente (A)',
    kind: 'Ligação',
    series: 'Série',
    parallel: 'Paralelo',
    parallelSoon: 'Paralelo entra com o transitório/harmônico (divisão de corrente pelas impedâncias).',
    remove: 'Remover circuito',
    none: '— nenhum (corrente da região) —',
    fromCircuit: (n, i) => `do circuito ${n}: ${i} A`,
    regions: (n) => `${n} região${n === 1 ? '' : 'ões'}`,
    help: 'Ligue regiões ao circuito em Materiais › região › Circuito. A corrente vem do circuito; cada região usa suas espiras (negativo = sentido de volta).',
    results: 'Circuitos',
    table: 'Tabela de circuitos',
    tableMenu: 'Circuitos (tabela)',
    openTable: 'Abrir tabela em aba',
    cols: { name: 'Circuito', I: 'I (A)', turns: 'Espiras', lambda: 'λ (Wb)', L: 'L = λ/I (H)', R: 'R CC (Ω)', V: 'V CC (V)', P: 'Perdas I²R (W)' },
    note: 'Indutância aparente λ/I (com vários circuitos, inclui o acoplamento). R CC com fator de enchimento 1; no plano, sem as cabeceiras.',
    empty: 'Nenhum circuito. Crie em Malha › Circuitos.',
  },
  hist: {
    title: 'Histórico',
    empty: 'Cada ação aparece aqui como o comando equivalente da API.',
    copy: 'Copiar script',
    copied: 'Script copiado',
    help: 'Código equivalente (API Python do magfem). Itens em cinza foram desfeitos.',
  },
  expr: {
    badNumber: (s) => `Número inválido em "${s}"`,
    badChar: (c) => `Caractere inesperado "${c}"`,
    expected: (c) => `Esperado "${c}"`,
    incomplete: 'Expressão incompleta',
    unitNoNumber: (u) => `Unidade "${u}" sem número`,
    unexpected: (s) => `Símbolo inesperado "${s}"`,
    leftover: (s) => `Sobrou "${s}"`,
    undefinedVar: (n) => `Variável "${n}" não definida`,
    mixedUnits: 'Soma de grandezas com unidades diferentes',
    trigArg: 'Argumento de função trigonométrica deve ser ângulo',
    divZero: 'Divisão por zero',
    exponent: 'Expoente deve ser adimensional',
    args: (fn, n) => `${fn}() espera ${n} argumento(s)`,
    pureNumber: (fn) => `${fn}() espera número puro`,
    noArgs: (fn) => `${fn}() sem argumentos`,
    notFinite: 'Resultado não é um número finito',
    wantLength: 'A cota espera um comprimento',
    wantAngle: 'A cota espera um ângulo',
    circular: (p) => `Dependência circular: ${p}`,
    dependsOnError: (n) => `Depende de "${n}", que tem erro`,
    badName: 'Nome inválido (use letras, números e _; não use nomes de unidades/funções)',
    inUse: (n, w) => `"${n}" está em uso: ${w}`,
    exists: (n) => `Já existe a variável "${n}"`,
    dimError: (e, w) => `Cota "${e}": ${w}`,
    varError: (n, e) => `variável ${n} com erro (${e})`,
    mustBePositive: (e, v) => `Cota "${e}" = ${v}: o valor deve ser positivo`,
  },
};

const EN: Translations = {
  app: { loading: 'Loading…', solverFail: (e) => `Failed to load the constraint solver: ${e}`, untitled: 'untitled' },
  file: {
    new: 'New',
    open: 'Open…',
    save: 'Save',
    saveAs: 'Save as…',
    unsaved: 'Unsaved changes',
    savedTo: (n) => `Saved to ${n}`,
    downloadedAs: (n) => `Downloaded as ${n}`,
    saveError: (e) => `Save error: ${e}`,
    openError: (e) => `Open error: ${e}`,
    newDone: 'New project. Ctrl+Z restores the previous one.',
    invalidFile: 'Not a valid magfem project file.',
    unsupportedVersion: (v) => `Unsupported file version (${String(v)}). Reload the page.`,
    projectName: 'Project name',
    renameHint: 'Project name — double-click to rename',
    saveHint: 'Save the whole project (geometry, variables, tree) as .magfem',
    export: 'Export',
    exportHint: 'Export the geometry (SVG, DXF) or an image (PNG, JPG)',
    exportSvg: 'vector, in mm',
    exportDxf: 'CAD (LibreCAD, FreeCAD...), in mm',
    exportImg: 'image of the drawing',
    exportChart: 'chart in this tab',
    exportCsv: 'data in this tab (spreadsheet)',
    exportView: 'view image (field)',
  },
  bench: {
    pre: 'Pre-processor',
    mesh: 'Mesh',
    post: 'Post-processor',
    soon: (p) => `Under construction — arrives in ${p} of the plan.`,
  },
  tree: {
    title: 'Model',
    geometry: 'Geometry',
    add: 'Add to tree',
    addPhysics: 'Physics',
    magnetic: 'Magnetic field',
    addMesh: 'Mesh',
    addPost: 'Result',
    moreSoon: 'Other physics (thermal, electric, mechanical) will come later.',
    remove: 'Remove',
    rename: 'Double-click to rename',
    props: 'Properties',
    physicsProps: 'Physics',
    meshProps: 'Mesh',
    postProps: 'Result',
    only: 'Select an item in the tree.',
    rectangle: 'Rectangle',
    solver: 'Solver',
    addToSolver: 'Add to solver',
    results: 'Results',
    addToMesh: 'Add mesh',
    addToResults: 'Add result',
    addToGeometry: 'Add to geometry',
    variable: 'Variable',
    groupFromSelection: 'Group (from selection)',
    groupNeedsSelection: 'Select entities in the drawing first',
  },
  drawer: { open: 'Problem and libraries', close: 'Close panel' },
  theme: { title: 'Theme', auto: 'automatic (follows the system)', light: 'light', dark: 'dark' },
  phase: (n) => `phase ${n}`,
  console: { title: 'Console', show: 'Show console', hide: 'Hide console', popout: 'Open in a separate window', dock: 'Dock below the drawing', resize: 'Drag to change the height', windowTitle: 'MagFEM — console' },
  cite: {
    button: 'Cite',
    title: 'Cite this work',
    intro: 'If MagFEM helped your research or project, please cite:',
    full: 'Full citation',
    bibtex: 'BibTeX',
    copy: 'Copy',
    copied: 'Copied!',
    close: 'Close',
  },
  tools: {
    select: 'Select',
    measure: 'Ruler (measure)',
    line: 'Line',
    cline: 'Construction line',
    rect: 'Corner rectangle',
    rectc: 'Center rectangle',
    circle: 'Circle',
    arc3: '3-point arc',
    arcc: 'Center arc',
    point: 'Point',
    dimension: 'Dimension (1 or 2 entities)',
    undo: 'Undo',
    redo: 'Redo',
    fix: 'Fix / unfix points',
    group: 'Group',
    ungroup: 'Ungroup',
    construction: 'Construction',
    delete: 'Delete',
    fit: 'Zoom to fit',
    variants: 'more options',
  },
  geom: {
    coincident: 'Coincident',
    horizontal: 'Horizontal',
    vertical: 'Vertical',
    parallel: 'Parallel',
    perpendicular: 'Perpendicular',
    tangent: 'Tangent',
    equal: 'Equal',
    midpoint: 'Midpoint',
    symmetric: 'Symmetric',
    concentric: 'Concentric',
  },
  constraintNames: {
    coincident: 'Coincident',
    horizontal: 'Horizontal',
    vertical: 'Vertical',
    parallel: 'Parallel',
    perpendicular: 'Perpendicular',
    tangent: 'Tangent',
    equal: 'Equal',
    pointOn: 'Point on',
    midpoint: 'Midpoint',
    symmetric: 'Symmetric',
    symmetricPoint: 'Symmetric (center)',
    concentric: 'Concentric',
    radiusDiff: 'Relative radius (offset)',
    coordDiff: 'Step (pattern)',
    midpointOnLine: 'Symmetric (midpoint on axis)',
    distance: 'Distance',
    hdistance: 'Horizontal distance',
    vdistance: 'Vertical distance',
    radius: 'Radius',
    diameter: 'Diameter',
    angle: 'Angle',
  },
  entity: { point: 'Point', line: 'Line', circle: 'Circle', arc: 'Arc', origin: 'Origin', group: (n) => `Group "${n}"` },
  hints: {
    select: ['Click to select (Shift adds). Drag to move; drop a point on another to join them. Double-click enters a group.'],
    measure: ['Ruler: click the first point (snaps to points and curves).', 'Click the second point.', 'Click to measure again; Esc clears.'],
    line: ['Click the start point.', 'Click the next point. Double-click or Esc ends.'],
    cline: ['Construction line (dashed, helper only; never becomes a region): click the start point.', 'Click the next point. Double-click or Esc ends.'],
    rect: ['Click the first corner.', 'Click the opposite corner.'],
    rectc: ['Click the rectangle center.', 'Click a corner.'],
    circle: ['Click the center.', 'Click to set the radius.'],
    arc3: ['Click the arc start.', 'Click the arc end.', 'Click a point the arc passes through.'],
    arcc: ['Click the arc center.', 'Click the start (sets the radius).', 'Click the end; direction follows the mouse.'],
    point: ['Click to create a point.'],
    dimension: [
      'Click the first entity (line, point, circle or arc).',
      'Click another entity to dimension between both (angle, distance), or click empty space to place.',
      'Click to place the dimension.',
    ],
  },
  msg: {
    notApplicable: 'This constraint does not apply to the current selection.',
    noDimension: 'This selection does not form a dimension.',
    pickOther: 'These two entities do not form a dimension.',
    pickOtherFromPoint: 'Click another entity to dimension from the point.',
    notConverged: 'The solver did not converge with this change.',
    conflicting: 'Constraint conflicts with existing ones.',
    redundant: 'Redundant constraint (already defined by others).',
    degenerate: 'This change would collapse a curve (incompatible constraints).',
    dimension: (e) => `Dimension: ${e}`,
    positive: 'The dimension value must be positive',
    orientationRemoved: (n) => `${n} horizontal/vertical constraint(s) removed: they would no longer hold after the rotation.`,
    cannotDrag: 'Fully defined by constraints (black): it cannot be dragged. Edit or delete a dimension/constraint to free it.',
    originFixed: 'The origin is fixed.',
    fixDropped: (n) => `${n} constraint(s) between now-fixed points were removed (they would be redundant).`,
    pickGroupMember: 'The selection has a whole group. To constrain, pick the specific side: Shift+click the line in the group.',
    nameTaken: (n) => `The name "${n}" is already used in the drawing (names are unique so getid("${n}") is unambiguous).`,
    gluedToFixed: 'It is attached to the origin (a corner is the origin point itself). Use "Detach from origin" in the properties panel to move it.',
  },
  status: {
    empty: 'Empty sketch',
    defined: 'Fully defined',
    dof: (n) => `${n} degree${n > 1 ? 's' : ''} of freedom`,
    coreLoading: 'FEM core: loading…',
    core: (v) => `FEM core v${v}`,
    coreError: (e) => `FEM core: error (${e})`,
    polar: 'polar',
    cartesian: 'cartesian',
    toggleCoords: 'Click to toggle cartesian / polar coordinates',
    dofHint: 'The drawing can still move: add dimensions/constraints until it reaches zero (all black/white).',
    legendFree: 'free',
    legendDefined: 'defined',
  },
  problem: {
    title: 'Problem',
    unit: 'Unit',
    type: 'Type',
    planar: 'Planar (x, y)',
    axisymmetric: 'Axisymmetric (r, z)',
    depth: 'Depth',
    analysis: 'Analysis',
    magnetostatic: 'Magnetostatic',
    harmonic: 'Harmonic (AC)',
    transient: 'Transient',
    frequency: 'Frequency (Hz)',
    dt: 'Time step (s)',
    tEnd: 'End time (s)',
  },
  vars: {
    title: 'Variables',
    add: '+ variable',
    name: 'Name',
    expr: 'Expression',
    value: 'Value',
    empty: 'None yet. Create variables and use them in dimensions (e.g. "Ds/2 - g").',
    del: 'Delete variable',
    help: 'Accepts math and functions: =1+1, Ds/2 - g, 50 mm, 15 deg, + − * / ^, abs, sqrt, sin, cos, tan, atan2, exp, ln, log10, pow, min, max, round, pi.',
  },
  groups: {
    title: 'Groups',
    empty: 'Select entities and press Ctrl+G to group.',
    members: (n) => `${n} ${n === 1 ? 'item' : 'items'}`,
    show: 'Show',
    hide: 'Hide',
    rename: 'Double-click to rename',
  },
  sel: {
    title: 'Selection',
    none: 'Nothing selected. Click an entity (Shift adds) or drag a box.',
    more: (n) => `… and ${n} more`,
    length: 'length',
    radius: 'radius',
    fixed: 'fixed',
    construction: 'construction',
    transform: 'Move / rotate',
    dx: 'Δx',
    dy: 'Δy',
    angle: 'Angle',
    pivot: 'Pivot',
    pivotCenter: 'selection center',
    pivotOrigin: 'origin',
    apply: 'Apply',
    transformError: (e) => `Move/rotate: ${e}`,
    detach: 'Detach from origin',
    detachHelp: 'The selection is attached to the origin (a fixed point), so it cannot move. Detaching creates its own point at the same place.',
  },
  cons: { title: 'Constraints', none: 'None yet.', del: 'Delete constraint', edit: 'Edit value' },
  consoleCmd: {
    placeholder: 'Type a command (e.g. g.line((0, 0), (40, 0))) — Tab completes, help() lists the commands',
    unclosedString: 'Unclosed quoted string',
    badChar: (c) => `Unexpected character "${c}"`,
    expected: (c) => `Expected "${c}"`,
    incomplete: 'Incomplete command',
    unexpected: (s) => `Unexpected symbol "${s}"`,
    leftover: (s) => `Leftover "${s}"`,
    undefinedName: (n) => `"${n}" does not exist (neither a console variable nor a drawing id/name)`,
    notNumber: 'Arithmetic only with numbers',
    unknownObject: (o) => `Unknown object "${o}" (use s.)`,
    wantId: (v) => `Expected an id or name in quotes, got ${v}`,
    notFound: (v) => `"${v}" does not exist in the drawing`,
    wantXY: (v) => `Expected a point (x, y), got ${v}`,
    wantPoint: (v) => `"${v}" is not a point`,
    wantLength: (v) => `Expected a length (number or "50 mm"), got ${v}`,
    wantAngle: (v) => `Expected an angle (number in degrees or "30 deg"), got ${v}`,
    args: (fn, n) => `${fn}() needs at least ${n} argument(s)`,
    notClosed: 'The entities do not form a closed contour',
    badCombination: (fn) => `${fn}() does not apply to these entities`,
    emptyGroup: 'Nothing to group',
    useMenu: 'Use the New/Open menu for that',
    unknownFunction: (fn) => `Unknown command "${fn}" — help() lists the commands`,
    help: `Commands — g = Geometry (also d), m = Mesh, s = Solver, r = Results; no object means geometry (same syntax as the history; ids or names; numbers in the current unit; strings accept units and variables):
  g.point((x, y))  g.line(a, b, construction=False)  g.circle(c, r=5)  g.arc(c, start, end)
  g.rectangle(corner, opposite)  g.rectangle_center(center, corner)
  g.horizontal(l)  g.vertical(l)  g.parallel(a, b)  g.perpendicular(a, b)  g.tangent(a, b)  g.equal(a, b)
  g.coincident(a, b)  g.midpoint(p, l)  g.symmetric(p1, p2, l)  g.concentric(c1, c2)
  g.distance(a, [b,] "50 mm")  g.hdistance(...)  g.vdistance(...)  g.radius(c, "L/2")  g.diameter(c, 10)  g.angle(l1, l2, "30 deg")
  g.set_dimension("k5", "g*2")  g.var("g", "0.5 mm")  g.del_var("g")  g.rename_var("g", "gap")
  g.delete(ids...)  g.rename(id, "name")  g.group([ids], name="rotor")  g.ungroup(g)  g.hide(g)  g.show(g)
  g.move(p, (x, y))  g.translate(ids, dx=5, dy=0)  g.rotate(ids, "15 deg", pivot=(0, 0))  g.detach("O")
  g.fix(p)  g.unfix(p)  g.construction(ids, True)  g.units("mm")  g.problem("planar", depth="100 mm")
  Mesh: m.add()  m.rename(id, "fine")  m.remove(id)   Solver: s.add()  s.physics("n2", analysis="harmonic", frequency="60")   Results: r.add()
  Modify: g.offset(ids, "2 mm")  g.mirror(ids, axis="y")  g.array(ids, nx=3, dx="20 mm")  g.array_circular(ids, n=6, angle="360 deg")
Queries: getid("kru1")  g.get(id)  g.list()  g.measure(a, b)  g.area(ids)  g.value("k5")  g.dof()  fit()  undo()  redo()
Assignment: l = g.line((0, 0), (10, 0)) then use l. Up/Down arrows = previous commands.`,
  },
  offset: {
    tool: 'Offset',
    distance: 'Distance',
    flip: 'Flip side',
    apply: 'Apply',
    branching: 'Offset: the selection has points shared by more than two curves (branching).',
    radiusCollapses: 'Offset: an arc/circle radius would become zero or negative.',
    nothing: 'Offset: select lines, arcs or circles.',
    zero: 'Offset: the distance cannot be zero.',
    hint: 'Positive = outward of a closed contour (or to the left of an open chain).',
    editHint: 'Negative flips the side. Dragging the offset in the drawing also changes the distance.',
    useOffsetDim: 'The distance between the offset and the original is the offset dimension (green): edit its value.',
    dimConflict: 'This dimension conflicts with the offset (it is defined by the original and the distance). Edit the green offset dimension or dimension the original.',
  },
  patterns: {
    mirror: 'Mirror',
    linear: 'Linear pattern (x, y)',
    circular: 'Circular pattern',
    axis: 'Axis',
    axisX: 'X axis',
    axisY: 'Y axis',
    axisLine: 'selected line',
    count: 'Count',
    countX: 'Count x',
    countY: 'Count y',
    stepX: 'Step x',
    stepY: 'Step y',
    angle: 'Total angle',
    center: 'Center',
    centerOrigin: 'origin',
    apply: 'Apply',
    nothing: 'Select what to copy.',
    axisMustBeLine: 'The mirror axis must be a line.',
    badCount: 'Invalid count (2 to 400 copies in total).',
    mirrorGroup: 'Mirror',
    arrayGroup: 'Pattern',
    circularGroup: 'Circular pattern',
    pickButton: 'Pick a line in the drawing',
    pickCancel: 'Cancel picking',
    pickHint: 'Click the line to use as the mirror axis (Esc cancels).',
    editHint: 'The copies follow the original. Dragging a copy also changes the spacing.',
    symmetryTitle: 'Symmetry between the two points',
  },
  meas: {
    title: 'Measurements',
    distance: 'Distance',
    minDistance: 'Minimum distance',
    length: 'Length',
    angle: 'Angle',
    center: 'Center',
    radius: 'Radius',
    diameter: 'Diameter',
    area: 'Area',
    perimeter: 'Perimeter',
    sweep: 'Sweep',
    arcLength: 'Arc length',
  },
  mesh: {
    periodic: 'Periodic',
    antiperiodic: 'Antiperiodic',
    dirichlet: 'A = 0 (Dirichlet)',
    neumann: 'Neumann (tangent flux)',
    noMaterial: 'no material',
    materials: 'Materials',
    regions: 'Regions',
    boundaries: 'Boundaries',
    outerDefault: 'Outer border (A = 0)',
    region: (n) => `Region ${n}`,
    material: 'Material',
    area: 'Area',
    current: 'Current per turn (A)',
    turns: 'Turns',
    magnetAngle: 'Magnetization direction (°)',
    boundaryType: 'Boundary condition',
    none: '— none —',
    curves: (n) => `${n} curve${n === 1 ? '' : 's'} selected`,
    hint: 'Click a region to pick its material; click edges (Shift for several) to set a boundary. The outer border is A = 0 by default.',
    periodicNeedsTwo: 'Periodic/antiperiodic link pairs of curves: select two.',
    addMaterial: 'New material',
    newMaterial: 'Material',
    name: 'Name',
    color: 'Color',
    mur: 'μr (relative permeability)',
    sigma: 'σ (MS/m)',
    br: 'Magnet Br (T)',
    bh: 'B-H curve',
    bhPoints: (n) => `nonlinear, ${n} points`,
    removeMaterial: 'Remove material',
    materialInUse: 'Material is used by a region.',
    removeBoundary: 'Remove boundary',
    noRegions: 'No closed region in the drawing.',
    nodeHint: 'Mesh generation (Triangle) comes in the next step. Set materials and boundaries first.',
    noRegionAt: (x, y) => `No closed region contains the point (${x}, ${y}).`,
    nameTaken: (n) => `A material "${n}" already exists.`,
    failed: (e) => `Mesh generation failed: ${e}`,
    groups: { air: 'Air and gases', conductor: 'Conductors', steel: 'Electrical steels', magnet: 'Magnets', custom: 'Custom' },
    group: 'Group',
    pickMaterial: 'Pick material',
    editLibrary: 'Edit library…',
    editMaterial: 'Edit this material',
    libMaterials: 'Materials',
    libBoundaries: 'Boundaries',
    newBoundary: 'New boundary',
    boundaryValue: 'Prescribed A (Wb/m)',
    boundary: 'Boundary',
    newBoundaryFor: 'New boundary…',
    meshSize: 'Element size',
    auto: (v) => `automatic (${v})`,
    meshes: 'Meshes',
    generate: 'Generate mesh',
    generating: 'Generating…',
    stats: (n, e, a, ms) => `${n} nodes · ${e} triangles · min angle ${a.toFixed(1)}° · ${Math.round(ms)} ms`,
    notGenerated: 'Not generated yet.',
    stale: 'The drawing or settings changed: generate the mesh again.',
    globalSize: 'Default element size',
    minAngle: 'Minimum angle (quality, °)',
    mesher: 'Mesher: Triangle (J. R. Shewchuk), quality Delaunay.',
    sizeHint: 'Empty = automatic. Accepts expressions with variables ("g/4").',
    stepMaterials: '1. Click a region (here or in the drawing) and pick its material.',
    stepBoundaries: '2. Click edges in the drawing (Shift for several) and pick the boundary. The outer border is A = 0 by default.',
    stepRegions: '3. Adjust the element size per region (empty = automatic).',
    stepMeshes: '4. Generate the mesh.',
    curvesOf: (n) => `${n} curve${n === 1 ? '' : 's'}`,
    unassigned: 'no boundary (natural Neumann)',
    elements: (n) => `${n} el.`,
    elementsNode: 'Triangle',
    regionName: 'Region name',
    bhAdd: 'Add B-H curve (nonlinear)',
    turnsNonZero: 'Turns: any nonzero number (negative reverses the direction).',
    bhPoint: 'Point',
    bhClickHint: 'Click a point to edit.',
    bhOpen: 'View B-H curve (tab)',
    bhAddPoint: 'Point',
    bhRemove: 'Remove curve (use linear μr)',
    bhMonotonic: 'The curve needs increasing H and B.',
    bhHelp: 'Increasing (H, B) pairs starting at (0, 0). The solver still uses the linear μr; the curve comes in the next step (nonlinear).',
    outerHelp: 'Outer border curves without a boundary get A = 0 automatically.',
    outerName: 'Outer border',
    outerMakeEditable: 'Make editable (turn into a boundary)',
    minAngleHelp: 'No triangle will have an interior angle smaller than this. Flat triangles hurt field accuracy; larger values give more regular elements but more of them. 30° is a good default; the maximum accepted is 34°.',
  },
  solve: {
    noMaterial: (n) => `Region ${n} has no material.`,
    periodicMismatch: (b) => `${b}: both curves need the same number of nodes (generate the mesh again).`,
    negativeR: 'Axisymmetric: some geometry has r < 0 (the axis is x = 0).',
    noDirichlet: 'A boundary with prescribed A is missing (without it the potential is undefined).',
    onlyStatic: 'Only the magnetostatic analysis solves for now; harmonic and transient come later.',
    failed: (e) => `Solve failed: ${e}`,
    run: 'Solve',
    running: 'Solving…',
    notSolved: 'Not solved yet.',
    stale: 'The project changed after solving: solve again.',
    stats: (el, ms) => `${el} triangles · ${Math.round(ms)} ms`,
    bmax: 'Max |B|',
    energy: 'Magnetic energy',
    map: '|B| map',
    lines: 'Flux lines',
    nLines: 'Number of lines',
    probeHint: 'Click the drawing to see B, H and A at the point.',
    probeOut: 'Point outside the mesh.',
    probeRegion: 'Region',
    noSolution: 'Solve the problem under Solver (▶).',
    linearNote: 'Materials with a B-H curve use their linear μr for now (nonlinear in the next step).',
    goResults: 'See results',
  },
  post: {
    plots: { surface: 'Surface', contour: 'Contour', arrow: 'Glyphs', line: 'Plot over line' },
    plotHelp: { surface: '2D color map', contour: 'isolines (A = flux lines)', arrow: 'vectors', line: 'values and flux along a curve' },
    by: { surface: 'Color by', contour: 'Contour by', arrow: 'Orientation', line: 'Quantity' },
    qty: { b: 'B — flux density', h: 'H — field intensity', a: 'A — vector potential', j: 'J — current density', bn: 'Normal B', bt: 'Tangential B' },
    component: 'Component',
    comps: { mag: 'Magnitude', x: 'X (r)', y: 'Y (z)' },
    view: 'View',
    parentView: 'View (parent)',
    copy: 'copy',
    duplicate: 'Duplicate',
    rangeMin: 'Lower limit',
    rangeMax: 'Upper limit',
    rangeInvalid: 'The upper limit must be greater than the lower.',
    rangeAutoBtn: 'Automatic',
    interp: 'Interpolation',
    interpMenu: 'New interpolated view (smooth)',
    interpHelp: 'Second-order interpolant per triangle (gradient recovered at nodes, without mixing materials) plus subdivision: curved contours and smooth transitions. All plots in this view use the interpolated data.',
    level: 'Subdivisions per edge',
    source: 'Data',
    sourceSolution: 'Solution (mesh)',
    filterStats: (n) => `${n} refined triangles`,
    colors: 'Colors',
    color: 'Color',
    colormap: 'Color map',
    colormaps: { turbo: 'Turbo (rainbow)', viridis: 'Viridis', coolwarm: 'Cool to warm (diverging)', gray: 'Gray' },
    colorByValue: 'Color by value',
    newView: 'New view (tab) with…',
    addToView: 'Add to this view',
    drawing: 'Drawing',
    closeTab: 'Close tab',
    openChart: 'Open chart in a tab',
    chart: 'Chart',
    logX: 'log x axis',
    logY: 'log y axis',
    bhTab: 'B-H curve',
    add: 'Add visualization',
    range: 'Color range',
    rangeAuto: 'automatic (e.g. 0; 1.5)',
    spacing: 'Spacing (mm)',
    scale: 'Scale',
    pickCurve: 'Pick a curve in the drawing',
    picking: 'Click a line, arc or circle in the drawing…',
    curve: 'Curve',
    noCurve: 'Pick a curve (it can be a construction line drawn just for this).',
    quantity: 'Quantity',
    flux: 'Flux through the curve',
    fluxHint: 'Positive direction: normal to the left of the path (pink arrow). Planar: per meter × problem depth.',
    bAvg: 'Mean |B|',
    bMax: 'Max |B|',
    length: 'Length',
    outside: 'The curve is outside the mesh.',
    hide: 'Hide',
    show: 'Show',
  },
  circuit: {
    name: 'Circuit',
    title: 'Circuits',
    add: 'New circuit',
    current: 'Current (A)',
    kind: 'Connection',
    series: 'Series',
    parallel: 'Parallel',
    parallelSoon: 'Parallel comes with transient/harmonic analysis (current split by impedances).',
    remove: 'Remove circuit',
    none: '— none (region current) —',
    fromCircuit: (n, i) => `from circuit ${n}: ${i} A`,
    regions: (n) => `${n} region${n === 1 ? '' : 's'}`,
    help: 'Link regions to the circuit under Materials › region › Circuit. The current comes from the circuit; each region uses its turns (negative = return direction).',
    results: 'Circuits',
    table: 'Circuit table',
    tableMenu: 'Circuits (table)',
    openTable: 'Open table in a tab',
    cols: { name: 'Circuit', I: 'I (A)', turns: 'Turns', lambda: 'λ (Wb)', L: 'L = λ/I (H)', R: 'DC R (Ω)', V: 'DC V (V)', P: 'I²R losses (W)' },
    note: 'Apparent inductance λ/I (with several circuits it includes coupling). DC R with fill factor 1; planar excludes end turns.',
    empty: 'No circuits. Create one under Mesh › Circuits.',
  },
  hist: {
    title: 'History',
    empty: 'Each action shows up here as the equivalent API command.',
    copy: 'Copy script',
    copied: 'Script copied',
    help: 'Equivalent code (magfem Python API). Grey items were undone.',
  },
  expr: {
    badNumber: (s) => `Invalid number at "${s}"`,
    badChar: (c) => `Unexpected character "${c}"`,
    expected: (c) => `Expected "${c}"`,
    incomplete: 'Incomplete expression',
    unitNoNumber: (u) => `Unit "${u}" without a number`,
    unexpected: (s) => `Unexpected symbol "${s}"`,
    leftover: (s) => `Leftover "${s}"`,
    undefinedVar: (n) => `Variable "${n}" is not defined`,
    mixedUnits: 'Adding quantities with different units',
    trigArg: 'Trigonometric argument must be an angle',
    divZero: 'Division by zero',
    exponent: 'Exponent must be dimensionless',
    args: (fn, n) => `${fn}() expects ${n} argument(s)`,
    pureNumber: (fn) => `${fn}() expects a plain number`,
    noArgs: (fn) => `${fn}() without arguments`,
    notFinite: 'Result is not a finite number',
    wantLength: 'The dimension expects a length',
    wantAngle: 'The dimension expects an angle',
    circular: (p) => `Circular dependency: ${p}`,
    dependsOnError: (n) => `Depends on "${n}", which has an error`,
    badName: 'Invalid name (use letters, digits and _; not unit/function names)',
    inUse: (n, w) => `"${n}" is in use: ${w}`,
    exists: (n) => `Variable "${n}" already exists`,
    dimError: (e, w) => `Dimension "${e}": ${w}`,
    varError: (n, e) => `variable ${n} has an error (${e})`,
    mustBePositive: (e, v) => `Dimension "${e}" = ${v}: the value must be positive`,
  },
};

export const TRANSLATIONS: Record<Lang, Translations> = { pt: PT, en: EN };

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
  drawer: { open: 'Problema', close: 'Fechar painel' },
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
  drawer: { open: 'Problem', close: 'Close panel' },
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

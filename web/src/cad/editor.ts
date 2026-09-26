// Controlador do canvas do sketch: ferramentas, snap, seleção, grupos, arraste e cotas.
import { constraintCode, creationCode, q, xy } from './code';
import type { SketchDoc } from './doc';
import { dimAnchor, dimDrawing } from './dimgeom';
import { asLength, evaluate, evaluateVariables, formatLength } from './expr';
import { circleFrom3, closestOnCurve, cross, curvePoints, dist, dot, entityBBox, entityTouchesBox, norm, normAngle, pt, sketchBBox, sub, type Vec } from './geometry';
import { angleSectorAt, dimPointIds, lineDir, measure } from './measure';
import {
  adaptOrientationConstraints,
  renameEntity,
  curvesUsing,
  detachFromPoint,
  fixedPointsOf,
  constraintsFor,
  createGroup,
  deleteItems,
  Draft,
  expandSelection,
  groupOf,
  mergePoints,
  parseDimensionInput,
  selectionPoints,
  toggleConstruction,
  toggleFixed,
  transformPoints,
  ungroup,
  updateGroup,
  type GeomTool,
  type Transform,
} from './ops';
import { LABEL_DEFAULT_PX, render, type HitRegion, type Preview, type RenderState } from './render';
import { groupParams, type DragTarget } from './solver';
import { isCurve, isDimension, ORIGIN_ID, type Constraint, type ConstraintType, type Group, type Id, type LineEnt, type RegionAssign, type Sketch, BOUNDARY_COLOR, boundaryColor, OUTER_BOUNDARY } from './types';
import { View } from './view';
import { computeArrangement, findRegion, regionAt, type Arrangement } from './regions';
import { assignOf, assignRegion, pointCode, regionKey, type RegionKey } from './mesh';
import { buildMeshInput, inputKey, minTriangleAngle, type MeshResult, expandCurveNodes } from './meshgen';
import { solver } from '../worker/client';
import type { MagOut, TriangulateOut } from '../wasm/core';
import { buildMagInput, depthOf, frameOf, regionJ, smoothSolution, typicalSize, type Solution } from './solve';
import type { LegendLayout, PostNode, SchematicNode } from './types';
import { buildNetlist, sourceSteps } from './schematic';
import { addNode } from './tree';
import { minDistanceSets, signedDistanceTo } from './inspect';
import { offsetCurves, setOffsetDistance } from './offset';
import { circularArray, ensureAxisLine, linearArray, mirrorEntities, setPattern, type MirrorAxis } from './patterns';
import { subscribeLang, T } from '../i18n';
import { isDark, subscribeTheme } from '../theme';

export type Tool = 'select' | 'measure' | 'line' | 'cline' | 'rect' | 'rectc' | 'circle' | 'arc3' | 'arcc' | 'point' | 'dimension';

export const TOOL_KEYS: Record<string, Tool> = {
  s: 'select',
  l: 'line',
  L: 'cline',
  r: 'rect',
  R: 'rectc',
  c: 'circle',
  a: 'arc3',
  A: 'arcc',
  p: 'point',
  d: 'dimension',
  u: 'measure',
};

export const GEOM_KEYS: Record<string, GeomTool> = {
  i: 'coincident',
  h: 'horizontal',
  v: 'vertical',
  e: 'equal',
  t: 'tangent',
  m: 'midpoint',
};



const POINT_SNAP_PX = 9;
const CURVE_SNAP_PX = 7;
const HV_TOL = Math.tan((3 * Math.PI) / 180);
const PARALLEL_TOL = Math.sin((1 * Math.PI) / 180);

interface Pick {
  pos: Vec;
  pointId?: Id; // encaixou num ponto existente
  curveId?: Id; // encaixou sobre uma curva
  midOf?: Id; // encaixou no ponto médio de uma linha
}

type OptC = { type: ConstraintType; refs: Id[]; quiet?: boolean };

type Hit = { kind: 'point' | 'curve'; id: Id } | { kind: 'dim' | 'badge'; id: Id } | { kind: 'group'; id: Id; entity: Id };

interface DragState {
  kind: 'entity' | 'label' | 'box' | 'pan' | 'pending' | 'offset';
  /** Arraste de offset: grupo, distância inicial (com sinal) e referência da distância do mouse ao pai. */
  offset?: { gid: Id; d0: number; raw0: number; k: number };
  startScreen: Vec;
  startWorld: Vec;
  hit: Hit | null;
  targets?: { pointId: Id; off: Vec }[];
  radiusOf?: Id;
  labelStart?: { x: number; y: number };
  shift: boolean;
  moved: boolean;
  /** Ponto único sendo arrastado (candidato a unir com outro ponto ao soltar). */
  single?: Id;
  /** Parâmetros de offset/padrão liberados durante o arraste. */
  freeParams?: Set<string>;
  /** Pontos seguros no lugar durante o arraste (ex.: a origem de um padrão). */
  anchors?: { pointId: Id; x: number; y: number }[];
  dropOn?: Pick | null;
}

export interface EditorSnapshot {
  tool: Tool;
  selection: Id[];
  cursor: Vec;
  message: string | null;
  hint: string;
  editing: { id: Id; x: number; y: number; text: string; angle: boolean } | null;
  enteredGroup: Id | null;
  ruler: { a: Vec; b: Vec | null } | null;
  mode: 'sketch' | 'mesh' | 'post';
  meshSel: SketchEditor['meshSel'];
  version: number;
}

/** Passos para ir de a até b sem saltos grandes (≤ 20 % do menor valor por passo, no máximo 40). */
function stepsFor(a: number, b: number): number {
  const d = Math.abs(b - a);
  const ref = Math.max(Math.min(Math.abs(a), Math.abs(b)), 1e-9);
  return Math.max(1, Math.min(40, Math.ceil(d / (0.2 * ref))));
}

export class SketchEditor {
  readonly view = new View();
  tool: Tool = 'select';
  selection: Id[] = [];
  hover: Hit | null = null;
  cursor: Vec = { x: 0, y: 0 };
  message: string | null = null;
  editing: EditorSnapshot['editing'] = null;
  enteredGroup: Id | null = null;
  /** Modo do canvas: desenho (sketch) ou malha (regiões/contornos, sem editar geometria). */
  mode: 'sketch' | 'mesh' | 'post' = 'sketch';
  /** Seleção no modo malha: uma região (pela identidade) ou curvas (para contornos). */
  meshSel: { kind: 'region'; curves: Id[]; seed: Vec } | { kind: 'curves'; ids: Id[] } | null = null;
  meshHover: { kind: 'region'; index: number } | { kind: 'curve'; id: Id } | null = null;
  private arrCache: { version: number; arr: Arrangement } | null = null;

  /** Regiões do desenho atual (recalculadas só quando o documento muda). */
  arrangement(): Arrangement {
    if (!this.arrCache || this.arrCache.version !== this.doc.version) this.arrCache = { version: this.doc.version, arr: computeArrangement(this.sketch) };
    return this.arrCache.arr;
  }

  setMode(m: 'sketch' | 'mesh' | 'post') {
    if (this.mode === m) return;
    this.mode = m;
    this.resetToolState();
    this.meshSel = null;
    this.meshHover = null;
    if (m !== 'sketch') {
      this.tool = 'select';
      this.selection = [];
    }
    this.canvas.style.cursor = 'default';
    this.changed();
  }

  /** Atribuição (material/fonte) da região, se houver. */
  assignOf(key: RegionKey): RegionAssign | undefined {
    return assignOf(this.sketch, this.arrangement(), key);
  }

  /** Aplica uma operação de malha (pura) e registra o código; erros viram mensagem. */
  meshOp(fn: (sk: Sketch) => Sketch, code: string): boolean {
    try {
      return this.commit(fn(this.sketch), [code]);
    } catch (e) {
      this.flash((e as Error).message);
      return false;
    }
  }

  /** Malhas geradas (não são salvas no projeto; regeráveis) por nó de malha. */
  meshes = new Map<Id, MeshResult>();
  /** Último erro de geração por nó (mostrado nas Propriedades até a próxima tentativa). */
  meshErrors = new Map<Id, string>();
  /** Nó de malha sendo gerado (UI mostra "gerando…"). */
  meshBusy: Id | null = null;
  /** Nó de malha exibido no canvas (modo malha). */
  shownMesh: Id | null = null;
  /** Pontos de curvas (não de construção) em r < 0 na última alteração (aviso do axissimétrico). */
  private lastNegR = 0;
  private negativeRPoints(): number {
    const sk = this.sketch;
    const used = new Set<Id>();
    for (const e of Object.values(sk.entities))
      if (isCurve(e) && !(e as { construction?: boolean }).construction) curvePoints(e).forEach((p) => used.add(p));
    let n = 0;
    for (const id of used) {
      const p = sk.entities[id] as { x: number } | undefined;
      if (p && p.x < -1e-9) n++;
    }
    return n;
  }
  /** Mapa de qualidade da malha (cor pelo menor ângulo); estado de interface, não salvo. */
  meshQuality = false;
  setMeshQuality(on: boolean) {
    this.meshQuality = on;
    this.changed();
  }

  private keyCache: { version: number; id: Id; key: string } | null = null;

  /** A malha do nó está desatualizada (desenho, tamanhos ou contornos periódicos mudaram)? */
  meshStale(id: Id): boolean {
    const m = this.meshes.get(id);
    if (!m) return false;
    if (!this.keyCache || this.keyCache.version !== this.doc.version || this.keyCache.id !== id) {
      const node = this.sketch.nodes.find((n) => n.id === id);
      const key = node?.kind === 'mesh' ? inputKey(buildMeshInput(this.sketch, this.arrangement(), node).input) : '';
      this.keyCache = { version: this.doc.version, id, key };
    }
    return this.keyCache.key !== m.key;
  }

  showMesh(id: Id | null) {
    if (this.shownMesh === id) return;
    this.shownMesh = id;
    this.changed();
  }

  /** Gera a malha do nó (Tangle no Worker). Devolve o resultado ou null (erro vira mensagem). */
  async generateMesh(id: Id): Promise<MeshResult | null> {
    const node = this.sketch.nodes.find((n) => n.id === id);
    if (!node || node.kind !== 'mesh') return null;
    const arr = this.arrangement();
    if (!arr.regions.length) {
      this.flash(T().mesh.noRegions);
      return null;
    }
    const { input, curveNodes } = buildMeshInput(this.sketch, arr, node);
    this.meshBusy = id;
    this.meshErrors.delete(id);
    this.changed();
    const t0 = performance.now();
    try {
      const out = await solver.call<TriangulateOut>({ cmd: 'triangulate', input });
      // Atributo da região na Tangle = índice da região + 1.
      const triRegion = new Int32Array(out.triRegion.length);
      for (let i = 0; i < triRegion.length; i++) triRegion[i] = out.triRegion[i] - 1;
      const res: MeshResult = {
        xy: out.xy,
        triangles: out.triangles,
        triRegion,
        nodes: out.xy.length / 2,
        elements: out.triangles.length / 3,
        minAngle: minTriangleAngle(out.xy, out.triangles),
        key: inputKey(input),
        curveNodes: expandCurveNodes(curveNodes, input.segments, out.segChainStart, out.segChain),
        ms: performance.now() - t0,
      };
      this.meshes.set(id, res);
      // Os triângulos só aparecem com o nó da malha selecionado (a seleção decide, ver App).
      return res;
    } catch (e) {
      const msg = T().mesh.failed((e as Error).message);
      this.meshErrors.set(id, msg);
      this.flash(msg);
      return null;
    } finally {
      this.meshBusy = null;
      this.changed();
    }
  }

  /** Soluções por nó de física (não salvas; recalculáveis). */
  solutions = new Map<Id, Solution & { key: string }>();
  solveBusy: Id | null = null;
  /** Progresso do cálculo em andamento (0–1). */
  solveProgress = 0;
  solveErrors = new Map<Id, string>();
  /** Solução mostrada no modo resultados e as camadas visíveis (na ordem da árvore). */
  shownSolution: Id | null = null;
  postLayers: PostNode[] = [];
  /** Ponto da sonda (clique no modo resultados). */
  probeAt: Vec | null = null;
  /** Legenda clicada: camada e limites atuais (a interface abre o ajuste). */
  legendEdit: { layer: Id; lo: number; hi: number } | null = null;

  /** Subdivisões da vista interpolada mostrada (0 = solução da malha). */
  postLevel = 0;

  closeLegend() {
    this.legendEdit = null;
    this.changed();
  }

  /** Vista mostrada e posição da legenda (salva na vista; `legendLive` durante o arraste). */
  postView_: Id | null = null;
  postLegend: LegendLayout | undefined;
  private legendLive: LegendLayout | null = null;
  private legendDrag: { mode: 'move' | 'resize' | 'height'; start: Vec; orig: { x: number; y: number; s: number; h: number }; moved: boolean; layer: Id; lo: number; hi: number } | null = null;

  showSolution(id: Id | null, layers: PostNode[] = [], level = 0, view: Id | null = null, legend?: LegendLayout) {
    this.shownSolution = id;
    this.postLayers = layers;
    this.postLevel = level;
    this.postView_ = view;
    this.postLegend = legend;
    this.changed();
  }

  private solveKeyCache: { version: number; key: string } | null = null;

  /** Assinatura do que afeta a solução (geometria/malha, materiais, regiões, contornos, problema, variáveis). */
  private solveKey(): string {
    if (this.solveKeyCache?.version === this.doc.version) return this.solveKeyCache.key;
    const sk = this.sketch;
    const meshNode = sk.nodes.find((n) => n.kind === 'mesh');
    const meshKey = meshNode?.kind === 'mesh' ? inputKey(buildMeshInput(sk, this.arrangement(), meshNode).input) : '';
    const physics = sk.nodes.map((n) => (n.kind === 'physics' ? [n.analysis, n.frequency, n.dt, n.tEnd] : null)).filter(Boolean);
    const key = inputKey({
      meshKey,
      materials: sk.materials,
      assigns: sk.regionAssigns.map(({ labelOffset: _l, name: _n, ...rest }) => rest),
      boundaries: sk.boundaries,
      problem: [sk.settings.problem, sk.settings.depth, sk.settings.unit],
      vars: sk.variables,
      physics,
    } as never);
    this.solveKeyCache = { version: this.doc.version, key };
    return key;
  }

  /** A solução ficou para trás (algo que a afeta mudou depois de resolver)? */
  solutionStale(id: Id): boolean {
    const s = this.solutions.get(id);
    return !!s && s.key !== this.solveKey();
  }

  /** Resolve o problema do nó de física: gera a malha se preciso e chama o solver no Worker. */
  async solve(id: Id): Promise<boolean> {
    const t = T();
    const node = this.sketch.nodes.find((n) => n.id === id);
    if (!node || node.kind !== 'physics') return false;
    const fail = (msg: string) => {
      this.solveErrors.set(id, msg);
      this.flash(msg);
      this.solveBusy = null;
      this.changed();
      return false;
    };
    this.solveErrors.delete(id);
    this.solveBusy = id;
    this.changed();
    let meshId = this.sketch.nodes.find((n) => n.kind === 'mesh')?.id;
    if (!meshId) {
      const r = addNode(this.sketch, 'mesh', t.mesh.elementsNode);
      if (!this.commit(r.sketch, [r.code])) return fail(t.mesh.noRegions);
      meshId = r.node.id;
    }
    const meshNode = { id: meshId };
    let mesh = this.meshes.get(meshNode.id);
    if (!mesh || this.meshStale(meshNode.id)) {
      mesh = (await this.generateMesh(meshNode.id)) ?? undefined;
      this.solveBusy = id;
      if (!mesh) return fail(this.meshErrors.get(meshNode.id) ?? t.mesh.noRegions);
    }
    const key = this.solveKey();
    const { input, problems } = buildMagInput(this.sketch, this.arrangement(), mesh, this.defaultOuter());
    if (problems.length) return fail(problems.join(' · '));
    let netInfo: { schematic: Id; partOf: Id[]; nodeOf: Map<string, number>; netNodes: number } | null = null;
    // Transitório: correntes = funções de t (avaliadas a cada passo), passo dt até t_final (A(0) = 0).
    // Transitória com circuito: além disso, o esquemático escolhido é acoplado ao campo.
    if (node.analysis === 'transient') {
      const arr = this.arrangement();
      let steps = 0, dt = 0;
      try {
        const { values } = evaluateVariables(this.sketch.variables, this.sketch.settings.unit);
        const ev = (e: string) => evaluate(e, { env: values, unit: this.sketch.settings.unit }).v;
        dt = ev(node.dt);
        const tEnd = ev(node.tEnd);
        if (!(dt > 0) || !(tEnd > dt)) return fail(t.solve.badTime);
        steps = Math.min(2000, Math.round(tEnd / dt));
        input.dt = dt;
        input.steps = steps;
        input.freq = 0;
      } catch (e) {
        return fail((e as Error).message);
      }
      let coupled = new Set<Id>();
      if (node.coupled) {
        const schem = this.sketch.nodes.find((n): n is SchematicNode => n.kind === 'schematic' && (n.id === node.schematic || !node.schematic));
        if (!schem || !schem.parts.length) return fail(t.solve.noSchematic);
        const { net, problems: np } = buildNetlist(this.sketch, schem, arr);
        if (!net) return fail(np.join(' · '));
        coupled = net.coupledCircuits;
        const { partOf: _p, nodeOf: _n, coupledCircuits: _c, ...fields } = net;
        Object.assign(input, fields);
        try {
          input.elSteps = sourceSteps(this.sketch, schem, net.partOf, dt, steps);
        } catch (e) {
          return fail((e as Error).message);
        }
        netInfo = { schematic: schem.id, partOf: net.partOf, nodeOf: net.nodeOf, netNodes: net.netNodes };
      }
      try {
        const jSteps: number[] = [];
        for (let k = 1; k <= steps; k++) jSteps.push(...regionJ(this.sketch, arr, k * dt, coupled));
        input.jSteps = jSteps;
        // J de referência (para os mapas de J por passo): o do último passo.
        input.J = regionJ(this.sketch, arr, steps * dt, coupled);
      } catch (e) {
        return fail((e as Error).message);
      }
    }
    // Harmônico (AC): fasores na frequência da física; correntes = amplitude de pico (fase 0).
    let harmonicJ: number[] | undefined;
    if (node.analysis === 'harmonic') {
      try {
        const { values } = evaluateVariables(this.sketch.variables, this.sketch.settings.unit);
        const f = evaluate(node.frequency, { env: values, unit: this.sketch.settings.unit }).v;
        if (!(f > 0)) return fail(t.solve.badFreq);
        const frames = 24;
        input.harmonic = true;
        input.harmonicFrames = frames;
        input.freq = f;
        input.steps = 0;
        input.dt = 0;
        // J(t) = J·cos(ωt) em cada instante mostrado (mapas de J na animação).
        harmonicJ = [];
        for (let k = 0; k < frames; k++) harmonicJ.push(...input.J.map((j) => j * Math.cos((2 * Math.PI * k) / frames)));
      } catch (e) {
        return fail((e as Error).message);
      }
    }
    const t0 = performance.now();
    try {
      this.solveProgress = 0;
      const out = await solver.call<MagOut>({ cmd: 'solveMagnetostatic', input }, (k, n) => {
        this.solveProgress = n > 0 ? k / n : 0;
        this.changed();
      });
      this.solveProgress = 1;
      const bmag = new Float64Array(out.bx.length);
      let bmax = 0;
      for (let i = 0; i < bmag.length; i++) {
        bmag[i] = Math.hypot(out.bx[i], out.by[i]);
        if (bmag[i] > bmax) bmax = bmag[i];
      }
      const axisymmetric = input.axisymmetric;
      this.solutions.set(id, {
        A: out.A,
        bx: out.bx,
        by: out.by,
        bmag,
        bmax,
        energy: axisymmetric ? out.energy : out.energy * depthOf(this.sketch),
        axisymmetric,
        mesh,
        nu: input.nu,
        brx: input.brx,
        bry: input.bry,
        J: input.J,
        meshSize: typicalSize(mesh),
        ms: performance.now() - t0,
        key,
        iterations: out.iterations,
        At: out.times.length ? out.At : undefined,
        times: out.times.length ? out.times : undefined,
        freq: input.freq,
        jPhase: input.jPhase,
        jSteps: harmonicJ ?? input.jSteps,
        harmonic: input.harmonic ? { freq: input.freq!, Are: out.A, Aim: out.Aim, sigma: input.sigma ?? [], iron: input.iron } : undefined,
        circuit: netInfo && out.nodeV ? { ...netInfo, nodeV: out.nodeV, elI: out.elI } : undefined,
      });
      this.postFrame = out.times.length && !input.harmonic ? out.times.length - 1 : 0;
      this.shownSolution = id;
      this.solveBusy = null;
      this.changed();
      return true;
    } catch (e) {
      return fail(t.solve.failed((e as Error).message));
    }
  }

  /** Dados do modo resultados. */
  /** Passo de tempo mostrado (transitório). */
  postFrame = 0;
  setFrame(k: number) {
    this.postFrame = k;
    this.changed();
  }
  /** Solução mostrada (no passo atual, se for transitória). */
  shownSol(id: Id | null = this.shownSolution): Solution | undefined {
    const s = id ? this.solutions.get(id) : undefined;
    return s?.times ? frameOf(s, this.postFrame) : s;
  }

  private postView(): RenderState['post'] {
    const sol = this.shownSol();
    // Vista interpolada: todas as camadas usam a solução refinada.
    const layerSols = new Map<Id, Solution>();
    if (sol && this.postLevel) {
      const fine = smoothSolution(sol, this.postLevel);
      for (const l of this.postLayers) layerSols.set(l.id, fine);
    }
    return { sol: sol ?? null, layers: this.postLayers, layerSols, stale: sol ? this.solutionStale(this.shownSolution!) : false, probe: this.probeAt, legend: this.legendLive ?? this.postLegend };
  }

  /** Régua (ferramenta de medir): não altera o desenho. */
  ruler: { a: Vec; b: Vec | null } | null = null;

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private hits: HitRegion[] = [];
  private picks: Pick[] = []; // cliques da ferramenta em andamento
  private cursorPick: Pick | null = null;
  private inferHV: 'H' | 'V' | null = null;
  private arcSweep = 0; // acumulado do arco pelo centro (define o sentido)
  private lastArcAngle: number | null = null;
  private dimRefs: Id[] = [];
  private drag: DragState | null = null;
  private spaceDown = false;
  private frame = 0;
  private listeners = new Set<() => void>();
  private snapVersion = 0;
  private messageTimer = 0;
  private cleanup: (() => void)[] = [];

  constructor(
    canvas: HTMLCanvasElement,
    readonly doc: SketchDoc,
  ) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(canvas);
    this.cleanup.push(() => ro.disconnect());
    this.cleanup.push(
      doc.subscribe(() => {
        // Axissimétrico: avisa quando aparece geometria no semiplano r < 0 (fora do domínio).
        const neg = this.sketch.settings.problem === 'axisymmetric' ? this.negativeRPoints() : 0;
        if (neg > this.lastNegR) this.flash(T().app.axisWarn);
        this.lastNegR = neg;
        // Seleção só com o que ainda existe (após desfazer, apagar...).
        const alive = this.selection.filter((id) => this.exists(id));
        if (alive.length !== this.selection.length) this.selection = alive;
        if (this.enteredGroup && !this.sketch.groups.some((g) => g.id === this.enteredGroup)) this.enteredGroup = null;
        this.changed();
      }),
    );
    this.cleanup.push(subscribeLang(() => this.changed()));
    this.cleanup.push(subscribeTheme(() => this.changed()));
    const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement | Window, ev: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      el.addEventListener(ev, fn as EventListener, opts);
      this.cleanup.push(() => el.removeEventListener(ev, fn as EventListener));
    };
    on(canvas, 'pointerdown', (e) => this.onDown(e));
    on(canvas, 'pointermove', (e) => this.onMove(e));
    on(canvas, 'pointerup', (e) => this.onUp(e));
    on(canvas, 'dblclick', (e) => this.onDblClick(e));
    on(canvas, 'wheel', (e) => this.onWheel(e), { passive: false });
    on(canvas, 'contextmenu', (e) => e.preventDefault());
    on(window, 'keydown', (e) => this.onKey(e));
    on(window, 'keyup', (e) => {
      if (e.key === ' ') this.spaceDown = false;
    });
    this.resize();
  }

  dispose() {
    this.cleanup.forEach((f) => f());
    cancelAnimationFrame(this.frame);
  }

  private exists(id: Id) {
    const sk = this.sketch;
    return !!sk.entities[id] || sk.groups.some((g) => g.id === id) || sk.constraints.some((c) => c.id === id);
  }

  // ---------- estado observável (React) ----------
  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private snapshotCache: EditorSnapshot | null = null;
  getSnapshot = (): EditorSnapshot => {
    if (!this.snapshotCache || this.snapshotCache.version !== this.snapVersion) {
      this.snapshotCache = {
        tool: this.tool,
        selection: this.selection,
        cursor: this.cursor,
        message: this.message,
        hint: this.hint(),
        editing: this.editing,
        enteredGroup: this.enteredGroup,
        ruler: this.ruler,
        mode: this.mode,
        meshSel: this.meshSel,
        version: this.snapVersion,
      };
    }
    return this.snapshotCache;
  };
  private changed() {
    this.snapVersion++;
    this.listeners.forEach((f) => f());
    this.requestRender();
  }

  private hint(): string {
    if (this.picking) return T().patterns.pickHint;
    const steps = T().hints[this.tool];
    if (this.tool === 'measure') return steps[!this.ruler ? 0 : this.ruler.b ? 2 : 1];
    if (this.tool === 'dimension') return steps[Math.min(this.dimRefs.length, 2)];
    return steps[Math.min(this.picks.length, steps.length - 1)];
  }

  get sketch() {
    return this.doc.sketch;
  }
  get unit() {
    return this.sketch.settings.unit;
  }

  flash(msg: string) {
    this.message = msg;
    clearTimeout(this.messageTimer);
    this.messageTimer = window.setTimeout(() => {
      this.message = null;
      this.changed();
    }, 5000);
    this.changed();
  }

  /** Commit com mensagem de erro automática. */
  commit(next: Sketch, code: string[]) {
    const r = this.doc.commit(next, code);
    if (!r.ok) this.flash(r.message!);
    else this.clearMessage();
    return r.ok;
  }

  /** Commit em passos (ver SketchDoc.commitStepped). */
  commitStepped(build: (cur: Sketch, t: number) => Sketch, steps: number, code: string[]) {
    const r = this.doc.commitStepped(build, steps, code);
    if (!r.ok) this.flash(r.message!);
    else this.clearMessage();
    return r.ok;
  }

  /** Um aviso antigo não deve continuar na tela depois que a ação seguinte deu certo. */
  clearMessage() {
    if (!this.message) return;
    clearTimeout(this.messageTimer);
    this.message = null;
    this.changed();
  }

  // ---------- comandos ----------
  setTool(t: Tool) {
    this.tool = t;
    this.resetToolState();
    if (t !== 'measure') this.ruler = null;
    if (t === 'dimension') {
      // Pré-seleção: com 1 ou 2 entidades selecionadas, a cota vai direto para o posicionamento.
      const sel = this.selection.filter((id) => this.sketch.entities[id]);
      if (sel.length && sel.length === this.selection.length && sel.length <= 2) {
        const refs = this.dimensionRefs(sel);
        if (refs && (sel.length === 2 || this.sketch.entities[sel[0]].type !== 'point')) this.dimRefs = refs;
        else if (sel.length === 1 && this.sketch.entities[sel[0]].type === 'point') this.dimRefs = sel;
        else this.flash(T().msg.noDimension);
      }
      if (!this.dimRefs.length) this.selection = [];
    } else if (t !== 'select') this.selection = [];
    this.canvas.style.cursor = t === 'select' ? 'default' : 'crosshair';
    this.changed();
  }

  private resetToolState() {
    this.picks = [];
    this.dimRefs = [];
    this.inferHV = null;
    this.arcSweep = 0;
    this.lastArcAngle = null;
  }

  select(ids: Id[]) {
    this.selection = ids.filter((id) => this.exists(id));
    this.changed();
  }

  /** Entidades (não grupos) da seleção. */
  get selectedEntities(): Id[] {
    return expandSelection(this.sketch, this.selection);
  }

  /** Simetria entre dois pontos em relação ao eixo X, Y ou a uma linha (pelo id). */
  symmetricPoints(p1: Id, p2: Id, axis: 'x' | 'y' | Id) {
    const code = [`g.symmetric(${q(p1)}, ${q(p2)}, axis=${q(axis)})`];
    const build = (half: boolean) => {
      const d = new Draft(this.sketch);
      const line = axis === 'x' || axis === 'y' ? ensureAxisLine(d, axis).line : axis;
      if (!half) {
        d.addConstraint('symmetric', [p1, p2, line]);
        return d.sk;
      }
      // Metade que falta: o ponto médio de p1–p2 sobre o eixo (a perpendicularidade já vale,
      // ex.: pontas de uma linha vertical com eixo X). Usa a linha p1–p2 se existir, senão uma auxiliar.
      let seg = Object.values(d.sk.entities).find((e) => e.type === 'line' && ((e.p1 === p1 && e.p2 === p2) || (e.p1 === p2 && e.p2 === p1)))?.id;
      if (!seg) {
        seg = d.addLine(p1, p2, true);
        d.sk.entities[seg] = { ...(d.sk.entities[seg] as LineEnt), aux: true };
      }
      d.addConstraint('midpointOnLine', [seg, line]);
      return d.sk;
    };
    const full = this.doc.commit(build(false), code);
    if (full.ok) return this.select([]);
    const half = this.doc.commit(build(true), code);
    if (half.ok) this.select([]);
    else this.flash(half.message!);
  }

  applyGeom(tool: GeomTool) {
    const sel = this.selection.filter((id) => this.sketch.entities[id]);
    const list = constraintsFor(this.sketch, tool, sel);
    if (!list.length) {
      const hasGroup = this.selection.some((id) => this.sketch.groups.some((g) => g.id === id));
      this.flash(hasGroup ? T().msg.pickGroupMember : T().msg.notApplicable);
      return;
    }
    if (tool === 'symmetric' && list[0].refs.length === 2) return; // falta o eixo: o painel da barra pergunta
    const d = new Draft(this.sketch);
    const code: string[] = [];
    for (const c of list) {
      const id = d.addConstraint(c.type, c.refs);
      code.push(constraintCode(d.sk.constraints.find((k) => k.id === id)!));
    }
    // Como no Onshape, a seleção é limpa depois de aplicar a restrição.
    if (this.commit(d.sk, code)) this.select([]);
  }

  toggleConstruction() {
    const ents = this.selectedEntities.filter((id) => isCurve(this.sketch.entities[id]));
    if (!ents.length) return;
    const next = toggleConstruction(this.sketch, ents);
    const on = ents.some((id) => (next.entities[id] as { construction?: boolean }).construction);
    this.commit(next, [`g.construction([${ents.map(q).join(', ')}], ${on ? 'True' : 'False'})`]);
  }

  toggleFixed() {
    const ents = this.selectedEntities;
    if (!ents.length) return;
    const next = toggleFixed(this.sketch, ents);
    const pts = Object.keys(next.entities).filter((id) => next.entities[id] !== this.sketch.entities[id]);
    if (!pts.length) return;
    const on = pts.some((id) => (next.entities[id] as { fixed?: boolean }).fixed);
    const dropped = this.sketch.constraints.length - next.constraints.length;
    if (this.commit(next, [`g.${on ? 'fix' : 'unfix'}(${pts.map(q).join(', ')})`]) && dropped) this.flash(T().msg.fixDropped(dropped));
  }

  deleteSelection() {
    if (!this.selection.length) return;
    const ids = [...this.selection];
    const ok = this.commit(deleteItems(this.sketch, ids), [`g.delete(${ids.map(q).join(', ')})`]);
    if (ok) this.selection = [];
    this.changed();
  }

  /** Solta as curvas da seleção dos pontos fixos a que estão ligadas (ex.: "Soltar da origem"). */
  detachSelection() {
    let sk = this.sketch;
    const curves = expandSelection(sk, this.selection).filter((id) => isCurve(sk.entities[id]));
    const code: string[] = [];
    for (const p of fixedPointsOf(sk, this.selection)) {
      const users = curvesUsing(sk, p).filter((c) => curves.includes(c));
      const r = detachFromPoint(sk, p, users);
      if (!r) continue;
      sk = r.sketch;
      code.push(`${r.newId} = g.detach(${q(p)}, [${users.map(q).join(', ')}])`);
    }
    if (code.length) this.commit(sk, code);
  }

  /** Modo "escolher uma linha no desenho" (ex.: eixo do espelho). O próximo clique numa linha chama `cb`. */
  picking: ((id: Id) => void) | null = null;
  pickLine(cb: ((id: Id) => void) | null) {
    this.picking = cb;
    this.canvas.style.cursor = cb ? 'crosshair' : 'default';
    this.changed();
  }

  // ----- offset, espelho e padrões (resultado vira grupo e fica selecionado) -----
  private commitOp(r: { sketch: Sketch; groupId: Id }, code: string, optional: { type: ConstraintType; refs: Id[] }[] = []) {
    const res = this.doc.commitWithOptional(r.sketch, optional.map((o) => ({ ...o, quiet: true })), [code]);
    if (!res.ok) {
      this.flash(res.message!);
      return false;
    }
    this.clearMessage();
    this.enteredGroup = null;
    this.select([r.groupId]);
    return true;
  }

  private selArg(ids: Id[]) {
    return ids.length === 1 ? q(ids[0]) : `[${ids.map(q).join(', ')}]`;
  }

  /** Offset associativo: `d` em mm (sinal = lado). */
  offsetSelection(d: number, text: string) {
    const ids = this.selectedEntities.filter((id) => isCurve(this.sketch.entities[id]));
    try {
      const r = offsetCurves(this.sketch, ids, d);
      return this.commitOp(r, `${r.groupId} = g.offset(${this.selArg(ids)}, ${q(text)})`);
    } catch (e) {
      this.flash((e as Error).message);
      return false;
    }
  }

  /** Nova distância do offset (sinal = lado). */
  setOffset(groupId: Id, d: number, text: string) {
    try {
      const g = this.sketch.groups.find((x) => x.id === groupId);
      const d0 = g?.offset ? g.offset.side * g.offset.distance : d;
      const code = [`g.set_offset(${q(groupId)}, ${q(text)})`];
      // Mesmo lado: anda em passos para as peças presas ao offset não "virarem" (cotas sem sinal).
      if (Math.sign(d0) === Math.sign(d)) return this.commitStepped((cur, t) => setOffsetDistance(cur, groupId, d0 + (d - d0) * t), stepsFor(d0, d), code);
      return this.commit(setOffsetDistance(this.sketch, groupId, d), code);
    } catch (e) {
      this.flash((e as Error).message);
      return false;
    }
  }

  mirrorSelection(axis: MirrorAxis) {
    const sel = this.selection.filter((id) => id !== axis);
    try {
      const r = mirrorEntities(this.sketch, sel, axis);
      return this.commitOp(r, `${r.groupId} = g.mirror(${this.selArg(sel)}, axis=${q(axis)})`);
    } catch (e) {
      this.flash((e as Error).message);
      return false;
    }
  }

  linearArraySelection(nx: number, ny: number, dx: number, dy: number, args: { dx: string; dy: string }) {
    try {
      const r = linearArray(this.sketch, this.selection, nx, ny, dx, dy);
      return this.commitOp(r, `${r.groupId} = g.array(${this.selArg(this.selection)}, nx=${nx}, ny=${ny}, dx=${q(args.dx)}, dy=${q(args.dy)})`);
    } catch (e) {
      this.flash((e as Error).message);
      return false;
    }
  }

  circularArraySelection(n: number, angle: number, center: Vec | Id, angleArg: string) {
    try {
      const sel = this.selection.filter((id) => id !== center);
      const r = circularArray(this.sketch, sel, n, angle, center);
      const cArg = typeof center === 'string' ? q(center) : xy(center);
      return this.commitOp(r, `${r.groupId} = g.array_circular(${this.selArg(sel)}, n=${n}, angle=${q(angleArg)}, center=${cArg})`);
    } catch (e) {
      this.flash((e as Error).message);
      return false;
    }
  }

  /** Novos parâmetros de um padrão (quantidade, passo, ângulo). */
  setPatternParams(gid: Id, next: Parameters<typeof setPattern>[2], code: string) {
    try {
      return this.commit(setPattern(this.sketch, gid, next), [code]);
    } catch (e) {
      this.flash((e as Error).message);
      return false;
    }
  }

  // ----- grupos -----
  groupSelection() {
    const r = createGroup(this.sketch, this.selection);
    if (!r) return;
    const g = r.sketch.groups.find((x) => x.id === r.id)!;
    if (this.commit(r.sketch, [`${g.id} = g.group([${g.members.map(q).join(', ')}], name=${q(g.name)})`])) {
      this.selection = [r.id];
      this.enteredGroup = null;
      this.changed();
    }
  }

  ungroupSelection() {
    const gids = this.selection.filter((id) => this.sketch.groups.some((g) => g.id === id));
    if (!gids.length) return;
    const members = expandSelection(this.sketch, gids);
    if (this.commit(ungroup(this.sketch, gids), [`g.ungroup(${gids.map(q).join(', ')})`])) this.select(members);
  }

  renameEntity(id: Id, name: string) {
    const e = this.sketch.entities[id];
    if (!e || id === ORIGIN_ID || (e.name ?? '') === name.trim()) return;
    try {
      this.commit(renameEntity(this.sketch, id, name), [`g.rename(${q(id)}, ${q(name.trim())})`]);
    } catch (e) {
      this.flash((e as Error).message);
    }
  }

  renameGroup(id: Id, name: string) {
    const n = name.trim();
    const g = this.sketch.groups.find((x) => x.id === id);
    if (!n || !g || g.name === n) return;
    try {
      this.commit(updateGroup(this.sketch, id, { name: n }), [`g.rename(${q(id)}, ${q(n)})`]);
    } catch (e) {
      this.flash((e as Error).message);
    }
  }

  toggleGroupHidden(g: Group) {
    const hidden = !g.hidden;
    this.commit(updateGroup(this.sketch, g.id, { hidden }), [`g.${hidden ? 'hide' : 'show'}(${q(g.id)})`]);
    if (hidden) this.select(this.selection.filter((id) => id !== g.id && !g.members.includes(id)));
  }

  enterGroup(id: Id | null) {
    this.enteredGroup = id;
    this.changed();
  }

  /** Mover/girar os ids dados. `args` mostra no histórico os valores como o usuário digitou. */
  transform(ids: Id[], t: Transform, args: { dx?: string; dy?: string; angle?: string }) {
    const pts = selectionPoints(this.sketch, ids);
    if (!pts.length) return false;
    const target = ids.length === 1 ? q(ids[0]) : `[${ids.map(q).join(', ')}]`;
    const code: string[] = [];
    // Gira em torno do pivô e depois translada.
    if (t.angle) code.push(`g.rotate(${target}, ${q(args.angle ?? `${t.angle} deg`)}, pivot=${xy(t.pivot)})`);
    if (t.dx || t.dy) code.push(`g.translate(${target}, dx=${q(args.dx ?? `${t.dx} mm`)}, dy=${q(args.dy ?? `${t.dy} mm`)})`);
    if (!code.length) return false;
    const { sketch, removed } = adaptOrientationConstraints(this.sketch, pts, t.angle);
    const ok = this.commit(transformPoints(sketch, pts, t), code);
    if (ok && removed) this.flash(T().msg.orientationRemoved(removed));
    return ok;
  }

  fit() {
    this.view.fit(this.contentBBox());
    this.changed();
  }

  /** Caixa da geometria incluindo os textos das cotas. */
  contentBBox() {
    const sk = this.sketch;
    const b = sketchBBox(sk);
    // Inclui os textos das cotas.
    for (const c of sk.constraints) {
      if (!isDimension(c) || !c.label) continue;
      const a = dimAnchor(sk, c);
      if (!a) continue;
      const x = a.x + c.label.x;
      const y = a.y + c.label.y;
      b.x0 = Math.min(b.x0, x);
      b.x1 = Math.max(b.x1, x);
      b.y0 = Math.min(b.y0, y);
      b.y1 = Math.max(b.y1, y);
    }
    return b;
  }

  /** Imagem do desenho (PNG/JPG), enquadrada na geometria, sem grade nem símbolos de restrição. */
  exportImage(type: 'image/png' | 'image/jpeg', width = 2400): Promise<Blob> {
    const b = this.contentBBox();
    const bw = Math.max(b.x1 - b.x0, 1e-6);
    const bh = Math.max(b.y1 - b.y0, 1e-6);
    const w = width;
    const h = Math.round(Math.min(Math.max((w * bh) / bw, 200), 4 * w));
    const v = new View();
    v.w = w;
    v.h = h;
    // Resultados com legenda (e sem posição escolhida): reserva uma faixa à direita para ela.
    const hasLegend = this.mode === 'post' && !this.postLegend && this.postLayers.some((l) => l.plot === 'surface' || l.colorByValue);
    v.fit(hasLegend ? { ...b, x1: b.x1 + (b.x1 - b.x0) * 0.22 } : b, Math.round(w * 0.04));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    render(ctx, v, this.sketch, {
      selection: new Set(),
      hover: null,
      related: new Set(),
      hidden: this.hiddenSet(),
      unit: this.unit,
      axisymmetric: false,
      defined: new Set(),
      preview: null,
      previewDim: null,
      snap: null,
      inference: null,
      box: null,
      groupBoxes: [],
      hideDim: null,
      measure: null,
      plain: true,
      // Vista de resultados/malha: a imagem leva o campo (ou as regiões), não só a geometria.
      post: this.mode === 'post' ? { ...this.postView()!, probe: null } : undefined,
      uiScale: w / 900,
      mesh: this.mode === 'mesh' ? this.meshView() : undefined,
    });
    return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('canvas'))), type, 0.95));
  }

  undo() {
    this.resetToolState();
    this.doc.undo();
  }
  redo() {
    this.resetToolState();
    this.doc.redo();
  }

  /** Aplica o texto digitado (número, número com unidade ou expressão) à cota `id`. */
  setDimensionText(id: Id, text: string) {
    const sk = this.sketch;
    const c = sk.constraints.find((k) => k.id === id);
    this.editing = null;
    if (!c) return this.changed();
    if (c.offsetDim) {
      // Cota do offset: muda a distância do grupo (negativo inverte o lado).
      try {
        const u = this.unit;
        const d = asLength(evaluate(text.replace(/^offset\s*/i, ''), { env: evaluateVariables(sk.variables, u).values, unit: u }), u);
        const shown = /^[-+]?[\d.,]+$/.test(text.trim()) ? `${text.trim().replace(',', '.')} ${u}` : text.trim();
        this.setOffset(c.offsetDim, d, shown);
      } catch (e) {
        this.flash(T().msg.dimension((e as Error).message));
      }
      return this.changed();
    }
    let parsed: { value: number; expr?: string };
    try {
      parsed = parseDimensionInput(sk, c, text);
    } catch (e) {
      this.flash(T().msg.dimension((e as Error).message));
      return;
    }
    if (Math.abs(parsed.value - (c.value ?? 0)) < 1e-12 && parsed.expr === c.expr) return this.changed();
    const next: Constraint = { ...c, value: parsed.value, expr: parsed.expr };
    if (!parsed.expr) delete next.expr;
    const constraints = sk.constraints.map((k) => (k.id === id ? next : k));
    const arg = parsed.expr ?? (c.type === 'angle' ? `${Number(parsed.value.toFixed(6))} deg` : formatLength(parsed.value, this.unit).replace(',', '.'));
    const v0 = c.value ?? parsed.value;
    const n = stepsFor(v0, parsed.value);
    if (n > 1)
      // Mudança grande: passos intermediários (numéricos); o último leva a expressão, se houver.
      this.commitStepped(
        (cur, t) => ({
          ...cur,
          constraints: cur.constraints.map((k) => (k.id !== id ? k : t < 1 ? { ...k, value: v0 + (parsed.value - v0) * t, expr: undefined } : next)),
        }),
        n,
        [`g.set_dimension(${q(id)}, ${q(arg)})`],
      );
    else this.commit({ ...sk, constraints }, [`g.set_dimension(${q(id)}, ${q(arg)})`]);
    this.changed();
  }

  cancelEditing() {
    this.editing = null;
    this.changed();
  }

  startEditing(id: Id) {
    const c = this.sketch.constraints.find((k) => k.id === id);
    if (!c || !isDimension(c)) return;
    // Mesma posição em que o texto é desenhado (inclui cotas sem posição gravada).
    const drawn = dimDrawing(this.sketch, c, this.view.px(1));
    if (!drawn) return;
    const s = this.view.toScreen(drawn.text);
    const og = c.offsetDim ? this.sketch.groups.find((g) => g.id === c.offsetDim) : undefined;
    const v = og?.offset ? og.offset.side * og.offset.distance : c.value ?? 0;
    const text = c.expr ?? (c.type === 'angle' ? String(Number(v.toFixed(4))).replace('.', ',') : formatLength(v, this.unit).split(' ')[0]);
    this.editing = { id, x: s.x, y: s.y, text, angle: c.type === 'angle' };
    this.changed();
  }

  // ---------- renderização ----------
  private resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.view.w = r.width;
    this.view.h = r.height;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  requestRender() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  /** Entidades ocultas (grupos ocultos), incluindo pontos que só elas usam. */
  private hiddenSet(): Set<Id> {
    const sk = this.sketch;
    const hidden = new Set<Id>();
    for (const e of Object.values(sk.entities)) if ((e.type === 'point' || e.type === 'line') && e.aux) hidden.add(e.id);
    for (const g of sk.groups) if (g.hidden) g.members.forEach((m) => hidden.add(m));
    if (!sk.groups.some((g) => g.hidden)) return hidden;
    const visiblePts = new Set<Id>();
    for (const e of Object.values(sk.entities)) if (isCurve(e) && !hidden.has(e.id)) curvePoints(e).forEach((p) => visiblePts.add(p));
    for (const id of [...hidden]) {
      const e = sk.entities[id];
      if (isCurve(e)) curvePoints(e).forEach((p) => !visiblePts.has(p) && hidden.add(p));
    }
    hidden.delete(ORIGIN_ID);
    return hidden;
  }

  private draw() {
    const sk = this.sketch;
    const hoverId = this.hover?.id ?? null;
    const related = new Set<Id>();
    const hc = hoverId ? sk.constraints.find((c) => c.id === hoverId) : null;
    if (hc) hc.refs.forEach((r) => related.add(r));
    if (this.hover?.kind === 'group') expandSelection(sk, [this.hover.id]).forEach((id) => related.add(id));
    for (const id of this.selection) sk.constraints.find((c) => c.id === id)?.refs.forEach((r) => related.add(r));
    const selected = new Set<Id>([...this.selection, ...expandSelection(sk, this.selection)]);
    const groupBoxes = this.selection
      .map((id) => sk.groups.find((g) => g.id === id))
      .filter((g): g is Group => !!g)
      .map((g) => this.groupBox(g, false));
    if (this.enteredGroup) {
      const g = sk.groups.find((x) => x.id === this.enteredGroup);
      if (g) groupBoxes.push(this.groupBox(g, true));
    }
    const st: RenderState = {
      selection: selected,
      hover: this.hover?.kind === 'group' ? null : hoverId,
      related,
      hidden: this.hiddenSet(),
      unit: this.unit,
      axisymmetric: sk.settings.problem === 'axisymmetric',
      defined: this.doc.defined,
      preview: this.buildPreview(),
      previewDim: this.buildPreviewDim(),
      snap: this.snapIndicator(),
      inference: this.inferHV ? { pos: this.cursorPick?.pos ?? this.cursor, text: this.inferHV } : null,
      box: this.drag?.kind === 'box' && this.drag.moved ? { a: this.drag.startScreen, b: this.view.toScreen(this.cursor) } : null,
      groupBoxes,
      hideDim: this.editing?.id ?? null,
      measure: this.measureOverlay(),
      dark: isDark(),
      mesh: this.mode === 'mesh' ? this.meshView() : undefined,
      post: this.mode === 'post' ? this.postView() : undefined,
    };
    this.hits = render(this.ctx, this.view, sk, st);
  }

  /** Linha de medida: a régua, ou a distância mínima entre duas entidades selecionadas. */
  private measureOverlay(): RenderState['measure'] {
    const u = this.unit;
    if (this.tool === 'measure' && this.ruler) {
      const b = this.ruler.b ?? this.cursorPick?.pos ?? this.cursor;
      return { a: this.ruler.a, b, text: formatLength(dist(this.ruler.a, b), u) };
    }
    const sel = this.selection.filter((id) => this.sketch.entities[id] || this.sketch.groups.some((g) => g.id === id));
    if (this.tool === 'select' && sel.length === 2 && this.selection.length === 2) {
      const m = minDistanceSets(this.sketch, expandSelection(this.sketch, [sel[0]]), expandSelection(this.sketch, [sel[1]]));
      if (m && m.d > 0) return { a: m.pa, b: m.pb, text: formatLength(m.d, u) };
    }
    return null;
  }

  /** Cota pedida entre uma curva/ponto do offset e a sua curva-pai? Devolve o grupo do offset. */
  private offsetBetween(refs: Id[]): Group | undefined {
    const sk = this.sketch;
    return sk.groups.find((g) => {
      if (!g.offset) return false;
      const inChild = refs.some((r) => g.members.includes(r) || this.pointInGroup(g, r));
      const inParent = refs.some((r) => g.offset!.parents.includes(r) || this.parentPointsOf(g).has(r));
      return inChild && inParent;
    });
  }

  /** Dados de desenho do modo malha: regiões preenchidas pelo material, contornos coloridos. */
  private meshView(): RenderState['mesh'] {
    const sk = this.sketch;
    const arr = this.arrangement();
    const mats = new Map(sk.materials.map((m) => [m.id, m]));
    const byRegion = new Map<number, RegionAssign>();
    for (const a of sk.regionAssigns) {
      const r = findRegion(arr, a);
      if (r) byRegion.set(r.index, a);
    }
    const selKey = this.meshSel?.kind === 'region' ? findRegion(arr, this.meshSel) : null;
    // Cor de cada curva com contorno (a escolhida ou a do tipo).
    const boundaryOf = new Map<Id, string>();
    for (const b of sk.boundaries) for (const c of b.curves) boundaryOf.set(c, boundaryColor(b));
    // Borda externa sem contorno explícito: A = 0 (padrão).
    const outerB = sk.boundaries.find((b) => b.id === OUTER_BOUNDARY);
    for (const c of this.defaultOuter()) boundaryOf.set(c, outerB ? boundaryColor(outerB) : BOUNDARY_COLOR.dirichlet);
    return {
      regions: arr.regions.map((r) => {
        const a = byRegion.get(r.index);
        const m = a?.material ? mats.get(a.material) : undefined;
        const drag = this.regionLabelDrag?.index === r.index ? this.regionLabelDrag.off : null;
        return {
          index: r.index,
          labelOffset: drag ?? a?.labelOffset ?? null,
          outer: r.outer.poly,
          holes: r.holes.map((h) => h.poly),
          color: m?.color ?? null,
          label: a?.name ? `${a.name} · ${m?.name ?? T().mesh.noMaterial}` : (m?.name ?? T().mesh.noMaterial),
          at: r.label,
          selected: selKey === r,
          hovered: this.meshHover?.kind === 'region' && this.meshHover.index === r.index,
        };
      }),
      boundaryOf,
      selectedCurves: new Set(this.meshSel?.kind === 'curves' ? this.meshSel.ids : []),
      hoverCurve: this.meshHover?.kind === 'curve' ? this.meshHover.id : null,
      tri: (() => {
        const m = this.shownMesh ? this.meshes.get(this.shownMesh) : undefined;
        return m ? { xy: m.xy, triangles: m.triangles, stale: this.meshStale(this.shownMesh!), quality: this.meshQuality } : undefined;
      })(),
    };
  }

  /** No modo malha: curva sob o cursor (contornos) ou, senão, a região. */
  private meshHit(s: Vec): SketchEditor['meshHover'] {
    const h = this.hitTest(s, { entitiesOnly: true });
    if (h?.kind === 'curve' && !(this.sketch.entities[h.id] as { construction?: boolean }).construction) return { kind: 'curve', id: h.id };
    const r = regionAt(this.arrangement(), this.view.toWorld(s));
    return r ? { kind: 'region', index: r.index } : null;
  }

  private meshClick(s: Vec, add: boolean) {
    const h = this.meshHit(s);
    if (!h) this.meshSel = null;
    else if (h.kind === 'curve') {
      const prev = this.meshSel?.kind === 'curves' && add ? this.meshSel.ids : [];
      this.meshSel = { kind: 'curves', ids: prev.includes(h.id) ? prev.filter((x) => x !== h.id) : [...prev, h.id] };
    } else {
      const r = this.arrangement().regions[h.index];
      this.meshSel = { kind: 'region', curves: r.curves, seed: r.label };
    }
    this.changed();
  }

  /** Curvas da borda externa que não têm contorno explícito (recebem A = 0 por padrão). */
  defaultOuter(): Id[] {
    const taken = new Set(this.sketch.boundaries.flatMap((b) => b.curves));
    return this.arrangement().outer.filter((c) => !taken.has(c));
  }

  /** Etiqueta de região sendo arrastada (deslocamento ao vivo, gravado ao soltar). */
  private regionLabelDrag: { index: number; off: Vec; grab: Vec; moved: boolean } | null = null;

  /** Etiqueta de região sob o cursor (índice da região). */
  private regionLabelAt(s: Vec): number | null {
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i];
      if (h.kind === 'regionLabel' && s.x >= h.x0 && s.x <= h.x1 && s.y >= h.y0 && s.y <= h.y1) return Number(h.id);
    }
    return null;
  }

  /** Seleciona curvas (contornos) pela árvore. */
  selectCurves(ids: Id[]) {
    this.meshSel = ids.length ? { kind: 'curves', ids } : null;
    this.changed();
  }

  /** Seleciona uma região pela árvore. */
  selectRegion(index: number) {
    const r = this.arrangement().regions[index];
    if (!r) return;
    this.meshSel = { kind: 'region', curves: r.curves, seed: r.label };
    this.changed();
  }

  /** O ponto pertence a uma curva do grupo? */
  private pointInGroup(g: Group, p: Id) {
    return g.members.some((m) => {
      const e = this.sketch.entities[m];
      return isCurve(e) && curvePoints(e).includes(p);
    });
  }

  /** Pontos das curvas-pai de um offset (não devem ser puxados ao arrastar o offset). */
  private parentPointsOf(g: Group): Set<Id> {
    const out = new Set<Id>();
    for (const id of g.offset?.parents ?? []) {
      const e = this.sketch.entities[id];
      if (isCurve(e)) curvePoints(e).forEach((p) => out.add(p));
    }
    return out;
  }

  private groupBox(g: Group, entered: boolean) {
    let b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const id of g.members) {
      const e = this.sketch.entities[id];
      if (!e) continue;
      const eb = entityBBox(this.sketch, e);
      b = { x0: Math.min(b.x0, eb.x0), y0: Math.min(b.y0, eb.y0), x1: Math.max(b.x1, eb.x1), y1: Math.max(b.y1, eb.y1) };
    }
    return { ...b, name: g.name, entered };
  }

  private snapIndicator(): RenderState['snap'] {
    const kind = (p: Pick) => (p.pointId ? 'point' : p.midOf ? 'mid' : 'curve') as 'point' | 'mid' | 'curve';
    const d = this.drag;
    if (d?.single && d.dropOn && (d.dropOn.pointId || d.dropOn.curveId || d.dropOn.midOf)) return { pos: d.dropOn.pos, kind: kind(d.dropOn) };
    if (this.tool === 'select' || this.tool === 'dimension') return null;
    const p = this.cursorPick;
    if (!p || (!p.pointId && !p.curveId && !p.midOf)) return null;
    return { pos: p.pos, kind: kind(p) };
  }

  // ---------- hit test / snap ----------
  private screenOf(e: PointerEvent | MouseEvent): Vec {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /** Grupo "de cima" de uma entidade (pontos de curvas agrupadas pertencem ao grupo da curva). */
  private topGroup(id: Id): Group | undefined {
    const sk = this.sketch;
    let g = groupOf(sk, id);
    if (!g && sk.entities[id]?.type === 'point') {
      for (const e of Object.values(sk.entities)) {
        if (isCurve(e) && curvePoints(e).includes(id)) {
          g = groupOf(sk, e.id);
          if (g) break;
        }
      }
    }
    return g && g.id !== this.enteredGroup ? g : undefined;
  }

  /**
   * O que está sob o cursor. `entitiesOnly` ignora cotas/badges e grupos (ferramentas de desenho e cota).
   */
  private hitTest(s: Vec, opts: { entitiesOnly?: boolean } = {}): Hit | null {
    const sk = this.sketch;
    const hidden = this.hiddenSet();
    const w = this.view.toWorld(s);
    const wrap = (h: { kind: 'point' | 'curve'; id: Id }): Hit => {
      if (opts.entitiesOnly) return h;
      // Curvas agrupadas selecionam o grupo; vértices continuam individuais (arrastar o canto
      // redimensiona, soltar sobre outro ponto une). Pontos soltos que são membros pegam o grupo.
      const g = h.kind === 'curve' ? this.topGroup(h.id) : groupOf(this.sketch, h.id);
      return g && g.id !== this.enteredGroup ? { kind: 'group', id: g.id, entity: h.id } : h;
    };
    let best: { id: Id; d: number } | null = null;
    for (const e of Object.values(sk.entities)) {
      if (e.type !== 'point' || hidden.has(e.id)) continue;
      const d = dist(this.view.toScreen(e), s);
      if (d <= POINT_SNAP_PX && (!best || d < best.d)) best = { id: e.id, d };
    }
    if (best) return wrap({ kind: 'point', id: best.id });
    if (!opts.entitiesOnly) {
      for (let i = this.hits.length - 1; i >= 0; i--) {
        const h = this.hits[i];
        if (h.kind !== 'regionLabel' && h.kind !== 'legend' && s.x >= h.x0 && s.x <= h.x1 && s.y >= h.y0 && s.y <= h.y1) return { kind: h.kind, id: h.id };
      }
    }
    for (const e of Object.values(sk.entities)) {
      if (!isCurve(e) || hidden.has(e.id)) continue;
      const d = closestOnCurve(sk, e, w).d * this.view.scale;
      if (d <= CURVE_SNAP_PX && (!best || d < best.d)) best = { id: e.id, d };
    }
    return best ? wrap({ kind: 'curve', id: best.id }) : null;
  }

  /** Encaixe do cursor para as ferramentas de desenho (e para soltar um ponto arrastado). */
  private pickAt(s: Vec, exclude: Set<Id> = new Set()): Pick {
    const sk = this.sketch;
    const hidden = this.hiddenSet();
    const w = this.view.toWorld(s);
    let bestP: { id: Id; d: number } | null = null;
    for (const e of Object.values(sk.entities)) {
      if (e.type !== 'point' || exclude.has(e.id) || hidden.has(e.id)) continue;
      const d = dist(this.view.toScreen(e), s);
      if (d <= POINT_SNAP_PX && (!bestP || d < bestP.d)) bestP = { id: e.id, d };
    }
    if (bestP) {
      const p = pt(sk, bestP.id);
      return { pos: { x: p.x, y: p.y }, pointId: bestP.id };
    }
    // Ponto médio das linhas (depois dos pontos, antes das curvas).
    let bestM: { id: Id; d: number; q: Vec } | null = null;
    for (const e of Object.values(sk.entities)) {
      if (e.type !== 'line' || e.aux || exclude.has(e.id) || hidden.has(e.id)) continue;
      const a = pt(sk, e.p1);
      const b = pt(sk, e.p2);
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const d = dist(this.view.toScreen(m), s);
      if (d <= POINT_SNAP_PX && (!bestM || d < bestM.d)) bestM = { id: e.id, d, q: m };
    }
    if (bestM) return { pos: bestM.q, midOf: bestM.id };
    let bestC: { id: Id; d: number; q: Vec } | null = null;
    for (const e of Object.values(sk.entities)) {
      if (!isCurve(e) || exclude.has(e.id) || hidden.has(e.id)) continue;
      const { q, d } = closestOnCurve(sk, e, w);
      const dp = d * this.view.scale;
      if (dp <= CURVE_SNAP_PX && (!bestC || dp < bestC.d)) bestC = { id: e.id, d: dp, q };
    }
    if (bestC) return { pos: bestC.q, curveId: bestC.id };
    return { pos: w };
  }

  /** Inferência horizontal/vertical em relação ao clique anterior (linha). */
  private applyInference(p: Pick): Pick {
    this.inferHV = null;
    if ((this.tool !== 'line' && this.tool !== 'cline') || this.picks.length !== 1 || p.pointId || p.midOf) return p;
    const a = this.picks[0].pos;
    const dx = p.pos.x - a.x;
    const dy = p.pos.y - a.y;
    const hv: 'H' | 'V' | null =
      Math.abs(dx) > 1e-9 && Math.abs(dy) <= HV_TOL * Math.abs(dx) ? 'H' : Math.abs(dy) > 1e-9 && Math.abs(dx) <= HV_TOL * Math.abs(dy) ? 'V' : null;
    if (!hv) return p;
    const pos = hv === 'H' ? { x: p.pos.x, y: a.y } : { x: a.x, y: p.pos.y };
    if (p.curveId) {
      // Encaixado numa curva: vai para a interseção da reta H/V com a curva (as duas restrições valem);
      // se ela estiver longe do cursor, a curva vence a inferência.
      const q = this.hvOnCurve(p.curveId, hv, hv === 'H' ? a.y : a.x, p.pos);
      if (!q || dist(this.view.toScreen(q), this.view.toScreen(p.pos)) > CURVE_SNAP_PX) return p;
      this.inferHV = hv;
      return { pos: q, curveId: p.curveId };
    }
    this.inferHV = hv;
    return { pos };
  }

  /** Interseção da reta y = c (H) ou x = c (V) com a curva, mais perto de `near`. */
  private hvOnCurve(id: Id, hv: 'H' | 'V', c: number, near: Vec): Vec | null {
    const sk = this.sketch;
    const e = sk.entities[id];
    const cands: Vec[] = [];
    if (e?.type === 'line') {
      const p1 = pt(sk, e.p1), p2 = pt(sk, e.p2);
      const u1 = hv === 'H' ? p1.y : p1.x, u2 = hv === 'H' ? p2.y : p2.x;
      if (Math.abs(u2 - u1) > 1e-12) {
        const t = (c - u1) / (u2 - u1);
        if (t >= -1e-9 && t <= 1 + 1e-9) cands.push({ x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) });
      }
    } else if (e?.type === 'circle' || e?.type === 'arc') {
      const ce = pt(sk, e.c);
      const off = hv === 'H' ? c - ce.y : c - ce.x;
      if (Math.abs(off) <= e.r) {
        const h = Math.sqrt(e.r * e.r - off * off);
        for (const sgn of [-1, 1]) {
          const q = hv === 'H' ? { x: ce.x + sgn * h, y: c } : { x: c, y: ce.y + sgn * h };
          // Arco: só pontos dentro do arco (perto dele).
          if (e.type === 'circle' || closestOnCurve(sk, e, q).d < 1e-6 * Math.max(1, e.r)) cands.push(q);
        }
      }
    }
    let best: Vec | null = null;
    for (const q of cands) if (!best || dist(q, near) < dist(best, near)) best = q;
    return best;
  }

  // ---------- eventos ----------
  private onWheel(e: WheelEvent) {
    e.preventDefault();
    const s = this.screenOf(e);
    this.view.zoomAt(s, Math.pow(1.0015, -e.deltaY));
    this.editing = null;
    this.changed();
  }

  private onDown(e: PointerEvent) {
    this.canvas.setPointerCapture(e.pointerId);
    const s = this.screenOf(e);
    const w = this.view.toWorld(s);
    if (this.editing) this.editing = null;
    if (e.button === 1 || e.button === 2 || this.spaceDown) {
      this.drag = { kind: 'pan', startScreen: s, startWorld: w, hit: null, shift: false, moved: false };
      this.canvas.style.cursor = 'grabbing';
      return;
    }
    if (e.button !== 0) return;
    if (this.mode === 'post') {
      if (this.picking) {
        // Escolher a curva de um gráfico sobre curva.
        const h = this.hitTest(s, { entitiesOnly: true });
        if (h?.kind === 'curve') {
          const cb = this.picking;
          cb(h.id);
          setTimeout(() => this.pickLine(null), 0);
        }
        return;
      }
      const lg = this.hits.find((h) => h.kind === 'legend' && s.x >= h.x0 && s.x <= h.x1 && s.y >= h.y0 && s.y <= h.y1);
      if (lg) {
        // Arrastar move (ou redimensiona pela borda de baixo); clique sem mover abre os limites.
        const ui = this.postLegend?.s ?? 1;
        const L = this.postLegend;
        const orig = { x: L?.x ?? (lg.x0 + 6 * ui) / this.view.w, y: L?.y ?? (lg.y0 + 8 * ui) / this.view.h, s: ui, h: L?.h ?? 180 };
        // Canto inferior direito: escala tudo; borda de baixo: só a altura; o resto move.
        const corner = s.x > lg.x1 - 18 && s.y > lg.y1 - 18;
        const bottom = !corner && s.y > lg.y1 - 10;
        this.legendDrag = { mode: corner ? 'resize' : bottom ? 'height' : 'move', start: s, orig, moved: false, layer: lg.id, lo: lg.data![0], hi: lg.data![1] };
        return;
      }
      this.probeAt = w;
      this.changed();
      return;
    }
    if (this.mode === 'mesh') {
      const li = this.regionLabelAt(s);
      if (li !== null) {
        // Arrastar a etiqueta: o deslocamento parte da posição atual (salva ou padrão).
        const r = this.arrangement().regions[li];
        const cur = this.assignOf(regionKey(r))?.labelOffset ?? { x: LABEL_DEFAULT_PX.x / this.view.scale, y: -LABEL_DEFAULT_PX.y / this.view.scale };
        this.regionLabelDrag = { index: li, off: cur, grab: { x: w.x - (r.label.x + cur.x), y: w.y - (r.label.y + cur.y) }, moved: false };
        this.selectRegion(li);
        return;
      }
      this.meshClick(s, e.shiftKey || e.ctrlKey);
      return;
    }
    if (this.picking) {
      const h = this.hitTest(s, { entitiesOnly: true });
      if (h?.kind === 'curve' && this.sketch.entities[h.id]?.type === 'line') {
        const cb = this.picking;
        cb(h.id);
        // Encerra depois do clique: o painel que pediu a escolha ainda vê o modo ativo e não fecha.
        setTimeout(() => this.pickLine(null), 0);
      } else this.flash(T().patterns.pickHint);
      return;
    }
    if (this.tool === 'select') {
      const hit = this.hitTest(s);
      this.drag = { kind: 'pending', startScreen: s, startWorld: w, hit, shift: e.shiftKey || e.ctrlKey, moved: false };
      return;
    }
    if (this.tool === 'dimension') {
      this.dimensionClick(s);
      return;
    }
    this.drawClick(s);
  }

  private onMove(e: PointerEvent) {
    const s = this.screenOf(e);
    const w = this.view.toWorld(s);
    this.cursor = w;
    const d = this.drag;
    if (d) {
      if (!d.moved && dist(s, d.startScreen) > 3) {
        d.moved = true;
        if (d.kind === 'pending') this.beginDrag(d);
      }
      if (d.kind === 'pan') {
        this.view.panPx(e.movementX, e.movementY);
      } else if (d.moved && d.kind === 'entity') {
        this.dragTo(d, w, s);
      } else if (d.moved && d.kind === 'offset') {
        this.dragOffset(d, w);
      } else if (d.moved && d.kind === 'label') {
        this.dragLabel(d, w);
      }
      this.changed();
      return;
    }
    if (this.mode === 'post' && this.legendDrag) {
      const d = this.legendDrag;
      const dx = s.x - d.start.x, dy = s.y - d.start.y;
      if (Math.hypot(dx, dy) > 3) d.moved = true;
      if (d.moved) {
        this.legendLive =
          d.mode === 'move'
            ? { ...this.postLegend, ...d.orig, x: Math.min(0.98, Math.max(0, d.orig.x + dx / this.view.w)), y: Math.min(0.95, Math.max(0, d.orig.y + dy / this.view.h)) }
            : d.mode === 'height'
              ? { ...this.postLegend, ...d.orig, h: Math.min(900, Math.max(60, d.orig.h + dy / d.orig.s)) }
              : { ...this.postLegend, ...d.orig, s: Math.min(4, Math.max(0.4, d.orig.s * (1 + Math.max(dx / 74, dy / 210) / d.orig.s))) };
        this.canvas.style.cursor = d.mode === 'move' ? 'grabbing' : d.mode === 'height' ? 'ns-resize' : 'nwse-resize';
        this.changed();
      }
      return;
    }
    if (this.mode === 'post') {
      const h = this.picking ? this.hitTest(s, { entitiesOnly: true }) : null;
      this.hover = h?.kind === 'curve' ? h : null;
      const lgHit = this.hits.find((x) => x.kind === 'legend' && s.x >= x.x0 && s.x <= x.x1 && s.y >= x.y0 && s.y <= x.y1);
      this.canvas.style.cursor = this.picking
        ? this.hover
          ? 'pointer'
          : 'default'
        : lgHit
          ? s.x > lgHit.x1 - 18 && s.y > lgHit.y1 - 18
            ? 'nwse-resize'
            : s.y > lgHit.y1 - 10
              ? 'ns-resize'
              : 'grab'
          : 'crosshair';
      this.changed();
      return;
    }
    if (this.mode === 'mesh') {
      const ld = this.regionLabelDrag;
      if (ld) {
        const r = this.arrangement().regions[ld.index];
        ld.off = { x: w.x - ld.grab.x - r.label.x, y: w.y - ld.grab.y - r.label.y };
        ld.moved = true;
        this.canvas.style.cursor = 'grabbing';
        this.changed();
        return;
      }
      const onLabel = this.regionLabelAt(s) !== null;
      this.meshHover = onLabel ? null : this.meshHit(s);
      this.canvas.style.cursor = onLabel ? 'grab' : this.meshHover ? 'pointer' : 'default';
      this.changed();
      return;
    }
    if (this.tool === 'select') {
      const h = this.hitTest(s);
      if (h?.id !== this.hover?.id) this.hover = h;
      // Definido = travado, exceto o offset (arrastar o offset muda a distância).
      const inOffset = (id: Id) =>
        this.sketch.groups.some((g) => (g.offset || g.pattern) && (g.members.includes(id) || this.pointInGroup(g, id)) && !this.parentPointsOf(g).has(id));
      const locked = (h?.kind === 'point' || h?.kind === 'curve') && (h.id === ORIGIN_ID || (this.doc.defined.has(h.id) && !inOffset(h.id)));
      // Definido (travado) fica com o cursor normal; ao tentar arrastar, a barra de status explica.
      this.canvas.style.cursor = !h || h.kind === 'badge' || locked ? 'default' : 'move';
    } else if (this.tool === 'dimension') {
      const h = this.hitTest(s, { entitiesOnly: true });
      if (h?.id !== this.hover?.id) this.hover = h;
    } else {
      this.cursorPick = this.applyInference(this.pickAt(s));
      this.trackArcSweep();
      this.hover = null;
    }
    this.changed();
  }

  private onUp(e: PointerEvent) {
    const lgd = this.legendDrag;
    if (lgd) {
      this.legendDrag = null;
      if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
      if (!lgd.moved) this.legendEdit = { layer: lgd.layer, lo: lgd.lo, hi: lgd.hi };
      else if (this.legendLive && this.postView_) {
        const lv = this.legendLive;
        const L: LegendLayout = { ...this.postLegend, x: +(lv.x ?? 0).toFixed(4), y: +(lv.y ?? 0).toFixed(4), s: +(lv.s ?? 1).toFixed(3), h: Math.round(lv.h ?? 180) };
        this.commit(
          { ...this.sketch, nodes: this.sketch.nodes.map((n) => (n.id === this.postView_ ? { ...n, legend: L } : n)) },
          [`r.show(${q(this.postView_)}, legend=(${L.x}, ${L.y}, ${L.s}, ${L.h}))`],
        );
        this.postLegend = L;
      }
      this.legendLive = null;
      this.changed();
      return;
    }
    const ld = this.regionLabelDrag;
    if (ld) {
      this.regionLabelDrag = null;
      if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
      const r = this.arrangement().regions[ld.index];
      if (ld.moved && r) {
        const off = { x: Math.round(ld.off.x * 1000) / 1000, y: Math.round(ld.off.y * 1000) / 1000 };
        this.meshOp((sk) => assignRegion(sk, this.arrangement(), regionKey(r), { labelOffset: off }), `m.region(${pointCode(r.label)}, label=(${off.x}, ${off.y}))`);
      }
      this.canvas.style.cursor = 'grab';
      this.changed();
      return;
    }
    const d = this.drag;
    this.drag = null;
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    if (!d) return;
    if (d.kind === 'pan') {
      this.canvas.style.cursor = this.tool === 'select' ? 'default' : 'crosshair';
      return;
    }
    if (d.kind === 'entity') return this.finishDrag(d);
    if (d.kind === 'offset') {
      const g = this.sketch.groups.find((x) => x.id === d.offset!.gid);
      this.doc.endLive(g?.offset ? [`g.set_offset(${q(g.id)}, "${round(g.offset.side * g.offset.distance)} mm")`] : []);
      this.clearMessage();
      return;
    }
    if (d.kind === 'label') {
      this.doc.endLive([]);
      return;
    }
    if (d.kind === 'box') {
      this.boxSelect(d.startScreen, this.screenOf(e), d.shift);
      return;
    }
    // Clique simples: seleção. Shift+clique numa curva de grupo pega a curva (para restrições),
    // o clique simples pega o grupo inteiro.
    const id = d.shift && d.hit?.kind === 'group' ? d.hit.entity : d.hit?.id;
    if (!id) {
      if (!d.shift) {
        this.enteredGroup = null;
        this.select([]);
      }
      return;
    }
    if (d.shift) this.select(this.selection.includes(id) ? this.selection.filter((x) => x !== id) : [...this.selection, id]);
    else this.select([id]);
  }

  private onDblClick(e: MouseEvent) {
    const s = this.screenOf(e);
    if ((this.tool === 'line' || this.tool === 'cline') && this.picks.length) {
      this.resetToolState();
      this.changed();
      return;
    }
    const h = this.hitTest(s);
    if (h?.kind === 'dim') setTimeout(() => this.startEditing(h.id), 0);
    else if (h?.kind === 'group' && this.tool === 'select') {
      // Duplo clique entra no grupo e seleciona a entidade.
      this.enteredGroup = h.id;
      this.select([h.entity]);
    }
  }

  private onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (ctrl && k === 'z') {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if (ctrl && k === 'y') {
      e.preventDefault();
      this.redo();
      return;
    }
    if (ctrl && k === 'g') {
      e.preventDefault();
      if (e.shiftKey) this.ungroupSelection();
      else this.groupSelection();
      return;
    }
    if (ctrl && k === 'a') {
      e.preventDefault();
      const top = new Set<Id>();
      for (const id of Object.keys(this.sketch.entities)) {
        if (id === ORIGIN_ID) continue;
        top.add(this.topGroup(id)?.id ?? id);
      }
      this.select([...top]);
      return;
    }
    if (ctrl || e.altKey) return;
    if (e.key === ' ') {
      this.spaceDown = true;
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape' && this.mode !== 'sketch') {
      this.meshSel = null;
      this.probeAt = null;
      this.changed();
      return;
    }
    if (this.mode !== 'sketch') return; // atalhos de desenho não valem no modo malha
    if (e.key === 'Escape') {
      if (this.picking) {
        this.pickLine(null);
        return;
      }
      if (this.tool === 'measure' && this.ruler) {
        this.ruler = null;
        this.changed();
        return;
      }
      if (this.picks.length || this.dimRefs.length) {
        this.resetToolState();
        if (this.tool === 'dimension') this.selection = [];
      } else if (this.tool !== 'select') this.setTool('select');
      else if (this.enteredGroup) this.enteredGroup = null;
      else this.select([]);
      this.changed();
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      this.deleteSelection();
      return;
    }
    if (e.key === 'f') return this.fit();
    if (e.key === 'q') return this.toggleConstruction();
    if (TOOL_KEYS[e.key]) return this.setTool(TOOL_KEYS[e.key]);
    if (GEOM_KEYS[e.key] && this.selection.length) return this.applyGeom(GEOM_KEYS[e.key]);
  }

  // ---------- seleção e arraste ----------
  private boxSelect(a: Vec, b: Vec, add: boolean) {
    const A = this.view.toWorld(a);
    const B = this.view.toWorld(b);
    const x0 = Math.min(A.x, B.x);
    const x1 = Math.max(A.x, B.x);
    const y0 = Math.min(A.y, B.y);
    const y1 = Math.max(A.y, B.y);
    const sk = this.sketch;
    const hidden = this.hiddenSet();
    // Como nos CADs: para a direita (janela) só o que está inteiro dentro; para a esquerda
    // (cruzamento) tudo o que toca a caixa.
    const crossing = b.x < a.x;
    const inside = new Set<Id>();
    for (const e of Object.values(sk.entities)) {
      if (e.id === ORIGIN_ID || hidden.has(e.id)) continue;
      const bb = entityBBox(sk, e);
      const hit = crossing ? entityTouchesBox(sk, e, { x0, y0, x1, y1 }) : bb.x0 >= x0 && bb.x1 <= x1 && bb.y0 >= y0 && bb.y1 <= y1;
      if (hit) inside.add(this.topGroup(e.id)?.id ?? e.id);
    }
    this.select(add ? [...new Set([...this.selection, ...inside])] : [...inside]);
  }

  private beginDrag(d: DragState) {
    const h = d.hit;
    const sk = this.sketch;
    if (!h || h.kind === 'badge') {
      d.kind = 'box';
      return;
    }
    if (h.kind === 'dim') {
      const c = sk.constraints.find((k) => k.id === h.id);
      d.kind = 'label';
      d.labelStart = c?.label ?? { x: 0, y: 0 };
      this.doc.beginLive();
      return;
    }
    let pts: Id[] = [];
    if (h.kind === 'group') pts = selectionPoints(sk, this.selection.includes(h.id) ? this.selection : [h.id]);
    else {
      const e = sk.entities[h.id];
      if (e.type === 'point') {
        pts = [e.id];
        d.single = e.id;
      } else if (e.type === 'circle' || e.type === 'arc') d.radiusOf = e.id;
      else if (isCurve(e)) pts = curvePoints(e);
      // Entidade que faz parte de uma seleção múltipla: arrasta toda a seleção.
      if (this.selection.includes(h.id) && this.selection.length > 1) {
        pts = selectionPoints(sk, this.selection);
        d.radiusOf = undefined;
        d.single = undefined;
      }
    }
    pts = pts.filter((p) => !(sk.entities[p] as { fixed?: boolean }).fixed);
    if (!pts.length) d.single = undefined;
    // Offsets tocados pelo arraste: a distância deles fica livre (arrastar muda a distância).
    const offs = sk.groups.filter((g) => g.offset && (g.id === h.id || g.members.includes(h.id) || pts.some((p) => this.pointInGroup(g, p))));
    // Cópias de padrão arrastadas: o espaçamento fica livre (arrastar muda o passo).
    const pats = sk.groups.filter((g) => g.pattern && (g.id === h.id || g.members.includes(h.id) || (h.kind === 'point' && this.pointInGroup(g, h.id))));
    // Arrastar o próprio offset: a distância (com sinal) segue o mouse — cruzar o pai troca o lado.
    const own = offs.find((g) => g.id === h.id || g.members.includes(h.id) || (h.kind === 'point' && this.pointInGroup(g, h.id) && !this.parentPointsOf(g).has(h.id)));
    if (own?.offset && !(this.selection.length > 1 && this.selection.includes(h.id))) {
      const raw0 = signedDistanceTo(sk, own.offset.parents, d.startWorld);
      const d0 = own.offset.side * own.offset.distance;
      d.kind = 'offset';
      d.offset = { gid: own.id, d0, raw0, k: raw0 === 0 ? 1 : Math.sign(d0) * Math.sign(raw0) };
      this.doc.beginLive();
      return;
    }
    // Tudo já definido pelas restrições (e nenhum offset para ajustar): avisa em vez de "não fazer nada".
    const def = this.doc.defined;
    if (!offs.length && !pats.length && (pts.length || d.radiusOf) && pts.every((p) => def.has(p)) && (!d.radiusOf || def.has(d.radiusOf))) {
      const moving = h.kind === 'group' ? (this.selection.includes(h.id) ? this.selection : [h.id]) : this.selection.includes(h.id) ? this.selection : [h.id];
      this.flash(fixedPointsOf(sk, moving).length ? T().msg.gluedToFixed : T().msg.cannotDrag);
      d.kind = 'box';
      d.moved = false;
      this.drag = null;
      return;
    }
    if (!pts.length && !d.radiusOf) {
      if (h.kind === 'point' && h.id === ORIGIN_ID) this.flash(T().msg.originFixed);
      else if (h.kind === 'point' || h.kind === 'curve') this.flash(T().msg.cannotDrag);
      d.kind = 'box';
      return;
    }
    d.kind = 'entity';
    // Arrastar um offset muda a distância: a distância fica livre só durante o arraste, e só
    // os pontos do próprio offset são puxados (o pai fica onde está).
    d.freeParams = new Set([...offs, ...pats].flatMap((g) => groupParams(g).map((p) => p.name)));
    if (pats.length && !offs.length) {
      // Puxa só o ponto da cópia mais perto do mouse (a origem fica onde está).
      const own = pats.flatMap((g) => selectionPoints(sk, [g.id])).filter((p) => !(sk.entities[p] as { aux?: boolean }).aux && !(sk.entities[p] as { fixed?: boolean }).fixed);
      if (own.length) pts = [own.reduce((b, p) => (dist(pt(sk, p), d.startWorld) < dist(pt(sk, b), d.startWorld) ? p : b))];
      d.single = undefined;
      // A origem do padrão fica parada: só o espaçamento muda.
      const srcPts = new Set(pats.flatMap((g) => selectionPoints(sk, g.pattern!.src)));
      d.anchors = [...srcPts].filter((p) => !(sk.entities[p] as { fixed?: boolean }).fixed).map((p) => ({ pointId: p, ...pt(sk, p) }));
    }
    if (offs.length && h.kind !== 'point') {
      const own = new Set(offs.flatMap((g) => selectionPoints(sk, [g.id]).filter((p) => !this.parentPointsOf(g).has(p))));
      const visible = [...own].filter((p) => !(sk.entities[p] as { aux?: boolean }).aux);
      pts = visible.length ? [visible.reduce((b, p) => (dist(pt(sk, p), d.startWorld) < dist(pt(sk, b), d.startWorld) ? p : b))] : pts;
    }
    d.targets = pts.map((p) => ({ pointId: p, off: sub(pt(sk, p), d.startWorld) }));
    this.doc.beginLive();
  }

  private dragTo(d: DragState, w: Vec, s: Vec) {
    const targets: DragTarget[] = [];
    let cur = w;
    if (d.single) {
      // Ao arrastar um ponto, o cursor encaixa em outros pontos/curvas (para unir ao soltar).
      const own = new Set<Id>([d.single]);
      for (const e of Object.values(this.sketch.entities)) if (isCurve(e) && curvePoints(e).includes(d.single)) own.add(e.id);
      d.dropOn = this.pickAt(s, own);
      if (d.dropOn.pointId || d.dropOn.curveId || d.dropOn.midOf) cur = d.dropOn.pos;
    }
    if (d.radiusOf) {
      const e = this.sketch.entities[d.radiusOf];
      if (e?.type === 'circle' || e?.type === 'arc') targets.push({ radiusOf: e.id, r: dist(pt(this.sketch, e.c), w) });
    }
    for (const t of d.targets ?? []) targets.push({ pointId: t.pointId, x: cur.x + t.off.x, y: cur.y + t.off.y });
    for (const a of d.anchors ?? []) targets.push({ pointId: a.pointId, x: a.x, y: a.y });
    this.doc.live(targets, this.sketch, d.freeParams);
  }

  /** Distância do offset = inicial + variação da distância (com sinal) do mouse ao pai. */
  private dragOffset(d: DragState, w: Vec) {
    const o = d.offset!;
    const base = this.doc.base;
    const g = base.groups.find((x) => x.id === o.gid);
    if (!g?.offset) return;
    let dist2 = o.d0 + o.k * (signedDistanceTo(base, g.offset.parents, w) - o.raw0);
    const tiny = this.view.px(0.5);
    if (Math.abs(dist2) < tiny) dist2 = Math.sign(dist2 || o.d0) * tiny; // nunca exatamente sobre o pai
    try {
      this.doc.live([], setOffsetDistance(base, o.gid, dist2));
    } catch {
      // raio colapsaria etc.: mantém o último estado válido
    }
  }

  private finishDrag(d: DragState) {
    const sk = this.sketch;
    let code: string[];
    if (d.freeParams?.size) {
      // Arrastar um offset muda a distância: o histórico registra a distância nova.
      code = sk.groups
        .filter((g) => groupParams(g).some((p) => d.freeParams!.has(p.name)))
        .map((g) =>
          g.offset
            ? `g.set_offset(${q(g.id)}, "${round(g.offset.side * g.offset.distance)} mm")`
            : g.pattern?.kind === 'linear'
              ? `g.set_pattern(${q(g.id)}, dx="${round(g.pattern.dx)} mm", dy="${round(g.pattern.dy)} mm")`
              : `g.set_pattern(${q(g.id)}, angle="${round(g.pattern?.kind === 'circular' ? g.pattern.angle : 0)} deg")`,
        );
    } else if (d.single) code = [`g.move(${q(d.single)}, ${xy(pt(sk, d.single))})`];
    else if (d.radiusOf) code = [`g.set_radius(${q(d.radiusOf)}, ${round((sk.entities[d.radiusOf] as { r: number }).r)})`];

    else {
      const first = d.targets![0];
      const moved = sub(pt(sk, first.pointId), add2(d.startWorld, first.off));
      const what = d.hit?.id ?? '';
      const target = this.selection.length > 1 && this.selection.includes(what) ? `[${this.selection.map(q).join(', ')}]` : q(what);
      code = [`g.translate(${target}, dx=${round(moved.x)}, dy=${round(moved.y)})`];
    }
    const drop = d.single ? d.dropOn : null;
    this.doc.endLive(code);
    this.clearMessage();
    if (!drop || !d.single) return;
    // Soltou sobre outro ponto: une (coincidente). Sobre uma curva: ponto sobre a curva.
    if (drop.pointId) {
      const merged = mergePoints(this.sketch, d.single, drop.pointId);
      if (merged && this.commit(merged, [`g.coincident(${q(d.single)}, ${q(drop.pointId)})`])) this.selection = [];
    } else if (drop.curveId || drop.midOf) {
      const dr = new Draft(this.sketch);
      const id = drop.midOf ? dr.addConstraint('midpoint', [d.single, drop.midOf]) : dr.addConstraint('pointOn', [d.single, drop.curveId!]);
      this.commit(dr.sk, [constraintCode(dr.sk.constraints.find((k) => k.id === id)!)]);
    }
    this.changed();
  }

  private dragLabel(d: DragState, w: Vec) {
    const id = d.hit!.id;
    const sk = this.sketch;
    const delta = sub(w, d.startWorld);
    const label = { x: d.labelStart!.x + delta.x, y: d.labelStart!.y + delta.y };
    const constraints = sk.constraints.map((c) => (c.id === id ? { ...c, label } : c));
    this.doc.patch({ ...sk, constraints });
  }

  // ---------- ferramentas de desenho ----------
  private drawClick(s: Vec) {
    const p = this.applyInference(this.pickAt(s));
    this.cursorPick = p;
    if (this.tool === 'measure') {
      // Régua: 1º clique = início, 2º = fim; o próximo recomeça.
      this.ruler = !this.ruler || this.ruler.b ? { a: p.pos, b: null } : { a: this.ruler.a, b: p.pos };
      this.changed();
      return;
    }
    const need: Record<string, number> = { point: 1, line: 2, cline: 2, rect: 2, rectc: 2, circle: 2, arc3: 3, arcc: 3 };
    if (this.picks.length > 0 && dist(this.picks[this.picks.length - 1].pos, p.pos) < this.view.px(2)) return;
    if (this.picks.length + 1 < need[this.tool]) {
      this.picks.push(p);
      this.arcSweep = 0;
      this.lastArcAngle = null;
      this.changed();
      return;
    }
    switch (this.tool) {
      case 'point':
        return this.commitPoint(p);
      case 'line':
      case 'cline':
        return this.commitLine(this.picks[0], p);
      case 'rect':
        return this.commitRect(this.picks[0], p);
      case 'rectc':
        return this.commitRectCenter(this.picks[0], p);
      case 'circle':
        return this.commitCircle(this.picks[0], p);
      case 'arcc':
        return this.commitArcCenter(p);
      case 'arc3':
        return this.commitArc3(p);
    }
  }

  /** Id do ponto para um clique: reaproveita o ponto encaixado ou cria um novo (com "ponto sobre"). */
  private pointFor(d: Draft, p: Pick, optional: OptC[], free = false): Id {
    if (p.pointId) return p.pointId;
    const id = d.addPoint(p.pos.x, p.pos.y, free);
    if (p.curveId) optional.push({ type: 'pointOn', refs: [id, p.curveId] });
    if (p.midOf) optional.push({ type: 'midpoint', refs: [id, p.midOf] });
    return id;
  }

  private finish(d: Draft, optional: OptC[], code?: string[]) {
    const r = this.doc.commitWithOptional(d.sk, optional, code ?? creationCode(this.sketch, d.sk));
    if (!r.ok) this.flash(r.message!);
    return r.ok;
  }

  private commitPoint(p: Pick) {
    if (p.pointId) return;
    const d = new Draft(this.sketch);
    const opt: OptC[] = [];
    this.pointFor(d, p, opt, true);
    this.finish(d, opt);
  }

  private commitLine(a: Pick, b: Pick) {
    if (a.pointId && a.pointId === b.pointId) return;
    const d = new Draft(this.sketch);
    const opt: OptC[] = [];
    const p1 = this.pointFor(d, a, opt);
    const p2 = this.pointFor(d, b, opt);
    const l = d.addLine(p1, p2, this.tool === 'cline');
    if (this.inferHV === 'H') opt.push({ type: 'horizontal', refs: [l] });
    if (this.inferHV === 'V') opt.push({ type: 'vertical', refs: [l] });
    if (!this.finish(d, opt)) return;
    // Continua a polilinha a partir do fim; termina ao fechar num ponto existente.
    if (b.pointId) this.resetToolState();
    else this.picks = [{ pos: pt(this.sketch, p2), pointId: p2 }];
    this.inferHV = null;
    this.changed();
  }

  /** Quatro lados de um retângulo a partir de dois vértices opostos já criados. */
  private rectLines(d: Draft, c1: Id, c3: Id, a: Vec, b: Vec, opt: OptC[]) {
    const p2 = d.addPoint(b.x, a.y);
    const p4 = d.addPoint(a.x, b.y);
    const l1 = d.addLine(c1, p2);
    const l2 = d.addLine(p2, c3);
    const l3 = d.addLine(c3, p4);
    const l4 = d.addLine(p4, c1);
    opt.unshift(
      { type: 'horizontal', refs: [l1], quiet: true },
      { type: 'vertical', refs: [l2], quiet: true },
      { type: 'horizontal', refs: [l3], quiet: true },
      { type: 'vertical', refs: [l4], quiet: true },
    );
    return [l1, l2, l3, l4];
  }

  /** O retângulo nasce agrupado (clique pega o retângulo; duplo clique edita um lado). */
  private rectGroup(d: Draft, members: Id[]): Id {
    const n = d.sk.groups.filter((g) => g.name.startsWith(T().tree.rectangle)).length + 1;
    return d.addGroup(`${T().tree.rectangle} ${n}`, members);
  }

  private newPoints(d: Draft) {
    return Object.keys(d.sk.entities).filter((id) => !this.sketch.entities[id] && d.sk.entities[id].type === 'point');
  }

  private commitRect(a: Pick, b: Pick) {
    if (Math.abs(a.pos.x - b.pos.x) < this.view.px(2) || Math.abs(a.pos.y - b.pos.y) < this.view.px(2)) return;
    const d = new Draft(this.sketch);
    const opt: OptC[] = [];
    const c1 = this.pointFor(d, a, opt);
    const c3 = this.pointFor(d, b, opt);
    const ls = this.rectLines(d, c1, c3, a.pos, b.pos, opt);
    const arg = (p: Pick, id: Id) => (p.pointId ? q(id) : xy(p.pos));
    const created = this.newPoints(d);
    const g = this.rectGroup(d, ls);
    this.finish(d, opt, [`${g} = g.rectangle(${arg(a, c1)}, ${arg(b, c3)})  # grupo com ${ls.join(', ')}; cria ${created.join(', ')}`]);
    this.resetToolState();
    this.changed();
  }

  private commitRectCenter(cp: Pick, corner: Pick) {
    const c = cp.pos;
    const b = corner.pos;
    if (Math.abs(c.x - b.x) < this.view.px(2) || Math.abs(c.y - b.y) < this.view.px(2)) return;
    const a = { x: 2 * c.x - b.x, y: 2 * c.y - b.y };
    const d = new Draft(this.sketch);
    const opt: OptC[] = [];
    const center = this.pointFor(d, cp, opt, true);
    const c1 = d.addPoint(a.x, a.y);
    const c3 = this.pointFor(d, corner, opt);
    const ls = this.rectLines(d, c1, c3, a, b, opt);
    opt.splice(4, 0, { type: 'symmetricPoint', refs: [c1, c3, center], quiet: true });
    const cArg = cp.pointId ? q(center) : xy(c);
    const bArg = corner.pointId ? q(c3) : xy(b);
    const created = this.newPoints(d);
    const g = this.rectGroup(d, cp.pointId ? ls : [...ls, center]);
    this.finish(d, opt, [`${g} = g.rectangle_center(${cArg}, ${bArg})  # grupo com ${ls.join(', ')}; cria ${created.join(', ')}`]);
    this.resetToolState();
    this.changed();
  }

  private commitCircle(c: Pick, e: Pick) {
    const r = dist(c.pos, e.pos);
    const d = new Draft(this.sketch);
    const opt: OptC[] = [];
    const cid = this.pointFor(d, c, opt);
    const circ = d.addCircle(cid, r);
    if (e.pointId) opt.push({ type: 'pointOn', refs: [e.pointId, circ] });
    this.finish(d, opt);
    this.resetToolState();
    this.changed();
  }

  private trackArcSweep() {
    if (this.tool !== 'arcc' || this.picks.length !== 2 || !this.cursorPick) return;
    const c = this.picks[0].pos;
    const a = Math.atan2(this.cursorPick.pos.y - c.y, this.cursorPick.pos.x - c.x);
    if (this.lastArcAngle === null) {
      const s = this.picks[1].pos;
      this.lastArcAngle = Math.atan2(s.y - c.y, s.x - c.x);
    }
    let da = a - this.lastArcAngle;
    if (da > Math.PI) da -= 2 * Math.PI;
    if (da < -Math.PI) da += 2 * Math.PI;
    this.arcSweep += da;
    this.lastArcAngle = a;
  }

  private commitArcCenter(endPick: Pick) {
    const [cp, sp] = this.picks;
    const r = dist(cp.pos, sp.pos);
    const ang = Math.atan2(endPick.pos.y - cp.pos.y, endPick.pos.x - cp.pos.x);
    const endPos = endPick.pointId ? endPick.pos : { x: cp.pos.x + r * Math.cos(ang), y: cp.pos.y + r * Math.sin(ang) };
    if (dist(endPos, sp.pos) < this.view.px(2)) return;
    const d = new Draft(this.sketch);
    const opt: OptC[] = [];
    const c = this.pointFor(d, cp, opt);
    const s = this.pointFor(d, sp, opt);
    const e = this.pointFor(d, { ...endPick, pos: endPos }, opt);
    if (this.arcSweep >= 0) d.addArc(c, s, e, r);
    else d.addArc(c, e, s, r);
    this.finish(d, opt);
    this.resetToolState();
    this.changed();
  }

  private commitArc3(mPick: Pick) {
    const [sp, ep] = this.picks;
    const circ = circleFrom3(sp.pos, ep.pos, mPick.pos);
    if (!circ) return;
    const d = new Draft(this.sketch);
    const opt: OptC[] = [];
    const s = this.pointFor(d, sp, opt);
    const e = this.pointFor(d, ep, opt);
    const c = d.addPoint(circ.c.x, circ.c.y);
    // O arco anti-horário de s até e passa pelo ponto do meio se este fica à direita de s→e.
    const ccw = cross(sub(ep.pos, sp.pos), sub(mPick.pos, sp.pos)) < 0;
    if (ccw) d.addArc(c, s, e, circ.r);
    else d.addArc(c, e, s, circ.r);
    this.finish(d, opt);
    this.resetToolState();
    this.changed();
  }

  private buildPreview(): Preview | null {
    const cur = this.cursorPick?.pos;
    if (!cur || !this.picks.length) return null;
    const pv: Preview = { lines: [], circles: [], arcs: [], points: this.picks.map((p) => p.pos) };
    const a = this.picks[0].pos;
    const rect = (p: Vec, r: Vec) =>
      pv.lines.push([p, { x: r.x, y: p.y }], [{ x: r.x, y: p.y }, r], [r, { x: p.x, y: r.y }], [{ x: p.x, y: r.y }, p]);
    pv.dashed = this.tool === 'cline';
    switch (this.tool) {
      case 'line':
      case 'cline':
        pv.lines.push([a, cur]);
        break;
      case 'rect':
        rect(a, cur);
        break;
      case 'rectc':
        rect({ x: 2 * a.x - cur.x, y: 2 * a.y - cur.y }, cur);
        break;
      case 'circle':
        pv.circles.push({ c: a, r: dist(a, cur) });
        break;
      case 'arcc': {
        if (this.picks.length === 1) {
          pv.lines.push([a, cur]);
          break;
        }
        const s = this.picks[1].pos;
        const r = dist(a, s);
        const a0 = Math.atan2(s.y - a.y, s.x - a.x);
        const a1 = Math.atan2(cur.y - a.y, cur.x - a.x);
        if (this.arcSweep >= 0) pv.arcs.push({ c: a, r, a0, a1: a0 + normAngle(a1 - a0) });
        else pv.arcs.push({ c: a, r, a0: a1, a1: a1 + normAngle(a0 - a1) });
        break;
      }
      case 'arc3': {
        if (this.picks.length === 1) {
          pv.lines.push([a, cur]);
          break;
        }
        const e = this.picks[1].pos;
        const circ = circleFrom3(a, e, cur);
        if (!circ) {
          pv.lines.push([a, e]);
          break;
        }
        const as = Math.atan2(a.y - circ.c.y, a.x - circ.c.x);
        const ae = Math.atan2(e.y - circ.c.y, e.x - circ.c.x);
        const ccw = cross(sub(e, a), sub(cur, a)) < 0;
        const [s0, s1] = ccw ? [as, ae] : [ae, as];
        pv.arcs.push({ c: circ.c, r: circ.r, a0: s0, a1: s0 + normAngle(s1 - s0) });
        break;
      }
    }
    return pv;
  }

  // ---------- cotas ----------

  /**
   * Normaliza as entidades escolhidas para uma cota: círculo/arco em par vira o centro;
   * ponto que é extremidade da linha escolhida não forma cota. null = combinação inválida.
   */
  private dimensionRefs(ids: Id[]): Id[] | null {
    const sk = this.sketch;
    if (ids.length === 1) {
      const t = sk.entities[ids[0]]?.type;
      return t === 'line' || t === 'circle' || t === 'arc' ? ids : null;
    }
    if (ids.length !== 2 || ids[0] === ids[1]) return null;
    const refs = ids.map((id) => {
      const e = sk.entities[id];
      return e?.type === 'circle' || e?.type === 'arc' ? e.c : id;
    });
    const [a, b] = refs.map((id) => sk.entities[id]);
    if (!a || !b || refs[0] === refs[1]) return null;
    if (a.type === 'point' && b.type === 'point') return refs;
    if ((a.type === 'point' && b.type === 'line') || (a.type === 'line' && b.type === 'point')) {
      const [p, l] = a.type === 'point' ? [a, b] : [b, a];
      if (l.type === 'line' && (l.p1 === p.id || l.p2 === p.id)) return null;
      return refs;
    }
    if (a.type === 'line' && b.type === 'line') return refs;
    return null;
  }

  private dimensionClick(s: Vec) {
    const sk = this.sketch;
    const h = this.hitTest(s, { entitiesOnly: true });
    const id = h && (h.kind === 'point' || h.kind === 'curve') ? h.id : null;
    const w = this.view.toWorld(s);

    if (!this.dimRefs.length) {
      if (!id) {
        // Clique numa cota existente com a ferramenta de cota: edita.
        const hd = this.hitTest(s);
        if (hd?.kind === 'dim') setTimeout(() => this.startEditing(hd.id), 0);
        return;
      }
      this.dimRefs = this.dimensionRefs([id]) ?? [id]; // ponto sozinho: espera a segunda entidade
      this.selection = [id];
      this.changed();
      return;
    }
    // Segundo clique numa entidade: tenta completar o par.
    if (id && this.selection.length === 1 && id !== this.selection[0]) {
      const refs = this.dimensionRefs([this.selection[0], id]);
      if (refs) {
        this.dimRefs = refs;
        this.selection = [this.selection[0], id];
      } else this.flash(T().msg.pickOther);
      this.changed();
      return;
    }
    // Clique de posicionamento.
    const c = this.pendingDimension(w);
    if (!c) {
      if (this.dimRefs.length === 1 && sk.entities[this.dimRefs[0]]?.type === 'point') this.flash(T().msg.pickOtherFromPoint);
      else {
        this.resetToolState();
        this.selection = [];
      }
      this.changed();
      return;
    }
    const d = new Draft(sk);
    const newId = d.addConstraint(c.type, c.refs, { value: c.value, label: c.label, ...(c.flip ? { flip: c.flip } : {}) });
    const off = this.offsetBetween(c.refs);
    if (off) {
      // Cota entre o offset e o pai: a distância já é do offset — só abre a cota do offset para editar.
      const dimId = sk.constraints.find((k) => k.offsetDim === off.id)?.id;
      this.resetToolState();
      this.selection = [];
      this.flash(T().offset.useOffsetDim);
      if (dimId) setTimeout(() => this.startEditing(dimId), 0);
      return this.changed();
    }
    const ok = this.doc.commit(d.sk, [constraintCode(d.sk.constraints.find((k) => k.id === newId)!)]).ok;
    if (!ok) {
      const inOff = c.refs.some((r) => this.sketch.groups.some((g) => g.offset && (g.members.includes(r) || this.pointInGroup(g, r))));
      this.flash(inOff ? T().offset.dimConflict : T().msg.redundant);
    }
    this.resetToolState();
    this.selection = [];
    this.changed();
    // Abre a caixa depois do clique terminar; senão o foco padrão do mousedown vai para o canvas.
    if (ok) setTimeout(() => this.startEditing(newId), 0);
  }

  private dimMode(A: Vec, B: Vec, w: Vec): 'aligned' | 'h' | 'v' {
    const dx = Math.abs(B.x - A.x);
    const dy = Math.abs(B.y - A.y);
    if (dx < 1e-9 || dy < 1e-9) return 'aligned';
    const inX = w.x > Math.min(A.x, B.x) && w.x < Math.max(A.x, B.x);
    const inY = w.y > Math.min(A.y, B.y) && w.y < Math.max(A.y, B.y);
    if (inX && !inY) return 'h';
    if (inY && !inX) return 'v';
    return 'aligned';
  }

  /** Cota que seria criada com o texto em `w` (null se a seleção não forma cota). */
  private pendingDimension(w: Vec): Constraint | null {
    const sk = this.sketch;
    const refs = this.dimRefs;
    if (!refs.length) return null;
    const e0 = sk.entities[refs[0]];
    if (!e0) return null;
    let type: ConstraintType;
    let cref = [...refs];
    if (refs.length === 1) {
      if (e0.type === 'circle') type = 'diameter';
      else if (e0.type === 'arc') type = 'radius';
      else if (e0.type === 'line') type = 'distance';
      else return null;
    } else {
      const e1 = sk.entities[refs[1]];
      if (e0.type === 'line' && e1?.type === 'line') {
        const d0 = norm(lineDir(sk, refs[0]));
        const d1 = norm(lineDir(sk, refs[1]));
        if (Math.abs(cross(d0, d1)) < PARALLEL_TOL && Math.abs(dot(d0, d1)) > 0.5) {
          // Linhas paralelas: distância de uma ponta da segunda até a primeira.
          type = 'distance';
          cref = [e1.p1, refs[0]];
        } else type = 'angle';
      } else type = 'distance';
    }
    const c: Constraint = { id: '__preview', type, refs: cref };
    if (type === 'distance') {
      const pp = dimPointIds(sk, c);
      if (pp) {
        const mode = this.dimMode(pt(sk, pp[0]), pt(sk, pp[1]), w);
        if (mode === 'h') c.type = 'hdistance';
        if (mode === 'v') c.type = 'vdistance';
      }
    }
    const anchor = dimAnchor(sk, c);
    if (!anchor) return null;
    c.label = sub(w, anchor);
    // Ângulo: mede o setor onde o texto está (como no Onshape).
    if (c.type === 'angle') c.flip = angleSectorAt(sk, c.refs[0], c.refs[1], c.label);
    c.value = measure(sk, c);
    if (!isFinite(c.value) || c.value <= 1e-9) return null;
    return c;
  }

  private buildPreviewDim(): RenderState['previewDim'] {
    if (this.tool !== 'dimension' || !this.dimRefs.length) return null;
    const c = this.pendingDimension(this.cursor);
    return c ? { sketch: this.sketch, c } : null;
  }
}

const add2 = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
const round = (v: number) => {
  const r = Number(v.toFixed(4));
  return Object.is(r, -0) ? 0 : r;
};

export function describeEntity(sk: Sketch, id: Id): string {
  const t = T().entity;
  const g = sk.groups.find((x) => x.id === id);
  if (g) return t.group(g.name);
  const e = sk.entities[id];
  if (!e) return id;
  if (id === ORIGIN_ID) return t.origin;
  return e.name ? `${e.name} (${id})` : `${t[e.type]} ${id}`;
}

/** Nome curto para a árvore: nome dado pelo usuário ou "Linha l4". */
export function entityLabel(sk: Sketch, id: Id): string {
  const e = sk.entities[id];
  if (!e) return id;
  if (id === ORIGIN_ID) return T().entity.origin;
  return e.name ?? `${T().entity[e.type]} ${id}`;
}

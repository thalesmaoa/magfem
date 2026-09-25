// Editor do circuito externo (esquemático) numa aba: blocos arrastáveis, fios entre terminais, sinais no tempo.
import { useEffect, useRef, useState } from 'react';
import { q } from '../cad/code';
import type { SketchEditor } from '../cad/editor';
import { partSignal, pinsOf, sourceExpr } from '../cad/schematic';
import { updateNode } from '../cad/tree';
import type { Id, PartKind, SchematicNode, SchPart, SchWire } from '../cad/types';
import { T, useT } from '../i18n';
import { LazyInput } from './common';
import { useDocVersion, useEditor } from './useStore';

const GRID = 20;
const snap = (v: number) => Math.round(v / GRID) * GRID;

/** Seleção e fio em andamento (compartilhados com a barra superior da aba). */
let selState: { sel: { type: 'part' | 'wire'; id: Id } | null } = { sel: null };
const selListeners = new Set<() => void>();
const setSel = (sel: typeof selState.sel) => {
  selState = { sel };
  selListeners.forEach((f) => f());
};
function useSel() {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    selListeners.add(f);
    return () => {
      selListeners.delete(f);
    };
  }, []);
  return selState.sel;
}

const commit = (ed: SketchEditor, sch: SchematicNode, patch: Partial<SchematicNode>, code: string) => ed.commit(updateNode(ed.sketch, sch.id, patch), [code]);

/** Primeira posição da grade sem componente a menos de 110 px (evita sobrepor blocos). */
function freeSpot(parts: SchPart[]): { x: number; y: number } {
  for (let row = 0; row < 5; row++)
    for (let col = 0; col < 7; col++) {
      const x = 120 + col * 120, y = 120 + row * 120;
      if (parts.every((p) => Math.hypot(p.x - x, p.y - y) >= 110)) return { x, y };
    }
  return { x: 120, y: 560 };
}

/** Gira ou apaga o componente/fio selecionado (atalhos R e Del; botões da barra superior). */
export function rotateSelected(ed: SketchEditor) {
  const cur = selState.sel;
  const sch = ed.sketch.nodes.find((n): n is SchematicNode => n.kind === 'schematic' && !!cur && n.parts.some((p) => p.id === cur.id));
  if (!sch || !cur || cur.type !== 'part') return;
  commit(ed, sch, { parts: sch.parts.map((p) => (p.id === cur.id ? { ...p, rot: ((p.rot + 90) % 360) as SchPart['rot'] } : p)) }, `c.rotate(${q(cur.id)})`);
}
export function deleteSelected(ed: SketchEditor) {
  const cur = selState.sel;
  if (!cur) return;
  const sch = ed.sketch.nodes.find((n): n is SchematicNode => n.kind === 'schematic' && (n.parts.some((p) => p.id === cur.id) || n.wires.some((w) => w.id === cur.id)));
  if (!sch) return;
  if (cur.type === 'part') commit(ed, sch, { parts: sch.parts.filter((p) => p.id !== cur.id), wires: sch.wires.filter((w) => w.a.part !== cur.id && w.b.part !== cur.id) }, `c.remove(${q(cur.id)})`);
  else commit(ed, sch, { wires: sch.wires.filter((w) => w.id !== cur.id) }, `c.remove(${q(cur.id)})`);
  setSel(null);
}

/** Inclui um componente no centro livre do esquemático (usado pela paleta da barra superior). */
export function addPart(ed: SketchEditor, schId: Id, kind: PartKind, circuit?: Id) {
  const sch = ed.sketch.nodes.find((n): n is SchematicNode => n.id === schId && n.kind === 'schematic');
  if (!sch) return;
  const t = T();
  const count = sch.parts.filter((p) => p.kind === kind).length + 1;
  const prefix: Record<PartKind, string> = { V: 'V', I: 'I', R: 'R', L: 'L', C: 'C', coil: 'B', gnd: 'GND' };
  const c = circuit ? ed.sketch.circuits.find((x) => x.id === circuit) : undefined;
  const id = `sp${ed.sketch.nextId}`;
  const part: SchPart = {
    id,
    kind,
    name: c ? c.name : `${prefix[kind]}${count}`,
    ...freeSpot(sch.parts),
    rot: kind === 'gnd' ? 0 : 90,
    ...(kind === 'R' ? { value: '10' } : kind === 'L' ? { value: '0.01' } : kind === 'C' ? { value: '1e-6' } : {}),
    ...(kind === 'V' || kind === 'I' ? { value: kind === 'V' ? '10*sin(2*pi*50*t)' : '1*sin(2*pi*50*t)' } : {}),
    ...(circuit ? { circuit } : {}),
  };
  void t;
  if (ed.commit({ ...updateNode(ed.sketch, sch.id, { parts: [...sch.parts, part] }), nextId: ed.sketch.nextId + 1 }, [`c.part(${q(sch.id)}, ${q(kind)}${circuit ? `, circuit=${q(circuit)}` : ''})`])) setSel({ type: 'part', id });
}

function Symbol({ p }: { p: SchPart }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 2 };
  const leads = <path d="M-40 0H-20M20 0H40" {...common} />;
  switch (p.kind) {
    case 'R':
      return (
        <g>
          {leads}
          <path d="M-20 0l4-8 8 16 8-16 8 16 8-16 4 8" {...common} />
        </g>
      );
    case 'L':
      return (
        <g>
          {leads}
          <path d="M-20 0a5 5 0 0 1 10 0a5 5 0 0 1 10 0a5 5 0 0 1 10 0a5 5 0 0 1 10 0" {...common} />
        </g>
      );
    case 'C':
      return (
        <g>
          <path d="M-40 0H-5M5 0H40M-5 -14V14M5 -14V14" {...common} />
        </g>
      );
    case 'V':
      return (
        <g>
          {leads}
          <circle r="20" {...common} />
          <path d="M-10 0q5 -10 10 0t10 0" {...common} />
          <text x="-30" y="-8" fontSize="12" fill="currentColor">+</text>
        </g>
      );
    case 'I':
      return (
        <g>
          {leads}
          <circle r="20" {...common} />
          <path d="M-10 0H10M4 -6L10 0L4 6" {...common} />
        </g>
      );
    case 'coil':
      return (
        <g>
          {leads}
          <rect x="-22" y="-16" width="44" height="32" rx="4" {...common} />
          <path d="M-14 4a4 4 0 0 1 8 0a4 4 0 0 1 8 0a4 4 0 0 1 8 0" {...common} />
          <text x="-30" y="-8" fontSize="12" fill="currentColor">●</text>
        </g>
      );
    case 'gnd':
      return <path d="M0 -20V0M-14 0H14M-9 5H9M-4 10H4" {...common} />;
  }
}

/** Estado de vista/ferramenta do esquemático (compartilhado com a barra superior): zoom/pan, modo fio, passo mostrado, sinais. */
let schUi: { zoom: number; px: number; py: number; wireMode: boolean; frame: number; plot: string[] } = { zoom: 1, px: 0, py: 0, wireMode: false, frame: 0, plot: [] };
const uiListeners = new Set<() => void>();
export function setSchUi(patch: Partial<typeof schUi>) {
  schUi = { ...schUi, ...patch };
  uiListeners.forEach((f) => f());
}
export function useSchUi() {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    uiListeners.add(f);
    return () => {
      uiListeners.delete(f);
    };
  }, []);
  return schUi;
}

export function flipSelected(ed: SketchEditor) {
  const cur = selState.sel;
  const sch = ed.sketch.nodes.find((n): n is SchematicNode => n.kind === 'schematic' && !!cur && n.parts.some((p) => p.id === cur.id));
  if (!sch || !cur || cur.type !== 'part') return;
  commit(ed, sch, { parts: sch.parts.map((p) => (p.id === cur.id ? { ...p, flip: !p.flip } : p)) }, `c.flip(${q(cur.id)})`);
}

/** Solução acoplada a este esquemático (se houver). */
export function schResult(ed: SketchEditor, schId: Id) {
  const sol = [...ed.solutions.values()].find((x) => x.circuit?.schematic === schId);
  return sol?.circuit && sol.times ? { res: sol.circuit, times: sol.times } : null;
}

/** Texto do valor mostrado sob o componente. */
function valueLabel(p: SchPart): string {
  if (p.kind === 'R') return `${p.value ?? '?'} Ω`;
  if (p.kind === 'L') return `${p.value ?? '?'} H`;
  if (p.kind === 'C') return `${p.value ?? '?'} F`;
  if (p.kind === 'V') return `v = ${sourceExpr(p)}`;
  if (p.kind === 'I') return `i = ${sourceExpr(p)}`;
  return '';
}

const eng = (v: number, u: string) => {
  const a = Math.abs(v);
  if (a === 0) return `0 ${u}`;
  const e = Math.max(-9, Math.min(6, Math.floor(Math.log10(a) / 3) * 3));
  const pre: Record<number, string> = { [-9]: 'n', [-6]: 'µ', [-3]: 'm', 0: '', 3: 'k', 6: 'M' };
  return `${(v / 10 ** e).toPrecision(3)} ${pre[e]}${u}`;
};

export function SchematicPane({ ed, id }: { ed: SketchEditor; id: Id }) {
  const t = useT();
  useDocVersion(ed.doc);
  useEditor(ed);
  const sel = useSel();
  const ui = useSchUi();
  const sch = ed.sketch.nodes.find((n): n is SchematicNode => n.id === id && n.kind === 'schematic');
  const svgRef = useRef<SVGSVGElement>(null);
  const [live, setLive] = useState<SchPart[] | null>(null);
  const [wireFrom, setWireFrom] = useState<{ part: Id; pin: number } | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ id: Id; dx: number; dy: number; moved: boolean } | null>(null);
  // Fio arrastado: move o trecho vertical (mid) enquanto arrasta.
  const wireDrag = useRef<{ id: Id; moved: boolean; x0: number; y0: number; axis: 'x' | 'y' | null } | null>(null);
  const [liveMid, setLiveMid] = useState<{ id: Id; x?: number; y?: number } | null>(null);
  const pan = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (!sch || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;
      if (e.key === 'Escape') {
        setWireFrom(null);
        setSel(null);
        setSchUi({ wireMode: false });
      }
      if (e.key === 'w' || e.key === 'W') setSchUi({ wireMode: !schUi.wireMode });
      if (!selState.sel) return;
      if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected(ed);
      else if (e.key === 'r' || e.key === 'R') rotateSelected(ed);
      else if (e.key === 'm' || e.key === 'M') flipSelected(ed);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ed, sch]);
  if (!sch) return null;
  const parts = live ?? sch.parts;
  const byId = new Map(parts.map((p) => [p.id, p]));
  const W = 1000 / ui.zoom, H = 640 / ui.zoom;
  const toSvg = (e: { clientX: number; clientY: number }) => {
    const m = svgRef.current?.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };
  const connect = (a: { part: Id; pin: number }, b: { part: Id; pin: number }) => {
    if (a.part === b.part && a.pin === b.pin) return;
    const w: SchWire = { id: `sw${ed.sketch.nextId}`, a, b };
    ed.commit({ ...updateNode(ed.sketch, sch.id, { wires: [...sch.wires, w] }), nextId: ed.sketch.nextId + 1 }, [`c.wire(${q(sch.id)}, (${q(a.part)}, ${a.pin}), (${q(b.part)}, ${b.pin}))`]);
  };
  const pinAt = (x: number, y: number) => {
    for (const p of parts) {
      const pins = pinsOf(p);
      for (let i = 0; i < pins.length; i++) if (Math.hypot(pins[i].x - x, pins[i].y - y) < 10 / ui.zoom + 4) return { part: p.id, pin: i };
    }
    return null;
  };
  // Traçado: com midY, sobe/desce do terminal, corre na altura midY e volta; senão horizontal–vertical (em mid)–horizontal.
  const wirePath = (a: { x: number; y: number }, b: { x: number; y: number }, r: { mid?: number; midY?: number }) =>
    r.midY !== undefined ? `M${a.x} ${a.y}V${r.midY}H${b.x}V${b.y}` : `M${a.x} ${a.y}H${r.mid ?? (a.x + b.x) / 2}V${b.y}H${b.x}`;
  const routeOf = (w: SchWire) =>
    liveMid?.id === w.id ? (liveMid.y !== undefined ? { midY: liveMid.y } : { mid: liveMid.x }) : { mid: w.mid, midY: w.midY };
  // Resultado no passo mostrado (i e v escritos no esquemático).
  const result = schResult(ed, sch.id);
  const k = result ? Math.min(ui.frame, result.times.length - 1) : 0;
  return (
    <div className="sch-pane">
      <svg
        ref={svgRef}
        className={`sch-canvas${ui.wireMode ? ' wiring' : ''}`}
        viewBox={`${ui.px} ${ui.py} ${W} ${H}`}
        onWheel={(e) => {
          // Zoom no cursor.
          const c = toSvg(e);
          const z = Math.min(4, Math.max(0.25, ui.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
          const f = ui.zoom / z;
          setSchUi({ zoom: z, px: c.x - (c.x - ui.px) * f, py: c.y - (c.y - ui.py) * f });
        }}
        onPointerMove={(e) => {
          const p = toSvg(e);
          setCursor(p);
          if (pan.current) {
            const r = svgRef.current!.getBoundingClientRect();
            setSchUi({ px: pan.current.px - ((e.clientX - pan.current.x) * W) / r.width, py: pan.current.py - ((e.clientY - pan.current.y) * H) / r.height });
            return;
          }
          const wd = wireDrag.current;
          if (wd) {
            // A direção do arraste decide: para cima/baixo move o trecho horizontal; para os lados, o vertical.
            if (!wd.axis && Math.hypot(p.x - wd.x0, p.y - wd.y0) > 4) wd.axis = Math.abs(p.y - wd.y0) > Math.abs(p.x - wd.x0) ? 'y' : 'x';
            if (!wd.axis) return;
            wd.moved = true;
            setLiveMid(wd.axis === 'y' ? { id: wd.id, y: snap(p.y) } : { id: wd.id, x: snap(p.x) });
            return;
          }
          const d = drag.current;
          if (!d) return;
          d.moved = true;
          setLive(sch.parts.map((x) => (x.id === d.id ? { ...x, x: snap(p.x - d.dx), y: snap(p.y - d.dy) } : x)));
        }}
        onPointerUp={(e) => {
          pan.current = null;
          const wd = wireDrag.current;
          wireDrag.current = null;
          if (wd?.moved && liveMid) {
            const lm = liveMid;
            const wires = sch.wires.map((w) => {
              if (w.id !== wd.id) return w;
              const { mid: _m, midY: _y, ...rest } = w;
              return lm.y !== undefined ? { ...rest, midY: lm.y } : { ...rest, mid: lm.x };
            });
            commit(ed, sch, { wires }, lm.y !== undefined ? `c.route(${q(wd.id)}, y=${lm.y})` : `c.route(${q(wd.id)}, ${lm.x})`);
          }
          setLiveMid(null);
          // Fio arrastado: soltar sobre outro terminal liga.
          if (wireFrom && !ui.wireMode) {
            const p = toSvg(e);
            const hit = pinAt(p.x, p.y);
            if (hit && (hit.part !== wireFrom.part || hit.pin !== wireFrom.pin)) {
              connect(wireFrom, hit);
              setWireFrom(null);
            }
          }
          const d = drag.current;
          drag.current = null;
          if (d?.moved && live) {
            const p = live.find((x) => x.id === d.id)!;
            commit(ed, sch, { parts: live }, `c.move(${q(d.id)}, (${p.x}, ${p.y}))`);
          }
          setLive(null);
        }}
        onPointerDown={(e) => {
          if ((e.target as Element).closest('.sch-part, .sch-wire')) return;
          // Fundo: arrasta a vista (botão do meio/direito ou esquerdo no vazio).
          setSel(null);
          setWireFrom(null);
          (e.target as Element).setPointerCapture?.(e.pointerId);
          pan.current = { x: e.clientX, y: e.clientY, px: ui.px, py: ui.py };
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <defs>
          <pattern id="schgrid" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
            <circle cx="0" cy="0" r="1" className="sch-dot" />
          </pattern>
        </defs>
        <rect x={-4000} y={-4000} width={8000} height={8000} fill="url(#schgrid)" pointerEvents="none" />
        {sch.wires.map((w) => {
          const pa = byId.get(w.a.part), pb = byId.get(w.b.part);
          if (!pa || !pb) return null;
          const a = pinsOf(pa)[w.a.pin], b = pinsOf(pb)[w.b.pin];
          if (!a || !b) return null;
          return (
            <g key={w.id} className="sch-wire-g">
              <path
                d={wirePath(a, b, routeOf(w))}
                className="sch-wire-hit"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setSel({ type: 'wire', id: w.id });
                  if (ui.wireMode) return;
                  (e.target as Element).setPointerCapture?.(e.pointerId);
                  const p0 = toSvg(e);
                  wireDrag.current = { id: w.id, moved: false, x0: p0.x, y0: p0.y, axis: null };
                }}
                onDoubleClick={(e) => {
                  // Duplo clique: volta ao traçado automático.
                  e.stopPropagation();
                  if (w.mid === undefined && w.midY === undefined) return;
                  const { mid: _m, midY: _y, ...rest } = w;
                  commit(ed, sch, { wires: sch.wires.map((x) => (x.id === w.id ? rest : x)) }, `c.route(${q(w.id)}, None)`);
                }}
              />
              <path d={wirePath(a, b, routeOf(w))} className={`sch-wire${sel?.type === 'wire' && sel.id === w.id ? ' on' : ''}`} pointerEvents="none" />
            </g>
          );
        })}
        {wireFrom && cursor && byId.get(wireFrom.part) && <path d={wirePath(pinsOf(byId.get(wireFrom.part)!)[wireFrom.pin], cursor, {})} className="sch-wire pending" />}
        {parts.map((p) => {
          const sig = result ? partSignal(result.res, p.id, k) : null;
          const vert = p.rot % 180 !== 0;
          return (
            <g key={p.id} className={`sch-part${sel?.type === 'part' && sel.id === p.id ? ' on' : ''}`}>
              <g
                transform={`translate(${p.x} ${p.y}) rotate(${p.rot}) scale(${p.flip ? -1 : 1} 1)`}
                role="button"
                aria-label={p.name}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  (e.target as Element).setPointerCapture?.(e.pointerId);
                  const s2 = toSvg(e);
                  drag.current = { id: p.id, dx: s2.x - p.x, dy: s2.y - p.y, moved: false };
                  setSel({ type: 'part', id: p.id });
                }}
              >
                <rect x="-42" y="-24" width="84" height="48" fill="transparent" />
                <Symbol p={p} />
              </g>
              <text x={p.x + (vert ? 30 : 0)} y={p.y + (vert ? -6 : -30)} textAnchor={vert ? 'start' : 'middle'} className="sch-label">
                {p.name}
              </text>
              {valueLabel(p) && (
                <text x={p.x + (vert ? 30 : 0)} y={p.y + (vert ? 9 : 36)} textAnchor={vert ? 'start' : 'middle'} className="sch-value">
                  <title>{valueLabel(p)}</title>
                  {valueLabel(p).length > 24 ? `${valueLabel(p).slice(0, 23)}…` : valueLabel(p)}
                </text>
              )}
              {sig && p.kind !== 'gnd' && (
                <text x={p.x + (vert ? 30 : 0)} y={p.y + (vert ? 24 : 50)} textAnchor={vert ? 'start' : 'middle'} className="sch-live">
                  i = {eng(sig.i, 'A')} · v = {eng(sig.v, 'V')}
                </text>
              )}
              {pinsOf(p).map((pt, i) => (
                <circle
                  key={i}
                  cx={pt.x}
                  cy={pt.y}
                  r={6}
                  className={`sch-pin${wireFrom && wireFrom.part === p.id && wireFrom.pin === i ? ' on' : ''}`}
                  role="button"
                  aria-label={`${p.name}:${i}`}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    // Clique-clique (ou modo fio) liga dois terminais; arrastar de um terminal até outro também.
                    if (wireFrom && (wireFrom.part !== p.id || wireFrom.pin !== i)) {
                      connect(wireFrom, { part: p.id, pin: i });
                      setWireFrom(null);
                    } else setWireFrom(wireFrom ? null : { part: p.id, pin: i });
                  }}
                />
              ))}
            </g>
          );
        })}
      </svg>
      {result && <SignalsPanel ed={ed} sch={sch} times={result.times} res={result.res} />}
      {ui.wireMode && <div className="sch-mode">{t.sch.wireMode}</div>}
    </div>
  );
}

/** Painel de sinais: escolha as correntes/tensões e veja num gráfico (várias séries). */
function SignalsPanel({ ed, sch, times, res }: { ed: SketchEditor; sch: SchematicNode; times: Float64Array; res: NonNullable<ReturnType<typeof schResult>>['res'] }) {
  const t = useT();
  const ui = useSchUi();
  void ed;
  const opts = sch.parts
    .filter((p) => p.kind !== 'gnd')
    .flatMap((p) => [
      { key: `${p.id}:i`, label: `i(${p.name})`, unit: 'A' },
      { key: `${p.id}:v`, label: `v(${p.name})`, unit: 'V' },
    ]);
  const chosen = ui.plot.filter((k2) => opts.some((o) => o.key === k2));
  const series = chosen.map((key) => {
    const [pid, q2] = key.split(':');
    const o = opts.find((x) => x.key === key)!;
    return { label: o.label, unit: o.unit, y: Array.from(times, (_, k) => { const s2 = partSignal(res, pid, k); return s2 ? (q2 === 'i' ? s2.i : s2.v) : 0; }) };
  });
  const ms = Array.from(times, (x) => x * 1e3);
  const units = [...new Set(series.map((s2) => s2.unit))];
  return (
    <div className="sch-signals-bottom">
      <div className="sig-pick">
        <strong>{t.sch.signals}:</strong>
        {opts.map((o) => (
          <label key={o.key} className="sig-opt">
            <input
              type="checkbox"
              checked={chosen.includes(o.key)}
              onChange={(e) => setSchUi({ plot: e.target.checked ? [...chosen, o.key] : chosen.filter((x) => x !== o.key) })}
            />
            {o.label}
          </label>
        ))}
      </div>
      {series.length > 0 && (
        <div className="sch-signals-charts" style={{ gridTemplateColumns: `repeat(${units.length}, 1fr)` }}>
          {units.map((u) => {
            const ss = series.filter((s2) => s2.unit === u);
            return <MultiChart key={u} x={ms} series={ss.map((s2) => ({ label: s2.label, y: s2.y }))} xLabel="t (ms)" yLabel={u === 'A' ? t.sch.current : t.sch.voltage} cursor={ms[Math.min(ui.frame, ms.length - 1)]} />;
          })}
        </div>
      )}
    </div>
  );
}

const SERIES_COLORS = ['#e8408a', '#1f6fd1', '#2e8b57', '#d4880f', '#8e44ad', '#0aa3a3'];

/** Gráfico com várias séries (mesma unidade) e cursor de tempo. */
export function MultiChart({ x, series, xLabel, yLabel, cursor }: { x: number[]; series: { label: string; y: number[] }[]; xLabel: string; yLabel: string; cursor?: number }) {
  const Wc = 520, Hc = 200, L = 56, R = 10, Tt = 10, B = 34;
  const x0 = x[0], x1 = x[x.length - 1];
  let lo = Math.min(...series.flatMap((s2) => s2.y)), hi = Math.max(...series.flatMap((s2) => s2.y));
  if (!(hi > lo)) hi = lo + 1;
  const X = (v: number) => L + ((v - x0) / (x1 - x0 || 1)) * (Wc - L - R);
  const Y = (v: number) => Tt + (1 - (v - lo) / (hi - lo)) * (Hc - Tt - B);
  const fmt = (v: number) => Number(v.toPrecision(3)).toString();
  return (
    <svg className="xychart multi" viewBox={`0 0 ${Wc} ${Hc}`} role="img" aria-label={yLabel}>
      <rect x={L} y={Tt} width={Wc - L - R} height={Hc - Tt - B} className="frame" />
      {lo < 0 && hi > 0 && <line x1={L} x2={Wc - R} y1={Y(0)} y2={Y(0)} className="grid" />}
      {series.map((s2, i) => (
        <polyline key={s2.label} points={s2.y.map((v, k) => `${X(x[k]).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')} fill="none" stroke={SERIES_COLORS[i % SERIES_COLORS.length]} strokeWidth={1.8} />
      ))}
      {cursor !== undefined && <line x1={X(cursor)} x2={X(cursor)} y1={Tt} y2={Hc - B} className="cursor" />}
      <text x={L - 4} y={Tt + 8} textAnchor="end">{fmt(hi)}</text>
      <text x={L - 4} y={Hc - B} textAnchor="end">{fmt(lo)}</text>
      <text x={L} y={Hc - B + 14}>{fmt(x0)}</text>
      <text x={Wc - R} y={Hc - B + 14} textAnchor="end">{fmt(x1)} {xLabel.replace(/^t /, '')}</text>
      {series.map((s2, i) => (
        <text key={s2.label} x={L + 6 + i * 110} y={Hc - 4} fill={SERIES_COLORS[i % SERIES_COLORS.length]} className="axis-label">
          ■ {s2.label}
        </text>
      ))}
      <text x={12} y={(Tt + Hc - B) / 2} textAnchor="middle" transform={`rotate(-90 12 ${(Tt + Hc - B) / 2})`}>{yLabel}</text>
    </svg>
  );
}

/** Barra lateral do circuito (no lugar da árvore): componentes, bobinas e propriedades do selecionado. */
export function SchematicSidebar({ ed, id }: { ed: SketchEditor; id: Id }) {
  const t = useT();
  useDocVersion(ed.doc);
  useEditor(ed);
  const sel = useSel();
  const sch = ed.sketch.nodes.find((n): n is SchematicNode => n.id === id && n.kind === 'schematic');
  if (!sch) return null;
  const selPart = sel?.type === 'part' ? sch.parts.find((p) => p.id === sel.id) : undefined;
  const setPart = (patch: Partial<SchPart>, code: string) => commit(ed, sch, { parts: sch.parts.map((p) => (p.id === selPart!.id ? { ...p, ...patch } : p)) }, code);
  const field = (label: string, key: 'value') => (
    <label className="field" key={key}>
      <span>{label}</span>
      <LazyInput value={selPart?.[key] ?? ''} ariaLabel={label} onCommit={(v) => setPart({ [key]: v.trim() }, `c.set(${q(selPart!.id)}, ${key}=${q(v.trim())})`)} />
    </label>
  );
  const placed = new Set(sch.parts.filter((p) => p.kind === 'coil').map((p) => p.circuit));
  const kinds: PartKind[] = ['V', 'I', 'R', 'L', 'C', 'gnd'];
  return (
    <div className="sch-sidebar-wrap">
      <section className="sch-palette">
        <h3>{t.sch.components}</h3>
        <button className={`sch-comp${useSchUi().wireMode ? ' on' : ''}`} onClick={() => setSchUi({ wireMode: !schUi.wireMode })}>
          <svg viewBox="-45 -25 90 50" className="sch-ico">
            <path d="M-40 10H0V-10H40" fill="none" stroke="currentColor" strokeWidth="3" />
          </svg>
          {t.sch.wire}
        </button>
        {kinds.map((k) => (
          <button key={k} className="sch-comp" onClick={() => addPart(ed, sch.id, k)}>
            <svg viewBox="-45 -25 90 50" className="sch-ico">
              <g className="sch-part">
                <Symbol p={{ id: 'x', kind: k, name: '', x: 0, y: 0, rot: 0 }} />
              </g>
            </svg>
            {t.sch.parts[k]}
          </button>
        ))}
        {ed.sketch.circuits.filter((c) => !placed.has(c.id)).length > 0 && <h3>{t.sch.coils}</h3>}
        {ed.sketch.circuits
          .filter((c) => !placed.has(c.id))
          .map((c) => (
            <button key={c.id} className="sch-comp" onClick={() => addPart(ed, sch.id, 'coil', c.id)}>
              <svg viewBox="-45 -25 90 50" className="sch-ico">
                <g className="sch-part">
                  <Symbol p={{ id: 'x', kind: 'coil', name: '', x: 0, y: 0, rot: 0 }} />
                </g>
              </svg>
              {c.name}
            </button>
          ))}
      </section>
            <div className="sch-sidebar">
        <p className="help-line">{t.sch.wireHint}</p>
        {!selPart && <p className="muted">{t.sch.selectHint}</p>}
        {selPart && (
          <section>
            <h3>{t.sch.parts[selPart.kind]}</h3>
            <label className="field">
              <span>{t.mesh.name}</span>
              <LazyInput value={selPart.name} ariaLabel={t.mesh.name} onCommit={(v) => v.trim() && setPart({ name: v.trim() }, `c.set(${q(selPart.id)}, name=${q(v.trim())})`)} />
            </label>
            {(selPart.kind === 'R' || selPart.kind === 'L' || selPart.kind === 'C') && field(t.sch.value[selPart.kind], 'value')}
            {(selPart.kind === 'V' || selPart.kind === 'I') && (
              <>
                <label className="field">
                  <span>{selPart.kind === 'V' ? t.sch.vt : t.sch.it}</span>
                  <LazyInput
                    value={sourceExpr(selPart)}
                    ariaLabel={selPart.kind === 'V' ? t.sch.vt : t.sch.it}
                    onCommit={(v) => setPart({ value: v.trim(), amp: undefined, freq: undefined, phase: undefined, dc: undefined }, `c.set(${q(selPart.id)}, value=${q(v.trim())})`)}
                  />
                </label>
                <p className="help-line">{t.sch.srcHelp}</p>
              </>
            )}
            {selPart.kind === 'coil' && (
              <label className="field">
                <span>{t.circuit.name}</span>
                <select aria-label={t.circuit.name} value={selPart.circuit ?? ''} onChange={(e) => setPart({ circuit: e.target.value, name: ed.sketch.circuits.find((c) => c.id === e.target.value)?.name ?? selPart.name }, `c.set(${q(selPart.id)}, circuit=${q(e.target.value)})`)}>
                  {ed.sketch.circuits.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </section>
        )}
        <p className="help-line">{t.sch.help}</p>
        <p className="help-line">{t.sch.coupledNote}</p>
      </div>
    </div>
  );
}

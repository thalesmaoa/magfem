// Editor do circuito externo (esquemático) numa aba: blocos arrastáveis, fios entre terminais, sinais no tempo.
import { useEffect, useRef, useState } from 'react';
import { q } from '../cad/code';
import type { SketchEditor } from '../cad/editor';
import { partSignal, pinsOf } from '../cad/schematic';
import { updateNode } from '../cad/tree';
import type { Id, PartKind, SchematicNode, SchPart, SchWire } from '../cad/types';
import { T, useT } from '../i18n';
import { XYChart } from './CanvasTabs';
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
    ...(kind === 'V' || kind === 'I' ? { amp: kind === 'V' ? '10' : '1', freq: '50', phase: '0', dc: '0' } : {}),
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

export function SchematicPane({ ed, id }: { ed: SketchEditor; id: Id }) {
  const t = useT();
  useDocVersion(ed.doc);
  useEditor(ed);
  const sel = useSel();
  const sch = ed.sketch.nodes.find((n): n is SchematicNode => n.id === id && n.kind === 'schematic');
  const svgRef = useRef<SVGSVGElement>(null);
  const [live, setLive] = useState<SchPart[] | null>(null);
  const [wireFrom, setWireFrom] = useState<{ part: Id; pin: number } | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ id: Id; dx: number; dy: number; moved: boolean } | null>(null);
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (!sch || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;
      const cur = selState.sel;
      if (e.key === 'Escape') {
        setWireFrom(null);
        setSel(null);
      }
      if (!cur) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (cur.type === 'part')
          commit(ed, sch, { parts: sch.parts.filter((p) => p.id !== cur.id), wires: sch.wires.filter((w) => w.a.part !== cur.id && w.b.part !== cur.id) }, `c.remove(${q(cur.id)})`);
        else commit(ed, sch, { wires: sch.wires.filter((w) => w.id !== cur.id) }, `c.remove(${q(cur.id)})`);
        setSel(null);
      } else if ((e.key === 'r' || e.key === 'R') && cur.type === 'part') {
        commit(ed, sch, { parts: sch.parts.map((p) => (p.id === cur.id ? { ...p, rot: ((p.rot + 90) % 360) as SchPart['rot'] } : p)) }, `c.rotate(${q(cur.id)})`);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ed, sch]);
  if (!sch) return null;
  const parts = live ?? sch.parts;
  const byId = new Map(parts.map((p) => [p.id, p]));
  const toSvg = (e: { clientX: number; clientY: number }) => {
    const m = svgRef.current?.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };
  const pinClick = (part: Id, pin: number) => {
    if (!wireFrom) return setWireFrom({ part, pin });
    if (wireFrom.part === part && wireFrom.pin === pin) return setWireFrom(null);
    const w: SchWire = { id: `sw${ed.sketch.nextId}`, a: wireFrom, b: { part, pin } };
    ed.commit({ ...updateNode(ed.sketch, sch.id, { wires: [...sch.wires, w] }), nextId: ed.sketch.nextId + 1 }, [`c.wire(${q(sch.id)}, (${q(wireFrom.part)}, ${wireFrom.pin}), (${q(part)}, ${pin}))`]);
    setWireFrom(null);
  };
  const wirePath = (a: { x: number; y: number }, b: { x: number; y: number }) => `M${a.x} ${a.y}H${(a.x + b.x) / 2}V${b.y}H${b.x}`;
  const selPart = sel?.type === 'part' ? sch.parts.find((p) => p.id === sel.id) : undefined;
  // Sinais: da solução transitória acoplada a este esquemático.
  const phys = ed.sketch.nodes.find((n) => n.kind === 'physics');
  const sol = phys ? ed.solutions.get(phys.id) : undefined;
  const res = sol?.circuit?.schematic === sch.id ? sol.circuit : undefined;
  const times = sol?.times;
  const series = res && selPart && times ? Array.from(times, (_, k) => partSignal(res, selPart.id, k)) : null;
  const setPart = (patch: Partial<SchPart>, code: string) => commit(ed, sch, { parts: sch.parts.map((p) => (p.id === selPart!.id ? { ...p, ...patch } : p)) }, code);
  const field = (label: string, key: 'value' | 'amp' | 'freq' | 'phase' | 'dc') => (
    <label className="field" key={key}>
      <span>{label}</span>
      <LazyInput value={selPart?.[key] ?? ''} ariaLabel={label} onCommit={(v) => setPart({ [key]: v.trim() }, `c.set(${q(selPart!.id)}, ${key}=${q(v.trim())})`)} />
    </label>
  );
  return (
    <div className="sch-pane">
      <svg
        ref={svgRef}
        className="sch-canvas"
        viewBox="0 0 1000 640"
        onPointerMove={(e) => {
          const p = toSvg(e);
          setCursor(p);
          const d = drag.current;
          if (!d) return;
          d.moved = true;
          setLive(sch.parts.map((x) => (x.id === d.id ? { ...x, x: snap(p.x - d.dx), y: snap(p.y - d.dy) } : x)));
        }}
        onPointerUp={() => {
          const d = drag.current;
          drag.current = null;
          if (d?.moved && live) {
            const p = live.find((x) => x.id === d.id)!;
            commit(ed, sch, { parts: live }, `c.move(${q(d.id)}, (${p.x}, ${p.y}))`);
          }
          setLive(null);
        }}
        onPointerDown={(e) => {
          if (e.target === svgRef.current) {
            setSel(null);
            setWireFrom(null);
          }
        }}
      >
        <defs>
          <pattern id="schgrid" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
            <circle cx="0" cy="0" r="1" className="sch-dot" />
          </pattern>
        </defs>
        <rect width="1000" height="640" fill="url(#schgrid)" pointerEvents="none" />
        {sch.wires.map((w) => {
          const pa = byId.get(w.a.part), pb = byId.get(w.b.part);
          if (!pa || !pb) return null;
          const a = pinsOf(pa)[w.a.pin], b = pinsOf(pb)[w.b.pin];
          if (!a || !b) return null;
          return (
            <path
              key={w.id}
              d={wirePath(a, b)}
              className={`sch-wire${sel?.type === 'wire' && sel.id === w.id ? ' on' : ''}`}
              onPointerDown={(e) => {
                e.stopPropagation();
                setSel({ type: 'wire', id: w.id });
              }}
            />
          );
        })}
        {wireFrom && cursor && byId.get(wireFrom.part) && <path d={wirePath(pinsOf(byId.get(wireFrom.part)!)[wireFrom.pin], cursor)} className="sch-wire pending" />}
        {parts.map((p) => (
          <g key={p.id} className={`sch-part${sel?.type === 'part' && sel.id === p.id ? ' on' : ''}`}>
            <g
              transform={`translate(${p.x} ${p.y}) rotate(${p.rot})`}
              role="button"
              aria-label={p.name}
              onPointerDown={(e) => {
                e.stopPropagation();
                (e.target as Element).setPointerCapture?.(e.pointerId);
                const s = toSvg(e);
                drag.current = { id: p.id, dx: s.x - p.x, dy: s.y - p.y, moved: false };
                setSel({ type: 'part', id: p.id });
              }}
            >
              <rect x="-42" y="-24" width="84" height="48" fill="transparent" />
              <Symbol p={p} />
            </g>
            <text x={p.x} y={p.y + (p.rot % 180 ? 0 : -28)} dx={p.rot % 180 ? 30 : 0} textAnchor={p.rot % 180 ? 'start' : 'middle'} className="sch-label">
              {p.name}
            </text>
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
                  pinClick(p.id, i);
                }}
              />
            ))}
          </g>
        ))}
      </svg>
      <aside className="sch-side">
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
                {field(t.sch.amp[selPart.kind], 'amp')}
                {field(t.sch.freq, 'freq')}
                {field(t.sch.phase, 'phase')}
                {field(t.sch.dc, 'dc')}
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
            {series && times && series[0] && (
              <div className="sch-signals">
                <h3>{t.sch.signals}</h3>
                <XYChart x={Array.from(times, (x) => x * 1e3)} y={series.map((s) => s!.i)} xLabel="t (ms)" yLabel={t.sch.current} logX={false} logY={false} />
                <XYChart x={Array.from(times, (x) => x * 1e3)} y={series.map((s) => s!.v)} xLabel="t (ms)" yLabel={t.sch.voltage} logX={false} logY={false} />
                <input type="range" aria-label="k" min={0} max={times.length - 1} value={frame} onChange={(e) => setFrame(Number(e.target.value))} />
                <p className="muted">
                  t = {(times[frame] * 1e3).toPrecision(4)} ms · i = {series[frame]!.i.toPrecision(4)} A · v = {series[frame]!.v.toPrecision(4)} V
                </p>
              </div>
            )}
          </section>
        )}
        <p className="help-line">{t.sch.help}</p>
        <p className="help-line">{t.sch.coupledNote}</p>
      </aside>
    </div>
  );
}

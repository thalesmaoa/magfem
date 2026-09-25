// Barra de abas do canvas e painéis de gráfico (gráfico sobre linha, curva B-H) com escala linear/log.
import { useRef, useState, useSyncExternalStore } from 'react';
import { q } from '../cad/code';
import type { SketchEditor } from '../cad/editor';
import { updateMaterial } from '../cad/mesh';
import { circuitResults, lineIntegrals, lineProfile, quantityLabel, surfaceIntegrals } from '../cad/solve';
import { findRegion } from '../cad/regions';
import { resultVars, varNameOf } from '../cad/results';
import type { TreeSel } from '../cad/tree';
import { PLOT_QUANTITIES, type Material, type PlotQuantity, type PostNode, type ViewNode } from '../cad/types';
import { T, useT } from '../i18n';
import { LazyInput } from './common';
import { useDocVersion, useEditor } from './useStore';
import { activateTab, closeTab, tabKey, useTabs, type CanvasTab } from './tabsStore';

// Escala log dos eixos por aba (compartilhada entre a barra superior e o gráfico).
let logState: Record<string, [boolean, boolean]> = {};
const logListeners = new Set<() => void>();
export function setChartLog(tab: string, x: boolean, y: boolean) {
  logState = { ...logState, [tab]: [x, y] };
  logListeners.forEach((f) => f());
}
export function useChartLog(tab: string): [boolean, boolean] {
  return useSyncExternalStore(
    (f) => {
      logListeners.add(f);
      return () => logListeners.delete(f);
    },
    () => logState[tab] ?? NO_LOG,
  );
}
const NO_LOG: [boolean, boolean] = [false, false];

export function CanvasTabBar({ ed, onSelect }: { ed: SketchEditor; onSelect: (s: TreeSel) => void }) {
  const t = useT();
  useDocVersion(ed.doc);
  const { tabs, active } = useTabs();
  const sk = ed.sketch;
  const label = (tab: CanvasTab) => {
    if (tab.kind === 'draw') return t.post.drawing;
    if (tab.kind === 'view') {
      const v = sk.nodes.find((n) => n.id === tab.id);
      const ph = v?.kind === 'view' ? sk.nodes.find((n) => n.id === v.physics) : undefined;
      return v ? `${ph?.name ?? ''} · ${v.name}` : '?';
    }
    if (tab.kind === 'chart') return `${t.post.chart}: ${sk.nodes.find((n) => n.id === tab.plot)?.name ?? '?'}`;
    if (tab.kind === 'table') return sk.nodes.find((n) => n.id === tab.id)?.name ?? '?';
    if (tab.kind === 'sch') return sk.nodes.find((n) => n.id === tab.id)?.name ?? '?';
    if (tab.kind === 'circuits') return `${t.circuit.title}: ${sk.nodes.find((n) => n.id === tab.physics)?.name ?? '?'}`;
    return `${t.post.bhTab}: ${sk.materials.find((m) => m.id === tab.material)?.name ?? '?'}`;
  };
  if (tabs.length < 2) return null;
  return (
    <div className="canvas-tabs" role="tablist">
      {tabs.map((tab) => {
        const k = tabKey(tab);
        return (
          <div key={k} role="tab" aria-selected={active === k} className={`ctab${active === k ? ' on' : ''}`} onClick={() => {
            activateTab(k);
            if (tab.kind === 'view' || tab.kind === 'sch') onSelect({ kind: 'node', id: tab.id });
            else if (tab.kind === 'draw') onSelect({ kind: 'geometry' });
          }}>
            <span>{label(tab)}</span>
            {tab.kind !== 'draw' && (
              <button
                className="x"
                title={t.post.closeTab}
                aria-label={`${t.post.closeTab} ${label(tab)}`}
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(k);
                }}
              >
                ×
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Gráfico XY em SVG, com eixos lineares ou log e pontos clicáveis. */
export function XYChart(p: {
  x: number[];
  y: number[];
  xLabel: string;
  yLabel: string;
  logX: boolean;
  logY: boolean;
  markers?: boolean;
  onPoint?: (i: number) => void;
  /** Arrastar um ponto: coordenadas de dados (final = soltou). */
  onDrag?: (i: number, x: number, y: number, final: boolean) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ i: number; moved: boolean; x0: number; y0: number } | null>(null);
  const W = 800, H = 460, L = 70, R = 20, T = 20, B = 50;
  const ok = (v: number, log: boolean) => Number.isFinite(v) && (!log || v > 0);
  const idx = p.x.map((_, i) => i).filter((i) => ok(p.x[i], p.logX) && ok(p.y[i], p.logY));
  const tx = (v: number) => (p.logX ? Math.log10(v) : v);
  const ty = (v: number) => (p.logY ? Math.log10(v) : v);
  const xs = idx.map((i) => tx(p.x[i])), ys = idx.map((i) => ty(p.y[i]));
  let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (!p.logY && y0 > 0 && y0 < y1 * 0.5) y0 = 0;
  if (!(x1 > x0)) x1 = x0 + 1;
  if (!(y1 > y0)) y1 = y0 + 1;
  const X = (v: number) => L + ((v - x0) / (x1 - x0)) * (W - L - R);
  const Y = (v: number) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const ticks = (a: number, b: number, log: boolean) => {
    if (log) {
      const out: number[] = [];
      for (let e = Math.floor(a); e <= Math.ceil(b); e++) if (e >= a - 1e-9 && e <= b + 1e-9) out.push(e);
      return out.length >= 2 ? out : [a, b];
    }
    const step = Math.pow(10, Math.floor(Math.log10((b - a) / 5)));
    const m = [1, 2, 5, 10].find((k) => (b - a) / (k * step) <= 6) ?? 10;
    const st = m * step;
    const out: number[] = [];
    for (let v = Math.ceil(a / st) * st; v <= b + 1e-12; v += st) out.push(v);
    return out;
  };
  /** Ponto do mouse → coordenadas de dados (inverte a escala, inclusive log). */
  const toData = (e: { clientX: number; clientY: number }): [number, number] | null => {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return null;
    const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    const vx = x0 + ((q.x - L) / (W - L - R)) * (x1 - x0);
    const vy = y0 + (1 - (q.y - T) / (H - T - B)) * (y1 - y0);
    return [p.logX ? Math.pow(10, vx) : vx, p.logY ? Math.pow(10, vy) : vy];
  };
  const fmt = (v: number, log: boolean) => {
    const r = log ? Math.pow(10, v) : v;
    const a = Math.abs(r);
    return a !== 0 && (a >= 1e4 || a < 1e-2) ? r.toExponential(0) : Number(r.toPrecision(3)).toString();
  };
  return (
    <svg
      ref={svgRef}
      className="xychart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={p.yLabel}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || !p.onDrag || !svgRef.current) return;
        if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 3) d.moved = true;
        if (!d.moved) return;
        const pt = toData(e);
        if (pt) p.onDrag(d.i, pt[0], pt[1], false);
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        drag.current = null;
        if (!d) return;
        if (!d.moved) return p.onPoint?.(d.i);
        const pt = toData(e);
        if (pt && p.onDrag) p.onDrag(d.i, pt[0], pt[1], true);
      }}
    >
      {ticks(x0, x1, p.logX).map((v) => (
        <g key={`x${v}`}>
          <line x1={X(v)} y1={T} x2={X(v)} y2={H - B} className="grid" />
          <text x={X(v)} y={H - B + 16} textAnchor="middle">
            {fmt(v, p.logX)}
          </text>
        </g>
      ))}
      {ticks(y0, y1, p.logY).map((v) => (
        <g key={`y${v}`}>
          <line x1={L} y1={Y(v)} x2={W - R} y2={Y(v)} className="grid" />
          <text x={L - 6} y={Y(v) + 4} textAnchor="end">
            {fmt(v, p.logY)}
          </text>
        </g>
      ))}
      <rect x={L} y={T} width={W - L - R} height={H - T - B} className="frame" />
      <polyline points={idx.map((i) => `${X(tx(p.x[i])).toFixed(1)},${Y(ty(p.y[i])).toFixed(1)}`).join(' ')} className="curve" />
      {p.markers &&
        idx.map((i) => (
          <circle
            key={i}
            cx={X(tx(p.x[i]))}
            cy={Y(ty(p.y[i]))}
            r={6}
            className="pt"
            role="button"
            aria-label={`${i + 1}`}
            onPointerDown={(e) => {
              (e.target as Element).setPointerCapture?.(e.pointerId);
              drag.current = { i, moved: false, x0: e.clientX, y0: e.clientY };
            }}
            onClick={p.onDrag ? undefined : () => p.onPoint?.(i)}
          >
            <title>
              ({p.x[i]}, {p.y[i]})
            </title>
          </circle>
        ))}
      <text x={(L + W - R) / 2} y={H - 10} textAnchor="middle" className="axis-label">
        {p.xLabel}
      </text>
      <text x={16} y={(T + H - B) / 2} textAnchor="middle" className="axis-label" transform={`rotate(-90 16 ${(T + H - B) / 2})`}>
        {p.yLabel}
      </text>
    </svg>
  );
}

export function LogToggles({ logX, logY, set }: { logX: boolean; logY: boolean; set: (x: boolean, y: boolean) => void }) {
  const t = useT();
  return (
    <div className="chart-tools">
      <label>
        <input type="checkbox" checked={logX} onChange={(e) => set(e.target.checked, logY)} /> {t.post.logX}
      </label>
      <label>
        <input type="checkbox" checked={logY} onChange={(e) => set(logX, e.target.checked)} /> {t.post.logY}
      </label>
    </div>
  );
}

/** Painel de uma aba de gráfico (sobre linha) ou de curva B-H, por cima do canvas. */
export function ChartPane({ ed, tab }: { ed: SketchEditor; tab: string }) {
  useDocVersion(ed.doc);
  useEditor(ed);
  const [lx, ly] = useChartLog(tab);
  const setLog = (x: boolean, y: boolean) => setChartLog(tab, x, y);
  if (tab.startsWith('chart:')) return <LinePane ed={ed} id={tab.slice(6)} lx={lx} ly={ly} setLog={setLog} />;
  if (tab.startsWith('table:'))
    return (
      <div className="chart-pane">
        <TablePane ed={ed} id={tab.slice(6)} />
      </div>
    );
  if (tab.startsWith('circuits:'))
    return (
      <div className="chart-pane">
        <CircuitTable ed={ed} physics={tab.slice(9)} big />
      </div>
    );
  const m = ed.sketch.materials.find((x) => x.id === tab.slice(3));
  return m ? <BHPane ed={ed} m={m} lx={lx} ly={ly} setLog={setLog} /> : null;
}

function LinePane({ ed, id, lx, ly }: { ed: SketchEditor; id: string; lx: boolean; ly: boolean; setLog?: (x: boolean, y: boolean) => void }) {
  const t = useT();
  const node = ed.sketch.nodes.find((n): n is PostNode => n.id === id && n.kind === 'post');
  const sol = node?.physics ? ed.shownSol(node.physics) : undefined;
  if (!node) return null;
  const smooth = ed.sketch.nodes.some((n) => n.id === node.view && n.kind === 'view' && !!n.level);
  const prof = sol && node.curve ? lineProfile(sol, ed.sketch, node.curve, 400, smooth) : null;
  const qty = (node.quantity ?? 'b') as 'b' | 'bn' | 'bt' | 'h' | 'a';
  return (
    <div className="chart-pane">
      <div className="chart-head">
        <strong>{node.name}</strong>
        <select
          aria-label={t.post.by.line}
          value={qty}
          onChange={(e) => ed.commit({ ...ed.sketch, nodes: ed.sketch.nodes.map((n) => (n.id === id ? { ...n, quantity: e.target.value as PlotQuantity } : n)) }, [`r.show(${q(id)}, quantity=${q(e.target.value)})`])}
        >
          {PLOT_QUANTITIES.line.map((k) => (
            <option key={k} value={k}>
              {t.post.qty[k]}
            </option>
          ))}
        </select>
        {prof && (
          <span className="chart-stat">
            {t.post.flux}: <b>{prof.flux.toPrecision(4)} Wb</b>
          </span>
        )}
      </div>
      {!sol ? <p className="muted">{t.solve.noSolution}</p> : !prof ? <p className="muted">{t.post.noCurve}</p> : (
        <XYChart x={prof.s} y={prof[qty]} xLabel="s (mm)" yLabel={quantityLabel(qty, 'mag', sol.axisymmetric)} logX={lx} logY={ly} />
      )}
    </div>
  );
}

/** Aba da curva B-H: gráfico com pontos clicáveis (modal para editar), incluir ponto, log/linear. */
function BHPane({ ed, m, lx, ly }: { ed: SketchEditor; m: Material; lx: boolean; ly: boolean; setLog?: (x: boolean, y: boolean) => void }) {
  const t = useT();
  const [edit, setEdit] = useState<number | null>(null);
  const [live, setLive] = useState<[number, number][] | null>(null);
  const bh = live ?? m.bh ?? [];
  // Arrastar: o ponto fica entre os vizinhos (curva crescente); ao soltar, grava.
  const onDrag = (i: number, h: number, b: number, final: boolean) => {
    const base = m.bh ?? [];
    const lo = base[i - 1] ?? [0, 0], hi = base[i + 1];
    const eps = 1e-6;
    const nh = Math.max(lo[0] + Math.max(1e-3, lo[0] * eps), hi ? Math.min(h, hi[0] - Math.max(1e-3, hi[0] * eps)) : h);
    const nb = Math.max(lo[1], hi ? Math.min(b, hi[1]) : b);
    const next = base.map((p, j) => (j === i ? ([+nh.toPrecision(5), +nb.toPrecision(4)] as [number, number]) : p));
    if (final) {
      setLive(null);
      save(next);
    } else setLive(next);
  };
  const save = (next: [number, number][]) => {
    for (let i = 1; i < next.length; i++) if (!(next[i][0] > next[i - 1][0]) || !(next[i][1] >= next[i - 1][1])) return ed.flash(t.mesh.bhMonotonic);
    ed.meshOp((s) => updateMaterial(s, m.id, { bh: next }), `m.material(${q(m.name)}, bh=[${next.map((p) => `(${p[0]}, ${p[1]})`).join(', ')}])`);
  };
  return (
    <div className="chart-pane">
      <div className="chart-head">
        <strong>
          {t.post.bhTab}: {m.name}
        </strong>
        <button
          className="btn secondary"
          onClick={() => {
            const [h1, b1] = bh[bh.length - 1] ?? [0, 0];
            const [h0, b0] = bh[bh.length - 2] ?? [0, 0];
            save([...bh, [Math.round(h1 + Math.max(h1 - h0, 100) * 2), +(b1 + Math.max((b1 - b0) * 0.5, 0.01)).toFixed(3)]]);
            setEdit(bh.length);
          }}
        >
          + {t.mesh.bhAddPoint}
        </button>
        <span className="chart-stat">{t.mesh.bhClickHint}</span>
      </div>
      <XYChart x={bh.map((p) => p[0])} y={bh.map((p) => p[1])} xLabel="H (A/m)" yLabel="B (T)" logX={lx} logY={ly} markers onPoint={setEdit} onDrag={onDrag} />
      {edit !== null && bh[edit] && (
        <div className="modal-back" onClick={() => setEdit(null)}>
          <div className="modal" role="dialog" aria-label={`${t.mesh.bhPoint} ${edit + 1}`} onClick={(e) => e.stopPropagation()}>
            <h3>
              {t.mesh.bhPoint} {edit + 1}
            </h3>
            {[0, 1].map((k) => (
              <label key={k} className="field">
                <span>{k ? 'B (T)' : 'H (A/m)'}</span>
                <LazyInput
                  autoFocus={k === 0}
                  value={String(bh[edit][k])}
                  ariaLabel={k ? 'B (T)' : 'H (A/m)'}
                  onCommit={(v) => {
                    const n = Number(v.replace(',', '.'));
                    if (!Number.isFinite(n) || n < 0) return ed.flash(t.msg.positive);
                    save(bh.map((p, j) => (j === edit ? ((k ? [p[0], n] : [n, p[1]]) as [number, number]) : p)));
                  }}
                />
              </label>
            ))}
            <div className="modal-actions">
              <button
                className="btn danger"
                disabled={bh.length <= 2}
                onClick={() => {
                  save(bh.filter((_, j) => j !== edit));
                  setEdit(null);
                }}
              >
                {t.tree.remove}
              </button>
              <button className="btn" onClick={() => setEdit(null)}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Modal da legenda: limites inferior e superior da faixa de cores (ou automático). */
export function LegendModal({ ed }: { ed: SketchEditor }) {
  const t = useT();
  useEditor(ed);
  const le = ed.legendEdit;
  const [lo, setLo] = useState('');
  const [hi, setHi] = useState('');
  const [key, setKey] = useState('');
  const k = le ? `${le.layer}:${le.lo}:${le.hi}` : '';
  if (le && k !== key) {
    // Abriu (ou trocou de legenda): preenche com os limites atuais.
    const f = (v: number) => String(Number(v.toPrecision(5)));
    setKey(k);
    setLo(f(le.lo));
    setHi(f(le.hi));
  }
  if (!le) return null;
  const node = ed.sketch.nodes.find((n) => n.id === le.layer);
  const view = node?.kind === 'post' ? ed.sketch.nodes.find((n): n is ViewNode => n.id === node.view && n.kind === 'view') : undefined;
  const setBg = (bg: string | undefined) => {
    if (!view) return;
    const legend = { ...view.legend, bg };
    if (bg === undefined) delete legend.bg;
    ed.commit({ ...ed.sketch, nodes: ed.sketch.nodes.map((n) => (n.id === view.id ? { ...n, legend } : n)) }, [`r.show(${q(view.id)}, legend_bg=${bg === undefined ? 'None' : q(bg)})`]);
  };
  const close = () => {
    setKey('');
    ed.closeLegend();
  };
  const apply = (range: [number, number] | undefined) => {
    const code = `r.show(${q(le.layer)}, range=${range ? `(${range[0]}, ${range[1]})` : 'None'})`;
    if (ed.commit({ ...ed.sketch, nodes: ed.sketch.nodes.map((n) => (n.id === le.layer ? { ...n, range } : n)) }, [code])) close();
  };
  const a = Number(lo.replace(',', '.')), b = Number(hi.replace(',', '.'));
  const valid = Number.isFinite(a) && Number.isFinite(b) && b > a;
  return (
    <div className="modal-back" onClick={close}>
      <form
        className="modal"
        role="dialog"
        aria-label={t.post.range}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) apply([a, b]);
        }}
      >
        <h3>
          {t.post.range}: {node?.name}
        </h3>
        <label className="field">
          <span>{t.post.rangeMax}</span>
          <input autoFocus aria-label={t.post.rangeMax} value={hi} onChange={(e) => setHi(e.target.value)} />
        </label>
        <label className="field">
          <span>{t.post.rangeMin}</span>
          <input aria-label={t.post.rangeMin} value={lo} onChange={(e) => setLo(e.target.value)} />
        </label>
        {!valid && <p className="err-text">{t.post.rangeInvalid}</p>}
        {view && (
          <>
            <label className="field check">
              <input
                type="checkbox"
                checked={view.legend?.bg !== 'none'}
                onChange={(e) => setBg(e.target.checked ? undefined : 'none')}
              />
              <span>{t.post.legendBox}</span>
            </label>
            {view.legend?.bg !== 'none' && (
              <label className="field">
                <span>{t.post.legendBg}</span>
                <input type="color" aria-label={t.post.legendBg} value={view.legend?.bg ?? '#ffffff'} onChange={(e) => setBg(e.target.value)} />
              </label>
            )}
          </>
        )}
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={() => apply(undefined)}>
            {t.post.rangeAutoBtn}
          </button>
          <button type="submit" className="btn" disabled={!valid}>
            OK
          </button>
        </div>
      </form>
    </div>
  );
}

const eng = (v: number | null, unit: string) => {
  if (v === null || !Number.isFinite(v)) return '—';
  if (v === 0) return `0 ${unit}`;
  // Unidades compostas (m², T²·m³…): prefixo confundiria (mm² ≠ milésimo de m²) → notação científica.
  if (/[²³·]/.test(unit)) return `${Number(v.toPrecision(4)).toExponential(3)} ${unit}`;
  const r = Number(v.toPrecision(4)); // arredonda antes de escolher o prefixo (999,9999 → 1000 → 1 k)
  const e = Math.max(-12, Math.min(9, Math.floor(Math.log10(Math.abs(r)) / 3) * 3));
  const pre: Record<number, string> = { [-12]: 'p', [-9]: 'n', [-6]: 'µ', [-3]: 'm', 0: '', 3: 'k', 6: 'M', 9: 'G' };
  return `${(r / Math.pow(10, e)).toPrecision(4)} ${pre[e]}${unit}`;
};

/** Tabela de circuitos (I, espiras, λ, L, R, V, perdas) de uma física resolvida. */
export function CircuitTable({ ed, physics, big }: { ed: SketchEditor; physics: string; big?: boolean }) {
  const t = useT();
  useEditor(ed);
  const sol = ed.shownSol(physics);
  if (!ed.sketch.circuits.length) return <p className="muted">{t.circuit.empty}</p>;
  if (!sol) return <p className="muted">{t.solve.noSolution}</p>;
  const rows = circuitResults(ed.sketch, ed.arrangement(), sol);
  const c = t.circuit.cols;
  return (
    <div className={big ? 'circ big' : 'circ'}>
      {big && <h3>{t.circuit.table}</h3>}
      <table className="circ-table">
        <thead>
          <tr>
            <th>{c.name}</th>
            <th>{c.I}</th>
            <th>{c.turns}</th>
            <th>{c.lambda}</th>
            <th>{c.L}</th>
            <th>{c.R}</th>
            <th>{c.V}</th>
            <th>{c.P}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td>{r.I.toPrecision(4)}</td>
              <td>{r.turns}</td>
              <td>{eng(r.lambda, 'Wb')}</td>
              <td>{eng(r.L, 'H')}</td>
              <td>{eng(r.R, 'Ω')}</td>
              <td>{eng(r.V, 'V')}</td>
              <td>{eng(r.P, 'W')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="help-line">{t.circuit.note}</p>
    </div>
  );
}

/** Linhas (rótulo, valor) de um item de tabela, ou uma mensagem. */
export function tableItemRows(ed: SketchEditor, it: PostNode): { rows: [string, string][]; msg?: string } {
  const t = T();
  const sol = it.physics ? ed.shownSol(it.physics) : undefined;
  if (!sol) return { rows: [], msg: t.solve.noSolution };
  const sk = ed.sketch;
  if (it.item === 'lineint') {
    if (!it.curve) return { rows: [], msg: t.post.noCurve };
    const li = lineIntegrals(sol, sk, it.curve);
    if (!li) return { rows: [], msg: t.post.outside };
    const L = t.table.line;
    return {
      rows: [
        [L.length, `${li.length.toPrecision(5)} mm`],
        [L.flux, eng(li.flux, 'Wb')],
        [L.intBn, eng(li.intBn, 'T·m')],
        [L.intB, eng(li.intB, 'T·m')],
        [L.mmf, eng(li.mmf, 'A')],
        [L.bAvg, eng(li.bAvg, 'T')],
      ],
    };
  }
  if (it.item === 'surfint') {
    const arr = ed.arrangement();
    const set = new Set<number>();
    for (const k of it.regions ?? []) {
      const r = findRegion(arr, k);
      if (r) set.add(r.index);
    }
    if (!set.size) return { rows: [], msg: t.table.noRegions };
    const si = surfaceIntegrals(sol, sk, set);
    const S = t.table.surf;
    return {
      rows: [
        [S.area, `${Number((si.area * 1e6).toPrecision(5))} mm²`],
        [S.intA, eng(si.intA, sol.axisymmetric ? 'Wb·m/rad' : 'Wb·m')],
        [S.volume, `${Number((si.volume * 1e9).toPrecision(5))} mm³`],
        [S.current, eng(si.current, 'A')],
        [S.energy, eng(si.energy, 'J')],
        [S.bAvg, eng(si.bAvg, 'T')],
        [S.b2, eng(si.b2, 'T²·m³')],
        [S.bmean, `${si.bx.toPrecision(4)}, ${si.by.toPrecision(4)} T`],
      ],
    };
  }
  if (it.item === 'formula') {
    const phys = it.physics!;
    const rv = resultVars(sk, ed.arrangement(), sol, phys);
    const f = rv.formulas.get(it.id);
    if (!f || f.error) return { rows: [], msg: f?.error ?? t.table.noExpr };
    const unit = it.unitLabel ?? '';
    return { rows: [[`${varNameOf(sk, it)} = ${it.expr}`, `${Number(f.value!.toPrecision(6))} ${unit}`]] };
  }
  return { rows: [] };
}

/** Aba de uma tabela de resultados: um bloco por item. */
function TablePane({ ed, id }: { ed: SketchEditor; id: string }) {
  const t = useT();
  const tb = ed.sketch.nodes.find((n) => n.id === id);
  if (!tb || tb.kind !== 'table') return null;
  const items = ed.sketch.nodes.filter((n): n is PostNode => n.kind === 'post' && n.view === id);
  return (
    <div className="table-pane">
      <h3>{tb.name}</h3>
      {!items.length && <p className="muted">{t.table.empty}</p>}
      {items.map((it) => (
        <section key={it.id} className="table-item">
          <h4>{it.name}</h4>
          {it.item === 'circuits' ? (
            <CircuitTable ed={ed} physics={tb.physics} big />
          ) : (
            (() => {
              const r = tableItemRows(ed, it);
              return r.msg ? (
                <p className="muted">{r.msg}</p>
              ) : (
                <table className="circ-table kv">
                  <tbody>
                    {r.rows.map(([k, v]) => (
                      <tr key={k}>
                        <th>{k}</th>
                        <td>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })()
          )}
        </section>
      ))}
    </div>
  );
}

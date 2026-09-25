// Barra de abas do canvas e painéis de gráfico (gráfico sobre linha, curva B-H) com escala linear/log.
import { useState } from 'react';
import { q } from '../cad/code';
import type { SketchEditor } from '../cad/editor';
import { updateMaterial } from '../cad/mesh';
import { lineProfile, quantityLabel } from '../cad/solve';
import type { TreeSel } from '../cad/tree';
import { PLOT_QUANTITIES, type Material, type PlotQuantity, type PostNode } from '../cad/types';
import { useT } from '../i18n';
import { LazyInput } from './common';
import { useDocVersion, useEditor } from './useStore';
import { activateTab, closeTab, tabKey, useTabs, type CanvasTab } from './tabsStore';

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
            if (tab.kind === 'view') onSelect({ kind: 'node', id: tab.id });
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
function XYChart(p: {
  x: number[];
  y: number[];
  xLabel: string;
  yLabel: string;
  logX: boolean;
  logY: boolean;
  markers?: boolean;
  onPoint?: (i: number) => void;
}) {
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
  const fmt = (v: number, log: boolean) => {
    const r = log ? Math.pow(10, v) : v;
    const a = Math.abs(r);
    return a !== 0 && (a >= 1e4 || a < 1e-2) ? r.toExponential(0) : Number(r.toPrecision(3)).toString();
  };
  return (
    <svg className="xychart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={p.yLabel}>
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
          <circle key={i} cx={X(tx(p.x[i]))} cy={Y(ty(p.y[i]))} r={5} className="pt" role="button" aria-label={`${i + 1}`} onClick={() => p.onPoint?.(i)}>
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

function LogToggles({ logX, logY, set }: { logX: boolean; logY: boolean; set: (x: boolean, y: boolean) => void }) {
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
  const [logs, setLogs] = useState<Record<string, [boolean, boolean]>>({});
  const [lx, ly] = logs[tab] ?? [false, false];
  const setLog = (x: boolean, y: boolean) => setLogs((l) => ({ ...l, [tab]: [x, y] }));
  if (tab.startsWith('chart:')) return <LinePane ed={ed} id={tab.slice(6)} lx={lx} ly={ly} setLog={setLog} />;
  const m = ed.sketch.materials.find((x) => x.id === tab.slice(3));
  return m ? <BHPane ed={ed} m={m} lx={lx} ly={ly} setLog={setLog} /> : null;
}

function LinePane({ ed, id, lx, ly, setLog }: { ed: SketchEditor; id: string; lx: boolean; ly: boolean; setLog: (x: boolean, y: boolean) => void }) {
  const t = useT();
  const node = ed.sketch.nodes.find((n): n is PostNode => n.id === id && n.kind === 'post');
  const sol = node?.physics ? ed.solutions.get(node.physics) : undefined;
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
        <LogToggles logX={lx} logY={ly} set={setLog} />
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
function BHPane({ ed, m, lx, ly, setLog }: { ed: SketchEditor; m: Material; lx: boolean; ly: boolean; setLog: (x: boolean, y: boolean) => void }) {
  const t = useT();
  const [edit, setEdit] = useState<number | null>(null);
  const bh = m.bh ?? [];
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
        <LogToggles logX={lx} logY={ly} set={setLog} />
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
      <XYChart x={bh.map((p) => p[0])} y={bh.map((p) => p[1])} xLabel="H (A/m)" yLabel="B (T)" logX={lx} logY={ly} markers onPoint={setEdit} />
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

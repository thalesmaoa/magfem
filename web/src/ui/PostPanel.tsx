// Resolver (Método de resolução) e Resultados: um grupo por física (mesmo nome) com camadas de visualização.
import { useEffect, useRef, useState } from 'react';
import { q } from '../cad/code';
import { entityLabel, type SketchEditor } from '../cad/editor';
import { lineProfile, probe, quantityLabel, type Solution } from '../cad/solve';
import { addPlot, addTable, addTableItem, addView, duplicateNode, movePlot, removeNode, updateNode, type TreeSel } from '../cad/tree';
import { COLORMAPS, PLOT_KINDS, PLOT_QUANTITIES, type Colormap, type Id, type PhysicsNode, type PlotKind, type PlotQuantity, type PostNode, type ViewNode, type TableNode, type TableItem, TABLE_ITEMS } from '../cad/types';
import { T, useT } from '../i18n';
import { LazyInput } from './common';
import { Icons } from './icons';
import { useEditor } from './useStore';
import { openTab } from './tabsStore';
import { CircuitTable, qLabel, tableItemRows } from './CanvasTabs';
import { findRegion as findRegionP } from '../cad/regions';
import { pointCode } from '../cad/mesh';
import { defaultVarName, LINE_Q, outputsOf, resultVars, safeName, SURF_Q, varNameOf } from '../cad/results';

const PLOT_ICON: Record<PlotKind, JSX.Element> = {
  surface: <span className="plot-ico map" />,
  contour: <span className="plot-ico iso">≋</span>,
  arrow: <span className="plot-ico vec">➚</span>,
  line: Icons.line,
};

const FILTER_ICON = <span className="plot-ico iso">∿</span>;
const TABLE_ICON = <span className="plot-ico iso">▦</span>;
const ITEM_ICON: Record<TableItem, JSX.Element> = { circuits: Icons.circuit, lineint: <span className="plot-ico iso">∫ℓ</span>, surfint: <span className="plot-ico iso">∬</span>, formula: <span className="plot-ico iso">ƒx</span> };

/** Botão (+) com uma lista de escolhas. */
function ChoiceMenu({ label, items }: { label: string; items: { icon: JSX.Element; label: string; note?: string; onClick: () => void }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className="add-menu" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button className="icon-btn tadd" title={label} aria-label={label} aria-expanded={open} onClick={() => setOpen(!open)}>
        +
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-label">{label}</div>
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
            >
              <span className="ticon">{it.icon}</span> {it.label}
              {it.note && <span className="menu-note-inline">{it.note}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Nome padrão da camada: tipo + grandeza (ex.: "Superfície: B"). */
export const plotName = (plot: PlotKind, qty: PlotQuantity) => {
  const t = T();
  return `${t.post.plots[plot]}: ${t.post.qty[qty].split(' —')[0]}`;
};

/** Resolve e seleciona os resultados da física (sem criar vistas: o usuário escolhe o que mostrar). */
export async function solveAndShow(ed: SketchEditor, id: Id, onSelect: (s: TreeSel) => void) {
  if (!(await ed.solve(id))) return;
  const view = ed.sketch.nodes.find((n) => n.kind === 'view' && n.physics === id)?.id;
  onSelect(view ? { kind: 'node', id: view } : { kind: 'results', id });
}

/** Botão ▶ de uma física (linha da árvore). */
export function SolveButton({ ed, id, onSelect }: { ed: SketchEditor; id: Id; onSelect: (s: TreeSel) => void }) {
  const t = useT();
  useEditor(ed);
  return (
    <button
      className="icon-btn"
      title={t.solve.run}
      aria-label={t.solve.run}
      disabled={ed.solveBusy !== null || ed.meshBusy !== null}
      onClick={(e) => {
        e.stopPropagation();
        void solveAndShow(ed, id, onSelect);
      }}
    >
      ▶
    </button>
  );
}

/** Parte das propriedades da física: resolver e estado da solução. */
export function SolveSection({ ed, node, onSelect }: { ed: SketchEditor; node: PhysicsNode; onSelect: (s: TreeSel) => void }) {
  const t = useT();
  useEditor(ed);
  const sol = ed.solutions.get(node.id);
  const err = ed.solveErrors.get(node.id);
  const stale = ed.solutionStale(node.id);
  const nonlinear = ed.sketch.materials.some((m) => m.bh && ed.sketch.regionAssigns.some((a) => a.material === m.id));
  return (
    <section>
      <button className="btn primary" disabled={ed.solveBusy !== null || ed.meshBusy !== null} onClick={() => void solveAndShow(ed, node.id, onSelect)}>
        {ed.solveBusy === node.id ? `${t.solve.running} ${Math.round(ed.solveProgress * 100)}%` : `▶ ${t.solve.run}`}
      </button>
      {ed.solveBusy === node.id && (
        <div className="progress" role="progressbar" aria-valuenow={Math.round(ed.solveProgress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div style={{ width: `${Math.round(ed.solveProgress * 100)}%` }} />
        </div>
      )}
      {err && <p className="err-text">{err}</p>}
      {sol ? (
        <>
          <p className={stale ? 'err-text' : 'muted'}>{stale ? t.solve.stale : t.solve.stats(sol.mesh.elements, sol.ms)}</p>
          <button className="btn secondary" onClick={() => onSelect({ kind: 'results', id: node.id })}>
            {t.solve.goResults}
          </button>
        </>
      ) : (
        !err && <p className="muted">{t.solve.notSolved}</p>
      )}
      {nonlinear && <p className="help-line">{t.solve.linearNote}</p>}
    </section>
  );
}

/** (+) de resultados: escolhe o tipo de gráfico. */
function PlotAddMenu({ label, onPick, onFilter, onCircuits, showLine = false }: { label: string; onPick: (k: PlotKind) => void; onFilter?: () => void; onCircuits?: () => void; showLine?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className="add-menu" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button className="icon-btn tadd" title={label} aria-label={label} aria-expanded={open} onClick={() => setOpen(!open)}>
        +
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-label">{label}</div>
          {PLOT_KINDS.filter((k) => k !== 'line' || showLine).map((k) => (
            <button
              key={k}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onPick(k);
              }}
            >
              <span className="ticon">{PLOT_ICON[k]}</span> {t.post.plots[k]}
              <span className="menu-note-inline">{t.post.plotHelp[k]}</span>
            </button>
          ))}
          {onFilter && (
            <>
              <div className="menu-sep" />
              <button
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onFilter();
                }}
              >
                <span className="ticon">{FILTER_ICON}</span> {t.post.interpMenu}
              </button>
            </>
          )}
          {onCircuits && (
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onCircuits();
              }}
            >
              <span className="ticon">{Icons.circuit}</span> {t.circuit.tableMenu}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Row(p: {
  icon: JSX.Element;
  label: string;
  selected: boolean;
  onClick: () => void;
  extra?: React.ReactNode;
  toggle?: { open: boolean; onToggle: () => void };
  onRename?: (n: string) => void;
  muted?: boolean;
  /** Arrastar (camadas) e soltar (vistas). */
  drag?: string;
  onDropPlot?: (id: string) => void;
}) {
  const t = useT();
  const [renaming, setRenaming] = useState(false);
  const [over, setOver] = useState(false);
  return (
    <div
      className={`tnode${p.selected ? ' on' : ''}${p.muted ? ' dim' : ''}${over ? ' drop' : ''}`}
      role="treeitem"
      aria-selected={p.selected}
      aria-label={p.label}
      onClick={p.onClick}
      draggable={!!p.drag}
      onDragStart={p.drag ? (e) => e.dataTransfer.setData('application/x-magfem-plot', p.drag!) : undefined}
      onDragOver={
        p.onDropPlot
          ? (e) => {
              if (!e.dataTransfer.types.includes('application/x-magfem-plot')) return;
              e.preventDefault();
              setOver(true);
            }
          : undefined
      }
      onDragLeave={p.onDropPlot ? () => setOver(false) : undefined}
      onDrop={
        p.onDropPlot
          ? (e) => {
              setOver(false);
              const id = e.dataTransfer.getData('application/x-magfem-plot');
              if (id) p.onDropPlot!(id);
            }
          : undefined
      }
    >
      {p.toggle ? (
        <button
          className="twisty"
          aria-label={p.toggle.open ? '−' : '+'}
          onClick={(e) => {
            e.stopPropagation();
            p.toggle!.onToggle();
          }}
        >
          {p.toggle.open ? '▾' : '▸'}
        </button>
      ) : (
        <span className="twisty-space" />
      )}
      <span className="ticon">{p.icon}</span>
      {renaming && p.onRename ? (
        <LazyInput autoFocus value={p.label} ariaLabel={t.tree.rename} onCommit={(n) => p.onRename!(n)} onDone={() => setRenaming(false)} />
      ) : (
        <span
          className="tname"
          title={p.onRename ? t.tree.rename : undefined}
          onDoubleClick={(e) => {
            if (!p.onRename) return;
            e.stopPropagation();
            setRenaming(true);
          }}
        >
          {p.label}
        </span>
      )}
      {p.extra}
    </div>
  );
}

/** Resultados na árvore: física (mesmo nome) › vistas (abas) › camadas. */
export function ResultsTree({ ed, sel, onSelect }: { ed: SketchEditor; sel: TreeSel; onSelect: (s: TreeSel) => void }) {
  const t = useT();
  useEditor(ed);
  const [closed, setClosed] = useState<Set<Id>>(new Set());
  const toggle = (id: Id) => setClosed((c) => (c.has(id) ? new Set([...c].filter((x) => x !== id)) : new Set(c).add(id)));
  const openRow = (id: Id) => setClosed((c) => new Set([...c].filter((x) => x !== id)));
  const sk = ed.sketch;
  const physics = sk.nodes.filter((n): n is PhysicsNode => n.kind === 'physics');
  const removeBtn = (id: Id, name: string) => (
    <button
      className="x"
      title={t.tree.remove}
      aria-label={`${t.tree.remove} ${name}`}
      onClick={(e) => {
        e.stopPropagation();
        ed.commit(removeNode(ed.sketch, id), [`r.remove(${q(id)})`]);
      }}
    >
      ×
    </button>
  );
  const copyBtn = (id: Id, name: string) => (
    <button
      className="icon-btn"
      title={t.post.duplicate}
      aria-label={`${t.post.duplicate} ${name}`}
      onClick={(e) => {
        e.stopPropagation();
        const r = duplicateNode(ed.sketch, id);
        if (r && ed.commit(r.sketch, [r.code])) onSelect({ kind: 'node', id: r.node.id });
      }}
    >
      {Icons.copy}
    </button>
  );
  const rename = (id: Id) => (n: string) => n.trim() && ed.commit(updateNode(ed.sketch, id, { name: n.trim() }), [`r.rename(${q(id)}, ${q(n.trim())})`]);
  return (
    <ul role="group">
      {physics.map((ph) => {
        const views = sk.nodes.filter((n): n is ViewNode => n.kind === 'view' && n.physics === ph.id);
        const sol = ed.solutions.get(ph.id);
        return (
          <li key={ph.id}>
            <Row
              icon={Icons.treePhysics}
              label={ph.name}
              selected={sel.kind === 'results' && sel.id === ph.id}
              toggle={{ open: !closed.has(ph.id), onToggle: () => toggle(ph.id) }}
              onClick={() => onSelect({ kind: 'results', id: ph.id })}
              extra={
                <>
                  <span className={`crefs${sol && ed.solutionStale(ph.id) ? ' bad' : ''}`}>{sol ? `${sol.bmax.toPrecision(3)} T` : '—'}</span>
                  <ChoiceMenu
                    label={t.post.newView}
                    items={[
                      {
                        icon: <span className="plot-ico map" />,
                        label: t.table.newView,
                        note: t.table.newViewNote,
                        onClick: () => {
                          const v = addView(ed.sketch, ph.id);
                          const p = addPlot(v.sketch, v.node.id, 'surface', plotName('surface', 'b'), 'b');
                          if (ed.commit(p.sketch, [v.code, p.code])) {
                            openRow(ph.id);
                            onSelect({ kind: 'node', id: v.node.id });
                          }
                        },
                      },
                      {
                        icon: FILTER_ICON,
                        label: t.table.newInterp,
                        note: t.table.newInterpNote,
                        onClick: () => {
                          // Vista interpolada (pai): já vem com superfície B e contorno A.
                          const v = addView(ed.sketch, ph.id, undefined, 3);
                          const a = addPlot(v.sketch, v.node.id, 'surface', plotName('surface', 'b'), 'b');
                          const b = addPlot(a.sketch, v.node.id, 'contour', plotName('contour', 'a'), 'a');
                          if (ed.commit(b.sketch, [v.code, a.code, b.code])) {
                            openRow(ph.id);
                            onSelect({ kind: 'node', id: v.node.id });
                          }
                        },
                      },
                      {
                        icon: Icons.line,
                        label: t.table.newLine,
                        note: t.table.newLineNote,
                        onClick: () => {
                          // Gráfico sobre linha: vista própria com a camada de linha (a curva é escolhida nas propriedades).
                          const v = addView(ed.sketch, ph.id, t.table.lineViewName);
                          const p = addPlot(v.sketch, v.node.id, 'line', plotName('line', 'b'), 'b');
                          if (ed.commit(p.sketch, [v.code, p.code])) {
                            openRow(ph.id);
                            onSelect({ kind: 'node', id: p.node.id });
                          }
                        },
                      },
                      {
                        icon: TABLE_ICON,
                        label: t.table.newTable,
                        note: t.table.newTableNote,
                        onClick: () => {
                          const tb = addTable(ed.sketch, ph.id, t.table.resultsName);
                          if (ed.commit(tb.sketch, [tb.code])) {
                            openRow(ph.id);
                            onSelect({ kind: 'node', id: tb.node.id });
                          }
                        },
                      },
                      {
                        icon: Icons.circuit,
                        label: t.circuit.title,
                        note: t.table.itemHelp.circuits,
                        onClick: () => {
                          const tb = addTable(ed.sketch, ph.id, t.circuit.title);
                          const it = addTableItem(tb.sketch, tb.node.id, 'circuits', t.circuit.title);
                          if (ed.commit(it.sketch, [tb.code, it.code])) {
                            openRow(ph.id);
                            onSelect({ kind: 'node', id: tb.node.id });
                          }
                        },
                      },
                    ]}
                  />
                </>
              }
            />
            {!closed.has(ph.id) && (
              <ul role="group">
                {views.map((v) => {
                  const plots = sk.nodes.filter((n): n is PostNode => n.kind === 'post' && n.view === v.id);
                  return (
                    <li key={v.id}>
                      <Row
                        icon={v.level ? FILTER_ICON : <span className="plot-ico tab" />}
                        label={v.name}
                        selected={sel.kind === 'node' && sel.id === v.id}
                        toggle={{ open: !closed.has(v.id), onToggle: () => toggle(v.id) }}
                        onClick={() => onSelect({ kind: 'node', id: v.id })}
                        onRename={rename(v.id)}
                        onDropPlot={(pid) => {
                          if (ed.commit(movePlot(ed.sketch, pid, v.id), [`r.move(${q(pid)}, ${q(v.id)})`])) {
                            openRow(v.id);
                            onSelect({ kind: 'node', id: pid });
                          }
                        }}
                        extra={
                          <>
                            {v.level ? <span className="crefs">×{v.level}</span> : null}
                            <PlotAddMenu
                              label={t.post.addToView}
                              onPick={(k) => {
                                const p = addPlot(ed.sketch, v.id, k, plotName(k, PLOT_QUANTITIES[k][0]));
                                if (ed.commit(p.sketch, [p.code])) {
                                  openRow(v.id);
                                  onSelect({ kind: 'node', id: p.node.id });
                                }
                              }}
                            />
                            {copyBtn(v.id, v.name)}
                            {removeBtn(v.id, v.name)}
                          </>
                        }
                      />
                      {!closed.has(v.id) && (
                        <ul role="group">
                          {plots.map((p) => (
                            <li key={p.id}>
                              <Row
                                icon={PLOT_ICON[p.plot ?? 'surface']}
                                label={p.name}
                                muted={p.hidden}
                                selected={sel.kind === 'node' && sel.id === p.id}
                                onClick={() => onSelect({ kind: 'node', id: p.id })}
                                onRename={rename(p.id)}
                                drag={p.id}
                                extra={
                                  <>
                                    <button
                                      className="icon-btn"
                                      title={p.hidden ? t.post.show : t.post.hide}
                                      aria-label={`${p.hidden ? t.post.show : t.post.hide} ${p.name}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        ed.commit(updateNode(ed.sketch, p.id, { hidden: !p.hidden }), [`r.show(${q(p.id)}, visible=${p.hidden ? 'True' : 'False'})`]);
                                      }}
                                    >
                                      {p.hidden ? Icons.eyeOff : Icons.eye}
                                    </button>
                                    {copyBtn(p.id, p.name)}
                                    {removeBtn(p.id, p.name)}
                                  </>
                                }
                              />
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
                {sk.nodes
                  .filter((n): n is TableNode => n.kind === 'table' && n.physics === ph.id)
                  .map((tb) => {
                    const items = sk.nodes.filter((n): n is PostNode => n.kind === 'post' && n.view === tb.id);
                    return (
                      <li key={tb.id}>
                        <Row
                          icon={TABLE_ICON}
                          label={tb.name}
                          selected={sel.kind === 'node' && sel.id === tb.id}
                          toggle={{ open: !closed.has(tb.id), onToggle: () => toggle(tb.id) }}
                          onClick={() => onSelect({ kind: 'node', id: tb.id })}
                          onRename={rename(tb.id)}
                          onDropPlot={(pid) => {
                            if (ed.commit(movePlot(ed.sketch, pid, tb.id), [`r.move(${q(pid)}, ${q(tb.id)})`])) onSelect({ kind: 'node', id: pid });
                          }}
                          extra={
                            <>
                              <ChoiceMenu
                                label={t.table.addItem}
                                items={TABLE_ITEMS.filter((k) => k !== 'circuits' || !items.some((x) => x.item === 'circuits')).map((k) => ({
                                  icon: ITEM_ICON[k],
                                  label: t.table.items[k],
                                  note: t.table.itemHelp[k],
                                  onClick: () => {
                                    const r = addTableItem(ed.sketch, tb.id, k, t.table.items[k]);
                                    if (ed.commit(r.sketch, [r.code])) {
                                      openRow(tb.id);
                                      onSelect({ kind: 'node', id: r.node.id });
                                    }
                                  },
                                }))}
                              />
                              {copyBtn(tb.id, tb.name)}
                              {removeBtn(tb.id, tb.name)}
                            </>
                          }
                        />
                        {!closed.has(tb.id) && (
                          <ul role="group">
                            {items.map((it) => (
                              <li key={it.id}>
                                <Row
                                  icon={ITEM_ICON[it.item ?? 'circuits']}
                                  label={it.name}
                                  selected={sel.kind === 'node' && sel.id === it.id}
                                  onClick={() => onSelect({ kind: 'node', id: it.id })}
                                  onRename={rename(it.id)}
                                  drag={it.id}
                                  extra={
                                    <>
                                      {copyBtn(it.id, it.name)}
                                      {removeBtn(it.id, it.name)}
                                    </>
                                  }
                                />
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const fmt = (v: number, unit: string) => {
  const a = Math.abs(v);
  const s = a === 0 ? '0' : a >= 1e4 || a < 1e-3 ? v.toExponential(3) : v.toPrecision(4);
  return `${s} ${unit}`;
};

/** Sonda: valores no ponto clicado. */
function ProbeSection({ ed, sol }: { ed: SketchEditor; sol: Solution }) {
  const t = useT();
  const pr = ed.probeAt ? probe(sol, ed.probeAt) : null;
  const regionName = (i: number) => {
    const r = ed.arrangement().regions[i];
    const a = r ? ed.assignOf({ curves: r.curves, seed: r.label }) : undefined;
    return a?.name ?? t.mesh.region(i + 1);
  };
  return (
    <section>
      <h3>{t.solve.probeHint}</h3>
      {ed.probeAt && !pr && <p className="muted">{t.solve.probeOut}</p>}
      {pr && (
        <>
          <label className="field">
            <span>x, y</span>
            <span className="cval">
              {ed.probeAt!.x.toFixed(3)}, {ed.probeAt!.y.toFixed(3)} mm
            </span>
          </label>
          <label className="field">
            <span>{t.solve.probeRegion}</span>
            <span className="cval">{pr.region >= 0 ? regionName(pr.region) : '—'}</span>
          </label>
          <label className="field">
            <span>|B|</span>
            <span className="cval">{fmt(pr.b, 'T')}</span>
          </label>
          <label className="field">
            <span>{sol.axisymmetric ? 'B_r, B_z' : 'B_x, B_y'}</span>
            <span className="cval">
              {pr.bx.toPrecision(4)}, {pr.by.toPrecision(4)} T
            </span>
          </label>
          <label className="field">
            <span>|H|</span>
            <span className="cval">{fmt(pr.h, 'A/m')}</span>
          </label>
          <label className="field">
            <span>μr</span>
            <span className="cval">{pr.mur.toPrecision(4)}</span>
          </label>
          <label className="field">
            <span>{sol.axisymmetric ? 'ψ = r·A_φ' : 'A_z'}</span>
            <span className="cval">{fmt(pr.A, sol.axisymmetric ? 'Wb/rad' : 'Wb/m')}</span>
          </label>
        </>
      )}
    </section>
  );
}

/** Propriedades do grupo de resultados de uma física. */
export function ResultsProps({ ed, id, onSelect }: { ed: SketchEditor; id: Id; onSelect: (s: TreeSel) => void }) {
  const t = useT();
  useEditor(ed);
  const ph = ed.sketch.nodes.find((n): n is PhysicsNode => n.id === id && n.kind === 'physics');
  const sol = ed.shownSol(id);
  if (!ph) return null;
  return (
    <div className="props-body">
      <section>
        <h3>{ph.name}</h3>
        {!sol ? (
          <>
            <p className="muted">{t.solve.notSolved}</p>
            <button className="btn primary" disabled={ed.solveBusy !== null} onClick={() => void solveAndShow(ed, id, onSelect)}>
              ▶ {t.solve.run}
            </button>
          </>
        ) : (
          <>
            {ed.solutionStale(id) && (
              <>
                <p className="err-text">{t.solve.stale}</p>
                <button className="btn primary" disabled={ed.solveBusy !== null} onClick={() => void solveAndShow(ed, id, onSelect)}>
                  ▶ {t.solve.run}
                </button>
              </>
            )}
            <label className="field">
              <span>{t.solve.bmax}</span>
              <span className="cval">{fmt(sol.bmax, 'T')}</span>
            </label>
            <label className="field">
              <span>{t.solve.energy}</span>
              <span className="cval">{fmt(sol.energy, 'J')}</span>
            </label>
            <p className="help-line">{t.post.add}: +</p>
          </>
        )}
      </section>
      {sol && ed.sketch.circuits.length > 0 && (
        <section>
          <h3>{t.circuit.results}</h3>
          <CircuitTable ed={ed} physics={id} />
          <button className="btn secondary" onClick={() => openTab({ kind: 'circuits', physics: id })}>
            {t.circuit.openTable}
          </button>
        </section>
      )}
      {sol && <ProbeSection ed={ed} sol={sol} />}
    </div>
  );
}

/** Gráfico simples (SVG) de y(s). */
function Chart({ s, y, unit }: { s: number[]; y: number[]; unit: string }) {
  const W = 250, H = 130, L = 40, B = 18;
  const x0 = s[0], x1 = s[s.length - 1];
  let lo = Math.min(...y), hi = Math.max(...y);
  if (lo > 0 && lo < hi * 0.5) lo = 0;
  if (!(hi > lo)) hi = lo + 1;
  const X = (v: number) => L + ((v - x0) / (x1 - x0 || 1)) * (W - L - 6);
  const Y = (v: number) => 6 + (1 - (v - lo) / (hi - lo)) * (H - B - 6);
  const pts = s.map((v, i) => `${X(v).toFixed(1)},${Y(y[i]).toFixed(1)}`).join(' ');
  const tk = (v: number) => (Math.abs(v) >= 1e3 || (Math.abs(v) < 1e-2 && v !== 0) ? v.toExponential(1) : v.toPrecision(3));
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="chart">
      <line x1={L} y1={6} x2={L} y2={H - B} className="axis" />
      <line x1={L} y1={H - B} x2={W - 6} y2={H - B} className="axis" />
      {lo < 0 && hi > 0 && <line x1={L} y1={Y(0)} x2={W - 6} y2={Y(0)} className="zero" />}
      <polyline points={pts} className="curve" />
      <text x={L - 3} y={10} textAnchor="end">{tk(hi)}</text>
      <text x={L - 3} y={H - B} textAnchor="end">{tk(lo)}</text>
      <text x={L} y={H - 4}>0</text>
      <text x={W - 6} y={H - 4} textAnchor="end">
        {tk(x1)} mm
      </text>
      <text x={L + 4} y={H - B - 4} className="unit">
        {unit}
      </text>
    </svg>
  );
}

/** Cores da camada: mapa de cores (superfície), cor sólida ou pela grandeza (contorno/glifos), cor da curva. */
function ColorSection({ node, plot, set }: { node: PostNode; plot: PlotKind; set: (patch: Partial<PostNode>, code: string) => void }) {
  const t = useT();
  const mapSelect = (
    <label className="field">
      <span>{t.post.colormap}</span>
      <select aria-label={t.post.colormap} value={node.colormap ?? 'turbo'} onChange={(e) => set({ colormap: e.target.value as Colormap }, `r.show(${q(node.id)}, colormap=${q(e.target.value)})`)}>
        {COLORMAPS.map((k) => (
          <option key={k} value={k}>
            {t.post.colormaps[k]}
          </option>
        ))}
      </select>
    </label>
  );
  const def = plot === 'line' ? '#e8408a' : '#0d1319';
  const colorInput = (
    <label className="field">
      <span>{t.post.color}</span>
      <input type="color" aria-label={t.post.color} value={node.color ?? def} onChange={(e) => set({ color: e.target.value }, `r.show(${q(node.id)}, color=${q(e.target.value)})`)} />
    </label>
  );
  if (plot === 'surface') return mapSelect;
  if (plot === 'line') return colorInput;
  return (
    <>
      <label className="field check">
        <input
          type="checkbox"
          checked={!!node.colorByValue}
          onChange={(e) => set({ colorByValue: e.target.checked }, `r.show(${q(node.id)}, color_by_value=${e.target.checked ? 'True' : 'False'})`)}
        />
        <span>{t.post.colorByValue}</span>
      </label>
      {node.colorByValue ? mapSelect : colorInput}
    </>
  );
}

/** Propriedades de uma camada de visualização. */
export function PlotProps({ ed, node }: { ed: SketchEditor; node: PostNode }) {
  const t = useT();
  useEditor(ed);
  const sk = ed.sketch;
  const sol = node.physics ? ed.shownSol(node.physics) : undefined;
  const set = (patch: Partial<PostNode>, code: string) => ed.commit(updateNode(sk, node.id, patch), [code]);
  const plot = node.plot ?? 'surface';
  const [picking, setPicking] = useState(false);
  useEffect(() => () => ed.pickLine(null), [ed]);
  const smooth = sk.nodes.some((n) => n.id === node.view && n.kind === 'view' && !!n.level);
  const prof = plot === 'line' && sol && node.curve ? lineProfile(sol, sk, node.curve, 200, smooth) : null;
  const quantity = node.quantity ?? PLOT_QUANTITIES[plot][0];
  const comp = node.component ?? 'mag';
  const vectorQty = quantity === 'b' || quantity === 'h';
  // Trocar a grandeza renomeia a camada se o nome ainda é o padrão.
  const setQuantity = (qq: PlotQuantity) => {
    const patch: Partial<PostNode> = { quantity: qq };
    if (node.name === plotName(plot, quantity)) patch.name = plotName(plot, qq);
    set(patch, `r.show(${q(node.id)}, quantity=${q(qq)})`);
  };
  return (
    <div className="props-body">
      <section>
        <h3>
          {t.post.plots[plot]} <span className="muted">— {t.post.plotHelp[plot]}</span>
        </h3>
        {!sol && <p className="muted">{t.solve.noSolution}</p>}
        <label className="field">
          <span>{t.post.parentView}</span>
          <select
            aria-label={t.post.parentView}
            value={node.view ?? ''}
            onChange={(e) => ed.commit(movePlot(sk, node.id, e.target.value), [`r.move(${q(node.id)}, ${q(e.target.value)})`])}
          >
            {sk.nodes
              .filter((n): n is ViewNode => n.kind === 'view')
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {sk.nodes.find((x) => x.id === v.physics)?.name} · {v.name}
                </option>
              ))}
          </select>
        </label>
        <label className="field">
          <span>{t.post.by[plot]}</span>
          <select aria-label={t.post.by[plot]} value={quantity} onChange={(e) => setQuantity(e.target.value as PlotQuantity)}>
            {PLOT_QUANTITIES[plot].map((k) => (
              <option key={k} value={k}>
                {k === 'a' && sol?.axisymmetric ? 'ψ = r·A_φ' : t.post.qty[k]}
              </option>
            ))}
          </select>
        </label>
        {vectorQty && (plot === 'surface' || plot === 'contour') && (
          <label className="field">
            <span>{t.post.component}</span>
            <select aria-label={t.post.component} value={comp} onChange={(e) => set({ component: e.target.value as PostNode['component'] }, `r.show(${q(node.id)}, component=${q(e.target.value)})`)}>
              {(['mag', 'x', 'y'] as const).map((k) => (
                <option key={k} value={k}>
                  {t.post.comps[k]}
                </option>
              ))}
            </select>
          </label>
        )}
        {(plot === 'surface' || plot === 'contour') && (
          <label className="field">
            <span>{t.post.range}</span>
            <LazyInput
              value={node.range ? `${node.range[0]}; ${node.range[1]}` : ''}
              placeholder={t.post.rangeAuto}
              ariaLabel={t.post.range}
              onCommit={(v) => {
                if (!v.trim()) return set({ range: undefined }, `r.show(${q(node.id)}, range=None)`);
                const [a, b] = v.split(/[;\s]+/).map((x) => Number(x.replace(',', '.')));
                if (!(Number.isFinite(a) && Number.isFinite(b) && b > a)) return ed.flash(t.post.rangeAuto);
                set({ range: [a, b] }, `r.show(${q(node.id)}, range=(${a}, ${b}))`);
              }}
            />
          </label>
        )}
        <ColorSection node={node} plot={plot} set={set} />
        {plot === 'contour' && (
          <label className="field">
            <span>{t.solve.nLines}</span>
            <LazyInput
              value={String(node.nLines ?? 20)}
              ariaLabel={t.solve.nLines}
              onCommit={(v) => {
                const n = Math.round(Number(v));
                if (!(n >= 2 && n <= 200)) return ed.flash('2 – 200');
                set({ nLines: n }, `r.show(${q(node.id)}, n_lines=${n})`);
              }}
            />
          </label>
        )}
        {plot === 'arrow' && (
          <>
            <label className="field">
              <span>{t.post.spacing}</span>
              <LazyInput
                value={node.spacing ? String(node.spacing) : ''}
                placeholder={sol ? `auto (${(sol.meshSize * 1.5).toPrecision(3)})` : 'auto'}
                ariaLabel={t.post.spacing}
                onCommit={(v) => {
                  const n = Number(v.replace(',', '.'));
                  set({ spacing: v.trim() && n > 0 ? n : undefined }, `r.show(${q(node.id)}, spacing=${v.trim() && n > 0 ? n : 'None'})`);
                }}
              />
            </label>
            <label className="field">
              <span>{t.post.scale}</span>
              <LazyInput
                value={String(node.scale ?? 1)}
                ariaLabel={t.post.scale}
                onCommit={(v) => {
                  const n = Number(v.replace(',', '.'));
                  if (!(n > 0)) return ed.flash(t.msg.positive);
                  set({ scale: n }, `r.show(${q(node.id)}, scale=${n})`);
                }}
              />
            </label>
          </>
        )}
        {plot === 'line' && (
          <>
            <label className="field">
              <span>{t.post.curve}</span>
              <span className="cval">{node.curve && sk.entities[node.curve] ? entityLabel(sk, node.curve) : '—'}</span>
            </label>
            <button
              className={`btn${picking ? ' secondary' : ''}`}
              onClick={() => {
                if (picking) {
                  ed.pickLine(null);
                  setPicking(false);
                  return;
                }
                setPicking(true);
                ed.pickLine((id) => {
                  setPicking(false);
                  set({ curve: id }, `r.show(${q(node.id)}, curve=${q(id)})`);
                });
              }}
            >
              {picking ? t.post.picking : t.post.pickCurve}
            </button>
            {!node.curve && <p className="help-line">{t.post.noCurve}</p>}
            {node.curve && sol && !prof && <p className="muted">{t.post.outside}</p>}
            {prof && (
              <>
                <button className="btn secondary" onClick={() => openTab({ kind: 'chart', plot: node.id })}>
                  {t.post.openChart}
                </button>
                <Chart s={prof.s} y={prof[quantity as 'b' | 'bn' | 'bt' | 'h' | 'a']} unit={quantityLabel(quantity, 'mag', sol!.axisymmetric).replace(/^.*\(/, '').replace(')', '')} />
                <label className="field">
                  <span>{t.post.flux}</span>
                  <span className="cval strong">{fmt(prof.flux, 'Wb')}</span>
                </label>
                <label className="field">
                  <span>{t.post.bAvg}</span>
                  <span className="cval">{fmt(prof.bAvg, 'T')}</span>
                </label>
                <label className="field">
                  <span>{t.post.bMax}</span>
                  <span className="cval">{fmt(prof.bMax, 'T')}</span>
                </label>
                <label className="field">
                  <span>{t.post.length}</span>
                  <span className="cval">{prof.length.toPrecision(4)} mm</span>
                </label>
                <p className="help-line">{t.post.fluxHint}</p>
              </>
            )}
          </>
        )}
      </section>
      {sol && plot !== 'line' && <ProbeSection ed={ed} sol={sol} />}
    </div>
  );
}

/** Vista interpolada: subdivisões por aresta. */
export function InterpSection({ ed, view }: { ed: SketchEditor; view: ViewNode }) {
  const t = useT();
  useEditor(ed);
  if (!view.level) return null;
  const sol = ed.solutions.get(view.physics);
  const n = view.level;
  return (
    <div className="props-body">
      <section>
        <h3>{view.name}</h3>
        <label className="field">
          <span>{t.post.level}</span>
          <LazyInput
            value={String(n)}
            ariaLabel={t.post.level}
            onCommit={(v) => {
              const k = Math.round(Number(v));
              if (!(k >= 1 && k <= 6)) return ed.flash('1 – 6');
              ed.commit(updateNode(ed.sketch, view.id, { level: k }), [`r.show(${q(view.id)}, level=${k})`]);
            }}
          />
        </label>
        {sol && <p className="muted">{t.post.filterStats(sol.mesh.elements * n * n)}</p>}
        <p className="help-line">{t.post.interpHelp}</p>
      </section>
    </div>
  );
}

/** Propriedades de um item de tabela (curva da integral de linha, regiões da integral de superfície). */
export function TableItemProps({ ed, node }: { ed: SketchEditor; node: PostNode }) {
  const t = useT();
  useEditor(ed);
  const sk = ed.sketch;
  const [picking, setPicking] = useState(false);
  useEffect(() => () => ed.pickLine(null), [ed]);
  const set = (patch: Partial<PostNode>, code: string) => ed.commit(updateNode(sk, node.id, patch), [code]);
  const arr = ed.arrangement();
  const chosen = new Set((node.regions ?? []).map((k) => findRegionP(arr, k)?.index).filter((x): x is number => x !== undefined));
  const rows = tableItemRows(ed, node);
  const sol = node.physics ? ed.shownSol(node.physics) : undefined;
  const vars = sol && node.physics ? resultVars(sk, arr, sol, node.physics) : null;
  return (
    <div className="props-body">
      <section>
        <h3>{t.table.items[node.item ?? 'circuits']}</h3>
        {node.item !== 'circuits' && (
          <label className="field">
            <span>{t.table.varName}</span>
            <LazyInput
              value={node.varName ?? ''}
              placeholder={defaultVarName(sk, node)}
              ariaLabel={t.table.varName}
              onCommit={(v) => set({ varName: v.trim() ? safeName(v.trim()) : undefined }, `r.show(${q(node.id)}, var_name=${v.trim() ? q(safeName(v.trim())) : 'None'})`)}
            />
          </label>
        )}
        {node.item === 'formula' && (
          <>
            <label className="field">
              <span>{t.table.expr}</span>
              <LazyInput value={node.expr ?? ''} placeholder="400 * S1_intA / S1_area * depth_m" ariaLabel={t.table.expr} onCommit={(v) => set({ expr: v.trim() || undefined }, `r.show(${q(node.id)}, expr=${q(v.trim())})`)} />
            </label>
            <label className="field">
              <span>{t.table.unitLabel}</span>
              <LazyInput value={node.unitLabel ?? ''} placeholder="Wb" ariaLabel={t.table.unitLabel} onCommit={(v) => set({ unitLabel: v.trim() || undefined }, `r.show(${q(node.id)}, unit_label=${q(v.trim())})`)} />
            </label>
            <p className="help-line">{t.table.formulaHelp}</p>
          </>
        )}
        {node.item === 'lineint' && (
          <>
            <label className="field">
              <span>{t.post.curve}</span>
              <span className="cval">{node.curve && sk.entities[node.curve] ? entityLabel(sk, node.curve) : '—'}</span>
            </label>
            <button
              className={`btn${picking ? ' secondary' : ''}`}
              onClick={() => {
                if (picking) {
                  ed.pickLine(null);
                  setPicking(false);
                  return;
                }
                // A escolha acontece no desenho de uma vista: abre a primeira vista da física.
                const v = sk.nodes.find((n) => n.kind === 'view' && n.physics === node.physics);
                if (v) openTab({ kind: 'view', id: v.id });
                setPicking(true);
                ed.pickLine((id) => {
                  setPicking(false);
                  set({ curve: id }, `r.show(${q(node.id)}, curve=${q(id)})`);
                  openTab({ kind: 'table', id: node.view! });
                });
              }}
            >
              {picking ? t.post.picking : t.post.pickCurve}
            </button>
          </>
        )}
        {node.item === 'surfint' && (
          <fieldset className="region-pick">
            <legend>{t.table.pickRegions}</legend>
            {arr.regions.map((r) => {
              const a = ed.assignOf({ curves: r.curves, seed: r.label });
              const label = a?.name ?? t.mesh.region(r.index + 1);
              return (
                <label key={r.index} className="field check">
                  <input
                    type="checkbox"
                    checked={chosen.has(r.index)}
                    onChange={(e) => {
                      const keys = arr.regions.filter((x) => (x.index === r.index ? e.target.checked : chosen.has(x.index))).map((x) => ({ curves: x.curves, seed: x.label }));
                      set({ regions: keys }, `r.show(${q(node.id)}, regions=[${keys.map((k) => pointCode(k.seed)).join(', ')}])`);
                    }}
                  />
                  <span>{label}</span>
                </label>
              );
            })}
          </fieldset>
        )}
        {(node.item === 'surfint' || node.item === 'lineint') && (
          <fieldset className="region-pick outputs">
            <legend>{t.table.outputs}</legend>
            {(node.item === 'surfint' ? SURF_Q : LINE_Q).map(({ q: qk }) => {
              const outs = outputsOf(sk, node);
              const o = outs.find((x) => x.q === qk);
              const setOuts = (next: { q: string; name: string }[], code: string) => set({ outputs: next }, code);
              return (
                <div key={qk} className="out-row">
                  <label className="field check">
                    <input
                      type="checkbox"
                      checked={!!o}
                      onChange={(e) => {
                        const next = e.target.checked ? [...outs, { q: qk, name: `${varNameOf(sk, node)}_${qk}` }] : outs.filter((x) => x.q !== qk);
                        setOuts(next, `r.show(${q(node.id)}, outputs=[${next.map((x) => `(${q(x.q)}, ${q(x.name)})`).join(', ')}])`);
                      }}
                    />
                    <span>{qLabel(qk)}</span>
                  </label>
                  {o && (
                    <LazyInput
                      value={o.name}
                      ariaLabel={`${qLabel(qk)}: ${t.table.varName}`}
                      onCommit={(v) => {
                        const name = safeName(v.trim() || o.name);
                        const next = outs.map((x) => (x.q === qk ? { ...x, name } : x));
                        setOuts(next, `r.show(${q(node.id)}, outputs=[${next.map((x) => `(${q(x.q)}, ${q(x.name)})`).join(', ')}])`);
                      }}
                    />
                  )}
                </div>
              );
            })}
          </fieldset>
        )}
        {node.item === 'circuits' && <p className="help-line">{t.circuit.help}</p>}
        {rows.msg && <p className="muted">{rows.msg}</p>}
        {rows.rows.length > 0 && (
          <table className="circ-table kv">
            <tbody>
              {rows.rows.map(([k, v]) => (
                <tr key={k}>
                  <th>{k}</th>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {node.item === 'formula' && vars && (
          <details className="var-list" open>
            <summary>{t.table.available}</summary>
            <table className="circ-table kv">
              <tbody>
                {vars.list.map((v) => (
                  <tr key={v.name}>
                    <th>
                      <code>{v.name}</code>
                    </th>
                    <td>
                      {v.value.toPrecision(5)} {v.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
        {node.view && (
          <button className="btn secondary" onClick={() => openTab({ kind: 'table', id: node.view! })}>
            {t.circuit.openTable}
          </button>
        )}
      </section>
    </div>
  );
}

// Resolver (Método de resolução) e Resultados: mapa de |B|, linhas de fluxo, energia e sonda.
import { q } from '../cad/code';
import type { SketchEditor } from '../cad/editor';
import { probe } from '../cad/solve';
import { addNode, updateNode, type TreeSel } from '../cad/tree';
import type { Id, PhysicsNode, PostNode } from '../cad/types';
import { T, useT } from '../i18n';
import { LazyInput } from './common';
import { useEditor } from './useStore';

/** Resolve e, se deu certo, abre o primeiro nó de Resultados (cria um se não houver). */
export async function solveAndShow(ed: SketchEditor, id: Id, onSelect: (s: TreeSel) => void) {
  if (!(await ed.solve(id))) return;
  let postId = ed.sketch.nodes.find((n) => n.kind === 'post')?.id;
  if (!postId) {
    const r = addNode(ed.sketch, 'post', T().tree.addPost);
    if (!ed.commit(r.sketch, [r.code])) return;
    postId = r.node.id;
  }
  onSelect({ kind: 'node', id: postId });
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
        {ed.solveBusy === node.id ? t.solve.running : `▶ ${t.solve.run}`}
      </button>
      {err && <p className="err-text">{err}</p>}
      {sol ? (
        <>
          <p className={stale ? 'err-text' : 'muted'}>{stale ? t.solve.stale : t.solve.stats(sol.mesh.elements, sol.ms)}</p>
          <button
            className="btn secondary"
            onClick={() => {
              const post = ed.sketch.nodes.find((n) => n.kind === 'post');
              if (post) onSelect({ kind: 'node', id: post.id });
              else void solveAndShow(ed, node.id, onSelect);
            }}
          >
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

const fmt = (v: number, unit: string) => {
  const a = Math.abs(v);
  const s = a === 0 ? '0' : a >= 1e4 || a < 1e-3 ? v.toExponential(3) : v.toPrecision(4);
  return `${s} ${unit}`;
};

/** Propriedades de um nó de Resultados. */
export function PostProps({ ed, node }: { ed: SketchEditor; node: PostNode }) {
  const t = useT();
  useEditor(ed);
  const physics = ed.sketch.nodes.find((n) => n.kind === 'physics');
  const sol = physics ? ed.solutions.get(physics.id) : undefined;
  const set = (patch: Partial<PostNode>, code: string) => ed.commit(updateNode(ed.sketch, node.id, patch), [code]);
  const pr = sol && ed.probeAt ? probe(sol, ed.probeAt) : null;
  const regionName = (i: number) => {
    const r = ed.arrangement().regions[i];
    const a = r ? ed.assignOf({ curves: r.curves, seed: r.label }) : undefined;
    return a?.name ?? t.mesh.region(i + 1);
  };
  return (
    <div className="props-body">
      <section>
        <h3>
          {t.tree.postProps}: {node.name}
        </h3>
        {!sol ? (
          <p className="muted">{t.solve.noSolution}</p>
        ) : (
          <>
            {physics && ed.solutionStale(physics.id) && <p className="err-text">{t.solve.stale}</p>}
            <label className="field">
              <span>{t.solve.bmax}</span>
              <span className="cval">{fmt(sol.bmax, 'T')}</span>
            </label>
            <label className="field">
              <span>{t.solve.energy}</span>
              <span className="cval">{fmt(sol.energy, 'J')}</span>
            </label>
            <label className="field check">
              <input type="checkbox" checked={node.map ?? true} onChange={(e) => set({ map: e.target.checked }, `r.show(${q(node.id)}, map=${e.target.checked ? 'True' : 'False'})`)} />
              <span>{t.solve.map}</span>
            </label>
            <label className="field check">
              <input type="checkbox" checked={node.lines ?? true} onChange={(e) => set({ lines: e.target.checked }, `r.show(${q(node.id)}, lines=${e.target.checked ? 'True' : 'False'})`)} />
              <span>{t.solve.lines}</span>
            </label>
            {(node.lines ?? true) && (
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
          </>
        )}
      </section>
      {sol && (
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
      )}
    </div>
  );
}

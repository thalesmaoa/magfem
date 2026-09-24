import { LazyInput } from './common';
import { q } from '../cad/code';
import type { SketchEditor } from '../cad/editor';
import { asLength, DISPLAY_UNITS, evaluate, evaluateVariables, type LengthUnit } from '../cad/expr';
import type { ProblemType, Settings } from '../cad/types';
import { useT } from '../i18n';
import { useDocVersion, useEditor } from './useStore';

function ProblemPanel({ ed }: { ed: SketchEditor }) {
  const t = useT();
  const sk = ed.sketch;
  const st = sk.settings;
  const set = (patch: Partial<Settings>, code: string) => ed.commit({ ...sk, settings: { ...st, ...patch } }, [code]);
  const { values } = evaluateVariables(sk.variables, st.unit);
  let depthErr: string | null = null;
  try {
    if (!(asLength(evaluate(st.depth, { env: values, unit: st.unit }), st.unit) > 0)) depthErr = t.msg.positive;
  } catch (e) {
    depthErr = (e as Error).message;
  }
  return (
    <section>
      <h3>{t.problem.title}</h3>
      <label className="field">
        <span>{t.problem.unit}</span>
        <select value={st.unit} onChange={(e) => set({ unit: e.target.value as LengthUnit }, `g.units(${q(e.target.value)})`)}>
          {DISPLAY_UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>{t.problem.type}</span>
        <select value={st.problem} onChange={(e) => set({ problem: e.target.value as ProblemType }, `g.problem(${q(e.target.value)})`)}>
          <option value="planar">{t.problem.planar}</option>
          <option value="axisymmetric">{t.problem.axisymmetric}</option>
        </select>
      </label>
      {st.problem === 'planar' && (
        <label className="field">
          <span>{t.problem.depth}</span>
          <LazyInput value={st.depth} className={depthErr ? 'bad' : ''} onCommit={(v) => set({ depth: v.trim() }, `g.problem("planar", depth=${q(v.trim())})`)} />
          {depthErr && (
            <span className="err" title={depthErr}>
              !
            </span>
          )}
        </label>
      )}
    </section>
  );
}

/** Gaveta da direita (oculta por padrão): configurações do Problema. */
export function RightDrawer({ ed, open, onToggle }: { ed: SketchEditor; open: boolean; onToggle: () => void }) {
  const t = useT();
  useDocVersion(ed.doc);
  useEditor(ed);
  return (
    <aside className={`drawer${open ? ' open' : ''}`}>
      <button className="drawer-tab" onClick={onToggle} aria-expanded={open} aria-label={open ? t.drawer.close : t.drawer.open} title={open ? t.drawer.close : t.drawer.open}>
        <span>{open ? '›' : '‹'}</span>
        <span className="drawer-tab-label">{t.problem.title}</span>
      </button>
      {open && (
        <div className="drawer-body side">
          <ProblemPanel ed={ed} />
        </div>
      )}
    </aside>
  );
}

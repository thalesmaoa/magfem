import { LazyInput } from './common';
import { q } from '../cad/code';
import type { SketchEditor } from '../cad/editor';
import { asLength, DISPLAY_UNITS, evaluate, evaluateVariables, type LengthUnit } from '../cad/expr';
import type { ProblemType, Settings } from '../cad/types';
import { AboutPanel } from './AboutPanel';
import { PanelResizer } from './PanelResizer';
import { useT } from '../i18n';
import { useDocVersion, useEditor } from './useStore';
import { setDrawer, useDrawer, type DrawerTab } from './drawerStore';
import { BoundaryLibrary, MaterialLibrary } from './Libraries';

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

/** Gaveta da direita (oculta por padrão): Problema e bibliotecas de materiais e contornos. */
export function RightDrawer({ ed, open, onToggle }: { ed: SketchEditor; open: boolean; onToggle: () => void }) {
  const t = useT();
  useDocVersion(ed.doc);
  useEditor(ed);
  const d = useDrawer();
  const tabs: [DrawerTab, string][] = [
    ['problem', t.problem.title],
    ['materials', t.mesh.libMaterials],
    ['boundaries', t.mesh.libBoundaries],
  ];
  return (
    <aside className={`drawer${open ? ' open' : ''}`}>
      {/* Faixa vertical da direita: "Problema e bibliotecas" e, abaixo, "Sobre". */}
      <div className="drawer-strip">
        <button
          className={`drawer-tab${open && d.tab !== 'about' ? ' on' : ''}`}
          onClick={() => (d.tab === 'about' ? setDrawer({ open: true, tab: 'problem', focus: null }) : onToggle())}
          aria-expanded={open && d.tab !== 'about'}
          aria-label={open ? t.drawer.close : t.drawer.open}
          title={open ? t.drawer.close : t.drawer.open}
        >
          <span>{open && d.tab !== 'about' ? '›' : '‹'}</span>
          <span className="drawer-tab-label">{t.drawer.open}</span>
        </button>
        <button
          className={`drawer-tab about-tab${open && d.tab === 'about' ? ' on' : ''}`}
          onClick={() => (open && d.tab === 'about' ? setDrawer({ open: false }) : setDrawer({ open: true, tab: 'about', focus: null }))}
          aria-expanded={open && d.tab === 'about'}
          title={t.about.button}
        >
          <span className="drawer-tab-label">{t.about.button}</span>
        </button>
      </div>
      {open && <PanelResizer side="right" />}
      {open && (
        <div className="drawer-body side">
          {/* As abas são de "Problema e bibliotecas"; o Sobre ocupa o painel sozinho. */}
          {d.tab !== 'about' && (
            <div className="drawer-tabs" role="tablist">
              {tabs.map(([k, label]) => (
                <button key={k} role="tab" aria-selected={d.tab === k} className={d.tab === k ? 'on' : ''} onClick={() => setDrawer({ tab: k, focus: null })}>
                  {label}
                </button>
              ))}
            </div>
          )}
          {d.tab === 'problem' && <ProblemPanel ed={ed} />}
          {d.tab === 'materials' && <MaterialLibrary ed={ed} focus={d.focus} onFocus={(id) => setDrawer({ focus: id })} />}
          {d.tab === 'about' && <AboutPanel />}
          {d.tab === 'boundaries' && <BoundaryLibrary ed={ed} focus={d.focus} onFocus={(id) => setDrawer({ focus: id })} />}
        </div>
      )}
    </aside>
  );
}

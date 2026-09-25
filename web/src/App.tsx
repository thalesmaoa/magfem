import { useCallback, useEffect, useRef, useState } from 'react';
import logo from './assets/magfem-logo.png';
import planegcsWasm from '@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm?url';
import { q } from './cad/code';
import { SketchDoc } from './cad/doc';
import { SketchEditor } from './cad/editor';
import { formatLength } from './cad/expr';
import { initSolver } from './cad/solver';
import { isMeshSel, type TreeSel } from './cad/tree';
import type { PostNode } from './cad/types';
import { emptySketch } from './cad/types';
import { setLang, T, useLang, useT, type Lang } from './i18n';
import { hasFsAccess, loadDraft, openProject, parse, saveDraft, saveProject, serialize } from './io/project';
import { download, toDXF, toSVG } from './io/export';
import { Icons } from './ui/icons';
import { setThemePref, useThemePref, type ThemePref } from './theme';
import { PanelResizer, useSavedPanelWidths } from './ui/PanelResizer';
import { CiteDialog } from './ui/CiteDialog';
import { DimInput } from './ui/DimInput';
import { HistoryConsole } from './ui/HistoryConsole';
import { PopoutWindow } from './ui/PopoutWindow';
import { ModelTree } from './ui/ModelTree';
import { RightDrawer } from './ui/RightDrawer';
import { setDrawer, useDrawer } from './ui/drawerStore';
import { activateTab, openTab, pruneTabs, useTabs } from './ui/tabsStore';
import { CanvasTabBar, ChartPane, LegendModal } from './ui/CanvasTabs';
import { TabToolbar } from './ui/TabToolbar';
import { SchematicPane } from './ui/SchematicPane';
import { chartImage, chartSVG, tabCSV } from './ui/chartExport';
import { Toolbar } from './ui/Toolbar';
import { LazyInput } from './ui/common';
import { useDocVersion, useEditor } from './ui/useStore';
import { solver } from './worker/client';

type Handle = Awaited<ReturnType<typeof saveProject>> extends infer R ? (R extends { handle: infer H } ? H : null) : null;

export default function App() {
  const t = useT();
  // useState (não useMemo): o hot reload recria memos, e um doc novo e vazio sobrescreveria o rascunho.
  const [doc] = useState(() => new SketchDoc());
  // Só grava o rascunho depois que ele foi lido para este doc.
  const draftLoaded = useRef<SketchDoc | null>(null);
  const [ready, setReady] = useState<'loading' | 'ok' | string>('loading');
  const [ed, setEd] = useState<SketchEditor | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [name, setName] = useState<string>(() => T().app.untitled);
  const handleRef = useRef<Handle>(null);
  const [savedVersion, setSavedVersion] = useState(0);
  const version = useDocVersion(doc);
  const [core, setCore] = useState<{ v?: string; err?: string }>({});
  const [treeSel, setTreeSel] = useState<TreeSel>({ kind: 'geometry' });
  const drawer = useDrawer().open;
  const [consoleOpen, setConsoleOpen] = useState(true);
  const [consolePopped, setConsolePopped] = useState(false);
  const [consoleHeight, setConsoleHeightState] = useState<number>(() => {
    try {
      return Number(localStorage.getItem('magfem-console-height')) || 210;
    } catch {
      return 210;
    }
  });
  const setConsoleHeight = (h: number) => {
    setConsoleHeightState(h);
    try {
      localStorage.setItem('magfem-console-height', String(Math.round(h)));
    } catch {
      // sem localStorage: vale só nesta sessão
    }
  };
  const [citing, setCiting] = useState(false);
  useSavedPanelWidths();
  const [renaming, setRenaming] = useState(false);

  // Malha (seção, material, contorno ou nó de malha) troca o canvas para o modo malha.
  const meshMode = ed ? isMeshSel(treeSel, ed.sketch) : false;
  // Abas do canvas: a seleção na árvore abre/ativa a aba certa (vista de resultados ou Desenho).
  const tabs = useTabs();
  useEffect(() => {
    if (!ed) return;
    const node = treeSel.kind === 'node' ? ed.sketch.nodes.find((n) => n.id === treeSel.id) : undefined;
    const view =
      node?.kind === 'view' ? node.id : node?.kind === 'post' && !node.item ? node.view : treeSel.kind === 'results' ? ed.sketch.nodes.find((n) => n.kind === 'view' && n.physics === treeSel.id)?.id : undefined;
    if (node?.kind === 'schematic') return openTab({ kind: 'sch', id: node.id });
    // Tabela de resultados (ou item dela): aba da tabela.
    const table = node?.kind === 'table' ? node.id : node?.kind === 'post' && node.item ? node.view : undefined;
    if (table) openTab({ kind: 'table', id: table });
    else if (view) openTab({ kind: 'view', id: view });
    else if (!(treeSel.kind === 'results')) activateTab('draw');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ed, treeSel]);
  // Abas cujo alvo sumiu são fechadas.
  useEffect(() => {
    if (!ed) return;
    pruneTabs((t) =>
      t.kind === 'view' ? ed.sketch.nodes.some((n) => n.id === t.id && n.kind === 'view') : t.kind === 'chart' ? ed.sketch.nodes.some((n) => n.id === t.plot) : t.kind === 'bh' ? ed.sketch.materials.some((m) => m.id === t.material && m.bh) : t.kind === 'circuits' ? ed.sketch.nodes.some((n) => n.id === t.physics) : t.kind === 'table' ? ed.sketch.nodes.some((n) => n.id === t.id && n.kind === 'table') : t.kind === 'sch' ? ed.sketch.nodes.some((n) => n.id === t.id && n.kind === 'schematic') : true,
    );
  }, [ed, version]);
  const activeView = tabs.active.startsWith('view:') ? tabs.active.slice(5) : null;
  const viewNode = ed && activeView ? ed.sketch.nodes.find((n) => n.id === activeView && n.kind === 'view') : undefined;
  const layersKey = ed && activeView ? JSON.stringify([viewNode, ed.sketch.nodes.filter((n) => n.kind === 'post' && n.view === activeView)]) : '';
  useEffect(() => {
    ed?.setMode(activeView ? 'post' : meshMode ? 'mesh' : 'sketch');
  }, [ed, meshMode, activeView]);
  useEffect(() => {
    if (!ed || !viewNode || viewNode.kind !== 'view') return;
    const layers = ed.sketch.nodes.filter((n): n is PostNode => n.kind === 'post' && n.view === viewNode.id && !n.hidden);
    ed.showSolution(viewNode.physics, layers, viewNode.level ?? 0, viewNode.id, viewNode.legend);
  }, [ed, viewNode, layersKey]);
  // Nó de malha selecionado: mostra os triângulos dele.
  const shownMesh = ed && treeSel.kind === 'node' && ed.sketch.nodes.some((n) => n.id === treeSel.id && n.kind === 'mesh') ? treeSel.id : null;
  useEffect(() => {
    ed?.showMesh(shownMesh);
  }, [ed, shownMesh, treeSel]);

  // Solver de restrições + rascunho salvo.
  useEffect(() => {
    (async () => {
      try {
        await initSolver(planegcsWasm);
        const draft = await loadDraft();
        if (draft) {
          try {
            doc.reset(parse(draft.text));
            setName(draft.name);
          } catch {
            // Rascunho ilegível: guarda uma cópia antes de começar vazio.
            await saveDraft({ ...draft, name: `${draft.name} (ilegível)`, savedAt: 0 });
            doc.reset(emptySketch());
          }
        } else doc.reset(emptySketch());
        draftLoaded.current = doc;
        setSavedVersion(doc.version);
        setReady('ok');
      } catch (e) {
        setReady(T().app.solverFail(String(e)));
      }
    })();
    solver
      .call<string>({ cmd: 'version' })
      .then((v) => setCore({ v }))
      .catch((e) => setCore({ err: String(e) }));
  }, [doc]);

  useEffect(() => {
    if (ready !== 'ok' || !canvasRef.current) return;
    const editor = new SketchEditor(canvasRef.current, doc);
    editor.fit();
    setEd(editor);
    if (import.meta.env.DEV) (window as unknown as { __magfem: unknown }).__magfem = editor;
    return () => editor.dispose();
  }, [ready, doc]);

  // Rascunho automático (debounce).
  useEffect(() => {
    if (ready !== 'ok' || draftLoaded.current !== doc) return;
    const h = setTimeout(() => saveDraft({ name, text: serialize(doc.sketch), savedAt: Date.now() }), 400);
    return () => clearTimeout(h);
  }, [version, name, ready, doc]);

  const dirty = version !== savedVersion;

  const save = useCallback(
    async (as: boolean) => {
      try {
        const r = await saveProject(doc.sketch, name, as ? null : handleRef.current);
        if (!r) return;
        handleRef.current = r.handle;
        setName(r.name.replace(/\.magfem$/, ''));
        setSavedVersion(doc.version);
        ed?.flash(hasFsAccess ? T().file.savedTo(r.name) : T().file.downloadedAs(r.name));
      } catch (e) {
        ed?.flash(T().file.saveError(String(e)));
      }
    },
    [doc, name, ed],
  );

  const open = useCallback(async () => {
    try {
      const f = await openProject();
      if (!f) return;
      doc.load(f.sketch, [`open(${q(f.name)})`]);
      handleRef.current = f.handle;
      setName(f.name.replace(/\.magfem$/, ''));
      setSavedVersion(doc.version);
      ed?.fit();
    } catch (e) {
      ed?.flash(T().file.openError(String(e)));
    }
  }, [doc, ed]);

  const newDoc = useCallback(() => {
    doc.load(emptySketch(), ['new()']);
    handleRef.current = null;
    setName(T().app.untitled);
    setSavedVersion(doc.version);
    ed?.fit();
    ed?.flash(T().file.newDone);
  }, [doc, ed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 's') {
        e.preventDefault();
        save(e.shiftKey);
      } else if (k === 'o') {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save, open]);

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">
          <img src={logo} alt="" width={24} height={24} />
          MagFEM
        </span>
        <span className="fname" title={t.file.renameHint}>
          {renaming ? (
            <LazyInput
              autoFocus
              value={name}
              className="fname-input"
              ariaLabel={t.file.projectName}
              onDone={() => setRenaming(false)}
              onCommit={(v) => {
                const n = v.trim().replace(/\.magfem$/, '');
                if (n) setName(n);
              }}
            />
          ) : (
            <span className="fname-text" onDoubleClick={() => setRenaming(true)}>
              {name}
            </span>
          )}
          {dirty && (
            <span className="dirty" title={t.file.unsaved}>
              ●
            </span>
          )}
        </span>
        <nav className="filemenu">
          <button onClick={newDoc} title={t.file.new}>
            {Icons.newFile}
            <span>{t.file.new}</span>
          </button>
          <button onClick={open} title={`${t.file.open} (Ctrl+O)`}>
            {Icons.openFile}
            <span>{t.file.open}</span>
          </button>
          <button onClick={() => save(false)} title={`${t.file.saveHint} (Ctrl+S)`}>
            {Icons.save}
            <span>{t.file.save}</span>
          </button>
          <button onClick={() => save(true)} title={`${t.file.saveAs} (Ctrl+Shift+S)`}>
            {Icons.saveAs}
            <span>{t.file.saveAs}</span>
          </button>
          {ed && <ExportMenu ed={ed} name={name} />}
          <span className="sep" />
          <button onClick={() => setCiting(true)}>{t.cite.button}</button>
          <LangSwitch />
          <ThemeSwitch />
        </nav>
      </header>
      {ed && tabs.active === 'draw' && (treeSel.kind === 'geometry' || treeSel.kind === 'var') ? (
        <Toolbar ed={ed} />
      ) : ed && tabs.active !== 'draw' ? (
        <TabToolbar ed={ed} tab={tabs.active} name={name} />
      ) : (
        <div className="toolbar" />
      )}
      <main className={`work${drawer ? ' drawer-open' : ''}`}>
        {ed ? <ModelTree ed={ed} sel={treeSel} onSelect={setTreeSel} name={name} /> : <aside className="side left" />}
        <PanelResizer side="left" />
        <div className="center">
          {ed && <CanvasTabBar ed={ed} onSelect={setTreeSel} />}
          <div className="canvas-wrap">
            <canvas ref={canvasRef} className="sketch" tabIndex={0} />
            {ed && (tabs.active.startsWith('chart:') || tabs.active.startsWith('bh:') || tabs.active.startsWith('circuits:') || tabs.active.startsWith('table:')) && <ChartPane ed={ed} tab={tabs.active} />}
            {ed && <LegendModal ed={ed} />}
            {ed && tabs.active.startsWith('sch:') && (
              <div className="chart-pane sch-host">
                <SchematicPane ed={ed} id={tabs.active.slice(4)} />
              </div>
            )}
            {ed && <DimInput ed={ed} />}
            {ready !== 'ok' && <div className="overlay">{ready === 'loading' ? t.app.loading : ready}</div>}
            {ed && <StageOverlay ed={ed} sel={treeSel} />}
          </div>
          {ed && !consolePopped && (
            <HistoryConsole
              ed={ed}
              open={consoleOpen}
              onToggle={() => setConsoleOpen(!consoleOpen)}
              height={consoleHeight}
              onResize={setConsoleHeight}
              popped={false}
              onPopout={() => setConsolePopped(true)}
              onDock={() => setConsolePopped(false)}
            />
          )}
          {ed && consolePopped && (
            <PopoutWindow title={t.console.windowTitle} onClose={() => setConsolePopped(false)}>
              <HistoryConsole
                ed={ed}
                open
                onToggle={() => undefined}
                height={0}
                onResize={() => undefined}
                popped
                onPopout={() => undefined}
                onDock={() => setConsolePopped(false)}
              />
            </PopoutWindow>
          )}
        </div>
        {ed ? <RightDrawer ed={ed} open={drawer} onToggle={() => setDrawer({ open: !drawer })} /> : <aside className="drawer" />}
      </main>
      {ed ? <StatusBar ed={ed} core={core} /> : <footer className="status" />}
      {citing && <CiteDialog onClose={() => setCiting(false)} />}
    </div>
  );
}

/** Exportar: SVG e DXF (geometria em mm) ou PNG/JPG (imagem do desenho). */
function ExportMenu({ ed, name }: { ed: SketchEditor; name: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);
  const tabs = useTabs();
  // Abas de gráfico/tabela exportam o próprio gráfico (e os dados em CSV).
  const chartTab = tabs.active.startsWith('chart:') || tabs.active.startsWith('bh:') || tabs.active.startsWith('circuits:');
  const hasChart = tabs.active.startsWith('chart:') || tabs.active.startsWith('bh:');
  const run = async (kind: 'svg' | 'dxf' | 'png' | 'jpg' | 'csv') => {
    setOpen(false);
    try {
      if (chartTab) {
        const base = `${name}-${tabs.active.replace(':', '-')}`;
        if (kind === 'csv') {
          const csv = tabCSV(ed, tabs.active);
          if (csv) download(`${base}.csv`, new Blob([csv], { type: 'text/csv' }));
        } else if (kind === 'svg') {
          const svg = chartSVG();
          if (svg) download(`${base}.svg`, new Blob([svg], { type: 'image/svg+xml' }));
        } else if (kind === 'png' || kind === 'jpg') download(`${base}.${kind}`, await chartImage(kind === 'png' ? 'image/png' : 'image/jpeg'));
        return;
      }
      if (kind === 'svg') download(`${name}.svg`, new Blob([toSVG(ed.sketch)], { type: 'image/svg+xml' }));
      else if (kind === 'dxf') download(`${name}.dxf`, new Blob([toDXF(ed.sketch)], { type: 'application/dxf' }));
      else if (kind === 'png' || kind === 'jpg') download(`${name}.${kind}`, await ed.exportImage(kind === 'png' ? 'image/png' : 'image/jpeg'));
    } catch (e) {
      ed.flash(T().file.saveError(String(e)));
    }
  };
  return (
    <div className="add-menu export-menu" ref={ref}>
      <button onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu" title={t.file.exportHint}>
        {Icons.exportFile}
        <span>{t.file.export}</span>
      </button>
      {open && (
        <div className="menu" role="menu">
          {chartTab ? (
            <>
              {hasChart && (
                <>
                  <button role="menuitem" onClick={() => run('svg')}>
                    SVG <span className="muted">— {t.file.exportChart}</span>
                  </button>
                  <button role="menuitem" onClick={() => run('png')}>
                    PNG <span className="muted">— {t.file.exportChart}</span>
                  </button>
                  <button role="menuitem" onClick={() => run('jpg')}>
                    JPG <span className="muted">— {t.file.exportChart}</span>
                  </button>
                  <hr />
                </>
              )}
              <button role="menuitem" onClick={() => run('csv')}>
                CSV <span className="muted">— {t.file.exportCsv}</span>
              </button>
            </>
          ) : (
            <>
              <button role="menuitem" onClick={() => run('svg')}>
                SVG <span className="muted">— {t.file.exportSvg}</span>
              </button>
              <button role="menuitem" onClick={() => run('dxf')}>
                DXF <span className="muted">— {t.file.exportDxf}</span>
              </button>
              <hr />
              <button role="menuitem" onClick={() => run('png')}>
                PNG <span className="muted">— {tabs.active.startsWith('view:') ? t.file.exportView : t.file.exportImg}</span>
              </button>
              <button role="menuitem" onClick={() => run('jpg')}>
                JPG <span className="muted">— {tabs.active.startsWith('view:') ? t.file.exportView : t.file.exportImg}</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Malha e pós ainda não existem: aviso sobre o canvas quando um desses nós está selecionado. */
function StageOverlay({ ed }: { ed: SketchEditor; sel: TreeSel }) {
  const t = useT();
  useDocVersion(ed.doc);
  useEditor(ed);
  const tabs = useTabs();
  if (!tabs.active.startsWith('view:')) return null;
  const v = ed.sketch.nodes.find((n) => n.id === tabs.active.slice(5));
  if (!v || v.kind !== 'view' || ed.solutions.has(v.physics)) return null;
  return <div className="overlay soon">{t.solve.noSolution}</div>;
}

/** Barra de progresso do cálculo (rodapé). */
function SolveProgress({ ed }: { ed: SketchEditor }) {
  const t = useT();
  useEditor(ed);
  if (!ed.solveBusy && !ed.meshBusy) return null;
  const pct = ed.meshBusy ? null : Math.round(ed.solveProgress * 100);
  return (
    <span className="solve-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined} aria-label={t.solve.running}>
      <span className="bar">
        <span className={`fill${pct === null ? ' indet' : ''}`} style={pct === null ? undefined : { width: `${pct}%` }} />
      </span>
      {ed.meshBusy ? t.mesh.generating : `${t.solve.running} ${pct}%`}
    </span>
  );
}

/** Tema: automático (segue o sistema) → claro → escuro. */
function ThemeSwitch() {
  const t = useT();
  const pref = useThemePref();
  const next: Record<ThemePref, ThemePref> = { auto: 'light', light: 'dark', dark: 'auto' };
  const label = `${t.theme.title}: ${t.theme[pref]}`;
  return (
    <button className="theme-btn" onClick={() => setThemePref(next[pref])} title={label} aria-label={label}>
      {pref === 'dark' ? Icons.moon : pref === 'light' ? Icons.sun : Icons.themeAuto}
    </button>
  );
}

function LangSwitch() {
  const current = useLang();
  return (
    <span className="lang" role="group" aria-label="Idioma / Language">
      {(['pt', 'en'] as Lang[]).map((l) => (
        <button key={l} className={current === l ? 'on' : ''} aria-pressed={current === l} onClick={() => setLang(l)}>
          {l.toUpperCase()}
        </button>
      ))}
    </span>
  );
}

function StatusBar({ ed, core }: { ed: SketchEditor; core: { v?: string; err?: string } }) {
  const snap = useEditor(ed);
  const t = useT();
  useDocVersion(ed.doc);
  const [polar, setPolar] = useState(false);
  const n = Object.keys(ed.sketch.entities).length - 1;
  const dof = ed.doc.dof;
  const u = ed.unit;
  const axi = ed.sketch.settings.problem === 'axisymmetric';
  const { x, y } = snap.cursor;
  const coords = polar
    ? `ρ ${formatLength(Math.hypot(x, y), u)} · θ ${((Math.atan2(y, x) * 180) / Math.PI).toFixed(2).replace('.', ',')}°`
    : `${axi ? 'r' : 'x'} ${formatLength(x, u)} · ${axi ? 'z' : 'y'} ${formatLength(y, u)}`;
  return (
    <footer className="status">
      <button className="coords" title={t.status.toggleCoords} onClick={() => setPolar(!polar)}>
        {coords}
      </button>
      <span className={dof === 0 && n > 0 ? 'ok' : n > 0 ? 'dof-open' : ''} title={n > 0 && dof > 0 ? t.status.dofHint : undefined}>{n === 0 ? t.status.empty : dof === 0 ? t.status.defined : t.status.dof(dof)}</span>
      {n > 0 && (
        <span className="legend" title={t.status.dofHint}>
          <i className="sw free" /> {t.status.legendFree} <i className="sw def" /> {t.status.legendDefined}
        </span>
      )}
      <span className="hint">{snap.message ? <span className="msg">{snap.message}</span> : snap.hint}</span>
      {ed && <SolveProgress ed={ed} />}
      <a className="gh-link" href="https://github.com/thalesmaoa/magfem/issues" target="_blank" rel="noopener noreferrer" title={t.status.github}>
        {Icons.github} Bug reports
      </a>
      <span className="core" title={core.v ? `core ${core.v}` : undefined}>
        {core.err ? (
          t.status.coreError(core.err)
        ) : core.v ? (
          <>
            {t.status.core(core.v)} <b className="core-ok">Loaded</b>
          </>
        ) : (
          t.status.coreLoading
        )}
      </span>
    </footer>
  );
}

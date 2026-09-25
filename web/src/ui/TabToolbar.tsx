// Barra superior das abas que não são o Desenho: vista (ajustar, tempo/animação) e gráficos (escala log).
import { useEffect, useRef, useState } from 'react';
import type { SketchEditor } from '../cad/editor';
import { download } from '../io/export';
import { useT } from '../i18n';
import { LineHead, LogToggles, setChartLog, useChartLog } from './CanvasTabs';
import { Icons } from './icons';
import { deleteSelected, flipSelected, rotateSelected, schResult, setSchUi, useSchUi } from './SchematicPane';
import { useEditor } from './useStore';

export function TabToolbar({ ed, tab, name }: { ed: SketchEditor; tab: string; name: string }) {
  if (tab.startsWith('view:')) return <ViewToolbar ed={ed} name={name} />;
  if (tab.startsWith('chart:') || tab.startsWith('bh:')) return <ChartToolbar ed={ed} tab={tab} />;
  if (tab.startsWith('sch:')) return <SchToolbar ed={ed} id={tab.slice(4)} />;
  return <div className="toolbar" />;
}

function ChartToolbar({ ed, tab }: { ed: SketchEditor; tab: string }) {
  const [lx, ly] = useChartLog(tab);
  return (
    <div className="toolbar tab-toolbar">
      {tab.startsWith('chart:') && (
        <>
          <LineHead ed={ed} id={tab.slice(6)} />
          <span className="sep" />
        </>
      )}
      <LogToggles logX={lx} logY={ly} set={(x, y) => setChartLog(tab, x, y)} />
    </div>
  );
}

function ViewToolbar({ ed, name }: { ed: SketchEditor; name: string }) {
  const t = useT();
  useEditor(ed);
  const sol = ed.shownSolution ? ed.solutions.get(ed.shownSolution) : undefined;
  const n = sol?.times?.length ?? 0;
  const [playing, setPlaying] = useState(false);
  const [recording, setRecording] = useState(false);
  // Quadros por segundo da animação (e do vídeo exportado); lembrado entre sessões.
  const [fps, setFpsState] = useState<number>(() => {
    try {
      return Number(localStorage.getItem('magfem-anim-fps')) || 10;
    } catch {
      return 10;
    }
  });
  const setFps = (v: number) => {
    setFpsState(v);
    try {
      localStorage.setItem('magfem-anim-fps', String(v));
    } catch {
      // ignora
    }
  };
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (!playing || !n) return;
    timer.current = window.setInterval(() => ed.setFrame((ed.postFrame + 1) % n), 1000 / fps);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [playing, n, ed, fps]);
  const fmtT = (s: number) => (s < 1e-3 ? `${(s * 1e6).toPrecision(3)} µs` : s < 1 ? `${(s * 1e3).toPrecision(4)} ms` : `${s.toPrecision(4)} s`);
  const record = async () => {
    // Grava o canvas passo a passo (WebM via MediaRecorder).
    const canvas = document.querySelector('canvas.sketch') as HTMLCanvasElement | null;
    if (!canvas || !n || typeof MediaRecorder === 'undefined') return;
    setPlaying(false);
    setRecording(true);
    const stream = canvas.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm' });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise<void>((ok) => (rec.onstop = () => ok()));
    rec.start();
    for (let k = 0; k < n; k++) {
      ed.setFrame(k);
      await new Promise((r) => setTimeout(r, 1000 / fps));
    }
    rec.stop();
    await done;
    download(`${name}-animacao.webm`, new Blob(chunks, { type: 'video/webm' }));
    setRecording(false);
  };
  return (
    <div className="toolbar tab-toolbar">
      <button className="icon-btn" title={t.tools.fit} aria-label={t.tools.fit} onClick={() => ed.fit()}>
        {Icons.fit}
      </button>
      {n > 0 && (
        <>
          <span className="sep" />
          <button className="icon-btn" title={t.solve.play} aria-label={playing ? t.solve.pause : t.solve.play} onClick={() => setPlaying(!playing)} disabled={recording}>
            {playing ? '⏸' : '▶'}
          </button>
          <input
            type="range"
            className="time-slider"
            aria-label="t"
            min={0}
            max={n - 1}
            value={Math.min(ed.postFrame, n - 1)}
            onChange={(e) => ed.setFrame(Number(e.target.value))}
          />
          <span className="time-label">{t.solve.frame(Math.min(ed.postFrame, n - 1) + 1, n, fmtT(sol!.times![Math.min(ed.postFrame, n - 1)]))}</span>
          <label className="fps-pick" title={t.solve.fpsHint(n, fps)}>
            <select aria-label={t.solve.fps} value={fps} onChange={(e) => setFps(Number(e.target.value))}>
              {[1, 2, 5, 10, 20, 30, 60].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
            <span>{t.solve.fps}</span>
          </label>
          <button className="btn secondary" onClick={() => void record()} disabled={recording}>
            {recording ? t.solve.recording : t.solve.exportAnim}
          </button>
        </>
      )}
    </div>
  );
}

/** Barra do esquemático: girar, espelhar, apagar, ajustar vista e (com resultado) o passo de tempo. */
function SchToolbar({ ed, id }: { ed: SketchEditor; id: string }) {
  const t = useT();
  useEditor(ed);
  const ui = useSchUi();
  const r = schResult(ed, id);
  const n = r?.times.length ?? 0;
  return (
    <div className="toolbar tab-toolbar">
      <button className="icon-btn" title={t.sch.rotate} aria-label={t.sch.rotate} onClick={() => rotateSelected(ed)}>
        {Icons.rotate}
      </button>
      <button className="icon-btn" title={t.sch.flip} aria-label={t.sch.flip} onClick={() => flipSelected(ed)}>
        {Icons.mirror}
      </button>
      <button className="icon-btn" title={t.sch.del} aria-label={t.sch.del} onClick={() => deleteSelected(ed)}>
        {Icons.trash}
      </button>
      <button className="icon-btn" title={t.tools.fit} aria-label={t.tools.fit} onClick={() => setSchUi({ zoom: 1, px: 0, py: 0 })}>
        {Icons.fit}
      </button>
      {n > 0 && (
        <>
          <span className="sep" />
          <input type="range" className="time-slider" aria-label="t" min={0} max={n - 1} value={Math.min(ui.frame, n - 1)} onChange={(e) => setSchUi({ frame: Number(e.target.value) })} />
          <span className="time-label">{t.solve.frame(Math.min(ui.frame, n - 1) + 1, n, `${(r!.times[Math.min(ui.frame, n - 1)] * 1e3).toPrecision(4)} ms`)}</span>
        </>
      )}
    </div>
  );
}

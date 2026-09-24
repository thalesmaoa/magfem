import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { SketchEditor } from '../cad/editor';
import { asAngle, asLength, evaluate, evaluateVariables } from '../cad/expr';
import type { MirrorAxis } from '../cad/patterns';
import { isCurve } from '../cad/types';
import { useT } from '../i18n';
import { Icons } from './icons';
import { Btn } from './Toolbar';
import { useEditor } from './useStore';

type Mode = 'offset' | 'mirror' | 'linear' | 'circular';

/** Avalia o texto (número na unidade atual, "2 mm", ou expressão com variáveis). */
function useEval(ed: SketchEditor) {
  return {
    len: (src: string) => {
      const sk = ed.sketch;
      const ctx = { env: evaluateVariables(sk.variables, sk.settings.unit).values, unit: sk.settings.unit };
      return asLength(evaluate(src.trim() || '0', ctx), sk.settings.unit);
    },
    ang: (src: string) => {
      const sk = ed.sketch;
      const ctx = { env: evaluateVariables(sk.variables, sk.settings.unit).values, unit: sk.settings.unit };
      return asAngle(evaluate(src.trim() || '0', ctx));
    },
    withUnit: (src: string, unit: string) => (/^[-+]?[\d.,]+$/.test(src.trim()) ? `${src.trim().replace(',', '.')} ${unit}` : src.trim()),
  };
}

function Field(props: { label: string; value: string; onChange: (v: string) => void; suffix?: string; onEnter: () => void }) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <input value={props.value} spellCheck={false} onChange={(e) => props.onChange(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && props.onEnter()} />
      <span className="suffix">{props.suffix ?? ''}</span>
    </label>
  );
}

function OffsetForm({ ed, done }: { ed: SketchEditor; done: () => void }) {
  const t = useT();
  const ev = useEval(ed);
  const [d, setD] = useState('2');
  const [flip, setFlip] = useState(false);
  const apply = () => {
    try {
      const v = ev.len(d) * (flip ? -1 : 1);
      const text = ev.withUnit(d, ed.unit);
      if (ed.offsetSelection(v, flip ? `-(${text})` : text)) done();
    } catch (e) {
      ed.flash((e as Error).message);
    }
  };
  return (
    <>
      <Field label={t.offset.distance} value={d} onChange={setD} suffix={ed.unit} onEnter={apply} />
      <label className="check">
        <input type="checkbox" checked={flip} onChange={(e) => setFlip(e.target.checked)} /> {t.offset.flip}
      </label>
      <p className="help-line">{t.offset.hint}</p>
      <button className="btn" onClick={apply}>
        {t.offset.apply}
      </button>
    </>
  );
}

function MirrorForm({ ed, done }: { ed: SketchEditor; done: () => void }) {
  const t = useT();
  const snap = useEditor(ed);
  // Linha do eixo: escolhida no desenho, ou a última linha que estava selecionada.
  const selLine = [...snap.selection].reverse().find((id) => ed.sketch.entities[id]?.type === 'line');
  const [picked, setPicked] = useState<string | null>(selLine ?? null);
  const [axis, setAxis] = useState<'x' | 'y' | 'line'>(selLine ? 'line' : 'y');
  const picking = !!ed.picking;
  useEffect(() => () => ed.pickLine(null), [ed]); // fechar o painel cancela a escolha
  const apply = () => {
    const a: MirrorAxis = axis === 'line' && picked ? picked : axis === 'line' ? 'y' : axis;
    if (ed.mirrorSelection(a)) done();
  };
  const pick = () =>
    ed.pickLine((id) => {
      setPicked(id);
      setAxis('line');
    });
  return (
    <>
      <label className="field">
        <span>{t.patterns.axis}</span>
        <select value={axis} onChange={(e) => setAxis(e.target.value as 'x' | 'y' | 'line')}>
          <option value="x">{t.patterns.axisX}</option>
          <option value="y">{t.patterns.axisY}</option>
          <option value="line" disabled={!picked}>
            {t.patterns.axisLine}
            {picked ? ` (${picked})` : ''}
          </option>
        </select>
      </label>
      <button className={`btn secondary${picking ? ' on' : ''}`} onClick={() => (picking ? ed.pickLine(null) : pick())}>
        {picking ? t.patterns.pickCancel : t.patterns.pickButton}
      </button>
      <button className="btn" onClick={apply} disabled={picking}>
        {t.patterns.apply}
      </button>
    </>
  );
}

function LinearForm({ ed, done }: { ed: SketchEditor; done: () => void }) {
  const t = useT();
  const ev = useEval(ed);
  const [nx, setNx] = useState('3');
  const [ny, setNy] = useState('1');
  const [dx, setDx] = useState('20');
  const [dy, setDy] = useState('20');
  const apply = () => {
    try {
      if (ed.linearArraySelection(Math.round(Number(nx)), Math.round(Number(ny)), ev.len(dx), ev.len(dy), { dx: ev.withUnit(dx, ed.unit), dy: ev.withUnit(dy, ed.unit) })) done();
    } catch (e) {
      ed.flash((e as Error).message);
    }
  };
  return (
    <>
      <Field label={t.patterns.countX} value={nx} onChange={setNx} onEnter={apply} />
      <Field label={t.patterns.stepX} value={dx} onChange={setDx} suffix={ed.unit} onEnter={apply} />
      <Field label={t.patterns.countY} value={ny} onChange={setNy} onEnter={apply} />
      <Field label={t.patterns.stepY} value={dy} onChange={setDy} suffix={ed.unit} onEnter={apply} />
      <button className="btn" onClick={apply}>
        {t.patterns.apply}
      </button>
    </>
  );
}

function CircularForm({ ed, done }: { ed: SketchEditor; done: () => void }) {
  const t = useT();
  const ev = useEval(ed);
  const snap = useEditor(ed);
  const centerPoint = [...snap.selection].reverse().find((id) => ed.sketch.entities[id]?.type === 'point');
  const [n, setN] = useState('6');
  const [ang, setAng] = useState('360');
  const [center, setCenter] = useState<'origin' | 'point'>('origin');
  const apply = () => {
    try {
      const sk = ed.sketch;
      const pc = center === 'point' && centerPoint && sk.entities[centerPoint] ? centerPoint : { x: 0, y: 0 };
      if (ed.circularArraySelection(Math.round(Number(n)), ev.ang(ang), pc, /^[-+]?[\d.,]+$/.test(ang.trim()) ? `${ang.trim()} deg` : ang.trim())) done();
    } catch (e) {
      ed.flash((e as Error).message);
    }
  };
  return (
    <>
      <Field label={t.patterns.count} value={n} onChange={setN} onEnter={apply} />
      <Field label={t.patterns.angle} value={ang} onChange={setAng} suffix="°" onEnter={apply} />
      <label className="field">
        <span>{t.patterns.center}</span>
        <select value={center} onChange={(e) => setCenter(e.target.value as 'origin' | 'point')}>
          <option value="origin">{t.patterns.centerOrigin}</option>
          <option value="point" disabled={!centerPoint}>
            {centerPoint ?? '—'}
          </option>
        </select>
      </label>
      <button className="btn" onClick={apply}>
        {t.patterns.apply}
      </button>
    </>
  );
}

function Popover({ title, onClose, children, stay }: { title: string; onClose: () => void; children: ReactNode; stay?: () => boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (stay?.()) return;
      if (!ref.current?.contains(el) && !el.closest('[data-modify-btn]')) onClose();
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !stay?.() && onClose();
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [onClose, stay]);
  return (
    <div className="popover" ref={ref} role="dialog" aria-label={title}>
      <h4>{title}</h4>
      <div className="transform">{children}</div>
    </div>
  );
}

/** Grupo "modificar" da barra: offset, espelhar, padrão linear e circular. */
export function ModifyTools({ ed }: { ed: SketchEditor }) {
  const t = useT();
  const snap = useEditor(ed);
  const [open, setOpen] = useState<Mode | null>(null);
  const sk = ed.sketch;
  const anySel = snap.selection.some((id) => sk.entities[id] || sk.groups.some((g) => g.id === id));
  const curves = ed.selectedEntities.some((id) => isCurve(sk.entities[id]));
  useEffect(() => {
    if (!anySel) setOpen(null);
  }, [anySel]);
  const items: { mode: Mode; icon: JSX.Element; label: string; kbd?: string; enabled: boolean; form: ReactNode }[] = [
    { mode: 'offset', icon: Icons.offset, label: t.offset.tool, kbd: 'O', enabled: curves, form: <OffsetForm ed={ed} done={() => setOpen(null)} /> },
    { mode: 'mirror', icon: Icons.mirror, label: t.patterns.mirror, enabled: anySel, form: <MirrorForm ed={ed} done={() => setOpen(null)} /> },
    { mode: 'linear', icon: Icons.arrayLinear, label: t.patterns.linear, enabled: anySel, form: <LinearForm ed={ed} done={() => setOpen(null)} /> },
    { mode: 'circular', icon: Icons.arrayCircular, label: t.patterns.circular, enabled: anySel, form: <CircularForm ed={ed} done={() => setOpen(null)} /> },
  ];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key !== 'o' || e.ctrlKey || e.metaKey || e.altKey || ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) return;
      if (curves) setOpen('offset');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [curves]);
  // Padrões linear e circular num botão só (como retângulo e linha): mostra o último usado.
  const [lastPattern, setLastPattern] = useState<'linear' | 'circular'>('linear');
  const [menuOpen, setMenuOpen] = useState(false);
  const single = items.filter((it) => it.mode === 'offset' || it.mode === 'mirror');
  const patterns = items.filter((it) => it.mode === 'linear' || it.mode === 'circular');
  const shown = patterns.find((p) => p.mode === lastPattern)!;
  const current = open ? items.find((it) => it.mode === open) : null;
  return (
    <>
      {single.map((it) => (
        <span key={it.mode} className="tb-anchor" data-modify-btn>
          <Btn icon={it.icon} label={it.label} kbd={it.kbd} disabled={!it.enabled} active={open === it.mode} onClick={() => setOpen(open === it.mode ? null : it.mode)} />
          {open === it.mode && (
            <Popover title={it.label} onClose={() => setOpen(null)} stay={() => !!ed.picking}>
              {it.form}
            </Popover>
          )}
        </span>
      ))}
      <span className="tb-anchor tb-family" data-modify-btn>
        <Btn
          icon={shown.icon}
          label={shown.label}
          disabled={!shown.enabled}
          active={open === 'linear' || open === 'circular'}
          onClick={() => setOpen(open === shown.mode ? null : shown.mode)}
        />
        <button
          className={`tb-caret${menuOpen ? ' open' : ''}`}
          aria-label={`${shown.label}: ${t.tools.variants}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          disabled={!shown.enabled}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
            <path d="M1 2.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.3" />
          </svg>
        </button>
        {menuOpen && (
          <div className="menu tool-menu" role="menu" onMouseLeave={() => setMenuOpen(false)}>
            {patterns.map((p) => (
              <button
                key={p.mode}
                role="menuitem"
                className={p.mode === lastPattern ? 'on' : ''}
                onClick={() => {
                  setLastPattern(p.mode as 'linear' | 'circular');
                  setMenuOpen(false);
                  setOpen(p.mode);
                }}
              >
                <span className="mi-icon">{p.icon}</span>
                <span className="mi-label">{p.label}</span>
              </button>
            ))}
          </div>
        )}
        {current && (current.mode === 'linear' || current.mode === 'circular') && (
          <Popover title={current.label} onClose={() => setOpen(null)}>
            {current.form}
          </Popover>
        )}
      </span>
    </>
  );
}

/** Simetria entre dois pontos: escolhe o eixo (X, Y ou uma linha clicada no desenho). */
export function SymmetryPopover({ ed, p1, p2, onClose }: { ed: SketchEditor; p1: string; p2: string; onClose: () => void }) {
  const t = useT();
  useEditor(ed);
  const [axis, setAxis] = useState<'x' | 'y' | 'line'>('y');
  const [picked, setPicked] = useState<string | null>(null);
  const picking = !!ed.picking;
  useEffect(() => () => ed.pickLine(null), [ed]);
  const apply = () => {
    ed.symmetricPoints(p1, p2, axis === 'line' && picked ? picked : axis === 'line' ? 'y' : axis);
    onClose();
  };
  return (
    <Popover title={t.patterns.symmetryTitle} onClose={onClose} stay={() => !!ed.picking}>
      <label className="field">
        <span>{t.patterns.axis}</span>
        <select value={axis} onChange={(e) => setAxis(e.target.value as 'x' | 'y' | 'line')}>
          <option value="x">{t.patterns.axisX}</option>
          <option value="y">{t.patterns.axisY}</option>
          <option value="line" disabled={!picked}>
            {t.patterns.axisLine}
            {picked ? ` (${picked})` : ''}
          </option>
        </select>
      </label>
      <button
        className={`btn secondary${picking ? ' on' : ''}`}
        onClick={() =>
          picking
            ? ed.pickLine(null)
            : ed.pickLine((id) => {
                setPicked(id);
                setAxis('line');
              })
        }
      >
        {picking ? t.patterns.pickCancel : t.patterns.pickButton}
      </button>
      <button className="btn" onClick={apply} disabled={picking}>
        {t.patterns.apply}
      </button>
    </Popover>
  );
}

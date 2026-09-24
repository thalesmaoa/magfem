import { useEffect, useRef, useState } from 'react';
import type { SketchEditor } from '../cad/editor';
import { asAngle, asLength, evaluate, evaluateVariables } from '../cad/expr';
import { selectionCenter } from '../cad/ops';
import type { Id } from '../cad/types';
import { useT } from '../i18n';

/** Mover / girar a seleção (valores aceitam expressões e variáveis). */
export function TransformForm({ ed, ids, onDone }: { ed: SketchEditor; ids: Id[]; onDone?: () => void }) {
  const t = useT();
  const [dx, setDx] = useState('0');
  const [dy, setDy] = useState('0');
  const [ang, setAng] = useState('0');
  const [pivot, setPivot] = useState<'center' | 'origin'>('center');
  const apply = () => {
    const sk = ed.sketch;
    const unit = sk.settings.unit;
    const { values } = evaluateVariables(sk.variables, unit);
    const ctx = { env: values, unit };
    try {
      const x = asLength(evaluate(dx || '0', ctx), unit);
      const y = asLength(evaluate(dy || '0', ctx), unit);
      const a = asAngle(evaluate(ang || '0', ctx));
      const p = pivot === 'center' ? selectionCenter(sk, ids) : { x: 0, y: 0 };
      const withUnit = (s: string) => (/^[-+]?[\d.,]+$/.test(s.trim()) ? `${s.trim().replace(',', '.')} ${unit}` : s);
      if (ed.transform(ids, { dx: x, dy: y, angle: a, pivot: p }, { dx: withUnit(dx), dy: withUnit(dy), angle: /^[-+]?[\d.,]+$/.test(ang.trim()) ? `${ang.trim().replace(',', '.')} deg` : ang })) onDone?.();
    } catch (e) {
      ed.flash(t.sel.transformError((e as Error).message));
    }
  };
  const field = (label: string, v: string, set: (s: string) => void, suffix: string) => (
    <label className="field">
      <span>{label}</span>
      <input value={v} onChange={(e) => set(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && apply()} spellCheck={false} />
      <span className="suffix">{suffix}</span>
    </label>
  );
  return (
    <div className="transform">
      
      {field(t.sel.dx, dx, setDx, ed.unit)}
      {field(t.sel.dy, dy, setDy, ed.unit)}
      {field(t.sel.angle, ang, setAng, '°')}
      <label className="field">
        <span>{t.sel.pivot}</span>
        <select value={pivot} onChange={(e) => setPivot(e.target.value as 'center' | 'origin')}>
          <option value="center">{t.sel.pivotCenter}</option>
          <option value="origin">{t.sel.pivotOrigin}</option>
        </select>
      </label>
      <button className="btn" onClick={apply}>
        {t.sel.apply}
      </button>
    </div>
  );
}


/** Popover do botão "Mover / girar" da barra de ferramentas. */
export function TransformPopover({ ed, ids, onClose }: { ed: SketchEditor; ids: Id[]; onClose: () => void }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (!ref.current?.contains(el) && !el.closest('[data-transform-btn]')) onClose();
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [onClose]);
  return (
    <div className="popover" ref={ref} role="dialog" aria-label={t.sel.transform}>
      <h4>{t.sel.transform}</h4>
      <TransformForm ed={ed} ids={ids} onDone={onClose} />
    </div>
  );
}

// "Script local": conecta a página à ponte Python (python -m magfem) com a porta e a chave de pareamento.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { connectBridge, disconnectBridge, useBridge } from '../bridge/client';
import type { SketchEditor } from '../cad/editor';
import { useT } from '../i18n';

export function BridgeButton({ ed }: { ed: SketchEditor }) {
  const t = useT();
  const b = useBridge();
  const [open, setOpen] = useState(false);
  const [port, setPort] = useState(String(b.port));
  const [key, setKey] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && !pop.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);
  const label = b.status === 'on' ? t.bridge.on(b.count) : b.status === 'connecting' ? t.bridge.connecting : t.bridge.button;
  return (
    <div className="bridge" ref={ref}>
      <button className={`bridge-btn ${b.status}`} onClick={() => setOpen(!open)} aria-expanded={open} title={t.bridge.hint}>
        <span className="dot" aria-hidden="true" /> {label}
      </button>
      {open &&
        createPortal(
        <div
          ref={pop}
          className="bridge-pop"
          role="dialog"
          aria-label={t.bridge.button}
          style={(() => {
            // Acima do botão (a barra de status corta o que passa dos limites dela).
            const r = ref.current?.getBoundingClientRect();
            return r ? { bottom: window.innerHeight - r.top + 8, right: Math.max(8, window.innerWidth - r.right) } : undefined;
          })()}
        >
          <p className="help-line">{t.bridge.howto}</p>
          <code className="bridge-cmd">python -m magfem</code>
          {b.status === 'on' ? (
            <>
              <p>{t.bridge.connected(b.port)}</p>
              <button className="btn secondary" onClick={() => disconnectBridge()}>
                {t.bridge.disconnect}
              </button>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                connectBridge(ed, Number(port) || 8765, key);
              }}
            >
              <label className="field">
                <span>{t.bridge.port}</span>
                <input id="bridge-port" aria-label={t.bridge.port} value={port} onChange={(e) => setPort(e.target.value)} inputMode="numeric" />
              </label>
              <label className="field">
                <span>{t.bridge.key}</span>
                <input id="bridge-key" aria-label={t.bridge.key} value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" />
              </label>
              {b.status === 'error' && <p className="err-text">{b.message}</p>}
              <button className="btn" type="submit" disabled={!key.trim()}>
                {t.bridge.connect}
              </button>
            </form>
          )}
        </div>,
          document.body,
        )}
    </div>
  );
}

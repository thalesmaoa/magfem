// Botão "exportar código" ao lado de Modelo: mostra o script da API que recria o modelo.
import { useState } from 'react';
import type { SketchEditor } from '../cad/editor';
import { generateScript } from '../cad/script';
import { download } from '../io/export';
import { useT } from '../i18n';
import { Icons } from './icons';

export function ScriptExportButton({ ed, name }: { ed: SketchEditor; name: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const script = open ? generateScript(ed.sketch, name) : '';
  return (
    <>
      <button className="icon-btn" title={t.script.button} aria-label={t.script.button} onClick={() => setOpen(true)}>
        {Icons.code}
      </button>
      {open && (
        <div className="modal-back fixed" onClick={() => setOpen(false)}>
          <div className="modal script-modal" role="dialog" aria-label={t.script.title} onClick={(e) => e.stopPropagation()}>
            <h3>{t.script.title}</h3>
            <p className="help-line">{t.script.help}</p>
            <textarea readOnly aria-label={t.script.title} value={script} spellCheck={false} />
            <div className="modal-actions">
              <span className="muted">{t.script.lines(script.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#')).length)}</span>
              <span>
                <button
                  className="btn secondary"
                  onClick={async () => {
                    await navigator.clipboard.writeText(script);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  {copied ? t.script.copied : t.script.copy}
                </button>
                <button className="btn" onClick={() => download(`${name}.magfem.py`, new Blob([script], { type: 'text/x-python' }))}>
                  {t.script.download}
                </button>
                <button className="btn secondary" onClick={() => setOpen(false)}>
                  {t.script.close}
                </button>
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

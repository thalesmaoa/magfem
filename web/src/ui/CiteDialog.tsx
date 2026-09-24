import { useEffect, useRef, useState } from 'react';
import { bibtex, fullCitation } from '../cad/citation';
import { getLang, useT } from '../i18n';

/** Diálogo "Cite este trabalho": citação completa + BibTeX, com botões de copiar. */
export function CiteDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const full = fullCitation(getLang());
  const bib = bibtex();

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  const copy = async (what: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // Sem permissão de clipboard: o texto continua selecionável.
    }
  };

  return (
    <dialog ref={ref} className="cite" onClose={onClose} onClick={(e) => e.target === ref.current && ref.current?.close()}>
      <h2>{t.cite.title}</h2>
      <p className="muted">{t.cite.intro}</p>
      <h4>
        {t.cite.full}
        <button className="link-btn" onClick={() => copy('full', full)}>
          {copied === 'full' ? t.cite.copied : t.cite.copy}
        </button>
      </h4>
      <p className="cite-full">{full}</p>
      <h4>
        {t.cite.bibtex}
        <button className="link-btn" onClick={() => copy('bib', bib)}>
          {copied === 'bib' ? t.cite.copied : t.cite.copy}
        </button>
      </h4>
      <pre className="cite-bib">{bib}</pre>
      <div className="actions">
        <button className="btn" onClick={() => ref.current?.close()}>
          {t.cite.close}
        </button>
      </div>
    </dialog>
  );
}

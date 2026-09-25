import { useEffect, useRef } from 'react';
import { CITATION } from '../cad/citation';
import { useT } from '../i18n';
import logo from '../assets/magfem-logo.png';

const REPO = 'https://github.com/thalesmaoa/magfem';

/** Diálogo "Sobre": versão, autor, licença e componentes de terceiros. */
export function AboutDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  const a = CITATION.authors[0];
  return (
    <dialog ref={ref} className="cite about" onClose={onClose} onClick={(e) => e.target === ref.current && ref.current?.close()}>
      <div className="about-head">
        <img src={logo} alt="" width={48} height={48} />
        <div>
          <h2>MagFEM</h2>
          <p className="muted">
            {CITATION.subtitle} · v{CITATION.version}
          </p>
        </div>
      </div>
      <p>{t.about.intro}</p>
      <h4>{t.about.author}</h4>
      <p>
        {a.given} {a.family} · <a href="https://thalesmaia.com" target="_blank" rel="noopener noreferrer">thalesmaia.com</a>
      </p>
      <h4>{t.about.license}</h4>
      <p>{t.about.mit}</p>
      <h4>{t.about.thirdParty}</h4>
      <ul className="about-list">
        <li>{t.about.triangle}</li>
        <li>Eigen 3.4 — MPL 2.0</li>
        <li>PlaneGCS (FreeCAD) via @salusoft89/planegcs — LGPL-2.1</li>
        <li>{t.about.femm}</li>
      </ul>
      <p className="about-links">
        <a href={REPO} target="_blank" rel="noopener noreferrer">
          {t.about.source}
        </a>
        {' · '}
        <a href={`${REPO}/blob/main/LICENSE`} target="_blank" rel="noopener noreferrer">
          LICENSE
        </a>
        {' · '}
        <a href={`${REPO}/issues`} target="_blank" rel="noopener noreferrer">
          Bug reports
        </a>
      </p>
      <div className="modal-actions">
        <button className="btn" onClick={() => ref.current?.close()}>
          OK
        </button>
      </div>
    </dialog>
  );
}

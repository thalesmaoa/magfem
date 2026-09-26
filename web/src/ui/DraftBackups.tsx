// Cópias automáticas do rascunho (uma por minuto, até 10): listar e recuperar; aviso quando o projeto abre vazio.
import { useEffect, useState } from 'react';
import type { SketchEditor } from '../cad/editor';
import { listDraftBackups, parse, type Draft } from '../io/project';
import { useT } from '../i18n';

/** Curvas (linhas, arcos, círculos) de um rascunho salvo, sem carregar o projeto. */
function curvesOf(d: Draft): number {
  try {
    const ents = Object.values(parse(d.text).entities) as { type: string }[];
    return ents.filter((e) => e.type !== 'point').length;
  } catch {
    return 0;
  }
}

const when = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });

function recover(ed: SketchEditor, d: Draft) {
  // Alteração comum (dá para desfazer), com o momento da cópia no histórico.
  ed.commit(parse(d.text), [`# recuperado: cópia automática de ${when(d.savedAt)} (${d.name})`]);
  ed.fit();
}

/** Seção da gaveta "Problema": cópias automáticas com botão de recuperar. */
export function DraftBackups({ ed }: { ed: SketchEditor }) {
  const t = useT();
  const [list, setList] = useState<Draft[] | null>(null);
  useEffect(() => {
    void listDraftBackups().then(setList);
  }, []);
  return (
    <section>
      <h3>{t.backups.title}</h3>
      <p className="help-line">{t.backups.help}</p>
      {!list?.length ? (
        <p className="muted">{list ? t.backups.none : '…'}</p>
      ) : (
        <ul className="backup-list">
          {list.map((d) => (
            <li key={d.savedAt}>
              <span>
                {when(d.savedAt)} · {d.name} · {t.backups.curves(curvesOf(d))}
              </span>
              <button className="btn secondary small" onClick={() => recover(ed, d)}>
                {t.backups.recover}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Aviso na abertura: projeto vazio, mas existe cópia automática com desenho. */
export function RecoverBanner({ ed }: { ed: SketchEditor }) {
  const t = useT();
  const [best, setBest] = useState<Draft | null>(null);
  useEffect(() => {
    const empty = Object.values(ed.sketch.entities).filter((e) => e.type !== 'point').length === 0;
    if (!empty) return;
    void listDraftBackups().then((l) => setBest(l.find((d) => curvesOf(d) > 0) ?? null));
  }, [ed]);
  if (!best) return null;
  return (
    <div className="recover-banner" role="status">
      <span>{t.backups.banner(when(best.savedAt), curvesOf(best))}</span>
      <button
        className="btn small"
        onClick={() => {
          recover(ed, best);
          setBest(null);
        }}
      >
        {t.backups.recover}
      </button>
      <button className="btn secondary small" onClick={() => setBest(null)}>
        {t.backups.dismiss}
      </button>
    </div>
  );
}

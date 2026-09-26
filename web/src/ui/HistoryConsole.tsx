import { useEffect, useMemo, useRef, useState } from 'react';
import { editorConsoleHost } from './consoleHost';
import { CommandConsole, completions, type Completion } from '../cad/console';
import type { SketchEditor } from '../cad/editor';
import { useT } from '../i18n';
import { Icons } from './icons';
import { useDocVersion } from './useStore';

const HIST_KEY = 'magfem-console-history';

/** Saída do console presa a uma posição do histórico (aparece depois do passo `at`). */
interface Out {
  at: number;
  input?: string; // comando que não entrou no histórico (consulta ou erro)
  text: string | null;
  error: boolean;
}

function loadCmdHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HIST_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

/** Console de baixo, como o console Python do FreeCAD: mostra o código de cada ação e aceita comandos. */
export function HistoryConsole(props: {
  ed: SketchEditor;
  open: boolean;
  onToggle: () => void;
  height: number;
  onResize: (h: number) => void;
  popped: boolean;
  onPopout: () => void;
  onDock: () => void;
}) {
  const { ed, open, onToggle } = props;
  const t = useT();
  useDocVersion(ed.doc);
  const hist = ed.doc.history;
  const cmd = useMemo(() => new CommandConsole(editorConsoleHost(ed)), [ed]);
  const [outs, setOuts] = useState<Out[]>([]);
  const [text, setText] = useState('');
  const [past, setPast] = useState<string[]>(loadCmdHistory);
  const [cursor, setCursor] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [hist.length, outs.length, open]);

  const copy = async () => {
    const lines = ['import magfem', '', 's = magfem.connect().sketch  # API local (Fase 7)', ''];
    for (const h of hist) if (!h.undone) lines.push(...h.code);
    try {
      await navigator.clipboard.writeText(lines.join('\n') + '\n');
      ed.flash(t.hist.copied);
    } catch {
      // Sem permissão de clipboard: ignora.
    }
  };

  const run = () => {
    const lines = text.split('\n').filter((l) => l.trim());
    if (!lines.length) return;
    const produced: Out[] = [];
    for (const line of lines) {
      const before = ed.doc.history.filter((h) => !h.undone).length;
      const r = cmd.run(line);
      const after = ed.doc.history.filter((h) => !h.undone).length;
      const committed = after > before;
      // Comando que entrou no histórico já aparece lá; senão mostramos a linha digitada.
      if (!committed || r.out) produced.push({ at: after, input: committed ? undefined : line.trim(), text: r.out, error: !r.ok });
      if (!r.ok) break; // para no primeiro erro de um bloco colado
    }
    setOuts((o) => [...o, ...produced]);
    const nextPast = [...past.filter((p) => p !== text.trim()), text.trim()].slice(-200);
    setPast(nextPast);
    try {
      localStorage.setItem(HIST_KEY, JSON.stringify(nextPast));
    } catch {
      // localStorage indisponível: histórico de comandos só nesta sessão.
    }
    setCursor(null);
    setText('');
  };

  // ----- autocompletar (Tab) -----
  const [menu, setMenu] = useState<{ start: number; end: number; items: Completion[]; i: number } | null>(null);
  const apply = (m: { start: number; end: number }, c: Completion) => {
    const next = text.slice(0, m.start) + c.insert + text.slice(m.end);
    setText(next);
    setMenu(null);
    const pos = m.start + c.insert.length;
    requestAnimationFrame(() => input.current?.setSelectionRange(pos, pos));
  };
  const tab = (el: HTMLTextAreaElement) => {
    const end = el.selectionStart ?? text.length;
    const r = completions(ed.sketch, cmd.env, text.slice(0, end));
    if (!r.items.length) return;
    if (r.items.length === 1) return apply({ start: r.start, end }, r.items[0]);
    // Completa o prefixo comum e mostra a lista.
    const common = r.items.reduce((p, c) => {
      let k = 0;
      while (k < p.length && k < c.insert.length && p[k] === c.insert[k]) k++;
      return p.slice(0, k);
    }, r.items[0].insert);
    const typed = text.slice(r.start, end);
    if (common.length > typed.length) {
      const next = text.slice(0, r.start) + common + text.slice(end);
      setText(next);
      const pos = r.start + common.length;
      requestAnimationFrame(() => input.current?.setSelectionRange(pos, pos));
      setMenu({ start: r.start, end: pos, items: r.items, i: 0 });
    } else setMenu({ start: r.start, end, items: r.items, i: 0 });
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation();
    if (menu) {
      if (e.key === 'Tab' || e.key === 'ArrowDown') {
        e.preventDefault();
        setMenu({ ...menu, i: (menu.i + (e.shiftKey ? menu.items.length - 1 : 1)) % menu.items.length });
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMenu({ ...menu, i: (menu.i + menu.items.length - 1) % menu.items.length });
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        apply(menu, menu.items[menu.i]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMenu(null);
        return;
      }
      setMenu(null);
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      tab(e.currentTarget);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      run();
      return;
    }
    const el = e.currentTarget;
    const single = !text.includes('\n');
    if (e.key === 'ArrowUp' && single && past.length) {
      e.preventDefault();
      const i = cursor === null ? past.length - 1 : Math.max(0, cursor - 1);
      setCursor(i);
      setText(past[i]);
    } else if (e.key === 'ArrowDown' && single && cursor !== null) {
      e.preventDefault();
      const i = cursor + 1;
      if (i >= past.length) {
        setCursor(null);
        setText('');
      } else {
        setCursor(i);
        setText(past[i]);
      }
    } else if (e.key === 'Escape') {
      el.blur();
    }
  };

  // Saídas agrupadas por posição no histórico ativo.
  const active = hist.filter((h) => !h.undone);
  const outsAt = (k: number) =>
    outs
      .filter((o) => o.at === k)
      .map((o, j) => (
        <div key={`o${k}-${j}`} className="out">
          {o.input && <pre className="in">{`>>> ${o.input}`}</pre>}
          {o.text && <pre className={o.error ? 'err' : 'res'}>{o.text}</pre>}
        </div>
      ));
  let k = 0;
  return (
    <section className={`console${open ? ' open' : ''}${props.popped ? ' popped' : ''}`} style={open && !props.popped ? { height: props.height } : undefined}>
      {open && !props.popped && <Resizer height={props.height} onResize={props.onResize} label={t.console.resize} />}
      <header>
        <button className="console-toggle" onClick={onToggle} aria-expanded={open} title={open ? t.console.hide : t.console.show}>
          {open ? '▾' : '▸'} {t.console.title} · {t.hist.title}
          <span className="muted"> ({active.length})</span>
        </button>
        <span className="console-actions">
          <button className="icon-btn" title={t.hist.copy} aria-label={t.hist.copy} onClick={copy} disabled={!hist.length}>
            {Icons.copy}
          </button>
          {props.popped ? (
            <button className="icon-btn" title={t.console.dock} aria-label={t.console.dock} onClick={props.onDock}>
              {Icons.dock}
            </button>
          ) : (
            <button className="icon-btn" title={t.console.popout} aria-label={t.console.popout} onClick={props.onPopout}>
              {Icons.popout}
            </button>
          )}
        </span>
      </header>
      {open && (
        <div className="code" ref={ref} title={t.hist.help} onClick={() => window.getSelection()?.isCollapsed && input.current?.focus()}>
          {!hist.length && !outs.length && <pre className="muted"># {t.hist.empty}</pre>}
          {outsAt(0)}
          {hist.map((h, i) => {
            const pos = h.undone ? -1 : ++k;
            return (
              <div key={i} className={h.undone ? 'undone' : ''}>
                {h.code.length ? h.code.map((l, j) => <pre key={j}>{l}</pre>) : <pre className="muted"># —</pre>}
                {pos > 0 && outsAt(pos)}
              </div>
            );
          })}
          {menu && (
            <ul className="complete" role="listbox" aria-label="autocomplete">
              {menu.items.map((c, i) => (
                <li
                  key={c.label + i}
                  role="option"
                  aria-selected={i === menu.i}
                  className={i === menu.i ? 'on' : ''}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    apply(menu, c);
                  }}
                >
                  <b>{c.label}</b>
                  {c.detail && <span>{c.detail}</span>}
                </li>
              ))}
            </ul>
          )}
          <div className="prompt">
            <span aria-hidden="true">&gt;&gt;&gt;</span>
            <textarea
              ref={input}
              rows={Math.min(8, Math.max(1, text.split('\n').length))}
              value={text}
              spellCheck={false}
              aria-label={t.console.title}
              placeholder={t.consoleCmd.placeholder}
              onChange={(e) => {
                setText(e.target.value);
                setMenu(null);
              }}
              onKeyDown={onKey}
            />
          </div>
        </div>
      )}
    </section>
  );
}

/** Alça no topo do console: arrastar muda a altura. */
function Resizer({ height, onResize, label }: { height: number; onResize: (h: number) => void; label: string }) {
  const start = useRef<{ y: number; h: number } | null>(null);
  return (
    <div
      className="console-resizer"
      role="separator"
      aria-orientation="horizontal"
      aria-label={label}
      title={label}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        start.current = { y: e.clientY, h: height };
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        const max = window.innerHeight * 0.75;
        onResize(Math.min(max, Math.max(70, start.current.h + (start.current.y - e.clientY))));
      }}
      onPointerUp={() => (start.current = null)}
    />
  );
}

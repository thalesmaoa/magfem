import { useEffect, useRef, useState } from 'react';

/**
 * Campo de texto que só confirma no Enter/blur e volta ao valor original no Esc.
 * `onDone` é chamado sempre que a edição termina (confirmada ou não) — usado para fechar a caixa de renomear.
 */
export function LazyInput(props: {
  value: string;
  onCommit: (v: string) => void;
  onDone?: () => void;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
}) {
  const [v, setV] = useState(props.value);
  const ref = useRef<HTMLInputElement>(null);
  const cancelled = useRef(false);
  useEffect(() => {
    // Ao abrir para renomear, já entra com o texto selecionado.
    if (props.autoFocus) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [props.autoFocus]);
  const [base, setBase] = useState(props.value);
  if (base !== props.value) {
    setBase(props.value);
    setV(props.value);
  }
  return (
    <input
      ref={ref}
      className={props.className}
      value={v}
      placeholder={props.placeholder}
      aria-label={props.ariaLabel}
      spellCheck={false}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        if (!cancelled.current && v !== props.value) props.onCommit(v);
        cancelled.current = false;
        props.onDone?.();
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          cancelled.current = true;
          setV(props.value);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}


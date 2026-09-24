import { useEffect, useRef, useState } from 'react';
import type { SketchEditor } from '../cad/editor';
import { useEditor } from './useStore';

/** Caixa de edição de uma cota: número ("12,5"), com unidade ("2 cm") ou expressão ("Ds/2 - g"). */
export function DimInput({ ed }: { ed: SketchEditor }) {
  const { editing } = useEditor(ed);
  if (!editing) return null;
  return <Box key={editing.id} ed={ed} id={editing.id} x={editing.x} y={editing.y} initial={editing.text} unit={editing.angle ? '°' : ed.unit} />;
}

function Box({ ed, id, x, y, initial, unit }: { ed: SketchEditor; id: string; x: number; y: number; initial: string; unit: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(initial);
  const done = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const commit = () => {
    if (done.current) return;
    done.current = true;
    if (text.trim() === initial.trim()) ed.cancelEditing();
    else ed.setDimensionText(id, text);
  };
  const cancel = () => {
    done.current = true;
    ed.cancelEditing();
  };
  return (
    <div className="dim-input" style={{ left: x, top: y }}>
      <input
        ref={ref}
        value={text}
        spellCheck={false}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') cancel();
          e.stopPropagation();
        }}
        onBlur={commit}
      />
      <span className="unit">{unit}</span>
    </div>
  );
}

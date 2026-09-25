// Alça para arrastar a largura dos painéis laterais (árvore à esquerda, gaveta à direita).
import { useEffect } from 'react';

const LIMITS = { left: [200, 640], right: [240, 720] } as const;
const DEFAULT = { left: 290, right: 300 };
const key = (side: 'left' | 'right') => `magfem-${side}-width`;
const cssVar = (side: 'left' | 'right') => `--${side}-w`;

function apply(side: 'left' | 'right', w: number) {
  document.documentElement.style.setProperty(cssVar(side), `${w}px`);
}

/** Aplica as larguras salvas (uma vez, ao abrir o app). */
export function useSavedPanelWidths() {
  useEffect(() => {
    for (const side of ['left', 'right'] as const) {
      let w = DEFAULT[side];
      try {
        w = Number(localStorage.getItem(key(side))) || w;
      } catch {
        // sem localStorage: fica o padrão
      }
      apply(side, Math.min(LIMITS[side][1], Math.max(LIMITS[side][0], w)));
    }
  }, []);
}

export function PanelResizer({ side }: { side: 'left' | 'right' }) {
  return (
    <div
      className={`panel-resizer ${side}`}
      role="separator"
      aria-orientation="vertical"
      title="↔"
      onPointerDown={(e) => {
        e.preventDefault();
        const x0 = e.clientX;
        const w0 = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(cssVar(side))) || DEFAULT[side];
        let w = w0;
        const move = (ev: PointerEvent) => {
          const dx = ev.clientX - x0;
          w = Math.min(LIMITS[side][1], Math.max(LIMITS[side][0], side === 'left' ? w0 + dx : w0 - dx));
          apply(side, w);
        };
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          document.body.classList.remove('resizing');
          try {
            localStorage.setItem(key(side), String(Math.round(w)));
          } catch {
            // ignora
          }
        };
        document.body.classList.add('resizing');
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      }}
    />
  );
}

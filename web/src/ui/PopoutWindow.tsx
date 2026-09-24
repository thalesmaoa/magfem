import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// Uma janela destacada por vez. O fechamento é adiado para sobreviver a desmontar/montar
// imediato (React StrictMode em desenvolvimento), que senão fecharia a janela recém-aberta.
let current: Window | null = null;
let pendingClose = 0;

/**
 * Renderiza `children` numa janela separada do navegador (ex.: console destacado).
 * Copia as folhas de estilo da página; `onClose` é chamado quando o usuário fecha a janela.
 */
export function PopoutWindow({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    clearTimeout(pendingClose);
    let w = current && !current.closed ? current : null;
    if (!w) {
      w = window.open('', '', 'width=960,height=420');
      if (!w) {
        onClose(); // bloqueado pelo navegador: volta para o console embutido
        return;
      }
      current = w;
      w.document.title = title;
      for (const node of document.querySelectorAll('style, link[rel="stylesheet"]')) w.document.head.appendChild(node.cloneNode(true));
      w.document.body.className = 'popout';
      const root = w.document.createElement('div');
      root.className = 'popout-root';
      w.document.body.appendChild(root);
    }
    const win = w;
    win.document.documentElement.dataset.theme = document.documentElement.dataset.theme ?? '';
    setContainer(win.document.querySelector('.popout-root') as HTMLElement);
    // Acompanha o tema claro/escuro da janela principal.
    const mo = new MutationObserver(() => {
      win.document.documentElement.dataset.theme = document.documentElement.dataset.theme ?? '';
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const closed = () => {
      current = null;
      onClose();
    };
    win.addEventListener('pagehide', closed);
    const closeWithMain = () => win.close();
    window.addEventListener('pagehide', closeWithMain);
    return () => {
      mo.disconnect();
      win.removeEventListener('pagehide', closed);
      window.removeEventListener('pagehide', closeWithMain);
      pendingClose = window.setTimeout(() => {
        win.close();
        if (current === win) current = null;
      }, 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return container ? createPortal(children, container) : null;
}

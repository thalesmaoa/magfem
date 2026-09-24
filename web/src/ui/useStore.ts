import { useSyncExternalStore } from 'react';
import type { SketchDoc } from '../cad/doc';
import type { SketchEditor } from '../cad/editor';

export function useEditor(ed: SketchEditor) {
  return useSyncExternalStore(
    (fn) => ed.subscribe(fn),
    ed.getSnapshot,
  );
}

/** Re-renderiza a cada mudança do documento; devolve a versão atual. */
export function useDocVersion(doc: SketchDoc) {
  return useSyncExternalStore(
    (fn) => doc.subscribe(fn),
    () => doc.version,
  );
}

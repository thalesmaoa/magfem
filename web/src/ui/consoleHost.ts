// Ligação do console com o editor: ações de vista, malha, solução e leitura de resultados.
// Usado pelo console da tela e pela ponte com scripts locais.
import type { ConsoleHost } from '../cad/console';
import type { SketchEditor } from '../cad/editor';
import { resultVars } from '../cad/results';
import { frameOf } from '../cad/solve';

export function editorConsoleHost(ed: SketchEditor): ConsoleHost {
  // Física pedida, ou a primeira que tem solução.
  const pick = (physics?: string) => physics ?? ed.sketch.nodes.find((n) => n.kind === 'physics' && ed.solutions.has(n.id))?.id;
  return {
    doc: ed.doc,
    fit: () => ed.fit(),
    undo: () => ed.undo(),
    redo: () => ed.redo(),
    mesh: (id) => ed.generateMesh(id),
    solve: (id) => ed.solve(id),
    results: {
      list(physics) {
        const id = pick(physics);
        const sol = id ? ed.shownSol(id) : undefined;
        if (!id || !sol) return null;
        return resultVars(ed.sketch, ed.arrangement(), sol, id).list;
      },
      series(name, physics) {
        const id = pick(physics);
        const full = id ? ed.solutions.get(id) : undefined;
        if (!id || !full?.times) return null;
        const arr = ed.arrangement();
        const y: number[] = [];
        for (let k = 0; k < full.times.length; k++) {
          const v = resultVars(ed.sketch, arr, frameOf(full, k), id).list.find((x) => x.name === name);
          if (!v) return null;
          y.push(v.value);
        }
        return { t: Array.from(full.times), y };
      },
    },
  };
}

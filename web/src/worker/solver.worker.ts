import createCore from '../wasm/core.js';
import type { WorkerRequest, WorkerResponse } from './protocol';

let core = createCore();

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data;
  let res: WorkerResponse;
  try {
    const m = await core;
    switch (req.cmd) {
      case 'version':
        res = { id: req.id, ok: true, result: m.version() };
        break;
      case 'poisson1dMax':
        res = { id: req.id, ok: true, result: m.poisson1dMax(req.n) };
        break;
      case 'solveMagnetostatic': {
        // Progresso: o núcleo chama a cada passo; a mensagem chega à interface mesmo com o cálculo em andamento.
        let last = 0;
        const input = {
          ...req.input,
          onProgress: (k: number, n: number) => {
            const now = performance.now();
            if (k === n || now - last > 80) {
              last = now;
              self.postMessage({ id: req.id, progress: [k, n] });
            }
          },
        };
        const out = m.solveMagnetostatic(input);
        if (out.error) throw new Error(out.error);
        res = { id: req.id, ok: true, result: out };
        break;
      }
      case 'triangulate': {
        const out = m.triangulate(req.input);
        if (out.error) throw new Error(out.error);
        res = { id: req.id, ok: true, result: out };
        break;
      }
    }
  } catch (e) {
    // O Triangle aborta (exit) em entradas inválidas: recria o módulo para as próximas chamadas.
    core = createCore();
    res = { id: req.id, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  self.postMessage(res);
};

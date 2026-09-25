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

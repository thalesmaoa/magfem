import createCore from '../wasm/core.js';
import type { WorkerRequest, WorkerResponse } from './protocol';

const core = createCore();

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
    }
  } catch (e) {
    res = { id: req.id, ok: false, error: String(e) };
  }
  self.postMessage(res);
};

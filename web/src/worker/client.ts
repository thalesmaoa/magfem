import type { WorkerRequest, WorkerResponse } from './protocol';

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; onProgress?: (k: number, n: number) => void };
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

// Cliente com promessas para o Worker do solver (o WASM roda fora da thread da UI).
class SolverClient {
  private worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
  private nextId = 1;
  private pending = new Map<number, Pending>();

  constructor() {
    this.worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const r = ev.data;
      const p = this.pending.get(r.id);
      if (!p) return;
      if ('progress' in r) {
        p.onProgress?.(r.progress[0], r.progress[1]);
        return;
      }
      this.pending.delete(r.id);
      if (r.ok) p.resolve(r.result);
      else p.reject(new Error(r.error));
    };
  }

  call<T>(req: DistributiveOmit<WorkerRequest, 'id'>, onProgress?: (k: number, n: number) => void): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, onProgress });
      this.worker.postMessage({ ...req, id } as WorkerRequest);
    });
  }
}

export const solver = new SolverClient();

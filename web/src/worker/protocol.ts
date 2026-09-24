// Mensagens entre a UI e o Worker do solver.
export type WorkerRequest = { id: number; cmd: 'version' } | { id: number; cmd: 'poisson1dMax'; n: number };

export type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };

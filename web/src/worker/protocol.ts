// Mensagens entre a UI e o Worker do solver.
import type { MeshInput } from '../cad/meshgen';

export type WorkerRequest =
  | { id: number; cmd: 'version' }
  | { id: number; cmd: 'poisson1dMax'; n: number }
  | { id: number; cmd: 'triangulate'; input: MeshInput };

export type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };

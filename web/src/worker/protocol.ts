// Mensagens entre a UI e o Worker do solver.
import type { MeshInput } from '../cad/meshgen';
import type { MagInput } from '../cad/solve';

export type WorkerRequest =
  | { id: number; cmd: 'version' }
  | { id: number; cmd: 'poisson1dMax'; n: number }
  | { id: number; cmd: 'triangulate'; input: MeshInput }
  | { id: number; cmd: 'solveMagnetostatic'; input: MagInput };

export type WorkerResponse =
  | { id: number; progress: [number, number] }
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };

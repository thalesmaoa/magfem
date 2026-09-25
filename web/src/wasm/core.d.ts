// Tipos do módulo gerado pelo Emscripten (core.js é artefato de build, ver scripts/build-core).
export interface TriangulateOut {
  error: string;
  xy: Float64Array;
  triangles: Int32Array;
  triRegion: Int32Array;
  nodeMarkers: Int32Array;
}
export interface MagOut {
  error: string;
  A: Float64Array;
  bx: Float64Array;
  by: Float64Array;
  energy: number;
}
export interface CoreModule {
  solveMagnetostatic(input: import('../cad/solve').MagInput): MagOut;
  version(): string;
  poisson1dMax(n: number): number;
  triangulate(input: import('../cad/meshgen').MeshInput): TriangulateOut;
}
declare const createCore: () => Promise<CoreModule>;
export default createCore;

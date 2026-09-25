// Tipos do módulo gerado pelo Emscripten (core.js é artefato de build, ver scripts/build-core).
export interface TriangulateOut {
  error: string;
  xy: Float64Array;
  triangles: Int32Array;
  triRegion: Int32Array;
  nodeMarkers: Int32Array;
}
export interface CoreModule {
  version(): string;
  poisson1dMax(n: number): number;
  triangulate(input: import('../cad/meshgen').MeshInput): TriangulateOut;
}
declare const createCore: () => Promise<CoreModule>;
export default createCore;

// Tipos do módulo gerado pelo Emscripten (core.js é artefato de build, ver scripts/build-core).
export interface CoreModule {
  version(): string;
  poisson1dMax(n: number): number;
}
declare const createCore: () => Promise<CoreModule>;
export default createCore;

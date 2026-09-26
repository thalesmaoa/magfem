# Contributing

**Bug reports are very welcome.** Open an issue at <https://github.com/thalesmaoa/magfem/issues>; there is also a
**Bug reports** link in the app status bar. Attaching the project (`.magfem`) or the exported script (`</>`), which
rebuilds the model exactly, helps a lot.

## Run locally

Requirements: Docker (and `cmake`/`g++` for the native core tests).

```bash
git clone https://github.com/thalesmaoa/magfem.git && cd magfem
./compose-up                  # builds the WASM core and serves http://localhost:3002/tools/magfem-web/
./scripts/build-core native   # native C++ core + tests against analytical solutions
./scripts/npm test            # unit tests (vitest)
./scripts/e2e                 # end-to-end tests (Playwright, headless)
./scripts/check               # every suite
```

## Layout

```
core/      C++17 numerical core + Eigen + Tangle → WebAssembly (Emscripten) and native (tests)
web/       Vite + React + TypeScript interface; mesher and solver in a Web Worker
bridge/    bridge for scripts (Python package magfem; Matlab and Julia clients)
docs/      this documentation (VitePress)
```

## This documentation

The documentation lives in `docs/`, in Markdown, with the Portuguese pages at the root and the English ones in
`docs/en/`.

```bash
./scripts/docs install        # once
./scripts/docs run dev        # http://localhost:3003/tools/magfem-web/docs/
./scripts/docs run build      # writes docs/.vitepress/dist
./scripts/docs-shots          # regenerates the screenshots (with the app running on :3002)
```

CI builds the documentation together with the app and publishes it at `/tools/magfem-web/docs/`. Every page has an
**Edit this page on GitHub** link.

## Style

Before submitting, run `./scripts/check`. Code follows the surrounding style (comments in Portuguese, strict
TypeScript).

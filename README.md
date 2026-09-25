<p align="center"><img src="doc/logo/magfem.png" width="96" alt="MagFEM"></p>

# MagFEM

*[Versão em português](README.pt-BR.md)*

**2D magnetic finite elements in the browser**, for planar and axisymmetric problems. MagFEM has a
parametric CAD (in the style of Onshape), meshing, a nonlinear and transient solver with circuit
coupling, and post-processing in the style of ParaView. It all runs locally in the browser
(WebAssembly), with no installation, no server and no login. Your projects stay on your machine,
as in draw.io.

**Try it:** <https://thalesmaia.com/tools/magfem-web/>

## Focus and roadmap

**Bug reports are very welcome.** Please open an issue at
<https://github.com/thalesmaoa/magfem/issues> (there is also a *Bug reports* link in the app's
status bar).

The current focus is on **non-rotating electrical machines**: inductors, transformers and actuators.
The work centers on **circuit coupling** and **transient simulation**, with the coupling also
scriptable from code. After that, **force** and **thermal** physics will allow simulating devices
such as **contactors**. The final step is **rotating machines**, with a moving air gap.

## Features

- **Parametric CAD:**
  - lines, arcs, circles and rectangles;
  - constraints (coincident, horizontal/vertical, parallel, tangent, symmetric…);
  - dimensions with units and expressions bound to variables;
  - associative offset, mirror and linear/circular patterns;
  - SVG/DXF/PNG export.
- **Pre-processing:**
  - regions detected automatically;
  - materials: grouped library, B-H curves, and a built-in **FEMM 4.2 material library**
    (245 materials);
  - circuits and per-region mesh size;
  - boundary conditions as in FEMM: prescribed A (A0 + A1·x + A2·y), mixed (c0, c1), periodic,
    anti-periodic and Neumann. The outer border gets Dirichlet A = 0 automatically.
- **Meshing:** the Triangle mesher compiled to WebAssembly.
- **Solver** (C++/Eigen compiled to WebAssembly, running in a Web Worker):
  - magnetostatic, **nonlinear** whenever a material has a B-H curve (Newton-Raphson);
  - **transient** analysis with eddy currents, where currents can be functions of time;
  - **"Magnetic field + circuit"**: a schematic editor with R, L, C, V and I parts and FEM coils,
    solved together with the field in one system;
  - validated against analytical solutions.
- **Results in tabs:**
  - field maps (|B|, |H|, A, J), contours (flux lines), vectors and plots over a line;
  - high-order interpolation;
  - result tables: circuits (λ, L, R, losses), line and surface integrals with user-named variables,
    and formulas;
  - circuit signals over time;
  - PNG/SVG/CSV/WebM export.
- **Python-like API/console:** every action becomes a command (`g.line(...)`, `m.region(...)`,
  `s.solve()`). "Export code" writes a script that rebuilds the model exactly, which is the basis
  for automation and optimization.
- The interface is in **English and Portuguese**, with light and dark themes and "Cite this work".

See [`doc/`](doc/) for the user guide, the API reference and the numerical formulation and
validation. See [`PLAN.md`](PLAN.md) for the development log.

## Run locally

Requirements: Docker (and `cmake`/`g++` for the native core tests).

```bash
git clone git@github.com:thalesmaoa/magfem.git && cd magfem
./compose-up                  # builds the WASM core and serves http://localhost:3002/tools/magfem-web/
./scripts/build-core native   # native C++ core + tests against analytical solutions
./scripts/npm test            # unit tests (vitest)
./scripts/e2e                 # end-to-end tests (Playwright, headless)
```

`./scripts/npm run build` writes the static site to `web/dist`. Any static file server can host it;
CI publishes `dist` to the `dist` branch.

## Layout

```
core/      C++17 numerical core + Eigen + Triangle → WebAssembly (Emscripten) and native (tests)
web/       Vite + React + TypeScript interface; mesher and solver run in a Web Worker
doc/       documentation (usage, API, formulation, validation) and logo
```

## Contributing

Issues and pull requests are welcome. Before submitting, run `./scripts/npm test`, `./scripts/e2e`
and `./scripts/build-core native`. Code follows the surrounding style (comments in Portuguese,
strict TypeScript).

## License

MagFEM code: **MIT** (see [`LICENSE`](LICENSE)). You may use, modify and redistribute it freely.

Third-party components:
- **Eigen** (MPL-2.0).
- **PlaneGCS/FreeCAD** via `@salusoft89/planegcs` (LGPL-2.1).
- **Triangle 1.6** by J. R. Shewchuk: free for private, academic and institutional use and for
  **free** redistribution (keeping its copyright notice). **Commercial use requires an arrangement
  with the author.** The mesher is isolated in `core/src/mesh2d.cpp` and can be replaced.
- **Material library** (`web/src/data/femm-matlib.json`, 245 materials): converted from the
  `matlib.dat` of **FEMM 4.2** (David Meeker, [femm.info](https://www.femm.info)), which is
  distributed under the Aladdin Free Public License (free redistribution, no commercial use).
  Credit belongs to FEMM. *Materials → Import from FEMM…* can also read the `matlib.dat` of your
  own installation.

## Cite

Maia, T. (2026). *MagFEM: A Web-Based Magnetic Finite Element Analysis Tool* (Version 1.0.0).
<https://thalesmaia.com/tools/magfem-web/>. The app's "Cite" button gives the full citation and
BibTeX.

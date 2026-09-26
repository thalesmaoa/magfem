# License and credits

## MagFEM

MagFEM code is **MIT**: use, modify and redistribute it freely, including in commercial projects. See the
[`LICENSE`](https://github.com/thalesmaoa/magfem/blob/main/LICENSE).

## Third-party components

| Component | Use | License |
|---|---|---|
| [Eigen](https://eigen.tuxfamily.org) | sparse linear algebra in the core | MPL-2.0 |
| [PlaneGCS](https://github.com/FreeCAD/FreeCAD) (FreeCAD), via `@salusoft89/planegcs` | CAD constraint solver | LGPL-2.1 |
| [Tangle](https://github.com/dcm3c/tangle), by David Meeker | mesh generator (the same as FEMM) | MIT |
| [FEMM 4.2](https://www.femm.info) material library, by David Meeker | 245 materials (converted from `matlib.dat`) | Aladdin Free Public License |
| [VitePress](https://vitepress.dev) | this documentation | MIT |

::: warning FEMM material library
The material library comes from the FEMM 4.2 `matlib.dat`, distributed under the **Aladdin Free Public License**
(free redistribution, no commercial use). Credit belongs to FEMM. The rest of MagFEM does not depend on it: you can
use your own materials, or import the `matlib.dat` of your FEMM installation.
:::

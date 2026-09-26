# Licença e créditos

## MagFEM

O código do MagFEM é **MIT**: use, modifique e redistribua livremente, inclusive em projetos comerciais. Veja o
[`LICENSE`](https://github.com/thalesmaoa/magfem/blob/main/LICENSE).

## Componentes de terceiros

| Componente | Uso | Licença |
|---|---|---|
| [Eigen](https://eigen.tuxfamily.org) | álgebra linear esparsa do núcleo | MPL-2.0 |
| [PlaneGCS](https://github.com/FreeCAD/FreeCAD) (FreeCAD), via `@salusoft89/planegcs` | solver de restrições do CAD | LGPL-2.1 |
| [Tangle](https://github.com/dcm3c/tangle), de David Meeker | gerador de malha (o mesmo do FEMM) | MIT |
| Biblioteca de materiais do [FEMM 4.2](https://www.femm.info), de David Meeker | 245 materiais (convertidos do `matlib.dat`) | Aladdin Free Public License |
| [Sphinx](https://www.sphinx-doc.org), [tema do Read the Docs](https://github.com/readthedocs/sphinx_rtd_theme) e [MyST](https://myst-parser.readthedocs.io) | esta documentação | BSD, MIT, MIT |

:::{admonition} Biblioteca de materiais do FEMM
:class: warning
A biblioteca de materiais vem do `matlib.dat` do FEMM 4.2, distribuído sob a **Aladdin Free Public License**
(redistribuição livre, sem uso comercial). O crédito é do FEMM. O resto do MagFEM não depende dela: dá para usar
materiais próprios, ou importar o `matlib.dat` da sua instalação do FEMM.
:::

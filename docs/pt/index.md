# Documentação do MagFEM

O **MagFEM** resolve problemas de campo magnético em duas dimensões pelo método dos elementos finitos, direto no
navegador: CAD paramétrico, malha, solver magnetostático não linear, análises transitória e harmônica (AC) com
circuito externo, resultados e scripts. Tudo roda localmente, sem instalar nada.

- Abra o app: <https://thalesmaia.com/tools/magfem-web/>
- Código-fonte e relatos de erro: <https://github.com/thalesmaoa/magfem>
- *English version*: use o seletor no rodapé do menu, ou [clique aqui](https://thalesmaia.com/tools/magfem-web/docs/en/).

Para começar, faça o [primeiro modelo](guide/first-model.md): uma bobina com núcleo de aço, do desenho à
indutância.

```{toctree}
:maxdepth: 1
:caption: Guia

guide/index
guide/first-model
guide/geometry
guide/mesh
guide/solver
guide/results
guide/circuit
guide/thermal
guide/files
guide/shortcuts
```

```{toctree}
:maxdepth: 1
:caption: Scripts e API

scripting/console
scripting/api
scripting/bridge
scripting/other-languages
scripting/examples
```

```{toctree}
:maxdepth: 1
:caption: Teoria

theory/formulation
theory/validation
```

```{toctree}
:maxdepth: 1
:caption: Sobre

about/cite
about/license
about/contributing
```

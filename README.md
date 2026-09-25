<p align="center"><img src="doc/logo/magfem.svg" width="96" alt="MagFEM"></p>

# MagFEM

**Elementos finitos magnéticos 2D no navegador** — plano e axissimétrico — com CAD paramétrico
(estilo Onshape), malha, solver e pós-processamento no estilo do ParaView. Tudo roda localmente no
browser (WebAssembly): sem instalação, sem servidor, sem login. Os projetos ficam na sua máquina,
como no draw.io.

*2D magnetic finite elements in the browser (planar and axisymmetric), with a parametric sketcher,
meshing, solver and ParaView-like post-processing — all local, no install.*

## O que já faz

- **CAD paramétrico:** linhas, arcos, círculos, retângulos; restrições (coincidente, H/V, paralelo,
  tangente, simetria…), cotas com unidades e expressões ligadas a variáveis; offset, espelho e
  padrões linear/circular associativos; importação futura de DXF/SVG, exportação SVG/DXF/PNG.
- **Malha:** regiões detectadas automaticamente, materiais (biblioteca agrupada, curvas B-H),
  circuitos, contornos (A prescrito, Neumann, periódico, antiperiódico), tamanho por região;
  gerador Triangle compilado para WebAssembly.
- **Solver magnetostático** (Eigen/WASM num Web Worker): correntes, ímãs permanentes, circuitos em
  série; validado contra soluções analíticas.
- **Resultados em abas:** mapas de campo (|B|, |H|, A, J), contornos (linhas de fluxo), vetores,
  gráficos sobre linha, interpolação de alta ordem, tabelas (circuitos: λ, L, R, perdas; integrais
  sobre linha e superfície); exportação PNG/SVG/CSV.
- **API/console estilo Python:** cada ação vira um comando (`g.line(...)`, `m.region(...)`,
  `s.solve()`); o botão "exportar código" gera um script que recria o modelo exatamente — base para
  automação e otimização (ponte local WebSocket planejada).
- Interface em **português e inglês**, tema claro/escuro, "Cite este trabalho".

Veja [`doc/`](doc/) para o guia de uso, a referência da API e a formulação/validação numérica, e
[`PLAN.md`](PLAN.md) para o roteiro (transitório, não linear, acoplamento com circuitos e EDOs).

## Rodar localmente

Pré-requisitos: Docker (e `cmake`/`g++` para os testes nativos do núcleo).

```bash
git clone git@github.com:thalesmaoa/magfem.git && cd magfem
./compose-up                  # compila o núcleo WASM e sobe http://localhost:3002/tools/magfem-web/
./scripts/build-core native   # núcleo C++ nativo + testes contra soluções analíticas
./scripts/npm test            # testes unitários (vitest)
./scripts/e2e                 # testes de ponta a ponta (Playwright, headless)
```

`./scripts/npm run build` gera o site estático em `web/dist` (~1,4 MB). Qualquer servidor de
arquivos estáticos serve; o CI publica o `dist` na branch `dist`.

## Estrutura

```
core/      núcleo numérico C++17 + Eigen + Triangle → WebAssembly (Emscripten) e nativo (testes)
web/       interface Vite + React + TypeScript; malha e solver rodam num Web Worker
doc/       documentação (uso, API, formulação, validação) e logo
bridge/    (planejado) ponte local WebSocket/REST para scripts de otimização
clients/   (planejado) clientes Python / Matlab / Julia
```

## Contribuir

Issues e pull requests são bem-vindos. Rode `./scripts/npm test`, `./scripts/e2e` e
`./scripts/build-core native` antes de enviar. O código segue o estilo do entorno (comentários em
português, TypeScript estrito).

## Licença

Código do MagFEM: **MIT** (veja [`LICENSE`](LICENSE)) — use, modifique e redistribua à vontade.

Componentes de terceiros baixados no build: **Eigen** (MPL-2.0), **PlaneGCS/FreeCAD** via
`@salusoft89/planegcs` (LGPL-2.1) e **Triangle 1.6** de J. R. Shewchuk, que é livre para uso
privado, acadêmico e institucional e para redistribuição **gratuita** (com o aviso de copyright),
mas **uso comercial exige acordo com o autor**. Se isso for um problema para você, o gerador de malha
fica isolado em `core/src/mesh2d.cpp` e pode ser trocado.

A biblioteca de materiais embutida (`web/src/data/femm-matlib.json`, 245 materiais) foi convertida
do `matlib.dat` do **FEMM 4.2** (David Meeker, [femm.info](https://www.femm.info)); o crédito é do
FEMM. Em *Materiais → Importar do FEMM…* também dá para ler o `matlib.dat` da sua instalação.

## Citar

Maia, T. (2026). *MagFEM: A Web-Based Magnetic Finite Element Analysis Tool*. (Use o botão
"Citar" no app para BibTeX.)

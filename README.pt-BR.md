<p align="center"><img src="doc/logo/magfem.png" width="96" alt="MagFEM"></p>

# MagFEM

*[English version](README.md)*

**Elementos finitos magnéticos 2D no navegador**, para problemas planos e axissimétricos. O MagFEM
tem CAD paramétrico (no estilo do Onshape), malha, solver não linear e transitório com acoplamento a
circuitos, e pós-processamento no estilo do ParaView. Tudo roda localmente no navegador
(WebAssembly), sem instalação, sem servidor e sem login. Os projetos ficam na sua máquina, como no
draw.io.

**Use agora:** <https://thalesmaia.com/tools/magfem-web/>

## Foco e roteiro

**Bug reports são muito bem-vindos.** Abra uma issue em
<https://github.com/thalesmaoa/magfem/issues> (o link *Bug reports* também fica na barra de status
do app).

O foco atual são **máquinas elétricas não rotativas**: indutores, transformadores e atuadores. O
trabalho se concentra na **integração com circuitos** e na **simulação transiente**, com o
acoplamento também controlável por código. Depois vêm as físicas de **força** e **temperatura**,
para simular dispositivos como **contatores**. A última etapa são as **máquinas rotativas**, com
entreferro móvel.

## O que já faz

- **CAD paramétrico:**
  - linhas, arcos, círculos e retângulos;
  - restrições (coincidente, horizontal/vertical, paralelo, tangente, simetria…);
  - cotas com unidades e expressões ligadas a variáveis;
  - offset, espelho e padrões linear/circular associativos;
  - importação DXF/SVG (pontos coincidentes unidos para fechar as regiões) e exportação SVG/DXF/PNG;
  - **importação de `.fem` do FEMM**: geometria, materiais, contornos, circuitos e rótulos de bloco viram um
    projeto do MagFEM (regiões sem rótulo ficam sem malha; bordas sem propriedade ficam Neumann, como no FEMM).
- **Pré-processamento:**
  - regiões detectadas automaticamente;
  - materiais: biblioteca agrupada, curvas B-H e a **biblioteca de materiais do FEMM 4.2**
    embutida (245 materiais);
  - circuitos e tamanho de malha por região;
  - contornos como no FEMM: A prescrito (A0 + A1·x + A2·y), misto (c0, c1), periódico,
    antiperiódico e Neumann. A borda externa recebe Dirichlet A = 0 automaticamente.
- **Malha:** [Tangle](https://github.com/dcm3c/tangle) (o gerador do FEMM, MIT) compilada para
  WebAssembly: triângulos de qualidade, tamanho por região e contornos periódicos casados nó a nó.
- **Solver** (C++/Eigen compilado para WebAssembly, rodando num Web Worker):
  - magnetostático, **não linear** sempre que o material tem curva B-H (Newton-Raphson);
  - análise **transitória** com correntes parasitas, com correntes definidas como funções do tempo;
  - análise **AC (harmônica)** com fasores: correntes parasitas, permeabilidade efetiva nos materiais
    com curva B-H, perdas por correntes parasitas e no ferro (Steinmetz) e resultados animados ao longo
    de um período;
  - **"Campo magnético + circuito"**: editor de esquemático com R, L, C, V, I e bobinas do FEM,
    resolvido junto com o campo num único sistema;
  - validado contra soluções analíticas.
- **Resultados em abas:**
  - mapas de campo (|B|, |H|, A, J), contornos (linhas de fluxo), vetores e gráficos sobre linha;
  - interpolação de alta ordem;
  - tabelas de resultados: circuitos (λ, L, R, perdas), integrais sobre linha e superfície com
    variáveis nomeadas pelo usuário, e fórmulas;
  - sinais do circuito no tempo;
  - exportação PNG/SVG/CSV/WebM.
- **API/console estilo Python:** cada ação vira um comando (`g.line(...)`, `m.region(...)`,
  `s.solve()`). O botão "exportar código" gera um script que recria o modelo exatamente, base para
  automação e otimização.
- **Ponte para scripts locais** ([`bridge/python`](bridge/python)): `python -m magfem` liga scripts
  (Python, ou qualquer linguagem por HTTP/JSON) ao modelo aberto no navegador — muda variáveis, resolve
  e lê resultados (`r.result`, `r.series`) com o desenho atualizando ao vivo.
- Interface em **português e inglês**, com tema claro e escuro e "Cite este trabalho".

Veja [`doc/`](doc/) para o guia de uso, a referência da API e a formulação e validação numérica. Veja
[`PLAN.md`](PLAN.md) para o histórico do desenvolvimento.

## Rodar localmente

Pré-requisitos: Docker (e `cmake`/`g++` para os testes nativos do núcleo).

```bash
git clone git@github.com:thalesmaoa/magfem.git && cd magfem
./compose-up                  # compila o núcleo WASM e sobe http://localhost:3002/tools/magfem-web/
./scripts/build-core native   # núcleo C++ nativo + testes contra soluções analíticas
./scripts/npm test            # testes unitários (vitest)
./scripts/e2e                 # testes de ponta a ponta (Playwright, headless)
```

`./scripts/npm run build` gera o site estático em `web/dist`. Qualquer servidor de arquivos
estáticos serve; o CI publica o `dist` na branch `dist`.

## Estrutura

```
core/      núcleo numérico C++17 + Eigen + Tangle → WebAssembly (Emscripten) e nativo (testes)
web/       interface Vite + React + TypeScript; malha e solver rodam num Web Worker
bridge/    ponte para scripts locais (pacote Python `magfem`, só biblioteca padrão)
doc/       documentação (uso, API, formulação, validação) e logo
```

## Contribuir

Issues e pull requests são bem-vindos. Antes de enviar, rode `./scripts/npm test`, `./scripts/e2e` e
`./scripts/build-core native`. O código segue o estilo do entorno (comentários em português,
TypeScript estrito).

## Licença

Código do MagFEM: **MIT** (veja [`LICENSE`](LICENSE)). Use, modifique e redistribua à vontade.

Componentes de terceiros:
- **Eigen** (MPL-2.0).
- **PlaneGCS/FreeCAD** via `@salusoft89/planegcs` (LGPL-2.1).
- **Tangle**, de David Meeker (MIT): o gerador de malha, o mesmo do FEMM.
- **Biblioteca de materiais** (`web/src/data/femm-matlib.json`, 245 materiais): convertida do
  `matlib.dat` do **FEMM 4.2** (David Meeker, [femm.info](https://www.femm.info)), distribuído sob a
  Aladdin Free Public License (redistribuição gratuita, sem uso comercial). O crédito é do FEMM. Em
  *Materiais → Importar do FEMM…* também dá para ler o `matlib.dat` da sua instalação.

## Citar

Maia, T. (2026). *MagFEM: A Web-Based Magnetic Finite Element Analysis Tool* (Versão 1.0.0).
<https://thalesmaia.com/tools/magfem-web/>. O botão "Citar" no app dá a citação completa e o
BibTeX.

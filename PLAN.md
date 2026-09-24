# PLAN.md — Estado e Progresso do magfem-web

## 🚀 Checklist de execução

### [✅ CONCLUÍDA] Fase 1: Esqueleto
- [x] Estrutura do repositório (`core/`, `web/`, `bridge/`, `clients/`, `examples/`) — repo só local por enquanto.
- [x] Docker: serviço `web` (node:22-alpine, porta 3002) e serviço `core` (emscripten/emsdk:4.0.10, profile `build`).
- [x] `core/` em CMake com Eigen 3.4.0 (FetchContent), alvo WASM (embind, ES6, MODULARIZE) e alvo nativo com teste (Poisson 1D).
- [x] `web/`: Vite + React + TS, Worker do solver com protocolo tipado e cliente com promessas.
- [x] Workflow de CI (`.github/workflows/build.yml`) publicando `web/dist` na branch `dist`.
- [x] Validar build WASM + app no browser (confirmado pelo usuário).
- [ ] Criar repo no GitHub (quando decidido) e adicionar ao workflow do portal: checkout da branch `dist` de `magfem-web` → `cp` para `docs/tools/magfem-web`.

### [✅ CONCLUÍDA] Fase 2: Sketcher
- [x] Modelo do sketch (`web/src/cad/types.ts`): pontos, linhas, círculos, arcos (anti-horários), restrições e cotas; origem fixa `O`.
- [x] Ponte com o PlaneGCS (`cad/solver.ts`): tradução das restrições, arraste com restrições temporárias (ponto e raio), DOF, detecção de conflito/redundância e de curvas colapsadas.
- [x] Documento com histórico (`cad/doc.ts`): commit rejeita conflito/redundância/degeneração; inferências automáticas entram só se forem consistentes; desfazer/refazer.
- [x] Editor Canvas2D (`cad/editor.ts`, `render.ts`, `dimgeom.ts`): linha (polilinha), retângulo, círculo, arco 3 pontos, arco pelo centro, ponto; snap em pontos e curvas; inferência H/V; seleção por clique/Shift/caixa; arraste resolvido ao vivo; pan/zoom; construção; fixar; apagar com limpeza de órfãos.
- [x] Restrições: coincidente (vira "ponto sobre" com curva), horizontal, vertical, paralela, perpendicular, tangente, igual, ponto médio, simétrica, concêntrica.
- [x] Cotas estilo Onshape: distância (alinhada / horizontal / vertical conforme a posição do texto), ponto-linha, raio (arco), diâmetro (círculo), ângulo; edição por duplo clique; texto arrastável.
- [x] Arquivo `.magfem` (JSON) com File System Access API + fallback download/upload; rascunho automático em IndexedDB.
- [x] Testes: 8 unitários (vitest, `npm test`) + 12 E2E (Playwright/Chromium headless em Docker, `./scripts/e2e`).

Limitações conhecidas / ideias para depois:
- Cor por entidade (definida/sub-definida) — hoje só o DOF global muda a cor de tudo.
- Ferramentas de edição: aparar (trim), estender, filete, offset, arco tangente. Aparar será importante para as regiões (Fase 4).
- Cotas por expressão/variável ficam para a Fase 3.

### [✅ CONCLUÍDA] Rodada de ajustes da Fase 2 (feedback do usuário) + parte da Fase 3
- [x] Cotas com duas seleções: ângulo (mede o **setor onde o texto é solto**, guardado em `flip`), distância entre paralelas, ponto-linha, centros de círculos/arcos; pré-seleção + `D`.
- [x] Variáveis com expressões e unidades (`cad/expr.ts`): `50 mm`, `Ds/2 - g`, `360 deg / n`, trigonometria; cotas ligadas a variáveis; renomear atualiza referências; apagar variável em uso é bloqueado.
- [x] Unidade de exibição (µm, mm, cm, m, in; interno sempre mm); cotas mostram unidade.
- [x] Grupos estilo draw.io (Ctrl+G / Ctrl+Shift+G, clique pega o grupo, duplo clique entra, ocultar/mostrar, renomear) e mover/girar (Δx, Δy, ângulo, pivô) com expressões. Rotação troca H↔V em múltiplos de 90° e remove H/V internas nos demais ângulos (com aviso).
- [x] Retângulo pelo centro (Shift+R); soltar um ponto sobre outro une (coincidente) ou sobre curva (ponto sobre).
- [x] Histórico com o **código equivalente** (API Python `magfem`, esboço da Fase 7) num console recolhível embaixo do canvas; "copiar script".
- [x] Layout: **árvore do modelo** à esquerda (Pré-processador › Geometria + Físicas; Malha e Pós incluídos pelo usuário pelo "+"; várias físicas já suportadas → multifísica) com propriedades do nó selecionado; **gaveta oculta à direita** com Problema (unidade, tipo planar/axissimétrico, profundidade), Variáveis e Grupos. Tipo de análise (magnetostática/AC/transiente) fica no nó da física.
- [x] Tooltips com atalho nos botões; interface **PT/EN** (`src/i18n`); **Cite este trabalho** (citação completa ABNT/APA + BibTeX, dados em `cad/citation.ts`).
- [x] Testes: 21 unitários + 22 E2E.

### [✅ CONCLUÍDA] Rodada 3 de ajustes
- [x] Cor por entidade (preto = totalmente definida, azul = livre), calculada por sondagem de DOF (`definedEntities` em `cad/solver.ts`); arrastar algo definido mostra aviso em vez de "não fazer nada"; cursor "proibido" sobre o que está travado.
- [x] Retângulo nasce agrupado ("Retângulo N"): clique num lado pega o retângulo; vértices continuam arrastáveis (redimensionar, unir com a origem); duplo clique edita um lado.
- [x] Mover/girar virou botão na barra (atalho G) com popover; Restrições foram para a gaveta da direita; propriedades da Geometria mostram só a seleção.
- [x] "Soltar da origem" (`detachFromPoint`): curvas presas a um ponto fixo ganham um ponto próprio no mesmo lugar; aviso específico ao tentar arrastar algo preso à origem.
- [x] Testes: 23 unitários + 24 E2E.

### [✅ CONCLUÍDA] Rodada 4 de ajustes
- [x] Barra: famílias de ferramentas com menu (Linha/Linha de construção, Retângulo vértices/centro, Arco 3 pontos/centro), como no Onshape; barra quebra linha em janela estreita.
- [x] Linha de construção (Shift+L), tracejada; não vira região.
- [x] Árvore estilo Onshape: Geometria › Variáveis, Origem, grupos (expansíveis, ocultar, renomear) e entidades (linhas, círculos, arcos, pontos) — clique seleciona no desenho, duplo clique renomeia (`name` na entidade; o id continua na API). (+) da Geometria inclui Variável ou Grupo (da seleção). Variável selecionada → propriedades editáveis.
- [x] Restrições também na árvore (Geometria › Restrições): expandir, selecionar, editar cota, apagar.
- [x] Testes: 23 unitários + 29 E2E.

### [✅ CONCLUÍDA] Rodada 5 de ajustes
- [x] Medidas nas Propriedades (`cad/inspect.ts`): x/y/ρ/θ do ponto; comprimento/ângulo/Δx/Δy da linha; centro/raio/área/perímetro do círculo; abertura e comprimento do arco; distância mínima entre os dois itens selecionados (inclusive grupos), desenhada no canvas; área e perímetro de contorno fechado (linhas + arcos).
- [x] Régua (U): mede distância, Δx, Δy e ângulo entre dois cliques (com encaixe), sem alterar o desenho.
- [x] Árvore: Geometria e **Solucionador** (Malha + físicas, com o tipo de análise ao lado; (+) próprio). Pós-processador fica no topo. Projeto novo já vem com Malha e Campo magnético.
- [x] Gaveta da direita só com Problema (Variáveis e Restrições ficam na árvore).
- [x] Nome **MagFEM** (topo, título da página, citação "MagFEM: A Web-Based Magnetic Finite Element Analysis Tool"; BibTeX com chaves para preservar maiúsculas).
- [x] Testes: 25 unitários + 30 E2E.

### [✅ CONCLUÍDA] Rodada 6 de ajustes
- [x] Console interativo (`cad/console.ts`): subconjunto de Python com a mesma API do histórico; objetos **g** (Geometria; `d` é apelido; sem objeto também vale), **m** (Malha), **s** (Solucionador), **r** (Resultados); `getid("nome")` em qualquer grafia; `help()`; Tab autocompleta (métodos com assinatura, nomes entre aspas); ↑/↓ histórico; colar várias linhas; redimensionável e destacável em outra janela.
- [x] Nomes únicos no desenho; `getid` resgata o id pelo nome.
- [x] Variáveis aceitam `=1+1` e funções (abs, sqrt, sin, cos, tan, atan2, exp, ln/log, log10, pow, min, max, round…).
- [x] Offset (O), Espelhar (eixo X/Y/linha), Padrão linear (x, y) e Padrão circular — copiam as restrições internas; resultado vira grupo; também no console.
- [x] Árvore com as 4 seções fixas: Geometria, Malha, Solucionador, Resultados (cada uma com seu +).
- [x] Graus de liberdade em negrito até chegar a zero; renomear projeto com duplo clique no topo; correção: caixa de renomear fecha com Esc/clique fora.
- [x] Ícone MagFEM (ímã em ferradura malhado + linhas de fluxo; ver `docs/logo/`), ícones no menu de arquivo, **Exportar** SVG/DXF (mm) e PNG/JPG.
- [x] Tema escuro (automático/claro/escuro), inclusive o canvas; exportação de imagem sempre clara.
- [x] Testes: 30 unitários + 36 E2E.

### [✅ CONCLUÍDA] Rodada 7 de ajustes
- [x] **Offset paramétrico** (como no Onshape): grupo-filho do original na árvore; todos os lados à mesma distância (parâmetro do solver `off_<grupo>`); cota verde "offset d" no desenho (duplo clique edita; negativo inverte o lado); arrastar o offset muda a distância e atravessar o original troca o lado; mudar a distância recoloca o offset sem mover o original; cota entre offset e original abre a cota do offset; apagar o original apaga o offset.
- [x] **Espelho associativo**: simetria ponto a ponto em relação ao eixo (X/Y ou linha escolhida clicando no desenho); pontos sobre o eixo compartilhados.
- [x] Padrões linear e circular num botão com menu; restrições internas (offset/espelho) escondidas da lista; "Fixar" remove restrições que ficariam redundantes; Del apaga variável selecionada na árvore; cursor "mover" sobre o offset.
- [x] **Snap no ponto médio** de linhas (triângulo) → cria a restrição "ponto médio".
- [x] "Solucionador" → "Método de resolução" (em inglês continua "Solver"); ícone de variável maior.
- [x] Testes: 31 unitários + 41 E2E.

### [✅ CONCLUÍDA] Rodada 8 — padrões associativos
- [x] Padrão linear: cópias presas à vizinha por Δx/Δy (parâmetros do solver `pdx_/pdy_<grupo>`); circular: raio igual e passo angular (`pang_<grupo>`) entre linhas auxiliares centro→ponto. Mexer na origem leva as cópias; arrastar uma cópia muda o espaçamento (a origem fica parada); Propriedades editam quantidade/passo/ângulo (quantidade refaz no mesmo grupo); grupo-filho da origem na árvore com resumo ("3×1 · 30 mm", "6 × 360°"); `g.set_pattern(...)` no console.
- [x] Testes: 31 unitários + 42 E2E.

### [✅ CONCLUÍDA] Rodada 9 — Malha: regiões, materiais e contornos (Fase 4, parte 1)
- [x] Arranjo planar (`cad/regions.ts`): cruzamentos linha/arco/círculo → arestas → faces com furos; área exata (analítica nos arcos); borda externa detectada. Identidade da região = curvas do contorno + ponto-semente (sobrevive a mudanças paramétricas).
- [x] Clicar em **Malha** mostra o desenho no modo malha: regiões preenchidas pela cor do material (hachura = sem material), rótulos, contornos coloridos por tipo; a borda externa é **A = 0 por padrão**.
- [x] Árvore em Malha: **Materiais** (biblioteca editável: nome, cor, μr, σ, Br, curva B-H), **Regiões** (material, corrente total, espiras, direção do ímã) e **Contornos** (A = 0, Neumann, periódico/antiperiódico em pares).
- [x] Console: `m.material`, `m.del_material`, `m.region((x, y), material=…)`, `m.boundary([ids], tipo)`, `m.regions()`; a interface grava esses comandos no histórico.
- [x] Correção: a linha de chamada da cota ponto-linha saía do pé da perpendicular (no prolongamento da linha); agora parte do segmento.
- [x] Testes: 40 unitários + 46 E2E.

### Próximo possível
- Gerar a malha (Triangle em WASM, tamanho por região) no (+) de Malha e visualizá-la (Fase 5).
- Importar DXF/SVG no menu Arquivo; aparar (trim) para fechar regiões.

### [⏳ PENDENTE] Fases 3–9
Ver seção "Fases" abaixo.

---

## Decisões adicionais
- Nome: `magfem-web`. Repositório só local por enquanto.
- Local-first estilo draw.io/Excalidraw (sem backend).

---


## Contexto

Ferramenta nova da família `ee-web-tools`, mas grande o bastante para ter **repositório próprio**
(nome provisório: `magfem-web`; você decide). Objetivo: um "FEMM moderno" que roda 100 % no browser,
publicado em `thalesmaia.com/tools/<nome>/`, com:

- **CAD 2D estilo Onshape** (sketch com restrições, cotas ligadas a variáveis, regiões detectadas
  automaticamente, atribuição de materiais/correntes/ímãs por região);
- **importação/exportação SVG e DXF**;
- **solver magnetostático (linear e não linear) e transitório** — plano XY e axissimétrico RZ;
- **API local** para que um script do usuário (Python, Matlab, Julia, Lua…) controle a geometria,
  malha, solução e pós-processamento, permitindo otimização.

Decisões já tomadas: **2D + axissimétrico**; núcleo numérico em **C++17 estilo C + Eigen**;
stack de front igual ao `im-calc-map` (React + TS + Vite + Docker `node:22-alpine`).

### Sobre o WebVM
Não vamos usar. WebVM emula uma máquina x86 Linux inteira no browser (lento, dezenas de MB).
O caminho certo é **compilar o código C/C++ direto para WebAssembly com Emscripten**: roda
perto da velocidade nativa, e **o mesmo código compila nativo** (para testes e modo headless).

---

## Arquitetura

```
┌──────────────────────── Browser (GitHub Pages, estático) ────────────────────────┐
│ React/TS UI                                                                       │
│  ├─ Sketcher (Canvas2D/SVG)  ── planegcs (WASM, solver de restrições do FreeCAD)   │
│  ├─ Variáveis/expressões     ── avaliador próprio (ou mathjs), grafo de dependência│
│  ├─ Regiões                  ── arranjo planar (linhas+arcos → faces) em TS        │
│  ├─ IO                       ── dxf-parser (import), writer DXF R12 próprio, SVG   │
│  └─ Visualização de campo    ── WebGL2 (mapa de |B|, linhas de fluxo = isolinhas A)│
│                                                                                   │
│ Web Worker ── core.wasm (C++/Eigen): malha (Triangle) + montagem + solver + pós    │
│                                                                                   │
│ "Conectar script local" ── WebSocket → ws://127.0.0.1:<porta> (com chave)          │
└───────────────────────────────────────────────────────────────────────────────────┘
                         ▲ WebSocket (JSON-RPC)
┌────────────── Máquina do usuário ─────────────┐
│ magfem-bridge (binário pequeno, Go ou Python)  │
│   ├─ WebSocket server p/ o browser             │
│   └─ HTTP/JSON REST em 127.0.0.1 p/ scripts    │
│ Script do usuário: Python / Matlab / Julia /   │
│   Lua / curl — qualquer coisa que fale HTTP    │
└────────────────────────────────────────────────┘
```

### Como a "API com chave" funciona (a sua ideia, estilo Tasmota)
O Tasmota usa **WebSerial**: o browser *abre* a porta serial. O análogo aqui é o browser *abrir*
uma conexão com um processo local — **uma página web não consegue ficar escutando conexões**, então
alguém local precisa ser o servidor. Por isso um **bridge local**:

1. Usuário roda `magfem-bridge` (ou `pip install magfem` e o próprio script sobe o bridge).
   Ele imprime uma **chave de pareamento** e a porta.
2. No site, "Conectar script local" → cola a chave → a página abre `ws://127.0.0.1:<porta>`.
   O Chrome mostra uma vez o prompt de *Local Network Access* (permitido; é o mecanismo oficial).
3. O script do usuário manda comandos ao bridge via **HTTP/JSON** (linguagem-agnóstico); o bridge
   repassa ao browser, que executa com o solver WASM e devolve o resultado. Você **vê a geometria
   mudar ao vivo** durante a otimização.
4. Wrappers finos: `magfem.py` (primeiro), depois `magfem.m` (Matlab) e `magfem.jl`. Qualquer
   outra linguagem usa o REST direto (documentado com exemplos `curl`).

API no espírito do FEMM (conhecida de quem usa FEMM/Lua):
`set_var("g", 0.5)`, `rebuild()`, `mesh()`, `solve()`, `get("torque")`, `flux_linkage("A")`,
`export_field(...)`, além de comandos de geometria (`add_line`, `add_arc`, `set_region`…).

**Extra futuro (mesmo protocolo):** modo headless — o bridge executa o `core` compilado nativo,
sem browser, para varreduras longas. Como o núcleo é o mesmo código C++, sai quase de graça.

---

## Componentes e bibliotecas

| Parte | Escolha | Licença / observação |
|---|---|---|
| Solver de restrições do sketch | `@salusoft89/planegcs` (PlaneGCS do FreeCAD em WASM, com tipos TS) | LGPL — ok como dependência |
| Sketcher (UI) | próprio, Canvas2D + React; referência de UX: Onshape, `jsketcher` | — |
| Regiões | arranjo planar próprio (interseção linha/arco, half-edge, extração de faces) | é a parte "difícil do CAD" |
| Padrões/simetria | array circular/linear, espelho — essenciais para máquinas elétricas | — |
| DXF | import `dxf-parser` (MIT); export: writer DXF R12 próprio (LINE/ARC/CIRCLE/LWPOLYLINE) | — |
| SVG | import via parser de path (arcos elípticos → aproximação/conversão), export direto | — |
| Malha | **Triangle** (Shewchuk, C) em WASM, refinamento por região | livre p/ uso não comercial — ok p/ ferramenta gratuita; alternativa: `CDT` (MPL2) + refinamento próprio |
| Álgebra | Eigen (header-only, MPL2): `SimplicialLDLT`, `ConjugateGradient`+IC, `SparseLU` | — |
| Build WASM | Emscripten via Docker `emscripten/emsdk`, CMake (alvo wasm e nativo) | — |
| Visualização | WebGL2 próprio (triângulos coloridos + isolinhas) | — |

**Threads:** começar single-thread no Worker. WASM multi-thread exige COOP/COEP, que GitHub Pages
não permite configurar (contorno: `coi-serviceworker`). Adiar até precisar.

---

## Formulação numérica (núcleo C++)

- Potencial vetor magnético `A_z` (plano) / `r·A_φ` (axissimétrico), triângulos de 1ª ordem
  (2ª ordem depois).
- Materiais: linear, **não linear com curva B-H** (Newton-Raphson com relaxação; ν(B²) por spline
  monotônica), ímãs permanentes (Br, direção por região, inclusive radial/paralela), laminação.
- Contorno: Dirichlet, Neumann, **periódico/antiperiódico** (fundamental para cortar 1 polo).
- Fontes: densidade de corrente, bobinas por espiras, **circuitos** (alimentação por tensão).
- **Transitório:** Euler implícito, correntes parasitas em condutores maciços, acoplamento
  campo-circuito, depois **movimento** (banda deslizante / moving band) para máquinas girando.
- Pós: B, H, energia/coenergia, fluxo concatenado, indutância, **torque** (Arkkio e tensor de Maxwell),
  forças, perdas (Joule, parasitas; ferro por Steinmetz depois).
- Validação: casos analíticos + comparação com **FEMM** nos mesmos modelos (alvo: erro < 1 %).
  Extra útil: **importar `.fem` do FEMM** (texto simples) — facilita migração e validação.

---

## Modelo de dados (projeto = JSON)

```
project.json
├─ variables: [{name, expr, unit}]           # "g = 0.5 mm", "Dr = Ds - 2*g"
├─ sketch: {points, curves, constraints}      # cotas referenciam variáveis
├─ features: [pattern, mirror, ...]           # histórico estilo Onshape
├─ regions: [{seed/face_id, material, source, mesh_size}]
├─ boundaries: [{edges, type}]
├─ materials: biblioteca (aços M19/M400-50A, NdFeB N42, cobre, ar…)
└─ analysis: {type: static|transient, planar|axi, depth, dt, t_end, circuits}
```
Regiões são identificadas por um ponto-semente (como block labels do FEMM) para sobreviver a
mudanças paramétricas da topologia.

### Local-first, estilo draw.io / Excalidraw
- **Sem backend, sem login, sem nuvem.** O site é só estático; os dados nunca saem da máquina.
- Abrir/salvar arquivo `.magfem` (JSON) direto no disco com a **File System Access API**
  (Chrome/Edge: "Salvar" regrava o mesmo arquivo, como um app desktop); fallback de
  upload/download no Firefox/Safari.
- Rascunho automático em IndexedDB (recupera se fechar a aba sem salvar).
- **PWA instalável e offline**: depois da primeira visita funciona sem internet, com ícone próprio.
- Resultados pesados (malha, campos) podem ser salvos junto (opcional) ou recalculados ao abrir.

---

## Estrutura do repositório novo

```
magfem-web/
├─ PLAN.md                 # estado entre sessões (padrão do im-calc-map)
├─ docker-compose.yml, compose-up, stack.env   # dev (node) + serviço emsdk p/ compilar core
├─ core/                   # C++17 + Eigen + Triangle; CMakeLists (wasm e nativo)
│  ├─ src/{mesh,assemble,material,solve_static,solve_transient,post}.cpp
│  ├─ bindings/wasm_api.cpp  # embind/ccall, buffers tipados
│  └─ tests/               # casos analíticos, rodam nativo no CI
├─ web/                    # Vite + React + TS
│  └─ src/{cad,regions,io,variables,mesh-view,field-view,worker,bridge-client}/
├─ bridge/                 # servidor local (WS p/ browser + REST p/ scripts)
├─ clients/{python,matlab,julia}/
└─ examples/               # motor IPM, indutor EE, solenoide axissimétrico
```

**Deploy:** CI do repo novo compila (emsdk + vite) e publica o `dist` em uma branch `dist`.
O workflow do portal (`portal/.github/workflows/*.yml`, bloco "Copy EE Web Tools into docs")
ganha um checkout dessa branch e um `cp` para `docs/tools/<nome>` — sem precisar de emsdk no portal.
`vite.config.ts` com `base: '/tools/<nome>/'`, como no `im-calc-map`.

---

## Fases (cada uma entrega algo usável)

1. **Esqueleto** — repo, Docker (node + emsdk), CMake, "hello" WASM no Worker, CI, deploy no portal.
2. **Sketcher** — ponto/linha/arco/círculo, snap, restrições (coincidente, H/V, paralelo,
   tangente, igual, distância, raio, ângulo) via planegcs, undo/redo, pan/zoom, salvar JSON.
3. **Parametrização** — tabela de variáveis, cotas com expressões, regeneração; padrões circular/linear
   e espelho.
4. **Regiões + IO** — arranjo planar → faces, seleção de região, materiais, contornos; import/export
   DXF e SVG.
5. **Malha** — Triangle em WASM, tamanho por região, visualização.
6. **Magnetostático** — linear → não linear, plano e axissimétrico, ímãs, periodicidade; pós básico
   (|B|, linhas de fluxo, torque, fluxo concatenado). Validar contra FEMM.
7. **Bridge + API** — bridge local, pareamento por chave, REST, `magfem.py`, exemplo de otimização
   (scipy) de um parâmetro de motor.
8. **Transitório + acoplamentos (objetivo central do usuário)** — Euler implícito, correntes parasitas e movimento
   (banda deslizante / malha deformável), **acoplados a circuitos e a EDOs definidas pelo usuário**:
   - circuito elétrico: fontes, R, L, C e bobinas do FEM (KVL com v = R·i + dλ/dt, λ vindo do campo);
   - EDOs de estado escritas pelo usuário (ex.: contatora: m·ẍ = F_mag(x, i) − k·x − c·ẋ; ou controle,
     térmico simples), com acesso a saídas do FEM (força, torque, fluxo concatenado, corrente) e
     às variáveis do projeto;
   - acoplamento forte: campo + circuito + EDO resolvidos juntos a cada passo (Newton sobre o sistema
     monolítico), com opção de acoplamento fraco (alternado) para modelos grandes;
   - a geometria móvel usa grupos + variáveis (ex.: deslocamento `x` do núcleo da contatora movendo o grupo).
9. Extras — 2ª ordem, perdas no ferro, import `.fem`, headless nativo, Matlab/Julia.

---

## Verificação

- `core/tests` nativo no CI: solenoide/ímã/entreferro com solução analítica; convergência com refino.
- Comparação com FEMM em 3 modelos de referência (indutor EE, solenoide axissimétrico, motor IPM):
  energia, fluxo concatenado, torque.
- Testes de ida-e-volta DXF/SVG (exportar → importar → mesma geometria), inclusive DXFs do
  LibreCAD/QCAD/FreeCAD.
- E2E: `./compose-up`, abrir `localhost`, desenhar, resolver; `python examples/opt_airgap.py` via
  bridge mudando a geometria ao vivo no browser.

## Pendências para decidir depois
- Nome do repositório.
- Bridge em Go (binário único, sem dependências) vs Python (mais fácil de manter para você) —
  sugestão: começar em Python junto com `magfem.py`, portar para Go se for distribuir.

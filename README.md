# magfem-web

Elementos finitos magnéticos 2D (plano e axissimétrico), magnetostático e transitório, **rodando
inteiramente no browser**: CAD paramétrico estilo Onshape, malha, solver e pós-processamento.
Local-first, no estilo draw.io/Excalidraw: sem backend, os projetos ficam na máquina do usuário.

Publicação prevista em `thalesmaia.com/tools/magfem-web/`.

## Estrutura

```
core/      núcleo numérico C++17 + Eigen -> WebAssembly (Emscripten) e nativo (testes)
web/       interface Vite + React + TypeScript; o solver roda num Web Worker
bridge/    (futuro) ponte local WebSocket/REST para scripts de otimização
clients/   (futuro) wrappers Python / Matlab / Julia
examples/  (futuro) modelos de referência
```

## Desenvolvimento

Pré-requisitos: Docker. (Para os testes nativos: `cmake` e `g++`.)

```bash
./compose-up                  # compila o núcleo WASM e sobe http://localhost:3002/tools/magfem-web/
./scripts/build-core native   # compila o núcleo nativo e roda os testes
./scripts/build-core wasm     # só recompila o WASM (web/src/wasm/core.{js,wasm})
./scripts/npm test            # testes unitários do front (vitest); ./scripts/npm roda npm no container
./scripts/e2e                 # testes E2E (Playwright headless) contra o servidor de dev
```

## Interface

- **Esquerda — árvore do modelo:** Pré-processador › Geometria e Físicas; Malha e Pós-processador são incluídos
  pelo `+`. Embaixo, as propriedades do item selecionado (na Geometria: seleção, mover/girar, restrições).
- **Direita — gaveta oculta** (aba vertical): Problema (unidade, planar/axissimétrico, profundidade), Variáveis, Grupos.
- **Embaixo — console:** cada ação aparece como o comando equivalente da API Python (`s.line(...)`, `s.angle(...)`).
- Idioma PT/EN e "Cite este trabalho" no topo.

| Atalho | Ação | Atalho | Ação |
|---|---|---|---|
| `L` | linha (polilinha) | `I` | coincidente / ponto sobre |
| `R` / `Shift+R` | retângulo por vértices / pelo centro | `H` / `V` | horizontal / vertical |
| `C` | círculo | `E` | igual |
| `A` / `Shift+A` | arco por 3 pontos / pelo centro | `T` | tangente |
| `P` | ponto | `M` | ponto médio |
| `D` | cota (1 ou 2 entidades; ou selecione antes) | `Q` | construção |
| `Ctrl+G` / `Ctrl+Shift+G` | agrupar / desagrupar | `F` | ajustar vista |
| `Esc` | cancelar / selecionar | `Del` | apagar |
| `Ctrl+Z` / `Ctrl+Shift+Z` | desfazer / refazer | `Ctrl+S` / `Ctrl+O` | salvar / abrir |

Roda do mouse = zoom no cursor; botão do meio, direito ou espaço+arrastar = mover a vista.
Cotas aceitam número (`12,5`), unidade (`2 cm`, `15 deg`) ou expressão com variáveis (`Ds/2 - g`).
Arrastar um ponto sobre outro une os dois. A cota de ângulo mede o setor onde o texto é posicionado.

## Licença

Propriedade de Thales Maia. Todos os direitos reservados. Dependências: Eigen (MPL2), PlaneGCS/FreeCAD via `@salusoft89/planegcs` (LGPL), Triangle 1.6 de J. R. Shewchuk (gerador de malha; uso e distribuição livres desde que sem cobrança e com o aviso de copyright — uso comercial exige acordo com o autor; o código-fonte vem do netlib no build).

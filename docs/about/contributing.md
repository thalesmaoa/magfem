# Contribuir

**Relatos de erro são muito bem-vindos.** Abra uma issue em
<https://github.com/thalesmaoa/magfem/issues>; também há um link **Bug reports** na barra de status do app. Ajuda
muito anexar o projeto (`.magfem`) ou o script exportado (`</>`), que recria o modelo exatamente.

## Rodar localmente

Requisitos: Docker (e `cmake`/`g++` para os testes nativos do núcleo).

```bash
git clone https://github.com/thalesmaoa/magfem.git && cd magfem
./compose-up                  # compila o núcleo WASM e serve http://localhost:3002/tools/magfem-web/
./scripts/build-core native   # núcleo C++ nativo + testes contra soluções analíticas
./scripts/npm test            # testes unitários (vitest)
./scripts/e2e                 # testes ponta a ponta (Playwright, headless)
./scripts/check               # todas as baterias
```

## Organização

```
core/      núcleo numérico C++17 + Eigen + Tangle → WebAssembly (Emscripten) e nativo (testes)
web/       interface Vite + React + TypeScript; malha e solver num Web Worker
bridge/    ponte para scripts (pacote Python magfem; clientes Matlab e Julia)
docs/      esta documentação (VitePress)
```

## Esta documentação

A documentação fica em `docs/`, em Markdown, com as páginas em português na raiz e em inglês em `docs/en/`.

```bash
./scripts/docs install        # uma vez
./scripts/docs run dev        # http://localhost:3003/tools/magfem-web/docs/
./scripts/docs run build      # gera docs/.vitepress/dist
./scripts/docs-shots          # regenera as capturas de tela (com o app rodando em :3002)
```

O CI gera a documentação junto com o app e a publica em `/tools/magfem-web/docs/`. Cada página tem o link
**Editar esta página no GitHub**.

## Estilo

Antes de enviar, rode `./scripts/check`. O código segue o estilo em volta (comentários em português, TypeScript
estrito).

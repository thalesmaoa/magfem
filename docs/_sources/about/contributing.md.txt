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
docs/      esta documentação (Sphinx)
```

## Esta documentação

A documentação usa **Sphinx** com o tema do **Read the Docs** e páginas em Markdown (**MyST**). Fica em `docs/`: as
páginas em português em `docs/pt/` e em inglês em `docs/en/`, com os mesmos nomes de arquivo (o seletor de idioma
troca uma pela outra), e as capturas de tela em `docs/img/`.

```bash
./scripts/docs                # gera docs/_build/html (cria docs/.venv na primeira vez)
./scripts/docs serve          # gera e serve em http://localhost:3003/
./scripts/docs-shots          # regenera as capturas de tela (com o app rodando em :3002)
```

O CI gera a documentação junto com o app e a publica em `/tools/magfem-web/docs/`. Cada página tem o link
**Editar esta página no GitHub**.

## Estilo

Antes de enviar, rode `./scripts/check`. O código segue o estilo em volta (comentários em português, TypeScript
estrito).

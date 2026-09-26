# Ponte com scripts locais

O MagFEM roda no navegador; a ponte deixa scripts no seu computador controlarem o modelo aberto.

1. `python -m magfem` (pasta [`python`](python), só biblioteca padrão) — mostra a porta e a chave.
2. No app: **Script local** (barra de status) → porta e chave.
3. O script manda linhas do console do MagFEM e recebe os valores.

| Linguagem | Cliente | Exemplo |
|---|---|---|
| Python | [`python/magfem`](python) — também sobe a ponte sozinho (`magfem.connect()`) | `mf.solve(); mf.result("Fx")` |
| Matlab / Octave | [`matlab/MagFEM.m`](matlab/MagFEM.m) | `mf = MagFEM('CHAVE'); mf.solve(); mf.result('Fx')` |
| Julia | [`julia/MagFEM.jl`](julia/MagFEM.jl) (HTTP.jl, JSON3.jl) | `mf = MagFEM.Client("CHAVE"); MagFEM.result(mf, "Fx")` |
| Qualquer outra | HTTP/JSON: `POST /run` | ver [`python/README.md`](python/README.md) |

Os clientes de Matlab/Octave e Julia foram testados (Octave 9.2 e Julia 1.10, no Docker) contra a
ponte com um navegador simulado: `bridge/python/tests/fake_session.py`.

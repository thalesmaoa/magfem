# Matlab, Julia e HTTP

A ponte é HTTP/JSON: além do Python, há clientes prontos para Matlab/Octave e Julia, e qualquer linguagem pode
usar o protocolo direto. Em todos os casos, rode antes a ponte (`python -m magfem --key CHAVE`) e conecte a página
pelo **Script local**.

## Matlab / Octave

Copie [`bridge/matlab/MagFEM.m`](https://github.com/thalesmaoa/magfem/blob/main/bridge/matlab/MagFEM.m) para o
seu path:

```matlab
mf = MagFEM('CHAVE');              % porta 8765
mf.set_var('g', '0.5 mm');
mf.solve();
fx = mf.result('Fx');
[t, i] = mf.series('Primario_I');
mf.run('g.circle((0, 0), r=5)');   % qualquer linha do console
```

Erros viram `error('MagFEM:run', ...)`. Testado no Octave 9.2.

## Julia

[`bridge/julia/MagFEM.jl`](https://github.com/thalesmaoa/magfem/blob/main/bridge/julia/MagFEM.jl) usa HTTP.jl e
JSON3.jl (`] add HTTP JSON3`):

```julia
include("MagFEM.jl"); using .MagFEM
mf = MagFEM.Client("CHAVE")
MagFEM.set_var(mf, "g", "0.5 mm")
MagFEM.solve(mf)
fx = MagFEM.result(mf, "Fx")
t, i = MagFEM.series(mf, "Primario_I")
```

Testado no Julia 1.10.

## Protocolo HTTP

| Rota | Faz |
|---|---|
| `GET /status` | `{"browser": true/false, "version": "..."}` (sem chave) |
| `POST /run` | executa linhas do console; corpo `{"code": "..."}` e cabeçalho `X-MagFEM-Key: CHAVE` |

A resposta de `/run` traz `ok`, `value` (o valor da última linha), `out` (as saídas) e, em erro, `error` e `line`:

```bash
curl -s -X POST http://127.0.0.1:8765/run -H "X-MagFEM-Key: CHAVE" \
     -d '{"code": "s.solve()\nr.result(\"Fx\")"}'
# {"ok": true, "value": -9.97, "out": []}
```

Linhas são executadas em ordem; malha e solução terminam antes da linha seguinte.

# Matlab, Julia and HTTP

The bridge speaks HTTP/JSON: besides Python there are ready clients for Matlab/Octave and Julia, and any language can
use the protocol directly. In every case, first run the bridge (`python -m magfem --key KEY`) and connect the page
through **Local script**.

## Matlab / Octave

Copy [`bridge/matlab/MagFEM.m`](https://github.com/thalesmaoa/magfem/blob/main/bridge/matlab/MagFEM.m) to your path:

```matlab
mf = MagFEM('KEY');                % port 8765
mf.set_var('g', '0.5 mm');
mf.solve();
fx = mf.result('Fx');
[t, i] = mf.series('Primary_I');
mf.run('g.circle((0, 0), r=5)');   % any console line
```

Errors become `error('MagFEM:run', ...)`. Tested with Octave 9.2.

## Julia

[`bridge/julia/MagFEM.jl`](https://github.com/thalesmaoa/magfem/blob/main/bridge/julia/MagFEM.jl) uses HTTP.jl and
JSON3.jl (`] add HTTP JSON3`):

```julia
include("MagFEM.jl"); using .MagFEM
mf = MagFEM.Client("KEY")
MagFEM.set_var(mf, "g", "0.5 mm")
MagFEM.solve(mf)
fx = MagFEM.result(mf, "Fx")
t, i = MagFEM.series(mf, "Primary_I")
```

Tested with Julia 1.10.

## HTTP protocol

| Route | Does |
|---|---|
| `GET /status` | `{"browser": true/false, "version": "..."}` (no key) |
| `POST /run` | runs console lines; body `{"code": "..."}` and header `X-MagFEM-Key: KEY` |

The `/run` response carries `ok`, `value` (the value of the last line), `out` (outputs) and, on error, `error` and
`line`:

```bash
curl -s -X POST http://127.0.0.1:8765/run -H "X-MagFEM-Key: KEY" \
     -d '{"code": "s.solve()\nr.result(\"Fx\")"}'
# {"ok": true, "value": -9.97, "out": []}
```

Lines run in order; meshing and solving finish before the next line.

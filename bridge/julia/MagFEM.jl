"""
    MagFEM — controla o MagFEM (no navegador) pela ponte local.

Rode antes, num terminal: `python -m magfem` (mostra a porta e a chave); no app: "Script local".

    using .MagFEM                     # include("MagFEM.jl") antes
    mf = MagFEM.Client("CHAVE")       # porta 8765
    MagFEM.set_var(mf, "g", "0.5 mm")
    MagFEM.solve(mf)
    fx = MagFEM.result(mf, "Fx")
    t, i = MagFEM.series(mf, "Primario_I")
    MagFEM.run(mf, "g.circle((0, 0), r=5)")   # qualquer linha do console

Dependências: HTTP.jl e JSON3.jl (`] add HTTP JSON3`).
"""
module MagFEM

using HTTP, JSON3

struct Client
    base::String
    key::String
end
Client(key::AbstractString; port::Integer = 8765) = Client("http://127.0.0.1:$port", String(key))

q(v) = JSON3.write(string(v))  # texto entre aspas, com escapes

"Executa linhas do console; devolve o valor da última (erro → exceção)."
function run(c::Client, code::AbstractString)
    r = HTTP.post(c.base * "/run", ["Content-Type" => "application/json", "X-MagFEM-Key" => c.key],
                  JSON3.write(Dict("code" => code)); status_exception = false)
    res = JSON3.read(String(r.body))
    if !get(res, :ok, false)
        line = get(res, :line, nothing)
        error(string(get(res, :error, "erro desconhecido"), line === nothing ? "" : " (linha: $line)"))
    end
    get(res, :value, nothing)
end

set_var(c::Client, name, expr) = run(c, "g.var($(q(name)), $(q(expr)))")
solve(c::Client, physics = nothing) = run(c, physics === nothing ? "s.solve()" : "s.solve($(q(physics)))")
result(c::Client, name) = Float64(run(c, "r.result($(q(name)))"))
function series(c::Client, name)
    v = run(c, "r.series($(q(name)))")
    (collect(Float64, v[1]), collect(Float64, v[2]))
end

end # module

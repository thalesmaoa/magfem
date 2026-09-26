"""Fechamento de um atuador de êmbolo (contator CC), acoplando circuito, campo e mecânica por código.

A cada passo de tempo:
  elétrico   λ ← λ + Δt·(V − R·i)          (a corrente sai de λ(g, i) do FEM, corrigida pela secante)
  mecânico   m·g'' = F_mola(g) − F_mag(g, i) (F_mag: tensor de Maxwell ponderado no êmbolo)
  geometria  o entreferro g muda → o modelo é remontado, malhado e resolvido pelo MagFEM.

Uso:  python examples/contator.py [--port 8765] [--key CHAVE] [--passos 60]
No app: "Script local" com a porta e a chave. Saída: tabela t, g, i, λ, F (e contator.csv).
"""

import argparse

import magfem

# Atuador axissimétrico (mm): carcaça em C, polo fixo, êmbolo móvel acima do polo, bobina na janela.
N, R, V = 1000, 20.0, 24.0  # espiras, resistência (Ω), tensão CC aplicada em t = 0 (V)
G0, GMIN = 4.0, 0.2  # entreferro inicial e residual (mm)
M_EMB, K_MOLA, F0_MOLA = 0.05, 200.0, 2.0  # massa (kg), mola (N/m), pré-carga (N)
POLO = 28.0  # topo do polo fixo (z, mm)


def _linhas(pts: list[tuple[float, float]]) -> str:
    """Polilinha aberta como comandos g.line (pontos coincidentes se unem na detecção de regiões)."""
    return "\n".join(f"g.line(({a[0]}, {a[1]}), ({b[0]}, {b[1]}))" for a, b in zip(pts, pts[1:]))


def modelo(g: float) -> str:
    """Linhas do console que montam o atuador com entreferro g (mm); a corrente vem da variável i.

    Sem linhas sobrepostas: o eixo (r = 0) é dividido nos pontos onde as peças o tocam.
    """
    z0 = POLO + g  # base do êmbolo
    zm = (z0 + 90) / 2  # meio do êmbolo
    eixo = [(0, -30), (0, 0), (0, POLO), (0, z0), (0, 90), (0, 110)]
    caixa = [(0, 110), (80, 110), (80, -30), (0, -30)]
    carcaca = [(0, 0), (30, 0), (30, 60), (7, 60), (7, 54), (27, 54), (27, 6), (6.5, 6), (6.5, POLO), (0, POLO)]
    embolo = [(0, z0), (6.5, z0), (6.5, 90), (0, 90)]
    bobina = [(9, 8), (25, 8), (25, 52), (9, 52), (9, 8)]
    geo = "\n".join(_linhas(p) for p in (eixo, caixa, carcaca, embolo, bobina))
    return f"""
reset()
s.add_physics(id="n2")
g.problem("axisymmetric")
g.var("i", "0")
{geo}
m.circuit("Bobina", current="i")
m.region((50, 50), material="Ar")
m.region((26, 30), material="Ar")
m.region((15, 3), material="Aço 1010")
m.region((3, {zm}), material="Aço 1010")
m.region((17, 30), material="Cobre", circuit="Bobina", turns={N})
m.settings("n1", size="3 mm")
m.mesh_size((3, {zm}), "1 mm")
m.mesh_size((15, 3), "1.5 mm")
r.table("n2", id="tb1")
r.item("tb1", "surfint", id="f")
r.show("f", regions=[(3, {zm})], outputs=[("fy", "Fz")])
"""


def resolve(mf: magfem.MagFEM, i: float) -> tuple[float, float]:
    """Resolve com corrente i (A); devolve (λ em Wb, força de fechamento em N, positiva puxando o êmbolo)."""
    mf.set_var("i", repr(i))
    mf.solve("n2")
    res = mf.results("n2")
    return res["Bobina_lambda"][0], -res["Fz"][0]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=magfem.DEFAULT_PORT)
    ap.add_argument("--key", default=None)
    ap.add_argument("--passos", type=int, default=60)
    ap.add_argument("--dt", type=float, default=0.5e-3, help="passo de tempo (s)")
    a = ap.parse_args()
    mf = magfem.connect(port=a.port, key=a.key)

    g, v, t = G0, 0.0, 0.0  # entreferro (mm), velocidade de fechamento (m/s), tempo (s)
    mf.run(modelo(g))
    lam_1, _ = resolve(mf, 1.0)  # indutância inicial: λ com 1 A
    lam, i = 0.0, 0.0
    linhas = ["t_ms,g_mm,i_A,lambda_Wb,F_N"]
    print(f"{'t (ms)':>7} {'g (mm)':>7} {'i (A)':>7} {'λ (Wb)':>8} {'F (N)':>7}")
    L = lam_1  # Wb/A
    for _ in range(a.passos):
        t += a.dt
        lam += a.dt * (V - R * i)
        # Corrente que dá esse λ neste entreferro: chute pela indutância, uma correção pela secante.
        i_try = lam / L
        lam_fem, F = resolve(mf, i_try)
        if lam_fem > 0:
            i_try *= lam / lam_fem
            lam_fem, F = resolve(mf, i_try)
        i = i_try
        L = lam_fem / i if i > 0 else L
        # Mecânica (Euler semi-implícito); v > 0 fecha. Batentes: entreferro residual e posição aberta.
        f_mola = F0_MOLA + K_MOLA * (G0 - g) * 1e-3
        v += (F - f_mola) / M_EMB * a.dt
        g_novo = min(G0, max(GMIN, g - v * a.dt * 1e3))
        if g_novo in (GMIN, G0):
            v = 0.0  # parado num batente (impacto no fechamento)
        print(f"{t * 1e3:7.2f} {g:7.3f} {i:7.4f} {lam:8.5f} {F:7.3f}", flush=True)
        linhas.append(f"{t * 1e3:.3f},{g:.4f},{i:.5f},{lam:.6f},{F:.4f}")
        if abs(g_novo - g) > 1e-6:
            g = g_novo
            mf.run(modelo(g))
    with open("contator.csv", "w") as f:
        f.write("\n".join(linhas) + "\n")
    mf.run('g.var("fim", "1")')  # marca o fim (usado pelo teste)
    print("contator.csv gravado")


if __name__ == "__main__":
    main()

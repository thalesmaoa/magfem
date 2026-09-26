"""Exemplo: varre a corrente de um condutor num campo uniforme e compara a força com F = −I·B·L.

1. Abra o MagFEM (https://thalesmaia.com/tools/magfem-web/) num navegador.
2. Rode:  python examples/forca_varredura.py
3. No app, clique em "Script local" e cole a porta e a chave mostradas.

O modelo é montado pelo próprio script (as mesmas linhas do console do MagFEM).
"""

import magfem

B0 = 0.1  # T: campo uniforme em y, imposto pelo A prescrito na borda (A = −B0·x)

mf = magfem.connect()
mf.run(
    """
new()
s.add_physics(id="n2")
g.problem("planar", depth="1000 mm")
g.var("I", "100")
g.rectangle((-100, -100), (100, 100))
g.circle((0, 0), r=10)
m.region((0, 0), material="Ar", current="I")
m.region((50, 50), material="Ar")
m.boundary_def("Dirichlet (A = 0)", a1="-0.1")
m.settings("n1", size="2 mm")
r.table("n2", id="tb1")
r.item("tb1", "surfint", id="fs")
r.show("fs", regions=[(0, 0)], outputs=[("fx", "Fx")])
"""
)

print(" I (A)   Fx MagFEM (N)   -I·B·L (N)")
for current in (10, 50, 100, 200):
    mf.set_var("I", str(current))
    mf.solve("n2")
    fx = mf.result("Fx")
    print(f"{current:5d}   {fx:12.4f}   {-current * B0:10.4f}")

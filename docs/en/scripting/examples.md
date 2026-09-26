# Examples

The examples live in
[`bridge/python/examples`](https://github.com/thalesmaoa/magfem/tree/main/bridge/python/examples). Run the bridge,
connect the page and run the example (or let the example start the bridge itself).

## Force sweep

[`forca_varredura.py`](https://github.com/thalesmaoa/magfem/blob/main/bridge/python/examples/forca_varredura.py)
builds a round conductor in a uniform 0.1 T field (imposed by the prescribed A on the border) and sweeps the current,
comparing the Maxwell-tensor force with the analytical F = I·B·L:

```python
mf = magfem.connect()
mf.run(MODEL)                       # geometry, materials, boundary and force table
for current in (10, 50, 100, 200):
    mf.set_var("I", str(current))
    mf.solve("n2")
    print(current, mf.result("Fx"), -current * 0.1)
```

## Contactor

[`contator.py`](https://github.com/thalesmaoa/magfem/blob/main/bridge/python/examples/contator.py) simulates the
**closing of a DC contactor** (an axisymmetric plunger actuator), coupling in code three phenomena the app alone does
not combine:

- **electrical**: λ ← λ + Δt·(V − R·i), with the current taken from the FEM λ(g, i);
- **mechanical**: m·g″ = F_spring(g) − F_mag(g, i), with the magnetic force from the Maxwell tensor on the plunger;
- **geometry**: at every step the air gap g changes, and the model is rebuilt, meshed and solved.

```bash
python examples/contator.py --key my-key --passos 60
```

The output shows t, g, i, λ and F and writes `contator.csv`. It reproduces the current dip typical of closing: as the
plunger accelerates, the inductance grows and the current drops.

## Ideas

- **Optimization**: feed `mf.set_var` and `mf.result` to `scipy.optimize.minimize` and optimize a dimension (air gap,
  magnet thickness) for an objective (force, inductance, losses).
- **Maps**: sweep two variables and build a λ(i, x) map for a circuit model.

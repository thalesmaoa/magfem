# Solving

The problem physics lives under **Solver**. The **Magnetic field** node is created with the project; the `+` next
to **Model** creates other physics, such as an **external circuit**. The ▶ button solves (generating the mesh
first if needed), and messages explain what is missing: a region without a material, no boundary with a prescribed
A, an invalid B-H curve…

## Analysis types

In the physics properties, choose the **analysis**:

| Analysis | What it solves | Parameters |
|---|---|---|
| Magnetostatic | fields from DC currents and magnets | — |
| Harmonic (AC) | sinusoidal steady state, with phasors | frequency (Hz) |
| Transient | time evolution, with eddy currents | time step Δt and end time |

### Magnetostatic

Solves −∇·(ν∇A) = J (plus the magnet term) with A_z in planar problems or ψ = r·A_φ in axisymmetric ones. If any
material has a B-H curve, the problem is **nonlinear** and solved by **Newton-Raphson** with a line search; the
number of iterations is shown with the results.

### Harmonic (AC)

Currents are **peak amplitudes** at the given frequency. Conductors with σ > 0 and no source carry **eddy
currents**. Materials with a B-H curve use the effective permeability (as in FEMM), iterated until it converges.
Results can be viewed over one period, A(t) = Re(Â e^{jωt}), and surface integrals give **eddy-current losses** and
**iron losses** (Steinmetz, with the material coefficients).

### Transient

Implicit Euler with time step Δt up to the end time. Currents can be **functions of t**, for example
`10*sin(2*pi*60*t)` or `5*min(1, t/0.002)` (a 2 ms ramp up to 5 A); conductors without a source carry eddy currents; steel is nonlinear at every
step. In the results, the view gets a **time bar** and table items become **curves over time**.

## External circuit

With the **Circuit** physics, coils of the model join a schematic with sources, resistors, inductors and capacitors,
solved **together with the field** (strong coupling). See [External circuit](./circuit).

## Performance

The solver runs in a Web Worker, in WebAssembly, without freezing the interface. Problems with tens of thousands of
elements solve in seconds in linear magnetostatics. The matrix is sparse, solved by LDLᵀ (static) or LU (AC and
circuit). See the [formulation](../theory/formulation) for details.

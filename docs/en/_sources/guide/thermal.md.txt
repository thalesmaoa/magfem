# Thermal (steady)

The **Thermal** physics computes the steady-state temperature from the losses of a magnetic physics (AC or
magnetostatic). Air is not simulated as a flow (no CFD): it stays out of the thermal domain, and exposed surfaces
exchange heat by **convection**. A **fan** enters as an air channel that renews the air and warms up with the heat it
carries away.

## How to use

1. Solve (or set up) an **AC** or **magnetostatic** magnetic physics with the working currents.
2. From the `+` of **Solver**, create **Thermal (steady)** and choose the magnetic physics under **Losses from**.
3. Set the **ambient temperature**, the surface **convection** and, in planar problems, the **front/back faces**.
4. Solve (▶). Under **Results › Thermal**, create a **Field map**: temperature surface and isotherms (contour).

Materials need the **thermal conductivity k**; library materials already have it (copper 400, aluminum 237, M400 steel
28, 1010 steel 50 W/m·K). Without k, a typical value of the group applies. Laminated sheets conduct $f\cdot k$ in the
drawing plane.

## Cooling

| Where | What | Typical values |
|---|---|---|
| Exposed surfaces | convection $h\,(T - T_{amb})$ on every solid edge touching air | natural 5–10, forced 25–100 W/m²·K |
| Front/back faces (planar) | 2D does not see the depth faces: $2h/\text{depth}$ per volume | same as natural convection |
| Condition on curves | convection with another $h$, fixed temperature or insulated, on chosen curves only | — |
| Air channel (fan) | flow $Q$ (m³/h) and inlet temperature; linked curves exchange heat with the channel air | — |

To apply a condition to curves: select the curves in the drawing and click **Use the selected curves** on the
condition.

## Fan (air channel)

The renewed air carries away the heat of the curves linked to the channel. With flow $Q$, $\dot m = \rho_{air} Q$:

$$
T_{out} = T_{in} + \frac{P}{\dot m\, c_p}, \qquad T_{air} = \frac{T_{in} + T_{out}}{2},
$$

and the convection of those curves uses $T_{air}$. Temperature and air are solved together by iteration: low flow →
the air warms up → less cooling.

## Resistivity with temperature

With **Resistivity with temperature** on, the conductor resistivity follows $\rho(T) = \rho_{20}\,[1 + \alpha\,(T - 20)]$
($\alpha$ = 0.00393/K for copper). Coil losses are recomputed with the temperature of each region, and **solid
conductors** (eddy currents) get the AC solved again with the corrected $\sigma$. The iteration stops when the region
temperatures change by less than 0.1 K (usually 3 to 5 rounds).

## Results

| Variable | What |
|---|---|
| `Tmax`, `Tmin` | maximum and minimum temperature (°C) |
| `<region>_Tavg`, `<region>_Tmax` | mean and maximum per region |
| `P_perdas`, `P_dissipado` | total losses and heat leaving (they must match: balance) |
| `<channel>_Tar`, `<channel>_Tsaida`, `<channel>_P` | mean air, outlet and heat carried per channel |

## Limitations

- Steady state. Adiabatic heating in a short circuit (no time for heat to leave) and the thermal transient are the next
  steps.
- Air is not simulated: convection comes from the given $h$. In long channels the air warms along the path; the model
  uses the mean of inlet and outlet.

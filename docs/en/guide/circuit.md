# External circuit

Real coils are driven by circuits: a voltage source with a series resistance, a transformer with a load, a
capacitor discharging into a coil. MagFEM solves the **field and the circuit together**, in a single system of
equations (strong coupling), in transient analysis.

## Creating the circuit

1. The `+` next to **Model** creates a **Circuit**, which opens in a tab with the schematic.
2. The schematic already has a **Coil (FEM)** block for each circuit of the Mesh: it is the coil of the field model,
   with its inductance and coupling computed by the FEM.
3. From the schematic toolbar, add **voltage or current sources**, **resistors**, **inductors**, **capacitors** and
   the **Ground** (required).
4. Click a terminal and then another one to connect a **wire**. Drag the blocks to arrange them and the wire
   segments to change the route.

| Key | Action |
|---|---|
| `W` | wire mode |
| `R` | rotate the component |
| `M` | mirror |
| `Del` | delete |
| mouse wheel | zoom |

## Sources

A source has amplitude, frequency, phase and DC level, or an **expression in t** (in seconds) that can use the
project variables: `V0*sin(2*pi*60*t)`, `24` for DC, `24*min(1, t/0.001)` for a fast (1 ms) ramp. Expressions use `+ - * / ^`, `pi` and functions such as `sin`, `cos`, `exp`, `sqrt`, `abs`, `min` and `max`.

## Solving and viewing signals

Solve the field physics with **transient** analysis: the schematic coils receive the circuit current at every step.
After solving, click a component to see **i(t)** and **v(t)**; marked signals show up below the schematic.

Typical examples:

- **RL circuit**: voltage source, resistor and the coil. The current rises with the time constant L/R, with L coming
  from the FEM (and changing if the steel saturates).
- **Transformer**: voltage source on the primary and a resistive load on the secondary. With perfect coupling,
  V2 = (N2/N1)·V1.

::: tip Circuit from code
To also couple **motion** (a plunger moving under the magnetic force), use the [local bridge](../scripting/bridge):
the [contactor](../scripting/examples#contactor) example integrates circuit, field and mechanics in a Python loop.
:::

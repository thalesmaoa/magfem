# Mesh and materials

The **Mesh** stage turns the drawing into a physical problem: MagFEM detects the closed **regions**, you say what
each one is made of, where current flows and what the boundary conditions are, and then the triangle mesh is
generated.

## Regions

Every area closed by curves becomes a region, detected automatically and numbered ("Region 1", "Region 2"…).
Construction lines do not form regions. A region keeps what was assigned to it even when the drawing changes: it is
identified by an interior point, like FEMM *block labels*.

- Click a region in the drawing to select it; double-click its name (in the tree) to rename it.
- The region label can be dragged in the drawing.
- A region without a material is left out of the mesh (as in FEMM).

::: warning Overlapping curves
Two lines lying on top of each other along the same stretch do not close regions properly. Split the lines where
they meet (the [trim tool](./geometry#editing) helps) instead of overlapping them.
:::

## Materials

Under **Mesh › Materials**, each region has a searchable material list. The library lives in the right drawer
(**Problem and libraries › Materials**):

- **Groups**: air, conductors, steels (with B-H curves), magnets and your own.
- **Properties**: relative permeability μr, conductivity σ (MS/m), remanence Br (T) for magnets, color, and the
  Steinmetz coefficients for iron losses (k_h, α, k_e; used in AC analysis).
- **B-H curve**: materials with a curve are nonlinear. The curve opens in its own tab, with linear or log scales.
- **FEMM 4.2 library**: 245 ready materials in the search. **Import from FEMM…** also reads the `matlib.dat` of your
  installation.
- For magnets, the **magnetization direction** (angle) is set on the region.

## Circuits and currents

Under **Mesh › Circuits**, `+` creates a circuit with a **current** (in A; it accepts variables and, in transient
analysis, functions of `t` such as `2*sin(2*pi*60*t)`). In the region properties, connect it to a circuit with a
number of **turns**; negative turns reverse the direction (the go and return sides of a coil).

- Every region of a circuit carries the same current (a **series** circuit). The "parallel" type of FEMM files is
  kept, but splitting the current among parallel regions is not implemented yet.
- A region can also have its own current, without a circuit.

The current density is J = N·I / region area.

## Boundaries

The outer border of the domain automatically belongs to **Dirichlet (A = 0)**: flux does not cross it. For other
boundaries, click the edges in the drawing (Shift for several) and choose the boundary; the types live in the right
drawer, with the same names as in FEMM:

| Type | Condition | Use |
|---|---|---|
| Prescribed A (Dirichlet) | A = A0 + A1·x + A2·y (x, y in m) | A = 0 at the border; a uniform field imposed with A1/A2 |
| Neumann | ∂A/∂n = 0 | magnetic symmetry: flux crosses the curve at right angles |
| Mixed (Robin) | ν ∂A/∂n + c0·A + c1 = 0 | asymptotic open boundary: c0 = 1/(μ0·R), c1 = 0, with R the domain radius in m |
| Periodic | equal A on the curve pair | repeats the domain (one pole of a machine) |
| Antiperiodic | A with opposite sign on the pair | half a period |

Periodic and antiperiodic link **pairs** of curves: select both. The mesh is generated with matching nodes on the
two curves. The "small skin depth", "strategic dual image" and "periodic air gap" types exist so FEMM files can be
read, but they are not solved yet.

In axisymmetric problems the r = 0 axis always has A = 0 (ψ = r·A vanishes on the axis).

## Generating the mesh

The mesh uses **Tangle**, the FEMM mesh generator (by David Meeker, MIT license), compiled to WebAssembly.

- **Elements**: default element size (empty = automatic) and **minimum angle** (quality: no triangle will have a
  smaller interior angle; 30° is a good default, 34° is the maximum accepted). ▶ generates the mesh.
- **Regions**: element size per region, to refine where the field changes most (air gap, corners, core).
- **Per curve**: size along chosen curves (`m.curve_size` in the console).
- The **Elements** properties show nodes, triangles, the smallest angle and the time, with a quality map.

Solving without a mesh generates it first, automatically.

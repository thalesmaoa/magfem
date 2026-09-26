# API reference

The [console](./console) commands, grouped by object. Arguments in brackets are optional. Ids are strings
(`"l3"`, `"p5"`, `"n2"`); wherever an id is expected, the **name** given to the entity or node also works, and
`getid("name")` returns the id. Many commands that create something accept `id=` (to set the id) and `name=`.

## Geometry — `g`

### Entities

| Command | Description |
|---|---|
| `g.point((x, y))` | point |
| `g.line(a, b, construction=False)` | line; `a` and `b` are coordinates or point ids |
| `g.circle(center, r=5)` | circle |
| `g.arc(center, start, end)` | counterclockwise arc from `start` to `end` |
| `g.rectangle(corner, opposite)` | rectangle (grouped, with H/V) |
| `g.rectangle_center(center, corner)` | rectangle symmetric about the center |

### Constraints

| Command | Description |
|---|---|
| `g.horizontal(l)`, `g.vertical(l)` | horizontal/vertical line (or two points) |
| `g.parallel(a, b)`, `g.perpendicular(a, b)` | two lines |
| `g.tangent(a, b)` | line and arc/circle, or two arcs/circles |
| `g.equal(a, b)` | equal lengths or radii |
| `g.coincident(a, b)` | two points at the same place |
| `g.point_on(p, curve)` | point on the curve |
| `g.midpoint(p, l)` | point at the middle of the line |
| `g.symmetric(p1, p2, axis="y" \| line)` | points symmetric about an axis |
| `g.concentric(c1, c2)` | same center |
| `g.fix(p)`, `g.unfix(p)` | pins/unpins a point |
| `g.detach("O")` | frees curves attached to the Origin itself (older drawings) |

### Dimensions and variables

| Command | Description |
|---|---|
| `g.distance(a, [b,] "50 mm")` | distance (line, two points or point-line) |
| `g.hdistance(a, b, "10 mm")`, `g.vdistance(a, b, "10 mm")` | horizontal/vertical distance |
| `g.radius(c, "L/2")`, `g.diameter(c, 10)` | radius and diameter |
| `g.angle(l1, l2, "30 deg")` | angle between lines |
| `g.set_dimension("k5", "g*2")` | changes a dimension value (or expression) |
| `g.value("k5")` | current value of a dimension |
| `g.var("g", "0.5 mm")` | creates or changes a variable |
| `g.del_var("g")`, `g.rename_var("g", "gap")` | deletes and renames variables |

### Editing

| Command | Description |
|---|---|
| `g.trim(curve, (x, y))` | trim: removes the piece of the curve containing the point |
| `g.delete(ids...)` | deletes |
| `g.rename(id, "name")` | names an entity |
| `g.move(p, (x, y))` | moves a point |
| `g.translate(ids, dx=5, dy=0)` | translates |
| `g.rotate(ids, "15 deg", pivot=(0, 0))` | rotates |
| `g.set_radius(c, 5)` | changes the radius |
| `g.construction(ids, True)` | marks as construction |
| `g.offset(ids, "2 mm")`, `g.set_offset(g, "-5 mm")` | associative offset and its distance |
| `g.mirror(ids, axis="y")` | associative mirror (axis `"x"`, `"y"` or a line) |
| `g.array(ids, nx=3, ny=1, dx="20 mm", dy=0)` | linear pattern |
| `g.array_circular(ids, n=6, angle="360 deg", center=(0, 0))` | circular pattern |
| `g.set_pattern(g, nx=4, dx="25 mm")` | changes a pattern |
| `g.group([ids], name="rotor")`, `g.ungroup(g)` | groups and ungroups |
| `g.hide(g)`, `g.show(g)` | hides and shows a group |

### Queries and problem

| Command | Returns / does |
|---|---|
| `g.get(id)` | the entity (dictionary) |
| `g.list()` | list of ids |
| `g.measure(a, b)` | minimum distance between two entities |
| `g.area(ids)` | area enclosed by the curves |
| `g.dof()` | remaining degrees of freedom |
| `g.units("mm")` | project length unit |
| `g.problem("planar" \| "axisymmetric", depth="100 mm")` | problem type and depth (planar) |

## Mesh — `m`

| Command | Description |
|---|---|
| `m.material("Copper", mur=1, sigma=58, br=0, color="#e0914f", bh=[(H, B), ...], kh=, alpha=, ke=, group=)` | creates or edits a material (σ in MS/m, Br in T; `bh=None` removes the curve) |
| `m.del_material(name)`, `m.duplicate_material(name)`, `m.restore_material(name)` | deletes, duplicates and restores the default |
| `m.circuit("Coil", current="10")` | creates or edits a circuit |
| `m.del_circuit("Coil")` | deletes |
| `m.region((x, y), name=, material=, circuit=, current=, turns=, angle=, label=(dx, dy))` | assigns to the region containing the point; returns the area |
| `m.regions()` | list `[((x, y), area, material)]` |
| `m.boundary_def("Name", type=, value=, a1=, a2=, c0=, c1=, color=)` | creates or edits a boundary |
| `m.boundary(["l1", "l2"], "Name" \| "dirichlet" \| "neumann" \| "periodic" \| "antiperiodic" \| None)` | applies a boundary to the curves |
| `m.mesh_size((x, y), "0.5 mm" \| "auto")` | element size in the region |
| `m.curve_size([curves], "1 mm")` | size along curves (`None` removes it) |
| `m.settings("n1", size="2 mm" \| "auto", min_angle=30)` | default size and mesh quality |
| `m.generate("n1")` | generates the mesh |
| `m.add(name="Mesh")`, `m.rename(id, name)`, `m.remove(id)` | mesh nodes |

Boundary types for `type=`: `dirichlet` (A = value + a1·x + a2·y), `neumann`, `mixed` (c0, c1), `periodic`,
`antiperiodic`.

## Solver — `s`

| Command | Description |
|---|---|
| `s.add_physics(name="Magnetic field", circuit=False)` | new physics (field, or circuit with `circuit=True`) |
| `s.physics("n2", analysis="magnetostatic" \| "harmonic" \| "transient", frequency=, dt=, t_end=, schematic=)` | sets the analysis (frequency in Hz, times in s) |
| `s.solve("n2")` | solves (generating the mesh first if needed) |
| `s.rename(id, name)`, `s.remove(id)` | organization |

## Results — `r`

| Command | Description |
|---|---|
| `r.view("n2", name=)` | new field view |
| `r.interpolate("n2", level=3)` | interpolated view (1 to 6) |
| `r.plot(view, "surface" \| "contour" \| "arrow" \| "line", quantity="b" \| "h" \| "a" \| "j" \| "bn" \| "bt")` | layer in a view (or plot over line) |
| `r.show(id, visible=, range=(0, 1.5), n_lines=20, spacing=, scale=, curve=, quantity=, color=, color_by_value=, colormap=, regions=[(x, y)], outputs=[("fx", "Fx")], var_name=, expr=, unit_label=, at_time=, legend=(x, y, s))` | options of a layer or item |
| `r.table("n2", name=)` | new table |
| `r.item(table, "circuits" \| "lineint" \| "surfint" \| "formula", name=)` | table item |
| `r.move(layer, view)`, `r.duplicate(id)`, `r.rename(id, name)`, `r.remove(id)` | organization |
| `r.result("Fx", physics="n2")` | number of a result variable (at the shown instant, in transient) |
| `r.results("n2")` | list `[(name, value, unit), ...]` |
| `r.series("Coil_I")` | transient: `(times in s, values)` |

Integral quantities (for `outputs=`): surface — `area`, `volume`, `intA`, `current`, `energy`, `bavg`,
`b2`, `loss`, `ironLoss`, `fx`, `fy`, `torque`; line — `length`, `flux`, `mmf`, `intB`, `intBn`, `bavg`, `fx`,
`fy`, `torque`. All in SI units.

## Schematic — `c`

| Command | Description |
|---|---|
| `c.add(name="Circuit 1")` | new schematic |
| `c.part(sch, "V" \| "I" \| "R" \| "L" \| "C" \| "gnd" \| "coil", x=, y=, rot=, value=, amp=, freq=, phase=, dc=, circuit=)` | component |
| `c.wire(sch, (part, terminal), (part, terminal), mid=)` | wire between terminals |
| `c.route(wire, x)` or `c.route(wire, y=80)` | wire route |
| `c.set(part, value=, name=)`, `c.move(part, (x, y))`, `c.rotate(part)`, `c.remove(part)` | editing |

## Globals

`help()`, `getid("name")`, `undo()`, `redo()`, `fit()`, `reset()`. `clear()` and `next_id(n)` appear in the exported
script.

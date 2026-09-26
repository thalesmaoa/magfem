# Console

Everything you do in the interface shows up in the **console** (below the canvas) as the equivalent command. The
reverse also holds: typing a command performs the action, and the drawing follows. It is the same language used by
[local bridge](./bridge) scripts and by the exported script.

## The language

A Python-like language:

- numbers, strings (`"..."` or `'...'`), tuples `(x, y)`, lists `[a, b]`, `True`, `False` and `None`;
- keyword arguments: `g.circle((0, 0), r=5)`;
- console variables: `a = g.point((0, 0))` stores the id of the new point for later use;
- comments with `#`.

Lengths are numbers in the project unit or strings with a unit (`"5 mm"`, `"0.2 in"`). Point coordinates, such as
`(x, y)`, are in mm. Angles are strings with a unit (`"30 deg"`).

## Objects

| Object | Stage | Examples |
|---|---|---|
| `g` | Geometry | `g.line((0, 0), (40, 0))`, `g.distance("l1", "40 mm")`, `g.var("g", "0.5 mm")` |
| `m` | Mesh | `m.region((5, 5), material="mat_cu")`, `m.circuit("Coil", current="10")`, `m.generate()` |
| `s` | Solver | `s.physics("n2", analysis="transient", dt="0.001", t_end="0.05")`, `s.solve()` |
| `r` | Results | `r.view("n2")`, `r.table("n2")`, `r.result("Coil_L")` |
| `c` | Schematic | `c.part("n5", "R", value="0.5")`, `c.wire(...)` |

Without an object, a command counts as geometry: `line((0, 0), (10, 0))` is the same as `g.line(...)`.

## Global functions

| Function | Does |
|---|---|
| `help()` | lists the commands |
| `getid("name")` | id of an entity, region or node by name |
| `undo()`, `redo()` | undo and redo |
| `fit()` | fits the view |
| `reset()` | starts an empty project with the default libraries (for scripts; the open file does not change) |

## Console features

- **Tab** completes commands, ids, names and variables; inside quotes it suggests ids and names from the drawing.
- **↑** and **↓** browse the history.
- The copy button copies the history as a script; undone items are shown in gray.
- Errors show a readable message without changing the model.

## Exported script

The `</>` button next to **Model** writes a script that starts with `clear()` and rebuilds the whole project with the
same ids: entities, constraints, groups, variables, materials, regions, boundaries, mesh, physics and results. An
automated test guarantees the round trip (the rebuilt model is identical). You can paste the script into the
console or send it from an external script, for example to sweep parameters.

See the [full API reference](./api).

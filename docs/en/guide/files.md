# Files, import and export

## Projects

A project is a **`.magfem`** file (JSON) with the drawing, variables, materials, mesh, physics and views. Results
are recomputed on opening.

- **New**, **Open**, **Save** and **Save as** are on the top bar.
- In Chrome and Edge, **Save** writes back to the same file, like an installed program; **Save as** picks another
  one. In Firefox and Safari, saving triggers a download.
- Nothing leaves your machine: there is no server, account or cloud.

## Draft and automatic copies

The open project is kept in the browser (draft) on every change: closing the tab without saving does not lose the
work. Also, after every minute of editing the previous version becomes an **automatic copy** (up to 10). If the
project opens empty, a banner offers to recover the latest copy; the full list is under **Automatic copies**.
Recovering can be undone.

::: warning
The draft lives in the browser storage. Clearing the site data deletes the draft and the copies. Save important
projects to a file.
:::

## Import

**Import** accepts:

| Format | What comes in |
|---|---|
| DXF | lines, arcs, circles and polylines; coincident points are merged so regions close |
| SVG | paths (with arcs) converted to lines and arcs |
| FEMM (`.fem`) | geometry, materials, boundaries, circuits and block labels. Unlabeled regions stay out of the mesh, and edges without a property stay Neumann, as in FEMM |

FEMM materials are also available under **Materials › Import from FEMM…** (reads `matlib.dat`) and in the material
list search.

## Export

The **Export** button (top bar) exports what is in the active tab:

| Active tab | Formats |
|---|---|
| Drawing | SVG (vector, in mm), DXF (LibreCAD, FreeCAD…), PNG, JPG |
| Field view | PNG, JPG |
| Plot | SVG, PNG, JPG, CSV |
| Table | CSV |

Also:

| What | Where |
|---|---|
| Animation (WebM) | view bar, in transient and AC |
| Model as code | `</>` button next to **Model**: console script that rebuilds the project |

The exported script rebuilds the model exactly, with the same ids. It is the basis for
[automation](../scripting/console).

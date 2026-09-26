# Geometry (CAD)

The MagFEM drawing is **parametric**, in the style of Onshape: you sketch freely and then lock the shape with
**constraints** (horizontal, tangent, coincident…) and **dimensions** (distances, radii, angles). Dimensions
accept units and expressions with variables, so changing a variable redraws the whole model. The constraint
solver is PlaneGCS, the same one used by FreeCAD.

## Drawing tools

| Tool | Key | Use |
|---|---|---|
| Select | `S` or `Esc` | click selects, Shift adds; drag to move |
| Measure (ruler) | `U` | two clicks measure a distance; does not change the drawing |
| Line / polyline | `L` | each click continues the polyline; ends when closing on an existing point, on a double-click or with `Esc` |
| Construction line | `Shift+L` | helper line: guides the drawing but does not form regions |
| Rectangle | `R` | two opposite corners (created as a group, with H/V) |
| Center rectangle | `Shift+R` | center and one corner (symmetric about the center) |
| Circle | `C` | center and a point on the edge |
| Three-point arc | `A` | start, end and a point on the arc |
| Center arc | `Shift+A` | center, start and end (the mouse movement picks the direction) |
| Point | `P` | free point (handy as a dimension reference) |

Buttons with a small arrow group variants (line/construction, rectangle/center, three-point/center arc); the button
shows the last variant used.

## Snapping

While drawing, the cursor snaps, in this order, to:

1. existing **points** (end points, centers, the Origin): the new point becomes that same point;
2. line **midpoints**: adds a "midpoint" constraint;
3. **curves**: adds "point on curve";
4. the **x and y axes** (r and z in axisymmetric problems): adds a vertical or horizontal constraint to the Origin.

For lines, the second point also infers **horizontal or vertical** when it is nearly aligned, and snaps to where
that direction crosses the nearest curve. All these constraints show up in the tree (**Geometry › Constraints**) and
can be deleted.

::: tip The Origin
Clicking the origin creates a point of its own with a **Coincident** constraint to the Origin. To free the part,
delete that constraint. Older drawings where a curve uses the Origin itself show **Detach from origin** in the
properties panel.
:::

## Constraints

Select the entities and click the constraint button (or press its key).

| Constraint | Key | Entities |
|---|---|---|
| Coincident | `I` | two points, or a point and a curve (point on) |
| Horizontal / Vertical | `H` / `V` | a line, or two points |
| Parallel / Perpendicular | | two lines |
| Tangent | `T` | a line and an arc/circle, or two arcs/circles |
| Equal | `E` | two lines (length) or two arcs/circles (radius) |
| Midpoint | `M` | a point and a line |
| Symmetric | | two points and an axis (line) |
| Concentric | | two arcs/circles |
| Fix | | pins points at their current position |

The color shows the state: **blue** still has degrees of freedom, **black** (white in the dark theme) is fully
defined. The status bar shows how many degrees of freedom remain. A constraint that conflicts with the others is
refused, with a message in the status bar.

## Dimensions and variables

With the **Dimension** tool (`D`), click an entity (or two) and then where you want the text; type the value.

- A line or two points give a distance; the text position picks the **aligned**, **horizontal** or **vertical**
  distance.
- A circle gives the diameter; an arc gives the radius; two lines give an angle; a point and a line give the
  point-to-line distance.
- The value accepts a number (in the project unit), a number with a unit (`2 cm`, `0.5 in`) or an expression with
  variables (`Ds/2 - g`).

Variables live under **Geometry › Variables** (`+` creates one). Double-clicking a dimension edits its value.

## Editing

| Action | Key | Description |
|---|---|---|
| Trim | `X` | click a piece of a curve to remove it, up to the nearest intersections. At an end it shortens the curve; in the middle it splits it in two; a cut circle becomes an arc; a curve with no crossings is deleted |
| Offset | `O` | parallel copy at a distance (associative: follows the original) |
| Mirror | | reflects the selection about a line or axis |
| Linear / circular pattern | | copies in a grid or around a center |
| Move / rotate | `G` | translates and rotates the selection by typed values |
| Group / Ungroup | `Ctrl+G` / `Ctrl+Shift+G` | a group is selected and moved as one part; double-click enters the group to edit an entity |
| Construction | `Q` | toggles a curve between normal and construction |
| Delete | `Del` | deletes the selection |
| Fit | `F` | frames the drawing |
| Undo / Redo | `Ctrl+Z` / `Ctrl+Shift+Z` (or `Ctrl+Y`) | |

Offset, mirror and patterns are **associative**: the copy follows the original when it changes, and the distance
or the number of copies stays editable in the properties.

## Box selection

As in CAD programs, dragging a box **to the right** selects what lies entirely inside it; dragging **to the left**
selects everything it touches.

## Planar and axisymmetric

In the **Problem and libraries** drawer, choose the problem type and the length **unit**:

- **Planar**: x and y; set the **depth** (length along z), used for flux linkage, energy and force.
- **Axisymmetric**: r (horizontal) and z (vertical), with the symmetry axis at r = 0. Only the r ≥ 0 half-plane
  counts; it is highlighted and MagFEM warns when something is drawn at r < 0.

## Importing geometry

**Import** accepts DXF and SVG: curves are added to the drawing and coincident points are merged so regions close.
See also [Files, import and export](./files).

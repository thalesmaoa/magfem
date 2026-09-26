# Results

After solving, the physics shows up under **Results** with the peak |B|. Its `+` creates views, plots and tables;
each one opens as a **tab** in the canvas (the **Drawing** tab stays there).

## Field views

| Item | What it shows |
|---|---|
| Field map | colored surface (|B|, |H|, A, J), A contour (the **flux lines**) and glyphs (vector arrows) |
| Interpolated map | the same with high-order interpolation and subdivision: smooth contours |
| Plot over line | a quantity along a curve of the drawing (B, Bn, Bt, H, A…) |

A view has **layers** (surface, contour, glyphs) that can be hidden, duplicated and dragged in the tree to another
view. In the layer properties: quantity, value range, number of lines, colormap, color and arrow spacing.

- Click the **legend** to change its limits; drag it to move it and use the corner handle to resize it.
- **Export** (top bar) writes a PNG or JPG of the view.

![|B| map with flux lines](/img/field-en.png){.shot}

## Tables and result variables

A **Table** collects items, and each item produces named **result variables** that scripts can read
(`r.result("name")`).

| Item | Results |
|---|---|
| Circuits | current, turns, flux linkage λ, L = λ/I, DC R, DC V and I²R losses of each circuit |
| Surface integral | over the chosen regions: area, volume, ∫A, current, energy, mean B, losses (Joule and iron), **force Fx, Fy and torque** |
| Line integral | along a curve: length, flux Φ, magnetomotive force ∫H·dl, ∫B, mean B, **force and torque** (closed contour) |
| Formula | an expression of the other variables (for example `0.5*Coil_L*Coil_I^2`) |

Each output has an editable name (by default the item prefix plus the quantity, such as `S1_fx`). Circuit variables
are named `<circuit>_I`, `<circuit>_lambda`, `<circuit>_L` and `<circuit>_R`.

![Circuit table](/img/table-en.png){.shot}

## Force and torque

Force is computed with the **Maxwell stress tensor**, in two ways:

- **Surface integral** (recommended): select the regions of the body. It uses the weighted tensor, like the FEMM
  *block integral*, and only the air elements around the body contribute. It is the most accurate.
- **Line integral**: a closed contour in the air around the body.

Torque is about the origin. In planar problems the values already include the depth.

## Transient and AC

In transient and AC analysis, the view bar has a **time bar**, ▶ to animate, frames per second and **Export animation
(WebM)**. Table items become **curves over time**; in the item properties you can see the table at a chosen instant.
The signals of an external circuit show up when you click a component.

## Export

The **Export** button on the top bar exports the active tab: a field view as PNG or JPG, a plot as SVG, PNG, JPG or
CSV, and a table as CSV. The animation (WebM) comes from the view bar. See
[Files, import and export](./files#export).

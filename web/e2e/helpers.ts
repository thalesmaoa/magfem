import { expect, type Page } from '@playwright/test';

export interface Vec {
  x: number;
  y: number;
}

/** Abre o app vazio e espera o editor. */
export async function openApp(page: Page) {
  await page.goto('./');
  await page.waitForFunction(() => !!(window as any).__magfem);
  await expect(page.locator('.status')).toContainText('Sketch vazio');
}

/** Coordenadas de página para um ponto do mundo (mm). */
export async function toPage(page: Page, p: Vec): Promise<Vec> {
  return page.evaluate((p) => {
    const ed = (window as any).__magfem;
    const r = (document.querySelector('canvas.sketch') as HTMLCanvasElement).getBoundingClientRect();
    const s = ed.view.toScreen(p);
    return { x: s.x + r.left, y: s.y + r.top };
  }, p);
}

export async function clickWorld(page: Page, p: Vec, opts: { shift?: boolean } = {}) {
  const s = await toPage(page, p);
  await page.mouse.move(s.x, s.y, { steps: 2 });
  if (opts.shift) await page.keyboard.down('Shift');
  await page.mouse.down();
  await page.mouse.up();
  if (opts.shift) await page.keyboard.up('Shift');
}

export async function dragWorld(page: Page, a: Vec, b: Vec) {
  const s = await toPage(page, a);
  const t = await toPage(page, b);
  await page.mouse.move(s.x, s.y);
  await page.mouse.down();
  await page.mouse.move(t.x, t.y, { steps: 8 });
  await page.mouse.up();
}

export const sketch = (page: Page) => page.evaluate(() => (window as any).__magfem.sketch);
export const dof = (page: Page) => page.evaluate(() => (window as any).__magfem.doc.dof as number);

export async function point(page: Page, id: string): Promise<Vec> {
  const sk = await sketch(page);
  return { x: sk.entities[id].x, y: sk.entities[id].y };
}

/** Pontos (x,y) de uma linha. */
export async function lineEnds(page: Page, id: string): Promise<[Vec, Vec]> {
  const sk = await sketch(page);
  const l = sk.entities[id];
  return [sk.entities[l.p1], sk.entities[l.p2]];
}

/** Digita o valor na caixa da cota que acabou de abrir. */
export async function typeDim(page: Page, value: string) {
  const input = page.locator('.dim-input input');
  await expect(input).toBeVisible();
  await input.fill(value);
  await input.press('Enter');
  await expect(input).toHaveCount(0);
}

/** Resolver não cria vistas: cria "Vista 1" (Superfície: B + Contorno: A) na primeira física e a mostra. */
export async function defaultView(page: Page) {
  await page.evaluate(async () => {
    const ed = (window as any).__magfem;
    const { addView, addPlot } = await import('/tools/magfem-web/src/cad/tree.ts');
    const { plotName } = await import('/tools/magfem-web/src/ui/PostPanel.tsx');
    const ph = ed.sketch.nodes.find((n: any) => n.kind === 'physics');
    const v = addView(ed.sketch, ph.id);
    const a = addPlot(v.sketch, v.node.id, 'surface', plotName('surface', 'b'), 'b');
    const b = addPlot(a.sketch, v.node.id, 'contour', plotName('contour', 'a'), 'a');
    ed.commit(b.sketch, [v.code, a.code, b.code]);
  });
  await page.getByRole('treeitem', { name: 'Vista 1', exact: true }).click();
}

/** Projeto novo não tem física: inclui "Campo magnético" (id n2) pelo console, como o usuário faria. */
export async function addPhysics(page: Page) {
  const box = page.getByRole('textbox', { name: 'Console' });
  await box.fill('s.add_physics(id="n2")');
  await box.press('Enter');
  await expect(page.getByRole('treeitem', { name: /Campo magnético/ }).first()).toBeVisible();
}

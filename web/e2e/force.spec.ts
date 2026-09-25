import { expect, test } from '@playwright/test';
import { addPhysics, openApp } from './helpers';

test('força: condutor em campo uniforme, F = I × B (tensor de Maxwell ponderado e contorno fechado)', async ({ page }) => {
  await openApp(page);
  await addPhysics(page);
  const box = page.getByRole('textbox', { name: 'Console' });
  const run = async (c: string) => {
    await box.fill(c);
    await box.press('Enter');
  };
  for (const c of [
    'g.problem("planar", depth="1000 mm")',
    'g.rectangle((-100, -100), (100, 100))',
    'g.circle((0, 0), r=10)',
    'g.circle((0, 0), r=30)',
    'm.region((0, 0), material="Ar", current="100")',
    'm.region((20, 0), material="Ar")',
    'm.region((60, 60), material="Ar")',
    // Campo uniforme B = 0,1 T em y: A = −0,1·x na borda (A prescrito, x em m).
    'm.boundary_def("Dirichlet (A = 0)", a1="-0.1")',
    'm.settings("n1", size="2 mm")',
    'tb = r.table("n2", id="tb1")',
    'r.item("tb1", "surfint", id="fs")',
    'r.item("tb1", "lineint", id="fl")',
  ])
    await run(c);
  await page.evaluate(async () => {
    const ed = (window as any).__magfem;
    const { updateNode } = await import('/tools/magfem-web/src/cad/tree.ts');
    const regs = ed.arrangement().regions;
    const body = regs.find((r: any) => Math.abs(r.area - Math.PI * 100) < 5);
    const c30 = Object.values(ed.sketch.entities).find((e: any) => e.type === 'circle' && Math.abs(e.r - 30) < 1e-6) as any;
    let sk = updateNode(ed.sketch, 'fs', { regions: [{ curves: body.curves, seed: body.label }], outputs: [{ q: 'fx', name: 'Fx_s' }, { q: 'fy', name: 'Fy_s' }] });
    sk = updateNode(sk, 'fl', { curve: c30.id, outputs: [{ q: 'fx', name: 'Fx_l' }, { q: 'fy', name: 'Fy_l' }] });
    ed.commit(sk, []);
  });
  await page.getByRole('treeitem', { name: /Campo magnético/ }).first().getByRole('button', { name: 'Resolver' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__magfem.solutions.size), { timeout: 30000 }).toBeGreaterThan(0);
  const v = await page.evaluate(async () => {
    const ed = (window as any).__magfem;
    const { resultVars } = await import('/tools/magfem-web/src/cad/results.ts');
    const rv = resultVars(ed.sketch, ed.arrangement(), ed.shownSol('n2'), 'n2');
    return Object.fromEntries(rv.list.map((x: any) => [x.name, x.value]));
  });
  console.log('FORCA', JSON.stringify(v));
  expect(Math.abs(v.Fx_s + 10) / 10).toBeLessThan(0.03);
  expect(Math.abs(v.Fy_s)).toBeLessThan(0.3);
  expect(Math.abs(v.Fx_l + 10) / 10).toBeLessThan(0.03);
  expect(Math.abs(v.Fy_l)).toBeLessThan(0.3);
});

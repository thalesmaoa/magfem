import { expect, test } from '@playwright/test';
import { addPhysics, openApp } from './helpers';

test('harmônico (AC): perdas por correntes parasitas numa placa crescem ~f² em baixa frequência; um período animado', async ({ page }) => {
  await openApp(page);
  await addPhysics(page);
  const box = page.getByRole('textbox', { name: 'Console' });
  const run = async (c: string) => {
    await box.fill(c);
    await box.press('Enter');
  };
  for (const c of [
    'g.problem("planar", depth="100 mm")',
    'g.rectangle((-100, -100), (100, 100))',
    'g.rectangle((-40, -10), (-20, 10))',
    'g.rectangle((10, -30), (20, 30))',
    'm.region((-30, 0), material="Cobre", current="100")',
    'm.region((15, 0), material="Alumínio")',
    'm.region((60, 60), material="Ar")',
    'm.settings("n1", size="3 mm")',
    's.physics("n2", analysis="harmonic", frequency="1")',
    'r.table("n2", id="tb1")',
    'r.item("tb1", "surfint", id="pl")',
    'r.show("pl", regions=[(15, 0)], outputs=[("loss", "P_placa")])',
  ])
    await run(c);
  const solveAndLoss = async () => {
    await page.getByRole('treeitem', { name: /Campo magnético/ }).first().getByRole('button', { name: 'Resolver' }).click();
    await expect.poll(() => page.evaluate(() => (window as any).__magfem.solveBusy), { timeout: 30000 }).toBeNull();
    return page.evaluate(async () => {
      const ed = (window as any).__magfem;
      const { resultVars } = await import('/tools/magfem-web/src/cad/results.ts');
      const sol = ed.solutions.get('n2');
      const rv = resultVars(ed.sketch, ed.arrangement(), ed.shownSol('n2'), 'n2');
      return { loss: rv.list.find((x: any) => x.name === 'P_placa').value, frames: sol.times.length, err: ed.solveErrors.get('n2') ?? null };
    });
  };
  const r10 = await solveAndLoss();
  expect(r10.err).toBeNull();
  expect(r10.frames).toBe(24);
  expect(r10.loss).toBeGreaterThan(0);
  await run('s.physics("n2", frequency="2")');
  const r20 = await solveAndLoss();
  const ratio = r20.loss / r10.loss;
  console.log('AC', JSON.stringify({ r10, r20, ratio }));
  expect(ratio).toBeGreaterThan(3.8);
  expect(ratio).toBeLessThan(4.05);
});

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

test('perdas no ferro (Steinmetz): campo uniforme de 0,1 T dá P = kh·f·B²·V exato', async ({ page }) => {
  await openApp(page);
  await addPhysics(page);
  const box = page.getByRole('textbox', { name: 'Console' });
  for (const c of [
    'g.problem("planar", depth="100 mm")',
    'g.rectangle((-100, -100), (100, 100))',
    'g.rectangle((-20, -10), (20, 10))',
    'm.material("Nucleo", mur=1, sigma=0, kh=10, alpha=2, ke=0.001)',
    'm.region((0, 0), material="Nucleo")',
    'm.region((60, 60), material="Ar")',
    'm.boundary_def("Dirichlet (A = 0)", a1="-0.1")',
    's.physics("n2", analysis="harmonic", frequency="50")',
    'r.table("n2", id="tb1")',
    'r.item("tb1", "surfint", id="fe")',
    'r.show("fe", regions=[(0, 0)], outputs=[("ironLoss", "P_fe")])',
  ]) {
    await box.fill(c);
    await box.press('Enter');
  }
  await page.getByRole('treeitem', { name: /Campo magnético/ }).first().getByRole('button', { name: 'Resolver' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__magfem.solutions.size), { timeout: 30000 }).toBeGreaterThan(0);
  const p = await page.evaluate(async () => {
    const ed = (window as any).__magfem;
    const { resultVars } = await import('/tools/magfem-web/src/cad/results.ts');
    return resultVars(ed.sketch, ed.arrangement(), ed.shownSol('n2'), 'n2').list.find((x: any) => x.name === 'P_fe').value;
  });
  // V = 40 × 20 mm × 100 mm = 8e-5 m³; p = 10·50·0,1² + 0,001·(50·0,1)² = 5 + 0,025 W/m³.
  const want = (10 * 50 * 0.01 + 0.001 * 2500 * 0.01) * 8e-5;
  expect(Math.abs(p - want) / want).toBeLessThan(1e-6);
});

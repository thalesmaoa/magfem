import { expect, test } from '@playwright/test';
import { openApp, sketch } from './helpers';

const MU0 = 4e-7 * Math.PI;

test('circuito: λ, L = λ/I (½LI² = energia), R e perdas; tabela nos resultados', async ({ page }) => {
  await openApp(page);
  const box = page.getByRole('textbox', { name: 'Console' });
  const run = async (cmd: string) => {
    await box.fill(cmd);
    await box.press('Enter');
  };
  await run('g.rectangle((0, 0), (100, 50))');
  const sk = await sketch(page);
  const lines = Object.values(sk.entities).filter((e: any) => e.type === 'line') as any[];
  const vert = lines.filter((l) => Math.abs(sk.entities[l.p1].x - sk.entities[l.p2].x) < 1e-9).map((l) => `"${l.id}"`);
  const horiz = lines.filter((l) => Math.abs(sk.entities[l.p1].x - sk.entities[l.p2].x) >= 1e-9).map((l) => `"${l.id}"`);
  await run('m.circuit("Bobina", current="1000")');
  await run('m.region((50, 25), material="Cobre", circuit="Bobina", turns=1)');
  await run(`m.boundary([${vert.join(', ')}], "dirichlet")`);
  await run(`m.boundary([${horiz.join(', ')}], "neumann")`);
  await run('m.settings("n1", size="2 mm")');

  // Circuito aparece em Malha › Circuitos.
  await expect(page.getByRole('treeitem', { name: 'Bobina', exact: true })).toBeVisible();

  await page.getByRole('treeitem', { name: /Campo magnético/ }).first().getByRole('button', { name: 'Resolver' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__magfem.mode), { timeout: 15000 }).toBe('post');
  await expect(page.locator('.props .circ-table')).toContainText('Bobina');

  const r = await page.evaluate(async () => {
    const ed = (window as any).__magfem;
    const { circuitResults, depthOf } = await import('/tools/magfem-web/src/cad/solve.ts');
    const sol = [...ed.solutions.values()][0];
    return { c: circuitResults(ed.sketch, ed.arrangement(), sol)[0], energy: sol.energy, depth: depthOf(ed.sketch) };
  });
  const I = 1000, A = 0.1 * 0.05, J = I / A, L = 0.1;
  // λ analítico: profundidade × média de A = μ0 J L²/12.
  const lambda = r.depth * MU0 * J * L * L / 12;
  expect(Math.abs(r.c.lambda - lambda) / lambda).toBeLessThan(0.01);
  // Energia: ½ L I² = W.
  expect(Math.abs(0.5 * r.c.L * I * I - r.energy) / r.energy).toBeLessThan(0.01);
  // R CC = N² ℓ / (σ A) com σ do cobre (58 MS/m); perdas = R I².
  const R = (r.depth / (58e6 * A));
  expect(Math.abs(r.c.R - R) / R).toBeLessThan(1e-6);
  expect(Math.abs(r.c.P - R * I * I) / (R * I * I)).toBeLessThan(1e-6);

  // Tabela em aba pelo + da física.
  const grp = page.locator('.tree').getByRole('treeitem', { name: 'Campo magnético' }).last();
  await grp.getByRole('button', { name: 'Nova vista (aba) com…' }).click();
  await page.getByRole('menuitem', { name: /Circuitos \(tabela\)/ }).click();
  await expect(page.getByRole('tab', { name: /Circuitos: Campo magnético/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.chart-pane .circ-table')).toContainText('Bobina');
});

import { expect, test } from '@playwright/test';
import { clickWorld, openApp, sketch } from './helpers';

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

const MU0 = 4e-7 * Math.PI;

test('magnetostático: faixa com corrente bate com a solução analítica e mostra os resultados', async ({ page }) => {
  const box = page.getByRole('textbox', { name: 'Console' });
  const run = async (cmd: string) => {
    await box.fill(cmd);
    await box.press('Enter');
  };
  await run('g.rectangle((0, 0), (100, 50))');
  const sk = await sketch(page);
  const lines = Object.values(sk.entities).filter((e: any) => e.type === 'line') as any[];
  const vert = lines.filter((l) => Math.abs(sk.entities[l.p1].x - sk.entities[l.p2].x) < 1e-9).map((l) => l.id);
  const horiz = lines.filter((l) => !vert.includes(l.id)).map((l) => l.id);
  // Corrente de 1000 A numa espira: J = 1000 / 5000 mm² = 2e5 A/m².
  await run('m.region((50, 25), material="Ar", current="1000", turns=1)');
  await run(`m.boundary([${vert.map((v) => `"${v}"`).join(', ')}], "dirichlet")`);
  await run(`m.boundary([${horiz.map((v) => `"${v}"`).join(', ')}], "neumann")`);
  await run('m.settings("n1", size="2 mm")');

  // Resolver pelo ▶ da física: abre Resultados no modo resultados.
  await page.getByRole('treeitem', { name: /Campo magnético/ }).getByRole('button', { name: 'Resolver' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__magfem.mode), { timeout: 15000 }).toBe('post');
  await expect(page.locator('.props')).toContainText('|B| máximo');
  await expect(page.locator('.props')).not.toContainText('resolva de novo');

  // Sonda em x = 25 mm: B_y = −μ0 J (L/2 − x).
  await clickWorld(page, { x: 25, y: 25 });
  const pr = await page.evaluate(async () => {
    const ed = (window as any).__magfem;
    const { probe } = await import('/tools/magfem-web/src/cad/solve.ts');
    const sol = [...ed.solutions.values()][0];
    return { p: probe(sol, ed.probeAt), bmax: sol.bmax, energy: sol.energy };
  });
  const J = 1000 / 5000e-6;
  const want = -MU0 * J * (0.05 - 0.025);
  expect(Math.abs(pr.p.by - want) / Math.abs(want)).toBeLessThan(0.03);
  expect(Math.abs(pr.p.bx)).toBeLessThan(0.03 * Math.abs(want));
  // |B| máximo nas laterais: μ0 J L/2.
  expect(Math.abs(pr.bmax - MU0 * J * 0.05) / (MU0 * J * 0.05)).toBeLessThan(0.05);
  // Energia (profundidade padrão 1 m? usa a do problema): W = μ0 J² H L³ / 24 × profundidade.
  await expect(page.locator('.props')).toContainText('B_x, B_y');

  // Mudar o projeto deixa a solução desatualizada.
  await run('m.region((50, 25), current="2000")');
  await expect(page.locator('.props')).toContainText('resolva de novo');
});

test('resolver sem material numa região mostra o motivo', async ({ page }) => {
  const box = page.getByRole('textbox', { name: 'Console' });
  await box.fill('g.rectangle((0, 0), (40, 20))');
  await box.press('Enter');
  await page.getByRole('treeitem', { name: /Campo magnético/ }).click();
  await page.locator('.props').getByRole('button', { name: '▶ Resolver' }).click();
  await expect(page.locator('.props .err-text')).toContainText('sem material');
});

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

  // Resultados levam o nome da física; renomear a física renomeia o grupo.
  await expect(page.locator('.tree').getByRole('treeitem', { name: 'Campo magnético' })).toHaveCount(2);
  await expect(page.getByRole('treeitem', { name: 'Superfície: B' })).toBeVisible();
  await expect(page.getByRole('treeitem', { name: 'Contorno: A' })).toBeVisible();

  // Superfície: trocar "Colorir por" para H renomeia a camada; componente Y também vale.
  await page.getByRole('treeitem', { name: 'Superfície: B' }).click();
  await page.getByLabel('Colorir por').selectOption('h');
  await expect(page.getByRole('treeitem', { name: 'Superfície: H' })).toBeVisible();
  await page.getByLabel('Componente').selectOption('y');
  expect((await sketch(page)).nodes.find((n: any) => n.plot === 'surface')).toMatchObject({ quantity: 'h', component: 'y' });

  // Glifos: vetores de B.
  const grp = page.locator('.tree').getByRole('treeitem', { name: 'Campo magnético' }).last();
  await grp.getByRole('button', { name: 'Incluir visualização' }).click();
  await page.getByRole('menuitem', { name: /Glifos/ }).click();
  await expect(page.getByLabel('Orientação')).toHaveValue('b');

  // Gráfico sobre curva: linha de construção horizontal em y = 25 de x = 0 a 50.
  await run('g.line((0, 25), (50, 25), construction=True)');
  const results = page.locator('.tree').getByRole('treeitem', { name: 'Campo magnético' }).last();
  await results.getByRole('button', { name: 'Incluir visualização' }).click();
  await page.getByRole('menuitem', { name: /Gráfico sobre linha/ }).click();
  await page.getByRole('button', { name: 'Escolher curva no desenho' }).click();
  await clickWorld(page, { x: 40, y: 25 });
  await expect(page.locator('.props')).toContainText('Fluxo através da curva');
  await page.getByLabel('Grandeza').selectOption('bn');
  await expect(page.locator('.props svg.chart')).toBeVisible();
  const flux = await page.evaluate(async () => {
    const ed = (window as any).__magfem;
    const { lineProfile, depthOf } = await import('/tools/magfem-web/src/cad/solve.ts');
    const sol = [...ed.solutions.values()][0];
    const node = ed.sketch.nodes.find((n: any) => n.plot === 'line');
    return { f: lineProfile(sol, ed.sketch, node.curve).flux, depth: depthOf(ed.sketch) };
  });
  const wantFlux = -MU0 * J * 0.05 * 0.05 / 2 * flux.depth;
  expect(Math.abs(flux.f - wantFlux) / Math.abs(wantFlux)).toBeLessThan(0.02);
  await expect(page.locator('.props')).not.toContainText('resolva de novo');

  // Mudar o projeto deixa a solução desatualizada.
  await run('m.region((50, 25), current="2000")');
  await results.click();
  await expect(page.locator('.props')).toContainText('resolva de novo');
});

test('resolver sem material numa região mostra o motivo', async ({ page }) => {
  const box = page.getByRole('textbox', { name: 'Console' });
  await box.fill('g.rectangle((0, 0), (40, 20))');
  await box.press('Enter');
  await page.getByRole('treeitem', { name: /Campo magnético/ }).first().click();
  await page.locator('.props').getByRole('button', { name: '▶ Resolver' }).click();
  await expect(page.locator('.props .err-text')).toContainText('sem material');
});

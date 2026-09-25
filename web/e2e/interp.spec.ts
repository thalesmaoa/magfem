import { expect, test } from '@playwright/test';
import { openApp, sketch } from './helpers';

test('vista interpolada (pai), legenda com limites e duplicar gráfico', async ({ page }) => {
  await openApp(page);
  const box = page.getByRole('textbox', { name: 'Console' });
  const run = async (cmd: string) => {
    await box.fill(cmd);
    await box.press('Enter');
  };
  await run('g.rectangle((-60, -40), (60, 40))');
  await run('g.circle((0, 0), r=15)');
  await run('m.region((0, 0), material="Cobre", current="1000", turns=1)');
  await run('m.region((40, 0), material="Ar")');
  await run('m.settings("n1", size="12 mm")');
  await page.getByRole('treeitem', { name: /Campo magnético/ }).first().getByRole('button', { name: 'Resolver' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__magfem.mode), { timeout: 15000 }).toBe('post');

  // Nova vista interpolada pelo + da física: vira uma aba própria com superfície e contorno.
  const grp = page.locator('.tree').getByRole('treeitem', { name: 'Campo magnético' }).last();
  await grp.getByRole('button', { name: 'Nova vista (aba) com…' }).click();
  await page.getByRole('menuitem', { name: /Nova vista interpolada/ }).click();
  await expect(page.getByRole('tab', { name: /Interpolação 1/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Subdivisões por aresta')).toHaveValue('3');
  await expect.poll(() => page.evaluate(() => (window as any).__magfem.postLevel)).toBe(3);
  const nodes = (await sketch(page)).nodes;
  const iv = nodes.find((n: any) => n.kind === 'view' && n.level === 3);
  expect(nodes.filter((n: any) => n.kind === 'post' && n.view === iv.id).length).toBe(2);
  // A vista crua continua sem interpolação.
  await page.getByRole('tab', { name: /Vista 1/ }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__magfem.postLevel)).toBe(0);

  // Legenda: clicar abre o modal de limites.
  const hit = await page.evaluate(() => {
    const ed = (window as any).__magfem;
    const h = ed.hits.find((x: any) => x.kind === 'legend');
    const r = (document.querySelector('canvas.sketch') as HTMLCanvasElement).getBoundingClientRect();
    return { x: h.x0 + 10 + r.left, y: (h.y0 + h.y1) / 2 + r.top, layer: h.id };
  });
  await page.mouse.click(hit.x, hit.y);
  const dlg = page.getByRole('dialog');
  await expect(dlg).toBeVisible();
  await dlg.getByLabel('Limite superior').fill('0.01');
  await dlg.getByLabel('Limite inferior').fill('0');
  await dlg.getByRole('button', { name: 'OK' }).click();
  expect((await sketch(page)).nodes.find((n: any) => n.id === hit.layer).range).toEqual([0, 0.01]);

  // Duplicar um gráfico e trocar a grandeza na cópia.
  await page.getByRole('button', { name: 'Duplicar Superfície: B' }).first().click();
  await expect(page.getByRole('treeitem', { name: 'Superfície: B (cópia)' })).toBeVisible();
  await page.getByLabel('Colorir por').selectOption('h');
  const after = (await sketch(page)).nodes.filter((n: any) => n.kind === 'post' && n.plot === 'surface');
  expect(after.map((n: any) => n.quantity).sort()).toEqual(['b', 'b', 'h']);
});

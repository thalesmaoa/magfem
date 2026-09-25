import { expect, test } from '@playwright/test';
import { openApp, sketch } from './helpers';

test('interpolação: filtro na física e fonte do contorno', async ({ page }) => {
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
  await page.evaluate(() => (window as any).__magfem.fit());
  const grp = page.locator('.tree').getByRole('treeitem', { name: 'Campo magnético' }).last();
  await grp.getByRole('button', { name: 'Nova vista (aba) com…' }).click();
  await page.getByRole('menuitem', { name: /Filtro: interpolação/ }).click();
  await expect(page.getByLabel('Subdivisões por aresta')).toHaveValue('3');
  await page.getByRole('treeitem', { name: 'Contorno: A' }).click();
  await page.getByLabel('Dados').selectOption({ label: 'Interpolação 1 (×3)' });
  await page.getByRole('treeitem', { name: 'Superfície: B' }).click();
  await page.getByLabel('Dados').selectOption({ label: 'Interpolação 1 (×3)' });
  expect((await sketch(page)).nodes.filter((n: any) => n.kind === 'post' && n.source).length).toBe(2);
});

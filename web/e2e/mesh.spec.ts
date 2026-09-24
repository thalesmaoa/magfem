import { expect, test } from '@playwright/test';
import { clickWorld, openApp, sketch } from './helpers';

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('malha: regiões, material por clique, contorno nas bordas e comandos m.*', async ({ page }) => {
  const box = page.getByRole('textbox', { name: 'Console' });
  const run = async (cmd: string) => {
    await box.fill(cmd);
    await box.press('Enter');
  };
  await run('g.rectangle((-20, -10), (20, 10))');
  await run('c = g.circle((0, 0), r=5)');
  await page.getByRole('treeitem', { name: 'Malha', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__magfem.mode)).toBe('mesh');
  await expect(page.getByRole('treeitem', { name: 'Regiões (2)' })).toBeVisible();
  await expect(page.getByRole('treeitem', { name: 'Borda externa (A = 0)' })).toBeVisible();

  // Clique no anel → escolhe o material.
  await clickWorld(page, { x: 15, y: 0 });
  await page.getByLabel('Material', { exact: true }).selectOption({ label: 'Aço 1010' });
  let sk = await sketch(page);
  expect(sk.regionAssigns).toHaveLength(1);
  expect(sk.materials.find((m: any) => m.id === sk.regionAssigns[0].material).name).toBe('Aço 1010');
  await expect(page.locator('.console .code')).toContainText('m.region((');

  // Clique na borda do círculo → Neumann.
  await clickWorld(page, { x: 5, y: 0 });
  await page.getByLabel('Condição de contorno').selectOption('neumann');
  sk = await sketch(page);
  expect(sk.boundaries).toHaveLength(1);
  expect(sk.boundaries[0].type).toBe('neumann');

  // Console: região do furo com cobre e corrente; periódico exige duas curvas.
  await run('m.region((0, 0), material="Cobre", current="10", turns=100)');
  sk = await sketch(page);
  expect(sk.regionAssigns).toHaveLength(2);
  expect(sk.regionAssigns[1]).toMatchObject({ current: '10', turns: 100 });
  await run('m.boundary([c], "periodic")');
  await expect(page.locator('.console .out pre.err').last()).toContainText('duas');

  // Redimensionar mantém as atribuições (identidade pelas curvas).
  await run('g.set_radius(c, 7)');
  const view = await page.evaluate(() => {
    const ed = (window as any).__magfem;
    return ed.arrangement().regions.map((r: any) => ed.assignOf({ curves: r.curves, seed: r.label })?.material);
  });
  expect(view.sort()).toEqual(['mat_1010', 'mat_cu'].sort());

  // Voltar à Geometria volta ao modo desenho.
  await page.getByRole('treeitem', { name: 'Geometria', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__magfem.mode)).toBe('sketch');
});

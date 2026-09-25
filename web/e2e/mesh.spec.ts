import { expect, test } from '@playwright/test';
import { clickWorld, openApp, sketch } from './helpers';

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

const mode = (page: any) => page.evaluate(() => (window as any).__magfem.mode);

test('malha: materiais por região, contornos, tamanho por região e geração com o Triangle', async ({ page }) => {
  const box = page.getByRole('textbox', { name: 'Console' });
  const run = async (cmd: string) => {
    await box.fill(cmd);
    await box.press('Enter');
  };
  await run('g.rectangle((-20, -10), (20, 10))');
  await run('c = g.circle((0, 0), r=5)');
  await page.getByRole('treeitem', { name: 'Malha', exact: true }).click();
  await expect.poll(() => mode(page)).toBe('mesh');
  await expect(page.getByRole('treeitem', { name: 'Borda externa (A = 0)' })).toBeVisible();

  // 1. Materiais: clique no anel e escolha na lista agrupada.
  await clickWorld(page, { x: 15, y: 0 });
  await page.locator('.props').getByRole('button', { name: 'Escolher material', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Aços elétricos' })).toBeVisible();
  await page.getByRole('menuitemradio', { name: /Aço 1010/ }).click();
  let sk = await sketch(page);
  expect(sk.regionAssigns).toHaveLength(1);
  expect(sk.regionAssigns[0].material).toBe('mat_1010');
  await expect(page.locator('.console .code')).toContainText('m.region((');

  // Pela árvore: o chip da outra região também abre a lista.
  const chips = page.locator('.tree .mat-chip.none');
  await expect(chips).toHaveCount(1);
  await chips.click();
  await page.getByRole('menuitemradio', { name: /Cobre/ }).click();
  sk = await sketch(page);
  expect(sk.regionAssigns.map((a: any) => a.material).sort()).toEqual(['mat_1010', 'mat_cu']);

  // Renomear a região: duplo clique na árvore.
  await page.locator('.tree .tname', { hasText: 'Região 2' }).first().dblclick();
  const ren = page.locator('.tree').getByRole('textbox', { name: 'Duplo clique para renomear' });
  await ren.fill('Bobina primário');
  await ren.press('Enter');
  await expect(page.getByRole('treeitem', { name: 'Bobina primário' }).first()).toBeVisible();
  expect((await sketch(page)).regionAssigns.some((a: any) => a.name === 'Bobina primário')).toBe(true);

  // 2. Contornos: borda do círculo → novo contorno → Neumann.
  await clickWorld(page, { x: 5, y: 0 });
  await page.getByLabel('Contorno', { exact: true }).selectOption({ label: 'Novo contorno…' });
  await page.getByLabel('Condição de contorno').selectOption('neumann');
  sk = await sketch(page);
  expect(sk.boundaries).toHaveLength(1);
  expect(sk.boundaries[0]).toMatchObject({ type: 'neumann', name: 'Neumann 1', curves: [expect.any(String)] });
  await run('m.boundary([c], "periodic")');
  await expect(page.locator('.console .out pre.err').last()).toContainText('duas');

  // 3. Regiões: tamanho próprio no disco.
  await page.getByRole('treeitem', { name: 'Regiões', exact: true }).click();
  await clickWorld(page, { x: 0, y: 0 });
  const size = page.getByLabel('Tamanho do elemento');
  await size.fill('0.5 mm');
  await size.press('Enter');
  sk = await sketch(page);
  expect(sk.regionAssigns.find((a: any) => a.meshSize)?.meshSize).toBe('0.5 mm');

  // 4. Gerar a malha.
  await page.getByRole('treeitem', { name: 'Elementos', exact: true }).getByRole('button', { name: 'Gerar malha' }).click();
  await expect(page.locator('.props')).toContainText('triângulos');
  const m = await page.evaluate(() => {
    const ed = (window as any).__magfem;
    const r = [...ed.meshes.values()][0];
    const count = [0, 0];
    const arr = ed.arrangement();
    const disk = arr.regions.findIndex((x: any) => x.holes.length === 0);
    for (const k of r.triRegion) count[k === disk ? 0 : 1]++;
    return { elements: r.elements, minAngle: r.minAngle, disk: count[0], ring: count[1], bad: [...r.triRegion].filter((k: number) => k < 0).length };
  });
  expect(m.elements).toBeGreaterThan(100);
  expect(m.minAngle).toBeGreaterThan(29);
  expect(m.bad).toBe(0);
  // Disco com elementos de 0,5 mm é bem mais denso que o anel.
  expect(m.disk / (Math.PI * 25)).toBeGreaterThan((3 * m.ring) / (800 - Math.PI * 25));

  // Mudar o desenho deixa a malha desatualizada.
  await run('g.set_radius(c, 6)');
  await expect(page.locator('.props')).toContainText('gere a malha de novo');

  await page.getByRole('treeitem', { name: 'Geometria', exact: true }).click();
  await expect.poll(() => mode(page)).toBe('sketch');
});

test('gaveta: biblioteca de materiais agrupada e contornos', async ({ page }) => {
  await page.getByRole('button', { name: 'Problema e bibliotecas' }).click();
  await page.getByRole('tab', { name: 'Materiais' }).click();
  const lib = page.getByRole('listbox', { name: 'Materiais' });
  await expect(lib).toContainText('Condutores');
  await expect(lib).toContainText('Ímãs');
  await page.getByRole('button', { name: '+ Novo material' }).click();
  const name = page.locator('.lib-editor').getByLabel('Nome');
  await name.fill('Bobina');
  await name.press('Enter');
  const sk = await sketch(page);
  expect(sk.materials.find((m: any) => m.name === 'Bobina')).toMatchObject({ group: 'custom', mur: 1 });
  await page.getByRole('tab', { name: 'Contornos' }).click();
  await page.getByRole('button', { name: '+ Novo contorno' }).click();
  await page.locator('.lib-editor').getByLabel('Condição de contorno').selectOption('periodic');
  expect((await sketch(page)).boundaries[0].type).toBe('periodic');
});

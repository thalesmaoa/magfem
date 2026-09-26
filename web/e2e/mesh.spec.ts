import { expect, test } from '@playwright/test';
import { clickWorld, openApp, sketch } from './helpers';

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

const mode = (page: any) => page.evaluate(() => (window as any).__magfem.mode);

test('malha: materiais por região, contornos, tamanho por região e geração com a Tangle', async ({ page }) => {
  const box = page.getByRole('textbox', { name: 'Console' });
  const run = async (cmd: string) => {
    await box.fill(cmd);
    await box.press('Enter');
  };
  await run('g.rectangle((-20, -10), (20, 10))');
  await run('c = g.circle((0, 0), r=5)');
  await page.getByRole('treeitem', { name: 'Malha', exact: true }).click();
  await expect.poll(() => mode(page)).toBe('mesh');
  await expect(page.getByRole('treeitem', { name: /Dirichlet \(A = 0\)/ })).toBeVisible();

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

  // Etiqueta da região: arrastar a caixa grava o deslocamento; a bolinha fica no lugar.
  const hit = await page.evaluate(() => {
    const ed = (window as any).__magfem;
    const h = ed.hits.filter((x: any) => x.kind === 'regionLabel').pop(); // a de cima
    const r = (document.querySelector('canvas.sketch') as HTMLCanvasElement).getBoundingClientRect();
    return { x: (h.x0 + h.x1) / 2 + r.left, y: (h.y0 + h.y1) / 2 + r.top, index: Number(h.id) };
  });
  await page.mouse.move(hit.x, hit.y);
  await page.mouse.down();
  await page.mouse.move(hit.x + 60, hit.y + 40, { steps: 6 });
  await page.mouse.up();
  const moved = await page.evaluate((i) => {
    const ed = (window as any).__magfem;
    const r = ed.arrangement().regions[i];
    return ed.assignOf({ curves: r.curves, seed: r.label })?.labelOffset;
  }, hit.index);
  expect(moved).toBeTruthy();
  await expect(page.locator('.console .code')).toContainText('label=(');

  // 2. Contornos: borda do círculo → novo contorno → Neumann.
  await clickWorld(page, { x: 5, y: 0 });
  await page.getByLabel('Contorno', { exact: true }).selectOption({ label: 'Novo contorno…' });
  await page.getByLabel('Condição de contorno').selectOption('neumann');
  sk = await sketch(page);
  // Além das condições padrão da biblioteca (bd_*), só o contorno novo.
  const mine = sk.boundaries.filter((b: any) => !b.id.startsWith('bd_'));
  expect(mine).toHaveLength(1);
  expect(mine[0]).toMatchObject({ type: 'neumann', name: 'Neumann 2', curves: [expect.any(String)] });
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

  // Voltar para Materiais: vista de materiais com as etiquetas, sem os triângulos.
  await page.getByRole('treeitem', { name: 'Materiais', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__magfem.shownMesh)).toBeNull();
  await page.getByRole('treeitem', { name: 'Elementos', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__magfem.shownMesh)).not.toBeNull();

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
  expect((await sketch(page)).boundaries.find((b: any) => !b.id.startsWith('bd_')).type).toBe('periodic');
});

test('malha de núcleo com bobinas (geometria do usuário) e tamanho 4 mm nas bobinas', async ({ page }) => {
  const box = page.getByRole('textbox', { name: 'Console' });
  const run = async (cmd: string) => {
    await box.fill(cmd);
    await box.press('Enter');
  };
  await run('g.rectangle((-105, -110), (105, 110))');
  await run('g.rectangle((-45, -70), (45, 70))');
  await run('g.rectangle((-25, -50), (25, 50))');
  await run('g.line((0, 50), (0, -50))');
  for (const sx of [-1, 1]) {
    await run(`a = g.point((${sx * 45}, 50))`);
    await run(`b = g.point((${sx * 70}, 50))`);
    await run(`c = g.point((${sx * 70}, -50))`);
    await run(`d = g.point((${sx * 45}, -50))`);
    await run('g.line(a, b)');
    await run('g.line(b, c)');
    await run('g.line(c, d)');
  }
  await page.getByRole('treeitem', { name: 'Malha', exact: true }).click();
  await expect(page.getByRole('treeitem', { name: 'Regiões', exact: true })).toBeVisible();
  for (const x of [-12.5, 12.5, -57.5, 57.5]) await run(`m.mesh_size((${x}, 0), "4 mm")`);
  await page.getByRole('treeitem', { name: 'Elementos', exact: true }).getByRole('button', { name: 'Gerar malha' }).click();
  await expect(page.locator('.props')).toContainText('triângulos');
  await expect(page.locator('.props .err-text')).toHaveCount(0);
  const m = await page.evaluate(() => [...(window as any).__magfem.meshes.values()][0]);
  expect(m.elements).toBeGreaterThan(2000);
  expect(m.minAngle).toBeGreaterThan(29.9);
});

test('malha grande (muitos elementos) gera sem estourar a pilha do WASM', async ({ page }) => {
  const box = page.getByRole('textbox', { name: 'Console' });
  const run = async (cmd: string) => {
    await box.fill(cmd);
    await box.press('Enter');
  };
  await run('g.rectangle((-100, -60), (100, 60))');
  await run('g.circle((0, 0), r=30)');
  await run('m.settings("n1", size="0.8 mm")');
  await run('m.generate("n1")');
  await expect.poll(() => page.evaluate(() => (window as any).__magfem.meshes.size), { timeout: 20000 }).toBe(1);
  const m = await page.evaluate(() => [...(window as any).__magfem.meshes.values()][0]);
  expect(m.elements).toBeGreaterThan(30000);
});

test('busca de material: filtra o projeto e importa da biblioteca do FEMM ao escolher', async ({ page }) => {
  const box = page.getByRole('textbox', { name: 'Console' });
  await box.fill('g.rectangle((-20, -10), (20, 10))');
  await box.press('Enter');
  await page.getByRole('treeitem', { name: 'Malha', exact: true }).click();
  await expect.poll(() => mode(page)).toBe('mesh');
  await clickWorld(page, { x: 0, y: 0 });
  await page.locator('.props').getByRole('button', { name: 'Escolher material', exact: true }).click();
  const search = page.getByRole('textbox', { name: /Buscar material/ });
  await search.fill('cobre');
  await expect(page.getByRole('menuitemradio', { name: /Cobre/ })).toBeVisible();
  await expect(page.getByRole('menuitemradio', { name: /Aço 1010/ })).toHaveCount(0);
  await search.fill('M-19');
  await page.getByRole('menuitem', { name: /M-19 Steel/ }).first().click();
  const sk = await sketch(page);
  const m = sk.materials.find((x: any) => x.name === 'M-19 Steel');
  expect(m).toBeTruthy();
  expect(m.bh.length).toBeGreaterThan(10);
  expect(sk.regionAssigns[0].material).toBe(m.id);
});

test('mapa de qualidade da malha: faixas do menor ângulo somam todos os triângulos', async ({ page }) => {
  const box = page.getByRole('textbox', { name: 'Console' });
  for (const c of ['g.rectangle((-20, -10), (20, 10))', 'g.circle((0, 0), r=5)', 'm.region((10, 0), material="Ar")', 'm.region((0, 0), material="Cobre")']) {
    await box.fill(c);
    await box.press('Enter');
  }
  await page.getByRole('treeitem', { name: 'Malha', exact: true }).click();
  await page.getByRole('treeitem', { name: 'Elementos', exact: true }).getByRole('button', { name: 'Gerar malha' }).click();
  await expect(page.locator('.props')).toContainText('triângulos');
  await page.getByLabel('Colorir pela qualidade (menor ângulo)').check();
  const counts = await page.locator('.quality-legend li b').allTextContents();
  const total = counts.map(Number).reduce((a, b) => a + b, 0);
  const elements = await page.evaluate(() => [...(window as any).__magfem.meshes.values()][0].elements);
  expect(counts).toHaveLength(4);
  expect(total).toBe(elements);
  expect(Number(counts[0])).toBe(0); // nenhum triângulo abaixo de 20° (qualidade 30°)
});

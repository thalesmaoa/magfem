import { expect, test } from '@playwright/test';
import { openApp, sketch } from './helpers';

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('gráfico no tempo: variáveis nos eixos esquerdo e direito, exportação, e tudo sobrevive a recarregar a página', async ({ page }) => {
  test.setTimeout(90000);
  const box = page.getByRole('textbox', { name: 'Console' });
  const run = async (c: string) => {
    await box.fill(c);
    await box.press('Enter');
  };
  for (const c of [
    'g.rectangle((-105, -110), (105, 110))',
    'g.rectangle((-45, -70), (45, 70))',
    'g.rectangle((-25, -50), (25, 50))',
    'm.circuit("Bobina", current="0")',
    'm.region((0, 90), material="Ar")',
    'm.region((-35, 0), material="Aço M400-50A")',
    'm.region((0, 0), material="Cobre", circuit="Bobina", turns=400)',
    's.add_physics(name="Transitório", id="n7")',
    's.physics("n7", analysis="transient", dt="0.001", t_end="0.02")',
    's.current("n7", "Bobina", "2*sin(2*pi*50*t)")',
    'r.table("n7", id="tb2")',
    'r.item("tb2", "timeplot", name="Tensão e fluxo", id="tp")',
    'r.show("tp", curves=[("Bobina_V", "left"), ("Bobina_lambda", "right")])',
    's.solve("n7")',
  ])
    await run(c);
  await expect.poll(() => page.evaluate(() => (window as any).__magfem.solutions.has('n7')), { timeout: 30000 }).toBe(true);
  // Aba da tabela: um gráfico XYY com as duas curvas e botões de exportação.
  await page.getByRole('treeitem', { name: 'Tensão e fluxo', exact: true }).click();
  const tbName = (await sketch(page)).nodes.find((n: any) => n.id === 'tb2').name;
  await page.getByRole('treeitem', { name: tbName, exact: true }).click();
  const chart = page.locator('svg.xychart.dual');
  await expect(chart).toBeVisible();
  await expect(chart).toHaveAttribute('aria-label', 'Bobina_V, Bobina_lambda');
  expect(await chart.innerHTML()).not.toContain('NaN');
  // A legenda usa a cor de cada curva.
  const legendColors = await chart.locator('text.axis-label').evaluateAll((els) => els.map((e) => getComputedStyle(e).fill));
  expect(new Set(legendColors).size).toBe(2);
  // Mouse sobre o gráfico: linha e caixa com t e o valor de cada curva.
  const bb = (await chart.boundingBox())!;
  await page.mouse.move(bb.x + bb.width * 0.5, bb.y + bb.height * 0.3);
  await expect(chart.locator('.hover-box')).toContainText('t = ');
  await expect(chart.locator('.hover-box')).toContainText('Bobina_lambda = ');
  await page.mouse.move(0, 0);
  await expect(chart.locator('.hover-box')).toHaveCount(0);
  // Cor escolhida para uma curva vale no traço e na legenda.
  await run('r.show("tp", curves=[("Bobina_V", "left", "#00aa00"), ("Bobina_lambda", "right")])');
  await expect(chart.locator('text.axis-label').first()).toHaveCSS('fill', 'rgb(0, 170, 0)');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.tp-export').getByRole('button', { name: 'CSV' }).click()]);
  const csv = await (await dl.createReadStream()).toArray().then((b) => Buffer.concat(b).toString());
  expect(csv.split('\n')[0]).toBe('t (s);Bobina_V (V);Bobina_lambda (Wb)');
  expect(csv.trim().split('\n')).toHaveLength(21);
  // .mat (MATLAB v5): cabeçalho, ordem "IM" e o vetor t com 20 amostras (confere a estrutura byte a byte).
  const [dm] = await Promise.all([page.waitForEvent('download'), page.locator('.tp-export').getByRole('button', { name: 'MAT' }).click()]);
  const mat = await (await dm.createReadStream()).toArray().then((b) => Buffer.concat(b));
  expect(mat.subarray(0, 10).toString()).toBe('MATLAB 5.0');
  expect(mat.subarray(126, 128).toString()).toBe('IM');
  expect(mat.readUInt32LE(128)).toBe(14); // miMATRIX
  expect(mat.readInt32LE(128 + 8 + 16 + 8)).toBe(20); // dimensões: 20 × 1
  expect(mat.subarray(128 + 8 + 32 + 8, 128 + 8 + 32 + 9).toString()).toBe('t');
  // Nas propriedades do item: adicionar uma variável pelo nome.
  await page.getByRole('treeitem', { name: 'Tensão e fluxo', exact: true }).click();
  const add = page.getByRole('combobox', { name: 'Adicionar variável' });
  await add.fill('Bobina_I');
  await add.press('Enter');
  expect((await sketch(page)).nodes.find((n: any) => n.id === 'tp').curves.map((c: any) => c.name)).toEqual(['Bobina_V', 'Bobina_lambda', 'Bobina_I']);
  // Estilo da curva numa janela: rótulo, tipo de linha e espessura.
  await page.getByRole('button', { name: 'Estilo da curva (rótulo, cor, linha): Bobina_V' }).click();
  const dlg = page.locator('dialog.tp-style[open]');
  await dlg.getByLabel('Rótulo na legenda').fill('Tensão induzida');
  await dlg.getByLabel('Tipo de linha').selectOption('dot');
  await dlg.getByLabel('Espessura').selectOption('2.5');
  await dlg.getByRole('button', { name: 'OK' }).click();
  expect((await sketch(page)).nodes.find((n: any) => n.id === 'tp').curves[0]).toMatchObject({ name: 'Bobina_V', label: 'Tensão induzida', dash: 'dot', width: 2.5, color: '#00aa00' });
  // Recarregar a página: os itens de Resultados continuam (sem virar "Mapa 2D"/"Linhas de fluxo") e a solução volta.
  await page.waitForTimeout(1000);
  await page.reload();
  await page.waitForFunction(() => !!(window as any).__magfem);
  const nodes = (await sketch(page)).nodes;
  expect(nodes.find((n: any) => n.id === 'tp')).toMatchObject({ item: 'timeplot', view: 'tb2' });
  expect(nodes.filter((n: any) => n.kind === 'post' && n.plot)).toHaveLength(0);
  await expect.poll(() => page.evaluate(() => (window as any).__magfem.solutions.has('n7')), { timeout: 10000 }).toBe(true);
});

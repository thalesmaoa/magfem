import { expect, test } from '@playwright/test';
import { openApp, sketch, defaultView, addPhysics } from './helpers';

test.beforeEach(async ({ page }) => {
  await openApp(page);
  await addPhysics(page);
});

const coreModel = async (page: any, current: string) => {
  const box = page.getByRole('textbox', { name: 'Console' });
  for (const c of [
    'g.rectangle((-105, -110), (105, 110))',
    'g.rectangle((-45, -70), (45, 70))',
    'g.rectangle((-25, -50), (25, 50))',
    'm.region((0, 90), material="Ar")',
    'm.region((-35, 0), material="Aço M400-50A")',
    `m.region((0, 0), material="Cobre", current="${current}", turns=400)`,
  ]) {
    await box.fill(c);
    await box.press('Enter');
  }
  return box;
};

test('não linear: núcleo de aço satura (|B| < 2,2 T) em vez dos ~4 T do linear', async ({ page }) => {
  await coreModel(page, '5');
  await page.getByRole('treeitem', { name: /Campo magnético/ }).first().getByRole('button', { name: 'Resolver' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__magfem.solutions.size), { timeout: 20000 }).toBeGreaterThan(0);
  await defaultView(page);
  await expect.poll(() => page.evaluate(() => (window as any).__magfem.mode)).toBe('post');
  const r = await page.evaluate(() => {
    const s = [...(window as any).__magfem.solutions.values()][0];
    return { bmax: s.bmax, it: s.iterations };
  });
  expect(r.bmax).toBeLessThan(2.3);
  expect(r.bmax).toBeGreaterThan(1.5);
  expect(r.it).toBeGreaterThan(1);
});

test('transitório: corrente = função de t com variável (x*sin(2πft)), barra de tempo e progresso', async ({ page }) => {
  const box = await coreModel(page, 'x*sin(2*pi*50*t)');
  await box.fill('g.var("x", "0.01")');
  await box.press('Enter');
  await page.getByRole('treeitem', { name: /Campo magnético/ }).first().click();
  await page.locator('.props label', { hasText: 'Análise' }).locator('select').selectOption('transient');
  await box.fill('s.physics("n2", dt="0.001", t_end="0.02")');
  await box.press('Enter');
  await page.locator('.props').getByRole('button', { name: '▶ Resolver' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__magfem.solutions.size), { timeout: 30000 }).toBeGreaterThan(0);
  await defaultView(page);
  await expect.poll(() => page.evaluate(() => (window as any).__magfem.mode)).toBe('post');
  const n = await page.evaluate(() => [...(window as any).__magfem.solutions.values()][0].times.length);
  expect(n).toBe(20);
  const slider = page.getByRole('slider', { name: 't' });
  await expect(slider).toBeVisible();
  // t = 5 ms (¼ de período): pico; t = 10 ms: ~zero.
  await slider.fill('4');
  const b5 = await page.evaluate(() => (window as any).__magfem.shownSol().bmax);
  await slider.fill('9');
  const b10 = await page.evaluate(() => (window as any).__magfem.shownSol().bmax);
  expect(b5).toBeGreaterThan(10 * b10);
  await expect(page.locator('.time-label')).toContainText('10/20');
  // x dobrado (0,01 → 0,02, abaixo da saturação): o campo praticamente dobra.
  const b5x1 = b5;
  await box.fill('g.var("x", "0.02")');
  await box.press('Enter');
  await page.getByRole('treeitem', { name: /Campo magnético/ }).first().click();
  await page.locator('.props').getByRole('button', { name: '▶ Resolver' }).click();
  await expect.poll(() => page.evaluate(() => [...(window as any).__magfem.solutions.values()][0].key), { timeout: 30000 }).not.toBe('');
  await slider.fill('4');
  const b5x2 = await page.evaluate(() => (window as any).__magfem.shownSol().bmax);
  expect(b5x2 / b5x1).toBeGreaterThan(1.9);
  expect(b5x2 / b5x1).toBeLessThan(2.1);
});

test('curva B-H: arrastar um ponto muda B (e respeita os vizinhos)', async ({ page }) => {
  await page.getByRole('button', { name: 'Problema e bibliotecas' }).click();
  await page.getByRole('tab', { name: 'Materiais' }).click();
  await page.getByRole('option', { name: /Aço M400-50A/ }).click();
  await page.getByRole('button', { name: 'Ver curva B-H (aba)' }).click();
  const before = (await sketch(page)).materials.find((m: any) => m.id === 'mat_m400').bh;
  const pt = page.locator('.chart-pane circle.pt[aria-label="3"]');
  const box = await pt.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2, box!.y - 30, { steps: 5 });
  await page.mouse.up();
  const after = (await sketch(page)).materials.find((m: any) => m.id === 'mat_m400').bh;
  expect(after[2][1]).toBeGreaterThan(before[2][1]);
  expect(after[2][1]).toBeLessThanOrEqual(after[3][1]);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('transitório: resultados viram curvas no tempo (corrente senoidal) e tabela num instante escolhido', async ({ page }) => {
  const box = await coreModel(page, '2*sin(2*pi*50*t)');
  await page.getByRole('treeitem', { name: /Campo magnético/ }).first().click();
  await page.locator('.props label', { hasText: 'Análise' }).locator('select').selectOption('transient');
  const run = async (c: string) => {
    await box.fill(c);
    await box.press('Enter');
  };
  await run('s.physics("n2", dt="0.001", t_end="0.02")');
  await run('tb = r.table("n2", id="tb1")');
  await run('r.item("tb1", "surfint", id="it1")');
  // Região da bobina e saída "corrente ∫J dA" (nome I_bob).
  await page.evaluate(async () => {
    const ed = (window as any).__magfem;
    const { updateNode } = await import('/tools/magfem-web/src/cad/tree.ts');
    const r = ed.arrangement().regions.find((x: any) => Math.abs(x.label.x) < 1e-6 || (x.label.x > -25 && x.label.x < 25 && Math.abs(x.area - 5000) < 1));
    ed.commit(updateNode(ed.sketch, 'it1', { regions: [{ curves: r.curves, seed: r.label }], outputs: [{ q: 'current', name: 'I_bob' }] }), []);
  });
  await page.getByRole('treeitem', { name: /Campo magnético/ }).first().getByRole('button', { name: 'Resolver' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__magfem.solutions.size), { timeout: 30000 }).toBeGreaterThan(0);
  const ts = await page.evaluate(async () => {
    const ed = (window as any).__magfem;
    const { itemTimeSeries } = await import('/tools/magfem-web/src/ui/CanvasTabs.tsx');
    return itemTimeSeries(ed, ed.sketch.nodes.find((n: any) => n.id === 'it1'));
  });
  expect(ts.t).toHaveLength(20);
  const s = ts.series.find((x: any) => x.label === 'I_bob');
  // ∫J dA = N·i = 400 · 2 sin(2π·50·t).
  for (let k = 0; k < 20; k++) expect(s.y[k]).toBeCloseTo(800 * Math.sin(2 * Math.PI * 50 * ts.t[k]), 3);
  // Na aba da tabela: uma curva por variável; escolhendo um instante, vira tabela.
  await page.getByRole('treeitem', { name: /Resultados|Tabela/ }).last().click().catch(() => {});
  await page.evaluate(() => {
    const ed = (window as any).__magfem;
    ed.commit(ed.sketch, []);
  });
  await run('r.show("it1", at_time=4)');
  const inst = await page.evaluate(async () => {
    const ed = (window as any).__magfem;
    const { tableItemRows } = await import('/tools/magfem-web/src/ui/CanvasTabs.tsx');
    return tableItemRows(ed, ed.sketch.nodes.find((n: any) => n.id === 'it1')).rows;
  });
  expect(inst[0][1]).toMatch(/800/);
});

test('correntes por física: o transitório não muda a do estático; circuito no tempo traz L, V e perdas', async ({ page }) => {
  const box = page.getByRole('textbox', { name: 'Console' });
  const run = async (c: string) => {
    await box.fill(c);
    await box.press('Enter');
  };
  for (const c of [
    'g.rectangle((-105, -110), (105, 110))',
    'g.rectangle((-45, -70), (45, 70))',
    'g.rectangle((-25, -50), (25, 50))',
    'm.circuit("Bobina", current="1")',
    'm.region((0, 90), material="Ar")',
    'm.region((-35, 0), material="Aço M400-50A")',
    'm.region((0, 0), material="Cobre", circuit="Bobina", turns=400)',
    's.add_physics(name="Transitório", id="n7")',
    's.physics("n7", analysis="transient", dt="0.001", t_end="0.02")',
    's.current("n7", "Bobina", "2*sin(2*pi*50*t)")',
    'r.table("n7", id="tb2")',
    'r.item("tb2", "circuits", id="ic")',
  ])
    await run(c);
  let sk = await sketch(page);
  expect(sk.circuits[0].current).toBe('1');
  expect(sk.nodes.find((n: any) => n.id === 'n2').currents).toBeUndefined();
  expect(sk.nodes.find((n: any) => n.id === 'n7').currents).toEqual({ [sk.circuits[0].id]: '2*sin(2*pi*50*t)' });
  // Na interface: cada física mostra (e edita) só a sua corrente.
  await page.getByRole('treeitem', { name: /Transitório/ }).first().click();
  await expect(page.getByRole('textbox', { name: 'Bobina (A)' })).toHaveValue('2*sin(2*pi*50*t)');
  await page.getByRole('treeitem', { name: /Campo magnético/ }).first().click();
  await expect(page.getByRole('textbox', { name: 'Bobina (A)' })).toHaveValue('1');
  await page.getByRole('textbox', { name: 'Bobina (A)' }).fill('3');
  await page.getByRole('textbox', { name: 'Bobina (A)' }).press('Enter');
  sk = await sketch(page);
  expect(sk.nodes.find((n: any) => n.id === 'n7').currents[sk.circuits[0].id]).toBe('2*sin(2*pi*50*t)');
  // O script exportado recria as correntes de cada física.
  const script = await page.evaluate(async () => {
    const { generateScript } = await import('/tools/magfem-web/src/cad/script.ts');
    return generateScript((window as any).__magfem.sketch);
  });
  expect(script).toContain('s.current("n7", ');
  // Resolve o transitório: corrente senoidal e as curvas de L, V e perdas do circuito.
  await run('s.solve("n7")');
  await expect.poll(() => page.evaluate(() => (window as any).__magfem.solutions.has('n7')), { timeout: 30000 }).toBe(true);
  const ts = await page.evaluate(async () => {
    const ed = (window as any).__magfem;
    const { itemTimeSeries } = await import('/tools/magfem-web/src/ui/CanvasTabs.tsx');
    return itemTimeSeries(ed, ed.sketch.nodes.find((n: any) => n.id === 'ic'));
  });
  const labels = ts.series.map((s: any) => s.label);
  expect(labels).toEqual(expect.arrayContaining(['Bobina_I', 'Bobina_lambda', 'Bobina_L', 'Bobina_V', 'Bobina_P']));
  const I = ts.series.find((s: any) => s.label === 'Bobina_I').y;
  for (let k = 0; k < ts.t.length; k++) expect(I[k]).toBeCloseTo(2 * Math.sin(2 * Math.PI * 50 * ts.t[k]), 6);
  const L = ts.series.find((s: any) => s.label === 'Bobina_L').y.filter((v: number) => Number.isFinite(v));
  expect(L.length).toBeGreaterThan(5);
  expect(Math.min(...L)).toBeGreaterThan(0);
  // Na aba da tabela, o gráfico de L omite os instantes com i = 0 (sem "NaN" na escala nem no traço).
  const tbName = (await sketch(page)).nodes.find((n: any) => n.id === 'tb2').name;
  await page.getByRole('treeitem', { name: tbName, exact: true }).click();
  const chartL = page.locator('svg.xychart[aria-label^="Bobina_L"]');
  await expect(chartL).toBeVisible();
  expect(await chartL.innerHTML()).not.toContain('NaN');
});

import { expect, test } from '@playwright/test';
import { openApp, sketch } from './helpers';

test('circuito externo: fonte + R + bobina do FEM acoplados no transitório (KVL e v_R = R i)', async ({ page }) => {
  await openApp(page);
  const box = page.getByRole('textbox', { name: 'Console' });
  const run = async (c: string) => {
    await box.fill(c);
    await box.press('Enter');
  };
  for (const c of [
    'g.rectangle((0, 0), (200, 100))',
    'g.rectangle((50, 40), (70, 60))',
    'g.rectangle((130, 40), (150, 60))',
    'm.circuit("Bobina", current="1")',
    'm.region((100, 90), material="Ar")',
    'm.region((60, 50), material="Ar", circuit="Bobina", turns=100)',
    'm.region((140, 50), material="Ar", circuit="Bobina", turns=-100)',
    'g.problem("planar", depth="500 mm")',
  ])
    await run(c);

  // Método de resolução → + → Campo magnético + circuito: cria a física acoplada e o circuito (aba "Circuito").
  await page.getByRole('button', { name: 'Incluir no método de resolução' }).click();
  await page.getByRole('menuitem', { name: /Campo magnético \+ circuito/ }).click();
  await page.getByRole('button', { name: 'Abrir o circuito' }).click();
  await expect(page.getByRole('tab', { name: /Circuito/ }).last()).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.sch-canvas').getByRole('button', { name: 'Bobina', exact: true })).toBeVisible();

  // Componentes na paleta da esquerda (onde fica a árvore).
  for (const k of ['Fonte de tensão', 'Resistor', 'Terra']) await page.locator('.sch-palette').getByRole('button', { name: k, exact: true }).click();
  const pin = (n: string) => page.locator(`.sch-canvas circle[aria-label="${n}"]`);
  const wire = async (a: string, b: string) => {
    await pin(a).click();
    await pin(b).click();
  };
  await wire('V1:1', 'R1:0');
  await wire('R1:1', 'Bobina:0');
  await wire('Bobina:1', 'GND1:0');
  // Um fio arrastado de terminal a terminal.
  const a = await pin('V1:0').boundingBox();
  const b = await pin('GND1:0').boundingBox();
  await page.mouse.move(a!.x + a!.width / 2, a!.y + a!.height / 2);
  await page.mouse.down();
  await page.mouse.move(b!.x + b!.width / 2, b!.y + b!.height / 2, { steps: 8 });
  await page.mouse.up();
  let sch = (await sketch(page)).nodes.find((n: any) => n.kind === 'schematic');
  expect(sch.wires).toHaveLength(4);
  // Valores: R = 0,5 Ω (fonte já vem com 10 V, 50 Hz).
  await page.locator('.sch-canvas').getByRole('button', { name: 'R1', exact: true }).click();
  await page.locator('.sch-sidebar').getByLabel('Resistência (Ω)').fill('0.5');
  await page.locator('.sch-sidebar').getByLabel('Resistência (Ω)').press('Enter');

  const phys = (await sketch(page)).nodes.find((n: any) => n.kind === 'physics' && n.coupled).id;
  await run(`s.physics("${phys}", dt="0.0001", t_end="0.02")`);
  await run('m.settings("n1", size="4 mm")');
  await run(`s.solve("${phys}")`);
  await expect.poll(() => page.evaluate(() => !!([...(window as any).__magfem.solutions.values()][0]?.circuit)), { timeout: 30000 }).toBe(true);
  const r = await page.evaluate(async () => {
    const ed = (window as any).__magfem;
    const { partSignal } = await import('/tools/magfem-web/src/cad/schematic.ts');
    const sol = [...ed.solutions.values()][0];
    const sch = ed.sketch.nodes.find((n: any) => n.kind === 'schematic');
    const id = (name: string) => sch.parts.find((p: any) => p.name === name).id;
    let kvl = 0, ohm = 0, imax = 0;
    for (let k = 0; k < sol.times.length; k++) {
      const v = partSignal(sol.circuit, id('V1'), k), rr = partSignal(sol.circuit, id('R1'), k), c = partSignal(sol.circuit, id('Bobina'), k);
      // + da fonte (pino 0) está no terra: a malha fecha com v_fonte + v_R + v_bobina = 0.
      kvl = Math.max(kvl, Math.abs(v.v + rr.v + c.v));
      ohm = Math.max(ohm, Math.abs(rr.v - 0.5 * rr.i));
      imax = Math.max(imax, Math.abs(c.i));
    }
    return { kvl, ohm, imax, n: sol.times.length };
  });
  expect(r.n).toBe(200);
  expect(r.imax).toBeGreaterThan(0.1);
  expect(r.kvl).toBeLessThan(1e-9);
  expect(r.ohm).toBeLessThan(1e-9);
  // Valores no esquemático e gráfico por variável.
  await page.getByRole('tab', { name: /Circuito/ }).last().click();
  await expect(page.locator('.sch-live').first()).toContainText('i =');
  await page.locator('.sig-opt', { hasText: 'i(Bobina)' }).locator('input').check();
  await page.locator('.sig-opt', { hasText: 'v(R1)' }).locator('input').check();
  await expect(page.locator('.sch-signals-charts svg.xychart')).toHaveCount(2);
  await expect(page.locator('.sch-value', { hasText: '0.5 Ω' })).toBeVisible();
  sch = (await sketch(page)).nodes.find((n: any) => n.kind === 'schematic');
  expect(sch.parts.map((p: any) => p.kind).sort()).toEqual(['R', 'V', 'coil', 'gnd']);
});

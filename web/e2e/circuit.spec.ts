import { expect, test } from '@playwright/test';
import { openApp, sketch, defaultView, addPhysics } from './helpers';

const MU0 = 4e-7 * Math.PI;

test('circuito: λ, L = λ/I (½LI² = energia), R e perdas; tabela nos resultados', async ({ page }) => {
  await openApp(page);
  await addPhysics(page);
  const box = page.getByRole('textbox', { name: 'Console' });
  const run = async (cmd: string) => {
    await box.fill(cmd);
    await box.press('Enter');
  };
  await run('g.rectangle((0, 0), (100, 50))');
  const sk = await sketch(page);
  const lines = Object.values(sk.entities).filter((e: any) => e.type === 'line') as any[];
  const vert = lines.filter((l) => Math.abs(sk.entities[l.p1].x - sk.entities[l.p2].x) < 1e-9).map((l) => `"${l.id}"`);
  const horiz = lines.filter((l) => Math.abs(sk.entities[l.p1].x - sk.entities[l.p2].x) >= 1e-9).map((l) => `"${l.id}"`);
  await run('m.circuit("Bobina", current="1000")');
  await run('m.region((50, 25), material="Cobre", circuit="Bobina", turns=1)');
  await run(`m.boundary([${vert.join(', ')}], "dirichlet")`);
  await run(`m.boundary([${horiz.join(', ')}], "neumann")`);
  await run('m.settings("n1", size="2 mm")');

  // Circuito aparece em Malha › Circuitos.
  await expect(page.getByRole('treeitem', { name: 'Bobina', exact: true })).toBeVisible();

  await page.getByRole('treeitem', { name: /Campo magnético/ }).first().getByRole('button', { name: 'Resolver' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__magfem.solutions.size), { timeout: 15000 }).toBeGreaterThan(0);
  await defaultView(page);
  await expect.poll(() => page.evaluate(() => (window as any).__magfem.mode)).toBe('post');
  await expect(page.locator('.props .circ-table')).toContainText('Bobina');

  const r = await page.evaluate(async () => {
    const ed = (window as any).__magfem;
    const { circuitResults, depthOf } = await import('/tools/magfem-web/src/cad/solve.ts');
    const sol = [...ed.solutions.values()][0];
    return { c: circuitResults(ed.sketch, ed.arrangement(), sol)[0], energy: sol.energy, depth: depthOf(ed.sketch) };
  });
  const I = 1000, A = 0.1 * 0.05, J = I / A, L = 0.1;
  // λ analítico: profundidade × média de A = μ0 J L²/12.
  const lambda = r.depth * MU0 * J * L * L / 12;
  expect(Math.abs(r.c.lambda - lambda) / lambda).toBeLessThan(0.01);
  // Energia: ½ L I² = W.
  expect(Math.abs(0.5 * r.c.L * I * I - r.energy) / r.energy).toBeLessThan(0.01);
  // R CC = N² ℓ / (σ A) com σ do cobre (58 MS/m); perdas = R I².
  const R = (r.depth / (58e6 * A));
  expect(Math.abs(r.c.R - R) / R).toBeLessThan(1e-6);
  expect(Math.abs(r.c.P - R * I * I) / (R * I * I)).toBeLessThan(1e-6);

  // Tabela em aba pelo + da física.
  const grp = page.locator('.tree').getByRole('treeitem', { name: 'Campo magnético' }).last();
  await grp.getByRole('button', { name: 'Nova vista (aba) com…' }).click();
  await page.getByRole('menuitem', { name: /^Circuitos/ }).click();
  await expect(page.getByRole('tab', { name: /Circuitos/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.chart-pane .circ-table')).toContainText('Bobina');

  // Resultados (valores): integral de superfície na região da bobina e integral sobre linha.
  await grp.getByRole('button', { name: 'Nova vista (aba) com…' }).click();
  await page.getByRole('menuitem', { name: /Resultados \(valores\)/ }).click();
  const tbl = page.getByRole('treeitem', { name: 'Resultados', exact: true });
  await tbl.getByRole('button', { name: 'Incluir na tabela' }).click();
  await page.getByRole('menuitem', { name: /Integral de superfície/ }).click();
  await page.locator('.region-pick input[type=checkbox]').first().check();
  // Corrente total = I × espiras (a região é a única).
  await expect(page.locator('.props .circ-table')).toContainText('1.000 kA');
  await expect(page.locator('.chart-pane .table-item')).toContainText('Energia');

  // Grandezas escolhidas com nomes próprios: só ∫A dS (fluxoA) e área (areaBob).
  const outs = page.locator('.outputs .out-row');
  for (const q of ['Volume', 'Corrente ∫J dA', 'Energia ½∫B·H dV', '|B| médio', '∫|B|² dV']) await outs.filter({ hasText: q }).locator('input[type=checkbox]').uncheck();
  await outs.filter({ hasText: '∫A dS' }).getByRole('textbox').fill('fluxoA');
  await outs.filter({ hasText: '∫A dS' }).getByRole('textbox').press('Enter');
  await outs.filter({ hasText: 'Área' }).getByRole('textbox').fill('areaBob');
  await outs.filter({ hasText: 'Área' }).getByRole('textbox').press('Enter');
  await expect(page.locator('.chart-pane .table-item').last()).toContainText('fluxoA');
  await expect(page.locator('.chart-pane .table-item').last()).not.toContainText('Energia');

  // Fórmula com variáveis de resultado: fluxo concatenado = N ∫A dS / área × profundidade (N = 1) = λ do circuito.
  await tbl.getByRole('button', { name: 'Incluir na tabela' }).click();
  await page.getByRole('menuitem', { name: /Fórmula/ }).click();
  await page.getByLabel('Expressão').fill('fluxoA / areaBob * depth_m');
  await page.getByLabel('Expressão').press('Enter');
  await expect(page.locator('.var-list')).toContainText('fluxoA');
  const f = await page.evaluate(async () => {
    const ed = (window as any).__magfem;
    const { resultVars } = await import('/tools/magfem-web/src/cad/results.ts');
    const phys = ed.sketch.nodes.find((n: any) => n.kind === 'physics').id;
    const rv = resultVars(ed.sketch, ed.arrangement(), ed.shownSol(phys), phys);
    const it = ed.sketch.nodes.find((n: any) => n.item === 'formula');
    return { f: rv.formulas.get(it.id).value, lambda: rv.env.get('Bobina_lambda').v };
  });
  expect(Math.abs(f.f - f.lambda) / f.lambda).toBeLessThan(1e-9);
  await expect(page.locator('.chart-pane .table-item').last()).toContainText('F1 =');
});

import { expect, test } from '@playwright/test';
import { addPhysics, openApp } from './helpers';

test.beforeEach(async ({ page }) => {
  await openApp(page);
  await addPhysics(page);
});

const run = async (page: any, lines: string[]) => {
  const box = page.getByRole('textbox', { name: 'Console' });
  for (const c of lines) {
    await box.fill(c);
    await box.press('Enter');
  }
};
const solve = async (page: any) => {
  await page.getByRole('treeitem', { name: /Campo magnético/ }).first().getByRole('button', { name: 'Resolver' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__magfem.solutions.size), { timeout: 30000 }).toBeGreaterThan(0);
};
const vars = (page: any) =>
  page.evaluate(async () => {
    const ed = (window as any).__magfem;
    const { resultVars } = await import('/tools/magfem-web/src/cad/results.ts');
    return Object.fromEntries(resultVars(ed.sketch, ed.arrangement(), ed.shownSol('n2'), 'n2').list.map((x: any) => [x.name, x.value]));
  });

test('chapas laminadas: perdas no volume de aço com B/f, k_e pela espessura e sem correntes parasitas de bloco', async ({ page }) => {
  const f = 0.9, d = 0.35e-3, sigma = 2e6, kh = 10, freq = 50, B = 0.1;
  await run(page, [
    'g.problem("planar", depth="100 mm")',
    'g.rectangle((-100, -100), (100, 100))',
    'g.rectangle((-20, -10), (20, 10))',
    // μr = 1: o campo uniforme imposto pela borda não muda com a laminação (B médio = 0,1 T).
    `m.material("Chapa", mur=1, sigma=2, kh=${kh}, alpha=2, lam_fill=${f}, lam_thickness=0.35)`,
    'm.region((0, 0), material="Chapa")',
    'm.region((60, 60), material="Ar")',
    'm.boundary_def("Dirichlet (A = 0)", a1="-0.1")',
    `s.physics("n2", analysis="harmonic", frequency="${freq}")`,
    'r.table("n2", id="tb1")',
    'r.item("tb1", "surfint", id="fe")',
    'r.show("fe", regions=[(0, 0)], outputs=[("ironLoss", "P_fe"), ("loss", "P_joule")])',
  ]);
  await solve(page);
  const v = await vars(page);
  const V = 0.04 * 0.02 * 0.1;
  const ke = (Math.PI ** 2 * sigma * d * d) / 6;
  // Volume de aço f·V com B_aço = B/f: P = f·V·[kh·freq·(B/f)² + ke·(freq·B/f)²].
  const want = f * V * (kh * freq * (B / f) ** 2 + ke * (freq * B / f) ** 2);
  expect(Math.abs(v.P_fe - want) / want).toBeLessThan(1e-6);
  // Laminado: σ não gera correntes parasitas de bloco (elas já estão no k_e).
  expect(v.P_joule).toBe(0);
});

test('chapas laminadas: material equivalente (ν linear e curva B-H) com o fator de empilhamento', async ({ page }) => {
  await run(page, [
    'g.rectangle((-100, -100), (100, 100))',
    'g.rectangle((-20, -10), (20, 10))',
    'm.material("Linear", mur=1000, sigma=0, lam_fill=0.5)',
    'm.region((0, 0), material="Linear")',
    'm.region((60, 60), material="Aço M400-50A")',
    'm.material("Aço M400-50A", lam_fill=0.95)',
    'm.generate("n1")',
  ]);
  await page.waitForFunction(() => (window as any).__magfem.meshes.size > 0, null, { timeout: 30000 });
  const r = await page.evaluate(async () => {
    const ed = (window as any).__magfem;
    const { buildMagInput } = await import('/tools/magfem-web/src/cad/solve.ts');
    const arr = ed.arrangement();
    const { input } = buildMagInput(ed.sketch, arr, [...ed.meshes.values()][0], ed.defaultOuter());
    const inner = arr.regions.findIndex((x: any) => Math.abs(x.area - 800) < 1);
    const outer = arr.regions.findIndex((x: any, i: number) => i !== inner && x.area > 800);
    const bh = ed.sketch.materials.find((m: any) => m.id === 'mat_m400').bh;
    return { nu: input.nu[inner], bhB: input.bhB.slice(input.bhStart[outer], input.bhStart[outer] + 3), bhH: input.bhH.slice(input.bhStart[outer], input.bhStart[outer] + 3), src: bh.filter((p: any) => p[0] > 0 && p[1] > 0).slice(0, 3) };
  });
  const MU0 = 4e-7 * Math.PI;
  expect(r.nu).toBeCloseTo(1 / (MU0 * (0.5 * 1000 + 0.5)), 6);
  r.src.forEach(([h, b]: [number, number], k: number) => {
    expect(r.bhH[k]).toBe(h);
    expect(r.bhB[k]).toBeCloseTo(0.95 * b + 0.05 * MU0 * h, 12);
  });
});

test('fio da bobina: R CC pela seção do AWG e fator de enchimento (axissimétrico)', async ({ page }) => {
  const N = 100, awg = 20;
  await run(page, [
    'g.problem("axisymmetric")',
    'g.line((0, -60), (0, 60))',
    'g.line((0, 60), (60, 60))',
    'g.line((60, 60), (60, -60))',
    'g.line((60, -60), (0, -60))',
    'g.rectangle((10, -5), (20, 5))',
    'm.circuit("Bobina", current="1")',
    'm.region((40, 40), material="Ar")',
    `m.region((15, 0), material="Cobre", circuit="Bobina", turns=${N}, wire_awg=${awg})`,
    'm.settings("n1", size="3 mm")',
  ]);
  await solve(page);
  const v = await vars(page);
  const dmm = 0.127 * 92 ** ((36 - awg) / 39);
  const A = (Math.PI * (dmm * 1e-3) ** 2) / 4;
  // ℓ = 2π·r_médio, r_médio = 15 mm (centroide do retângulo); ρ = 1/58e6.
  const want = (N * 2 * Math.PI * 0.015) / (58e6 * A);
  expect(Math.abs(v.Bobina_R - want) / want).toBeLessThan(2e-3);
  const fill = await page.evaluate(async () => {
    const ed = (window as any).__magfem;
    const { circuitResults } = await import('/tools/magfem-web/src/cad/solve.ts');
    return circuitResults(ed.sketch, ed.arrangement(), ed.shownSol('n2'))[0].fill;
  });
  expect(fill).toBeCloseTo((N * A) / 1e-4, 3);
  // A interface mostra o fio e o enchimento nas propriedades da região; fios em paralelo pela interface.
  const code = await page.locator('.console .code').innerText();
  expect(code).toContain(`wire_awg=${awg}`);
  const mats = page.locator('.tree').getByRole('treeitem', { name: 'Materiais' });
  await mats.click();
  const coil = page.locator('.tree [role=treeitem]').filter({ hasText: 'Cobre' }).first();
  await coil.click();
  await expect(page.getByRole('combobox', { name: 'Fio', exact: true })).toHaveValue('awg');
  await expect(page.locator('.props')).toContainText(`AWG ${awg}`);
  await expect(page.locator('.props')).toContainText('enchimento');
  await page.getByRole('textbox', { name: 'Fios em paralelo' }).fill('2');
  await page.getByRole('textbox', { name: 'Fios em paralelo' }).press('Enter');
  await expect.poll(async () => (await page.evaluate(() => (window as any).__magfem.sketch.regionAssigns.find((a: any) => a.wire)?.wire.parallel))).toBe(2);
  // Editor do material: laminação.
  await page.getByRole('button', { name: 'Editar este material' }).click();
  await page.getByRole('combobox', { name: 'Construção' }).selectOption('lam');
  await expect(page.getByRole('textbox', { name: 'Fator de empilhamento (0–1)' })).toHaveValue('0.95');
  expect(await page.evaluate(() => (window as any).__magfem.sketch.materials.find((m: any) => m.id === 'mat_cu').lamFill)).toBe(0.95);
});

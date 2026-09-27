import { expect, test } from '@playwright/test';
import { addPhysics, openApp, sketch } from './helpers';

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
const solveThermal = async (page: any) => {
  await page.evaluate(() => (window as any).__magfem.solutions.delete('n9'));
  await run(page, ['s.solve("n9")']);
  await expect.poll(() => page.evaluate(() => (window as any).__magfem.solutions.has('n9')), { timeout: 30000 }).toBe(true);
  return page.evaluate(async () => {
    const ed = (window as any).__magfem;
    const { resultVars } = await import('/tools/magfem-web/src/cad/results.ts');
    return Object.fromEntries(resultVars(ed.sketch, ed.arrangement(), ed.solutions.get('n9'), 'n9').list.map((x: any) => [x.name, x.value]));
  });
};

test('térmica em regime: bloco de cobre com corrente CC — balanço, T pela convecção, resistividade com T e ventilador', async ({ page }) => {
  test.setTimeout(90000);
  // Bloco 20 × 10 mm, I = 200 A → J = 1 A/mm², q = J²/σ; profundidade 100 mm.
  await run(page, [
    'g.problem("planar", depth="100 mm")',
    'g.rectangle((-60, -60), (60, 60))',
    'g.rectangle((-10, -5), (10, 5))',
    'm.region((0, 0), name="Bloco", material="Cobre", current="200")',
    'm.region((40, 40), material="Ar")',
    'm.settings("n1", size="2 mm")',
    's.add_physics(name="Térmica", thermal=True, source="n2", id="n9")',
    's.thermal("n9", source="n2", t_amb="25", h="10", couple_r=False)',
  ]);
  const P = (1e6 ** 2 / 58e6) * (0.02 * 0.01) * 0.1;
  const hS = 10 * 0.06 * 0.1;
  let v = await solveThermal(page);
  expect(Math.abs(v.P_perdas - P) / P).toBeLessThan(1e-3);
  expect(Math.abs(v.P_dissipado - v.P_perdas) / P).toBeLessThan(1e-6);
  expect(v.Bloco_Tavg).toBeCloseTo(25 + P / hS, 1);
  // Resistividade com a temperatura: T = T_amb + P20·(1 + α(T − 20))/(hS), resolvido em forma fechada.
  await run(page, ['s.thermal("n9", source="n2", t_amb="25", h="10", couple_r=True)']);
  v = await solveThermal(page);
  const a = 0.00393;
  const Tc = (25 + (P * (1 - 20 * a)) / hS) / (1 - (P * a) / hS);
  expect(v.Bloco_Tavg).toBeCloseTo(Tc, 1);
  // Ventilador: as 4 faces do bloco trocam calor com o ar do canal (h = 50); o ar leva tudo.
  const sk = await sketch(page);
  const lines = Object.values(sk.entities).filter((e: any) => e.type === 'line' && Math.abs(sk.entities[e.p1].x) <= 10 + 1e-9 && Math.abs(sk.entities[e.p2].x) <= 10 + 1e-9).map((e: any) => e.id);
  expect(lines).toHaveLength(4);
  await run(page, [
    's.channel("n9", "Ventilador", flow="1", t_in="25")',
    `s.thermal_bc("n9", "Ar forçado", curves=[${lines.map((l: string) => `"${l}"`).join(', ')}], type="convection", h="50", channel="Ventilador")`,
  ]);
  v = await solveThermal(page);
  const Pnow = v.P_perdas;
  expect(v.Ventilador_P / Pnow).toBeCloseTo(1, 3);
  expect(v.Ventilador_Tsaida).toBeCloseTo(25 + Pnow / (1.2 * 1005 * (1 / 3600)), 2);
  // O script exportado recria a física térmica.
  const script = await page.evaluate(async () => {
    const { generateScript } = await import('/tools/magfem-web/src/cad/script.ts');
    return generateScript((window as any).__magfem.sketch);
  });
  expect(script).toContain('thermal=True');
  expect(script).toContain('s.channel("n9", "Ventilador"');
  expect(script).toContain('s.thermal_bc("n9", "Ar forçado"');
});

test('térmica com AC: placa de alumínio maciça — a σ(T) entra no AC (resolvido de novo) e o balanço fecha', async ({ page }) => {
  test.setTimeout(90000);
  await run(page, [
    'g.problem("planar", depth="100 mm")',
    'g.rectangle((-100, -100), (100, 100))',
    'g.rectangle((-40, -10), (-20, 10))',
    'g.rectangle((10, -30), (20, 30))',
    'm.region((-30, 0), name="Bobina", material="Cobre", current="3000")',
    'm.region((15, 0), name="Placa", material="Alumínio")',
    'm.region((60, 60), material="Ar")',
    'm.settings("n1", size="3 mm")',
    's.physics("n2", analysis="harmonic", frequency="50")',
    's.add_physics(name="Térmica", thermal=True, source="n2", id="n9")',
    's.thermal("n9", source="n2", t_amb="25", h="10", couple_r=True)',
  ]);
  const v = await solveThermal(page);
  expect(Math.abs(v.P_dissipado - v.P_perdas) / v.P_perdas).toBeLessThan(1e-6);
  const info = await page.evaluate(() => {
    const ed = (window as any).__magfem;
    return { it: ed.solutions.get('n9').iterations, scale: [...(ed.sigmaScale.get('n2') ?? new Map()).values()] };
  });
  // Houve mais de uma volta e a placa (maciça, com α) teve a condutividade corrigida no AC.
  expect(info.it).toBeGreaterThan(1);
  expect(info.scale.length).toBe(1);
  const rho = 1 + 0.00403 * (v.Placa_Tavg - 20);
  expect(info.scale[0]).toBeCloseTo(1 / rho, 2);
});

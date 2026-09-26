// Capturas de tela da documentação (docs/public/img). Só roda com DOCS_SHOTS=1: ./scripts/docs-shots
import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

// O mesmo modelo do tutorial (docs/guide/first-model.md): bobina axissimétrica com núcleo de aço.
export const TUTORIAL = {
  geometry: [
    'reset()',
    's.add_physics(id="n2")',
    'g.problem("axisymmetric")',
    'g.var("I", "2")',
    'g.line((0, -60), (0, -25))',
    'g.line((0, -25), (0, 25))',
    'g.line((0, 25), (0, 60))',
    'g.line((0, 60), (60, 60))',
    'g.line((60, 60), (60, -60))',
    'g.line((60, -60), (0, -60))',
    'g.line((0, -25), (8, -25))',
    'g.line((8, -25), (8, 25))',
    'g.line((8, 25), (0, 25))',
    'g.rectangle((11, -15), (19, 15))',
  ],
  preprocess: [
    'm.circuit("COIL", current="I")',
    'm.region((40, 40), material="mat_air")',
    'm.region((4, 0), material="mat_1010")',
    'm.region((15, 0), material="mat_cu", circuit="COIL", turns=500)',
    'm.settings("n1", size="2.5 mm")',
    'm.mesh_size((4, 0), "0.8 mm")',
    'm.mesh_size((15, 0), "0.8 mm")',
  ],
  results: [
    's.solve("n2")',
    'r.view("n2", id="v1")',
    'r.plot("v1", "surface", quantity="b")',
    'r.plot("v1", "contour")',
    'r.table("n2", id="tb1")',
    'r.item("tb1", "circuits")',
  ],
};

async function run(page: Page, lines: string[], lang: 'pt' | 'en') {
  const box = page.getByRole('textbox', { name: 'Console' });
  for (const line of lines) {
    // O circuito se chama "Bobina" nas capturas em português e "Coil" nas em inglês.
    const c = line.replace('COIL', lang === 'pt' ? 'Bobina' : 'Coil');
    await box.fill(c);
    await box.press('Enter');
  }
}

for (const lang of ['pt', 'en'] as const) {
  test(`capturas (${lang})`, async ({ page }) => {
    test.skip(!process.env.DOCS_SHOTS, 'só com DOCS_SHOTS=1 (./scripts/docs-shots)');
    test.setTimeout(120000);
    await page.setViewportSize({ width: 1440, height: 860 });
    await page.emulateMedia({ colorScheme: 'light' });
    await openApp(page);
    if (lang === 'en') await page.getByRole('button', { name: 'EN', exact: true }).click();
    const shot = (name: string) => page.screenshot({ path: `test-results/docs/${name}-${lang}.png` });
    await run(page, TUTORIAL.geometry, lang);
    await page.evaluate(() => (window as any).__magfem.fit());
    await shot('geometry');
    await run(page, TUTORIAL.preprocess, lang);
    await shot('materials');
    await run(page, ['m.generate("n1")'], lang);
    await run(page, TUTORIAL.results, lang);
    await page.waitForFunction(() => (window as any).__magfem.solutions.size > 0 && !(window as any).__magfem.solveBusy, null, { timeout: 60000 });
    const tree = page.getByRole('tree');
    const item = (pt: string, en: string) => tree.getByRole('treeitem', { name: lang === 'pt' ? pt : en, exact: true });
    await item('Elementos', 'Elements').click();
    await page.waitForTimeout(800);
    await shot('mesh');
    await item('Vista 1', 'View 1').click();
    await page.waitForTimeout(1500);
    await shot('field');
    await item('Tabela 1', 'Table 1').click();
    await page.waitForTimeout(800);
    await shot('table');
    // Script local (ponte): a caixa com os comandos.
    await page.getByRole('button', { name: lang === 'pt' ? /Script local/ : /Local script/ }).click();
    await page.locator('.bridge-pop').screenshot({ path: `test-results/docs/bridge-${lang}.png` });
    await expect(page.locator('.bridge-pop')).toBeVisible();
  });
}

import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

// Precisa da ponte Python rodando no host: python -m magfem --port 8799 --key e2e-chave
// (./scripts/e2e usa --network host). Sem ela, o teste é pulado.
const PORT = 8799;
const KEY = 'e2e-chave';
const BASE = `http://127.0.0.1:${PORT}`;

test('ponte Python: o script monta o modelo, resolve e lê a força pela ponte', async ({ page }) => {
  const up = await fetch(`${BASE}/status`).then((r) => r.ok, () => false);
  test.skip(!up, 'ponte Python não está rodando na porta 8799');
  await openApp(page);
  await page.getByRole('button', { name: /Script local/ }).click();
  await page.locator('#bridge-port').fill(String(PORT));
  await page.locator('#bridge-key').fill(KEY);
  await page.getByRole('button', { name: 'Conectar' }).click();
  await expect(page.getByRole('button', { name: /Script local ●/ })).toBeVisible();
  const run = async (code: string) => {
    const r = await fetch(`${BASE}/run`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-MagFEM-Key': KEY }, body: JSON.stringify({ code }) });
    return r.json();
  };
  const script = [
    's.add_physics(id="n2")',
    'g.problem("planar", depth="1000 mm")',
    'g.rectangle((-100, -100), (100, 100))',
    'g.circle((0, 0), r=10)',
    'c30 = g.circle((0, 0), r=30)',
    'm.region((0, 0), material="Ar", current="100")',
    'm.region((20, 0), material="Ar")',
    'm.region((60, 60), material="Ar")',
    'm.boundary_def("Dirichlet (A = 0)", a1="-0.1")',
    'm.settings("n1", size="2 mm")',
    'r.table("n2", id="tb1")',
    'r.item("tb1", "lineint", id="fl")',
    'r.show("fl", curve=c30, outputs=[("fx", "Fx_l"), ("fy", "Fy_l")])',
    's.solve("n2")',
    'r.result("Fx_l")',
  ].join('\n');
  const res = await run(script);
  expect(res.ok, JSON.stringify(res)).toBe(true);
  expect(Math.abs(res.value + 10) / 10).toBeLessThan(0.03);
  // Erro de comando volta com a linha.
  const bad = await run('g.nao_existe()');
  expect(bad.ok).toBe(false);
  expect(bad.line).toBe('g.nao_existe()');
  // O que o script fez aparece no histórico do app.
  await expect(page.locator('.console .code').last()).toContainText('r.show(');
});

test('Script local: mostra o comando de instalação pelo GitHub com botão de copiar', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openApp(page);
  await page.getByRole('button', { name: /Script local/ }).click();
  const cmd = 'pip install "git+https://github.com/thalesmaoa/magfem#subdirectory=bridge/python"';
  await expect(page.locator('.bridge-cmd code').first()).toHaveText(cmd);
  await page.getByRole('button', { name: 'Copiar para a área de transferência' }).first().click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(cmd);
});

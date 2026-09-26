import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

// Exemplo do contator rodando no host:  cd bridge/python && PYTHONPATH=. python examples/contator.py --port 8797 --key contator --passos 8
// Sem ele, o teste é pulado. A página só executa o que o script manda; o teste espera a marca de fim.
test.setTimeout(300000);
test('exemplo do contator (ponte): circuito + campo + mecânica acoplados por código', async ({ page }) => {
  const up = await fetch('http://127.0.0.1:8797/status').then((r) => r.ok, () => false);
  test.skip(!up, 'exemplo do contator não está rodando na porta 8797');
  await openApp(page);
  await page.getByRole('button', { name: /Script local/ }).click();
  await page.locator('#bridge-port').fill('8797');
  await page.locator('#bridge-key').fill('contator');
  await page.getByRole('button', { name: 'Conectar' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__magfem.sketch.variables.some((v: any) => v.name === 'fim')), { timeout: 280000, intervals: [2000] }).toBe(true);
});

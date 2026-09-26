import { expect, test } from '@playwright/test';
import { openApp, sketch } from './helpers';

test('importar SVG: retângulo e caminho com arco viram curvas e fecham regiões (y invertido, mm)', async ({ page }) => {
  await openApp(page);
  // 100×60 mm; um furo em forma de "D" (caminho com arco circular) dentro do retângulo.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="60mm" viewBox="0 0 100 60">
    <rect x="0" y="0" width="100" height="60" fill="none" stroke="black"/>
    <path d="M30 20 L50 20 A10 10 0 0 1 50 40 L30 40 Z" fill="none" stroke="black"/>
    <circle cx="80" cy="30" r="8" fill="none" stroke="black"/>
  </svg>`;
  await page.locator('input[type=file][accept=".dxf,.svg,.fem"]').setInputFiles({ name: 'peca.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) });
  await expect(page.locator('.console .code').last()).toContainText('importado: peca.svg');
  const sk = await sketch(page);
  const ents = Object.values(sk.entities) as any[];
  expect(ents.filter((e) => e.type === 'line')).toHaveLength(7);
  expect(ents.filter((e) => e.type === 'arc')).toHaveLength(1);
  expect(ents.filter((e) => e.type === 'circle')).toHaveLength(1);
  // y invertido: o retângulo vai de y = 0 a y = −60 (mm).
  const ys = ents.filter((e) => e.type === 'point').map((e) => e.y);
  expect(Math.min(...ys)).toBeCloseTo(-60, 6);
  const regions = await page.evaluate(() => (window as any).__magfem.arrangement().regions.length);
  expect(regions).toBe(3);
});

import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { clickWorld, openApp, sketch, typeDim } from './helpers';

// Sem File System Access API (como no Firefox/Safari): salvar baixa o arquivo, abrir usa <input type=file>.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    delete (window as any).showSaveFilePicker;
    delete (window as any).showOpenFilePicker;
  });
  await openApp(page);
});

test('salvar (download) e abrir o mesmo projeto', async ({ page }) => {
  await page.keyboard.press('r');
  await clickWorld(page, { x: 0, y: 0 });
  await clickWorld(page, { x: 30, y: 15 });
  await page.keyboard.press('d');
  await clickWorld(page, { x: 15, y: 15 });
  await clickWorld(page, { x: 15, y: 25 });
  await typeDim(page, '42');
  const original = await sketch(page);
  await expect(page.locator('.dirty')).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Salvar', exact: true }).click()]);
  expect(download.suggestedFilename()).toBe('sem-titulo.magfem');
  const path = await download.path();
  const text = readFileSync(path, 'utf8');
  expect(JSON.parse(text).format).toBe('magfem');
  await expect(page.locator('.dirty')).toHaveCount(0);

  await page.getByRole('button', { name: 'Novo', exact: true }).click();
  expect(Object.keys((await sketch(page)).entities)).toEqual(['O']);

  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Abrir…' }).click()]);
  await chooser.setFiles({ name: 'motor.magfem', mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(page.locator('.fname')).toContainText('motor');
  const reopened = await sketch(page);
  expect(reopened.constraints).toEqual(original.constraints);
  expect(Object.keys(reopened.entities).sort()).toEqual(Object.keys(original.entities).sort());
});

test('arquivo inválido mostra erro e não altera o desenho', async ({ page }) => {
  await page.keyboard.press('c');
  await clickWorld(page, { x: 0, y: 0 });
  await clickWorld(page, { x: 10, y: 0 });
  const before = await sketch(page);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Abrir…' }).click()]);
  await chooser.setFiles({ name: 'x.magfem', mimeType: 'application/json', buffer: Buffer.from('{"foo":1}') });
  await expect(page.locator('.status .msg')).toContainText('Erro ao abrir');
  expect(await sketch(page)).toEqual(before);
});

test('exportar SVG, DXF, PNG e JPG', async ({ page }) => {
  await page.keyboard.press('r');
  await clickWorld(page, { x: 0, y: 0 });
  await clickWorld(page, { x: 40, y: 20 });
  await page.keyboard.press('Shift+A'); // arco pelo centro
  await clickWorld(page, { x: 70, y: 0 });
  await clickWorld(page, { x: 80, y: 0 });
  await clickWorld(page, { x: 70, y: 10 });
  await page.keyboard.press('Escape');
  const exp = async (label: RegExp) => {
    await page.getByRole('button', { name: 'Exportar', exact: true }).click();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: label }).click()]);
    return { name: dl.suggestedFilename(), data: readFileSync(await dl.path()) };
  };
  const svg = await exp(/^SVG/);
  expect(svg.name).toBe('sem-titulo.svg');
  const s = svg.data.toString();
  expect((s.match(/<line /g) ?? []).length).toBe(4);
  expect(s).toContain('<path id="a');
  expect(s).toMatch(/width="[\d.]+mm"/);
  const dxf = (await exp(/^DXF/)).data.toString();
  expect((dxf.match(/\nLINE\n/g) ?? []).length).toBe(4);
  expect(dxf).toContain('\nARC\n');
  expect(dxf.trim().endsWith('EOF')).toBe(true);
  const png = await exp(/^PNG/);
  expect(png.data.subarray(1, 4).toString()).toBe('PNG');
  const jpg = await exp(/^JPG/);
  expect(jpg.data[0]).toBe(0xff);
  expect(jpg.data[1]).toBe(0xd8);
});

test('link da documentação no topo, no idioma da interface', async ({ page }) => {
  const link = page.getByRole('link', { name: 'Documentação' });
  await expect(link).toHaveAttribute('href', /\/tools\/magfem-web\/docs\/$/);
  await expect(link).toHaveAttribute('target', '_blank');
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Docs' })).toHaveAttribute('href', /\/docs\/en\/$/);
});

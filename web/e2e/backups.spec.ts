import { expect, test } from '@playwright/test';
import { openApp, sketch } from './helpers';

test('cópias automáticas: projeto aberto vazio oferece recuperar a cópia com desenho', async ({ page }) => {
  await openApp(page);
  const box = page.getByRole('textbox', { name: 'Console' });
  await box.fill('g.rectangle((0, 0), (40, 20))');
  await box.press('Enter');
  // Rascunho com o retângulo e, "70 s depois", um rascunho vazio por cima (a cópia guarda o anterior).
  await page.evaluate(async () => {
    const ed = (window as any).__magfem;
    const { saveDraft, serialize } = await import('/tools/magfem-web/src/io/project.ts');
    const { emptySketch } = await import('/tools/magfem-web/src/cad/types.ts');
    const t0 = Date.now() - 200000;
    await saveDraft({ name: 'peça', text: serialize(ed.sketch), savedAt: t0 });
    await saveDraft({ name: 'sem-titulo', text: serialize(emptySketch()), savedAt: t0 + 70000 });
  });
  await page.reload();
  await page.waitForFunction(() => !!(window as any).__magfem);
  await expect(page.locator('.recover-banner')).toContainText('4 curvas');
  await page.locator('.recover-banner').getByRole('button', { name: 'Recuperar' }).click();
  const lines = Object.values((await sketch(page)).entities).filter((e: any) => e.type === 'line');
  expect(lines).toHaveLength(4);
  await expect(page.locator('.recover-banner')).toHaveCount(0);
  // Também na gaveta Problema.
  await page.getByRole('button', { name: 'Problema e bibliotecas' }).click();
  await expect(page.locator('.backup-list li').first()).toContainText('peça');
});

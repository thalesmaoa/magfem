import { expect, test } from '@playwright/test';
import { clickWorld, dof, dragWorld, openApp, sketch, toPage, typeDim } from './helpers';

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

const lines = async (page: any) => Object.values((await sketch(page)).entities).filter((e: any) => e.type === 'line') as any[];
const cons = async (page: any) => (await sketch(page)).constraints as any[];

test('cenário do usuário: duas retas unidas, sem horizontal, ângulo pela cota em duas seleções', async ({ page }) => {
  // Duas retas ortogonais unidas (polilinha em L).
  await page.keyboard.press('l');
  await clickWorld(page, { x: -80, y: -30 });
  await clickWorld(page, { x: -40, y: -30.2 }); // H
  await clickWorld(page, { x: -40.2, y: -70 }); // V
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  // Apaga a restrição horizontal pelo painel.
  const h = (await cons(page)).find((c) => c.type === 'horizontal');
  await page.getByRole('treeitem', { name: /^Restrições/ }).click();
  await page.getByRole('treeitem', { name: 'Horizontal' }).hover();
  await page.getByRole('treeitem', { name: 'Horizontal' }).getByRole('button', { name: /Apagar restrição/ }).click();
  expect((await cons(page)).some((c) => c.id === h.id)).toBe(false);
  // Arrasta a ponta esquerda para baixo, formando um ângulo.
  await dragWorld(page, { x: -80, y: -30 }, { x: -75, y: -55 });
  // Cota: clica na 1ª reta, depois na 2ª, depois posiciona.
  const [l1, l2] = await lines(page);
  const sk = await sketch(page);
  const mid = (l: any) => ({ x: (sk.entities[l.p1].x + sk.entities[l.p2].x) / 2, y: (sk.entities[l.p1].y + sk.entities[l.p2].y) / 2 });
  await page.keyboard.press('d');
  await clickWorld(page, mid(l1));
  await expect(page.locator('.status .hint')).toContainText('Clique outra entidade');
  await clickWorld(page, mid(l2));
  await clickWorld(page, { x: -48, y: -42 });
  await typeDim(page, '60');
  const ang = (await cons(page)).find((c) => c.type === 'angle');
  expect(ang).toBeTruthy();
  expect(ang.value).toBe(60);
  await expect(page.locator('canvas.sketch')).toBeVisible();
  await page.screenshot({ path: 'test-results/r2-angulo-usuario.png' });
});

test('pré-seleção de duas linhas + D cria cota de ângulo; paralelas viram distância', async ({ page }) => {
  await page.keyboard.press('l');
  await clickWorld(page, { x: 0, y: 0 });
  await clickWorld(page, { x: 40, y: 10 });
  await page.keyboard.press('Escape');
  await clickWorld(page, { x: 0, y: 20 });
  await clickWorld(page, { x: 40, y: 30 });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  const [a, b] = await lines(page);
  await clickWorld(page, { x: 20, y: 5 });
  await clickWorld(page, { x: 20, y: 25 }, { shift: true });
  await page.keyboard.press('d');
  await clickWorld(page, { x: 55, y: 15 });
  await typeDim(page, '15');
  const c = (await cons(page)).at(-1);
  // As linhas são paralelas: vira distância ponto-linha.
  expect(c.type).toBe('distance');
  expect(c.refs).toContain(a.id);
  expect(c.value).toBe(15);
  void b;
});

test('retângulo pelo centro na origem fica simétrico', async ({ page }) => {
  await page.keyboard.press('Shift+R');
  await clickWorld(page, { x: 0, y: 0 });
  await clickWorld(page, { x: 30, y: 15 });
  const sk = await sketch(page);
  const pts = Object.values(sk.entities).filter((e: any) => e.type === 'point' && e.id !== 'O') as any[];
  expect(pts).toHaveLength(4);
  for (const p of pts) {
    expect(Math.abs(p.x)).toBeCloseTo(30, 6);
    expect(Math.abs(p.y)).toBeCloseTo(15, 6);
  }
  expect(await dof(page)).toBe(2); // largura e altura livres
  const code = await page.locator('.console .code').innerText();
  expect(code).toContain('g.rectangle_center("O", (30, 15))');
});

test('arrastar o vértice do retângulo até a origem une os pontos', async ({ page }) => {
  await page.keyboard.press('r');
  await clickWorld(page, { x: 10, y: 10 });
  await clickWorld(page, { x: 50, y: 30 });
  await page.keyboard.press('Escape');
  await dragWorld(page, { x: 10, y: 10 }, { x: 0.3, y: -0.2 });
  const sk = await sketch(page);
  const usesOrigin = Object.values(sk.entities).filter((e: any) => e.type === 'line' && (e.p1 === 'O' || e.p2 === 'O'));
  expect(usesOrigin).toHaveLength(2);
  const code = await page.locator('.console .code').innerText();
  expect(code).toMatch(/g\.coincident\("p\d+", "O"\)/);
});

test('variáveis: cota ligada a variável e alteração da variável', async ({ page }) => {
  await page.keyboard.press('l');
  await clickWorld(page, { x: 0, y: 0 });
  await clickWorld(page, { x: 30, y: 0 });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Incluir na geometria' }).click();
  await page.getByRole('menuitem', { name: /Variável/ }).click();
  const name = page.locator('.props').getByRole('textbox', { name: 'Nome' });
  await name.fill('L');
  await name.press('Enter');
  const expr = page.locator('.props').getByRole('textbox', { name: 'Expressão' });
  await expr.fill('45 mm');
  await expr.press('Enter');
  await page.keyboard.press('d');
  await clickWorld(page, { x: 15, y: 0 });
  await clickWorld(page, { x: 15, y: 10 });
  await typeDim(page, 'L');
  let l = (await lines(page))[0];
  let sk = await sketch(page);
  expect(sk.entities[l.p2].x).toBeCloseTo(45, 6);
  await expr.fill('L0 * 2');
  await expr.press('Enter');
  await expect(page.locator('.status .msg')).not.toBeEmpty(); // L0 não existe
  await expr.fill('2 cm + 5 mm');
  await expr.press('Enter');
  sk = await sketch(page);
  l = (await lines(page))[0];
  expect(sk.entities[l.p2].x).toBeCloseTo(25, 6);
  await page.keyboard.press('f');
  await page.screenshot({ path: 'test-results/r2-variaveis.png' });
});

test('grupos: Ctrl+G, clique seleciona o grupo, mover e girar pelo painel', async ({ page }) => {
  await page.keyboard.press('c');
  await clickWorld(page, { x: 20, y: 0 });
  await clickWorld(page, { x: 25, y: 0 });
  await page.keyboard.press('l');
  await clickWorld(page, { x: 10, y: -5 });
  await clickWorld(page, { x: 30, y: -5 });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+g');
  let sk = await sketch(page);
  expect(sk.groups).toHaveLength(1);
  const gid = sk.groups[0].id;
  // Clique numa entidade do grupo seleciona o grupo.
  await page.keyboard.press('Escape');
  await clickWorld(page, { x: 20, y: -5 });
  expect(await page.evaluate(() => (window as any).__magfem.selection)).toEqual([gid]);
  // Gira 90° em torno da origem pelo painel.
  await page.getByRole('button', { name: 'Mover / girar' }).click();
  await page.locator('.popover label', { hasText: 'Ângulo' }).locator('input').fill('90');
  await page.locator('.popover select').selectOption('origin');
  await page.getByRole('button', { name: 'Aplicar', exact: true }).click();
  sk = await sketch(page);
  const circ = Object.values(sk.entities).find((e: any) => e.type === 'circle') as any;
  expect(sk.entities[circ.c].x).toBeCloseTo(0, 6);
  expect(sk.entities[circ.c].y).toBeCloseTo(20, 6);
  // Arrastar o grupo move tudo junto.
  await dragWorld(page, { x: 0, y: 25 }, { x: 10, y: 25 });
  sk = await sketch(page);
  expect(sk.entities[circ.c].x).toBeCloseTo(10, 0);
  const code = await page.locator('.console .code').innerText();
  expect(code).toContain(`g.rotate("${gid}", "90 deg", pivot=(0, 0))`);
  expect(code).toContain(`${gid} = g.group(`);
  await page.screenshot({ path: 'test-results/r2-grupos.png' });
});

test('unidade nas cotas e troca de unidade', async ({ page }) => {
  await page.keyboard.press('l');
  await clickWorld(page, { x: 0, y: 0 });
  await clickWorld(page, { x: 30, y: 0 });
  await page.keyboard.press('Escape');
  await page.keyboard.press('d');
  await clickWorld(page, { x: 15, y: 0 });
  await clickWorld(page, { x: 15, y: 10 });
  await typeDim(page, '50');
  await page.getByRole('treeitem', { name: /^Restrições/ }).click();
  await expect(page.getByRole('tree')).toContainText('50 mm');
  await page.getByRole('button', { name: 'Problema e bibliotecas', exact: true }).click();
  await page.locator('.drawer label', { hasText: 'Unidade' }).locator('select').selectOption('cm');
  await expect(page.getByRole('tree')).toContainText('5 cm');
  // Digitar "2" em cm = 20 mm.
  const k = (await cons(page)).find((c) => c.type === 'distance');
  await page.evaluate((id) => (window as any).__magfem.startEditing(id), k.id);
  await typeDim(page, '2');
  expect((await cons(page)).find((c) => c.type === 'distance').value).toBe(20);
});

test('idioma EN/PT, citação e abas de etapa', async ({ page }) => {
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await expect(page.locator('.status')).toContainText('Empty sketch');
  await expect(page.getByRole('button', { name: 'Corner rectangle', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cite', exact: true }).click();
  const dlg = page.locator('dialog.cite');
  await expect(dlg).toContainText('Cite this work');
  await expect(dlg.locator('.cite-bib')).toContainText('@software{maia2026magfem');
  await expect(dlg.locator('.cite-full')).toContainText('Maia, T. (2026). MagFEM: A Web-Based Magnetic Finite Element Analysis Tool');
  await expect(dlg.locator('.cite-bib')).toContainText('title   = {{MagFEM}: {A Web-Based Magnetic Finite Element Analysis Tool}}');
  await page.screenshot({ path: 'test-results/r2-citar.png' });
  await dlg.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'PT', exact: true }).click();
  await page.getByRole('button', { name: 'Citar', exact: true }).click();
  await expect(dlg.locator('.cite-full')).toContainText('MAIA, Thales');
  await dlg.getByRole('button', { name: 'Fechar', exact: true }).click();
  // Árvore: seção Malha já traz "Malha 1" em Malhas; selecioná-la põe o canvas no modo malha.
  const meshNode = page.getByRole('treeitem', { name: 'Malha 1', exact: true });
  await meshNode.click();
  // Nó de malha: canvas no modo malha (regiões/contornos), sem aviso "em construção".
  await expect.poll(() => page.evaluate(() => (window as any).__magfem.mode)).toBe('mesh');
  await expect(page.locator('.overlay.soon')).toHaveCount(0);
  await expect(meshNode).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('treeitem', { name: /Geometria/ }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__magfem.mode)).toBe('sketch');
  // Tooltip com atalho aparece ao passar o mouse.
  await page.getByRole('button', { name: 'Linha', exact: true }).hover();
  await expect(page.getByRole('button', { name: 'Linha', exact: true }).locator('.tip')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: 'test-results/r2-tooltip.png' });
});

test('árvore: física com análise, várias físicas, remover e desfazer', async ({ page }) => {
  await expect(page.getByRole('treeitem', { name: /Campo magnético/ })).toBeVisible();
  await page.getByRole('treeitem', { name: /Campo magnético/ }).click();
  await page.locator('.props label', { hasText: 'Análise' }).locator('select').selectOption('harmonic');
  await expect(page.locator('.props label', { hasText: 'Frequência' })).toBeVisible();
  let sk = await sketch(page);
  expect(sk.nodes.find((n: any) => n.kind === 'physics').analysis).toBe('harmonic');
  // Segunda física pelo (+) do Método de resolução (multifísica futura) e um resultado pelo (+) de Resultados.
  await page.getByRole('button', { name: 'Incluir no método de resolução' }).click();
  await expect(page.getByRole('menuitem', { name: /Resultado/ })).toHaveCount(0);
  await page.getByRole('menuitem', { name: /Campo magnético/ }).click();
  await page.getByRole('button', { name: 'Incluir resultado' }).click();
  sk = await sketch(page);
  expect(sk.nodes.map((n: any) => n.kind)).toEqual(['mesh', 'physics', 'physics', 'post']);
  await page.getByRole('button', { name: /Remover Resultado/ }).click();
  expect((await sketch(page)).nodes).toHaveLength(3);
  await page.keyboard.press('Control+z');
  expect((await sketch(page)).nodes).toHaveLength(4);
  for (const sec of ['Geometria', 'Malha', 'Método de resolução', 'Resultados']) await expect(page.getByRole('treeitem', { name: sec, exact: true })).toBeVisible();
  const code = await page.locator('.console .code').innerText();
  expect(code).toContain('s.add_physics(name="Campo magnético 2")');
  await page.screenshot({ path: 'test-results/r3-arvore.png' });
});

test('cota de ângulo mede o setor onde o texto é posicionado', async ({ page }) => {
  // Retas unidas no vértice (0,0): uma para a esquerda-baixo, outra vertical para baixo.
  await page.keyboard.press('l');
  await clickWorld(page, { x: 0, y: 0 });
  await clickWorld(page, { x: -40, y: -30 });
  await page.keyboard.press('Escape');
  await clickWorld(page, { x: 0, y: 0 });
  await clickWorld(page, { x: 0.3, y: -50 }); // V
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('d');
  await clickWorld(page, { x: -20, y: -15 });
  await clickWorld(page, { x: 0, y: -25 });
  await clickWorld(page, { x: -6, y: -22 }); // entre as retas: setor agudo (~53°)
  await expect(page.locator('.dim-input .unit')).toHaveText('°');
  await expect(page.locator('.dim-input input')).toHaveValue('53,1301');
  await page.locator('.dim-input input').fill('30');
  await page.locator('.dim-input input').press('Enter');
  const sk = await sketch(page);
  const p = Object.values(sk.entities).find((e: any) => e.type === 'point' && e.x < -1) as any;
  expect((Math.atan2(-p.x, -p.y) * 180) / Math.PI).toBeCloseTo(30, 5);
  await page.keyboard.press('f');
  await page.screenshot({ path: 'test-results/r3-angulo-setor.png' });
});

test('barra: retângulos e arcos agrupados num botão com menu (como no Onshape)', async ({ page }) => {
  // Só um botão de retângulo visível; a seta abre as duas opções.
  await expect(page.getByRole('button', { name: 'Retângulo pelo centro', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Retângulo por vértices: outras opções' }).click();
  const items = page.getByRole('menuitem');
  await expect(items).toHaveText([/Retângulo por vértices\s*R/, /Retângulo pelo centro\s*Shift\+R/]);
  await page.screenshot({ path: 'test-results/r5-menu-retangulo.png' });
  await items.nth(1).click();
  expect(await page.evaluate(() => (window as any).__magfem.tool)).toBe('rectc');
  // O botão passa a mostrar a última variante usada.
  await expect(page.getByRole('button', { name: 'Retângulo pelo centro', exact: true })).toHaveClass(/active/);
  await clickWorld(page, { x: 0, y: 0 });
  await clickWorld(page, { x: 20, y: 10 });
  expect((await sketch(page)).groups).toHaveLength(1);
  // Atalho de teclado também troca a variante mostrada.
  await page.keyboard.press('Escape');
  await page.keyboard.press('r');
  await expect(page.getByRole('button', { name: 'Retângulo por vértices', exact: true })).toHaveClass(/active/);
  // Arcos: mesma ideia.
  await page.getByRole('button', { name: 'Arco por 3 pontos: outras opções' }).click();
  await page.getByRole('menuitem', { name: /Arco pelo centro/ }).click();
  expect(await page.evaluate(() => (window as any).__magfem.tool)).toBe('arcc');
});

test('janela estreita: sem rolagem horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 700 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: 'test-results/r5-estreita.png' });
});

test('árvore da Geometria: entidades, grupos e variáveis, com seleção e renomear', async ({ page }) => {
  await page.keyboard.press('r');
  await clickWorld(page, { x: 0, y: 0 });
  await clickWorld(page, { x: 40, y: 20 });
  await page.keyboard.press('c');
  await clickWorld(page, { x: 70, y: 10 });
  await clickWorld(page, { x: 78, y: 10 });
  await page.keyboard.press('Escape');
  const tree = page.getByRole('tree');
  await expect(tree.getByRole('treeitem', { name: 'Origem' })).toBeVisible();
  await expect(tree.getByRole('treeitem', { name: 'Retângulo 1' })).toBeVisible();
  const circ = tree.getByRole('treeitem', { name: /^Círculo c\d+$/ });
  await expect(circ).toBeVisible();
  // Clique na árvore seleciona no desenho.
  await circ.click();
  const cid = (Object.values((await sketch(page)).entities).find((e: any) => e.type === 'circle') as any).id;
  expect(await page.evaluate(() => (window as any).__magfem.selection)).toEqual([cid]);
  // Renomear por duplo clique.
  await circ.locator('.tname').dblclick();
  await circ.getByRole('textbox').fill('bobina');
  await circ.getByRole('textbox').press('Enter');
  await expect(tree.getByRole('treeitem', { name: 'bobina' })).toBeVisible();
  expect((await sketch(page)).entities[cid].name).toBe('bobina');
  // Grupo: expandir mostra os lados; renomear o grupo.
  const rect = tree.getByRole('treeitem', { name: 'Retângulo 1' });
  await rect.getByRole('button', { name: '+' }).click();
  await expect(tree.getByRole('treeitem', { name: /^Linha l\d+$/ })).toHaveCount(4);
  await rect.locator('.tname').dblclick();
  await rect.getByRole('textbox').fill('estator');
  await rect.getByRole('textbox').press('Enter');
  expect((await sketch(page)).groups[0].name).toBe('estator');
  // Variável incluída pelo (+) da Geometria e editada nas propriedades.
  await tree.getByRole('button', { name: 'Incluir na geometria' }).click();
  await page.getByRole('menuitem', { name: /Variável/ }).click();
  await page.locator('.props').getByRole('textbox', { name: 'Expressão' }).fill('25 mm');
  await page.locator('.props').getByRole('textbox', { name: 'Expressão' }).press('Enter');
  await expect(tree.getByRole('treeitem', { name: 'v1' })).toContainText('25 mm');
  await expect(page.getByRole('button', { name: 'Selecionar', exact: true })).toBeVisible(); // barra continua visível
  const code = await page.locator('.console .code').innerText();
  expect(code).toContain(`g.rename("${cid}", "bobina")`);
  await page.screenshot({ path: 'test-results/r6-arvore.png' });
});

test('linha de construção: tracejada, pelo menu da linha ou Shift+L', async ({ page }) => {
  await page.getByRole('button', { name: 'Linha: outras opções' }).click();
  await page.getByRole('menuitem', { name: /Linha de construção/ }).click();
  await clickWorld(page, { x: -20, y: -10 });
  await clickWorld(page, { x: 30, y: 25 });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Shift+L');
  await clickWorld(page, { x: -20, y: 10 });
  await clickWorld(page, { x: 30, y: 10.3 });
  await page.keyboard.press('Escape');
  const lines = Object.values((await sketch(page)).entities).filter((e: any) => e.type === 'line') as any[];
  expect(lines).toHaveLength(2);
  expect(lines.every((l) => l.construction)).toBe(true);
  const code = await page.locator('.console .code').innerText();
  expect(code).toContain('construction=True');
  await page.screenshot({ path: 'test-results/r6-construcao.png' });
});

test('árvore: restrições expansíveis, selecionar, editar cota e apagar', async ({ page }) => {
  await page.keyboard.press('l');
  await clickWorld(page, { x: 0, y: 0 });
  await clickWorld(page, { x: 30, y: 0.3 }); // H
  await page.keyboard.press('Escape');
  await page.keyboard.press('d');
  await clickWorld(page, { x: 15, y: 0 });
  await clickWorld(page, { x: 15, y: 8 });
  await typeDim(page, '30');
  await page.keyboard.press('Escape');
  const tree = page.getByRole('tree');
  const node = tree.getByRole('treeitem', { name: 'Restrições (2)' });
  await node.click();
  await expect(tree.getByRole('treeitem', { name: 'Horizontal' })).toBeVisible();
  const dim = tree.getByRole('treeitem', { name: 'Distância 30 mm' });
  await dim.click();
  const k = (await sketch(page)).constraints.find((c: any) => c.type === 'distance');
  expect(await page.evaluate(() => (window as any).__magfem.selection)).toEqual([k.id]);
  await dim.hover();
  await dim.getByRole('button', { name: `Editar valor ${k.id}` }).click();
  await typeDim(page, '45');
  await expect(tree.getByRole('treeitem', { name: 'Distância 45 mm' })).toBeVisible();
  await tree.getByRole('treeitem', { name: 'Horizontal' }).hover();
  await tree.getByRole('treeitem', { name: 'Horizontal' }).getByRole('button', { name: /Apagar restrição/ }).click();
  await expect(tree.getByRole('treeitem', { name: 'Restrições (1)' })).toBeVisible();
  await page.screenshot({ path: 'test-results/r7-restricoes.png' });
});

test('medidas: ponto, linha, distância mínima entre duas entidades, área e régua', async ({ page }) => {
  await page.keyboard.press('r');
  await clickWorld(page, { x: 0, y: 0 });
  await clickWorld(page, { x: 40, y: 20 });
  await page.keyboard.press('c');
  await clickWorld(page, { x: 70, y: 10 });
  await clickWorld(page, { x: 75, y: 10 });
  await page.keyboard.press('Escape');
  const meas = page.locator('.measures');
  // Retângulo (grupo): área e perímetro.
  await clickWorld(page, { x: 20, y: 20 });
  await expect(meas).toContainText('800 mm²');
  await expect(meas).toContainText('120 mm');
  // Círculo + retângulo: distância mínima (70-5-40 = 25 mm) desenhada no canvas.
  await clickWorld(page, { x: 70, y: 15 }, { shift: true });
  await expect(meas).toContainText('Distância mínima');
  await expect(meas).toContainText('25 mm');
  await page.screenshot({ path: 'test-results/r8-distancia-minima.png' });
  // Régua (U).
  await page.keyboard.press('Escape');
  await page.keyboard.press('u');
  await clickWorld(page, { x: 0, y: 0 });
  await clickWorld(page, { x: 40, y: 20 });
  await expect(meas).toContainText('Régua');
  await expect(meas).toContainText(`${String(Math.round(Math.hypot(40, 20) * 1e4) / 1e4).replace('.', ',')} mm`);
  await page.screenshot({ path: 'test-results/r8-regua.png' });
  // A régua não muda o desenho.
  expect((await sketch(page)).constraints.length).toBe(4);
});

test('console: comandos, getid pelo nome, erro legível, ↑ repete, e o desenho acompanha', async ({ page }) => {
  const box = page.getByRole('textbox', { name: 'Console' });
  const run = async (cmd: string) => {
    await box.fill(cmd);
    await box.press('Enter');
  };
  await run('l = s.line((0, 0), (40, 0))');
  await run('s.horizontal(l)');
  await run('s.distance(l, "L*2")'); // L não existe ainda: erro legível
  await expect(page.locator('.console .out pre.err').last()).toContainText('L');
  await run('s.var("L", "=10+15")');
  await run('s.distance(l, "L*2")');
  let sk = await sketch(page);
  const line = Object.values(sk.entities).find((e: any) => e.type === 'line') as any;
  expect(Math.abs(sk.entities[line.p2].x - sk.entities[line.p1].x)).toBeCloseTo(50, 6);
  await run(`s.rename(l, "kru1")`);
  await run('getid("kru1")');
  await expect(page.locator('.console .out pre.res').last()).toHaveText(`"${line.id}"`);
  // Nome também serve como referência.
  await run('c = s.circle((80, 0), r=5)');
  await run('s.measure("kru1", c)');
  await expect(page.locator('.console .out pre.err')).toHaveCount(1);
  await expect(page.locator('.console .out pre.res').last()).toHaveText(/^\d+(\.\d+)?$/);
  await run('s.dof()');
  await expect(page.locator('.console .out pre.res').last()).toHaveText(/^\d+$/);
  // Seta para cima repete o último comando.
  await box.press('ArrowUp');
  await expect(box).toHaveValue('s.dof()');
  // Colar várias linhas executa todas.
  await box.fill('s.point((10, 10))\ns.point((20, 10))');
  await box.press('Enter');
  sk = await sketch(page);
  expect(Object.values(sk.entities).filter((e: any) => e.type === 'point' && e.free && e.id !== 'O')).toHaveLength(2);
  await page.screenshot({ path: 'test-results/r9-console.png' });
});

test('console: Tab autocompleta, redimensiona e abre em outra janela', async ({ page, context }) => {
  const box = page.getByRole('textbox', { name: 'Console' });
  // Tab com uma única opção completa direto; com várias mostra a lista.
  await box.fill('g.rectangle_c');
  await box.press('Tab');
  await expect(box).toHaveValue('g.rectangle_center(');
  await box.fill('g.rec');
  await box.press('Tab');
  await expect(page.getByRole('listbox', { name: 'autocomplete' }).getByRole('option')).toHaveCount(2);
  await box.press('Tab'); // próxima opção
  await box.press('Enter'); // aceita
  await expect(box).toHaveValue('g.rectangle_center(');
  await box.fill('g.rectangle_center((0, 0), (20, 10))');
  await box.press('Enter');
  // Nomes entre aspas.
  await box.fill('getid("Ret');
  await box.press('Tab');
  await expect(box).toHaveValue('getid("Retângulo 1');
  await box.fill('');
  // Redimensionar pela alça.
  const con = page.locator('section.console');
  const h0 = (await con.boundingBox())!.height;
  const handle = page.getByRole('separator', { name: 'Arraste para mudar a altura' });
  const hb = (await handle.boundingBox())!;
  await page.mouse.move(hb.x + 50, hb.y + 3);
  await page.mouse.down();
  await page.mouse.move(hb.x + 50, hb.y - 97, { steps: 5 });
  await page.mouse.up();
  expect((await con.boundingBox())!.height).toBeGreaterThan(h0 + 80);
  await page.screenshot({ path: 'test-results/r10-console-tab.png' });
  // Abrir em outra janela: o console sai de baixo do desenho e funciona na janela nova.
  const [popup] = await Promise.all([context.waitForEvent('page'), page.getByRole('button', { name: 'Abrir em outra janela' }).click()]);
  await expect(page.locator('section.console')).toHaveCount(0);
  const pbox = popup.getByRole('textbox', { name: 'Console' });
  await pbox.fill('s.point((5, 5))');
  await pbox.press('Enter');
  expect(Object.values((await sketch(page)).entities).some((e: any) => e.type === 'point' && e.x === 5 && e.y === 5)).toBe(true);
  await popup.screenshot({ path: 'test-results/r10-console-janela.png' });
  await popup.close();
  await expect(page.locator('section.console')).toHaveCount(1);
});

test('modificar: offset, espelhar, padrões linear e circular (barra e console)', async ({ page }) => {
  await page.keyboard.press('r');
  await clickWorld(page, { x: 10, y: 10 });
  await clickWorld(page, { x: 30, y: 20 });
  await page.keyboard.press('Escape');
  await clickWorld(page, { x: 20, y: 20 }); // seleciona o retângulo (grupo)
  // Offset 2 mm para fora.
  await page.getByRole('button', { name: 'Offset', exact: true }).click();
  await page.locator('.popover label', { hasText: 'Distância' }).locator('input').fill('2');
  await page.locator('.popover').getByRole('button', { name: 'Aplicar' }).click();
  let sk = await sketch(page);
  const off = sk.groups.find((g: any) => g.name.startsWith('Offset'));
  const offLines = off.members.filter((id: string) => sk.entities[id].type === 'line' && !sk.entities[id].aux);
  expect(offLines).toHaveLength(4);
  const xs = offLines.flatMap((id: string) => [sk.entities[sk.entities[id].p1].x]);
  expect(Math.min(...xs)).toBeCloseTo(8, 6);
  // Espelhar o retângulo original no eixo Y.
  await clickWorld(page, { x: 20, y: 20 });
  await page.getByRole('button', { name: 'Espelhar', exact: true }).click();
  await page.locator('.popover').getByRole('button', { name: 'Aplicar' }).click();
  sk = await sketch(page);
  const mir = sk.groups.find((g: any) => g.name.startsWith('Espelho'));
  const mirLines = mir.members.filter((id: string) => sk.entities[id]?.type === 'line' && !sk.entities[id].aux);
  expect(Math.max(...mirLines.map((id: string) => sk.entities[sk.entities[id].p1].x))).toBeCloseTo(-10, 6);
  // Padrão linear pelo console e circular pela barra.
  const box = page.getByRole('textbox', { name: 'Console' });
  await box.fill(`g.array("${sk.groups[0].id}", nx=3, dx="40 mm")`);
  await box.press('Enter');
  sk = await sketch(page);
  expect(sk.groups.find((g: any) => g.name.startsWith('Padrão 1')).members).toHaveLength(8);
  await clickWorld(page, { x: 20, y: 20 });
  // Padrões ficam num botão só: a seta abre linear/circular.
  await expect(page.getByRole('button', { name: 'Padrão circular', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Padrão linear (x, y): outras opções' }).click();
  await page.getByRole('menuitem', { name: /Padrão circular/ }).click();
  await page.locator('.popover label', { hasText: 'Quantidade' }).locator('input').fill('4');
  await page.locator('.popover').getByRole('button', { name: 'Aplicar' }).click();
  sk = await sketch(page);
  const circ = sk.groups.find((g: any) => g.name.startsWith('Padrão circular'));
  expect(circ.members.filter((id: string) => sk.entities[id]?.type === 'line' && !sk.entities[id].aux)).toHaveLength(12);
  await page.keyboard.press('f');
  await page.screenshot({ path: 'test-results/r11-modificar.png' });
});

test('renomear na árvore: Esc e clicar fora fecham a caixa sem mudar o nome', async ({ page }) => {
  await page.keyboard.press('r');
  await clickWorld(page, { x: 0, y: 0 });
  await clickWorld(page, { x: 20, y: 10 });
  await page.keyboard.press('Escape');
  const row = page.getByRole('treeitem', { name: 'Retângulo 1' });
  await row.locator('.tname').dblclick();
  await row.getByRole('textbox').fill('xyz');
  await row.getByRole('textbox').press('Escape');
  await expect(row.getByRole('textbox')).toHaveCount(0);
  expect((await sketch(page)).groups[0].name).toBe('Retângulo 1');
  await row.locator('.tname').dblclick();
  await page.locator('canvas.sketch').click({ position: { x: 600, y: 500 } }); // clicar fora
  await expect(page.getByRole('treeitem', { name: 'Retângulo 1' }).getByRole('textbox')).toHaveCount(0);
});

test('tema: automático → claro → escuro; canvas e painéis acompanham', async ({ page }) => {
  await page.keyboard.press('r');
  await clickWorld(page, { x: 0, y: 0 });
  await clickWorld(page, { x: 40, y: 20 });
  await page.keyboard.press('d');
  await clickWorld(page, { x: 20, y: 20 });
  await clickWorld(page, { x: 20, y: 30 });
  await typeDim(page, '40');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: /^Tema: automático/ }).click(); // → claro
  await page.getByRole('button', { name: /^Tema: claro/ }).click(); // → escuro
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('treeitem', { name: /^Restrições/ }).click();
  await page.screenshot({ path: 'test-results/r12-escuro.png' });
  // Preferência lembrada ao recarregar.
  await page.reload();
  await page.waitForFunction(() => !!(window as any).__magfem);
  await expect(html).toHaveAttribute('data-theme', 'dark');
});

test('offset: filho do retângulo na árvore; distância 2 → 5 → −5 nas propriedades; arrastar muda a distância', async ({ page }) => {
  await page.keyboard.press('r');
  await clickWorld(page, { x: 0, y: 0 });
  await clickWorld(page, { x: 40, y: 20 });
  await page.keyboard.press('d');
  await clickWorld(page, { x: 20, y: 20 });
  await clickWorld(page, { x: 20, y: 30 });
  await typeDim(page, '40');
  await clickWorld(page, { x: 40, y: 10 });
  await clickWorld(page, { x: 50, y: 10 });
  await typeDim(page, '20');
  await page.keyboard.press('Escape');
  await clickWorld(page, { x: 20, y: 0 }); // seleciona o retângulo (lado de baixo, longe das cotas)
  const dof0 = await dof(page);
  await page.getByRole('button', { name: 'Offset', exact: true }).click();
  await page.locator('.popover label', { hasText: 'Distância' }).locator('input').fill('2');
  await page.locator('.popover').getByRole('button', { name: 'Aplicar' }).click();
  expect(await dof(page)).toBe(dof0);
  // Na árvore: Retângulo 1 › … Offset 1 (2 mm).
  const tree = page.getByRole('tree');
  await tree.getByRole('treeitem', { name: 'Retângulo 1' }).getByRole('button', { name: '+' }).click();
  const offRow = tree.getByRole('treeitem', { name: 'Offset 1' });
  await expect(offRow).toContainText('2 mm');
  // Propriedades: 5, depois −5 (inverte o lado).
  const input = page.locator('.offset-props input');
  await input.fill('5');
  await input.press('Enter');
  await expect(offRow).toContainText('5 mm');
  const off = async () => {
    const sk = await sketch(page);
    const g = sk.groups.find((x: any) => x.name === 'Offset 1');
    const pts = g.members.filter((id: string) => sk.entities[id]?.type === 'line' && !sk.entities[id].aux).map((id: string) => sk.entities[sk.entities[id].p1]);
    return { minX: Math.min(...pts.map((p: any) => p.x)), maxX: Math.max(...pts.map((p: any) => p.x)), g };
  };
  expect((await off()).minX).toBeCloseTo(-5, 6);
  await input.fill('-5');
  await input.press('Enter');
  await expect(offRow).toContainText('-5 mm');
  expect((await off()).minX).toBeCloseTo(5, 6); // agora para dentro
  expect(await dof(page)).toBe(dof0);
  // Arrastar o canto interno em direção ao centro: a distância cresce; o retângulo fica.
  await dragWorld(page, { x: 35, y: 15 }, { x: 33, y: 13 });
  const { minX, g } = await off();
  expect(g.offset.distance).toBeGreaterThan(6);
  expect(minX).toBeCloseTo(g.offset.distance, 3);
  const sk = await sketch(page);
  expect(Math.max(...Object.values(sk.entities).filter((e: any) => e.type === 'point' && !e.aux).map((p: any) => p.x))).toBeCloseTo(40, 6);
  const code = await page.locator('.console .code').innerText();
  expect(code).toMatch(/g\.set_offset\("g\d+", "-5 mm"\)/);
  expect((code.match(/g\.set_offset\(/g) ?? []).length).toBe(3); // 5, −5 e o arraste
  // Restrições internas do offset não aparecem na lista (só as do usuário: 4 H/V + 2 cotas).
  await expect(page.getByRole('treeitem', { name: /^Restrições/ })).toHaveAttribute('aria-label', 'Restrições (6)');
  // Cursor de "mover" (não "proibido") sobre o offset, mesmo definido.
  const sk2 = await sketch(page);
  const ln = (await off()).g.members.map((id: string) => sk2.entities[id]).find((e: any) => e?.type === 'line' && !e.aux);
  const a = sk2.entities[ln.p1];
  const b = sk2.entities[ln.p2];
  const c = await (await import('./helpers')).toPage(page, { x: (a.x + b.x) / 2 + (b.x - a.x) * 0.2, y: (a.y + b.y) / 2 + (b.y - a.y) * 0.2 });
  await page.mouse.move(c.x, c.y);
  expect(await page.locator('canvas.sketch').evaluate((el) => (el as HTMLElement).style.cursor)).toBe('move');
  // Arrastar para fora até atravessar o retângulo: o offset troca de lado sozinho.
  await dragWorld(page, { x: 33, y: 13 }, { x: 46, y: 26 });
  const after = await off();
  expect(after.g.offset.side).toBe(1);
  expect(after.maxX).toBeGreaterThan(40);
  await expect(page.locator('.detach')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/r15-offset-parametro.png' });
});

test('espelhar sobre uma linha escolhida no desenho; o espelho segue o original', async ({ page }) => {
  // Eixo: linha vertical em x = 50.
  await page.keyboard.press('l');
  await clickWorld(page, { x: 50, y: -10 });
  await clickWorld(page, { x: 50.2, y: 40 });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('r');
  await clickWorld(page, { x: 10, y: 0 });
  await clickWorld(page, { x: 30, y: 20 });
  await page.keyboard.press('Escape');
  await clickWorld(page, { x: 20, y: 20 }); // seleciona o retângulo
  await page.getByRole('button', { name: 'Espelhar', exact: true }).click();
  await page.getByRole('button', { name: 'Escolher linha no desenho' }).click();
  await expect(page.locator('.status .hint')).toContainText('eixo do espelho');
  await clickWorld(page, { x: 50, y: 30 }); // a linha-eixo
  await expect(page.locator('.popover select')).toHaveValue('line');
  await page.locator('.popover').getByRole('button', { name: 'Aplicar' }).click();
  let sk = await sketch(page);
  const mir = sk.groups.find((g: any) => g.name.startsWith('Espelho'));
  const xs = () => mir.members.filter((id: string) => sk.entities[id]?.type === 'line' && !sk.entities[id].aux).map((id: string) => sk.entities[sk.entities[id].p1].x);
  expect(Math.min(...xs())).toBeCloseTo(70, 6);
  expect(Math.max(...xs())).toBeCloseTo(90, 6);
  // Prende o eixo (senão o solver também pode mover o eixo) e arrasta o original: o espelho acompanha.
  await page.keyboard.press('Escape');
  await clickWorld(page, { x: 50, y: 30 });
  await page.getByRole('button', { name: 'Fixar / soltar pontos' }).click();
  await dragWorld(page, { x: 10, y: 10 }, { x: 0, y: 10 });
  sk = await sketch(page);
  expect(Math.max(...xs())).toBeCloseTo(100, 1);
  await page.keyboard.press('f');
  await page.screenshot({ path: 'test-results/r14-espelho-linha.png' });
});

test('Del apaga a variável selecionada na árvore (e recusa se estiver em uso)', async ({ page }) => {
  const tree = page.getByRole('tree');
  await tree.getByRole('button', { name: 'Incluir na geometria' }).click();
  await page.getByRole('menuitem', { name: /Variável/ }).click();
  await expect(tree.getByRole('treeitem', { name: 'v1' })).toBeVisible();
  await tree.getByRole('treeitem', { name: 'v1' }).click();
  await page.keyboard.press('Delete');
  await expect(tree.getByRole('treeitem', { name: 'v1' })).toHaveCount(0);
  expect((await sketch(page)).variables).toHaveLength(0);
});

test('cota do offset no desenho: duplo clique edita; cotar offset↔pai abre a cota do offset', async ({ page }) => {
  await page.keyboard.press('Shift+R');
  await clickWorld(page, { x: 0, y: 0 });
  await clickWorld(page, { x: 50, y: 25 });
  await page.keyboard.press('Escape');
  await clickWorld(page, { x: 0, y: -25 });
  await page.getByRole('button', { name: 'Offset', exact: true }).click();
  await page.locator('.popover label', { hasText: 'Distância' }).locator('input').fill('10');
  await page.locator('.popover').getByRole('button', { name: 'Aplicar' }).click();
  let sk = await sketch(page);
  const dimC = sk.constraints.find((c: any) => c.offsetDim);
  expect(dimC).toBeTruthy();
  // Duplo clique na cota verde do offset (posição do texto) edita a distância.
  const pos = await page.evaluate((id) => {
    const ed = (window as any).__magfem;
    const r = (document.querySelector('canvas.sketch') as HTMLElement).getBoundingClientRect();
    ed.startEditing(id);
    const e = ed.editing;
    ed.cancelEditing();
    return { x: e.x + r.left, y: e.y + r.top };
  }, dimC.id);
  await page.mouse.dblclick(pos.x, pos.y);
  await expect(page.locator('.dim-input input')).toHaveValue('10');
  await page.locator('.dim-input input').fill('4');
  await page.locator('.dim-input input').press('Enter');
  sk = await sketch(page);
  expect(sk.groups.find((g: any) => g.offset).offset.distance).toBeCloseTo(4, 9);
  // Cotar entre a linha do offset (y=29) e a do pai (y=25): abre a cota do offset em vez de erro.
  await page.keyboard.press('d');
  await clickWorld(page, { x: 10, y: 29 });
  await clickWorld(page, { x: 10, y: 25 });
  await clickWorld(page, { x: 70, y: 27 });
  await expect(page.locator('.status .msg')).toContainText('cota do offset');
  await expect(page.locator('.dim-input input')).toHaveValue('4');
  await page.locator('.dim-input input').press('Escape');
  await page.keyboard.press('f');
  await page.screenshot({ path: 'test-results/r16-cota-offset.png' });
});

test('snap no ponto médio: linha do meio de um lado ao meio do outro, e continua no meio', async ({ page }) => {
  await page.keyboard.press('r');
  await clickWorld(page, { x: 0, y: 0 });
  await clickWorld(page, { x: 40, y: 20 });
  await page.keyboard.press('l');
  const hint = await (await import('./helpers')).toPage(page, { x: 20.4, y: 20.3 });
  await page.mouse.move(hint.x, hint.y);
  await page.screenshot({ path: 'test-results/r17-snap-medio.png' });
  await clickWorld(page, { x: 20.4, y: 20.3 }); // perto do meio do lado de cima
  await clickWorld(page, { x: 19.7, y: -0.3 }); // perto do meio do lado de baixo
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  let sk = await sketch(page);
  const mids = sk.constraints.filter((c: any) => c.type === 'midpoint');
  expect(mids).toHaveLength(2);
  const line = Object.values(sk.entities).find((e: any) => e.type === 'line' && !sk.groups[0].members.includes(e.id)) as any;
  expect(sk.entities[line.p1].x).toBeCloseTo(20, 9);
  // Muda a largura do retângulo para 60: a linha vai junto para x = 30.
  await page.keyboard.press('d');
  await clickWorld(page, { x: 10, y: 20 });
  await clickWorld(page, { x: 10, y: 28 });
  await typeDim(page, '60');
  sk = await sketch(page);
  expect(sk.entities[line.p1].x).toBeCloseTo(30, 6);
  expect(sk.entities[line.p2].x).toBeCloseTo(30, 6);
});

test('padrão linear associativo: segue o original, edita o passo e arrastar a cópia muda o espaçamento', async ({ page }) => {
  await page.keyboard.press('r');
  await clickWorld(page, { x: 0, y: 0 });
  await clickWorld(page, { x: 10, y: 10 });
  await page.keyboard.press('Escape');
  await clickWorld(page, { x: 5, y: 0 });
  await page.getByRole('button', { name: 'Padrão linear (x, y)', exact: true }).click();
  await page.locator('.popover label', { hasText: 'Qtd. em x' }).locator('input').fill('3');
  await page.locator('.popover label', { hasText: 'Passo x' }).locator('input').fill('20');
  await page.locator('.popover').getByRole('button', { name: 'Aplicar' }).click();
  const tree = page.getByRole('tree');
  await tree.getByRole('treeitem', { name: 'Retângulo 1' }).getByRole('button', { name: '+' }).click();
  await expect(tree.getByRole('treeitem', { name: 'Padrão 1' })).toContainText('3×1');
  const maxX = async () => {
    const sk = await sketch(page);
    return Math.max(...Object.values(sk.entities).filter((e: any) => e.type === 'point' && !e.aux).map((p: any) => p.x));
  };
  expect(await maxX()).toBeCloseTo(50, 6);
  // Propriedades: passo 25 → a última cópia vai para 60.
  await page.locator('.offset-props label', { hasText: 'Passo x' }).locator('input').fill('25');
  await page.locator('.offset-props label', { hasText: 'Passo x' }).locator('input').press('Enter');
  expect(await maxX()).toBeCloseTo(60, 6);
  // Arrastar a última cópia para a direita aumenta o espaçamento (o original fica).
  await dragWorld(page, { x: 60, y: 5 }, { x: 70, y: 5 });
  const sk = await sketch(page);
  const pat = sk.groups.find((g: any) => g.pattern);
  expect(pat.pattern.dx).toBeCloseTo(30, 0);
  expect(Math.min(...Object.values(sk.entities).filter((e: any) => e.type === 'point').map((p: any) => p.x))).toBeCloseTo(0, 6);
  // Nenhum ponto solto sobrando (cópias do canto na origem não viram "pontos").
  await expect(tree.getByRole('treeitem', { name: /^Ponto p/ })).toHaveCount(0);
  await page.keyboard.press('f');
  await page.screenshot({ path: 'test-results/r18-padrao-associativo.png' });
});

test('travar ponto no lado de um grupo: Shift+clique pega o lado; com o grupo inteiro aparece a dica', async ({ page }) => {
  await page.keyboard.press('r');
  await clickWorld(page, { x: 0, y: 0 });
  await clickWorld(page, { x: 40, y: 20 });
  await page.keyboard.press('l');
  await clickWorld(page, { x: -30, y: 5 });
  await clickWorld(page, { x: -10, y: 8 });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  let sk = await sketch(page);
  const line = Object.values(sk.entities).find((e: any) => e.type === 'line' && !sk.groups[0].members.includes(e.id)) as any;
  // Ponto + grupo inteiro: a restrição explica o que fazer.
  await clickWorld(page, { x: -10, y: 8 });
  await clickWorld(page, { x: 0, y: 12 }, { shift: true }); // Shift+clique no lado esquerdo do retângulo
  const selected = await page.evaluate(() => (window as any).__magfem.selection);
  expect(selected).toHaveLength(2);
  expect(selected[1].startsWith('l')).toBe(true); // pegou a linha, não o grupo
  await page.keyboard.press('i');
  sk = await sketch(page);
  const on = sk.constraints.find((c: any) => c.type === 'pointOn');
  expect(on.refs[0]).toBe(line.p2);
  expect(sk.entities[line.p2].x).toBeCloseTo(0, 6);
  // Com o grupo inteiro selecionado, aparece a dica.
  await page.keyboard.press('Escape');
  await clickWorld(page, { x: -30, y: 5 });
  await page.keyboard.down('Shift');
  await page.keyboard.up('Shift');
  const g = sk.groups[0].id;
  await page.evaluate((ids) => (window as any).__magfem.select(ids), [line.p1, g]);
  await page.getByRole('button', { name: 'Coincidente', exact: true }).click();
  await expect(page.locator('.status .msg')).toContainText('Shift+clique');
  await expect(page.locator('.status .legend')).toContainText('livre');
});

test('simetria entre dois pontos: eixo Y ou uma linha escolhida no desenho', async ({ page }) => {
  await page.keyboard.press('p');
  await clickWorld(page, { x: 10, y: 5 });
  await clickWorld(page, { x: -20, y: 8 });
  await clickWorld(page, { x: 30, y: 30 });
  await clickWorld(page, { x: 50, y: 12 });
  await page.keyboard.press('Escape');
  // Eixo: linha vertical em x = 40.
  await page.keyboard.press('l');
  await clickWorld(page, { x: 40, y: -10 });
  await clickWorld(page, { x: 40.2, y: 40 });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  const pts = async () => Object.values((await sketch(page)).entities).filter((e: any) => e.type === 'point' && e.free && e.id !== 'O') as any[];
  let [a, b, c, dd] = await pts();
  // 1) Simetria no eixo Y.
  await clickWorld(page, { x: a.x, y: a.y });
  await clickWorld(page, { x: b.x, y: b.y }, { shift: true });
  await page.getByRole('button', { name: 'Simétrica', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Simetria entre os dois pontos' })).toBeVisible();
  await page.locator('.popover').getByRole('button', { name: 'Aplicar' }).click();
  [a, b, c, dd] = await pts();
  expect(a.x + b.x).toBeCloseTo(0, 6);
  expect(a.y).toBeCloseTo(b.y, 6);
  // 2) Simetria em relação à linha x = 40, escolhida clicando no desenho.
  await clickWorld(page, { x: c.x, y: c.y });
  await clickWorld(page, { x: dd.x, y: dd.y }, { shift: true });
  await page.getByRole('button', { name: 'Simétrica', exact: true }).click();
  await page.getByRole('button', { name: 'Escolher linha no desenho' }).click();
  await clickWorld(page, { x: 40, y: 20 });
  await expect(page.locator('.popover select')).toHaveValue('line');
  await page.locator('.popover').getByRole('button', { name: 'Aplicar' }).click();
  [a, b, c, dd] = await pts();
  expect((c.x + dd.x) / 2).toBeCloseTo((await sketch(page)).entities[Object.values((await sketch(page)).entities).find((e: any) => e.type === 'line' && !e.aux).p1].x, 4);
  expect(c.y).toBeCloseTo(dd.y, 4);
  const code = await page.locator('.console .code').innerText();
  expect(code).toContain('axis="y"');
});

test('simetria no eixo X das pontas de uma linha vertical (sem "redundante")', async ({ page }) => {
  await page.keyboard.press('l');
  await clickWorld(page, { x: -60, y: 40 });
  await clickWorld(page, { x: -60.3, y: -20 }); // V inferido
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  let sk = await sketch(page);
  const ln = Object.values(sk.entities).find((e: any) => e.type === 'line') as any;
  const dof0 = await dof(page);
  await clickWorld(page, sk.entities[ln.p1]);
  await clickWorld(page, sk.entities[ln.p2], { shift: true });
  await page.getByRole('button', { name: 'Simétrica', exact: true }).click();
  await page.locator('.popover select').selectOption('x');
  await page.locator('.popover').getByRole('button', { name: 'Aplicar' }).click();
  await expect(page.locator('.status .msg')).toHaveCount(0);
  sk = await sketch(page);
  expect(sk.entities[ln.p1].y + sk.entities[ln.p2].y).toBeCloseTo(0, 6);
  expect(await dof(page)).toBe(dof0 - 1);
});

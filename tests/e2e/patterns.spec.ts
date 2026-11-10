import { expect, test } from '@playwright/test';

const editorText = async (page: import('@playwright/test').Page) => (await page.locator('.monaco-editor .view-lines').innerText()).replaceAll('\u00a0', ' ');
async function write(page: import('@playwright/test').Page, code: string) {
  const editor = page.getByRole('textbox', { name: 'Editor de código M.O.N.O.' }); await editor.focus();
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(text => navigator.clipboard.writeText(text), code);
  await page.keyboard.press('Control+A'); await page.keyboard.press('Control+V');
}

test('pattern suggestions accept Tab and the library inserts at the cursor', async ({ page }) => {
  await page.goto('/'); await expect(page.getByRole('textbox', { name: 'Editor de código M.O.N.O.' })).toBeAttached();
  await write(page, 'track drums {\n    kit "trip"\n    snare "....');
  await page.keyboard.type('x');
  await expect(page.locator('.suggest-widget')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect.poll(() => editorText(page)).toContain('snare "....x.......x..."');
  await page.getByRole('button', { name: 'Biblioteca de patrones' }).click();
  await expect(page.getByRole('complementary', { name: 'Pattern library' })).toBeVisible();
  await page.getByRole('button', { name: 'Insertar Basic kick' }).click();
  await expect.poll(() => editorText(page)).toContain('kick "x.......x......."');
  expect(await editorText(page)).toContain('kit "trip"');
  expect(await editorText(page)).not.toContain('snare "....x');
});

test('code and visual mute/solo controls stay in sync', async ({ page }) => {
  await page.goto('/'); await expect(page.getByRole('textbox', { name: 'Editor de código M.O.N.O.' })).toBeAttached();
  await write(page, 'track bass {\n    synth "sub"\n    notes D2 F2 A2\n    mute true\n}\ntrack lead {\n    synth "analog"\n    notes D3 F3 A3\n    solo true\n}');
  await page.getByRole('button', { name: /RELOAD/ }).click();
  await expect(page.getByRole('button', { name: 'Mute bass' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Solo lead' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'PLAY', exact: true }).click();
  await expect(page.getByRole('button', { name: 'PLAYING' })).toBeVisible();
  await page.getByRole('button', { name: 'Mute bass' }).click();
  await expect(page.getByRole('button', { name: 'Mute bass' })).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => editorText(page)).toContain('mute false');
  await page.getByRole('button', { name: 'Solo bass' }).click();
  await expect(page.getByRole('button', { name: 'Solo bass' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Solo lead' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'PLAYING' })).toBeVisible();
  await expect.poll(() => editorText(page)).toContain('solo true');
});

test('custom patterns persist and can be filtered without applying the score', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Biblioteca de patrones' }).click();
  await page.getByText('+ GUARDAR PATRÓN PROPIO').click();
  await page.getByLabel('Nombre del patrón').fill('Mi ritmo');
  await page.getByLabel('Instrumento del patrón').fill('perc');
  await page.getByLabel('Estilo del patrón').selectOption('Glitch');
  await page.getByLabel('Secuencia del patrón').fill('x...x...x...x...');
  await page.getByRole('button', { name: 'GUARDAR', exact: true }).click();
  await expect(page.getByRole('status').last()).toContainText('guardado');
  await page.reload(); await page.getByRole('button', { name: 'Biblioteca de patrones' }).click();
  await page.getByLabel('Filtrar por estilo').selectOption('Glitch');
  await page.getByLabel('Filtrar por instrumento').selectOption('perc');
  await expect(page.getByText('Mi ritmo')).toBeVisible();
  await page.getByRole('button', { name: 'Eliminar Mi ritmo' }).click();
  await expect(page.getByText('Mi ritmo')).not.toBeVisible();
});

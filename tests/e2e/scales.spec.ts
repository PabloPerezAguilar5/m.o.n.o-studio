import { expect, test, type Page } from '@playwright/test';

const source = (mode = '', notes = 'E2 F2 G2 Bb2') => `bpm 130\nscale E_minor\n${mode}\ntrack bass {\n synth "analog"\n notes ${notes}\n pattern "x...x...x...x..."\n cutoff 700\n resonance 0.8\n}`;
const editorText = async (page: Page) => (await page.locator('.monaco-editor .view-lines').innerText()).replaceAll('\u00a0', ' ');
async function write(page: Page, code: string) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(text => navigator.clipboard.writeText(text), code);
  await page.getByRole('textbox', { name: 'Editor de código M.O.N.O.' }).focus();
  await page.keyboard.press('Control+A'); await page.keyboard.press('Control+V');
}
test('warnings are visible and warning-only live edits apply without stopping', async ({ page }) => {
  await page.goto('/'); await expect(page.getByRole('textbox', { name: 'Editor de código M.O.N.O.' })).toBeAttached();
  await write(page, source());
  await expect(page.locator('.editor-status')).toContainText('2 AVISOS · CÓDIGO VÁLIDO');
  await expect(page.locator('.monaco-editor .squiggly-warning').first()).toBeVisible();
  await page.getByRole('button', { name: 'PLAY', exact: true }).click();
  await expect(page.getByRole('button', { name: 'PLAYING' })).toBeVisible();
  await expect(page.getByRole('log')).toContainText('no pertenece a E_minor');
  await write(page, source('scale_mode suggest', 'E2 F2 G2 B2'));
  await page.getByRole('button', { name: /RELOAD/ }).click();
  await expect(page.getByRole('log')).toContainText('cambio preparado para el próximo compás');
  await expect(page.getByRole('button', { name: 'PLAYING' })).toBeVisible();
  await expect(page.locator('.editor-status')).toContainText('1 AVISO · CÓDIGO VÁLIDO');
  await write(page, source('scale_mode strict'));
  await page.getByRole('button', { name: /RELOAD/ }).click();
  await expect(page.locator('.editor-status')).toContainText('2 ERRORES');
  await expect(page.getByRole('log')).toContainText('La última composición válida sigue sonando');
  await expect(page.getByRole('button', { name: 'PLAYING' })).toBeVisible();
});
test('scale mode suggestions and optional note quick fixes are available', async ({ page }) => {
  await page.goto('/'); await expect(page.getByRole('textbox', { name: 'Editor de código M.O.N.O.' })).toBeAttached();
  await write(page, 'scale_mode'); await page.keyboard.type(' ');
  await expect(page.locator('.suggest-widget')).toBeVisible();
  await expect(page.locator('.suggest-widget')).toContainText('free');
  await expect(page.locator('.suggest-widget')).toContainText('suggest');
  await expect(page.locator('.suggest-widget')).toContainText('strict');
  await page.keyboard.press('Escape');
  await write(page, source());
  await expect(page.locator('.editor-status')).toContainText('2 AVISOS');
  await page.locator('.view-line').getByText('F2', { exact: true }).click();
  await page.keyboard.press('Control+.');
  await expect(page.getByText('Cambiar a E2', { exact: true })).toBeVisible();
  expect(await editorText(page)).toContain('F2');
  // Monaco removes its temporary pointer guard on the next mouse movement.
  await page.mouse.move(10, 10);
  await page.getByText('Cambiar a E2', { exact: true }).click();
  await expect.poll(() => editorText(page)).toContain('notes E2 E2 G2 Bb2');
  await expect(page.locator('.editor-status')).toContainText('1 AVISO');
});

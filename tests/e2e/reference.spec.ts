import { expect, test } from '@playwright/test';

const editorText = async (page: import('@playwright/test').Page) => (await page.locator('.monaco-editor .view-lines').innerText()).replaceAll('\u00a0', ' ');
async function write(page: import('@playwright/test').Page, code: string) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(text => navigator.clipboard.writeText(text), code);
  await page.getByRole('textbox', { name: 'Editor de código M.O.N.O.' }).focus();
  await page.keyboard.press('Control+A'); await page.keyboard.press('Control+V');
}

test('reference previews synths and real kit variations while music keeps playing', async ({ page }) => {
  const failures: string[] = [];
  page.on('pageerror', error => failures.push(error.message));
  const requests: string[] = [];
  page.on('response', response => { if (response.url().includes('/samples/drums/trip/')) requests.push(`${response.status()} ${response.url()}`); });
  await page.goto('/');
  await page.getByRole('button', { name: 'PLAY', exact: true }).click();
  await expect(page.getByRole('button', { name: 'PLAYING' })).toBeVisible();
  await page.getByRole('button', { name: 'M.O.N.O. Reference' }).click();
  const panel = page.getByRole('complementary', { name: 'M.O.N.O. Reference' });
  await expect(panel.getByText('Instrument Explorer')).toBeVisible();
  await panel.getByRole('button', { name: 'TRY SOUND fm' }).click();
  await expect(panel.getByRole('status')).toContainText('Preescucha: fm');
  await expect(page.getByRole('button', { name: 'PLAYING' })).toBeVisible();
  await panel.getByRole('button', { name: 'Drum Kits', exact: true }).click();
  await expect(panel.getByText('Drum Kit Explorer')).toBeVisible();
  await panel.locator('article').filter({ has: page.locator('strong', { hasText: /^trip$/ }) }).locator('summary').filter({ hasText: 'kick' }).click();
  await panel.getByRole('button', { name: 'Escuchar trip kick variación 2' }).click();
  await expect(panel.getByRole('status')).toContainText('Preescucha: trip / kick 2', { timeout: 15000 });
  expect(requests.some(item => item.includes('200') && item.includes('%23'))).toBe(true);
  await expect(page.getByRole('button', { name: 'PLAYING' })).toBeVisible();
  await panel.getByRole('button', { name: 'Cerrar M.O.N.O. Reference' }).click();
  await expect(page.getByRole('button', { name: 'PLAYING' })).toBeVisible();
  expect(failures).toEqual([]);
});

test('builder inserts valid code, dictionary searches, and generator examples display', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'M.O.N.O. Reference' }).click();
  const panel = page.getByRole('complementary', { name: 'M.O.N.O. Reference' });
  await panel.getByLabel('Nombre de pista synth').fill('nova');
  await panel.getByLabel('Preset synth').selectOption('fm');
  await panel.getByLabel('cutoff synth').fill('0');
  await expect(panel.getByRole('alert')).toContainText('cutoff');
  await panel.getByLabel('cutoff synth').fill('1600');
  await panel.locator('.synth-builder').getByRole('button', { name: /INSERTAR/ }).click();
  await expect.poll(() => editorText(page)).toContain('track nova');
  await expect.poll(() => editorText(page)).toContain('synth "fm"');
  await expect(page.getByRole('button', { name: 'PLAY', exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Language Reference', exact: true }).click();
  await panel.getByLabel('Buscar en la referencia').fill('cutoff');
  await expect(panel.getByText('1800', { exact: false }).first()).toBeVisible();
  await expect(panel.getByText('20–20000 Hz', { exact: true })).toBeVisible();
  await panel.getByLabel('Buscar en la referencia').fill('euclid');
  await panel.getByRole('button', { name: 'Patterns & Generators', exact: true }).click();
  await expect(panel.getByLabel(/^Ejemplo de 16 pasos/)).toBeVisible();
  await expect(panel.getByText('euclid(7,16)', { exact: false }).first()).toBeVisible();
});

test('Monaco offers synth descriptions and contextual parameter hover', async ({ page }) => {
  await page.goto('/'); await expect(page.getByRole('textbox', { name: 'Editor de código M.O.N.O.' })).toBeAttached();
  await write(page, 'track lead {\n synth "');
  await page.keyboard.press('Control+Space');
  await expect(page.locator('.suggest-widget')).toBeVisible();
  await expect(page.locator('.suggest-widget')).toContainText('analog');
  await expect(page.locator('.suggest-widget')).toContainText('Sustractiva');
  await write(page, 'track lead {\n synth "analog"\n notes D4 F4 A4\n cutoff 1800\n}');
  await page.locator('.view-line').getByText('cutoff', { exact: true }).hover();
  await expect(page.locator('.monaco-hover:visible')).toContainText('filtro');
  await expect(page.locator('.monaco-hover:visible')).toContainText('20000');
});

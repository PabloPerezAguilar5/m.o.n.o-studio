import { expect, test, type Page } from '@playwright/test';
const code = `bpm 240
scale E_minor
track bass {
    synth "sub" // mantener comentario
    notes E2 G2 A2
    pattern "x...x...x...x..." // bajo
    cutoff 700
}
track lead {
    synth "analog"
    notes E4 G4
    pattern "..x.....x......."
}`;
async function write(page: Page, text: string) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(value => navigator.clipboard.writeText(value), text);
  await page.getByRole('textbox', { name: 'Editor de código M.O.N.O.' }).focus();
  await page.keyboard.press('Control+A'); await page.keyboard.press('Control+V');
}
async function read(page: Page) {
  await page.getByRole('textbox', { name: 'Editor de código M.O.N.O.' }).focus();
  await page.keyboard.press('Control+A'); await page.keyboard.press('Control+C');
  return page.evaluate(() => navigator.clipboard.readText());
}
test('source-driven steps edit only their own pattern and undo in Monaco', async ({ page }) => {
  await page.goto('/'); await expect(page.getByRole('textbox', { name: 'Editor de código M.O.N.O.' })).toBeAttached();
  await write(page, code);
  const bass = page.getByRole('group', { name: 'Secuenciador bass' });
  const lead = page.getByRole('group', { name: 'Secuenciador lead' });
  await expect(bass.getByRole('button')).toHaveCount(16);
  await expect(lead.getByRole('button')).toHaveCount(16);
  await expect(bass.getByRole('button', { name: 'Paso 1 bass' })).toHaveAttribute('aria-pressed', 'true');
  await expect(bass.locator('.sequencer-note').nth(0)).toHaveText('E2');
  await expect(bass.locator('.sequencer-note').nth(4)).toHaveText('G2');
  await expect(bass.locator('.sequencer-note').nth(8)).toHaveText('A2');
  await expect(bass.locator('.sequencer-note').nth(12)).toHaveText('E2');
  const second = bass.getByRole('button', { name: 'Paso 2 bass' });
  await second.click(); await expect(second).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Control+Z');
  await expect(second).toHaveAttribute('aria-pressed', 'false');
  await second.click(); await expect(second).toHaveAttribute('aria-pressed', 'true');
  const actual = (await read(page)).replaceAll('\r\n', '\n');
  expect(actual).toBe(code.replace('pattern "x...x...x...x..." // bajo', 'pattern "xx..x...x...x..." // bajo'));
  await expect(lead.getByRole('button', { name: 'Paso 3 lead' })).toHaveAttribute('aria-pressed', 'true');
  await write(page, code.replace('    pattern "x...x...x...x..." // bajo\n', ''));
  await expect(bass).toHaveCount(0); await expect(lead).toBeVisible();
  await write(page, code.replace('pattern "x...x...x...x..." // bajo', 'pattern "x.x.x.x.x.x.x.x." // bajo'));
  await expect(page.getByRole('button', { name: 'Paso 3 bass' })).toHaveAttribute('aria-pressed', 'true');
});

test('draft steps do not change audio before apply and coexist with mute and solo', async ({ page }) => {
  await page.goto('/'); await expect(page.getByRole('textbox', { name: 'Editor de código M.O.N.O.' })).toBeAttached();
  await write(page, code);
  await page.getByRole('button', { name: 'PLAY', exact: true }).click();
  await expect(page.getByRole('button', { name: 'PLAYING' })).toBeVisible();
  const bass = page.getByRole('group', { name: 'Secuenciador bass' });
  await expect(bass).toContainText('COMPÁS ACTUAL');
  await expect(bass.locator('[aria-current="step"]')).toHaveCount(1);
  await bass.getByRole('button', { name: 'Paso 2 bass' }).click();
  await expect(bass).toContainText('PRIMERA VUELTA');
  await expect(page.getByRole('button', { name: 'PLAYING' })).toBeVisible();
  await page.getByRole('button', { name: 'Mute bass' }).click();
  await expect(page.getByRole('button', { name: 'Mute bass' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Solo lead' }).click();
  await expect(page.getByRole('button', { name: 'Solo lead' })).toHaveAttribute('aria-pressed', 'true');
  await expect(bass.getByRole('button', { name: 'Paso 2 bass' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /RELOAD/ }).click();
  await expect(bass).toContainText('COMPÁS ACTUAL');
  await expect(page.getByRole('button', { name: 'PLAYING' })).toBeVisible();
});

test('groups all steps within the track card on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/'); await expect(page.getByRole('textbox', { name: 'Editor de código M.O.N.O.' })).toBeAttached();
  await write(page, code);
  const bass = page.getByRole('group', { name: 'Secuenciador bass' });
  await bass.scrollIntoViewIfNeeded();
  await expect(bass.locator('.sequencer-group')).toHaveCount(4);
  await expect(bass.getByRole('button')).toHaveCount(16);
  const bounds = await bass.boundingBox();
  const first = await bass.getByRole('button', { name: 'Paso 1 bass' }).boundingBox();
  const last = await bass.getByRole('button', { name: 'Paso 16 bass' }).boundingBox();
  expect(bounds && first && last && first.x >= bounds.x && last.x + last.width <= bounds.x + bounds.width).toBeTruthy();
});

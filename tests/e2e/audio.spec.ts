import { expect, test, type Page } from '@playwright/test';
import type { ToneBackend } from '../../src/audio';
import type { LiveEngine } from '../../src/core';
import type { CompileResult } from '../../src/language';

interface AudioHarness {
  backend: ToneBackend;
  engine: LiveEngine;
  compile: (source: string) => CompileResult;
  playError?: string;
}
declare global { interface Window { audioHarness: AudioHarness } }

const synthSource = (preset = 'sub', extra = '') => `bpm 240\nscale D_minor\nseed 12345\ntrack bass {\n synth "${preset}"\n notes D3 F3 A3 C4\n rate 1/8\n volume 0.8\n cutoff 5000\n reverb 0\n}\n${extra}`;

async function prepare(page: Page, source: string): Promise<void> {
  await page.goto('/');
  await page.evaluate(async ({ source, audio, core, language }) => {
    const [{ ToneBackend }, { LiveEngine }, { compile }] = await Promise.all([import(audio), import(core), import(language)]);
    const backend = new ToneBackend();
    const engine = new LiveEngine(backend);
    window.audioHarness = { backend, engine, compile };
    const result = compile(source);
    if (!result.composition) throw new Error(JSON.stringify(result.diagnostics));
    await engine.submit(result.composition);
    const button = document.createElement('button');
    button.id = 'audio-test-play';
    button.textContent = 'Start test audio';
    button.style.cssText = 'position:fixed;top:0;left:0;z-index:999999;padding:16px';
    button.onclick = () => { void engine.play().catch(error => { window.audioHarness.playError = String(error); }); };
    document.body.append(button);
  }, { source, audio: '/src/audio/index.ts', core: '/src/core/index.ts', language: '/src/language/index.ts' });
  await page.locator('#audio-test-play').click();
  await expect.poll(() => page.evaluate(() => window.audioHarness.engine.getSnapshot().playing)).toBe(true);
}

async function peak(page: Page): Promise<number> {
  return page.evaluate(() => window.audioHarness.backend.getWaveform().reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0));
}

/** Test-only PCM data. Never distributed as a kit or used by the application. */
function fixtureWav(): Buffer {
  const sampleRate = 24000;
  const frames = sampleRate / 5;
  const bytes = Buffer.alloc(44 + frames * 2);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24); bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(frames * 2, 40);
  for (let index = 0; index < frames; index++) bytes.writeInt16LE(Math.round(Math.sin(index / sampleRate * 440 * Math.PI * 2) * 12000 * (1 - index / frames)), 44 + index * 2);
  return bytes;
}

test.afterEach(async ({ page }) => {
  await page.evaluate(() => window.audioHarness?.engine.dispose());
});

test('all four presets produce actual audio after an explicit gesture', async ({ page }) => {
  for (const preset of ['sub', 'analog', 'fm', 'pad']) {
    await prepare(page, synthSource(preset));
    await expect.poll(() => peak(page), { message: `${preset} must produce a nonzero Web Audio waveform` }).toBeGreaterThan(0.001);
    expect(await page.evaluate(() => window.audioHarness.playError)).toBeUndefined();
    await page.evaluate(() => window.audioHarness.engine.dispose());
  }
});

test('live updates preserve transport, rejected code and missing samples preserve the active score', async ({ page }) => {
  await prepare(page, synthSource());
  await expect.poll(() => peak(page)).toBeGreaterThan(0.001);
  const initialBar = await page.evaluate(() => window.audioHarness.engine.getSnapshot().bar);
  const update = synthSource('sub', 'track lead {\n synth "fm"\n notes D4 F4 A4\n rate 1/16\n volume 0.4\n}');
  expect(await page.evaluate(async source => {
    const { engine, compile } = window.audioHarness;
    return engine.submit(compile(source).composition!);
  }, update)).toBe('queued');
  await expect.poll(() => page.evaluate(() => window.audioHarness.engine.getSnapshot().composition?.tracks.length)).toBe(2);
  expect(await page.evaluate(() => window.audioHarness.engine.getSnapshot().bar)).toBeGreaterThanOrEqual(initialBar);
  expect(await page.evaluate(() => window.audioHarness.engine.getSnapshot().playing)).toBe(true);
  const invalid = await page.evaluate(() => {
    const { engine, compile } = window.audioHarness;
    const result = compile('bpm broken\ntrack invalid {');
    return { errors: result.diagnostics.length, hasComposition: !!result.composition, tracks: engine.getSnapshot().composition?.tracks.length };
  });
  expect(invalid.errors).toBeGreaterThan(0);
  expect(invalid.hasComposition).toBe(false);
  expect(invalid.tracks).toBe(2);
  const failed = await page.evaluate(async source => {
    const { engine, compile } = window.audioHarness;
    try { await engine.submit(compile(source).composition!); return ''; } catch (error) { return String(error); }
  }, synthSource('sub', 'track drums {\n kit "trip"\n kick "x...x...x...x..."\n}'));
  expect(failed).toContain('kick.wav');
  expect(await page.evaluate(() => window.audioHarness.engine.getSnapshot().composition?.tracks.length)).toBe(2);
  await expect.poll(() => peak(page)).toBeGreaterThan(0.001);
  await page.evaluate(() => window.audioHarness.engine.stop());
  await expect.poll(() => peak(page)).toBeLessThan(0.0001);
  expect(await page.evaluate(() => window.audioHarness.engine.getSnapshot().step)).toBe(0);
  await page.locator('#audio-test-play').click();
  await expect.poll(() => peak(page)).toBeGreaterThan(0.001);
});

test('real WAV decoding plays sample drums and permits new lanes without replacement', async ({ page }) => {
  const requests: string[] = [];
  await page.route('**/samples/drums/trip/*.wav', route => {
    requests.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'audio/wav', body: fixtureWav() });
  });
  const source = 'bpm 240\nscale D_minor\nseed 12\ntrack drums {\n kit "trip"\n kick "x...x...x...x..."\n cutoff 16000\n reverb 0\n}';
  await prepare(page, source);
  await expect.poll(() => peak(page)).toBeGreaterThan(0.001);
  expect(requests).toHaveLength(3);
  const changed = source.replace('kick "x...x...x...x..."', 'hat euclid(8,16) every 1 bar\n snare human(0.5)');
  await page.evaluate(async code => { const { engine, compile } = window.audioHarness; await engine.submit(compile(code).composition!); }, changed);
  await expect.poll(() => page.evaluate(() => Object.keys(window.audioHarness.engine.getSnapshot().composition!.tracks[0].drums).join(','))).toBe('hat,snare');
  await expect.poll(() => peak(page)).toBeGreaterThan(0.001);
  expect(requests).toHaveLength(3);
});

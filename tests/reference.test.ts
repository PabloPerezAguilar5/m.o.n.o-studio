import { describe, expect, it } from 'vitest';
import { compile, GENERATOR_RULES } from '../src/language';
import { DEFAULT_PARAMS } from '../src/core/types';
import { ALL_REFERENCE, GENERATORS, LANGUAGE_REFERENCE, PARAMETER_LIMITS, SYNTH_PRESETS, referenceFor } from '../src/language/reference';
import { buildSynthCode, DEFAULT_SYNTH_SETTINGS, exampleForKit } from '../src/reference/synth';
import manifest from '../public/samples/kits.json';
import { parseKitManifest } from '../src/audio/samples';

describe('interactive language reference', () => {
  it('matches the supported generators, presets, defaults and parameter boundaries', () => {
    expect(GENERATORS.map(item => item.name).sort()).toEqual(Object.keys(GENERATOR_RULES).sort());
    for (const preset of SYNTH_PRESETS) expect(compile(buildSynthCode({ ...DEFAULT_SYNTH_SETTINGS, preset: preset.id }).code).diagnostics).toEqual([]);
    for (const [name, rule] of Object.entries(PARAMETER_LIMITS)) {
      expect(rule.default).toBe(DEFAULT_PARAMS[name as keyof typeof DEFAULT_PARAMS]);
      expect(referenceFor(name)?.values).toContain(String(rule.max));
      for (const value of [rule.min, rule.max]) expect(compile(`track s {\n synth "sub"\n notes D2\n ${name} ${value}\n}`).diagnostics).toEqual([]);
      expect(compile(`track s {\n synth "sub"\n notes D2\n ${name} ${rule.max + 1}\n}`).diagnostics.length).toBeGreaterThan(0);
    }
    expect(ALL_REFERENCE.every(item => item.description && item.values && item.defaultValue && item.example && item.error)).toBe(true);
    expect(new Set(ALL_REFERENCE.map(item => item.name)).size).toBe(ALL_REFERENCE.length);
  });
  it('documents generators using examples accepted for drums', () => {
    for (const item of GENERATORS) expect(compile(`track drums {\n kit "trip"\n ${item.example}\n}`).diagnostics, item.name).toEqual([]);
    expect(LANGUAGE_REFERENCE.find(item => item.name === 'cutoff')?.description).toContain('filtro');
  });
  it('validates builder settings and notes against the current scale and avoids duplicate names', () => {
    expect(buildSynthCode(DEFAULT_SYNTH_SETTINGS).errors).toEqual([]);
    expect(buildSynthCode({ ...DEFAULT_SYNTH_SETTINGS, cutoff: 0 }).errors).not.toEqual([]);
    expect(buildSynthCode({ ...DEFAULT_SYNTH_SETTINGS, notes: 'F#2' }, 'scale D_minor').warnings).not.toEqual([]);
    expect(buildSynthCode({ ...DEFAULT_SYNTH_SETTINGS, notes: 'F#2' }, 'scale D_minor\nscale_mode free').warnings).toEqual([]);
    expect(buildSynthCode({ ...DEFAULT_SYNTH_SETTINGS, notes: 'F#2' }, 'scale D_minor\nscale_mode strict').errors).not.toEqual([]);
    expect(buildSynthCode(DEFAULT_SYNTH_SETTINGS, 'track instrument {\n synth "sub"\n notes D2\n}').errors).not.toEqual([]);
  });
  it('builds standalone code for every real kit without altering filenames', () => {
    for (const kit of parseKitManifest(manifest).kits) expect(compile(exampleForKit(kit.id, kit.instruments)).diagnostics).toEqual([]);
  });
});

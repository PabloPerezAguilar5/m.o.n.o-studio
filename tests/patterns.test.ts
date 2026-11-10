import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { BUILTIN_PATTERNS, patternInsertion, patternSuggestions, validPattern } from '../src/patterns/catalog';
import { PatternStorage } from '../src/patterns/storage';
import { setTrackFlag } from '../src/studio/source-edits';

describe('pattern library', () => {
  it('keeps all built-in sequences valid and covers the requested styles', () => {
    expect(BUILTIN_PATTERNS.every(validPattern)).toBe(true);
    expect(new Set(BUILTIN_PATTERNS.map(p => p.style)).size).toBe(7);
  });
  it.each([
    ['kick', 'x', 'x.......x.......'], ['snare', '....x', '....x.......x...'],
    ['hat', 'x.x', 'x.x.x.x.x.x.x.x.'], ['kick', 'x...x', 'x...x...x...x...'],
  ])('suggests %s from %s without losing its prefix', (instrument, prefix, expected) => {
    expect(patternSuggestions(instrument, prefix)[0].sequence).toBe(expected);
    expect(patternSuggestions(instrument, prefix).every(p => p.sequence.startsWith(prefix))).toBe(true);
  });
  it('replaces only a pattern instruction or inserts at the cursor', () => {
    const p = BUILTIN_PATTERNS[0];
    expect(patternInsertion('    snare "....x.......x..." // backbeat', 8, p)).toEqual({ start: 4, end: 28, text: 'kick "x.......x......."' });
    expect(patternInsertion('    ', 5, p)).toEqual({ start: 4, end: 4, text: 'kick "x.......x......."' });
  });
  it('persists custom patterns and rejects invalid sequences', async () => {
    const name = crypto.randomUUID(), a = new PatternStorage(name);
    const item = { id: 'custom', name: 'My beat', instrument: 'perc', style: 'Glitch', sequence: 'x...x...x...x...' };
    await a.save(item); await expect(a.save({ ...item, sequence: 'x' })).rejects.toThrow(); await a.close();
    const b = new PatternStorage(name); expect(await b.list()).toEqual([{ ...item, custom: true }]);
    await b.remove(item.id); expect(await b.list()).toEqual([]); await b.close();
  });
});

describe('track control edits', () => {
  it('changes only the selected value and preserves comments and other tracks', () => {
    const code = 'track bass {\n  synth "sub"\n  mute false // note\n  notes D2\n}\ntrack lead {\n  synth "sub"\n  mute false\n  notes D2\n}\n';
    expect(setTrackFlag(code, 'bass', 'mute', true)).toBe(code.replace('mute false // note', 'mute true // note'));
    expect(setTrackFlag(code, 'lead', 'solo', true)).toContain('track lead {\n    solo true\n  synth');
    expect(setTrackFlag(code, 'missing', 'solo', true)).toBeUndefined();
  });
});

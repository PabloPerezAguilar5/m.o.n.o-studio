import { describe, expect, it } from 'vitest';
import { compile } from '../src/language';
import { EXAMPLES, INITIAL_CODE } from '../src/studio/examples';

describe('compositions shipped in the studio', () => {
  it('starts with a valid composition that needs no sample files', () => {
    const result = compile(INITIAL_CODE);
    expect(result.diagnostics).toEqual([]);
    expect(result.composition?.tracks.length).toBeGreaterThan(0);
    expect(result.composition?.tracks.every((track) => track.kind === 'synth')).toBe(true);
  });

  it.each(EXAMPLES)('compiles $name without loading audio', ({ code }) => {
    const result = compile(code);
    expect(result.diagnostics).toEqual([]);
    expect(result.composition?.tracks.length).toBeGreaterThan(0);
    expect(result.composition?.version).toBe('0.1');
  });

  it('marks every sample-dependent example as requiring a kit', () => {
    for (const example of EXAMPLES) {
      const drums = compile(example.code).composition?.tracks.filter((track) => track.kind === 'drums') ?? [];
      if (drums.length) {
        expect(example.tag).toContain('REQUIERE KIT');
        for (const track of drums) expect(example.tag).toContain(track.instrument.toUpperCase());
      }
    }
  });
});

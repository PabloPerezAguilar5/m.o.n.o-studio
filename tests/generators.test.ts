import { describe, expect, it } from 'vitest';
import { createRng, generatePattern, generatorRegistry, registerGenerator, streamSeed } from '../src/core';
import { compile } from '../src/language';
import type { GeneratorName, PatternSpec } from '../src/core/types';
const spec = (name: GeneratorName, args = [0.5]): PatternSpec => ({ type: 'generator', name, args });
const context = (seed = 1) => ({ random: createRng(seed), instrument: 'hat' as const, stepDuration: 0.125 });
const count = (pattern: ReturnType<typeof generatePattern>) => pattern.reduce((n, step) => n + step.length, 0);
const rhythm = (pattern: ReturnType<typeof generatePattern>) => pattern.map(step => step.length ? 'x' : '.').join('');

describe('seeded music generators', () => {
  it('has eight independent generator definitions', () => {
    expect([...generatorRegistry.keys()].sort()).toEqual(['dense', 'euclid', 'evolve', 'glitch', 'human', 'minimal', 'random', 'riot']);
  });
  it('reproduces identical pseudo-random streams and isolates named streams', () => {
    const a = createRng(12345); const b = createRng(12345); const c = createRng(67890);
    const values = Array.from({ length: 100 }, a);
    expect(values).toEqual(Array.from({ length: 100 }, b));
    expect(values).not.toEqual(Array.from({ length: 100 }, c));
    expect(values.every(value => value >= 0 && value < 1)).toBe(true);
    expect(streamSeed(12, 'hat')).not.toBe(streamSeed(12, 'kick'));
  });
  it.each(['random', 'riot', 'evolve', 'minimal', 'dense', 'human', 'glitch', 'euclid'] as GeneratorName[])('%s is deterministic, bounded and produces finite velocities/times', name => {
    const pattern = spec(name, name === 'euclid' ? [5, 16] : [0.8]);
    const a = generatePattern(pattern, context(12345));
    expect(a).toEqual(generatePattern(pattern, context(12345)));
    expect(a).toHaveLength(16);
    for (const step of a) {
      expect(step.length).toBeLessThanOrEqual(3);
      for (const hit of step) {
        expect(hit.velocity).toBeGreaterThanOrEqual(0); expect(hit.velocity).toBeLessThanOrEqual(1);
        expect(hit.offset).toBeGreaterThanOrEqual(0); expect(hit.offset).toBeLessThanOrEqual(0.1);
      }
    }
  });
  it('random honors exact zero/one extremes and approximate probability', () => {
    expect(count(generatePattern(spec('random', [0]), context()))).toBe(0);
    expect(count(generatePattern(spec('random', [1]), context()))).toBe(16);
    const ctx = context(); let hits = 0;
    for (let i = 0; i < 1000; i++) hits += count(generatePattern(spec('random', [0.4]), ctx));
    expect(hits / 16000).toBeGreaterThan(0.38); expect(hits / 16000).toBeLessThan(0.42);
  });
  it('minimal leaves at least three empty steps between hits; dense retains at least eight', () => {
    for (const amount of [0, 0.3, 0.8, 1]) {
      const minimal = generatePattern(spec('minimal', [amount]), context());
      expect(count(minimal)).toBeLessThanOrEqual(4);
      const indices = minimal.flatMap((step, index) => step.length ? [index] : []);
      for (let i = 1; i < indices.length; i++) expect(indices[i] - indices[i - 1]).toBeGreaterThanOrEqual(4);
      expect(count(generatePattern(spec('dense', [amount]), context()))).toBeGreaterThanOrEqual(8);
    }
  });
  it('evolve preserves at least twelve steps, and zero leaves previous rhythm untouched', () => {
    const previous = generatePattern({ type: 'literal', value: 'x...x...x...x...' }, context());
    const unchanged = generatePattern(spec('evolve', [0]), { ...context(), previous });
    expect(unchanged).toEqual(previous); expect(unchanged).not.toBe(previous);
    const next = generatePattern(spec('evolve', [1]), { ...context(), previous });
    expect(next.filter((step, index) => step.length !== previous[index].length)).toHaveLength(4);
  });
  it('human uses instrument-specific anchors and safe timing without event proliferation', () => {
    const pattern = generatePattern(spec('human', [1]), { ...context(), instrument: 'snare' });
    expect(rhythm(pattern)).toBe('....x.......x...');
    const hits = pattern.flat(); expect(hits).toHaveLength(2);
    expect(hits.every(hit => hit.offset <= 0.012 && hit.velocity >= 0.55 && hit.velocity <= 1)).toBe(true);
    expect(hits[0].offset).not.toBe(hits[1].offset);
  });
  it('euclid spreads exactly five hits with cyclic gaps of three or four steps', () => {
    const pattern = generatePattern(spec('euclid', [5, 16]), context());
    const indices = pattern.flatMap((step, index) => step.length ? [index] : []);
    expect(indices).toHaveLength(5); expect(indices[0]).toBe(0);
    const gaps = indices.map((value, i) => (indices[(i + 1) % indices.length] - value + 16) % 16);
    expect(gaps.every(gap => gap === 3 || gap === 4)).toBe(true);
    expect(count(generatePattern(spec('euclid', [0, 16]), context()))).toBe(0);
    expect(count(generatePattern(spec('euclid', [16, 16]), context()))).toBe(16);
  });
  it('riot creates accents and multiple hits; glitch creates cut fragments and retriggers', () => {
    const riot = generatePattern(spec('riot', [1]), context(12345));
    const glitch = generatePattern(spec('glitch', [1]), context(12345));
    expect(riot.some(step => step.length > 1)).toBe(true);
    expect(riot.flat().some(hit => hit.velocity === 1)).toBe(true);
    expect(glitch.some(step => step.length > 1)).toBe(true);
    expect(glitch).not.toEqual(riot);
  });

  it('extends grammar and musical generation through metadata without parser changes', () => {
    registerGenerator({ name: 'pulse_test', generate: ([at]) => Array.from({ length: 16 }, (_, step) => step === at ? [{ velocity: 0.7, offset: 0 }] : []) });
    try {
      const result = compile('track drums {\nkit "trip"\nkick pulse_test(3) every 2 bars\n}', {
        generators: { pulse_test: { arity: 1, validate: ([at]) => Number.isInteger(at) && at >= 0 && at < 16 ? undefined : 'Paso inválido.' } },
      });
      expect(result.diagnostics).toEqual([]);
      expect(rhythm(generatePattern(result.composition!.tracks[0].drums.kick!, context()))).toBe('...x............');
    } finally { generatorRegistry.delete('pulse_test'); }
  });
});

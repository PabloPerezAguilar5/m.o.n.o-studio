import { describe, expect, it } from 'vitest';
import { compile, lex, parse, scalePitchClasses } from '../src/language';

const melodic = (body = '') => `bpm 95\nscale D_minor\ntrack bass {\n synth "sub"\n notes D2 F2 A2 C3\n ${body}\n}`;
const drums = (pattern: string) => `track drums {\n kit "trip"\n kick ${pattern}\n}`;

describe('lexer and parser', () => {
  it('tracks line and column positions through comments and blank lines', () => {
    const { tokens, diagnostics } = lex('// comment\n\n  bpm 95\n');
    expect(diagnostics).toEqual([]);
    expect(tokens.find((token) => token.text === 'bpm')).toMatchObject({ line: 3, column: 3, length: 3 });
  });
  it('does not interpret comment markers inside strings', () => {
    const result = lex('kit "local//name" // actual comment');
    expect(result.tokens.filter((token) => token.kind === 'string').map((token) => token.text)).toEqual(['local//name']);
  });
  it('builds an AST with source positions and generator arguments', () => {
    const { ast, diagnostics } = parse(drums('euclid(5,16) every 4 bars'));
    expect(diagnostics).toEqual([]);
    expect(ast.tracks[0].statements[1]).toMatchObject({
      type: 'Statement', name: 'kick', location: { line: 3, column: 2 },
      value: { type: 'generator', name: 'euclid', args: [5, 16], every: 4 },
    });
  });
  it('reports a missing closing brace', () => {
    const result = compile('track bass {\n synth "sub"\n notes D2');
    expect(result.composition).toBeUndefined();
    expect(result.diagnostics.some((diagnostic) => diagnostic.message.includes('Falta "}"'))).toBe(true);
  });
  it('reports unterminated strings and recovers later lines', () => {
    const result = compile('track drums {\n kit "trip\n kick "x...x...x...x..."\n}');
    expect(result.composition).toBeUndefined();
    expect(result.diagnostics[0]).toMatchObject({ line: 2, severity: 'error' });
  });
  it('rejects trailing tokens rather than silently accepting a prefix', () => {
    expect(compile('bpm 95 anything').composition).toBeUndefined();
    expect(compile(drums('random(0.5) every 2 seconds')).diagnostics[0].message).toContain('bar');
  });
  it('rejects JavaScript as data, including calls and property access', () => {
    const result = compile('globalThis.alert("no");\nnew Function("return 1")');
    expect(result.composition).toBeUndefined();
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });
  it('makes progress past stray braces and unknown instructions', () => {
    const result = compile('}\n}\ntrack foo {\nwhat 1\nunknown(x)\n}\nfoo');
    expect(result.composition).toBeUndefined();
    expect(result.diagnostics.length).toBeGreaterThanOrEqual(4);
  });
});

describe('composition validation', () => {
  it('compiles the full instrumental example into independent tracks', () => {
    const result = compile(`bpm 95
scale D_minor
seed 12345
track drums {
 kit "trip"
 kick "x...x...x...x..."
 snare "....x.......x..."
 hat "x.x.x.x.x.x.x.x."
}
track bass {
 synth "sub"
 notes D2 F2 A2 C3
 pattern "x...x...x...x..."
 cutoff 600
 volume 0.8
}
track lead {
 synth "analog"
 notes D4 F4 A4 C5
 arp up
 rate 1/8
 cutoff 1800
 resonance 0.4
 delay 0.3
 reverb 0.5
}`);
    expect(result.diagnostics).toEqual([]);
    expect(result.composition).toMatchObject({ version: '0.1', bpm: 95, seed: 12345, scale: 'D_minor' });
    expect(result.composition?.tracks.map((track) => [track.id, track.kind, track.instrument])).toEqual([
      ['drums', 'drums', 'trip'], ['bass', 'synth', 'sub'], ['lead', 'synth', 'analog'],
    ]);
    expect(result.composition?.tracks[1].params).toMatchObject({ volume: 0.8, cutoff: 600 });
    expect(result.composition?.tracks[2].rate).toBe(8);
  });
  it('permits an empty composition to remove all existing tracks', () => {
    expect(compile('// silence').composition?.tracks).toEqual([]);
  });
  it('has reproducible defaults and does not reuse mutable parameter objects', () => {
    const first = compile(melodic()).composition!;
    const second = compile(melodic()).composition!;
    expect(first).toEqual(second);
    first.tracks[0].params.volume = 0;
    expect(second.tracks[0].params.volume).toBe(0.65);
  });
  it('rejects duplicate names, globals and track statements', () => {
    for (const source of [
      'bpm 95\nbpm 100',
      melodic() + '\ntrack bass {\n synth "fm"\n notes D4\n}',
      melodic('volume 0.2\n volume 0.4'),
    ]) expect(compile(source).diagnostics.some((diagnostic) => /duplicad|Ya existe/.test(diagnostic.message))).toBe(true);
  });
  it('validates global scale even when it appears after tracks', () => {
    const result = compile('track lead {\n synth "analog"\n notes E4 G4 B4\n}\nscale E_minor');
    expect(result.diagnostics).toEqual([]);
    expect(result.composition?.tracks[0].notes).toEqual(['E4', 'G4', 'B4']);
  });
  it('validates sharps and flats enharmonically without transposition', () => {
    expect(scalePitchClasses('Bb_major')).toEqual([10, 0, 2, 3, 5, 7, 9]);
    const result = compile('scale Bb_major\ntrack keys {\n synth "fm"\n notes Bb3 D4 F4 A#4\n}');
    expect(result.diagnostics).toEqual([]);
    expect(result.composition?.tracks[0].notes).toEqual(['Bb3', 'D4', 'F4', 'A#4']);
  });
  it('rejects out-of-scale and malformed notes', () => {
    expect(compile(melodic().replace('D2 F2 A2 C3', 'F#2')).diagnostics[0].message).toContain('no pertenece');
    expect(compile(melodic().replace('D2 F2 A2 C3', 'D9')).diagnostics[0].message).toContain('Nota inválida');
  });
  it.each(['volume -0.01', 'resonance 1.01', 'delay 2', 'reverb -1', 'cutoff 19', 'cutoff 20001'])(
    'rejects unsafe parameter: %s', (statement) => expect(compile(melodic(statement)).composition).toBeUndefined(),
  );
  it.each(['bpm 29', 'bpm 301', 'seed -1', 'seed 1.5', 'seed 4294967296', 'scale D_dorian'])(
    'rejects invalid global: %s', (source) => expect(compile(source).composition).toBeUndefined(),
  );
  it.each(['1/4', '1/8', '1/16'])('supports rate %s', (rate) => {
    expect(compile(melodic(`rate ${rate}`)).composition?.tracks[0].rate).toBe(Number(rate.slice(2)));
  });
  it('rejects unsupported durations and ambiguous pattern/arp declarations', () => {
    expect(compile(melodic('rate 1/32')).composition).toBeUndefined();
    expect(compile(melodic('pattern "x...x...x...x..."\n rate 1/8')).composition).toBeUndefined();
  });
  it('enforces instrument-specific grammar and supported presets', () => {
    for (const source of [
      melodic('kit "trip"'), melodic().replace('"sub"', '"unknown"'),
      melodic('kick "x...x...x...x..."'), drums('random(0.4)').replace('kick', 'notes D2\n kick'),
      'track none {}', 'track keys {\n synth "sub"\n}', 'track drums {\n kit "trip"\n}',
    ]) expect(compile(source).composition).toBeUndefined();
  });
  it.each(['"x..."', '"X...x...x...x..."', '"x...x...x...x..z"'])(
    'requires exactly 16 valid pattern characters: %s', (pattern) => expect(compile(drums(pattern)).composition).toBeUndefined(),
  );
  it('caps source size before parsing', () => {
    expect(compile(' '.repeat(200_001))).toMatchObject({ diagnostics: [{ line: 1, severity: 'error' }] });
  });
});

describe('generator syntax and contracts', () => {
  it.each(['random', 'riot', 'evolve', 'minimal', 'dense', 'human', 'glitch'])(
    'compiles %s once and with a regeneration interval', (name) => {
      expect(compile(drums(`${name}(0.5)`)).diagnostics).toEqual([]);
      expect(compile(drums(`${name}(0.5) every 4 bars`)).composition?.tracks[0].drums.kick).toEqual({ type: 'generator', name, args: [0.5], every: 4 });
    },
  );
  it('accepts euclidean pulses at both limits and retains arguments in IR', () => {
    for (const pulses of [0, 5, 16]) expect(compile(drums(`euclid(${pulses},16)`)).composition?.tracks[0].drums.kick).toEqual({ type: 'generator', name: 'euclid', args: [pulses, 16] });
  });
  it.each(['euclid(17,16)', 'euclid(5,8)', 'euclid(2.5,16)', 'random(0.5,1)', 'random(1.1)', 'random(-0.1)', 'unknown(0.5)', 'random(0.5) every 0 bars', 'random(0.5) every 1.5 bars'])(
    'rejects invalid generator: %s', (pattern) => expect(compile(drums(pattern)).composition).toBeUndefined(),
  );
  it('allows registering validation rules without modifying the parser', () => {
    const result = compile(drums('custom(3)'), { generators: { custom: { arity: 1, validate: ([value]) => value < 0 ? 'Positivo requerido.' : undefined } } });
    expect(result.diagnostics).toEqual([]);
    expect(result.composition?.tracks[0].drums.kick).toMatchObject({ name: 'custom', args: [3] });
  });
});

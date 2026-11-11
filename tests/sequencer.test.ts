import { describe, expect, it } from 'vitest';
import { currentBarStart, notesForSteps, sourceTracks, stepEdit } from '../src/studio/pattern-sequencer';

const code = `// pattern "xxxxxxxxxxxxxxxx" no es una pista
track acid {
    synth "sub" // pattern "x..............."
    notes E2 G2 A2
    pattern "x...x...x...x..." // conservar
    cutoff 700
}
track lead {
    synth "analog"
    notes D4 F4
    pattern "..x.....x......."
}
track drums {
    kit "trip"
    kick "x...x...x...x..."
}`;
function toggle(source: string, track: string, step: number) {
  const edit = stepEdit(source, track, step)!;
  const lines = source.split('\n'); const line = lines[edit.line - 1];
  lines[edit.line - 1] = line.slice(0, edit.column - 1) + edit.text + line.slice(edit.column);
  return lines.join('\n');
}

describe('source-driven sequencer', () => {
  it('derives synth patterns, notes, and independent cards from the editor', () => {
    const tracks = sourceTracks(code);
    expect(tracks.map(item => item.track.id)).toEqual(['acid', 'lead', 'drums']);
    expect(tracks[0]).toMatchObject({ patternEditable: true, track: { kind: 'synth', pattern: 'x...x...x...x...', notes: ['E2', 'G2', 'A2'] } });
    expect(tracks[1].track.pattern).toBe('..x.....x.......');
    expect(tracks[2].track.pattern).toBeUndefined();
  });
  it('edits one character in the selected block and preserves comments and other tracks', () => {
    const edited = toggle(code, 'acid', 1);
    expect(edited).toBe(code.replace('pattern "x...x...x...x..." // conservar', 'pattern "xx..x...x...x..." // conservar'));
    expect(toggle(edited, 'acid', 1)).toBe(code);
    expect(toggle(code, 'lead', 15)).toBe(code.replace('pattern "..x.....x......."', 'pattern "..x.....x......x"'));
  });
  it('adds and removes the visual pattern with the source, even when other code is invalid', () => {
    expect(sourceTracks(code.replace('    pattern "x...x...x...x..." // conservar\n', ''))[0].track.pattern).toBeUndefined();
    expect(sourceTracks(code.replace('x...x...x...x...', 'x...x...x...x...').replace('pattern "x...x...x...x..." // conservar', 'pattern "x..."'))[0].track.pattern).toBeUndefined();
    expect(sourceTracks('bpm nope\n' + code)[0].track.pattern).toBe('x...x...x...x...');
    expect(sourceTracks(code.replace('cutoff 700', 'cutoff 999999'))[0].track.pattern).toBe('x...x...x...x...');
  });
  it('refuses ambiguous, incomplete or non-synth edits', () => {
    expect(stepEdit(code + '\n' + code, 'acid', 0)).toBeUndefined();
    expect(stepEdit(code, 'drums', 0)).toBeUndefined();
    expect(stepEdit(code.replace('pattern "x...x...x...x..." // conservar', 'pattern "x...x...x...x...'), 'acid', 0)).toBeUndefined();
    expect(stepEdit(code, 'acid', 16)).toBeUndefined();
    expect(stepEdit(code.replace('    cutoff 700', '    pattern "x...x...x...x..."\n    cutoff 700'), 'acid', 0)).toBeUndefined();
  });
  it('maps notes to active hits in engine order and carries phase across bars', () => {
    const pattern = 'x...x...x...x...'; const notes = ['E2', 'G2', 'A2'];
    expect(notesForSteps(pattern, notes).filter(Boolean)).toEqual(['E2', 'G2', 'A2', 'E2']);
    expect(currentBarStart(pattern, 4, 6)).toBe(4);
    expect(notesForSteps(pattern, notes, currentBarStart(pattern, 4, 6)).filter(Boolean)).toEqual(['G2', 'A2', 'E2', 'G2']);
  });
});

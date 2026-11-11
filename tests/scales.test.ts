import { describe, expect, it } from 'vitest';
import { compile } from '../src/language';
import { LiveEngine } from '../src/core';
import type { AudioBackend, MusicalEvent, Track, TrackVoice } from '../src/core/types';

const source = (mode = '', notes = 'E2 F2 G2 Bb2') => `bpm 130\nscale E_minor\n${mode}\ntrack bass {\n synth "analog"\n notes ${notes}\n pattern "x...x...x...x..."\n cutoff 700\n resonance 0.8\n}`;
describe('scale modes', () => {
  it('plays valid chromatic notes in free mode without warnings or transposition', () => {
    const result = compile(source('scale_mode free'));
    expect(result.diagnostics).toEqual([]);
    expect(result.composition).toMatchObject({ scale: 'E_minor', scaleMode: 'free', tracks: [{ notes: ['E2', 'F2', 'G2', 'Bb2'] }] });
  });
  it.each(['', 'scale_mode suggest'])('keeps notes and identifies each chromatic warning in suggest mode (%s)', mode => {
    const result = compile(source(mode));
    expect(result.composition?.scaleMode).toBe('suggest');
    expect(result.composition?.tracks[0].notes).toEqual(['E2', 'F2', 'G2', 'Bb2']);
    expect(result.diagnostics).toHaveLength(2);
    expect(result.diagnostics[0]).toMatchObject({ line: 6, column: 11, length: 2, severity: 'warning', suggestions: ['E2', 'F#2'] });
    expect(result.diagnostics[1]).toMatchObject({ line: 6, column: 17, length: 3, severity: 'warning', suggestions: ['A2', 'B2'] });
  });
  it('rejects out-of-scale notes only in strict mode', () => {
    const result = compile(source('scale_mode strict'));
    expect(result.composition).toBeUndefined();
    expect(result.diagnostics.map(d => d.severity)).toEqual(['error', 'error']);
    expect(compile(source('scale_mode strict', 'E2 F#2 G2 B2')).diagnostics).toEqual([]);
  });
  it('accepts globals after tracks and rejects unknown, duplicated and malformed modes', () => {
    expect(compile(source('', 'F2') + '\nscale_mode free').diagnostics).toEqual([]);
    for (const mode of ['scale_mode maybe', 'scale_mode "free"', 'scale_mode free\nscale_mode strict']) expect(compile(source(mode)).composition).toBeUndefined();
    for (const mode of ['free', 'suggest', 'strict']) expect(compile(source(`scale_mode ${mode}`, 'H2')).diagnostics.some(d => d.severity === 'error' && d.message.includes('inválida'))).toBe(true);
  });
  it('prioritizes errors even after 100 warnings', () => {
    const code = `scale E_minor\ntrack first {\n synth "sub"\n notes ${Array(110).fill('F2').join(' ')}\n}\ntrack second {\n synth "sub"\n notes H2\n}`;
    const result = compile(code);
    expect(result.diagnostics).toHaveLength(100);
    expect(result.diagnostics.some(d => d.severity === 'error' && d.message.includes('H2'))).toBe(true);
    expect(result.composition).toBeUndefined();
  });
  it('keeps enharmonic notes and suggests neighbors across octaves', () => {
    const enharmonic = compile('scale C_major\nscale_mode strict\ntrack s {\n synth "sub"\n notes B#2 C3\n}');
    expect(enharmonic.diagnostics).toEqual([]);
    expect(enharmonic.composition?.tracks[0].notes).toEqual(['B#2', 'C3']);
    const boundary = compile('scale C_major\ntrack s {\n synth "sub"\n notes C#0\n}');
    expect(boundary.diagnostics[0].suggestions).toEqual(['C0', 'D0']);
  });
  it('applies warning-only edits on the running clock and preserves strict failures', async () => {
    const events: MusicalEvent[] = []; let tick: ((time: number) => void) | undefined; let starts = 0; let stops = 0;
    const voice: TrackVoice = { updateParams() {}, trigger(event) { events.push(event); }, setMuted() {}, dispose() {} };
    const backend: AudioBackend = { async initialize() {}, async createVoice(_track: Track) { return voice; }, setBpm() {}, start(cb) { tick = cb; starts++; }, stop() { stops++; }, setMasterVolume() {}, getWaveform() { return new Float32Array(); }, dispose() {} };
    const engine = new LiveEngine(backend);
    await engine.submit(compile(source('scale_mode suggest', 'E2')).composition!); await engine.play();
    tick?.(0);
    const edit = compile(source('scale_mode suggest', 'F2'));
    expect(edit.diagnostics[0].severity).toBe('warning');
    expect(await engine.submit(edit.composition!)).toBe('queued');
    for (let i = 1; i <= 16; i++) tick?.(i);
    expect(engine.getSnapshot().composition?.tracks[0].notes).toEqual(['F2']);
    expect(events.some(event => event.note === 'F2')).toBe(true);
    expect(starts).toBe(1); expect(stops).toBe(0); expect(engine.getSnapshot().playing).toBe(true);
    const invalid = compile(source('scale_mode strict', 'F2'));
    expect(invalid.composition).toBeUndefined();
    expect(engine.getSnapshot().composition?.tracks[0].notes).toEqual(['F2']);
    engine.dispose();
  });
  it('changes only the mode without resetting the clock, voices, or tempo', async () => {
    let tick: ((time: number) => void) | undefined; let creates = 0; let bpms = 0; let stops = 0;
    const events: MusicalEvent[] = [];
    const voice: TrackVoice = { updateParams() {}, trigger(event) { events.push(event); }, setMuted() {}, dispose() {} };
    const backend: AudioBackend = { async initialize() {}, async createVoice() { creates++; return voice; }, setBpm() { bpms++; }, start(cb) { tick = cb; }, stop() { stops++; }, setMasterVolume() {}, getWaveform() { return new Float32Array(); }, dispose() {} };
    const engine = new LiveEngine(backend);
    await engine.submit(compile(source('scale_mode suggest', 'E2 G2')).composition!); await engine.play();
    for (let i = 0; i < 5; i++) tick?.(i);
    const bpmCalls = bpms;
    expect(await engine.submit(compile(source('scale_mode free', 'E2 G2')).composition!)).toBe('applied');
    expect(engine.getSnapshot()).toMatchObject({ step: 4, composition: { scaleMode: 'free' } });
    expect(creates).toBe(1); expect(bpms).toBe(bpmCalls); expect(stops).toBe(0);
    for (let i = 5; i <= 8; i++) tick?.(i);
    expect(events.map(event => event.note)).toEqual(['E2', 'G2', 'E2']);
    engine.dispose();
  });
});

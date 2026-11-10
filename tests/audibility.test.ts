import { describe, expect, it, vi } from 'vitest';
import { compile } from '../src/language';
import { LiveEngine } from '../src/core';
import type { AudioBackend, Track, TrackVoice } from '../src/core/types';
const source = (bass = '', lead = '') => `bpm 120\ntrack bass {\n synth "sub"\n notes D2 F2 A2\n ${bass}\n}\ntrack lead {\n synth "analog"\n notes D3 F3 A3\n ${lead}\n}`;
class Backend implements AudioBackend {
  voices: Array<TrackVoice & { setMuted: ReturnType<typeof vi.fn>; trigger: ReturnType<typeof vi.fn> }> = [];
  callback?: (time: number) => void;
  initialize = vi.fn(async () => {}); setBpm = vi.fn(); stop = vi.fn(); dispose = vi.fn(); setMasterVolume = vi.fn(); getWaveform = () => new Float32Array();
  start = vi.fn((cb: (time: number) => void) => { this.callback = cb; });
  createVoice = vi.fn(async (_track: Track) => { const voice = { setMuted: vi.fn(), trigger: vi.fn(), dispose: vi.fn(), updateParams: vi.fn() }; this.voices.push(voice); return voice; });
}
function score(text: string) { const result = compile(text); expect(result.diagnostics).toEqual([]); return result.composition!; }
describe('code mute and solo', () => {
  it('defaults to false and validates boolean values for synths and drums', () => {
    expect(score(source()).tracks.map(t => [t.mute, t.solo])).toEqual([[false, false], [false, false]]);
    expect(score('track d {\n kit "trip"\n mute true\n solo false\n kick "x...x...x...x..."\n}').tracks[0]).toMatchObject({ mute: true, solo: false });
    expect(compile(source('mute maybe')).diagnostics.length).toBeGreaterThan(0);
  });
  it('changes instantly, supports multiple solos, preserves phase, and gives mute priority', async () => {
    const backend = new Backend(), engine = new LiveEngine(backend); await engine.submit(score(source())); await engine.play();
    for (let i = 0; i < 5; i++) backend.callback?.(i);
    backend.setBpm.mockClear();
    expect(await engine.submit(score(source('solo true', 'solo true\n mute true')))).toBe('applied');
    expect(engine.getSnapshot().step).toBe(4); expect(engine.getSnapshot().solo).toEqual(['bass', 'lead']);
    expect(backend.voices[0].setMuted).toHaveBeenLastCalledWith(false); expect(backend.voices[1].setMuted).toHaveBeenLastCalledWith(true);
    expect(backend.createVoice).toHaveBeenCalledTimes(2); expect(backend.stop).not.toHaveBeenCalled(); expect(backend.setBpm).not.toHaveBeenCalled();
    backend.callback?.(6); expect(backend.voices[1].trigger).toHaveBeenCalled();
    await engine.submit(score(source('solo false', 'solo true\n mute false')));
    expect(backend.voices[0].setMuted).toHaveBeenLastCalledWith(true); expect(backend.voices[1].setMuted).toHaveBeenLastCalledWith(false);
    engine.dispose();
  });
  it('applies mute immediately while a pattern edit waits for the next bar', async () => {
    const backend = new Backend(), engine = new LiveEngine(backend);
    await engine.submit(score(source())); await engine.play();
    for (let i = 0; i < 5; i++) backend.callback?.(i);
    const next = score(source('mute true'));
    next.tracks[0].notes = ['D2', 'A2'];
    expect(await engine.submit(next)).toBe('queued');
    expect(backend.voices[0].setMuted).toHaveBeenLastCalledWith(true);
    expect(engine.getSnapshot().composition?.tracks[0].notes).toEqual(['D2', 'F2', 'A2']);
    expect(engine.getSnapshot().step).toBe(4);
    engine.setMuted('bass', false);
    for (let i = 0; i < 12; i++) backend.callback?.(i + 5);
    expect(engine.getSnapshot().composition?.tracks[0]).toMatchObject({ mute: false, notes: ['D2', 'A2'] });
    expect(backend.start).toHaveBeenCalledTimes(1);
    engine.dispose();
  });
});

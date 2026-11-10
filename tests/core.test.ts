import { describe, expect, it, vi } from 'vitest';
import { LiveEngine, diffCompositions } from '../src/core';
import { compile } from '../src/language';
import { DEFAULT_PARAMS, type AudioBackend, type Composition, type MusicalEvent, type Track, type TrackVoice } from '../src/core/types';

class FakeVoice implements TrackVoice {
  trigger = vi.fn<(event: MusicalEvent, time: number) => void>();
  updateParams = vi.fn();
  setMuted = vi.fn();
  dispose = vi.fn();
}
class FakeBackend implements AudioBackend {
  voices: FakeVoice[] = [];
  callback?: (time: number) => void;
  initialize = vi.fn(async () => {});
  createVoice = vi.fn(async (_track: Track): Promise<TrackVoice> => { const voice = new FakeVoice(); this.voices.push(voice); return voice; });
  setBpm = vi.fn();
  start = vi.fn((callback: (time: number) => void) => { this.callback = callback; });
  stop = vi.fn(() => { this.callback = undefined; });
  setMasterVolume = vi.fn();
  getWaveform = () => new Float32Array(16);
  dispose = vi.fn();
  ticks(count: number, offset = 0) { for (let i = 0; i < count; i++) this.callback?.(offset + i * 0.125); }
}
function synth(id = 'bass'): Track {
  return { id, kind: 'synth', instrument: 'sub', drums: {}, notes: ['D2', 'F2', 'A2'], pattern: 'x...x...x...x...', arp: 'up', rate: 8, params: { ...DEFAULT_PARAMS } };
}
function score(tracks: Track[] = [synth()]): Composition { return { version: '0.1', bpm: 120, scale: 'D_minor', seed: 12345, tracks }; }
const setup = async (composition = score()) => { const backend = new FakeBackend(); const engine = new LiveEngine(backend); await engine.submit(composition); return { backend, engine }; };
const deferred = <T,>() => { let resolve!: (value: T) => void; let reject!: (reason?: unknown) => void; const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; };

describe('composition differences', () => {
  it('distinguishes continuous parameters from patterns and replacement instruments', () => {
    const before = score([synth(), synth('lead')]);
    const next = structuredClone(before);
    next.tracks[0].params.cutoff = 500;
    expect(diffCompositions(before, next)).toMatchObject({ parameters: ['bass'], unchanged: ['lead'], structural: false });
    next.tracks[0].pattern = 'x.x.x.x.x.x.x.x.';
    expect(diffCompositions(before, next)).toMatchObject({ patterns: ['bass'], replaced: [], structural: true });
    next.tracks[0].instrument = 'fm';
    expect(diffCompositions(before, next).replaced).toEqual(['bass']);
  });
});

describe('incremental transport', () => {
  it('keeps unchanged and pattern-edited voices alive, applying at the next bar', async () => {
    const { engine, backend } = await setup(score([synth(), synth('lead')]));
    await engine.play();
    backend.ticks(5);
    const next = score([synth(), synth('lead')]);
    next.tracks[0].pattern = 'xxxxxxxxxxxxxxxx';
    expect(await engine.submit(next)).toBe('queued');
    backend.ticks(11);
    expect(engine.getSnapshot().composition?.tracks[0].pattern).toBe('x...x...x...x...');
    backend.ticks(1);
    expect(engine.getSnapshot().composition?.tracks[0].pattern).toBe('xxxxxxxxxxxxxxxx');
    expect(backend.createVoice).toHaveBeenCalledTimes(2);
    for (const voice of backend.voices) expect(voice.dispose).not.toHaveBeenCalled();
    expect(backend.start).toHaveBeenCalledTimes(1);
    expect(backend.stop).not.toHaveBeenCalled();
  });

  it('automates cutoff immediately without a new voice or bar reset', async () => {
    const { engine, backend } = await setup();
    await engine.play(); backend.ticks(3);
    const next = score(); next.tracks[0].params.cutoff = 400;
    backend.setBpm.mockClear();
    expect(await engine.submit(next)).toBe('applied');
    expect(backend.createVoice).toHaveBeenCalledTimes(1);
    expect(backend.voices[0].updateParams).toHaveBeenLastCalledWith(next.tracks[0].params, undefined);
    expect(engine.getSnapshot().step).toBe(2);
    expect(engine.getSnapshot().pending).toBeNull();
    expect(backend.setBpm).not.toHaveBeenCalled();
  });

  it('keeps only the latest pending pattern and never duplicates transport callbacks', async () => {
    const { engine, backend } = await setup();
    await engine.play(); backend.ticks(1);
    for (let i = 0; i < 8; i++) {
      const next = score(); next.tracks[0].pattern = i === 7 ? 'x...............' : '.x..............';
      await engine.submit(next);
    }
    backend.ticks(15);
    expect(backend.voices[0].trigger).toHaveBeenCalledTimes(4);
    backend.ticks(16);
    expect(backend.voices[0].trigger).toHaveBeenCalledTimes(5);
    expect(backend.start).toHaveBeenCalledTimes(1);
    expect(engine.getSnapshot().pending).toBeNull();
  });

  it('disposes only removed/replaced voices at the exact boundary', async () => {
    const { engine, backend } = await setup(score([synth(), synth('lead')]));
    await engine.play(); backend.ticks(1);
    const next = score([synth()]); next.tracks[0].instrument = 'fm';
    await engine.submit(next);
    backend.ticks(15);
    expect(backend.voices[0].dispose).not.toHaveBeenCalled();
    backend.ticks(1, 42);
    expect(backend.voices[0].dispose).toHaveBeenCalledWith(42);
    expect(backend.voices[1].dispose).toHaveBeenCalledWith(42);
    expect(backend.voices[2].trigger).toHaveBeenCalledTimes(1);
  });

  it('mute and solo preserve the clock and the musical phase', async () => {
    const { engine, backend } = await setup(score([synth(), synth('lead')]));
    engine.setMuted('bass', true); engine.setSolo('lead');
    expect(backend.voices[0].setMuted).toHaveBeenLastCalledWith(true);
    expect(backend.voices[1].setMuted).toHaveBeenLastCalledWith(false);
    await engine.play(); backend.ticks(5);
    engine.setSolo(null); engine.setMuted('bass', false);
    expect(backend.voices[0].setMuted).toHaveBeenLastCalledWith(false);
    expect(engine.getSnapshot().step).toBe(4);
    expect(backend.start).toHaveBeenCalledTimes(1);
  });

  it('STOP cancels pending events, releases resources, and PLAY restarts at step zero', async () => {
    const { engine, backend } = await setup();
    await engine.play(); backend.ticks(7);
    await engine.submit(score([synth(), synth('lead')]));
    engine.stop();
    expect(backend.voices[0].dispose).toHaveBeenCalledTimes(1);
    expect(backend.voices[1].dispose).toHaveBeenCalledTimes(1);
    expect(engine.getSnapshot()).toMatchObject({ playing: false, pending: null, step: 0, bar: 0 });
    await engine.play(); backend.ticks(1);
    expect(engine.getSnapshot()).toMatchObject({ playing: true, step: 0, bar: 1 });
    expect(backend.voices[2].trigger.mock.calls[0][0].note).toBe('D2');
    engine.dispose(); engine.dispose();
    expect(backend.dispose).toHaveBeenCalledTimes(1);
  });

  it('multiple PLAY calls share a single transport start', async () => {
    const { engine, backend } = await setup();
    await Promise.all([engine.play(), engine.play(), engine.play()]);
    expect(backend.start).toHaveBeenCalledTimes(1);
  });

  it('a failing visual subscriber cannot interrupt the musical clock', async () => {
    const { engine, backend } = await setup(); await engine.play();
    const logging = vi.spyOn(console, 'error').mockImplementation(() => {});
    const unsubscribe = engine.subscribe(() => { throw new Error('visual failure'); });
    try {
      expect(() => backend.ticks(16)).not.toThrow();
      expect(backend.voices[0].trigger).toHaveBeenCalledTimes(4);
      expect(engine.getSnapshot().step).toBe(15);
    } finally { unsubscribe(); logging.mockRestore(); }
  });
});

describe('asynchronous transactions', () => {
  it('a missing kit preserves the active composition and disposes partial preparations', async () => {
    const { engine, backend } = await setup(); await engine.play();
    const partial = new FakeVoice();
    backend.createVoice.mockImplementation(async track => { if (track.id === 'bad') throw new Error('Missing sample'); return partial; });
    await expect(engine.submit(score([synth(), synth('good'), synth('bad')]))).rejects.toThrow('Missing sample');
    expect(partial.dispose).toHaveBeenCalledTimes(1);
    expect(engine.getSnapshot().composition?.tracks.map(track => track.id)).toEqual(['bass']);
    expect(engine.getSnapshot().playing).toBe(true);
    expect(backend.voices[0].dispose).not.toHaveBeenCalled();
  });

  it('a slow older submission cannot overwrite the latest version or leak its voice', async () => {
    const { engine, backend } = await setup(); await engine.play(); backend.ticks(1);
    const old = deferred<TrackVoice>(); const orphan = new FakeVoice();
    backend.createVoice.mockImplementationOnce(() => old.promise);
    const older = engine.submit(score([synth(), synth('old')]));
    const newerScore = score(); newerScore.tracks[0].params.cutoff = 800;
    await engine.submit(newerScore);
    old.resolve(orphan);
    expect(await older).toBe('superseded');
    expect(orphan.dispose).toHaveBeenCalledTimes(1);
    expect(engine.getSnapshot().composition?.tracks).toHaveLength(1);
    expect(engine.getSnapshot().composition?.tracks[0].params.cutoff).toBe(800);
  });

  it('superseding prepared presets releases unused candidates', async () => {
    const { engine, backend } = await setup(); await engine.play(); backend.ticks(1);
    const fm = score(); fm.tracks[0].instrument = 'fm'; await engine.submit(fm);
    const pad = score(); pad.tracks[0].instrument = 'pad'; await engine.submit(pad);
    expect(backend.voices[1].dispose).toHaveBeenCalledTimes(1);
    expect(backend.voices[0].dispose).not.toHaveBeenCalled();
    backend.ticks(16);
    expect(engine.getSnapshot().composition?.tracks[0].instrument).toBe('pad');
  });

  it('rebases a loading edit if an older update removes an initially reused voice', async () => {
    const { engine, backend } = await setup(); await engine.play(); backend.ticks(1);
    await engine.submit(score([]));
    const waiting = deferred<TrackVoice>();
    backend.createVoice.mockImplementationOnce(() => waiting.promise);
    const replacement = engine.submit(score([synth(), synth('lead')]));
    backend.ticks(16);
    expect(engine.getSnapshot().composition?.tracks).toHaveLength(0);
    waiting.resolve(new FakeVoice());
    await replacement;
    backend.ticks(16);
    expect(engine.getSnapshot().composition?.tracks).toHaveLength(2);
    expect(backend.createVoice).toHaveBeenCalledTimes(3);
  });

  it('STOP invalidates asynchronous preparation', async () => {
    const { engine, backend } = await setup();
    const loading = deferred<TrackVoice>(); const voice = new FakeVoice();
    backend.createVoice.mockImplementationOnce(() => loading.promise);
    const pending = engine.submit(score([synth(), synth('lead')])); engine.stop();
    loading.resolve(voice);
    expect(await pending).toBe('superseded');
    expect(voice.dispose).toHaveBeenCalledTimes(1);
    expect(engine.getSnapshot().pending).toBeNull();
  });

  it('PLAY after STOP is not blocked by a canceled audio initialization', async () => {
    const { engine, backend } = await setup();
    const initialization = deferred<void>();
    backend.initialize.mockImplementationOnce(() => initialization.promise);
    const canceled = engine.play();
    engine.stop();
    await engine.play();
    expect(engine.getSnapshot().playing).toBe(true);
    initialization.resolve(); await canceled;
    expect(backend.start).toHaveBeenCalledTimes(1);
  });
});

describe('musical events and regeneration', () => {
  function drums(every?: number): Track {
    return { ...synth('drums'), kind: 'drums', instrument: 'trip', notes: [], pattern: undefined,
      drums: { hat: { type: 'generator', name: 'random', args: [0.5], every } } };
  }
  function bars(backend: FakeBackend, voice: FakeVoice, count: number) {
    const rhythms: number[][] = [];
    for (let bar = 0; bar < count; bar++) {
      voice.trigger.mockClear(); backend.ticks(16);
      rhythms.push(voice.trigger.mock.calls.map(call => call[1]));
    }
    return rhythms;
  }
  it('a generated pattern without every repeats precisely', async () => {
    const { backend, engine } = await setup(score([drums()])); await engine.play();
    const rhythms = bars(backend, backend.voices[0], 4);
    expect(rhythms[0]).toEqual(rhythms[1]);
    expect(rhythms[0]).toEqual(rhythms[3]);
  });
  it('every two bars regenerates only at the specified boundary', async () => {
    const { backend, engine } = await setup(score([drums(2)])); await engine.play();
    const rhythms = bars(backend, backend.voices[0], 4);
    expect(rhythms[0]).toEqual(rhythms[1]);
    expect(rhythms[2]).toEqual(rhythms[3]);
    expect(rhythms[0]).not.toEqual(rhythms[2]);
  });
  it('restarts the same seeded sequence after STOP and PLAY', async () => {
    const { backend, engine } = await setup(score([drums(1)])); await engine.play();
    const first = bars(backend, backend.voices[0], 4);
    engine.stop(); await engine.play();
    expect(bars(backend, backend.voices[1], 4)).toEqual(first);
  });
  it('only active melodic steps advance notes; updown does not duplicate extrema', async () => {
    const track = synth(); track.pattern = 'x.x.x.x.x.x.x.x.'; track.arp = 'updown';
    const { backend, engine } = await setup(score([track])); await engine.play(); backend.ticks(16);
    expect(backend.voices[0].trigger.mock.calls.map(call => call[0].note)).toEqual(['D2','F2','A2','F2','D2','F2','A2','F2']);
  });
  it('rate 1/8 emits eight synchronized notes per bar without a pattern', async () => {
    const track = synth(); delete track.pattern;
    const { backend, engine } = await setup(score([track])); await engine.play(); backend.ticks(16);
    expect(backend.voices[0].trigger.mock.calls.map(call => call[1])).toEqual([0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75]);
  });

  it('a BPM edit keeps every-N regeneration measured in musical bars', async () => {
    const original = score([drums(2)]);
    const { backend, engine } = await setup(original); await engine.play();
    const before = bars(backend, backend.voices[0], 1)[0];
    const faster = structuredClone(original); faster.bpm = 240;
    expect(await engine.submit(faster)).toBe('applied');
    expect(backend.setBpm).toHaveBeenLastCalledWith(240);
    const after = bars(backend, backend.voices[0], 2);
    expect(after[0]).toEqual(before);
    expect(after[1]).not.toEqual(before);
    expect(backend.start).toHaveBeenCalledTimes(1);
  });

  it('compiler errors preserve the sounding score and the latest valid pending edit', async () => {
    const backend = new FakeBackend(); const engine = new LiveEngine(backend);
    const initial = 'bpm 120\nscale D_minor\ntrack bass {\n synth "sub"\n notes D2 F2 A2\n pattern "x...x...x...x..."\n}';
    const applySource = async (source: string) => {
      const compiled = compile(source);
      if (compiled.composition) await engine.submit(compiled.composition);
      return compiled;
    };
    expect((await applySource(initial)).diagnostics).toEqual([]);
    await engine.play(); backend.ticks(3);
    const validEdit = initial.replace('D2 F2 A2', 'A2 C3 D3');
    await applySource(validEdit);
    const pendingBefore = engine.getSnapshot().pending;
    const invalidEdit = await applySource(validEdit.replace('C3', 'C#3'));
    expect(invalidEdit.composition).toBeUndefined();
    expect(invalidEdit.diagnostics[0].message).toContain('no pertenece');
    expect(engine.getSnapshot().pending).toBe(pendingBefore);
    expect(engine.getSnapshot().composition?.tracks[0].notes).toEqual(['D2','F2','A2']);
    backend.ticks(14);
    expect(engine.getSnapshot().composition?.tracks[0].notes).toEqual(['A2','C3','D3']);
    expect(backend.voices[0].dispose).not.toHaveBeenCalled();
    expect(backend.start).toHaveBeenCalledTimes(1);
  });

  it('removing a track at a future boundary emits no further events for the retired voice', async () => {
    const { backend, engine } = await setup(); await engine.play(); backend.ticks(1, 20);
    await engine.submit(score([]));
    backend.ticks(15, 20.125);
    const voice = backend.voices[0]; const count = voice.trigger.mock.calls.length;
    backend.ticks(17, 22);
    expect(voice.dispose).toHaveBeenCalledWith(22);
    expect(voice.trigger).toHaveBeenCalledTimes(count);
    expect(engine.getSnapshot().playing).toBe(true);
    expect(backend.stop).not.toHaveBeenCalled();
  });
});

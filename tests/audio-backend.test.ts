import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { Track } from '../src/core/types';
import { DEFAULT_PARAMS } from '../src/core/types';

const mock = vi.hoisted(() => ({
  nodes: [] as Array<{ kind: string; dispose: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn>; gain: { linearRampToValueAtTime: ReturnType<typeof vi.fn> } }>,
  callbacks: new Map<number, (time: number) => void>(),
  next: 0,
  resume: vi.fn(async () => {}),
  reverbReady: Promise.resolve() as Promise<void>,
}));

vi.mock('tone', () => {
  class Param {
    value = 1;
    rampTo = vi.fn(() => this);
    setValueAtTime = vi.fn(() => this);
    cancelAndHoldAtTime = vi.fn(() => this);
    linearRampToValueAtTime = vi.fn(() => this);
  }
  class Node {
    kind: string;
    gain = new Param(); volume = new Param(); wet = new Param(); frequency = new Param(); Q = new Param();
    maxPolyphony = 8;
    dispose = vi.fn(); start = vi.fn(); releaseAll = vi.fn(); triggerAttackRelease = vi.fn();
    constructor(..._args: unknown[]) { this.kind = this.constructor.name; mock.nodes.push(this); }
    connect(_node: unknown) { return this; }
    chain(..._nodes: unknown[]) { return this; }
    toDestination() { return this; }
  }
  class Filter extends Node {}
  class FeedbackDelay extends Node {}
  class Reverb extends Node { ready = mock.reverbReady; }
  class Gain extends Node {}
  class Limiter extends Node {}
  class Waveform extends Node { getValue() { return new Float32Array(512); } }
  class PolySynth extends Node {}
  class Synth {}
  class FMSynth {}
  class Player extends Node {}
  const transport = {
    bpm: new Param(), state: 'stopped', timeSignature: 4, position: 0 as string | number,
    scheduleRepeat: vi.fn((callback: (time: number) => void) => { const id = mock.next++; mock.callbacks.set(id, callback); return id; }),
    clear: vi.fn((id: number) => mock.callbacks.delete(id)),
    start: vi.fn(() => { transport.state = 'started'; }),
    stop: vi.fn(() => { transport.state = 'stopped'; }),
  };
  return {
    Filter, FeedbackDelay, Reverb, Gain, Limiter, Waveform, PolySynth, Synth, FMSynth, Player,
    start: mock.resume, now: () => 0.1, immediate: () => 0, gainToDb: (value: number) => 20 * Math.log10(value),
    getTransport: () => transport,
    getContext: () => ({ decodeAudioData: vi.fn() }),
  };
});

vi.mock('../src/audio/samples', () => ({
  SampleLibrary: class {
    load = vi.fn(async () => ({ kick: [{}], snare: [{}], hat: [{}] }));
    dispose = vi.fn();
  },
  parseKitManifest: vi.fn(),
}));

import { ToneBackend } from '../src/audio';

const track = (kind: 'synth' | 'drums' = 'synth'): Track => ({
  id: 'bass', kind, instrument: kind === 'synth' ? 'sub' : 'trip',
  params: { ...DEFAULT_PARAMS }, notes: ['D2'], drums: kind === 'drums' ? { kick: { type: 'literal', value: 'x...............' } } : {},
  rate: 8, arp: 'up',
});

describe('Tone backend lifecycle and scheduling', () => {
  beforeEach(() => { vi.useFakeTimers(); mock.nodes.length = 0; mock.callbacks.clear(); mock.resume.mockClear(); mock.reverbReady = Promise.resolve(); });
  afterEach(() => { vi.useRealTimers(); });

  it('does not allocate or unlock audio until requested', async () => {
    const backend = new ToneBackend();
    expect(mock.nodes).toHaveLength(0);
    expect(backend.getWaveform().every(value => value === 0)).toBe(true);
    await backend.createVoice(track());
    expect(mock.resume).not.toHaveBeenCalled();
    await backend.initialize();
    expect(mock.resume).toHaveBeenCalledTimes(1);
    backend.dispose();
    expect(mock.nodes.every(node => node.dispose.mock.calls.length === 1)).toBe(true);
  });

  it('uses a single transport callback and removes it on STOP', async () => {
    const backend = new ToneBackend();
    await backend.initialize();
    const tick = vi.fn();
    backend.start(tick);
    backend.start(tick);
    expect(mock.callbacks.size).toBe(1);
    [...mock.callbacks.values()][0](123.456);
    expect(tick).toHaveBeenCalledExactlyOnceWith(123.456);
    backend.stop();
    expect(mock.callbacks.size).toBe(0);
    backend.start(tick);
    expect(mock.callbacks.size).toBe(1);
    backend.dispose();
    expect(mock.callbacks.size).toBe(0);
  });

  it('automates parameters without recreating audio nodes', async () => {
    const backend = new ToneBackend();
    const voice = await backend.createVoice(track());
    const count = mock.nodes.length;
    voice.updateParams({ ...DEFAULT_PARAMS, cutoff: 600, delay: 0.3, reverb: 0.5 });
    voice.setMuted(true);
    voice.setMuted(false);
    expect(mock.nodes).toHaveLength(count);
    expect(mock.nodes.every(node => !node.dispose.mock.calls.length)).toBe(true);
    backend.dispose();
  });

  it('loads pools for all lanes so adding snare to an existing kick track works', async () => {
    const backend = new ToneBackend();
    const voice = await backend.createVoice(track('drums'));
    const players = mock.nodes.filter(node => node.kind === 'Player');
    expect(players).toHaveLength(12);
    voice.trigger({ trackId: 'bass', instrument: 'snare', velocity: 0.8, offset: 0.012, duration: 0.1 }, 1);
    expect(players.filter(player => player.start.mock.calls.length)).toHaveLength(1);
    expect(players[4].start).toHaveBeenCalledWith(1.012);
    voice.trigger({ trackId: 'bass', instrument: 'kick', velocity: 0.8, offset: 0, duration: 0.1 }, 1);
    expect(players[0].start).toHaveBeenCalledWith(1);
    backend.dispose();
  });

  it('fades at the musical boundary and frees each node once afterwards', async () => {
    const backend = new ToneBackend();
    const voice = await backend.createVoice(track());
    const nodes = mock.nodes.slice(3); // master, limiter and analyser remain alive
    voice.dispose(2);
    voice.dispose(2);
    expect(nodes.every(node => !node.dispose.mock.calls.length)).toBe(true);
    const gainRamps = nodes.flatMap(node => node.gain.linearRampToValueAtTime.mock.calls);
    expect(gainRamps).toContainEqual([0, 2.018]);
    vi.advanceTimersByTime(2100);
    expect(nodes.every(node => node.dispose.mock.calls.length === 1)).toBe(true);
    backend.dispose();
    expect(mock.nodes.every(node => node.dispose.mock.calls.length === 1)).toBe(true);
  });

  it('cleans up a voice if async preparation fails', async () => {
    const backend = new ToneBackend();
    mock.reverbReady = Promise.reject(new Error('reverb failed'));
    await expect(backend.createVoice(track())).rejects.toThrow('reverb failed');
    expect(mock.nodes.slice(3).every(node => node.dispose.mock.calls.length === 1)).toBe(true);
    backend.dispose();
  });

  it('STOP overrides a retirement scheduled for a future bar', async () => {
    const backend = new ToneBackend();
    const voice = await backend.createVoice(track());
    const nodes = mock.nodes.slice(3);
    voice.dispose(2);
    backend.stop();
    vi.advanceTimersByTime(60);
    expect(nodes.every(node => node.dispose.mock.calls.length === 1)).toBe(true);
    backend.dispose();
  });

  it('does not resurrect prepared voices after backend disposal', async () => {
    const backend = new ToneBackend();
    let ready!: () => void;
    mock.reverbReady = new Promise<void>(resolve => { ready = resolve; });
    const pending = backend.createVoice(track());
    backend.dispose();
    ready();
    await expect(pending).rejects.toThrow('cerrado');
    expect(mock.nodes.every(node => node.dispose.mock.calls.length === 1)).toBe(true);
    expect(backend.getWaveform().every(value => value === 0)).toBe(true);
  });
});

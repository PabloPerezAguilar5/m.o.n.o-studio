import * as Tone from 'tone';
import type { AudioBackend, MusicalEvent, Track, TrackParams, TrackVoice } from '../core/types';
import { SampleLibrary, type LoadedKit } from './samples';
import { SYNTH_PRESETS } from '../language/reference';

export { SampleLibrary, parseKitManifest } from './samples';
export type { KitDefinition, KitManifest, LoadedKit } from './samples';

const FADE = 0.018;
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
type Synth = Tone.PolySynth<Tone.Synth> | Tone.PolySynth<Tone.FMSynth>;

function createSynth(preset: string): Synth {
  let synth: Synth;
  if (preset === 'fm') {
    synth = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 1.5, modulationIndex: 7,
      oscillator: { type: 'sine' }, modulation: { type: 'triangle' },
      envelope: { attack: 0.008, decay: 0.22, sustain: 0.22, release: 0.3 },
      modulationEnvelope: { attack: 0.01, decay: 0.15, sustain: 0.15, release: 0.2 },
    });
  } else {
    const options = preset === 'sub'
      ? { oscillator: { type: 'sine' as const }, envelope: { attack: 0.012, decay: 0.18, sustain: 0.8, release: 0.16 } }
      : preset === 'pad'
        ? { oscillator: { type: 'fatsawtooth' as const, spread: 18, count: 3 }, envelope: { attack: 0.45, decay: 0.3, sustain: 0.65, release: 1.8 } }
        : { oscillator: { type: 'sawtooth' as const }, envelope: { attack: 0.006, decay: 0.16, sustain: 0.3, release: 0.22 } };
    synth = new Tone.PolySynth(Tone.Synth, options);
  }
  synth.maxPolyphony = 8;
  synth.volume.value = -10;
  return synth;
}

class ToneTrackVoice implements TrackVoice {
  private readonly filter = new Tone.Filter({ type: 'lowpass', frequency: 2400, Q: 0.2, rolloff: -24 });
  private readonly delay = new Tone.FeedbackDelay({ delayTime: '8n', feedback: 0.24, wet: 0 });
  private readonly reverb = new Tone.Reverb({ decay: 1.5, preDelay: 0.01, wet: 0 });
  private readonly gain = new Tone.Gain(0);
  private readonly gate = new Tone.Gain(1);
  private readonly players = new Map<string, { pool: Tone.Player[]; index: number }>();
  private readonly synth?: Synth;
  private retiring = false;
  private disposed = false;
  private cleanup?: ReturnType<typeof setTimeout>;

  constructor(track: Track, master: Tone.Gain, samples: LoadedKit | undefined, private readonly onDisposed: () => void) {
    this.filter.chain(this.delay, this.reverb, this.gain, this.gate, master);
    if (track.kind === 'synth') {
      this.synth = createSynth(track.instrument).connect(this.filter);
    } else if (samples) {
      for (const instrument of Object.keys(samples)) {
        const buffers = samples[instrument];
        if (!buffers?.length) continue; // Validated before constructing any nodes.
        const pool = Array.from({ length: buffers.length * 4 }, (_, index) => {
          const player = new Tone.Player({ url: buffers[index % buffers.length], fadeIn: 0.002, fadeOut: 0.006 }).connect(this.filter);
          player.volume.value = -6;
          return player;
        });
        this.players.set(instrument, { pool, index: 0 });
      }
    }
    this.updateParams(track.params, Tone.immediate());
  }

  validateTrack(track: Track): void {
    if (track.kind !== 'drums') return;
    for (const instrument of Object.keys(track.drums)) {
      if (!this.players.has(instrument)) throw new Error(`Kit "${track.instrument}": falta el instrumento ${instrument} en el manifiesto.`);
    }
  }

  async ready(): Promise<void> { await this.reverb.ready; }

  updateParams(params: TrackParams, time = Tone.now()): void {
    if (this.retiring || this.disposed) return;
    const at = Math.max(time, Tone.immediate());
    this.filter.frequency.cancelAndHoldAtTime(at).linearRampToValueAtTime(clamp(params.cutoff, 20, 20000), at + 0.035);
    this.filter.Q.cancelAndHoldAtTime(at).linearRampToValueAtTime(0.2 + clamp(params.resonance) * 11.8, at + 0.035);
    this.delay.wet.cancelAndHoldAtTime(at).linearRampToValueAtTime(clamp(params.delay), at + 0.035);
    this.reverb.wet.cancelAndHoldAtTime(at).linearRampToValueAtTime(clamp(params.reverb), at + 0.035);
    this.gain.gain.cancelAndHoldAtTime(at).linearRampToValueAtTime(clamp(params.volume), at + 0.035);
  }

  trigger(event: MusicalEvent, time: number): void {
    if (this.retiring || this.disposed) return;
    const at = Math.max(Tone.immediate() + 0.001, time + event.offset);
    const velocity = clamp(event.velocity);
    if (this.synth && event.note) {
      this.synth.triggerAttackRelease(event.note, Math.max(0.015, event.duration), at, velocity);
    } else if (event.instrument) {
      const instrument = this.players.get(event.instrument);
      if (!instrument) return;
      const player = instrument.pool[instrument.index++ % instrument.pool.length];
      player.volume.setValueAtTime(velocity > 0 ? Tone.gainToDb(velocity) - 6 : -100, at);
      // start() also restarts an already-playing slot, releasing its previous source.
      // Unlike restart(), it triggers the first hit on a stopped player as well.
      player.start(at);
    }
  }

  setMuted(muted: boolean): void {
    if (this.retiring || this.disposed) return;
    const at = Tone.immediate();
    this.gate.gain.cancelAndHoldAtTime(at).linearRampToValueAtTime(muted ? 0 : 1, at + FADE);
  }

  dispose(time = Tone.immediate()): void {
    if (this.retiring || this.disposed) return;
    this.retiring = true;
    const at = Math.max(time, Tone.immediate());
    this.gate.gain.cancelAndHoldAtTime(at).linearRampToValueAtTime(0, at + FADE);
    this.synth?.releaseAll(at);
    // The audio clock controls the fade; this timer only reclaims silent resources.
    this.cleanup = setTimeout(() => this.destroy(), Math.max(0, (at + FADE - Tone.immediate()) * 1000) + 30);
  }

  stopNow(): void {
    if (this.disposed) return;
    if (this.cleanup) clearTimeout(this.cleanup);
    // STOP must override a retirement that was queued at a future bar boundary.
    this.retiring = false;
    this.dispose(Tone.immediate());
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.cleanup) clearTimeout(this.cleanup);
    this.synth?.dispose();
    for (const { pool } of this.players.values()) for (const player of pool) player.dispose();
    this.players.clear();
    this.filter.dispose(); this.delay.dispose(); this.reverb.dispose(); this.gain.dispose(); this.gate.dispose();
    this.onDisposed();
  }
}

/** Audio is resumed exclusively by initialize(), called from an explicit PLAY gesture. */
export class ToneBackend implements AudioBackend {
  private master?: Tone.Gain;
  private limiter?: Tone.Limiter;
  private analyser?: Tone.Waveform;
  private samples?: SampleLibrary;
  private readonly voices = new Set<ToneTrackVoice>();
  private tickId?: number;
  private bpm = 95;
  private volume = 0.7;
  private disposed = false;
  private readonly silence = new Float32Array(512);
  private previewRevision = 0;
  private preview?: { dispose(): void };
  private previewTimer?: ReturnType<typeof setTimeout>;

  private ensureGraph(): void {
    if (this.disposed) throw new Error('El motor de audio está cerrado.');
    if (this.master) return;
    this.master = new Tone.Gain(this.volume);
    this.limiter = new Tone.Limiter(-1).toDestination();
    this.analyser = new Tone.Waveform(512);
    this.master.connect(this.limiter);
    this.limiter.connect(this.analyser);
    this.samples = new SampleLibrary(bytes => Tone.getContext().decodeAudioData(bytes));
    Tone.getTransport().timeSignature = 4;
    Tone.getTransport().bpm.value = this.bpm;
  }

  async initialize(): Promise<void> {
    if (this.disposed) throw new Error('El motor de audio está cerrado.');
    await Tone.start();
    this.ensureGraph();
  }

  /** Preview voices are independent of the transport and never enter the track graph. */
  async previewSynth(preset: string): Promise<void> {
    if (!SYNTH_PRESETS.some(item => item.id === preset)) throw new Error(`Preset desconocido: ${preset}.`);
    const revision = this.beginPreview();
    await this.initialize();
    if (this.disposed || revision !== this.previewRevision) return;
    const output = new Tone.Gain(0.18).connect(this.master!);
    let synth: Synth;
    try { synth = createSynth(preset).connect(output); }
    catch (error) { output.dispose(); throw error; }
    this.preview = { dispose: () => { synth.dispose(); output.dispose(); } };
    try {
      const note = SYNTH_PRESETS.find(item => item.id === preset)!.note;
      synth.triggerAttackRelease(note, preset === 'pad' ? 0.8 : 0.35, Tone.now() + 0.02, 0.65);
      this.schedulePreviewCleanup(preset === 'pad' ? 3200 : 1600, revision);
    } catch (error) { this.stopPreview(); throw error; }
  }

  async previewSample(kit: string, instrument: string, variation = 0): Promise<void> {
    const revision = this.beginPreview();
    await this.initialize();
    if (this.disposed || revision !== this.previewRevision) return;
    const samples = await this.samples!.load(kit);
    if (this.disposed || revision !== this.previewRevision) return;
    const buffers = samples[instrument];
    if (!buffers || !Number.isInteger(variation) || variation < 0 || variation >= buffers.length) throw new Error(`Kit "${kit}": no existe la variación ${variation + 1} de ${instrument}.`);
    const output = new Tone.Gain(0.18).connect(this.master!);
    let player: Tone.Player;
    try { player = new Tone.Player({ url: buffers[variation], fadeIn: 0.002, fadeOut: 0.006 }).connect(output); }
    catch (error) { output.dispose(); throw error; }
    player.volume.value = -6;
    this.preview = { dispose: () => { player.dispose(); output.dispose(); } };
    try {
      player.start(Tone.now() + 0.02);
      this.schedulePreviewCleanup(Math.min(4000, Math.max(300, (buffers[variation].duration || 1) * 1000 + 100)), revision);
    } catch (error) { this.stopPreview(); throw error; }
  }

  private beginPreview(): number {
    this.stopPreview();
    return this.previewRevision;
  }
  private schedulePreviewCleanup(delay: number, revision: number): void {
    this.previewTimer = setTimeout(() => { if (revision === this.previewRevision) this.stopPreview(); }, delay);
  }
  stopPreview(): void {
    ++this.previewRevision;
    if (this.previewTimer) clearTimeout(this.previewTimer);
    this.previewTimer = undefined;
    this.preview?.dispose();
    this.preview = undefined;
  }

  async createVoice(track: Track): Promise<TrackVoice> {
    this.ensureGraph();
    const samples = track.kind === 'drums' ? await this.samples!.load(track.instrument) : undefined;
    if (this.disposed) throw new Error('El motor de audio está cerrado.');
    if (samples) {
      for (const instrument of Object.keys(track.drums)) {
        if (!samples[instrument]?.length) throw new Error(`Kit "${track.instrument}": falta el instrumento ${instrument} en el manifiesto.`);
      }
    }
    const voice = new ToneTrackVoice(track, this.master!, samples, () => this.voices.delete(voice));
    this.voices.add(voice);
    try {
      await voice.ready();
      if (this.disposed) throw new Error('El motor de audio está cerrado.');
      return voice;
    } catch (error) { voice.destroy(); throw error; }
  }

  setBpm(bpm: number): void {
    const next = clamp(bpm, 30, 300);
    if (next === this.bpm) return;
    this.bpm = next;
    if (!this.master || this.disposed) return;
    const transport = Tone.getTransport();
    if (transport.state === 'started') transport.bpm.rampTo(this.bpm, 0.08);
    else transport.bpm.value = this.bpm;
  }

  start(onTick: (time: number) => void): void {
    this.ensureGraph();
    if (this.tickId !== undefined) return;
    const transport = Tone.getTransport();
    this.tickId = transport.scheduleRepeat(time => onTick(time), '16n', 0);
    transport.start('+0.07', 0);
  }

  stop(): void {
    if (!this.master || this.disposed) return;
    const transport = Tone.getTransport();
    transport.stop();
    if (this.tickId !== undefined) transport.clear(this.tickId);
    this.tickId = undefined;
    transport.position = 0;
    for (const voice of this.voices) voice.stopNow();
  }

  setMasterVolume(value: number): void {
    this.volume = clamp(value);
    this.master?.gain.rampTo(this.volume, 0.035);
  }

  getWaveform(): Float32Array { return this.analyser?.getValue() ?? this.silence; }

  dispose(): void {
    if (this.disposed) return;
    this.stopPreview();
    this.stop();
    this.disposed = true;
    for (const voice of [...this.voices]) voice.destroy();
    this.samples?.dispose();
    this.analyser?.dispose(); this.master?.dispose(); this.limiter?.dispose();
    this.analyser = undefined; this.master = undefined; this.limiter = undefined;
  }
}

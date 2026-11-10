import { diffCompositions, sameParams, sameStructure, sameVoice } from './diff';
import { generatePattern, type GeneratedPattern } from './generators';
import { createRng, streamSeed, type RandomSource } from './random';
import type { AudioBackend, Composition, DrumName, PatternSpec, Track, TrackVoice } from './types';

export interface EngineSnapshot {
  playing: boolean;
  composition: Composition | null;
  pending: Composition | null;
  step: number;
  bar: number;
  muted: string[];
  solo: string[];
}
export type SubmitResult = 'applied' | 'queued' | 'superseded';
interface PreparedVoice { track: Track; voice: TrackVoice }
interface Pending { composition: Composition; voices: Map<string, PreparedVoice> }
interface DrumRuntime { random: RandomSource; pattern?: GeneratedPattern; generatedAt: number; spec: PatternSpec }
interface TrackRuntime { noteIndex: number; random: RandomSource; drums: Record<DrumName, DrumRuntime> }

/** One transport callback owns musical time. Submissions never restart this clock. */
export class LiveEngine {
  private composition: Composition | null = null;
  private pending: Pending | null = null;
  private voices = new Map<string, PreparedVoice>();
  private runtimes = new Map<string, TrackRuntime>();
  private listeners = new Set<() => void>();

  private tick = 0;
  private playing = false;
  private disposed = false;
  private revision = 0;
  private lifecycle = 0;
  private playPromise: Promise<void> | null = null;
  private latestSubmission: Promise<SubmitResult> | null = null;
  private preparingComposition: Composition | null = null;
  private snapshot: EngineSnapshot = { playing: false, composition: null, pending: null, step: 0, bar: 0, muted: [], solo: [] };

  constructor(private readonly backend: AudioBackend) {}

  getSnapshot = (): EngineSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  submit(composition: Composition): Promise<SubmitResult> {
    if (this.disposed) return Promise.reject(new Error('El motor está cerrado.'));
    // Own a stable value: editing a caller object cannot modify a queued transaction.
    const next = structuredClone(composition);
    this.preparingComposition = next;
    const operation = this.prepare(next, ++this.revision);
    this.latestSubmission = operation;
    void operation.then(() => {
      if (this.latestSubmission === operation) { this.latestSubmission = null; this.preparingComposition = null; }
    }, () => {
      if (this.latestSubmission === operation) { this.latestSubmission = null; this.preparingComposition = null; }
    });
    return operation;
  }

  private async prepare(composition: Composition, revision: number): Promise<SubmitResult> {
    const prepared = new Map<string, PreparedVoice>();
    const discard = () => { for (const item of prepared.values()) item.voice.dispose(); prepared.clear(); };
    try {
      // Rebase after awaits: an older prepared update may commit during loading.
      while (true) {
        const missing = composition.tracks.filter(track => {
          const current = this.voices.get(track.id);
          return !(current && sameVoice(current.track, track)) && !prepared.has(track.id);
        });
        if (!missing.length) break;
        const results = await Promise.allSettled(missing.map(async track => ({ track, voice: await this.backend.createVoice(track) })));
        let failure: unknown;
        for (const result of results) {
          if (result.status === 'fulfilled') prepared.set(result.value.track.id, result.value);
          else failure = result.reason;
        }
        if (revision !== this.revision || this.disposed) { discard(); return 'superseded'; }
        if (failure !== undefined) throw failure;
      }
      if (revision !== this.revision || this.disposed) { discard(); return 'superseded'; }
      // Existing matching voices win over candidates made redundant while loading.
      for (const [id, item] of prepared) {
        const current = this.voices.get(id);
        if (current && sameVoice(current.track, item.track)) { item.voice.dispose(); prepared.delete(id); }
      }
      for (const track of composition.tracks) {
        const candidate = prepared.get(track.id) ?? this.voices.get(track.id);
        candidate?.voice.validateTrack?.(track);
      }
      this.discardPending();
      const diff = diffCompositions(this.composition, composition);
      const transaction = { composition, voices: prepared };
      if (!this.playing || !diff.structural) {
        this.commit(transaction);
        this.emit();
        return 'applied';
      }
      // Continuous controls are independent of the queued structural revision.
      if (diff.bpmChanged) this.backend.setBpm(composition.bpm);
      if (this.composition) {
        const targets = new Map(composition.tracks.map(track => [track.id, track]));
        this.composition = { ...this.composition, bpm: composition.bpm, tracks: this.composition.tracks.map(track => {
          const target = targets.get(track.id);
          if (!target) return track;
          if (sameVoice(track, target) && !sameParams(track, target)) this.voices.get(track.id)?.voice.updateParams(target.params);
          return { ...track, ...(sameVoice(track, target) ? { params: { ...target.params } } : {}), mute: !!target.mute, solo: !!target.solo };
        }) };
      }
      this.pending = transaction;
      this.updateAudibility();
      this.emit();
      return 'queued';
    } catch (error) {
      discard();
      throw error;
    }
  }

  async play(): Promise<void> {
    if (this.disposed) throw new Error('El motor está cerrado.');
    if (this.playing) return;
    if (this.playPromise) return this.playPromise;
    const lifecycle = this.lifecycle;
    const operation = (async () => {
      await this.backend.initialize();
      if (lifecycle !== this.lifecycle || this.disposed) return;
      while (this.latestSubmission) {
        // A failed edit does not prevent restarting the previously valid score.
        await this.latestSubmission.catch(() => undefined);
        if (lifecycle !== this.lifecycle || this.disposed) return;
      }
      if (!this.composition) throw new Error('Compila una composición válida antes de pulsar PLAY.');
      if (this.composition.tracks.some(track => !this.voices.has(track.id))) await this.submit(this.composition);
      if (lifecycle !== this.lifecycle || this.disposed) return;
      this.tick = 0;
      this.runtimes.clear();
      this.backend.setBpm(this.composition.bpm);
      this.playing = true;
      this.backend.start(this.onTick);
      this.emit();
    })().finally(() => { if (this.playPromise === operation) this.playPromise = null; });
    this.playPromise = operation;
    return operation;
  }

  stop(): void {
    ++this.lifecycle;
    ++this.revision;
    this.playPromise = null;
    this.latestSubmission = null;
    this.preparingComposition = null;
    this.playing = false;
    this.backend.stop();
    this.discardPending();
    for (const item of this.voices.values()) item.voice.dispose();
    this.voices.clear();
    this.runtimes.clear();
    this.tick = 0;
    this.emit();
  }

  setMuted(trackId: string, muted: boolean): void { this.setTrackAudibility(trackId, 'mute', muted); }
  setTrackSolo(trackId: string, solo: boolean): void { this.setTrackAudibility(trackId, 'solo', solo); }
  // Compatibility for existing callers of the original single-solo API.
  setSolo(trackId: string | null): void {
    for (const track of this.composition?.tracks ?? []) this.setTrackAudibility(track.id, 'solo', track.id === trackId);
  }
  private setTrackAudibility(id: string, key: 'mute' | 'solo', value: boolean): void {
    const update = (composition: Composition | null): Composition | null => composition && ({ ...composition, tracks: composition.tracks.map(track => track.id === id ? { ...track, [key]: value } : track) });
    this.composition = update(this.composition);
    if (this.pending) this.pending.composition = update(this.pending.composition)!;
    // An edit made while samples are loading must survive the eventual commit.
    const preparing = this.preparingComposition?.tracks.find(track => track.id === id);
    if (preparing) preparing[key] = value;
    this.updateAudibility();
    this.emit();
  }
  private updateAudibility(): void {
    const tracks = this.composition?.tracks ?? [];
    const hasSolo = tracks.some(track => track.solo);
    for (const track of tracks) this.voices.get(track.id)?.voice.setMuted(!!track.mute || (hasSolo && !track.solo));
  }
  private discardPending(): void {
    if (!this.pending) return;
    for (const item of this.pending.voices.values()) item.voice.dispose();
    this.pending = null;
  }

  private commit(transaction: Pending, time?: number): void {
    const { composition, voices: prepared } = transaction;
    const target = new Map(composition.tracks.map(track => [track.id, track]));
    const resetSeed = this.composition?.seed !== composition.seed;
    for (const [id, item] of this.voices) {
      const next = target.get(id);
      if (!next || !sameVoice(item.track, next)) {
        item.voice.dispose(time);
        this.voices.delete(id);
        this.runtimes.delete(id);
      }
    }
    for (const track of composition.tracks) {
      const current = this.voices.get(track.id);
      if (current) {
        if (!sameStructure(current.track, track) || resetSeed) this.runtimes.delete(track.id);
        if (!sameParams(current.track, track)) current.voice.updateParams(track.params, time);
        current.track = track;
      } else {
        const candidate = prepared.get(track.id);
        if (!candidate) throw new Error(`Falta preparar la pista ${track.id}.`);
        this.voices.set(track.id, candidate);
        prepared.delete(track.id);
      }
    }
    for (const item of prepared.values()) item.voice.dispose();
    prepared.clear();
    if (this.composition?.bpm !== composition.bpm) this.backend.setBpm(composition.bpm);
    this.composition = composition;
    this.updateAudibility();
  }

  private runtime(track: Track): TrackRuntime {
    let runtime = this.runtimes.get(track.id);
    if (!runtime) {
      const seed = this.composition!.seed;
      runtime = { noteIndex: 0, random: createRng(streamSeed(seed, `${track.id}:notes`)), drums: {} };
      for (const [instrument, spec] of Object.entries(track.drums)) {
        runtime.drums[instrument as DrumName] = { random: createRng(streamSeed(seed, `${track.id}:${instrument}`)), generatedAt: -1, spec };
      }
      this.runtimes.set(track.id, runtime);
    }
    return runtime;
  }

  private onTick = (time: number): void => {
    if (!this.playing || !this.composition) return;
    const step = this.tick % 16;
    const bar = Math.floor(this.tick / 16);
    if (step === 0 && this.pending) {
      const transaction = this.pending;
      this.pending = null;
      this.commit(transaction, time);
    }
    const stepDuration = 60 / this.composition.bpm / 4;
    for (const track of this.composition.tracks) {
      const runtime = this.runtime(track);
      const voice = this.voices.get(track.id)?.voice;
      if (!voice) continue;
      if (track.kind === 'drums') {
        for (const [key, channel] of Object.entries(runtime.drums)) {
          const instrument = key as DrumName;
          const every = channel.spec.type === 'generator' ? channel.spec.every : undefined;
          if (!channel.pattern || (step === 0 && every !== undefined && bar - channel.generatedAt >= every)) {
            channel.pattern = generatePattern(channel.spec, { random: channel.random, previous: channel.pattern, instrument, stepDuration });
            channel.generatedAt = bar;
          }
          for (const hit of channel.pattern[step]) voice.trigger({ trackId: track.id, instrument, velocity: hit.velocity, offset: Math.min(hit.offset, stepDuration * 0.8), duration: stepDuration }, time);
        }
      } else {
        const active = track.pattern ? track.pattern[step] === 'x' : step % (16 / track.rate) === 0;
        if (!active || !track.notes.length) continue;
        const count = track.notes.length;
        let index = runtime.noteIndex % count;
        if (track.arp === 'down') index = count - 1 - index;
        if (track.arp === 'random') index = Math.floor(runtime.random() * count);
        if (track.arp === 'updown' && count > 1) {
          const position = runtime.noteIndex % (count * 2 - 2);
          index = position < count ? position : count * 2 - 2 - position;
        }
        runtime.noteIndex++;
        voice.trigger({ trackId: track.id, note: track.notes[index], velocity: 0.8, offset: 0, duration: stepDuration * (track.pattern ? 1 : 16 / track.rate) * 0.85 }, time);
      }
    }
    this.tick++;
    this.emit();
  };

  private emit(): void {
    this.snapshot = {
      playing: this.playing, composition: this.composition, pending: this.pending?.composition ?? null,
      step: this.tick > 0 ? (this.tick - 1) % 16 : 0,
      bar: this.tick > 0 ? Math.floor((this.tick - 1) / 16) + 1 : 0,
      muted: (this.composition?.tracks ?? []).filter(track => track.mute).map(track => track.id), solo: (this.composition?.tracks ?? []).filter(track => track.solo).map(track => track.id),
    };
    // A failed visual subscriber must never abort an audio scheduling callback.
    for (const listener of this.listeners) {
      try { listener(); }
      catch (error) { console.error('M.O.N.O. visual subscriber failed:', error); }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.listeners.clear();
    this.backend.dispose();
  }
}

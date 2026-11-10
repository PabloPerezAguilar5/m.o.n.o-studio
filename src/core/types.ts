export const LANGUAGE_VERSION = '0.1' as const;
export type DrumName = 'kick' | 'snare' | 'hat';
export type GeneratorName = 'random' | 'riot' | 'evolve' | 'minimal' | 'dense' | 'human' | 'glitch' | 'euclid';
export type PatternSpec = { type: 'literal'; value: string } | { type: 'generator'; name: GeneratorName; args: number[]; every?: number };
export interface TrackParams { volume: number; cutoff: number; resonance: number; delay: number; reverb: number }
export const DEFAULT_PARAMS: TrackParams = { volume: 0.65, cutoff: 2400, resonance: 0.15, delay: 0, reverb: 0.12 };
export interface Track {
  id: string;
  kind: 'drums' | 'synth';
  instrument: string;
  drums: Partial<Record<DrumName, PatternSpec>>;
  notes: string[];
  pattern?: string;
  arp: 'up' | 'down' | 'updown' | 'random';
  rate: 4 | 8 | 16;
  params: TrackParams;
}
export interface Composition { version: typeof LANGUAGE_VERSION; bpm: number; scale: string; seed: number; tracks: Track[] }
export interface Diagnostic { line: number; column: number; length: number; message: string; severity: 'error' | 'warning' }
export interface MusicalEvent { trackId: string; instrument?: DrumName; note?: string; velocity: number; offset: number; duration: number }
export interface TrackVoice {
  updateParams(params: TrackParams, time?: number): void;
  trigger(event: MusicalEvent, time: number): void;
  setMuted(muted: boolean): void;
  dispose(time?: number): void;
}
export interface AudioBackend {
  initialize(): Promise<void>;
  createVoice(track: Track): Promise<TrackVoice>;
  setBpm(bpm: number): void;
  start(onTick: (time: number) => void): void;
  stop(): void;
  setMasterVolume(value: number): void;
  getWaveform(): Float32Array;
  dispose(): void;
}

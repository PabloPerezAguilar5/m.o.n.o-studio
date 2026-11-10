import type { DrumName, GeneratorName, PatternSpec } from './types';
import type { RandomSource } from './random';

export interface Hit { velocity: number; offset: number }
export type GeneratedPattern = Hit[][];
export interface GeneratorContext {
  random: RandomSource;
  previous?: GeneratedPattern;
  instrument: DrumName;
  stepDuration: number;
}
export interface GeneratorDefinition {
  name: string;
  generate(args: readonly number[], context: GeneratorContext): GeneratedPattern;
}
const empty = (): GeneratedPattern => Array.from({ length: 16 }, () => []);
const clone = (pattern: GeneratedPattern): GeneratedPattern => pattern.map(hits => hits.map(hit => ({ ...hit })));
const hit = (velocity = 0.8, offset = 0): Hit => ({ velocity, offset });
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** Registry is independent from the interpreter and audio implementation. */
export const generatorRegistry = new Map<string, GeneratorDefinition>();
export function registerGenerator(definition: GeneratorDefinition): void {
  if (generatorRegistry.has(definition.name)) throw new Error(`Generador duplicado: ${definition.name}`);
  generatorRegistry.set(definition.name, definition);
}
const define = (name: GeneratorName, generate: GeneratorDefinition['generate']) => registerGenerator({ name, generate });

define('random', ([density = 0.5], { random }) =>
  Array.from({ length: 16 }, () => random() < density ? [hit()] : []));

define('riot', ([intensity = 0.5], { random, stepDuration }) => {
  const result = empty();
  // Syncopated groups; accents and bursts grow with intensity.
  let step = 0;
  while (step < 16) {
    result[step] = [hit(step % 4 === 0 ? 1 : 0.65 + random() * 0.3)];
    if (random() < intensity * 0.65) result[step].push(hit(0.55, stepDuration * 0.32));
    if (random() < intensity * 0.35) result[step].push(hit(0.4, stepDuration * 0.64));
    step += random() < intensity ? 1 + Math.floor(random() * 2) : 3 + Math.floor(random() * 3);
  }
  return result;
});

define('evolve', ([amount = 0.3], { previous, random }) => {
  const result = previous ? clone(previous) : Array.from({ length: 16 }, (_, i) => i % 4 === 0 ? [hit()] : []);
  // Mutate a bounded number of distinct steps, retaining >=75% at maximum.
  const mutations = Math.round(amount * 4);
  const positions = Array.from({ length: 16 }, (_, i) => i);
  for (let i = 0; i < mutations; i++) {
    const pick = i + Math.floor(random() * (16 - i));
    [positions[i], positions[pick]] = [positions[pick], positions[i]];
    const step = positions[i];
    result[step] = result[step].length ? [] : [hit(0.6 + random() * 0.35)];
  }
  return result;
});

define('minimal', ([density = 0.3], { random }) => {
  const result = empty();
  const count = Math.max(1, Math.round(density * 4));
  const rotation = Math.floor(random() * 4);
  for (let i = 0; i < count; i++) result[(rotation + Math.floor(i * 16 / count)) % 16] = [hit(i === 0 ? 0.9 : 0.65)];
  return result;
});

define('dense', ([density = 0.8], { random }) => {
  const result = Array.from({ length: 16 }, (_, i) => [hit(i % 4 === 0 ? 0.9 : 0.5 + random() * 0.25)]);
  const holes = Math.round((1 - density) * 8);
  const available = Array.from({ length: 12 }, (_, i) => i + 1 + Math.floor(i / 3));
  for (let i = 0; i < holes; i++) {
    const selected = Math.floor(random() * available.length);
    result[available.splice(selected, 1)[0]] = [];
  }
  return result;
});

define('human', ([amount = 0.5], { random, instrument, stepDuration }) => {
  const result = empty();
  const steps = instrument === 'snare' ? [4, 12] : instrument === 'kick' ? [0, 8] : [0, 2, 4, 6, 8, 10, 12, 14];
  // Positive offsets cannot be scheduled into the previous bar.
  for (const step of steps) result[step] = [hit(0.8 + (random() - 0.5) * 0.5 * amount, random() * Math.min(0.012, stepDuration * 0.12) * amount)];
  return result;
});

define('glitch', ([intensity = 0.8], { random, stepDuration }) => {
  const result = empty();
  for (let group = 0; group < 4; group++) {
    if (random() < intensity * 0.25) continue; // Hard cuts of entire fragments.
    const anchor = group * 4 + Math.floor(random() * 2);
    result[anchor] = [hit(0.95)];
    const repeats = Math.floor(intensity * 3);
    for (let i = 1; i <= repeats && anchor + i < (group + 1) * 4; i++) {
      result[anchor + i] = [hit(0.8 - i * 0.13)];
      if (random() < intensity) result[anchor + i].push(hit(0.42, stepDuration * 0.5));
    }
  }
  return result;
});

define('euclid', ([pulses = 4, steps = 16]) => {
  const result = empty();
  // Integer bucket distribution, rotated so a nonempty rhythm starts on beat 1.
  const n = Math.max(1, Math.min(16, Math.floor(steps)));
  const k = Math.max(0, Math.min(n, Math.floor(pulses)));
  for (let i = 0; i < 16; i++) if (k > 0 && (i % n * k) % n < k) result[i] = [hit(i % 4 === 0 ? 0.9 : 0.75)];
  return result;
});

export function generatePattern(spec: PatternSpec, context: GeneratorContext): GeneratedPattern {
  if (spec.type === 'literal') return Array.from({ length: 16 }, (_, index) => spec.value[index] === 'x' ? [hit()] : []);
  const definition = generatorRegistry.get(spec.name);
  if (!definition) throw new Error(`Generador desconocido: ${spec.name}`);
  const generated = definition.generate(spec.args, context);
  // A registered generator cannot flood the audio graph with unbounded events.
  return Array.from({ length: 16 }, (_, index) => (generated[index] ?? []).slice(0, 3).map(value => ({
    velocity: clamp(Number.isFinite(value.velocity) ? value.velocity : 0.8, 0, 1),
    offset: clamp(Number.isFinite(value.offset) ? value.offset : 0, 0, context.stepDuration * 0.8),
  })));
}

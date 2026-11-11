import { PARAMETER_LIMITS, SCALE_MODES, SYNTH_PRESETS } from './reference';
import { DEFAULT_PARAMS, LANGUAGE_VERSION, type Composition, type Diagnostic, type GeneratorName, type PatternSpec, type ScaleMode, type Track } from '../core/types';
import type { ProgramNode, SourceLocation, StatementNode } from './ast';

export interface GeneratorRule {
  arity: number;
  validate: (args: number[]) => string | undefined;
}
const intensityRule: GeneratorRule = {
  arity: 1,
  validate: ([intensity]) => !Number.isFinite(intensity) || intensity < 0 || intensity > 1 ? 'La intensidad debe estar entre 0 y 1.' : undefined,
};
export const GENERATOR_RULES: Record<GeneratorName, GeneratorRule> = {
  random: intensityRule, riot: intensityRule, evolve: intensityRule, minimal: intensityRule,
  dense: intensityRule, human: intensityRule, glitch: intensityRule,
  euclid: {
    arity: 2,
    validate: ([pulses, steps]) => steps !== 16 ? 'En M.O.N.O. 0.1, euclid usa exactamente 16 pasos.'
      : !Number.isInteger(pulses) || pulses < 0 || pulses > steps ? 'euclid necesita un número entero de golpes entre 0 y 16.' : undefined,
  },
};
export interface ValidationOptions { generators?: Record<string, GeneratorRule> }
const noteClasses: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function notePitchClass(note: string): number | undefined {
  const match = /^([A-G])([#b]?)[0-8]$/.exec(note);
  if (!match) return undefined;
  return (noteClasses[match[1]] + (match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0) + 12) % 12;
}
export function scalePitchClasses(scale: string): number[] | undefined {
  const match = /^([A-G])([#b]?)_(major|minor)$/.exec(scale);
  if (!match) return undefined;
  const root = (noteClasses[match[1]] + (match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0) + 12) % 12;
  const intervals = match[3] === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
  return intervals.map((value) => (value + root) % 12);
}

/** Nearest scale tones above and below, using explicit note names and octaves. */
export function nearestScaleNotes(note: string, allowed: readonly number[]): string[] {
  const match = /^([A-G])([#b]?)([0-8])$/.exec(note);
  if (!match || !allowed.length) return [];
  const pitch = Number(match[3]) * 12 + noteClasses[match[1]] + (match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0);
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return [-1, 1].flatMap(direction => {
    for (let distance = 1; distance <= 12; distance++) {
      const candidate = pitch + distance * direction;
      if (candidate < 0 || candidate > 107) break;
      if (allowed.includes(candidate % 12)) return [`${names[candidate % 12]}${Math.floor(candidate / 12)}`];
    }
    return [];
  });
}

export function validate(ast: ProgramNode, options: ValidationOptions = {}): { composition?: Composition; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const report = (location: SourceLocation, message: string, severity: Diagnostic['severity'] = 'error', suggestions?: string[]) => {
    const diagnostic: Diagnostic = { line: location.line, column: location.column, length: Math.max(1, location.length), message, severity, ...(suggestions ? { code: 'out-of-scale', suggestions } : {}) };
    if (diagnostics.length < 100) diagnostics.push(diagnostic);
    else if (severity === 'error') {
      for (let i = diagnostics.length - 1; i >= 0; i--) {
        if (diagnostics[i].severity === 'warning') { diagnostics[i] = diagnostic; break; }
      }
    }
  };
  const composition: Composition = { version: LANGUAGE_VERSION, bpm: 95, scale: 'D_minor', scaleMode: 'suggest', seed: 12345, tracks: [] };
  const globalNames = new Set<string>();
  for (const global of ast.globals) {
    if (globalNames.has(global.name)) report(global.location, `El comando global "${global.name}" está duplicado.`);
    globalNames.add(global.name);
    if (global.name === 'bpm') {
      const value = Number(global.value);
      if (!Number.isFinite(value) || value < 30 || value > 300) report(global.location, 'bpm debe estar entre 30 y 300.');
      else composition.bpm = value;
    } else if (global.name === 'seed') {
      const value = Number(global.value);
      if (!Number.isInteger(value) || value < 0 || value > 4294967295) report(global.location, 'seed debe ser un entero entre 0 y 4294967295.');
      else composition.seed = value;
    } else if (global.name === 'scale_mode') {
      const value = String(global.value);
      if (!SCALE_MODES.some(mode => mode.id === value)) report(global.location, 'scale_mode admite free, suggest o strict.');
      else composition.scaleMode = value as ScaleMode;
    } else {
      const value = String(global.value);
      if (!scalePitchClasses(value)) report(global.location, 'Escala inválida. Usa una raíz A–G, # o b opcional, y _major o _minor; por ejemplo D_minor.');
      else composition.scale = value;
    }
  }
  const allowedNotes = scalePitchClasses(composition.scale)!;
  const trackNames = new Set<string>();
  const generatorRules: Record<string, GeneratorRule> = { ...GENERATOR_RULES, ...options.generators };
  if (ast.tracks.length > 64) report(ast.tracks[64].location, 'La versión 0.1 admite hasta 64 pistas.');
  for (const node of ast.tracks) {
    if (!/^[A-Za-z_][A-Za-z0-9_-]{0,63}$/.test(node.name)) report(node.location, 'Nombre de pista inválido: usa hasta 64 letras, números, guiones o guiones bajos; no empieces con un número.');
    if (trackNames.has(node.name)) report(node.location, `Ya existe una pista llamada "${node.name}".`);
    trackNames.add(node.name);
    const statements = new Map<string, StatementNode>();
    for (const statement of node.statements) {
      if (statements.has(statement.name)) report(statement.location, `La instrucción "${statement.name}" está duplicada en "${node.name}".`);
      statements.set(statement.name, statement);
    }
    const kit = statements.get('kit');
    const synth = statements.get('synth');
    if (!kit && !synth) report(node.location, `La pista "${node.name}" necesita kit "nombre" o synth "preset".`);
    if (kit && synth) report(synth.location, 'Una pista debe declarar kit o synth, nunca ambos.');
    if (kit && !/^[A-Za-z0-9_-]{1,64}$/.test(String(kit.value))) report(kit.valueLocation, 'El kit debe ser un identificador local de hasta 64 caracteres (letras, números, _ y -).');
    if (synth && !SYNTH_PRESETS.some(preset => preset.id === String(synth.value))) report(synth.valueLocation, 'Preset desconocido. Usa sub, analog, fm o pad.');
    const track: Track = {
      id: node.name, kind: kit ? 'drums' : 'synth', instrument: String((kit ?? synth)?.value ?? ''),
      mute: statements.get('mute')?.value === true, solo: statements.get('solo')?.value === true,
      drums: {}, notes: [], arp: 'up', rate: 8, params: { ...DEFAULT_PARAMS },
    };
    for (const key of ['volume', 'cutoff', 'resonance', 'delay', 'reverb'] as const) {
      const statement = statements.get(key);
      if (!statement) continue;
      const value = Number(statement.value);
      const { min, max } = PARAMETER_LIMITS[key];
      if (!Number.isFinite(value) || value < min || value > max) report(statement.valueLocation, `${key} debe estar entre ${min} y ${max}.`);
      else track.params[key] = value;
    }
    const reserved = new Set(['kit', 'synth', 'volume', 'cutoff', 'resonance', 'delay', 'reverb', 'notes', 'pattern', 'arp', 'rate', 'mute', 'solo']);
    for (const [drum, statement] of statements) {
      if (reserved.has(drum)) continue;
      if (!kit) report(statement.location, `"${drum}" solo se admite en pistas con kit.`);
      const spec = statement.value as PatternSpec;
      if (spec.type === 'literal') {
        if (!/^[x.]{16}$/.test(spec.value)) report(statement.valueLocation, 'El patrón debe contener exactamente 16 pasos: x para golpe y . para silencio.');
      } else {
        const rule = Object.hasOwn(generatorRules, spec.name) ? generatorRules[spec.name] : undefined;
        if (!rule) report(statement.valueLocation, `Generador desconocido: "${spec.name}".`);
        else if (spec.args.length !== rule.arity) report(statement.valueLocation, `${spec.name} necesita ${rule.arity} argumento(s).`);
        else {
          const message = rule.validate(spec.args);
          if (message) report(statement.valueLocation, message);
        }
        if (spec.every !== undefined && (!Number.isInteger(spec.every) || spec.every < 1 || spec.every > 1024)) report(statement.valueLocation, 'every debe ser un entero entre 1 y 1024 compases.');
      }
      track.drums[drum] = spec;
    }
    if (kit && !Object.keys(track.drums).length) report(node.location, 'Una pista de batería necesita al menos un patrón de instrumento.');
    for (const name of ['notes', 'pattern', 'arp', 'rate']) {
      const statement = statements.get(name);
      if (kit && statement) report(statement.location, `"${name}" solo se admite en pistas con synth.`);
    }
    const notes = statements.get('notes');
    if (synth && !notes) report(node.location, 'Una pista de sintetizador necesita notes, por ejemplo notes D2 F2 A2.');
    if (notes) {
      track.notes = notes.value as string[];
      if (track.notes.length > 128) report(notes.valueLocation, 'Una pista admite hasta 128 notas.');
      for (const [index, note] of track.notes.entries()) {
        const location = notes.noteLocations?.[index] ?? notes.valueLocation;
        const pitchClass = notePitchClass(note);
        if (pitchClass === undefined) report(location, `Nota inválida: "${note}". Usa A–G, # o b opcional y octava 0–8.`);
        else if (composition.scaleMode !== 'free' && !allowedNotes.includes(pitchClass)) {
          const suggestions = nearestScaleNotes(note, allowedNotes);
          const alternatives = suggestions.length ? ` Alternativas cercanas: ${suggestions.join(', ')}.` : '';
          report(location, `La nota ${note} no pertenece a ${composition.scale}.${alternatives} La nota original se conserva.`, composition.scaleMode === 'strict' ? 'error' : 'warning', suggestions);
        }
      }
    }
    const pattern = statements.get('pattern');
    if (pattern) {
      track.pattern = String(pattern.value);
      if (!/^[x.]{16}$/.test(track.pattern)) report(pattern.valueLocation, 'El patrón debe contener exactamente 16 pasos: x y .');
      if (statements.has('arp') || statements.has('rate')) report(pattern.location, 'pattern ya define los pasos de 1/16. Usa pattern o arp/rate, sin combinarlos.');
    }
    const arp = statements.get('arp');
    if (arp) {
      if (!['up', 'down', 'updown', 'random'].includes(String(arp.value))) report(arp.valueLocation, 'arp admite up, down, updown o random.');
      else track.arp = arp.value as Track['arp'];
    }
    const rate = statements.get('rate');
    if (rate) {
      if (!['1/4', '1/8', '1/16'].includes(String(rate.value))) report(rate.valueLocation, 'rate admite 1/4, 1/8 o 1/16.');
      else track.rate = Number(String(rate.value).split('/')[1]) as Track['rate'];
    }
    composition.tracks.push(track);
  }
  return { ...(diagnostics.some(item => item.severity === 'error') ? {} : { composition }), diagnostics };
}

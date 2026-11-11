import { compile, lex } from '../language';
import { DEFAULT_PARAMS } from '../core/types';
import type { SynthPreset } from '../language/reference';

export interface SynthSettings {
  name: string; preset: SynthPreset; notes: string; arp: 'up' | 'down' | 'updown' | 'random'; rate: '1/4' | '1/8' | '1/16';
  cutoff: number; resonance: number; delay: number; reverb: number; volume: number;
}
export const DEFAULT_SYNTH_SETTINGS: SynthSettings = { name: 'instrument', preset: 'sub', notes: 'D2 F2 A2 C3', arp: 'up', rate: '1/8', ...DEFAULT_PARAMS };
export function buildSynthCode(settings: SynthSettings, context = ''): { code: string; errors: string[]; warnings: string[] } {
  const code = `track ${settings.name} {\n    synth "${settings.preset}"\n    notes ${settings.notes.trim()}\n    arp ${settings.arp}\n    rate ${settings.rate}\n    cutoff ${settings.cutoff}\n    resonance ${settings.resonance}\n    delay ${settings.delay}\n    reverb ${settings.reverb}\n    volume ${settings.volume}\n}`;
  const tokens = lex(context).tokens;
  const scaleTokens = tokens.filter((token, i) => token.text === 'scale' && tokens[i + 1]?.kind === 'identifier');
  const scaleToken = scaleTokens.length ? tokens[tokens.indexOf(scaleTokens[0]) + 1].text : 'D_minor';
  const modeTokens = tokens.filter((token, i) => token.text === 'scale_mode' && tokens[i + 1]?.kind === 'identifier');
  const mode = modeTokens.length ? tokens[tokens.indexOf(modeTokens[0]) + 1].text : 'suggest';
  const result = compile(`scale ${scaleToken}\nscale_mode ${mode}\n${code}`);
  const errors = result.diagnostics.filter(d => d.severity === 'error').map(d => d.message);
  const warnings = result.diagnostics.filter(d => d.severity === 'warning').map(d => d.message);
  if (tokens.some((token, i) => token.text === 'track' && tokens[i + 1]?.text === settings.name)) errors.push(`Ya existe una pista llamada "${settings.name}". Elige otro nombre.`);
  return { code, errors, warnings };
}
export function exampleForKit(id: string, instruments: Record<string, string[]>): string {
  const names = Object.keys(instruments).slice(0, 3);
  return `track ${/^[A-Za-z_]/.test(id) ? id : 'drums_' + id} {\n    kit "${id}"\n${names.map((name, i) => `    ${name} "${i === 0 ? 'x...x...x...x...' : i === 1 ? '....x.......x...' : 'x.x.x.x.x.x.x.x.'}"`).join('\n')}\n}`;
}

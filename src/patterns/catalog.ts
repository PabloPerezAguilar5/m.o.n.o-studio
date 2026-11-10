export interface RhythmPattern { id: string; name: string; instrument: string; style: string; sequence: string; custom?: boolean }
export const STYLES = ['Techno', 'House', 'Hip Hop', 'Trip Hop', 'Breakbeat', 'Glitch', 'Experimental'] as const;
export function validPattern(pattern: RhythmPattern): boolean {
  return !!pattern.id && !!pattern.name.trim() && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(pattern.instrument) && !!pattern.style.trim() && /^[x.]{16}$/.test(pattern.sequence);
}
const definitions: Array<[string, string, string, string]> = [
  ['Basic', 'kick', 'Hip Hop', 'x.......x.......'],
  ['Four on the floor', 'kick', 'Techno', 'x...x...x...x...'],
  ['Double', 'kick', 'House', 'x......xx...x...'],
  ['Basic', 'snare', 'Hip Hop', '....x.......x...'],
  ['Double', 'snare', 'Breakbeat', '....x...x...x...'],
  ['Basic', 'hat', 'House', 'x.x.x.x.x.x.x.x.'],
  ['Dense', 'hat', 'Techno', 'xxxxxxxxxxxxxxxx'],
  ['Breakbeat', 'kick', 'Breakbeat', 'x..x....x.x.....'],
  ['Dust', 'kick', 'Trip Hop', 'x.....x...x.....'],
  ['Fragment', 'perc', 'Glitch', 'x..xx......x..x.'],
  ['Offbeat', 'clap', 'House', '....x.......x...'],
  ['Ghost', 'rim', 'Trip Hop', '..x....x..x...x.'],
  ['Orbit', 'tom', 'Experimental', 'x.....x...x...x.'],
  ['Circuit', 'woodblock', 'Experimental', 'x..x..x..x..x...'],
];
export const BUILTIN_PATTERNS: RhythmPattern[] = definitions.map(([name, instrument, style, sequence], index) => ({ id: `builtin-${index}`, name, instrument, style, sequence }));
if (!BUILTIN_PATTERNS.every(validPattern)) throw new Error('Patrón integrado inválido.');

/** Content packages can supply their own validated patterns without touching the audio engine. */
export function patternSuggestions(instrument: string, prefix: string, patterns: readonly RhythmPattern[] = BUILTIN_PATTERNS): RhythmPattern[] {
  if (!/^[x.]{0,16}$/.test(prefix)) return [];
  const matches = patterns.filter(pattern => validPattern(pattern) && pattern.instrument === instrument && pattern.sequence.startsWith(prefix))
    .filter((pattern, index, all) => all.findIndex(other => other.sequence === pattern.sequence) === index);
  if (matches.length || !prefix.length) return matches;
  const period = Array.from({ length: prefix.length }, (_, i) => i + 1).find(size => [...prefix].every((step, i) => step === prefix[i % size]))!;
  const sequence = prefix.slice(0, period).repeat(Math.ceil(16 / period)).slice(0, 16);
  return [{ id: 'repeat', name: 'Repetición', instrument, style: 'Experimental', sequence }];
}

/** Decide the smallest edit for insertion at the saved cursor position. */
export function patternInsertion(line: string, column: number, pattern: RhythmPattern): { start: number; end: number; text: string } {
  if (!validPattern(pattern)) throw new Error('El patrón debe tener exactamente 16 pasos x o punto.');
  const instruction = `${pattern.instrument} "${pattern.sequence}"`;
  const match = /^(\s*)[A-Za-z_][\w]*\s+(?:"[x.]*"?|[A-Za-z_][\w]*\([^)]*\)(?:\s+every\s+\d+\s+bars?)?)(?=\s*(?:\/\/.*)?$)/.exec(line);
  if (match) return { start: match[1].length, end: match[0].length, text: instruction };
  const at = Math.max(0, Math.min(column - 1, line.length));
  return { start: at, end: at, text: instruction };
}

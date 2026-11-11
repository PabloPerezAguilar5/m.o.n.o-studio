import { DEFAULT_PARAMS, type PatternSpec, type Track } from '../core/types';
import { parse, validate } from '../language';
import type { StatementNode, TrackNode } from '../language/ast';

export interface SourceTrack { track: Track; patternEditable: boolean }

/** Locate only a complete, literal pattern in one unambiguous synth block. */
function patternStatement(lines: readonly string[], node: TrackNode): StatementNode | undefined {
  const synths = node.statements.filter(item => item.name === 'synth');
  const patterns = node.statements.filter(item => item.name === 'pattern');
  if (synths.length !== 1 || node.statements.some(item => item.name === 'kit') || patterns.length !== 1) return;
  const statement = patterns[0];
  if (typeof statement.value !== 'string' || !/^[x.]{16}$/.test(statement.value)) return;
  const loc = statement.valueLocation;
  const raw = lines[loc.line - 1]?.slice(loc.column - 1, loc.column - 1 + loc.length);
  if (raw !== `"${statement.value}"`) return;
  return statement;
}

/** Read the editor draft independently of the active audio composition. */
export function sourceTracks(source: string): SourceTrack[] {
  const { ast } = parse(source);
  const lines = source.split('\n');
  const counts = new Map<string, number>();
  for (const node of ast.tracks) counts.set(node.name, (counts.get(node.name) ?? 0) + 1);
  return ast.tracks.flatMap(node => {
    const synth = node.statements.find(item => item.name === 'synth');
    const kit = node.statements.find(item => item.name === 'kit');
    const instrument = synth ?? kit;
    if (!instrument || typeof instrument.value !== 'string') return [];
    const valid = validate({ type: 'Program', globals: [], tracks: [node] }).composition?.tracks[0];
    const notes = node.statements.find(item => item.name === 'notes');
    const fallback: Track = { id: node.name, kind: synth ? 'synth' : 'drums', instrument: instrument.value, drums: {}, notes: Array.isArray(notes?.value) ? notes.value : [], arp: 'up', rate: 8, params: { ...DEFAULT_PARAMS } };
    if (!valid) for (const statement of node.statements) {
      if (Object.hasOwn(fallback.params, statement.name) && typeof statement.value === 'number') fallback.params[statement.name as keyof Track['params']] = statement.value;
      if (statement.value && typeof statement.value === 'object' && !Array.isArray(statement.value) && 'type' in statement.value) fallback.drums[statement.name] = statement.value as PatternSpec;
    }
    const track = valid ?? fallback;
    // A stale active composition must never supply a missing or invalid draft pattern.
    const pattern = patternStatement(lines, node);
    track.pattern = pattern?.value as string | undefined;
    return [{ track, patternEditable: !!pattern && counts.get(node.name) === 1 }];
  });
}

export function stepEdit(source: string, trackId: string, step: number): { line: number; column: number; text: string } | undefined {
  if (!Number.isInteger(step) || step < 0 || step >= 16) return;
  const nodes = parse(source).ast.tracks.filter(node => node.name === trackId);
  if (nodes.length !== 1) return;
  const pattern = patternStatement(source.split('\n'), nodes[0]);
  if (!pattern || typeof pattern.value !== 'string') return;
  return { line: pattern.valueLocation.line, column: pattern.valueLocation.column + 1 + step, text: pattern.value[step] === 'x' ? '.' : 'x' };
}

/** Engine advances one note per hit and carries its index across bar boundaries. */
export function notesForSteps(pattern: string, notes: readonly string[], startIndex = 0): Array<string | undefined> {
  let index = startIndex;
  return [...pattern].map(step => step === 'x' && notes.length ? notes[index++ % notes.length] : undefined);
}

export function currentBarStart(pattern: string, step: number, noteIndex: number): number {
  const hits = [...pattern.slice(0, step + 1)].filter(value => value === 'x').length;
  return Math.max(0, noteIndex - hits);
}

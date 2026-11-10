import type { Composition, Track } from './types';
export const sameVoice = (a: Track, b: Track) => a.kind === b.kind && a.instrument === b.instrument;
const structure = ({ params: _params, mute: _mute, solo: _solo, ...rest }: Track) => JSON.stringify(rest);
export const sameStructure = (a: Track, b: Track) => structure(a) === structure(b);
export const sameParams = (a: Track, b: Track) => JSON.stringify(a.params) === JSON.stringify(b.params);
export interface CompositionDiff {
  added: string[];
  removed: string[];
  replaced: string[];
  patterns: string[];
  parameters: string[];
  unchanged: string[];
  seedChanged: boolean;
  bpmChanged: boolean;
  structural: boolean;
}
export function diffCompositions(previous: Composition | null, next: Composition): CompositionDiff {
  const before = new Map(previous?.tracks.map(track => [track.id, track]) ?? []);
  const after = new Map(next.tracks.map(track => [track.id, track]));
  const diff: CompositionDiff = {
    added: [], removed: [], replaced: [], patterns: [], parameters: [], unchanged: [],
    seedChanged: previous !== null && previous.seed !== next.seed,
    bpmChanged: previous?.bpm !== next.bpm, structural: false,
  };
  for (const track of next.tracks) {
    const old = before.get(track.id);
    if (!old) { diff.added.push(track.id); continue; }
    if (!sameVoice(old, track)) diff.replaced.push(track.id);
    else if (!sameStructure(old, track)) diff.patterns.push(track.id);
    else if (sameParams(old, track)) diff.unchanged.push(track.id);
    if (!sameParams(old, track)) diff.parameters.push(track.id);
  }
  for (const id of before.keys()) if (!after.has(id)) diff.removed.push(id);
  diff.structural = diff.seedChanged || diff.added.length + diff.removed.length + diff.replaced.length + diff.patterns.length > 0;
  return diff;
}

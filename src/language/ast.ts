import type { PatternSpec } from '../core/types';

export interface SourceLocation { line: number; column: number; length: number }
export interface GlobalNode {
  type: 'Global';
  name: 'bpm' | 'scale' | 'seed';
  value: string | number;
  location: SourceLocation;
}
export interface StatementNode {
  type: 'Statement';
  name: string;
  value: string | number | string[] | PatternSpec;
  location: SourceLocation;
  valueLocation: SourceLocation;
}
export interface TrackNode {
  type: 'Track';
  name: string;
  statements: StatementNode[];
  location: SourceLocation;
}
export interface ProgramNode {
  type: 'Program';
  globals: GlobalNode[];
  tracks: TrackNode[];
}

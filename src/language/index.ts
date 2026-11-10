import type { Composition, Diagnostic } from '../core/types';
import type { ProgramNode } from './ast';
import { parse } from './parser';
import { validate, type ValidationOptions } from './validator';

export interface CompileResult { composition?: Composition; diagnostics: Diagnostic[]; ast?: ProgramNode }
/** Compilation is pure: an invalid source never produces a replacement composition. */
export function compile(source: string, options: ValidationOptions = {}): CompileResult {
  if (source.length > 200_000) return {
    diagnostics: [{ line: 1, column: 1, length: 1, severity: 'error', message: 'El código supera el límite de 200 000 caracteres.' }],
  };
  const parsed = parse(source);
  if (parsed.diagnostics.length) return { ast: parsed.ast, diagnostics: parsed.diagnostics };
  return { ast: parsed.ast, ...validate(parsed.ast, options) };
}
export { lex } from './lexer';
export { parse } from './parser';
export { validate, GENERATOR_RULES, notePitchClass, scalePitchClasses } from './validator';
export type { ValidationOptions, GeneratorRule } from './validator';
export type { ProgramNode, TrackNode, StatementNode, GlobalNode, SourceLocation } from './ast';

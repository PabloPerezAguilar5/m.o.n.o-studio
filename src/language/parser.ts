import type { Diagnostic, GeneratorName, PatternSpec } from '../core/types';
import type { GlobalNode, ProgramNode, StatementNode, TrackNode } from './ast';
import { lex, type Token, type TokenKind } from './lexer';

const numericStatements = new Set(['volume', 'cutoff', 'resonance', 'delay', 'reverb']);
class ParseError extends Error {}

export interface ParseResult { ast: ProgramNode; diagnostics: Diagnostic[] }
export function parse(source: string): ParseResult {
  const { tokens, diagnostics } = lex(source);
  let cursor = 0;
  const current = () => tokens[cursor];
  const take = () => tokens[cursor++];
  const report = (token: Token, message: string): never => {
    if (diagnostics.length < 100) diagnostics.push({ line: token.line, column: token.column, length: token.length, message, severity: 'error' });
    throw new ParseError(message);
  };
  const expect = (kind: TokenKind, message: string) => current().kind === kind ? take() : report(current(), message);
  const identifier = () => expect('identifier', 'Se esperaba un identificador.');
  const number = () => Number(expect('number', 'Se esperaba un número.').text);
  const skipLines = () => { while (current().kind === 'newline') take(); };
  const finish = () => {
    if (!['newline', '}', 'eof'].includes(current().kind)) report(current(), 'Contenido inesperado. Escribe una instrucción por línea.');
    skipLines();
  };
  const recover = () => { while (!['newline', '}', 'eof'].includes(current().kind)) take(); skipLines(); };
  const pattern = (): PatternSpec => {
    if (current().kind === 'string') return { type: 'literal', value: take().text };
    const name = identifier();
    expect('(', 'Se esperaba "(" después del generador.');
    const args = [number()];
    while (current().kind === ',') { take(); args.push(number()); }
    expect(')', 'Se esperaba ")" al cerrar el generador.');
    let every: number | undefined;
    if (current().text === 'every') {
      take(); every = number();
      const unit = identifier();
      if (unit.text !== 'bar' && unit.text !== 'bars') report(unit, 'La regeneración usa "bar" o "bars".');
    }
    return { type: 'generator', name: name.text as GeneratorName, args, ...(every === undefined ? {} : { every }) };
  };
  const statement = (): StatementNode => {
    const name = identifier();
    const valueLocation = { ...current() };
    let value: StatementNode['value'];
    let noteLocations: StatementNode['noteLocations'];
    if (numericStatements.has(name.text)) value = number();
    else if (name.text === 'kit' || name.text === 'synth' || name.text === 'pattern') value = expect('string', `"${name.text}" necesita una cadena entre comillas dobles.`).text;
    else if (name.text === 'mute' || name.text === 'solo') {
      const token = identifier();
      if (token.text !== 'true' && token.text !== 'false') report(token, `${name.text} admite true o false.`);
      value = token.text === 'true';
    }
    else if (name.text === 'arp') value = identifier().text;
    else if (name.text === 'rate') {
      const numerator = number();
      expect('/', 'La duración se escribe como 1/4, 1/8 o 1/16.');
      const denominator = number();
      value = `${numerator}/${denominator}`;
    } else if (name.text === 'notes') {
      const notes: string[] = [];
      noteLocations = [];
      while (current().kind === 'identifier') { const note = take(); notes.push(note.text); noteLocations.push(note); }
      if (!notes.length) report(current(), 'Declara al menos una nota, por ejemplo D2 F2 A2.');
      value = notes;
    } else value = pattern();
    finish();
    return { type: 'Statement', name: name.text, value: value!, location: name, valueLocation, ...(noteLocations ? { noteLocations } : {}) };
  };
  const track = (): TrackNode => {
    const token = take();
    const name = identifier();
    expect('{', 'Se esperaba "{" para abrir la pista.');
    skipLines();
    const statements: StatementNode[] = [];
    while (current().kind !== '}' && current().kind !== 'eof') {
      try { statements.push(statement()); }
      catch (error) { if (!(error instanceof ParseError)) throw error; recover(); }
    }
    expect('}', `Falta "}" para cerrar la pista "${name.text}".`);
    finish();
    return { type: 'Track', name: name.text, statements, location: { ...token, length: name.column + name.length - token.column } };
  };
  const ast: ProgramNode = { type: 'Program', globals: [], tracks: [] };
  skipLines();
  while (current().kind !== 'eof') {
    try {
      if (current().text === 'track') ast.tracks.push(track());
      else {
        const name = identifier();
        if (!['bpm', 'scale', 'scale_mode', 'seed'].includes(name.text)) report(name, `Comando global desconocido: "${name.text}". Usa bpm, scale, scale_mode, seed o track.`);
        const value = name.text === 'scale' || name.text === 'scale_mode' ? identifier().text : number();
        finish();
        ast.globals.push({ type: 'Global', name: name.text as GlobalNode['name'], value, location: name });
      }
    } catch (error) {
      if (!(error instanceof ParseError)) throw error;
      recover();
      // A stray closing brace must be consumed to guarantee forward progress.
      if (current().kind === '}') take();
      skipLines();
    }
  }
  return { ast, diagnostics };
}

import type { Diagnostic } from '../core/types';
import type { SourceLocation } from './ast';

export type TokenKind = 'identifier' | 'number' | 'string' | 'newline' | 'eof' | '{' | '}' | '(' | ')' | ',' | '/';
export interface Token extends SourceLocation { kind: TokenKind; text: string }
export interface LexResult { tokens: Token[]; diagnostics: Diagnostic[] }

/** A bounded, character-by-character lexer. User code is always data. */
export function lex(source: string): LexResult {
  const tokens: Token[] = [];
  const diagnostics: Diagnostic[] = [];
  let offset = 0;
  let line = 1;
  let column = 1;
  const advance = () => { const char = source[offset++]; column++; return char; };
  const error = (message: string, startColumn = column, length = 1) => {
    if (diagnostics.length < 100) diagnostics.push({ line, column: startColumn, length, message, severity: 'error' });
  };
  while (offset < source.length) {
    const char = source[offset];
    if (char === ' ' || char === '\t' || char === '\r') { advance(); continue; }
    if (char === '\n') {
      tokens.push({ kind: 'newline', text: '\n', line, column, length: 1 });
      offset++; line++; column = 1; continue;
    }
    if (char === '/' && source[offset + 1] === '/') {
      while (offset < source.length && source[offset] !== '\n') advance();
      continue;
    }
    const start = offset;
    const startColumn = column;
    if (char === '"') {
      advance();
      let value = '';
      while (offset < source.length && source[offset] !== '"' && source[offset] !== '\n') {
        const next = advance();
        if (next === '\\') {
          const escaped = source[offset];
          if (escaped === '"' || escaped === '\\') value += advance();
          else { error('Escape inválido. Solo se admiten \\" y \\\\.', column - 1); }
        } else value += next;
      }
      if (source[offset] !== '"') error('Cadena sin cerrar: falta la comilla doble.', startColumn, Math.max(1, offset - start));
      else advance();
      tokens.push({ kind: 'string', text: value, line, column: startColumn, length: offset - start });
      continue;
    }
    if (/[0-9]/.test(char) || (char === '-' && /[0-9]/.test(source[offset + 1] ?? ''))) {
      advance();
      while (offset < source.length && /[0-9]/.test(source[offset])) advance();
      if (source[offset] === '.') {
        advance();
        if (!/[0-9]/.test(source[offset] ?? '')) error('Se esperaba un dígito después del punto decimal.', column - 1);
        while (offset < source.length && /[0-9]/.test(source[offset])) advance();
      }
      tokens.push({ kind: 'number', text: source.slice(start, offset), line, column: startColumn, length: offset - start });
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      advance();
      while (offset < source.length && /[A-Za-z0-9_#-]/.test(source[offset])) advance();
      tokens.push({ kind: 'identifier', text: source.slice(start, offset), line, column: startColumn, length: offset - start });
      continue;
    }
    if ('{}(),/'.includes(char)) {
      tokens.push({ kind: char as TokenKind, text: char, line, column, length: 1 });
      advance(); continue;
    }
    error(`Carácter no reconocido: ${JSON.stringify(char)}.`);
    advance();
  }
  tokens.push({ kind: 'eof', text: '', line, column, length: 1 });
  return { tokens, diagnostics };
}

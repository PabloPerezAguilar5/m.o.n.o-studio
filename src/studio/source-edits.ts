import { lex, type Token } from '../language/lexer';

/** Change exactly one declaration in the named block without parsing the rest of the draft. */
export function setTrackFlag(source: string, trackId: string, flag: 'mute' | 'solo', value: boolean): string | undefined {
  const { tokens } = lex(source);
  const lines = source.split('\n');
  const starts: number[] = []; let offset = 0;
  for (const line of lines) { starts.push(offset); offset += line.length + 1; }
  const at = (token: Token) => starts[token.line - 1] + token.column - 1;
  const blocks: Array<{ start: number; end: number }> = [];
  for (let i = 0; i < tokens.length - 2; i++) {
    if (tokens[i].text !== 'track' || tokens[i + 1].text !== trackId || tokens[i + 2].kind !== '{') continue;
    let depth = 1; let end = i + 3;
    for (; end < tokens.length && depth; end++) { if (tokens[end].kind === '{') depth++; if (tokens[end].kind === '}') depth--; }
    if (!depth) blocks.push({ start: i + 2, end: end - 1 });
  }
  if (blocks.length !== 1) return undefined;
  const { start, end } = blocks[0];
  const found: number[] = [];
  for (let i = start + 1; i < end; i++) if (tokens[i].kind === 'identifier' && tokens[i].text === flag && (tokens[i - 1].kind === 'newline' || i === start + 1)) found.push(i);
  if (found.length > 1) return undefined;
  if (found.length) {
    const token = tokens[found[0] + 1];
    if (!token || !['true', 'false'].includes(token.text)) return undefined;
    return source.slice(0, at(token)) + value + source.slice(at(token) + token.length);
  }
  const brace = tokens[start];
  const indentation = /^\s*/.exec(lines[brace.line - 1])?.[0] ?? '';
  const point = at(brace) + 1;
  return source.slice(0, point) + `\n${indentation}    ${flag} ${value}` + source.slice(point);
}

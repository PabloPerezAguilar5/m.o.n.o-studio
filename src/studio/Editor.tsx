import { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import 'monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestController.js';
import 'monaco-editor/esm/vs/editor/contrib/hover/browser/hoverContribution.js';
import 'monaco-editor/esm/vs/editor/contrib/bracketMatching/browser/bracketMatching.js';
import 'monaco-editor/esm/vs/editor/contrib/comment/browser/comment.js';
import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController.js';
import 'monaco-editor/esm/vs/editor/contrib/snippet/browser/snippetController2.js';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker.js?worker';
import type { Diagnostic } from '../core/types';
import type { KitDefinition } from '../audio/samples';
import { BUILTIN_PATTERNS, patternSuggestions, patternInsertion, type RhythmPattern } from '../patterns/catalog';
let availableKits: KitDefinition[] = [];
let availablePatterns: RhythmPattern[] = BUILTIN_PATTERNS;

(self as typeof self & { MonacoEnvironment: { getWorker(): Worker } }).MonacoEnvironment = { getWorker: () => new EditorWorker() };
monaco.languages.register({ id: 'mono' });
monaco.languages.setMonarchTokensProvider('mono', {
  tokenizer: { root: [
    [/\/\/.*$/, 'comment'],
    [/"[^"]*"/, 'string'],
    [/\b(track|bpm|scale|seed|kit|synth|notes|pattern|arp|rate|cutoff|resonance|volume|delay|reverb|mute|solo)\b/, 'keyword'],
    [/\b(random|riot|evolve|minimal|dense|human|glitch|euclid|every|bar|bars|up|down|updown|true|false)\b/, 'type'],
    [/\b[A-G][#b]?[0-8]\b/, 'number.note'],
    [/\b\d+(\.\d+)?\b/, 'number'],
    [/[{}()]/, '@brackets'],
    [/[a-zA-Z_][\w#]*/, 'identifier'],
  ] },
});
monaco.languages.setLanguageConfiguration('mono', {
  comments: { lineComment: '//' }, brackets: [['{', '}'], ['(', ')']],
  autoClosingPairs: [{ open: '{', close: '}' }, { open: '(', close: ')' }, { open: '"', close: '"' }],
});
monaco.editor.defineTheme('mono-phosphor', { base: 'vs-dark', inherit: true, rules: [
  { token: 'comment', foreground: '627272' }, { token: 'keyword', foreground: 'C0F58B' },
  { token: 'string', foreground: 'A2D6CE' }, { token: 'number', foreground: 'E9BCFF' },
  { token: 'number.note', foreground: 'E9BCFF' }, { token: 'type', foreground: 'E7C58C' },
  { token: 'identifier', foreground: 'D1D8D5' },
], colors: {
  'editor.background': '#0C1011', 'editor.foreground': '#D1D8D5', 'editorLineNumber.foreground': '#465251',
  'editorLineNumber.activeForeground': '#BDF784', 'editor.lineHighlightBackground': '#131A19',
  'editorCursor.foreground': '#C1FF72', 'editor.selectionBackground': '#304533',
  'editor.inactiveSelectionBackground': '#22342A', 'editorIndentGuide.background1': '#1D2826',
  'editorWidget.background': '#141C1B', 'editorWidget.border': '#33443B', 'focusBorder': '#91BB65',
} });
const snippets: Record<string, string> = {
  track: 'track ${1:signal} {\n    synth "${2:analog}"\n    notes ${3:D4 F4 A4 C5}\n    arp up\n    rate 1/8\n    volume 0.4\n}',
  drums: 'track ${1:drums} {\n    kit "trip"\n    kick "x...x...x...x..."\n    snare "....x.......x..."\n    hat euclid(7,16)\n}',
  random: 'random(${1:0.5})', riot: 'riot(${1:0.6})', evolve: 'evolve(${1:0.3}) every 1 bar',
  minimal: 'minimal(${1:0.3})', dense: 'dense(${1:0.8})', human: 'human(${1:0.5})', glitch: 'glitch(${1:0.7})', euclid: 'euclid(${1:5},16)',
};
monaco.languages.registerCompletionItemProvider('mono', { triggerCharacters: ['"', 'x', '.'], provideCompletionItems: (model, position) => {
  const word = model.getWordUntilPosition(position);
  const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn };
  const keywords = ['bpm', 'scale', 'seed', 'synth', 'kit', 'notes', 'pattern', 'arp', 'rate', 'cutoff', 'resonance', 'volume', 'delay', 'reverb', 'kick', 'snare', 'hat', 'mute', 'solo', 'true', 'false'];
  const before = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
  const partial = /^\s*([A-Za-z_][\w]*)\s+"([x.]*)$/.exec(before);
  const after = model.getLineContent(position.lineNumber).slice(position.column - 1);
  if (partial && !['kit', 'synth', 'pattern'].includes(partial[1]) && /^"?(?:\s*(?:\/\/.*)?)$/.test(after)) {
    const patternRange = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: position.column - partial[2].length, endColumn: position.column + (after.startsWith('"') ? 1 : 0) };
    return { suggestions: patternSuggestions(partial[1], partial[2], availablePatterns).map((pattern, index) => ({
      label: { label: pattern.name, description: `${pattern.style} · ${pattern.sequence}` },
      kind: monaco.languages.CompletionItemKind.Value, range: patternRange,
      insertText: pattern.sequence + '"', filterText: pattern.sequence, sortText: String(index).padStart(3, '0'),
    })) };
  }
  const kitContext = /\bkit\s+"[^"]*$/.test(before);
  const kitId = [...model.getValue().slice(0, model.getOffsetAt(position)).matchAll(/\bkit\s+"([^"]+)"/g)].at(-1)?.[1];
  const instruments = availableKits.find(kit => kit.id === kitId)?.instruments;
  if (kitContext) return { suggestions: availableKits.map(kit => ({ label: kit.id, insertText: kit.id, range, kind: monaco.languages.CompletionItemKind.Value })) };
  return { suggestions: [
    ...Object.keys(instruments ?? {}).map(label => ({ label, insertText: label, range, kind: monaco.languages.CompletionItemKind.Field })),
    ...Object.entries(snippets).map(([label, insertText]) => ({ label, insertText, range, kind: monaco.languages.CompletionItemKind.Snippet, insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet })),
    ...keywords.map((label) => ({ label, insertText: label, range, kind: monaco.languages.CompletionItemKind.Keyword })),
  ] };
} });

interface Props { patterns: RhythmPattern[]; insertPattern: RhythmPattern | null; onPatternInserted(): void; kits: KitDefinition[]; value: string; diagnostics: Diagnostic[]; onChange(value: string): void; onApply(): void; onPosition(line: number, column: number): void }
export function Editor({ patterns, insertPattern, onPatternInserted, kits, value, diagnostics, onChange, onApply, onPosition }: Props) {
  availableKits = kits;
  availablePatterns = [...BUILTIN_PATTERNS, ...patterns];
  const container = useRef<HTMLDivElement>(null);
  const instance = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const callbacks = useRef({ onChange, onApply, onPosition });
  callbacks.current = { onChange, onApply, onPosition };
  useEffect(() => {
    const model = monaco.editor.createModel(value, 'mono');
    const editor = monaco.editor.create(container.current!, {
      model, theme: 'mono-phosphor', fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
      fontSize: 14, lineHeight: 25, fontLigatures: false, minimap: { enabled: false },
      padding: { top: 24, bottom: 32 }, lineNumbersMinChars: 4, scrollBeyondLastLine: false,
      automaticLayout: true, tabSize: 4, quickSuggestions: { other: true, comments: false, strings: true }, renderLineHighlight: 'line', overviewRulerBorder: false,
      scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 }, bracketPairColorization: { enabled: false },
      ariaLabel: 'Editor de código M.O.N.O.', wordWrap: 'off',
    });
    instance.current = editor;
    const changes = editor.onDidChangeModelContent(() => callbacks.current.onChange(editor.getValue()));
    const position = editor.onDidChangeCursorPosition(({ position }) => callbacks.current.onPosition(position.lineNumber, position.column));
    editor.addAction({ id: 'mono.apply', label: 'M.O.N.O.: aplicar cambios', keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter], run: () => callbacks.current.onApply() });
    return () => { changes.dispose(); position.dispose(); editor.dispose(); model.dispose(); instance.current = null; };
  // Monaco owns its model; prop changes are synchronized separately.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const editor = instance.current; const model = editor?.getModel();
    if (!editor || !model) return;
    const previous = model.getValue();
    if (previous === value) return;
    let start = 0; let end = 0;
    while (start < previous.length && start < value.length && previous[start] === value[start]) start++;
    while (end < previous.length - start && end < value.length - start && previous[previous.length - 1 - end] === value[value.length - 1 - end]) end++;
    const from = model.getPositionAt(start); const to = model.getPositionAt(previous.length - end);
    editor.executeEdits('external-update', [{ range: new monaco.Range(from.lineNumber, from.column, to.lineNumber, to.column), text: value.slice(start, value.length - end) }]);
  }, [value]);
  useEffect(() => {
    const editor = instance.current; const model = editor?.getModel(); const position = editor?.getPosition();
    if (!insertPattern || !editor || !model || !position) return;
    const edit = patternInsertion(model.getLineContent(position.lineNumber), position.column, insertPattern);
    editor.executeEdits('pattern-library', [{ range: new monaco.Range(position.lineNumber, edit.start + 1, position.lineNumber, edit.end + 1), text: edit.text }]);
    editor.setPosition({ lineNumber: position.lineNumber, column: edit.start + edit.text.length + 1 });
    editor.focus(); onPatternInserted();
  }, [insertPattern, onPatternInserted]);
  useEffect(() => {
    const model = instance.current?.getModel();
    if (model) monaco.editor.setModelMarkers(model, 'mono', diagnostics.map((d) => ({ startLineNumber: d.line, endLineNumber: d.line, startColumn: d.column, endColumn: d.column + Math.max(1, d.length), message: d.message, severity: d.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning })));
  }, [diagnostics]);
  return <div className="editor-host" ref={container} />;
}

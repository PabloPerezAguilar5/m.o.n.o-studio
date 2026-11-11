import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import 'monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestController.js';
import 'monaco-editor/esm/vs/editor/contrib/codeAction/browser/codeActionContributions.js';
import 'monaco-editor/esm/vs/editor/contrib/hover/browser/hoverContribution.js';
import 'monaco-editor/esm/vs/editor/contrib/bracketMatching/browser/bracketMatching.js';
import 'monaco-editor/esm/vs/editor/contrib/comment/browser/comment.js';
import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController.js';
import 'monaco-editor/esm/vs/editor/contrib/snippet/browser/snippetController2.js';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker.js?worker';
import type { Diagnostic } from '../core/types';
import type { KitDefinition } from '../audio/samples';
import { BUILTIN_PATTERNS, patternSuggestions, patternInsertion, type RhythmPattern } from '../patterns/catalog';
import { LANGUAGE_REFERENCE, SCALE_MODES, SYNTH_PRESETS, referenceFor } from '../language/reference';
import { compile } from '../language';
import { stepEdit } from './pattern-sequencer';
let availableKits: KitDefinition[] = [];
let availablePatterns: RhythmPattern[] = BUILTIN_PATTERNS;

(self as typeof self & { MonacoEnvironment: { getWorker(): Worker } }).MonacoEnvironment = { getWorker: () => new EditorWorker() };
monaco.languages.register({ id: 'mono' });
monaco.languages.setMonarchTokensProvider('mono', {
  tokenizer: { root: [
    [/\/\/.*$/, 'comment'],
    [/"[^"]*"/, 'string'],
    [/\b(track|bpm|scale|scale_mode|seed|kit|synth|notes|pattern|arp|rate|cutoff|resonance|volume|delay|reverb|mute|solo)\b/, 'keyword'],
    [/\b(random|riot|evolve|minimal|dense|human|glitch|euclid|every|bar|bars|up|down|updown|true|false|free|suggest|strict)\b/, 'type'],
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
monaco.languages.registerCompletionItemProvider('mono', { triggerCharacters: ['"', 'x', '.', ' '], provideCompletionItems: (model, position, context) => {
  const word = model.getWordUntilPosition(position);
  const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn };
  const before = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
  if (/^\s*scale_mode\s+[a-z]*$/.test(before)) return { suggestions: SCALE_MODES.map(mode => ({ label: mode.id, insertText: mode.id, detail: mode.description, documentation: mode.description, range, kind: monaco.languages.CompletionItemKind.Value })) };
  if (context.triggerCharacter === ' ') return { suggestions: [] };
  const synthContext = /\bsynth\s+"[a-z]*$/.test(before);
  if (synthContext) {
    const after = model.getLineContent(position.lineNumber).slice(position.column - 1);
    return { suggestions: SYNTH_PRESETS.map(preset => ({ label: preset.id, detail: preset.type, documentation: `${preset.sound} ${preset.uses}`, insertText: preset.id + (after.startsWith('"') ? '' : '"'), range, kind: monaco.languages.CompletionItemKind.Value })) };
  }
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
    ...Object.entries(snippets).map(([label, insertText]) => ({ label, insertText, range, detail: referenceFor(label)?.values, documentation: referenceFor(label)?.description, kind: monaco.languages.CompletionItemKind.Snippet, insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet })),
    ...LANGUAGE_REFERENCE.filter(item => item.name !== 'instrumento de batería' && item.name !== 'every').map(item => ({ label: item.name, insertText: item.name, detail: item.values, documentation: item.description, range, kind: monaco.languages.CompletionItemKind.Keyword })),
    ...['true', 'false'].map(label => ({ label, insertText: label, range, kind: monaco.languages.CompletionItemKind.Value })),
  ] };
} });
monaco.languages.registerCodeActionProvider('mono', {
  provideCodeActions: (model, range) => {
    const diagnostics = compile(model.getValue()).diagnostics.filter(d => d.code === 'out-of-scale' && d.suggestions?.length && d.line >= range.startLineNumber && d.line <= range.endLineNumber && (d.line !== range.startLineNumber || d.column + d.length >= range.startColumn) && (d.line !== range.endLineNumber || d.column <= range.endColumn));
    return { actions: diagnostics.flatMap(d => (d.suggestions ?? []).map(note => ({
      title: `Cambiar a ${note}`, kind: 'quickfix',
      edit: { edits: [{ resource: model.uri, versionId: model.getVersionId(), textEdit: { range: new monaco.Range(d.line, d.column, d.line, d.column + d.length), text: note } }] },
    }))), dispose() {} };
  },
}, { providedCodeActionKinds: ['quickfix'] });
monaco.languages.registerHoverProvider('mono', { provideHover: (model, position) => {
  const word = model.getWordAtPosition(position);
  if (!word) return;
  const prefix = model.getLineContent(position.lineNumber).slice(0, word.startColumn - 1);
  if (/\bkit\s+"$/.test(prefix)) {
    const kit = availableKits.find(value => value.id === word.word);
    if (kit) return { contents: [{ value: `**Kit ${kit.id}** · ${Object.keys(kit.instruments).join(', ')}` }] };
  }
  if (/\bsynth\s+"$/.test(prefix)) {
    const preset = SYNTH_PRESETS.find(value => value.id === word.word);
    if (preset) return { contents: [{ value: `**${preset.id}** · ${preset.type}` }, { value: `${preset.sound} ${preset.uses}` }] };
  }
  const item = referenceFor(word.word === 'random' && /\barp\s+$/.test(prefix) ? 'arp' : word.word);
  if (!item) return;
  return { range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn), contents: [
    { value: `**${item.name}** · ${item.category}` }, { value: item.description },
    { value: `**Valores:** ${item.values}  \n**Si se omite:** ${item.defaultValue}` },
    { value: `Ejemplo: \`${item.example.replaceAll('\n', ' ')}\`` },
  ] };
} });

interface Props { insertCode: { text: string; placement: 'cursor' | 'end' } | null; onCodeInserted(): void; patterns: RhythmPattern[]; insertPattern: RhythmPattern | null; onPatternInserted(): void; kits: KitDefinition[]; value: string; diagnostics: Diagnostic[]; onChange(value: string): void; onApply(): void; onPosition(line: number, column: number): void }
export interface EditorHandle { toggleStep(trackId: string, step: number): boolean; undo(): void }
export const Editor = forwardRef<EditorHandle, Props>(function Editor({ insertCode, onCodeInserted, patterns, insertPattern, onPatternInserted, kits, value, diagnostics, onChange, onApply, onPosition }, ref) {
  availableKits = kits;
  availablePatterns = [...BUILTIN_PATTERNS, ...patterns];
  const container = useRef<HTMLDivElement>(null);
  const instance = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  useImperativeHandle(ref, () => ({
    toggleStep(trackId, step) {
      const editor = instance.current; const model = editor?.getModel();
      if (!editor || !model) return false;
      const edit = stepEdit(model.getValue(), trackId, step);
      if (!edit) return false;
      editor.pushUndoStop();
      editor.executeEdits('visual-sequencer', [{ range: new monaco.Range(edit.line, edit.column, edit.line, edit.column + 1), text: edit.text }]);
      editor.pushUndoStop();
      return true;
    },
    undo() { instance.current?.trigger('visual-sequencer', 'undo', null); },
  }), []);
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
    const editor = instance.current; const model = editor?.getModel();
    if (!insertCode || !editor || !model) return;
    const end = model.getFullModelRange().getEndPosition();
    const position = insertCode.placement === 'end' ? end : editor.getPosition() ?? end;
    const text = insertCode.placement === 'end' ? `${model.getValue().trim() ? '\n\n' : ''}${insertCode.text}\n` : insertCode.text;
    const range = new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column);
    const offset = model.getOffsetAt(position);
    editor.pushUndoStop();
    editor.executeEdits('mono-reference', [{ range, text, forceMoveMarkers: true }]);
    const destination = model.getPositionAt(offset + (insertCode.placement === 'end' ? text.search(/\S|$/) : text.length));
    editor.setPosition(destination); editor.revealPositionInCenter(destination);
    editor.pushUndoStop(); editor.focus(); onCodeInserted();
  }, [insertCode, onCodeInserted]);
  useEffect(() => {
    const model = instance.current?.getModel();
    if (model) monaco.editor.setModelMarkers(model, 'mono', diagnostics.map((d) => ({ startLineNumber: d.line, endLineNumber: d.line, startColumn: d.column, endColumn: d.column + Math.max(1, d.length), message: d.message, severity: d.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning })));
  }, [diagnostics]);
  return <div className="editor-host" ref={container} />;
});

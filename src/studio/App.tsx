import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Activity, ArrowDownToLine, ArrowUpFromLine, AudioLines, BookOpen, Check, ChevronRight, CircleHelp, Code2, Disc3, FolderOpen, Headphones, Layers3, Play, Plus, Radio, RotateCw, Save, Square, Terminal, Trash2, Volume2, X } from 'lucide-react';
import { ToneBackend, parseKitManifest, type KitDefinition } from '../audio';
import { LiveEngine } from '../core';
import { LANGUAGE_VERSION, type Composition, type Track } from '../core/types';
import { compile } from '../language';
import { IndexedDbProjects, exportMono, type Project } from '../storage/projects';
import { EXAMPLES } from './examples';
import { useStudio } from './store';
import { Waveform } from './Waveform';
import { setTrackFlag } from './source-edits';
import { PatternLibrary } from './PatternLibrary';
import { ReferencePanel } from './ReferencePanel';
import { PatternStorage } from '../patterns/storage';
import type { RhythmPattern } from '../patterns/catalog';
import type { EditorHandle } from './Editor';
import { currentBarStart, notesForSteps, sourceTracks } from './pattern-sequencer';

const Editor = lazy(() => import('./Editor').then((m) => ({ default: m.Editor })));
const storage = new IndexedDbProjects();
const patternStorage = new PatternStorage();
const pad = (n: number) => String(n).padStart(2, '0');

function TrackCard({ track, index, playing, muted, solo, active, editable, step, bar, noteIndex, activeTrack, onStep, onUndo, onMute, onSolo }: { track: Track; index: number; playing: boolean; muted: boolean; solo: boolean; active: boolean; editable: boolean; step: number; bar: number; noteIndex?: number; activeTrack?: Track; onStep(step: number): void; onUndo(): void; onMute(): void; onSolo(): void }) {
  const followsAudio = !!(playing && bar && activeTrack?.kind === 'synth' && track.pattern && activeTrack.pattern === track.pattern && activeTrack.notes.length === track.notes.length && activeTrack.notes.every((note, i) => note === track.notes[i]) && noteIndex !== undefined);
  const barStart = followsAudio ? currentBarStart(track.pattern!, step, noteIndex!) : 0;
  const stepNotes = track.pattern ? notesForSteps(track.pattern, track.notes, barStart) : [];
  return <article className={`track-card accent-${index % 3} ${muted ? 'is-muted' : ''}`}>
    <div className="track-top"><span className="track-number">{pad(index + 1)}</span><div className="track-name"><strong>{track.id}</strong><span>{track.kind === 'drums' ? 'SAMPLE KIT' : 'SYNTHESIZER'} / {track.instrument.toUpperCase()}</span></div><span className={`status-dot ${playing && !muted ? 'on' : ''}`} /></div>
    <div className="track-notes">{track.kind === 'drums' ? Object.entries(track.drums).map(([name, spec]) => <span key={name}>{name} <em>{spec.type === 'literal' ? spec.value : `${spec.name}(${spec.args.join(',')})`}</em></span>) : <><span className="note-list">{track.notes.join('  ')}</span><span>{track.pattern ? 'PATTERN / 16 STEPS' : `${track.arp.toUpperCase()} / 1/${track.rate}`}</span></>}</div>
    {track.kind === 'synth' && track.pattern && <div className="visual-sequencer" role="group" aria-label={`Secuenciador ${track.id}`}>
      <div className="sequencer-caption"><span>{followsAudio ? 'NOTAS / COMPÁS ACTUAL' : 'NOTAS / PRIMERA VUELTA'}</span><span>01 — 16</span></div>
      <div className="sequencer-steps">{Array.from({ length: 4 }, (_, group) => <div className="sequencer-group" key={group}>{Array.from({ length: 4 }, (_, position) => {
        const i = group * 4 + position; const hit = track.pattern![i] === 'x'; const current = playing && bar > 0 && step === i;
        return <div className="sequencer-cell" key={i}><button type="button" className={`sequencer-step ${hit ? 'is-on' : 'is-off'} ${current ? 'is-current' : ''}`} aria-label={`Paso ${i + 1} ${track.id}`} aria-pressed={hit} aria-current={current ? 'step' : undefined} disabled={!editable} title={`${hit ? 'Activo' : 'Silencio'}${stepNotes[i] ? ` · ${stepNotes[i]}` : ''}`} onClick={() => onStep(i)} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'z') { event.preventDefault(); event.stopPropagation(); onUndo(); } }} /><span className="sequencer-note" aria-hidden="true">{stepNotes[i] ?? '\u00a0'}</span></div>;
      })}</div>)}</div>
    </div>}
    <div className="track-bottom"><span>LPF <b>{track.params.cutoff >= 1000 ? `${(track.params.cutoff / 1000).toFixed(1)}k` : track.params.cutoff}</b> Hz</span><div><button className={muted ? 'selected' : ''} disabled={!active} onClick={onMute} aria-pressed={muted} aria-label={`Mute ${track.id}`}>M</button><button className={solo ? 'solo selected' : ''} disabled={!active} onClick={onSolo} aria-pressed={solo} aria-label={`Solo ${track.id}`}>S</button></div></div>
  </article>;
}

export function App() {
  const [backend] = useState(() => new ToneBackend());
  const [engine] = useState(() => new LiveEngine(backend));
  const subscribe = useCallback((listener: () => void) => {
    let frame = 0;
    const unsubscribe = engine.subscribe(() => {
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; listener(); });
    });
    return () => { unsubscribe(); cancelAnimationFrame(frame); };
  }, [engine]);
  const snapshot = useSyncExternalStore(subscribe, () => engine.getSnapshot());
  const studio = useStudio();
  const [draftComposition, setDraftComposition] = useState<Composition | undefined>(() => compile(studio.code).composition);
  const [busy, setBusy] = useState(false);
  const [patternsOpen, setPatternsOpen] = useState(false);
  const [referenceOpen, setReferenceOpen] = useState(false);
  const [insertCode, setInsertCode] = useState<{ text: string; placement: 'cursor' | 'end' } | null>(null);
  const onCodeInserted = useCallback(() => setInsertCode(null), []);
  const closeReference = useCallback(() => setReferenceOpen(false), []);
  const insertReference = useCallback((text: string, placement: 'cursor' | 'end') => setInsertCode({ text, placement }), []);
  const [customPatterns, setCustomPatterns] = useState<RhythmPattern[]>([]);
  const [insertPattern, setInsertPattern] = useState<RhythmPattern | null>(null);
  const onPatternInserted = useCallback(() => setInsertPattern(null), []);
  useEffect(() => { void patternStorage.list().then(setCustomPatterns).catch(error => useStudio.getState().log('error', `Biblioteca de patrones: ${String(error)}`)); }, []);
  const [panel, setPanel] = useState<'library' | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [kits, setKits] = useState<KitDefinition[]>([]);
  const [kitError, setKitError] = useState('');
  useEffect(() => { fetch(`${import.meta.env.BASE_URL}samples/kits.json`).then(response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); }).then(data => setKits(parseKitManifest(data).kits)).catch(error => setKitError(String(error))); }, []);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [bpmInput, setBpmInput] = useState('95');
  const applyVersion = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const logContainer = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const editorRef = useRef<EditorHandle>(null);
  const displayed = snapshot.composition ?? draftComposition;
  const draftTracks = useMemo(() => sourceTracks(studio.code), [studio.code]);
  const errorCount = studio.diagnostics.filter(d => d.severity === 'error').length;
  const warningCount = studio.diagnostics.filter(d => d.severity === 'warning').length;

  useEffect(() => {
    const timeout = setTimeout(() => {
      const result = compile(studio.code);
      studio.setDiagnostics(result.diagnostics);
      setDraftComposition(result.composition);
    }, 250);
    return () => clearTimeout(timeout);
  }, [studio.code, studio.setDiagnostics]);
  useEffect(() => { backend.setMasterVolume(studio.masterVolume); }, [backend, studio.masterVolume]);
  useEffect(() => { if (displayed) setBpmInput(String(displayed.bpm)); }, [displayed?.bpm]);
  useEffect(() => { logContainer.current?.scrollTo({ top: logContainer.current.scrollHeight }); }, [studio.logs]);
  useEffect(() => {
    if (panel) dialog.current?.showModal(); else dialog.current?.close();
  }, [panel]);
  useEffect(() => () => { engine.dispose(); void storage.close(); }, [engine]);

  const runSource = useCallback(async (source: string, playAfter = false) => {
    const state = useStudio.getState();
    const result = compile(source);
    state.setDiagnostics(result.diagnostics);
    if (!result.composition) {
      state.log('error', result.diagnostics.filter(d => d.severity === 'error').map((d) => `L${d.line}:${d.column} ${d.message}`).join(' · '));
      if (engine.getSnapshot().playing) state.log('info', 'La última composición válida sigue sonando.');
      return;
    }
    const version = ++applyVersion.current;
    setBusy(true);
    try {
      // Resume synchronously from the PLAY gesture before any asset-loading await.
      if (playAfter) await backend.initialize();
      if (version !== applyVersion.current) return;
      const outcome = await engine.submit(result.composition);
      if (version !== applyVersion.current || outcome === 'superseded') return;
      state.log('success', outcome === 'queued' ? 'Compilación válida · cambio preparado para el próximo compás.' : `Compilación válida · ${result.composition.tracks.length} pistas aplicadas.`);
      const warnings = result.diagnostics.filter(d => d.severity === 'warning');
      if (warnings.length) state.log('warning', warnings.map(d => `L${d.line}:${d.column} ${d.message}`).join(' · '));
      if (playAfter) {
        await engine.play();
        if (version === applyVersion.current && engine.getSnapshot().playing) state.log('success', `Transporte iniciado · ${result.composition.bpm} BPM · 4/4.`);
      }
    } catch (error) { state.log('error', error instanceof Error ? error.message : String(error)); }
    finally { if (version === applyVersion.current) setBusy(false); }
  }, [engine, backend]);
  const toggleTrackFlag = (id: string, flag: 'mute' | 'solo', value: boolean) => {
    const code = setTrackFlag(useStudio.getState().code, id, flag, value);
    if (code === undefined) { studio.log('error', 'No se pudo actualizar la pista en el editor; revisa su bloque y sus instrucciones.'); return; }
    studio.setCode(code);
    if (flag === 'mute') engine.setMuted(id, value); else engine.setTrackSolo(id, value);
  };
  const apply = useCallback(() => { void runSource(useStudio.getState().code); }, [runSource]);
  const stop = () => { applyVersion.current++; setBusy(false); engine.stop(); studio.log('info', 'Transporte detenido · posición reiniciada.'); };
  const save = useCallback(async () => {
    const state = useStudio.getState();
    const composition = compile(state.code).composition;
    try {
      await storage.save({ id: state.projectId, name: state.name.trim() || 'untitled', code: state.code, languageVersion: LANGUAGE_VERSION, settings: { masterVolume: state.masterVolume }, kits: [...new Set(composition?.tracks.filter((t) => t.kind === 'drums').map((t) => t.instrument) ?? [])], updatedAt: new Date().toISOString() });
      if (useStudio.getState().code === state.code && useStudio.getState().name === state.name) state.saved();
      state.log('success', `Proyecto «${state.name}» guardado en este navegador.`);
      setProjects(await storage.list());
    } catch (error) { state.log('error', String(error)); }
  }, []);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void save(); }
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !(event.target as HTMLElement).closest('.monaco-editor')) { event.preventDefault(); apply(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [save, apply]);
  const openLibrary = async () => {
    setPanel('library');
    try { setProjects(await storage.list()); } catch (error) { studio.log('error', String(error)); }
  };
  const setTempo = () => {
    const value = Number(bpmInput);
    if (!Number.isFinite(value) || value < 30 || value > 300) { studio.log('error', 'BPM debe estar entre 30 y 300.'); setBpmInput(String(displayed?.bpm ?? 95)); return; }
    const source = useStudio.getState().code;
    const code = /^\s*bpm\s+[^\n]+/m.test(source) ? source.replace(/^(\s*bpm\s+)[^\n]+/m, (_, prefix: string) => `${prefix}${value}`) : `bpm ${value}\n${source}`;
    studio.setCode(code);
    void runSource(code);
  };
  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      if (!file.name.endsWith('.mono')) throw new Error('Selecciona un archivo con extensión .mono.');
      if (file.size > 200_000) throw new Error('El archivo supera el límite de 200 KB.');
      const code = await file.text();
      studio.load(code, file.name.replace(/\.mono$/, ''), crypto.randomUUID());
      studio.setCode(code);
      studio.log('info', `${file.name} importado al editor · Ctrl + Enter para aplicar.`);
      setPanel(null);
    } catch (error) { studio.log('error', String(error)); }
    if (fileInput.current) fileInput.current.value = '';
  };

  return <div className="studio-shell">
    <header className="masthead">
      <a className="brand" href="#studio" aria-label="M.O.N.O. Studio"><img src="/mono.svg" alt="" /><div><strong>M.O.N.O.<small>STUDIO</small></strong><span>MUSICAL ORCHESTRATION & NOISE OPERATIONS</span></div></a>
      <div className="header-right"><span className="local-badge"><span className="status-dot on" /> LOCAL SESSION</span><span className="version">v0.1.0</span><button className="icon-button help-button" onClick={() => { setReferenceOpen(true); setPatternsOpen(false); }} aria-label="Abrir guía"><CircleHelp size={18} /></button></div>
    </header>
    <div className="transport-bar">
      <div className="transport-actions"><button className="play-button" onClick={() => void runSource(studio.code, true)} disabled={busy || snapshot.playing}><Play size={14} fill="currentColor" />{busy ? 'LOADING' : snapshot.playing ? 'PLAYING' : 'PLAY'}</button><button className="stop-button" onClick={stop} aria-label="Stop"><Square size={13} fill="currentColor" /></button><span className="control-divider" /><button className="reload-button" onClick={apply} title="Aplicar código: Ctrl + Enter"><RotateCw size={14} className={busy ? 'loading-icon' : ''} /> RELOAD <kbd>⌘ / Ctrl ↵</kbd></button></div>
      <div className="transport-details"><label className="tempo"><input aria-label="BPM" type="number" min="30" max="300" value={bpmInput} onChange={(e) => setBpmInput(e.target.value)} onBlur={setTempo} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} /><span>BPM</span></label><span className="time-signature">4<span>/</span>4</span><div className="transport-position"><b>{pad(Math.max(1, snapshot.bar))}<span>:</span>{pad(Math.floor(snapshot.step / 4) + 1)}<span>:</span>{pad(snapshot.step % 4 + 1)}</b><small>BAR / BEAT / STEP</small></div></div>
      <label className="master-control"><Volume2 size={16} /><span>MASTER</span><input aria-label="Volumen maestro" type="range" min="0" max="1" step="0.01" value={studio.masterVolume} onChange={(e) => studio.setMasterVolume(Number(e.target.value))} /><output>{Math.round(studio.masterVolume * 100)}%</output></label>
    </div>
    <div className="workbench" id="studio">
      <nav className="tool-rail" aria-label="Herramientas"><button className={!panel && !patternsOpen && !referenceOpen ? 'active' : ''} aria-label="Editor" onClick={() => { setPanel(null); setReferenceOpen(false); setPatternsOpen(false); }}><Code2 size={20} /></button><button className={panel === 'library' ? 'active' : ''} aria-label="Proyectos y ejemplos" onClick={() => void openLibrary()}><FolderOpen size={20} /></button><button className={referenceOpen ? 'active' : ''} aria-label="M.O.N.O. Reference" aria-pressed={referenceOpen} onClick={() => { setReferenceOpen(!referenceOpen); setPatternsOpen(false); }}><BookOpen size={20} /></button><button className={patternsOpen ? 'active' : ''} aria-label="Biblioteca de patrones" aria-pressed={patternsOpen} onClick={() => { setPatternsOpen(!patternsOpen); setReferenceOpen(false); }}><Layers3 size={20} /></button><span className="rail-bottom">M<br />/<br />01</span></nav>
      {patternsOpen && <PatternLibrary custom={customPatterns} instruments={kits.flatMap(kit => Object.keys(kit.instruments))} onClose={() => setPatternsOpen(false)} onInsert={setInsertPattern} onSave={async pattern => { await patternStorage.save(pattern); setCustomPatterns(await patternStorage.list()); }} onDelete={async id => { await patternStorage.remove(id); setCustomPatterns(await patternStorage.list()); }} />}
      {referenceOpen && <ReferencePanel backend={backend} kits={kits} kitError={kitError} code={studio.code} onClose={closeReference} onInsert={insertReference} />}
      <main className="main-column">
        <div className="editor-toolbar"><div className="file-tab"><Code2 size={14} /><input aria-label="Nombre del proyecto" value={studio.name} onChange={(e) => studio.setName(e.target.value)} maxLength={80} /><span>.mono</span>{studio.dirty && <i title="Cambios sin guardar" />}</div><div className="file-actions"><button aria-label="Importar .mono" title="Importar .mono" onClick={() => fileInput.current?.click()}><ArrowUpFromLine size={15} /></button><button aria-label="Exportar .mono" title="Exportar .mono" onClick={() => exportMono(studio.name, studio.code)}><ArrowDownToLine size={15} /></button><button aria-label="Guardar proyecto" title="Guardar proyecto · Ctrl + S" onClick={() => void save()}><Save size={15} /><span>SAVE</span></button></div></div>
        <div className="editor-area"><Suspense fallback={<div className="editor-loading">Inicializando editor M.O.N.O.…</div>}><Editor ref={editorRef} insertCode={insertCode} onCodeInserted={onCodeInserted} patterns={customPatterns} insertPattern={insertPattern} onPatternInserted={onPatternInserted} kits={kits} value={studio.code} diagnostics={studio.diagnostics} onChange={studio.setCode} onApply={apply} onPosition={(line, column) => setCursor({ line, column })} /></Suspense><div className="editor-watermark" aria-hidden="true">CODE IS<br />YOUR INSTRUMENT.</div></div>
        <div className="editor-status"><span className={errorCount ? 'error-text' : warningCount ? 'warning-text' : ''} role="status">{errorCount ? `${errorCount} ERROR${errorCount === 1 ? '' : 'ES'}${warningCount ? ` · ${warningCount} AVISO${warningCount === 1 ? '' : 'S'}` : ''}` : warningCount ? `${warningCount} AVISO${warningCount === 1 ? '' : 'S'} · CÓDIGO VÁLIDO` : <><Check size={12} /> SINTAXIS VÁLIDA</>}</span><div><span>Ln {cursor.line}, Col {cursor.column}</span><span>UTF-8</span><b>M.O.N.O.</b></div></div>
        <section className="console-panel" aria-label="Consola del sistema"><div className="section-heading"><h2><Terminal size={14} /> SYSTEM CONSOLE <span>{pad(studio.logs.length)}</span></h2><button aria-label="Limpiar consola" title="Limpiar consola" onClick={studio.clearLogs}><Trash2 size={13} /></button></div><div className="console-output" ref={logContainer} role="log" aria-live="polite">{studio.logs.length ? studio.logs.map((entry) => <div className={`log-line ${entry.kind}`} key={entry.id}><time>{entry.time}</time><span>{entry.kind === 'error' ? 'ERR' : entry.kind === 'success' ? 'OK ' : entry.kind === 'warning' ? 'WRN' : 'SYS'}</span><p>{entry.message}</p></div>) : <p className="console-empty">Esperando eventos del sistema…</p>}</div></section>
      </main>
      <aside className="session-sidebar">
        <section className="output-panel"><div className="section-heading"><h2><Activity size={14} /> MASTER OUTPUT</h2><span className={snapshot.playing ? 'live-label' : 'idle-label'}>{snapshot.playing ? '● LIVE' : '○ IDLE'}</span></div><Waveform backend={backend} playing={snapshot.playing} /><div className="output-caption"><span>WAVEFORM</span><span>STEREO / WEB AUDIO</span></div></section>
        <section className="tracks-panel"><div className="section-heading"><h2><Layers3 size={14} /> {snapshot.composition ? 'SESSION TRACKS' : 'CODE TRACKS'}</h2><span className="count-badge">{pad(draftTracks.length)}</span></div><div className="track-list">{draftTracks.map(({ track, patternEditable }, index) => { const activeTrack = snapshot.composition?.tracks.find(item => item.id === track.id); return <TrackCard key={`${track.id}:${index}`} track={track} index={index} playing={snapshot.playing} muted={snapshot.muted.includes(track.id)} solo={snapshot.solo.includes(track.id)} active={!!activeTrack} activeTrack={activeTrack} editable={patternEditable} step={snapshot.step} bar={snapshot.bar} noteIndex={snapshot.noteIndices[track.id]} onStep={step => { if (!editorRef.current?.toggleStep(track.id, step)) studio.log('warning', 'No se pudo editar el patrón; revisa el bloque de la pista.'); }} onUndo={() => editorRef.current?.undo()} onMute={() => toggleTrackFlag(track.id, 'mute', !snapshot.muted.includes(track.id))} onSolo={() => toggleTrackFlag(track.id, 'solo', !snapshot.solo.includes(track.id))} />; })}{!draftTracks.length && <div className="empty-tracks"><AudioLines size={30} /><p>Tu próximo sonido<br />empieza con <code>track</code>.</p></div>}</div><button className="browse-examples" onClick={() => void openLibrary()}><Plus size={14} /> EXPLORAR EJEMPLOS <ChevronRight size={14} /></button></section>
        <div className="session-note"><Radio size={17} /><div><strong>{snapshot.pending ? 'CAMBIO EN COLA' : snapshot.playing ? 'EL TRANSPORTE CONTINÚA' : 'LISTO PARA EXPERIMENTAR'}</strong><p>{snapshot.pending ? 'La última versión válida entrará en el próximo compás.' : snapshot.playing ? 'Edita el código. Ctrl + Enter aplica tu siguiente idea.' : 'Pulsa PLAY para iniciar el audio. Consulta los kits en la guía.'}</p></div></div>
      </aside>
    </div>
    <footer className="status-bar"><div><span className={`status-dot ${snapshot.playing ? 'on' : ''}`} /><span>{snapshot.playing ? 'ENGINE RUNNING' : busy ? 'PREPARING AUDIO' : 'ENGINE STANDBY'}</span><span className="footer-divider">/</span><span>{displayed?.scale.replace('_', ' ').toUpperCase() ?? 'D MINOR'}</span><span className="footer-divider">/</span><span>SEED {displayed?.seed ?? 12345}</span></div><span><Headphones size={12} /> MAKE NOISE. STAY IN SYNC.</span></footer>
    <input ref={fileInput} type="file" accept=".mono,text/plain" className="hidden-input" onChange={(e) => void importFile(e.target.files?.[0])} />
    <dialog ref={dialog} className="studio-dialog" onCancel={() => setPanel(null)} onClick={(e) => { if (e.target === dialog.current) setPanel(null); }}><div className="dialog-inner"><div className="dialog-header"><div><span className="eyebrow">M.O.N.O. / WORKSPACE</span><h2>Tu laboratorio sonoro.</h2></div><button className="icon-button" aria-label="Cerrar panel" onClick={() => setPanel(null)}><X size={20} /></button></div>
      {panel === 'library' ? <><p className="dialog-intro">Abre un proyecto o explora un punto de partida. Aplica el código con Ctrl + Enter cuando esté listo.</p><h3 className="subheading">EJEMPLOS / START SOMETHING</h3><div className="example-grid">{EXAMPLES.map((example, i) => <button className="example-card" key={example.name} onClick={() => { studio.load(example.code, example.name.toLowerCase().replaceAll(' ', '_'), crypto.randomUUID()); studio.setCode(example.code); studio.log('info', `Ejemplo «${example.name}» en el editor · pendiente de aplicar.`); setPanel(null); }}><Disc3 size={25} /><span className="example-index">0{i + 1}</span><strong>{example.name}</strong><small>{example.tag}</small><ChevronRight size={16} /></button>)}</div><h3 className="subheading">PROYECTOS GUARDADOS <span>SOLO EN ESTE NAVEGADOR</span></h3><div className="saved-projects">{projects.length ? projects.map((project) => <button key={project.id} onClick={() => { studio.load(project.code, project.name, project.id, project.settings.masterVolume); studio.log('info', `Proyecto «${project.name}» recuperado · pendiente de aplicar.`); setPanel(null); }}><FolderOpen size={17} /><strong>{project.name}<small>{new Date(project.updatedAt).toLocaleString('es')}</small></strong><ChevronRight size={16} /></button>) : <div className="empty-library"><Save size={22} /><p>Todavía no hay proyectos guardados.<br /><span>Ctrl + S guarda código, configuración y referencias a kits.</span></p></div>}</div><button className="secondary-button" onClick={() => fileInput.current?.click()}><ArrowUpFromLine size={15} /> Importar archivo .mono</button></> : null}
    </div></dialog>
  </div>;
}

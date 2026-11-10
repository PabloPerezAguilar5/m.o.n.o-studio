import { useMemo, useState } from 'react';
import { Copy, Plus, Trash2, X } from 'lucide-react';
import { BUILTIN_PATTERNS, STYLES, validPattern, type RhythmPattern } from '../patterns/catalog';

interface Props {
  custom: RhythmPattern[]; instruments: string[];
  onInsert(pattern: RhythmPattern): void; onSave(pattern: RhythmPattern): Promise<void>;
  onDelete(id: string): Promise<void>; onClose(): void;
}
export function PatternLibrary({ custom, instruments, onInsert, onSave, onDelete, onClose }: Props) {
  const [query, setQuery] = useState(''); const [style, setStyle] = useState(''); const [instrument, setInstrument] = useState('');
  const [name, setName] = useState(''); const [newInstrument, setNewInstrument] = useState('kick');
  const [sequence, setSequence] = useState(''); const [newStyle, setNewStyle] = useState<string>('Techno');
  const [message, setMessage] = useState('');
  const all = useMemo(() => [...BUILTIN_PATTERNS, ...custom], [custom]);
  const options = [...new Set([...instruments, ...all.map(item => item.instrument)])].sort();
  const visible = all.filter(item => (!style || item.style === style) && (!instrument || item.instrument === instrument) && `${item.name} ${item.style} ${item.instrument} ${item.sequence}`.toLowerCase().includes(query.toLowerCase()));
  const save = async () => {
    const item: RhythmPattern = { id: crypto.randomUUID(), name: name.trim(), instrument: newInstrument.trim(), style: newStyle, sequence, custom: true };
    if (!validPattern(item)) { setMessage('Completa el nombre y usa exactamente 16 pasos: x o punto.'); return; }
    try { await onSave(item); setName(''); setSequence(''); setMessage('Patrón guardado en este navegador.'); }
    catch (error) { setMessage(`No se pudo guardar: ${String(error)}`); }
  };
  return <aside className="pattern-library" aria-label="Pattern library">
    <div className="pattern-header"><div><span>RHYTHM / 16 STEPS</span><h2>PATTERN LIBRARY</h2></div><button aria-label="Cerrar biblioteca de patrones" onClick={onClose}><X size={16} /></button></div>
    <p className="pattern-intro">Inserta una idea en el cursor. Ctrl + Enter la lleva al directo.</p>
    <div className="pattern-filters"><input aria-label="Buscar patrones" placeholder="Buscar patrón…" value={query} onChange={e => setQuery(e.target.value)} /><select aria-label="Filtrar por estilo" value={style} onChange={e => setStyle(e.target.value)}><option value="">Todos los estilos</option>{STYLES.map(item => <option key={item}>{item}</option>)}</select><select aria-label="Filtrar por instrumento" value={instrument} onChange={e => setInstrument(e.target.value)}><option value="">Todos los instrumentos</option>{options.map(item => <option key={item}>{item}</option>)}</select></div>
    <div className="pattern-list">{visible.map(pattern => <article className="pattern-entry" key={pattern.id}><div><strong>{pattern.name}</strong><span>{pattern.style} / {pattern.instrument}{pattern.custom ? ' / USER' : ''}</span></div><code>{pattern.sequence}</code><div className="pattern-actions"><button onClick={() => onInsert(pattern)} aria-label={`Insertar ${pattern.name} ${pattern.instrument}`}>INSERTAR <Plus size={12} /></button><button aria-label={`Copiar ${pattern.name} ${pattern.instrument}`} onClick={() => void navigator.clipboard.writeText(`${pattern.instrument} "${pattern.sequence}"`).then(() => setMessage('Patrón copiado.')).catch(() => setMessage('No se pudo copiar al portapapeles.'))}><Copy size={13} /></button>{pattern.custom && <button aria-label={`Eliminar ${pattern.name}`} onClick={() => void onDelete(pattern.id).catch(error => setMessage(String(error)))}><Trash2 size={13} /></button>}</div></article>)}{!visible.length && <p className="pattern-empty">No hay patrones con estos filtros.</p>}</div>
    <details className="pattern-create"><summary>+ GUARDAR PATRÓN PROPIO</summary><div><input aria-label="Nombre del patrón" placeholder="Nombre" value={name} onChange={e => setName(e.target.value)} /><input aria-label="Instrumento del patrón" list="pattern-instruments" value={newInstrument} onChange={e => setNewInstrument(e.target.value)} /><datalist id="pattern-instruments">{options.map(item => <option key={item} value={item} />)}</datalist><select aria-label="Estilo del patrón" value={newStyle} onChange={e => setNewStyle(e.target.value)}>{STYLES.map(item => <option key={item}>{item}</option>)}</select><input aria-label="Secuencia del patrón" placeholder="x...x...x...x..." maxLength={16} value={sequence} onChange={e => setSequence(e.target.value)} /><small>{sequence.length} / 16 PASOS</small><button onClick={() => void save()}>GUARDAR</button></div></details>
    <p role="status" className="pattern-message">{message}</p>
  </aside>;
}

import { validPattern, type RhythmPattern } from './catalog';
export class PatternStorage {
  private db?: Promise<IDBDatabase>;
  constructor(private readonly name = 'mono-pattern-library') {}
  private open(): Promise<IDBDatabase> {
    return this.db ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(this.name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('patterns', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => { this.db = undefined; reject(request.error); };
      request.onblocked = () => reject(new Error('Cierra otras pestañas para abrir la biblioteca.'));
    });
  }
  private async request<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('patterns', mode); const request = fn(tx.objectStore('patterns'));
      tx.oncomplete = () => resolve(request.result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    });
  }
  async list(): Promise<RhythmPattern[]> { return (await this.request<RhythmPattern[]>('readonly', store => store.getAll())).filter(validPattern); }
  async save(pattern: RhythmPattern): Promise<void> {
    if (!validPattern(pattern)) throw new Error('Usa un nombre, instrumento y exactamente 16 pasos x o punto.');
    await this.request('readwrite', store => store.put({ ...pattern, custom: true }));
  }
  async remove(id: string): Promise<void> { await this.request('readwrite', store => store.delete(id)); }
  async close(): Promise<void> { if (this.db) (await this.db).close(); this.db = undefined; }
}

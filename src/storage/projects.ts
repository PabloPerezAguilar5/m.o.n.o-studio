import { LANGUAGE_VERSION } from '../core/types';

export interface Project {
  id: string;
  name: string;
  code: string;
  languageVersion: typeof LANGUAGE_VERSION;
  settings: { masterVolume: number };
  kits: string[];
  updatedAt: string;
}
export interface ProjectStorage {
  list(): Promise<Project[]>;
  get(id: string): Promise<Project | undefined>;
  save(project: Project): Promise<void>;
  remove(id: string): Promise<void>;
}

export class IndexedDbProjects implements ProjectStorage {
  private database?: Promise<IDBDatabase>;
  constructor(private name = 'mono-studio') {}
  private open() {
    this.database ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('projects', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => { this.database = undefined; reject(new Error('No se pudo abrir el almacenamiento local.')); };
      request.onblocked = () => reject(new Error('Cierra otras pestañas de M.O.N.O. para actualizar el almacenamiento.'));
    });
    return this.database;
  }
  private async request<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('projects', mode);
      const request = action(transaction.objectStore('projects'));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error ?? new Error('No se pudo guardar el proyecto.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Operación local cancelada.'));
    });
  }
  async list() { return (await this.request<Project[]>('readonly', (s) => s.getAll())).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
  get(id: string) { return this.request<Project | undefined>('readonly', (s) => s.get(id)); }
  async save(project: Project) { await this.request('readwrite', (s) => s.put(project)); }
  async remove(id: string) { await this.request('readwrite', (s) => s.delete(id)); }
  async close() { if (this.database) (await this.database).close(); this.database = undefined; }
}

export function exportMono(name: string, code: string) {
  const url = URL.createObjectURL(new Blob([code], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'session'}.mono`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

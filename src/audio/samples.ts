/** Local, extensible sample manifest. Paths are relative to public/samples/. */
export interface KitDefinition {
  id: string;
  name: string;
  instruments: Record<string, string[]>;
}
export interface KitManifest { version: 1; kits: KitDefinition[] }
export type LoadedKit = Record<string, AudioBuffer[]>;

export function parseKitManifest(value: unknown): KitManifest {
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1 || !('kits' in value) || !Array.isArray(value.kits)) {
    throw new Error('Manifiesto de samples inválido: se requiere version: 1 y kits: [].');
  }
  const ids = new Set<string>();
  const kits = value.kits.map((entry: unknown): KitDefinition => {
    if (!entry || typeof entry !== 'object') throw new Error('Definición de kit inválida.');
    const kit = entry as Record<string, unknown>;
    if (typeof kit.id !== 'string' || !/^[a-zA-Z0-9_][\w-]*$/.test(kit.id) || ids.has(kit.id)) {
      throw new Error('Cada kit debe tener un id válido y único.');
    }
    ids.add(kit.id);
    if (!kit.instruments || typeof kit.instruments !== 'object' || Array.isArray(kit.instruments)) throw new Error(`Kit ${kit.id}: falta instruments.`);
    const instruments: Record<string, string[]> = Object.create(null) as Record<string, string[]>;
    for (const [name, files] of Object.entries(kit.instruments)) {
      if (!/^[a-zA-Z_]\w*$/.test(name) || !Array.isArray(files) || files.length === 0 || files.length > 128) throw new Error(`Kit ${kit.id}: lista de samples inválida para ${name}.`);
      if (!files.every((file: unknown) => typeof file === 'string' && !file.startsWith('/') && !file.includes('\\') && file.split('/').every((part: string) => part !== '..' && part !== '.' && part.length > 0) && /\.(wav|mp3|ogg|flac)$/i.test(file))) {
        throw new Error(`Kit ${kit.id}: las rutas deben ser archivos locales dentro de samples/.`);
      }
      instruments[name] = [...files] as string[];
    }
    if (!Object.keys(instruments).length || Object.keys(instruments).length > 32) throw new Error(`Kit ${kit.id}: se requieren entre 1 y 32 instrumentos.`);
    return { id: kit.id, name: typeof kit.name === 'string' ? kit.name : kit.id, instruments };
  });
  return { version: 1, kits };
}

/** Native AudioBuffers can outlive cache eviction safely: each voice owns references. */
export class SampleLibrary {
  private manifest?: Promise<KitManifest>;
  private readonly cache = new Map<string, LoadedKit>();
  private readonly loading = new Map<string, Promise<LoadedKit>>();
  private disposed = false;
  private readonly abort = new AbortController();

  constructor(
    private readonly decode: (data: ArrayBuffer) => Promise<AudioBuffer>,
    private readonly base = `${import.meta.env.BASE_URL}samples/`,
    private readonly fetcher: typeof fetch = (...args) => globalThis.fetch(...args),
  ) {}

  async getManifest(): Promise<KitManifest> {
    if (this.disposed) throw new Error('Biblioteca de samples cerrada.');
    if (!this.manifest) {
      this.manifest = this.fetcher(`${this.base}kits.json`, { signal: this.abort.signal, cache: 'no-cache' })
        .then(async response => {
          if (!response.ok) throw new Error(`No se encontró ${this.base}kits.json (HTTP ${response.status}).`);
          return parseKitManifest(await response.json());
        }).catch((error: unknown) => { this.manifest = undefined; throw error; });
    }
    return this.manifest;
  }

  async load(id: string): Promise<LoadedKit> {
    if (this.disposed) throw new Error('Biblioteca de samples cerrada.');
    const cached = this.cache.get(id);
    if (cached) {
      this.cache.delete(id);
      this.cache.set(id, cached);
      return cached;
    }
    const existing = this.loading.get(id);
    if (existing) return existing;
    const promise = this.loadFresh(id).finally(() => this.loading.delete(id));
    this.loading.set(id, promise);
    return promise;
  }

  private async loadFresh(id: string): Promise<LoadedKit> {
    const manifest = await this.getManifest();
    const kit = manifest.kits.find(item => item.id === id);
    if (!kit) throw new Error(`Kit "${id}" no registrado en samples/kits.json.`);
    const result: LoadedKit = Object.create(null) as LoadedKit;
    let decodedBytes = 0;
    // Sequential decoding bounds peak memory and leaves no partial kit in the cache.
    for (const [instrument, paths] of Object.entries(kit.instruments)) {
      result[instrument] = [];
      for (const path of paths) {
        if (this.disposed) throw new Error('Biblioteca de samples cerrada.');
        const url = `${this.base}${path.split('/').map(encodeURIComponent).join('/')}`;
        try {
          const response = await this.fetcher(url, { signal: this.abort.signal, cache: 'no-cache' });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          if (response.headers.get('content-type')?.includes('text/html')) throw new Error('el servidor devolvió HTML, no audio');
          const bytes = await response.arrayBuffer();
          if (!bytes.byteLength || bytes.byteLength > 20 * 1024 * 1024) throw new Error('tamaño inválido (máximo 20 MiB por sample)');
          const decoded = await this.decode(bytes);
          if (decoded.duration > 30 || decoded.numberOfChannels > 2) throw new Error('máximo 30 segundos y 2 canales por sample');
          decodedBytes += decoded.length * decoded.numberOfChannels * 4;
          if (decodedBytes > 64 * 1024 * 1024) throw new Error('el kit supera 64 MiB de audio decodificado');
          result[instrument].push(decoded);
        } catch (error) {
          throw new Error(`Kit "${id}" no disponible: ${url}. Añade un archivo de audio válido. ${error instanceof Error ? error.message : ''}`);
        }
      }
    }
    if (this.disposed) throw new Error('Biblioteca de samples cerrada.');
    this.cache.set(id, result);
    if (this.cache.size > 4) this.cache.delete(this.cache.keys().next().value as string);
    return result;
  }

  dispose(): void {
    this.disposed = true;
    this.abort.abort();
    this.cache.clear();
    this.loading.clear();
    this.manifest = undefined;
  }
}


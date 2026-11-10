import { describe, expect, it, vi } from 'vitest';
import { parseKitManifest, SampleLibrary } from '../src/audio/samples';

const manifest = { version: 1, kits: [{ id: 'trip', name: 'Trip', instruments: { kick: ['drums/trip/kick.wav'] } }] };
const buffer = { duration: 0.2, numberOfChannels: 1, length: 9600 } as AudioBuffer;
const json = () => new Response(JSON.stringify(manifest), { headers: { 'content-type': 'application/json' } });
const audio = () => new Response(new Uint8Array([1, 2, 3, 4]), { headers: { 'content-type': 'audio/wav' } });

describe('local sample library', () => {
  it('validates extensible local manifests and rejects duplicate ids and external paths', () => {
    expect(parseKitManifest(manifest).kits[0].instruments.kick).toEqual(['drums/trip/kick.wav']);
    expect(() => parseKitManifest({ ...manifest, kits: [...manifest.kits, ...manifest.kits] })).toThrow('único');
    for (const path of ['../outside.wav', 'https://other.test/kick.wav', '/etc/file.wav']) {
      expect(() => parseKitManifest({ version: 1, kits: [{ id: 'test', instruments: { kick: [path] } }] })).toThrow('rutas');
    }
  });

  it('deduplicates concurrent loads and decodes actual files before caching', async () => {
    const fetcher = vi.fn(async (url: RequestInfo | URL) => String(url).endsWith('.json') ? json() : audio());
    const decode = vi.fn(async () => buffer);
    const library = new SampleLibrary(decode, '/samples/', fetcher);
    const [a, b] = await Promise.all([library.load('trip'), library.load('trip')]);
    expect(a).toBe(b);
    expect(a.kick[0]).toBe(buffer);
    expect(decode).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(await library.load('trip')).toBe(a);
    library.dispose();
    await expect(library.load('trip')).rejects.toThrow('cerrada');
  });

  it('does not cache failures and identifies the missing filename', async () => {
    let available = false;
    const fetcher = vi.fn(async (url: RequestInfo | URL) => String(url).endsWith('.json') ? json() : available ? audio() : new Response('missing', { status: 404 }));
    const library = new SampleLibrary(async () => buffer, '/samples/', fetcher);
    await expect(library.load('trip')).rejects.toThrow('/samples/drums/trip/kick.wav');
    available = true;
    expect((await library.load('trip')).kick).toHaveLength(1);
  });

  it('rejects a Vite HTML fallback without claiming the kit is loaded', async () => {
    const decode = vi.fn(async () => buffer);
    const fetcher = vi.fn(async (url: RequestInfo | URL) => String(url).endsWith('.json') ? json() : new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } }));
    const library = new SampleLibrary(decode, '/samples/', fetcher);
    await expect(library.load('trip')).rejects.toThrow('HTML');
    expect(decode).not.toHaveBeenCalled();
  });

  it('rejects malformed audio and oversized decoded samples', async () => {
    const fetcher = vi.fn(async (url: RequestInfo | URL) => String(url).endsWith('.json') ? json() : audio());
    const library = new SampleLibrary(async () => { throw new Error('decode failed'); }, '/samples/', fetcher);
    await expect(library.load('trip')).rejects.toThrow('decode failed');
    const long = new SampleLibrary(async () => ({ duration: 31, numberOfChannels: 1 }) as AudioBuffer, '/samples/', fetcher);
    await expect(long.load('trip')).rejects.toThrow('30 segundos');
  });

  it('rejects unknown kits without fetching samples', async () => {
    const fetcher = vi.fn(async () => json());
    const library = new SampleLibrary(async () => buffer, '/samples/', fetcher);
    await expect(library.load('unknown')).rejects.toThrow('no registrado');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

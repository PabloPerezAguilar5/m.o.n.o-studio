import { describe, expect, it } from 'vitest';
import manifest from '../public/samples/kits.json';
import { parseKitManifest, SampleLibrary } from '../src/audio/samples';
import { compile } from '../src/language';

describe('registered drum kits', () => {
  it('registers every kit and every WAV with original filenames', () => {
    const kits = parseKitManifest(manifest).kits;
    expect(kits.map(kit => kit.id).sort()).toEqual(['909samples', 'freaksamples', 'glitch', 'samples808', 'trip']);
    expect(kits.flatMap(kit => Object.values(kit.instruments).flat())).toHaveLength(55);
    expect(kits.find(kit => kit.id === 'trip')!.instruments.hat).toContain('drums/trip/A03_09 Hihat#2.wav');
  });
  it('compiles every instrument with literals and each generator', () => {
    const patterns = ['"x...x...x...x..."', ...['random', 'riot', 'evolve', 'glitch', 'minimal', 'dense', 'human'].map(name => `${name}(0.5) every 2 bars`), 'euclid(7,16)'];
    for (const kit of manifest.kits) for (const instrument of Object.keys(kit.instruments)) for (const pattern of patterns) {
      const result = compile(`track drums {\n kit "${kit.id}"\n ${instrument} ${pattern}\n}`);
      expect(result.diagnostics, `${kit.id} ${instrument} ${pattern}`).toEqual([]);
    }
  });
  it('encodes special filenames and loads all variations', async () => {
    const urls: string[] = [];
    const fetcher = async (input: RequestInfo | URL) => {
      const url = String(input); urls.push(url);
      return url.endsWith('kits.json') ? new Response(JSON.stringify(manifest)) : new Response(new Uint8Array([1]));
    };
    const buffer = { duration: 1, numberOfChannels: 1, length: 100 } as AudioBuffer;
    const library = new SampleLibrary(async () => buffer, '/samples/', fetcher);
    for (const kit of manifest.kits) {
      const loaded = await library.load(kit.id);
      for (const [name, files] of Object.entries(kit.instruments)) expect(loaded[name]).toHaveLength(files.length);
    }
    expect(urls.some(url => url.includes('Hihat%232.wav'))).toBe(true);
    expect(urls.some(url => url.includes('808%20clap.wav'))).toBe(true);
  });
});

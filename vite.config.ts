import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';

// Vite's static middleware treats decoded # characters as URL fragments.
// Serve sample URLs before it, preserving the exact original WAV filenames.
function sampleFiles(): Plugin {
  const install = (server: import('vite').ViteDevServer | import('vite').PreviewServer, preview: boolean) => {
    const root = path.resolve(preview ? server.config.build.outDir : server.config.publicDir, 'samples');
    server.middlewares.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      let name: string;
      try { name = decodeURIComponent((req.url ?? '').split('?')[0]); } catch { return next(); }
      if (!name.startsWith('/samples/') || !name.toLowerCase().endsWith('.wav')) return next();
      const file = path.resolve(root, '.' + name.slice('/samples'.length));
      if (!file.startsWith(root + path.sep)) return next();
      void stat(file).then(info => {
        if (!info.isFile()) return next();
        res.setHeader('Content-Type', 'audio/wav');
        res.setHeader('Content-Length', info.size);
        if (req.method === 'HEAD') return res.end();
        createReadStream(file).on('error', next).pipe(res);
      }).catch(() => next());
    });
  };
  return { name: 'mono-sample-files', configureServer: server => install(server, false), configurePreviewServer: server => install(server, true) };
}
export default defineConfig({ plugins: [sampleFiles(), react()], test: { include: ['tests/**/*.test.ts'], environment: 'node' } });

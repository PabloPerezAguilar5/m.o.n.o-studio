import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root = 'public/samples/drums';
const classify = (file) => {
  const name = file.toLowerCase().replace(/^a\d+_/, '').replace(/^\d+\s+/, '');
  if (/open[ -]?hat|hat[ -]?open/.test(name)) return 'open_hat';
  if (/hihat|hat/.test(name)) return 'hat';
  if (/kick/.test(name)) return 'kick';
  if (/snare/.test(name)) return 'snare';
  if (/rimshot|rim/.test(name)) return 'rim';
  if (/wood[ -]?block/.test(name)) return 'woodblock';
  for (const instrument of ['clap', 'crash', 'ride', 'tom', 'conga', 'perc']) if (name.includes(instrument)) return instrument;
  return name.replace(/\.wav$/i, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
};
const kits = [];
for (const dir of (await readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory()).sort((a,b) => a.name.localeCompare(b.name))) {
  const instruments = {};
  for (const file of (await readdir(path.join(root, dir.name))).filter(name => /\.wav$/i.test(name)).sort((a,b) => (a.includes('_') ? 1 : 0) - (b.includes('_') ? 1 : 0) || a.localeCompare(b))) {
    const name = classify(file);
    (instruments[name] ??= []).push(`drums/${dir.name}/${file}`);
  }
  if (Object.keys(instruments).length) kits.push({ id: dir.name, name: dir.name, instruments });
}
await writeFile('public/samples/kits.json', JSON.stringify({ version: 1, kits }, null, 2) + '\n');

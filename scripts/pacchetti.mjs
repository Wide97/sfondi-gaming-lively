// Prepara la cartella dist/:
//   dist/wallpapers/<nome>/   pacchetto pronto per Lively (con le librerie di shared/) → diventa <nome>.zip
//   dist/site/                sito GitHub Pages (galleria + demo live)
//
//   node scripts/pacchetti.mjs
//
// Quali librerie e cartelle extra servono a ogni sfondo lo dice docs/catalog.json (da configura.mjs).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const FILES = ['index.html', 'main.js', 'LivelyInfo.json', 'LivelyProperties.json', 'thumbnail.jpg'];
// nelle cartelle extra (es. stemma/) va solo il file di istruzioni: le immagini dell'utente restano sul suo PC
const EXTRA_OK = new Set(['LEGGIMI.txt']);

const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'catalog.json'), 'utf8'));

fs.rmSync(DIST, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'docs'), path.join(DIST, 'site'), { recursive: true });

for (const w of catalog) {
  const src = path.join(ROOT, 'wallpapers', w.dir);
  for (const dest of [path.join(DIST, 'wallpapers', w.dir), path.join(DIST, 'site', 'demo', w.dir)]) {
    fs.mkdirSync(dest, { recursive: true });
    for (const f of FILES) {
      if (!fs.existsSync(path.join(src, f))) throw new Error(`Manca wallpapers/${w.dir}/${f}`);
      fs.copyFileSync(path.join(src, f), path.join(dest, f));
    }
    for (const lib of w.libs) fs.copyFileSync(path.join(ROOT, 'shared', `${lib}.js`), path.join(dest, `${lib}.js`));
    for (const dir of w.extraDirs) {
      fs.mkdirSync(path.join(dest, dir), { recursive: true });
      for (const f of fs.readdirSync(path.join(src, dir)))
        if (EXTRA_OK.has(f)) fs.copyFileSync(path.join(src, dir, f), path.join(dest, dir, f));
    }
  }
  console.log('✓', w.dir);
}

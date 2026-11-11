// Prepara la cartella dist/:
//   dist/wallpapers/<nome>/   pacchetto pronto per Lively (con kit.js incluso) → diventa <nome>.zip
//   dist/site/                sito GitHub Pages (galleria + demo live)
//
//   node scripts/pacchetti.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const FILES = ['index.html', 'main.js', 'LivelyInfo.json', 'LivelyProperties.json', 'thumbnail.jpg'];

fs.rmSync(DIST, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'docs'), path.join(DIST, 'site'), { recursive: true });

const walls = fs.readdirSync(path.join(ROOT, 'wallpapers'), { withFileTypes: true }).filter((d) => d.isDirectory());
for (const { name } of walls) {
  for (const dest of [path.join(DIST, 'wallpapers', name), path.join(DIST, 'site', 'demo', name)]) {
    fs.mkdirSync(dest, { recursive: true });
    for (const f of FILES) {
      const src = path.join(ROOT, 'wallpapers', name, f);
      if (!fs.existsSync(src)) throw new Error(`Manca ${path.relative(ROOT, src)}`);
      fs.copyFileSync(src, path.join(dest, f));
    }
    fs.copyFileSync(path.join(ROOT, 'shared', 'kit.js'), path.join(dest, 'kit.js'));
  }
  console.log('✓', name);
}

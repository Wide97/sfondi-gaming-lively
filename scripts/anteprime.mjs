// Genera le anteprime degli sfondi usando Microsoft Edge in modalità headless (Windows).
//
//   node scripts/anteprime.mjs            → tutti gli sfondi
//   node scripts/anteprime.mjs neon-city  → solo uno
//
// Per ogni sfondo crea:
//   wallpapers/<nome>/thumbnail.jpg      miniatura per la libreria di Lively (640×360)
//   docs/img/<nome>.jpg                  anteprima grande (1 schermo)
//   docs/img/<nome>-p0..p3.jpg           le 4 palette
//   docs/img/<nome>-2s.jpg / -3s.jpg     layout su 2 e 3 schermi
//
// Lo sfondo viene renderizzato in un canvas di dimensioni fisse, simulando qualche secondo
// di animazione, poi il canvas viene esportato come JPEG.

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EDGE = process.env.EDGE ||
  path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sfondi-anteprime-'));

const only = process.argv[2];
const walls = fs.readdirSync(path.join(ROOT, 'wallpapers'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && (!only || d.name === only)).map((d) => d.name);

fs.mkdirSync(path.join(ROOT, 'docs', 'img'), { recursive: true });

function harness(wall, job) {
  const kit = pathToFileURL(path.join(ROOT, 'shared', 'kit.js')).href;
  const main = pathToFileURL(path.join(ROOT, 'wallpapers', wall, 'main.js')).href;
  return `<!doctype html><html><head><meta charset="utf-8"></head><body><pre id="out"></pre>
<script>
  Object.defineProperty(window, 'innerWidth', { get: () => ${job.w} });
  Object.defineProperty(window, 'innerHeight', { get: () => ${job.h} });
  Object.defineProperty(window, 'devicePixelRatio', { get: () => 1 });
  (function () { let s = 12345; Math.random = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; })();
</script>
<script src="${kit}"></script>
<script src="${main}"></script>
<script>
  try {
    const step = 1 / 30;
    for (let i = 0; i < ${job.frames}; i++) {
      Kit._frameDt = step; Kit.real += step; Kit.dt = step * Kit.speed; Kit.t += Kit.dt;
      Kit._o.draw(Kit.ctx, Kit);
    }
    const c = document.createElement('canvas'); c.width = ${job.ow}; c.height = ${job.oh};
    const x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
    x.drawImage(Kit.canvas, 0, 0, ${job.ow}, ${job.oh});
    document.getElementById('out').textContent = 'DATA:' + c.toDataURL('image/jpeg', ${job.q}) + ':END';
  } catch (e) { document.getElementById('out').textContent = 'ERRORE:' + e.message + ':END'; }
</script></body></html>`;
}

function render(wall, job, i) {
  const file = path.join(TMP, `${wall}-${i}.html`);
  fs.writeFileSync(file, harness(wall, job));
  const url = pathToFileURL(file).href + (job.query ? '?' + job.query : '');
  const args = ['--headless=new', '--disable-gpu', '--allow-file-access-from-files', '--no-first-run',
    `--user-data-dir=${path.join(TMP, 'profile-' + i)}`, '--dump-dom', url];
  return new Promise((resolve, reject) => {
    execFile(EDGE, args, { maxBuffer: 64 * 1024 * 1024, timeout: 180000 }, (err, stdout) => {
      const m = /(DATA|ERRORE):([\s\S]*?):END/.exec(stdout || '');
      if (!m) return reject(new Error(`${wall}: nessun output${err ? ' (' + err.message + ')' : ''}`));
      if (m[1] === 'ERRORE') return reject(new Error(`${wall}: ${m[2]}`));
      fs.writeFileSync(job.out, Buffer.from(m[2].split(',')[1], 'base64'));
      resolve(job.out);
    });
  });
}

const jobs = [];
for (const w of walls) {
  const img = (n) => path.join(ROOT, 'docs', 'img', n);
  const base = { w: 1920, h: 1080, frames: 180, q: .86 };
  jobs.push([w, { ...base, ow: 640, oh: 360, q: .85, out: path.join(ROOT, 'wallpapers', w, 'thumbnail.jpg'), query: 'schermi=1' }]);
  jobs.push([w, { ...base, ow: 1920, oh: 1080, out: img(`${w}.jpg`), query: 'schermi=1' }]);
  for (let p = 0; p < 4; p++) jobs.push([w, { ...base, ow: 960, oh: 540, out: img(`${w}-p${p}.jpg`), query: `schermi=1&palette=${p}` }]);
  jobs.push([w, { ...base, w: 3840, ow: 1920, oh: 540, out: img(`${w}-2s.jpg`), query: 'schermi=2' }]);
  jobs.push([w, { ...base, w: 5760, ow: 1920, oh: 360, out: img(`${w}-3s.jpg`), query: 'schermi=3' }]);
}

let next = 0, failed = 0;
async function worker() {
  while (next < jobs.length) {
    const i = next++, [w, job] = jobs[i];
    try { console.log('✓', path.relative(ROOT, await render(w, job, i))); }
    catch (e) { failed++; console.error('✗', e.message); }
  }
}
await Promise.all(Array.from({ length: Math.min(4, os.cpus().length) }, worker));
fs.rmSync(TMP, { recursive: true, force: true });
process.exit(failed ? 1 : 0);

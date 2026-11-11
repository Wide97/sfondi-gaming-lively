// Genera per ogni sfondo index.html, LivelyInfo.json e LivelyProperties.json, più wallpapers/catalog.json.
//
//   node scripts/configura.mjs
//
// Per aggiungere uno sfondo: aggiungi una voce in `walls` e scrivi wallpapers/<dir>/main.js.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const owner = 'Wide97';
const repo = 'sfondi-gaming-lively';

const common = {
  velocita: { type: 'dropdown', value: 1, text: 'Velocità', items: ['Lento', 'Medio', 'Dinamico'] },
  palette: { type: 'dropdown', value: 0, text: 'Palette colori', items: ['Neon', 'Notturno', 'Pastello', 'Mono'] },
  schermi: { type: 'dropdown', value: 0, text: 'Schermi (usa la modalità Span)', items: ['Automatico', '1 schermo', '2 schermi affiancati (principale a destra)', '3 schermi a L (principale, destra, sopra)'] },
};
const fps = { fps: { type: 'dropdown', value: 1, text: 'Fotogrammi al secondo', items: ['30 (risparmio energetico)', '60'] } };
const cb = (text, value = true) => ({ type: 'checkbox', value, text });

const walls = [
  { dir: 'neon-city', title: 'Neon City', type: 2,
    desc: 'Skyline cyberpunk con parallasse, pioggia, insegne al neon e auto volanti. Le finestre pulsano con la musica.',
    props: { orologio: cb('Orologio (insegna al neon)'), audio: cb('Reagisci alla musica'), pioggia: cb('Pioggia') } },
  { dir: 'ponte-di-comando', title: 'Ponte di Comando', type: 1,
    desc: "Vista dalla plancia di un'astronave: pianeta con anelli, nebulosa e HUD olografico con orologio di bordo.",
    props: { orologio: cb('Orologio di bordo'), mouse: cb('Parallasse con il mouse'), cornice: cb('Cornice della plancia') } },
  { dir: 'portale-arcano', title: 'Portale Arcano', type: 2,
    desc: 'Cerchi di rune rotanti, cristalli sospesi e lucciole. Il mouse lascia scintille, le rune pulsano con la musica.',
    props: { orologio: cb('Orologio'), mouse: cb('Scintille dal mouse'), audio: cb('Reagisci alla musica') } },
  { dir: 'radar-tattico', title: 'Radar Tattico', type: 1,
    desc: 'Radar con fascio rotante, mappa topografica, registro operazioni e mirino che aggancia i bersagli.',
    props: { orologio: cb('Timer missione (orologio)'), mouse: cb('Mirino sul mouse'), glitch: cb('Glitch digitali') } },
  { dir: 'rossoneri', title: 'Rossoneri', type: 2,
    palItems: ['Rossonero', 'Notte di Coppa', 'Trasferta', 'Oro'],
    desc: 'Notte di stadio in Curva Sud: coreografia rossonera, bandiere, fumogeni, ola e fuochi d\'artificio. Sfondo non ufficiale fatto da tifosi, non affiliato al club.',
    props: {
      scritta: { type: 'textbox', value: 'FORZA MILAN', text: 'Scritta della coreografia' },
      orologio: cb('Orologio sul tabellone'), fumogeni: cb('Fumogeni'),
      mouse: cb("Fuochi d'artificio al clic"), audio: cb('Reagisci alla musica'),
    } },
];

const html = (title) => `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>html,body{margin:0;height:100%;overflow:hidden;background:#000}</style>
</head>
<body>
<script>
  // Carica kit.js (nel pacchetto) oppure ../../shared/kit.js (nel repo), poi lo sfondo.
  (function () {
    function load(src, ok, ko) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = ko; document.body.appendChild(s); }
    function main() { load('main.js'); }
    load('kit.js', main, function () { load('../../shared/kit.js', main); });
  })();
</script>
</body>
</html>
`;

for (const w of walls) {
  const d = path.join(root, 'wallpapers', w.dir);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'index.html'), html(w.title));
  const info = {
    AppVersion: '2.0.0.0', Title: w.title, Thumbnail: 'thumbnail.jpg', Preview: 'thumbnail.jpg',
    Desc: w.desc, Author: owner, License: 'MIT', Contact: `https://github.com/${owner}/${repo}`,
    Type: w.type, FileName: 'index.html', Arguments: null, IsAbsolutePath: false,
  };
  fs.writeFileSync(path.join(d, 'LivelyInfo.json'), JSON.stringify(info, null, 2) + '\n');
  const props = { ...common, ...w.props, ...fps };
  if (w.palItems) props.palette = { ...common.palette, items: w.palItems };
  fs.writeFileSync(path.join(d, 'LivelyProperties.json'), JSON.stringify(props, null, 2) + '\n');
}
fs.writeFileSync(path.join(root, 'wallpapers', 'catalog.json'),
  JSON.stringify(walls.map(({ dir, title, desc, props }) => ({ dir, title, desc, extras: Object.values(props).map((p) => p.text) })), null, 2) + '\n');
console.log('ok');

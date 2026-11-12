// Unica fonte dei dati degli sfondi. Genera:
//   wallpapers/<dir>/index.html, LivelyInfo.json, LivelyProperties.json
//   docs/catalog.json            letto dalla galleria (docs/index.html)
//   .github/note-release.md      note della release con l'elenco degli .zip
//
//   node scripts/configura.mjs
//
// Per aggiungere uno sfondo: aggiungi una voce in `walls`, scrivi wallpapers/<dir>/main.js,
// lancia questo script e `node scripts/anteprime.mjs <dir>`. Il README va aggiornato a mano.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const owner = 'Wide97';
const repo = 'sfondi-gaming-lively';

const common = {
  velocita: { type: 'dropdown', value: 1, text: 'Velocità', items: ['Lento', 'Medio', 'Dinamico'] },
  intensita: { type: 'dropdown', value: 0, text: 'Intensità', items: ['Calmo (icone leggibili)', 'Equilibrato', 'Vivace'] },
  palette: { type: 'dropdown', value: 0, text: 'Palette colori', items: ['Neon', 'Notturno', 'Pastello', 'Mono'] },
  schermi: { type: 'dropdown', value: 0, text: 'Schermi (usa la modalità Span)', items: ['Automatico', '1 schermo', '2 schermi affiancati (principale a destra)', '3 schermi a L (principale, destra, sopra)', "2 schermi uno sopra l'altro (principale sotto)"] },
};
const fps = { fps: { type: 'dropdown', value: 1, text: 'Fotogrammi al secondo', items: ['30 (risparmio energetico)', '60'] } };
const cb = (text, value = true) => ({ type: 'checkbox', value, text });

const walls = [
  { dir: 'neon-city', title: 'Neon City', tag: 'Cyberpunk', type: 2,
    about: 'Skyline notturna su tre livelli di parallasse, pioggia, insegne al neon che sfarfallano e auto volanti. Le finestre pulsano a tempo di musica.',
    desc: 'Skyline cyberpunk con parallasse, pioggia, insegne al neon e auto volanti. Le finestre pulsano con la musica.',
    props: { orologio: cb('Orologio (insegna al neon)'), audio: cb('Reagisci alla musica'), pioggia: cb('Pioggia') } },
  { dir: 'ponte-di-comando', title: 'Ponte di Comando', tag: 'Sci-fi', type: 1,
    about: "Sei sulla plancia di un'astronave: un gigante gassoso con anelli, una luna in orbita, la nebulosa e un HUD olografico. Su più schermi i montanti della cabina coincidono con le cornici dei monitor.",
    desc: "Vista dalla plancia di un'astronave: pianeta con anelli, nebulosa e HUD olografico con orologio di bordo.",
    props: { orologio: cb('Orologio di bordo'), mouse: cb('Parallasse con il mouse'), cornice: cb('Cornice della plancia') } },
  { dir: 'portale-arcano', title: 'Portale Arcano', tag: 'Fantasy / RPG', type: 2,
    about: 'Cerchi di rune che ruotano in direzioni opposte, un vortice di energia, cristalli sospesi e lucciole. Muovendo il mouse lasci una scia di scintille.',
    desc: 'Cerchi di rune rotanti, cristalli sospesi e lucciole. Il mouse lascia scintille, le rune pulsano con la musica.',
    props: { orologio: cb('Orologio'), mouse: cb('Scintille dal mouse'), audio: cb('Reagisci alla musica') } },
  { dir: 'radar-tattico', title: 'Radar Tattico', tag: 'FPS / Tattico', type: 1,
    about: 'Radar con fascio rotante su mappa topografica, contatti che si accendono al passaggio, stato della squadra e registro operazioni. Il cursore diventa un mirino che aggancia i bersagli.',
    desc: 'Radar con fascio rotante, mappa topografica, registro operazioni e mirino che aggancia i bersagli.',
    props: { orologio: cb('Timer missione (orologio)'), mouse: cb('Mirino sul mouse'), glitch: cb('Glitch digitali') } },
  { dir: 'rossoneri', title: 'Rossoneri', tag: 'Calcio · Curva Sud', type: 2,
    about: "Notte di stadio in curva: coreografia rossonera con sette stelle, bandiere al vento, fumogeni, la ola che arriva dagli altri schermi e fuochi d'artificio. La scritta della coreografia si può cambiare e puoi aggiungere un'immagine tua al centro. Sfondo non ufficiale fatto da tifosi: nessun logo del club è incluso.",
    extraDirs: ['stemma'],
    palItems: ['Rossonero', 'Notte di Coppa', 'Trasferta', 'Oro'],
    desc: 'Notte di stadio in Curva Sud: coreografia rossonera, bandiere, fumogeni, ola e fuochi d\'artificio. Sfondo non ufficiale fatto da tifosi, non affiliato al club.',
    props: {
      scritta: { type: 'textbox', value: 'FORZA MILAN', text: 'Scritta della coreografia' },
      // elenca le immagini messe dall'utente in stemma/ sul proprio PC (nessuna è inclusa nel pacchetto)
      stemma: { type: 'folderDropdown', value: '', text: 'Stemma (immagine tua nella cartella stemma)', filter: '*.png|*.jpg|*.jpeg|*.webp|*.svg', folder: 'stemma' },
      orologio: cb('Orologio sul tabellone'), fumogeni: cb('Fumogeni'),
      mouse: cb("Fuochi d'artificio al clic"), audio: cb('Reagisci alla musica'),
    } },

  // --- sfondi "soft" con informazioni utili (usano shared/info.js) ---
  { dir: 'orizzonte', title: 'Orizzonte', tag: 'Soft · Meteo', type: 1, libs: ['info'], info: true,
    palItems: ['Colline', 'Lago', 'Dune', 'Grafite'],
    about: "Colline morbide sotto un cielo che segue l'ora vera: alba, giorno, tramonto e notte arrivano quando arrivano fuori dalla finestra, e nuvole, pioggia o neve seguono il meteo della tua città. Con orologio, meteo attuale, prossime ore e prossimi giorni, orari di alba e tramonto.",
    desc: "Colline e cielo che seguono l'ora e il meteo reali. Orologio, meteo attuale, prossime ore e prossimi giorni.",
    props: {
      citta: { type: 'textbox', value: 'Milano', text: 'Città per il meteo' },
      orologio: cb('Orologio'), pannelli: cb('Pannelli meteo'), cielo: cb("Cielo che segue l'ora e il meteo reali"),
    } },
  { dir: 'bruma', title: 'Bruma', tag: 'Soft · Cruscotto', type: 2, libs: ['info'], info: true,
    args: '--system-information --system-nowplaying',
    palItems: ['Lavanda', 'Salvia', 'Notte', 'Sabbia'],
    about: 'Nebbie di colore che si muovono piano, con un cruscotto discreto: orologio, calendario del mese con festività e settimana, uso di CPU, GPU, RAM e rete, il brano in riproduzione e, se vuoi, il meteo.',
    desc: 'Nebbie di colore lente con orologio, calendario, uso di CPU/GPU/RAM, brano in riproduzione e meteo.',
    props: {
      citta: { type: 'textbox', value: '', text: 'Città per il meteo (vuoto = niente meteo)' },
      orologio: cb('Orologio'), calendario: cb('Calendario'), sistema: cb('CPU, GPU, RAM e rete'),
      musica: cb('Brano in riproduzione'), audio: cb('Respira con la musica'),
    } },
];

// libs: file di shared/ oltre a kit.js (es. ['info'] → info.js), caricati in ordine prima di main.js
const html = (title, libs = []) => `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>html,body{margin:0;height:100%;overflow:hidden;background:#000}</style>
</head>
<body>
<script>
  // Carica le librerie comuni (accanto a index.html nel pacchetto, in ../../shared/ nel repo), poi lo sfondo.
  (function () {
    var libs = ${JSON.stringify(['kit', ...libs])};
    function load(src, ok, ko) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = ko; document.body.appendChild(s); }
    function next(i) {
      if (i === libs.length) return load('main.js');
      var f = libs[i] + '.js';
      load(f, function () { next(i + 1); }, function () { load('../../shared/' + f, function () { next(i + 1); }); });
    }
    next(0);
  })();
</script>
</body>
</html>
`;

for (const w of walls) {
  const d = path.join(root, 'wallpapers', w.dir);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'index.html'), html(w.title, w.libs));
  const info = {
    AppVersion: '2.0.0.0', Title: w.title, Thumbnail: 'thumbnail.jpg', Preview: 'thumbnail.jpg',
    Desc: w.desc, Author: owner, License: 'MIT', Contact: `https://github.com/${owner}/${repo}`,
    Type: w.type, FileName: 'index.html', Arguments: w.args || null, IsAbsolutePath: false,
  };
  fs.writeFileSync(path.join(d, 'LivelyInfo.json'), JSON.stringify(info, null, 2) + '\n');
  const props = { ...common, ...w.props, ...fps };
  if (w.palItems) props.palette = { ...common.palette, items: w.palItems };
  fs.writeFileSync(path.join(d, 'LivelyProperties.json'), JSON.stringify(props, null, 2) + '\n');
}
// catalogo per la galleria: le opzioni specifiche di ogni sfondo diventano le "etichette" degli extra
fs.writeFileSync(path.join(root, 'docs', 'catalog.json'), JSON.stringify(walls.map((w) => ({
  dir: w.dir, title: w.title, tag: w.tag, desc: w.about,
  palettes: w.palItems || common.palette.items, info: !!w.info,
  libs: ['kit', ...(w.libs || [])], extraDirs: w.extraDirs || [],
  extras: Object.values(w.props).map((p) => p.text),
})), null, 2) + '\n');

// note della release
fs.writeFileSync(path.join(root, '.github', 'note-release.md'), `## Come si installa

1. Installa **[Lively Wallpaper](https://www.rocksdanister.com/lively/)** (gratis, anche dal Microsoft Store).
2. Scarica lo \`.zip\` dello sfondo che vuoi qui sotto, in **Assets**.
3. Trascina lo \`.zip\` nella finestra di Lively e cliccaci sopra per applicarlo.

Hai più monitor? Imposta in Lively la disposizione **Span**: gli sfondi supportano 2 schermi affiancati (principale a destra) e 3 schermi a L (principale, destra, sopra), con la scena che scorre da un monitor all'altro.
Tutti i dettagli sono nel [README](https://github.com/${owner}/${repo}#readme).

| File | Sfondo |
|---|---|
${walls.map((w) => `| \`${w.dir}.zip\` | ${w.title} (${w.tag}) |`).join('\n')}
`);
console.log('ok');

/* Rossoneri — notte di stadio in Curva Sud. Sfondo non ufficiale fatto da tifosi:
 * nessun logo o stemma ufficiale, solo colori, coreografia e atmosfera.
 *
 * Flusso tra gli schermi:
 *  - la curva con la coreografia, la porta e il tabellone sono sullo schermo principale
 *  - la ola e i tabelloni LED a bordo campo scorrono dai secondari verso il principale
 *  - con 3 schermi il fumo dei fumogeni e i fuochi d'artificio salgono nello schermo di sopra
 */
(function () {
  'use strict';

  const PALETTES = [
    { name: 'Rossonero', sky: ['#04050b', '#161a2a'], haze: '#ff4d5e', roof: '#0c0c10', truss: '#c8102e', stand: '#121216',
      crowd: [['#c8102e', 3], ['#8a0b20', 2], ['#151515', 4], ['#050505', 3], ['#e8e8e8', 1], ['#3a3a3a', 2]],
      choreo: ['#c8102e', '#0b0b0b'], text: '#ffffff', stroke: '#000000', flag: ['#c8102e', '#0b0b0b'], smoke: '#e0233f',
      fire: ['#ff2b3d', '#ffffff', '#ffcf4a'], led: '#ff2b3d', led2: '#ffffff', pitch: ['#1d6a2b', '#24792f'], light: '#fff4dc', star: '#ffd36b' },
    { name: 'Notte di Coppa', sky: ['#01030c', '#0b1740'], haze: '#9fc3ff', roof: '#080a12', truss: '#c8102e', stand: '#0e1018',
      crowd: [['#c8102e', 3], ['#8a0b20', 2], ['#10121a', 4], ['#05060a', 3], ['#dfe6ff', 1], ['#2e3344', 2]],
      choreo: ['#c8102e', '#0b0b0b'], text: '#ffffff', stroke: '#000000', flag: ['#c8102e', '#0b0b0b'], smoke: '#cfd8ff',
      fire: ['#ffffff', '#9fc3ff', '#ff2b3d'], led: '#e6ecff', led2: '#ff2b3d', pitch: ['#175a27', '#1c672c'], light: '#e8f0ff', star: '#ffffff' },
    { name: 'Trasferta', sky: ['#0a0b12', '#262a3a'], haze: '#ffffff', roof: '#101016', truss: '#c8102e', stand: '#16161c',
      crowd: [['#f2f2f2', 3], ['#c8102e', 2], ['#1a1a1a', 3], ['#060606', 2], ['#bdbdbd', 2], ['#3a3a3a', 2]],
      choreo: ['#f4f4f4', '#dedede'], text: '#c8102e', stroke: '#0b0b0b', flag: ['#ffffff', '#c8102e'], smoke: '#ffffff',
      fire: ['#ffffff', '#ff2b3d', '#ffe9a8'], led: '#ffffff', led2: '#ff2b3d', pitch: ['#1f6e2e', '#267c33'], light: '#ffffff', star: '#c8102e' },
    { name: 'Oro', sky: ['#050402', '#1c160a'], haze: '#f3c96b', roof: '#0b0a07', truss: '#b8892d', stand: '#121008',
      crowd: [['#c8102e', 2], ['#e8b84a', 2], ['#141210', 4], ['#050403', 3], ['#f5e6c0', 1], ['#3a3426', 2]],
      choreo: ['#0b0b0b', '#17130b'], text: '#e8b84a', stroke: '#000000', flag: ['#e8b84a', '#0b0b0b'], smoke: '#f3c96b',
      fire: ['#ffd36b', '#fff3c4', '#ff2b3d'], led: '#ffcc55', led2: '#ffffff', pitch: ['#1b6229', '#22702f'], light: '#fff1cc', star: '#ffd36b' },
  ];

  // Quanto "spinge" ogni effetto per livello di intensità: [calmo, equilibrato, vivace].
  // Nel calmo la scena è una curva di notte a luci basse: niente rumore ad alto contrasto
  // nel pubblico, coreografia smorzata, pochi fuochi e niente lampi a ritmo di musica,
  // così le icone del desktop restano leggibili.
  const LIVELLI = {
    crowd:    [.42, .7, 1],      // luminosità del pubblico
    crowdMix: [.55, .25, 0],     // quanto il pubblico si fonde col colore della tribuna (meno rumore)
    white:    [.15, .6, 1],      // peso dei tifosi in bianco (i puntini più chiari)
    choreo:   [.5, .78, 1],      // luminosità delle strisce della coreografia
    text:     [.55, .8, 1],      // opacità della scritta e delle stelle della coreografia
    textSize: [.22, .26, .3],    // altezza della scritta rispetto alla coreografia
    wave:     [.5, .8, 1],       // ampiezza dello sventolio
    phones:   [.2, .55, 1],      // quante luci dei telefoni
    beams:    [.35, .7, 1],      // fasci di luce verso il cielo
    glow:     [.4, .7, .85],     // fari sotto il tetto e coni sul campo
    led:      [.45, .75, 1],     // tabelloni LED a bordo campo
    ola:      [.35, .7, 1],      // schiarita della ola
    smoke:    [.45, .75, 1],     // densità del fumo
    flare:    [.35, .7, 1],      // bagliore delle torce
    fireEvery:[[9, 16], [3, 6], [1.2, 4]], // secondi tra un fuoco automatico e l'altro (1 schermo)
    fireSize: [.55, .8, 1],
    fireBass: [false, true, true],         // fuochi lanciati dai bassi della musica
    blink:    [false, true, true],         // spia lampeggiante del tabellone
  };
  const lv = (k) => Kit.pick(LIVELLI[k]);

  const SANS = '"Segoe UI", Arial, sans-serif';
  let G, skyL, frontL, glowL, crowdL, choreo, ledTile, smokeSprite;
  let stars = [], seven = [], phones = [], flags = [], emitters = [], smoke = [], rockets = [], bursts = [];
  let nextRocket = 1, fireCooldown = 0;

  const scritta = (K) => String(K.props.scritta || 'FORZA MILAN').toUpperCase().slice(0, 24);

  /* ---------- geometria dello stadio (fila in basso) ---------- */
  function geometry(K) {
    const lay = K.layout(), Y = lay.rowY, h = lay.rowH, at = (k) => Y + h * k;
    return {
      lay, Y, h, u: h / 1080,
      roofTop: at(.2), roofBot: at(.27),
      tiers: [[at(.27), at(.43)], [at(.45), at(.61)], [at(.63), at(.8)]],
      standTop: at(.27), standBot: at(.8), adTop: at(.8), adBot: at(.835), pitchTop: at(.835), ground: Y + h,
    };
  }

  // aree del cielo dove esplodono i fuochi
  function skyAreas() {
    const lay = G.lay, areas = [{ x: 0, w: Kit.W, y0: G.Y + G.h * .02, y1: G.Y + G.h * .16, k: .6 }];
    if (lay.mode === 3) areas.unshift({ x: lay.top.x, w: lay.top.w, y0: lay.top.y + lay.top.h * .08, y1: lay.top.y + lay.top.h * .75, k: 1 });
    return areas;
  }

  function weighted(list, r) {
    let tot = 0; for (const [, w] of list) tot += w;
    let x = r * tot; for (const [c, w] of list) { if ((x -= w) <= 0) return c; }
    return list[0][0];
  }

  const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

  function starPath(c, x, y, r) {
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .45 : r;
      i ? c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    c.closePath();
  }

  /* ---------- livelli statici ---------- */
  function buildSky(K) {
    const P = K.pal, lay = G.lay;
    skyL = K.offscreen(K.W, K.H);
    const c = skyL.x;
    let g = c.createLinearGradient(0, 0, 0, G.standTop);
    g.addColorStop(0, P.sky[0]); g.addColorStop(1, P.sky[1]);
    c.fillStyle = g; c.fillRect(0, 0, K.W, K.H);
    // alone dei riflettori sopra lo stadio
    for (const z of lay.zones) {
      if (z.y + z.h < G.ground - 1) continue;
      g = c.createRadialGradient(z.cx, G.roofTop, 0, z.cx, G.roofTop, z.w * .7);
      g.addColorStop(0, K.rgba(P.haze, .16)); g.addColorStop(1, K.rgba(P.haze, 0));
      c.fillStyle = g; c.fillRect(z.x, G.roofTop - z.w * .7, z.w, z.w * .7);
    }
  }

  function buildFront(K) {
    const P = K.pal, W = K.W, u = G.u, m = G.lay.main;
    frontL = K.offscreen(W, K.H);
    const c = frontL.x;
    // tetto con le travi rosse
    c.fillStyle = P.roof; c.fillRect(0, G.roofTop, W, G.roofBot - G.roofTop);
    c.strokeStyle = P.truss; c.lineWidth = 2.2 * u;
    c.beginPath();
    const step = 44 * u;
    for (let x = -step; x < W + step; x += step) {
      c.moveTo(x, G.roofTop + 4 * u); c.lineTo(x + step / 2, G.roofBot - 4 * u); c.lineTo(x + step, G.roofTop + 4 * u);
    }
    c.stroke();
    c.fillStyle = P.truss;
    c.fillRect(0, G.roofTop, W, 5 * u); c.fillRect(0, G.roofBot - 5 * u, W, 5 * u);
    for (let x = 0; x < W; x += step * 4) c.fillRect(x, G.roofTop - 14 * u, 6 * u, 14 * u);

    // campo con le strisce del taglio dell'erba in prospettiva
    const n = 9, ph = G.ground - G.pitchTop;
    for (let k = 0; k < n; k++) {
      const y0 = G.pitchTop + ph * Math.pow(k / n, 1.5), y1 = G.pitchTop + ph * Math.pow((k + 1) / n, 1.5);
      c.fillStyle = P.pitch[k % 2]; c.fillRect(0, y0, W, y1 - y0 + 1);
    }
    let g = c.createLinearGradient(0, G.pitchTop, 0, G.ground);
    g.addColorStop(0, 'rgba(0,0,0,.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, G.pitchTop, W, ph);
    c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 2.5 * u;
    const gy = G.pitchTop + 5 * u;
    c.beginPath(); c.moveTo(0, gy); c.lineTo(W, gy); c.stroke();

    // porta e area di rigore davanti alla curva
    const gx = m.cx, gw = Math.min(m.w * .2, G.h * .42), gh = G.h * .085;
    c.lineWidth = 1.6 * u; c.strokeStyle = 'rgba(255,255,255,.7)';
    c.beginPath();
    c.moveTo(gx - gw * .95, gy); c.lineTo(gx - gw * 1.25, gy + ph * .3); c.lineTo(gx + gw * 1.25, gy + ph * .3); c.lineTo(gx + gw * .95, gy);
    c.moveTo(gx - gw * 2.2, gy); c.lineTo(gx - gw * 3, gy + ph * .72); c.lineTo(gx + gw * 3, gy + ph * .72); c.lineTo(gx + gw * 2.2, gy);
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,.8)'; c.beginPath(); c.ellipse(gx, gy + ph * .5, 4 * u, 2 * u, 0, 0, 6.283); c.fill();
    c.fillStyle = 'rgba(255,255,255,.07)'; c.fillRect(gx - gw / 2, gy - gh, gw, gh);
    c.strokeStyle = 'rgba(255,255,255,.22)'; c.lineWidth = 1;
    c.beginPath();
    for (let x = gx - gw / 2; x <= gx + gw / 2; x += 7 * u) { c.moveTo(x, gy - gh); c.lineTo(x, gy); }
    for (let y = gy - gh; y <= gy; y += 7 * u) { c.moveTo(gx - gw / 2, y); c.lineTo(gx + gw / 2, y); }
    c.stroke();
    c.strokeStyle = '#ffffff'; c.lineWidth = 4 * u; c.lineCap = 'round';
    c.beginPath(); c.moveTo(gx - gw / 2, gy); c.lineTo(gx - gw / 2, gy - gh); c.lineTo(gx + gw / 2, gy - gh); c.lineTo(gx + gw / 2, gy); c.stroke();
  }

  function buildGlow(K) {
    const P = K.pal, u = G.u;
    glowL = K.offscreen(K.W, K.H);
    const c = glowL.x;
    // fasci di luce dei riflettori verso il campo
    for (const z of G.lay.zones) {
      if (z.y + z.h < G.ground - 1) continue;
      for (let i = 0; i < 5; i++) {
        const x = z.x + z.w * (.1 + i * .2), spread = 160 * u;
        const g = c.createLinearGradient(0, G.roofBot, 0, G.ground);
        g.addColorStop(0, K.rgba(P.light, .07)); g.addColorStop(1, K.rgba(P.light, 0));
        c.fillStyle = g;
        c.beginPath(); c.moveTo(x - 12 * u, G.roofBot); c.lineTo(x + 12 * u, G.roofBot);
        c.lineTo(x + spread, G.ground); c.lineTo(x - spread, G.ground); c.closePath(); c.fill();
      }
    }
    // file di fari sotto il tetto
    for (let x = 20 * u; x < K.W; x += 46 * u) {
      const y = G.roofBot - 2 * u, g = c.createRadialGradient(x, y, 0, x, y, 30 * u);
      g.addColorStop(0, K.rgba(P.light, .45)); g.addColorStop(1, K.rgba(P.light, 0));
      c.fillStyle = g; c.fillRect(x - 30 * u, y - 30 * u, 60 * u, 60 * u);
      c.fillStyle = P.light; c.fillRect(x - 6 * u, y - 2 * u, 12 * u, 4 * u);
    }
  }

  function buildCrowd(K, rnd) {
    const P = K.pal, cell = Math.max(3, Math.round(4 * G.u)), H = G.standBot - G.standTop;
    const cols = Math.ceil(K.W / cell), rows = Math.ceil(H / cell);
    const tiny = document.createElement('canvas'); tiny.width = cols; tiny.height = rows;
    const tc = tiny.getContext('2d'), id = tc.createImageData(cols, rows), d = id.data;
    // i colori chiari (tifosi in bianco) pesano meno nei livelli calmi: sono loro a fare "rumore"
    const pal = P.crowd.map(([c, w]) => { const v = rgb(c); return [v, v[0] + v[1] + v[2] > 540 ? w * lv('white') : w]; });
    const lum = lv('crowd'), mix = lv('crowdMix'), st = rgb(P.stand);
    for (let y = 0; y < rows; y++) {
      const shade = .55 + .45 * (y / rows);
      for (let x = 0; x < cols; x++) {
        const c = weighted(pal, rnd()), k = shade * (.75 + rnd() * .35) * lum, p = (y * cols + x) * 4;
        for (let i = 0; i < 3; i++) d[p + i] = K.lerp(c[i] * k, st[i], mix);
        d[p + 3] = 255;
      }
    }
    tc.putImageData(id, 0, 0);
    crowdL = K.offscreen(K.W, H);
    // nei livelli calmi i "pixel" del pubblico vengono ammorbiditi: trama invece di puntinato
    crowdL.x.imageSmoothingEnabled = mix > 0;
    crowdL.x.drawImage(tiny, 0, 0, cols, rows, 0, 0, cols * cell, rows * cell);
    phones = Array.from({ length: Math.round(K.W * H / 6000 * lv('phones')) }, () => ({
      x: rnd() * K.W, y: G.standTop + rnd() * H, f: .5 + rnd() * 2, ph: rnd() * 6.28 }));
  }

  function buildChoreo(K) {
    const P = K.pal, m = G.lay.main;
    const x = m.x + m.w * .1, w = m.w * .8, y = G.standTop, h = G.standBot - G.standTop;
    const img = K.offscreen(w, h), c = img.x;
    const n = 14;
    for (let i = 0; i < n; i++) { c.fillStyle = P.choreo[i % 2]; c.fillRect(i * w / n, 0, w / n + 1, h); }
    c.fillStyle = `rgba(0,0,0,${1 - lv('choreo')})`; c.fillRect(0, 0, w, h);    // strisce smorzate
    // scritta e stelle su un livello a parte, poi composte con l'opacità del livello
    // (stroke e fill semitrasparenti sovrapposti renderebbero i bordi delle lettere sporchi)
    const t = K.offscreen(w, h), tc = t.x;
    paintChoreoText(K, tc, w, h);
    c.globalAlpha = lv('text'); c.drawImage(t.c, 0, 0, w, h); c.globalAlpha = 1;
    choreo = { img, x, y, w, h };
  }

  function paintChoreoText(K, c, w, h) {
    const P = K.pal;
    const txt = scritta(K);
    if (stemmaImg) return paintChoreoStemma(K, c, w, h, txt);
    let fs = h * lv('textSize');
    c.font = `900 ${fs}px ${SANS}`;
    const tw = c.measureText(txt).width;
    if (tw > w * .88) { fs *= w * .88 / tw; c.font = `900 ${fs}px ${SANS}`; }
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineJoin = 'round'; c.lineWidth = fs * .09; c.strokeStyle = P.stroke;
    c.strokeText(txt, w / 2, h * .5); c.fillStyle = P.text; c.fillText(txt, w / 2, h * .5);
    c.font = `800 ${h * .07}px ${SANS}`; c.lineWidth = h * .012;
    c.strokeText('C U R V A   S U D', w / 2, h * .17); c.fillText('C U R V A   S U D', w / 2, h * .17);
    // sette stelle
    const sr = h * .045;
    for (let i = 0; i < 7; i++) {
      starPath(c, w / 2 + (i - 3) * sr * 3, h * .82, sr);
      c.fillStyle = P.star; c.fill(); c.lineWidth = h * .006; c.strokeStyle = P.stroke; c.stroke();
    }
  }

  /* ---------- stemma personale ----------
   * Nessuno stemma è incluso nel repo. L'opzione "Stemma" (folderDropdown di Lively) elenca le
   * immagini che l'utente mette nella cartella stemma/ dello sfondo sul proprio PC: lo sfondo la
   * mette al centro della coreografia e la scritta passa in alto. Senza immagine resta la scritta.
   */
  let stemmaImg = null, stemmaSrc = null;

  function loadStemma(val) {
    const src = val ? String(val).replace(/\\/g, '/') : null;
    if (src === stemmaSrc) return;
    stemmaSrc = src;
    if (!src) { stemmaImg = null; if (G) buildChoreo(Kit); return; }
    const im = new Image();
    im.onload = () => { if (stemmaSrc === src) { stemmaImg = im; if (G) buildChoreo(Kit); } };
    im.onerror = () => { if (stemmaSrc === src) { stemmaImg = null; if (G) buildChoreo(Kit); } };
    // Lively passa il percorso relativo ("stemma/x.png"); se arriva solo il nome del file lo completo
    im.src = /[\/:]/.test(src) ? src : 'stemma/' + src;
  }

  function paintChoreoStemma(K, c, w, h, txt) {
    const P = K.pal;
    // scritta in alto, al posto di "CURVA SUD"
    let fs = h * .1;
    c.font = `900 ${fs}px ${SANS}`;
    const tw = c.measureText(txt).width;
    if (tw > w * .8) { fs *= w * .8 / tw; c.font = `900 ${fs}px ${SANS}`; }
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    c.lineWidth = fs * .1; c.strokeStyle = P.stroke;
    c.strokeText(txt, w / 2, h * .15); c.fillStyle = P.text; c.fillText(txt, w / 2, h * .15);
    // stemma al centro, proporzioni originali, con un alone scuro per staccarlo dalle strisce
    const maxH = h * .52, maxW = w * .4, k = Math.min(maxH / stemmaImg.naturalHeight, maxW / stemmaImg.naturalWidth);
    const iw = stemmaImg.naturalWidth * k, ih = stemmaImg.naturalHeight * k, cy = h * .5;
    const g = c.createRadialGradient(w / 2, cy, 0, w / 2, cy, Math.max(iw, ih) * .75);
    g.addColorStop(0, 'rgba(0,0,0,.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.imageSmoothingQuality = 'high';
    c.drawImage(stemmaImg, w / 2 - iw / 2, cy - ih / 2, iw, ih);
    const sr = h * .04;
    for (let i = 0; i < 7; i++) {
      starPath(c, w / 2 + (i - 3) * sr * 3, h * .86, sr);
      c.fillStyle = P.star; c.fill(); c.lineWidth = h * .006; c.strokeStyle = P.stroke; c.stroke();
    }
  }

  function buildLed(K) {
    const P = K.pal, h = G.adBot - G.adTop;
    const parts = [scritta(K), '★', 'ROSSONERI', '★', 'CURVA SUD', '★', 'SEMPRE CON TE', '★'];
    const tmp = document.createElement('canvas').getContext('2d');
    const fs = h * .62; tmp.font = `800 ${fs}px ${SANS}`;
    const gap = h * .9, widths = parts.map((p) => tmp.measureText(p).width);
    const w = widths.reduce((a, b) => a + b + gap, 0);
    const img = K.offscreen(w, h), c = img.x;
    c.fillStyle = '#050505'; c.fillRect(0, 0, w, h);
    c.font = `800 ${fs}px ${SANS}`; c.textBaseline = 'middle';
    let x = gap / 2;
    parts.forEach((p, i) => {
      c.fillStyle = p === '★' ? P.star : i % 4 === 0 ? P.led : P.led2;
      c.shadowColor = c.fillStyle; c.shadowBlur = h * .3;
      c.fillText(p, x, h * .55); x += widths[i] + gap;
    });
    c.shadowBlur = 0; c.fillStyle = 'rgba(0,0,0,.35)';
    for (let gx = 0; gx < w; gx += 3) c.fillRect(gx, 0, 1, h);
    for (let gy = 0; gy < h; gy += 3) c.fillRect(0, gy, w, 1);
    ledTile = img;
  }

  function build(ctx, K) {
    const rnd = K.seeded(1899), P = K.pal;
    G = geometry(K);
    buildSky(K); buildFront(K); buildGlow(K); buildCrowd(K, rnd); buildChoreo(K); buildLed(K);

    // sprite del fumo
    smokeSprite = K.offscreen(128, 128);
    const g = smokeSprite.x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, K.rgba(P.smoke, .9)); g.addColorStop(.5, K.rgba(P.smoke, .35)); g.addColorStop(1, K.rgba(P.smoke, 0));
    smokeSprite.x.fillStyle = g; smokeSprite.x.fillRect(0, 0, 128, 128);

    stars = [];
    for (let i = 0; i < K.W * G.roofTop / 5000; i++) {
      const x = rnd() * K.W, y = rnd() * (G.roofTop - 20);
      if (K.visible(x, y)) stars.push({ x, y, r: .5 + rnd(), p: rnd() * 6.28 });
    }
    // sette stelle in arco nel cielo
    const lay = G.lay, base = lay.mode === 3
      ? { x: lay.top.x + lay.top.w * .12, y: lay.top.y + lay.top.h * .2, sp: lay.top.w * .05, a: lay.top.h * .07, r: 11 * G.u }
      : { x: lay.main.x + lay.main.w * .06, y: G.Y + G.h * .07, sp: lay.main.w * .025, a: G.h * .03, r: 5 * G.u };
    seven = Array.from({ length: 7 }, (_, i) => ({ x: base.x + i * base.sp, y: base.y - Math.sin(i / 6 * Math.PI) * base.a, r: base.r, p: i }));

    // bandiere: ai lati della coreografia sul principale e ovunque sui secondari
    flags = [];
    const m = lay.main;
    for (const z of lay.zones) {
      if (z.y + z.h < G.ground - 1) continue;
      const isMain = z === m, n = isMain ? 4 : 6;
      for (let i = 0; i < n; i++) {
        const x = isMain ? (i < 2 ? m.x + m.w * (.025 + i * .04) : m.x + m.w * (.905 + (i - 2) * .04)) : z.x + z.w * (.05 + rnd() * .9);
        const tier = G.tiers[(rnd() * 3) | 0];
        const fl = G.h * .075;
        // sventolano nella direzione del flusso, ma mai fuori dal bordo dello schermo
        const fdir = x + fl > K.W ? -1 : x - fl < 0 ? 1 : lay.flowDir;
        flags.push({ x, dir: fdir, base: tier[1] - 4 * G.u, pole: G.h * (.09 + rnd() * .05), L: fl, H: G.h * .045, ph: rnd() * 6.28, sp: .8 + rnd() * .5 });
      }
    }
    // fumogeni davanti alla curva (e qualcuno sui secondari)
    emitters = [];
    for (const k of [.18, .34, .5, .66, .82]) emitters.push({ x: m.x + m.w * k, y: G.tiers[2][1] - 14 * G.u, acc: rnd(), ph: rnd() * 6.28 });
    for (const z of lay.side) {
      if (z.y + z.h < G.ground - 1) continue;
      for (let i = 0; i < 2; i++) emitters.push({ x: z.x + z.w * (.25 + i * .5), y: G.tiers[2][1] - 14 * G.u, acc: rnd(), ph: rnd() * 6.28 });
    }
    smoke = []; rockets = []; bursts = [];
    // un po' di fumo già presente all'avvio
    for (let i = 0; i < 160; i++) { const e = emitters[i % emitters.length]; const p = makeSmoke(K, e); const t = rnd() * p.max; stepSmoke(p, t); smoke.push(p); }
  }

  /* ---------- fumo ---------- */
  function makeSmoke(K, e) {
    const u = G.u, tall = G.lay.mode === 3 && e.x < G.lay.main.x + G.lay.main.w;
    return { x: e.x + (Math.random() - .5) * 10 * u, y: e.y, vx: (Math.random() - .5) * 14 * u, vy: -(45 + Math.random() * 40) * u,
      r: 10 * u, gr: (7 + Math.random() * 6) * u, age: 0, max: tall ? 26 : 13 };
  }
  function stepSmoke(p, dt) { p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.gr * dt; p.age += dt; }

  /* ---------- fuochi d'artificio ---------- */
  function launchRocket(K) {
    const areas = skyAreas(), a = areas[Math.random() < (areas.length > 1 ? .65 : 1) ? 0 : 1] || areas[0];
    const x = a.x + a.w * (.1 + Math.random() * .8);
    rockets.push({ x, y: G.roofTop, ty: a.y0 + Math.random() * (a.y1 - a.y0), k: a.k, col: K.pal.fire[(Math.random() * K.pal.fire.length) | 0] });
  }

  function burst(K, x, y, k, front) {
    const P = K.pal, u = G.u, sz = front ? 1 : lv('fireSize'), n = Math.round((60 + 40 * k) * sz);
    const c1 = P.fire[(Math.random() * P.fire.length) | 0], c2 = P.fire[(Math.random() * P.fire.length) | 0];
    const parts = [];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, s = (60 + Math.random() * 170) * u * (.55 + .45 * k) * (.6 + .4 * sz);
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, col: i % 3 ? c1 : c2 });
    }
    bursts.push({ parts, life: 1.8 + Math.random() * .6, age: 0, front, flash: { x, y } });
  }

  function drawFireworks(ctx, K, front) {
    const u = G.u, dt = K._frameDt;
    ctx.globalCompositeOperation = 'lighter';
    if (!front) for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      r.y -= 520 * u * K.dt * (r.k < 1 ? .7 : 1.2);
      ctx.strokeStyle = K.rgba(r.col, .8); ctx.lineWidth = 2 * u;
      ctx.beginPath(); ctx.moveTo(r.x, r.y); ctx.lineTo(r.x, r.y + 22 * u); ctx.stroke();
      if (r.y <= r.ty) { rockets.splice(i, 1); burst(K, r.x, r.y, r.k, false); }
    }
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      if (b.front !== front) continue;
      b.age += dt;
      if (b.age >= b.life) { bursts.splice(i, 1); continue; }
      const k = 1 - b.age / b.life, drag = Math.exp(-dt * 1.3);
      if (b.age < .12) {
        const g = ctx.createRadialGradient(b.flash.x, b.flash.y, 0, b.flash.x, b.flash.y, 90 * u);
        g.addColorStop(0, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.fillRect(b.flash.x - 90 * u, b.flash.y - 90 * u, 180 * u, 180 * u);
      }
      for (const p of b.parts) {
        p.vx *= drag; p.vy = p.vy * drag + 60 * u * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        ctx.globalAlpha = k * (.6 + .4 * Math.sin(b.age * 30 + p.x));
        ctx.fillStyle = p.col; ctx.fillRect(p.x, p.y, 2.4 * u, 2.4 * u);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ---------- ola ---------- */
  function olaX(K) {
    const span = K.W + 1000, pos = ((K.t * 300 * G.u) % span) - 500;
    return G.lay.flowDir > 0 ? pos : K.W - pos;
  }
  const bump = (x, wx) => Math.exp(-Math.pow((x - wx) / (120 * G.u), 2));

  /* ---------- disegno ---------- */
  function draw(ctx, K) {
    const P = K.pal, W = K.W, H = K.H, u = G.u, dpr = K.dpr;
    ctx.drawImage(skyL.c, 0, 0, W, H);

    ctx.fillStyle = '#fff';
    for (const s of stars) { ctx.globalAlpha = .25 + .5 * Math.abs(Math.sin(K.real * .6 + s.p)); ctx.fillRect(s.x, s.y, s.r, s.r); }
    for (const s of seven) {
      ctx.globalAlpha = .7 + .3 * Math.sin(K.real * 1.5 + s.p);
      starPath(ctx, s.x, s.y, s.r); ctx.fillStyle = P.star; ctx.fill();
    }
    ctx.globalAlpha = 1;

    // fasci di luce rossoneri dal tetto della curva verso il cielo (con 3 schermi salgono in quello di sopra)
    const lay = G.lay, m = lay.main, top3 = lay.mode === 3;
    const beamLen = top3 ? (G.roofTop - lay.top.y) * 1.05 : (G.roofTop - G.Y) * 1.6;
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 4; k++) {
      const bx = m.x + m.w * (.14 + k * .24), a = -Math.PI / 2 - .08 + .32 * Math.sin(K.t * .28 + k * 1.7), sp = .045;
      const col = k % 2 ? P.light : P.fire[0];
      const g = ctx.createLinearGradient(bx, G.roofTop, bx + Math.cos(a) * beamLen, G.roofTop + Math.sin(a) * beamLen);
      g.addColorStop(0, K.rgba(col, (.2 + K.bass * .15) * lv('beams'))); g.addColorStop(1, K.rgba(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(bx, G.roofTop);
      ctx.lineTo(bx + Math.cos(a - sp) * beamLen, G.roofTop + Math.sin(a - sp) * beamLen);
      ctx.lineTo(bx + Math.cos(a + sp) * beamLen, G.roofTop + Math.sin(a + sp) * beamLen);
      ctx.closePath(); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    // fuochi automatici e a tempo di musica
    nextRocket -= K.dt; fireCooldown -= K._frameDt;
    if (nextRocket <= 0) {
      const [a, b] = lv('fireEvery');                      // con 3 schermi un po' più spesso: c'è più cielo
      launchRocket(K); nextRocket = (a + Math.random() * (b - a)) * (top3 ? .7 : 1);
    }
    if (lv('fireBass') && K.bass > .55 && fireCooldown <= 0) { launchRocket(K); fireCooldown = .5; }
    drawFireworks(ctx, K, false);

    // pubblico + ola
    const ch = G.standBot - G.standTop, wx = olaX(K), sw = 8;
    ctx.drawImage(crowdL.c, 0, G.standTop, W, ch);
    for (let x = Math.floor((wx - 300 * u) / sw) * sw; x < wx + 300 * u; x += sw) {
      if (x < 0 || x >= W) continue;
      const b = bump(x, wx);
      if (b < .03) continue;
      ctx.drawImage(crowdL.c, x * dpr, 0, sw * dpr, crowdL.c.height, x, G.standTop - b * 9 * u, sw, ch);
      ctx.fillStyle = `rgba(255,255,255,${.08 * b * lv('ola')})`; ctx.fillRect(x, G.standTop - b * 9 * u, sw, ch);
    }

    // coreografia che sventola (si alza anche lei quando passa la ola)
    const c = choreo, cs = 8, amp = 1.8 * u * (1 + K.mid * 1.5) * lv('wave');
    for (let sx = 0; sx < c.w; sx += cs) {
      const x = c.x + sx, wave = Math.sin(sx * .03 + K.t * 2.2);
      const dy = wave * amp - bump(x, wx) * 10 * u;
      const w = Math.min(cs, c.w - sx);
      ctx.drawImage(c.img.c, sx * dpr, 0, w * dpr, c.img.c.height, x, c.y + dy, w, c.h);
      ctx.fillStyle = `rgba(0,0,0,${.14 * (.5 + .5 * Math.sin(sx * .03 + K.t * 2.2 + 1.2))})`;
      ctx.fillRect(x, c.y + dy, w, c.h);
    }

    // parapetti tra gli anelli
    for (let i = 0; i < 2; i++) {
      const y0 = G.tiers[i][1], y1 = G.tiers[i + 1][0];
      ctx.fillStyle = P.stand; ctx.fillRect(0, y0, W, y1 - y0);
      ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(0, y0, W, 1.5 * u);
    }

    // luci dei telefoni
    ctx.fillStyle = '#fff';
    for (const p of phones) {
      const a = Math.pow(Math.max(0, Math.sin(K.real * p.f + p.ph)), 6) * (.5 + K.level);
      if (a < .05) continue;
      ctx.globalAlpha = Math.min(1, a); ctx.fillRect(p.x, p.y, 2 * u, 2 * u);
    }
    ctx.globalAlpha = 1;

    // bandiere al vento
    const dir = G.lay.flowDir;
    for (const f of flags) {
      const top = f.base - f.pole;
      ctx.strokeStyle = '#8a8a8a'; ctx.lineWidth = 2 * u;
      ctx.beginPath(); ctx.moveTo(f.x, f.base); ctx.lineTo(f.x, top); ctx.stroke();
      const seg = 12, ptsT = [], ptsB = [];
      for (let i = 0; i <= seg; i++) {
        const q = i / seg, wv = Math.sin(q * 5 - K.t * 6 * f.sp * (1 + K.mid) + f.ph) * f.H * .25 * q;
        const x = f.x + f.dir * q * f.L;
        ptsT.push([x, top + wv]); ptsB.push([x, top + f.H + wv * 1.1]);
      }
      const mid = ptsT.map(([x, y], i) => [x, (y + ptsB[i][1]) / 2]);
      ctx.fillStyle = P.flag[0]; ctx.beginPath();
      ptsT.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      for (let i = mid.length - 1; i >= 0; i--) ctx.lineTo(mid[i][0], mid[i][1]);
      ctx.fill();
      ctx.fillStyle = P.flag[1]; ctx.beginPath();
      mid.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      for (let i = ptsB.length - 1; i >= 0; i--) ctx.lineTo(ptsB[i][0], ptsB[i][1]);
      ctx.fill();
    }

    // tabelloni LED a bordo campo: scorrono verso il principale (la porta poi ci sta davanti)
    const lw = ledTile.w, lh = G.adBot - G.adTop, off = (K.t * 80 * u) % lw;
    ctx.globalAlpha = lv('led');
    for (let x = dir > 0 ? off - lw : -off; x < W; x += lw) ctx.drawImage(ledTile.c, x, G.adTop, lw, lh);
    ctx.globalAlpha = 1;

    ctx.drawImage(frontL.c, 0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = K.clamp(lv('glow') * (1 + K.bass * .15), 0, 1);
    ctx.drawImage(glowL.c, 0, 0, W, H);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // fumogeni
    if (K.props.fumogeni) {
      const rate = 3 * K.speed;
      for (const e of emitters) {
        e.acc += K._frameDt * rate;
        while (e.acc > 1 && smoke.length < 600) { e.acc -= 1; smoke.push(makeSmoke(K, e)); }
      }
    }
    for (let i = smoke.length - 1; i >= 0; i--) {
      const p = smoke[i];
      stepSmoke(p, K._frameDt * (.7 + K.speed * .3));
      if (p.age > p.max || !K.visible(p.x, p.y - p.r * .5) && p.y < G.Y) { smoke.splice(i, 1); continue; }
      ctx.globalAlpha = .22 * lv('smoke') * Math.min(1, p.age / 1.2) * (1 - p.age / p.max);
      ctx.drawImage(smokeSprite.c, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
    }
    ctx.globalAlpha = 1;
    if (K.props.fumogeni) {
      ctx.globalCompositeOperation = 'lighter';
      for (const e of emitters) {
        const fl = 1 + .25 * Math.sin(K.real * 23 + e.ph) + .15 * Math.sin(K.real * 37 + e.ph * 2);
        const r = 16 * u * fl, g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r * 3);
        const fa = lv('flare');
        g.addColorStop(0, `rgba(255,255,255,${.95 * fa})`); g.addColorStop(.15, K.rgba(P.smoke, .9 * fa)); g.addColorStop(1, K.rgba(P.smoke, 0));
        ctx.fillStyle = g; ctx.fillRect(e.x - r * 3, e.y - r * 3, r * 6, r * 6);
        ctx.fillStyle = '#ffd9a0';
        for (let k = 0; k < 4; k++) ctx.fillRect(e.x + Math.sin(K.real * 17 + k * 9 + e.ph) * 10 * u, e.y - ((K.real * 90 + k * 25) % 40) * u, 1.5 * u, 1.5 * u);
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    drawFireworks(ctx, K, true);
    drawScoreboard(ctx, K);
  }

  /* ---------- tabellone con orologio ---------- */
  function drawScoreboard(ctx, K) {
    const P = K.pal, m = G.lay.main, u = G.u;
    const w = Math.min(m.w * .34, G.h * .62), h = G.h * .15, x = m.cx - w / 2, y = G.Y + G.h * .113;
    ctx.fillStyle = '#050506'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#2a2a30'; ctx.lineWidth = 4 * u; ctx.strokeRect(x, y, w, h);
    ctx.save(); ctx.beginPath(); ctx.rect(x + 4 * u, y + 4 * u, w - 8 * u, h - 8 * u); ctx.clip();
    ctx.textBaseline = 'middle';
    const ck = K.clock();
    if (K.props.orologio) {
      ctx.textAlign = 'center';
      ctx.font = `700 ${h * .5}px ${SANS}`; ctx.fillStyle = P.led; ctx.shadowColor = P.led; ctx.shadowBlur = 14 * u;
      ctx.fillText(ck.time, m.cx, y + h * .4);
      ctx.shadowBlur = 0;
      // striscia che scorre con data e scritta
      const tick = `${ck.date.toUpperCase()}   ★   ${scritta(K)}   ★   `;
      ctx.font = `600 ${h * .16}px ${SANS}`; ctx.fillStyle = P.led2; ctx.textAlign = 'left';
      const tw = ctx.measureText(tick).width, off = (K.real * 60 * u) % tw;
      for (let tx = x - off; tx < x + w; tx += tw) ctx.fillText(tick, tx, y + h * .82);
    } else {
      ctx.textAlign = 'center'; ctx.font = `800 ${h * .34}px ${SANS}`; ctx.fillStyle = P.led;
      ctx.shadowColor = P.led; ctx.shadowBlur = 12 * u; ctx.fillText(scritta(K), m.cx, y + h * .52); ctx.shadowBlur = 0;
    }
    if (lv('blink') && Math.sin(K.real * 4) > 0) { ctx.fillStyle = '#ff2b3d'; ctx.beginPath(); ctx.arc(x + 14 * u, y + 14 * u, 4 * u, 0, 6.283); ctx.fill(); }
    // griglia LED
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    for (let gx = x; gx < x + w; gx += 3 * u) ctx.fillRect(gx, y, u, h);
    ctx.restore();
  }

  // fuochi d'artificio dove clicchi
  addEventListener('pointerdown', (e) => {
    if (!Kit.props.mouse || !G) return;
    burst(Kit, e.clientX, e.clientY, 1, true);
  });

  Kit.start({
    palettes: PALETTES,
    defaults: { scritta: 'FORZA MILAN', fumogeni: true },
    build, draw,
    onProp(name, val) {
      if (name === 'scritta' && G) { buildChoreo(Kit); buildLed(Kit); }
      if (name === 'stemma') loadStemma(val);
    },
  });
  // nel browser lo stemma si prova con ?stemma=stemma/nomefile.png
  if (Kit.props.stemma) loadStemma(Kit.props.stemma);
})();

/* Bruma — nebbie di colore che si muovono piano, con un cruscotto discreto.
 *
 * Cruscotto (shared/info.js): orologio, calendario del mese con festività e settimana,
 * CPU/GPU/RAM/rete e brano in riproduzione (da Lively), meteo se imposti una città.
 *
 * Flusso tra gli schermi:
 *  - le nebbie si spostano lentamente su tutti gli schermi; il pulviscolo scorre verso il principale
 *  - con più schermi il cruscotto va sui secondari e il principale resta libero per le icone
 */
(function () {
  'use strict';

  const PALETTES = [
    { name: 'Lavanda', bg: ['#17141f', '#0b0a11'], blobs: ['#7d6bb5', '#a879a6', '#4f68a6', '#6a5c9a'], accent: '#c9b8ff', onAccent: '#17141f' },
    { name: 'Salvia', bg: ['#101714', '#080c0a'], blobs: ['#5d8c78', '#8aa479', '#3f787c', '#6b8867'], accent: '#b8dcc6', onAccent: '#101714' },
    { name: 'Notte', bg: ['#0b0f19', '#05070c'], blobs: ['#2f4f8f', '#4a3f8f', '#1f6c8a', '#3a5a7f'], accent: '#a3c6ff', onAccent: '#0b0f19' },
    { name: 'Sabbia', bg: ['#1a1612', '#0d0b09'], blobs: ['#9c7d5d', '#b38d78', '#7d6853', '#bd9d78'], accent: '#f0d4ac', onAccent: '#1a1612' },
  ];

  const LIVELLI = {
    blob:  [.75, .88, 1],      // intensità delle nebbie
    music: [.2, .5, 1],        // quanto "respirano" con la musica
    dust:  [.5, .8, 1],        // pulviscolo
  };
  const lv = (k) => Kit.pick(LIVELLI[k]);

  let blobs = [], sprites = [], dust = [];

  function build(ctx, K) {
    const P = K.pal, rnd = K.seeded(314), lay = K.layout();
    // uno sprite sfumato per colore, poi disegnato in grande: costa pochissimo
    sprites = P.blobs.map((col) => {
      const s = K.offscreen(256, 256), g = s.x.createRadialGradient(128, 128, 0, 128, 128, 128);
      g.addColorStop(0, K.rgba(col, 1)); g.addColorStop(.45, K.rgba(col, .45)); g.addColorStop(1, K.rgba(col, 0));
      s.x.fillStyle = g; s.x.fillRect(0, 0, 256, 256);
      return s;
    });
    blobs = [];
    for (const z of lay.zones) for (let i = 0; i < 3; i++) {
      blobs.push({
        ax: z.x + z.w * (.15 + rnd() * .7), ay: z.y + z.h * (.15 + rnd() * .7), r: z.s * (.38 + rnd() * .3),
        rx: z.w * (.1 + rnd() * .12), ry: z.h * (.08 + rnd() * .1), fx: .6 + rnd() * .8, fy: .5 + rnd() * .8,
        ph: rnd() * 6.28, sp: (blobs.length) % sprites.length, a: .5 + rnd() * .5,
      });
    }
    dust = Array.from({ length: Math.round(K.W * K.H / 26000) }, () => ({ x: rnd() * K.W, y: rnd() * K.H, v: 3 + rnd() * 7, r: .6 + rnd() * 1.2, ph: rnd() * 6.28 }));
  }

  function draw(ctx, K) {
    const P = K.pal, W = K.W, H = K.H, lay = K.layout();
    let g = ctx.createLinearGradient(0, 0, W * .3, H);
    g.addColorStop(0, P.bg[0]); g.addColorStop(1, P.bg[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // nebbie: traiettorie lente e sovrapposte in modalità "screen" (si schiariscono senza bruciare)
    const t = K.t * .05, breathe = 1 + K.level * .25 * lv('music');
    ctx.globalCompositeOperation = 'screen';
    for (const b of blobs) {
      const x = b.ax + Math.cos(t * b.fx + b.ph) * b.rx, y = b.ay + Math.sin(t * b.fy + b.ph * 1.3) * b.ry;
      const r = b.r * breathe * (1 + .06 * Math.sin(t * 1.7 + b.ph));
      ctx.globalAlpha = .62 * b.a * lv('blob');
      ctx.drawImage(sprites[b.sp].c, x - r, y - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';

    // pulviscolo che scorre piano verso il principale
    ctx.fillStyle = '#ffffff';
    for (const d of dust) {
      d.x += lay.flowDir * d.v * K.dt; d.y += Math.sin(K.t * .3 + d.ph) * 2 * K.dt;
      if (d.x > W + 5) d.x = -5; else if (d.x < -5) d.x = W + 5;
      if (!K.visible(d.x, d.y)) continue;
      ctx.globalAlpha = (.08 + .1 * Math.sin(K.real * .4 + d.ph)) * lv('dust');
      ctx.fillRect(d.x, d.y, d.r, d.r);
    }
    ctx.globalAlpha = 1;

    // vignettatura leggera su ogni schermo
    for (const z of lay.zones) {
      g = ctx.createRadialGradient(z.cx, z.cy, z.s * .35, z.cx, z.cy, Math.hypot(z.w, z.h) * .6);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.35)');
      ctx.fillStyle = g; ctx.fillRect(z.x, z.y, z.w, z.h);
    }

    drawInfo(ctx, K, lay, P);
  }

  function drawInfo(ctx, K, lay, P) {
    const C = {
      text: '#eef0f6', dim: 'rgba(238,240,246,.64)', accent: P.accent, onAccent: P.onAccent,
      panel: 'rgba(255,255,255,.05)', line: 'rgba(255,255,255,.11)',
      sun: '#ffd27a', moon: '#e8ecf5', cloud: 'rgba(236,240,248,.92)', cloudDark: 'rgba(170,180,196,.92)', rain: '#9cc8ff', snow: '#ffffff',
    };
    const p = K.props;
    const on = (n) => ({ clock: p.orologio, calendar: p.calendario, system: p.sistema, track: p.musica, weather: true })[n] !== false;
    const col = (...names) => names.filter(on);
    const box = (z, fx, fy, fw, fh) => ({ x: z.x + z.w * fx, y: z.y + z.h * fy, w: z.w * fw, h: z.h * fh });
    if (lay.mode === 1) {
      Info.stack(ctx, K, box(lay.main, .72, .04, .25, .92), col('clock', 'calendar', 'weather', 'system', 'track'), C, 'right');
    } else if (lay.mode === 4) {
      // 2 schermi verticali: cruscotto sul monitor di sopra, il principale resta alle icone
      Info.stack(ctx, K, box(lay.top, .05, .06, .3, .88), col('clock', 'calendar'), C);
      Info.stack(ctx, K, box(lay.top, .63, .06, .32, .88), col('weather', 'system', 'track'), C);
    } else if (lay.mode === 2) {
      const z = lay.left;
      Info.stack(ctx, K, box(z, .08, .08, .38, .84), col('clock', 'calendar'), C);
      Info.stack(ctx, K, box(z, .54, .08, .38, .84), col('weather', 'system', 'track'), C);
    } else {
      Info.stack(ctx, K, box(lay.top, .06, .08, .4, .84), col('clock', 'calendar'), C);
      Info.stack(ctx, K, box(lay.top, .54, .08, .4, .4), col('weather'), C);
      Info.stack(ctx, K, box(lay.right, .56, .08, .38, .84), col('system', 'track'), C);
    }
  }

  const veil = [{ b: .9, s: .88, c: .97 }, { b: .96, s: .95, c: 1 }, { b: 1, s: 1, c: 1 }];
  Kit.start({
    palettes: PALETTES, veil, build, draw, layouts: [4],
    defaults: { citta: '', calendario: true, sistema: true, musica: true },
    onProp(name, val) { if (name === 'citta') Info.setCity(val); },
  });
  Info.setCity(Kit.props.citta);
})();

/* Neon City — skyline cyberpunk con parallasse, pioggia, insegne e auto volanti. */
(function () {
  'use strict';

  const PALETTES = [
    { name: 'Neon', skyTop: '#07001a', skyBot: '#3b0b4f', haze: '#ff2bd6', moon: '#ffd6f5',
      layers: ['#1d0c38', '#120624', '#070210'], win: ['#ffb347', '#ff6ec7', '#7af3ff'],
      neon: ['#ff2bd6', '#00f0ff', '#ffe600', '#7b61ff'], rain: '#b9a7ff', street: '#ff2bd6' },
    { name: 'Notturno', skyTop: '#01030a', skyBot: '#0c1d33', haze: '#3d7bff', moon: '#dfe8ff',
      layers: ['#0d1828', '#08101c', '#04080f'], win: ['#c9d6ff', '#8fb3ff', '#ffe9b0'],
      neon: ['#3d7bff', '#7a5cff', '#00c2a8', '#9ad1ff'], rain: '#8fa8cc', street: '#3d7bff' },
    { name: 'Pastello', skyTop: '#2d2457', skyBot: '#e79bc0', haze: '#ffc4e1', moon: '#fff4e0',
      layers: ['#5b4a86', '#43366b', '#2c2350'], win: ['#fff0d6', '#ffd6ec', '#d6f6ff'],
      neon: ['#ffb3da', '#a8f0ff', '#fff3a8', '#c9b6ff'], rain: '#f3e8ff', street: '#ffb3da' },
    { name: 'Mono', skyTop: '#000000', skyBot: '#001a1f', haze: '#00e5ff', moon: '#c8faff',
      layers: ['#04191d', '#021014', '#01080a'], win: ['#00e5ff', '#7ff3ff'],
      neon: ['#00e5ff', '#7ff3ff'], rain: '#4fd8e8', street: '#00e5ff' },
  ];

  const WORDS = ['BAR', 'HOTEL', '24H', 'RAMEN', 'CLUB', 'ARCADE', 'PIXEL', 'CYBER', 'DATA',
    'OPEN', 'LIVE', 'GAME', 'NET', 'LOOT', 'XP', 'NOVA'];

  const LAYERS = [
    { hMin: .22, hMax: .46, wMin: 40, wMax: 110, cw: 7, ch: 9, ww: 3, wh: 4, lit: .22, speed: 5, signs: 0 },
    { hMin: .28, hMax: .58, wMin: 60, wMax: 150, cw: 10, ch: 13, ww: 5, wh: 6, lit: .28, speed: 12, signs: .18 },
    { hMin: .40, hMax: .72, wMin: 100, wMax: 230, cw: 14, ch: 18, ww: 7, wh: 9, lit: .32, speed: 26, signs: .4 },
  ];

  let layers = [], cars = [], drops = [], stars = [], L = 0;

  /* ---------- costruzione scena ---------- */

  function drawBuilding(K, s, l, bx, b, cfg, idx) {
    const P = K.pal, H = K.H, r = K.seeded(b.seed);
    const top = H - b.h;
    s.fillStyle = P.layers[idx];
    s.fillRect(bx, top, b.w, b.h + 1);
    if (r() < .4) { const ah = 18 + r() * 50; s.fillRect(bx + b.w * (.2 + r() * .6), top - ah, 2, ah); }
    if (r() < .35) { const hh = 8 + r() * 16; s.fillRect(bx + b.w * (.1 + r() * .3), top - hh, b.w * (.25 + r() * .3), hh + 1); }

    const cols = Math.floor((b.w - 6) / cfg.cw), rows = Math.floor((b.h - 10) / cfg.ch);
    const ox = bx + (b.w - cols * cfg.cw) / 2 + (cfg.cw - cfg.ww) / 2;
    const frac = cfg.lit * (.4 + r() * 1.2);
    for (let rr = 0; rr < rows; rr++) {
      const rowOn = r() < .85;
      for (let cc = 0; cc < cols; cc++) {
        if (rowOn && r() < frac) {
          l.fillStyle = K.rgba(P.win[(r() * P.win.length) | 0], .45 + r() * .55);
          l.fillRect(ox + cc * cfg.cw, top + 8 + rr * cfg.ch, cfg.ww, cfg.wh);
        } else r();
      }
    }
  }

  function makeSign(K, rnd, x, y, size, col) {
    const word = WORDS[(rnd() * WORDS.length) | 0];
    const vertical = rnd() < .6;
    const fs = size, pad = fs * .45;
    const w = vertical ? fs * 1.5 : word.length * fs * .78 + pad * 2;
    const h = vertical ? word.length * fs * 1.05 + pad * 2 : fs * 1.6;
    const g = 24;
    const img = K.offscreen(w + g * 2, h + g * 2), c = img.x;
    c.fillStyle = 'rgba(0,0,0,.6)';
    c.fillRect(g, g, w, h);
    c.shadowColor = col; c.shadowBlur = 16;
    c.strokeStyle = col; c.lineWidth = 2;
    c.strokeRect(g + 1, g + 1, w - 2, h - 2);
    c.fillStyle = col;
    c.font = `700 ${fs}px "Segoe UI", Arial, sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let k = 0; k < 2; k++) {
      if (vertical) for (let i = 0; i < word.length; i++) c.fillText(word[i], g + w / 2, g + pad + fs * .55 + i * fs * 1.05);
      else c.fillText(word, g + w / 2, g + h / 2 + 1);
    }
    return { x, y, img, g, ph: rnd() * 100, glitchy: rnd() < .25 };
  }

  function buildLayer(K, cfg, idx, rnd) {
    const H = K.H;
    const sil = K.offscreen(L, H), lights = K.offscreen(L, H);
    const bs = [], signs = [];
    let x = 0;
    while (x < L) {
      const w = cfg.wMin + rnd() * (cfg.wMax - cfg.wMin);
      const h = H * (cfg.hMin + rnd() * (cfg.hMax - cfg.hMin));
      bs.push({ x, w, h, seed: (rnd() * 1e9) | 0 });
      x += w + (rnd() < .3 ? rnd() * 30 : -rnd() * 10);
    }
    for (const b of bs) {
      for (const dx of [0, -L]) {
        const bx = b.x + dx;
        if (bx > L || bx + b.w < 0) continue;
        drawBuilding(K, sil.x, lights.x, bx, b, cfg, idx);
      }
      if (rnd() < cfg.signs) {
        const size = idx === 2 ? 15 + rnd() * 8 : 10 + rnd() * 4;
        const col = K.pal.neon[(rnd() * K.pal.neon.length) | 0];
        signs.push(makeSign(K, rnd, b.x + b.w * (.1 + rnd() * .5), H - b.h + 20 + rnd() * b.h * .35, size, col));
      }
    }
    return { cfg, sil, lights, signs };
  }

  function build(ctx, K) {
    const rnd = K.seeded(1337);
    L = Math.max(K.W, 2400);
    layers = LAYERS.map((cfg, i) => buildLayer(K, cfg, i, rnd));

    stars = Array.from({ length: Math.round(K.W / 12) }, () => ({
      x: rnd() * K.W, y: rnd() * K.H * .45, r: .5 + rnd() * 1.1, p: rnd() * 6.28 }));

    cars = Array.from({ length: Math.max(6, Math.round(K.W / 240)) }, () => ({
      x: rnd() * K.W, y: K.H * (.12 + rnd() * .42), z: .3 + rnd() * .7, dir: rnd() < .5 ? 1 : -1 }));

    const n = Math.min(3000, Math.round(K.W * K.H / 2800));
    drops = Array.from({ length: n }, () => ({
      x: rnd() * K.W, y: rnd() * K.H, l: 8 + rnd() * 18, v: 550 + rnd() * 600, a: .15 + rnd() * .35 }));
  }

  /* ---------- disegno ---------- */

  function drawTiled(ctx, K, layer) {
    const off = (K.t * layer.cfg.speed) % L;
    for (const ox of [-off, -off + L]) {
      if (ox > K.W || ox + L < 0) continue;
      ctx.drawImage(layer.sil.c, ox, 0, L, K.H);
    }
    ctx.globalAlpha = K.clamp(.8 + K.bass * .6, 0, 1);
    ctx.globalCompositeOperation = 'lighter';
    for (const ox of [-off, -off + L]) {
      if (ox > K.W || ox + L < 0) continue;
      ctx.drawImage(layer.lights.c, ox, 0, L, K.H);
    }
    // insegne
    for (const s of layer.signs) {
      let a = .85 + .15 * Math.sin(K.real * 2 + s.ph);
      if (s.glitchy && Math.sin(K.real * 9 + s.ph) * Math.sin(K.real * 5.3 + s.ph * 2) > .55) a = .12;
      ctx.globalAlpha = K.clamp(a * (1 + K.mid * .5), 0, 1);
      for (const ox of [-off, -off + L]) {
        const x = s.x + ox - s.g;
        if (x > K.W || x + s.img.w < 0) continue;
        ctx.drawImage(s.img.c, x, s.y - s.g, s.img.w, s.img.h);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function draw(ctx, K) {
    const P = K.pal, W = K.W, H = K.H, lay = K.layout();

    // cielo
    let g = ctx.createLinearGradient(0, 0, 0, H * .8);
    g.addColorStop(0, P.skyTop); g.addColorStop(1, P.skyBot);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#fff';
    for (const s of stars) {
      ctx.globalAlpha = (.25 + .5 * Math.abs(Math.sin(K.real * .7 + s.p))) * (1 - s.y / (H * .5));
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }
    ctx.globalAlpha = 1;

    // luna
    const z = lay.info;
    const mx = K.screens === 1 ? z.x + z.w * .78 : z.cx + z.w * .18, my = H * .2, mr = z.s * .07;
    g = ctx.createRadialGradient(mx, my, mr * .5, mx, my, mr * 5);
    g.addColorStop(0, K.rgba(P.moon, .35)); g.addColorStop(1, K.rgba(P.moon, 0));
    ctx.fillStyle = g; ctx.fillRect(mx - mr * 5, my - mr * 5, mr * 10, mr * 10);
    ctx.fillStyle = P.moon; ctx.beginPath(); ctx.arc(mx, my, mr, 0, 6.283); ctx.fill();

    drawTiled(ctx, K, layers[0]);

    g = ctx.createLinearGradient(0, H * .45, 0, H);
    g.addColorStop(0, K.rgba(P.haze, 0)); g.addColorStop(1, K.rgba(P.haze, .14 + K.bass * .1));
    ctx.fillStyle = g; ctx.fillRect(0, H * .45, W, H * .55);

    drawTiled(ctx, K, layers[1]);

    // auto volanti
    ctx.lineCap = 'round';
    for (const c of cars) {
      c.x += c.dir * (50 + 150 * c.z) * K.dt;
      if (c.x > W + 120) c.x = -120; else if (c.x < -120) c.x = W + 120;
      const len = 40 * c.z, w = 1 + 2 * c.z;
      ctx.strokeStyle = K.rgba(P.neon[0], .35 * c.z);
      ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x - c.dir * len, c.y); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.fillRect(c.x - w, c.y - w / 2, w * 2, w);
      ctx.fillStyle = 'rgba(255,60,90,.9)';
      ctx.fillRect(c.x - c.dir * len * .3 - w / 2, c.y - w / 2, w, w);
    }

    drawTiled(ctx, K, layers[2]);

    // strada
    g = ctx.createLinearGradient(0, H * .86, 0, H);
    g.addColorStop(0, K.rgba(P.street, 0)); g.addColorStop(1, K.rgba(P.street, .28 + K.bass * .2));
    ctx.fillStyle = g; ctx.fillRect(0, H * .86, W, H * .14);

    // pioggia
    if (K.props.pioggia) {
      ctx.strokeStyle = K.rgba(P.rain, .35); ctx.lineWidth = 1;
      ctx.beginPath();
      for (const d of drops) {
        d.y += d.v * K.dt; d.x += d.v * .12 * K.dt;
        if (d.y > H) { d.y = -d.l; d.x = Math.random() * (W + 100) - 100; }
        ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - d.l * .12, d.y - d.l);
      }
      ctx.stroke();
    }

    // orologio come insegna al neon
    if (K.props.orologio) {
      const m = lay.main, ck = K.clock();
      const fs = m.s * .14, cy = H * .15;
      const flick = Math.sin(K.real * 23) > .97 ? .55 : 1;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `200 ${fs}px "Segoe UI", Arial, sans-serif`;
      ctx.shadowColor = P.neon[0]; ctx.shadowBlur = 30 + K.bass * 30;
      ctx.fillStyle = K.rgba(P.neon[0], .9 * flick);
      ctx.fillText(ck.time, m.cx, cy);
      ctx.shadowBlur = 8; ctx.fillStyle = K.rgba('#ffffff', .85 * flick);
      ctx.fillText(ck.time, m.cx, cy);
      ctx.font = `400 ${fs * .2}px "Segoe UI", Arial, sans-serif`;
      ctx.shadowColor = P.neon[1 % P.neon.length]; ctx.shadowBlur = 14;
      ctx.fillStyle = P.neon[1 % P.neon.length];
      ctx.fillText(ck.date.toUpperCase().split('').join(' '), m.cx, cy + fs * .62);
      ctx.shadowBlur = 0;
    }
  }

  Kit.start({ palettes: PALETTES, defaults: { pioggia: true }, build, draw });
})();

/* Neon City — skyline cyberpunk con parallasse, pioggia, insegne, auto volanti e una megatorre.
 *
 * Flusso tra gli schermi:
 *  - la città e il traffico scorrono verso lo schermo principale
 *  - la megatorre sta sul principale; con 3 schermi sale fino allo schermo di sopra
 *    e gli "ascensori di luce" la percorrono dal basso verso l'alto
 */
(function () {
  'use strict';

  const PALETTES = [
    { name: 'Neon', skyTop: '#05000f', skyBot: '#3b0b4f', haze: '#ff2bd6', moon: '#ffd6f5',
      layers: ['#1d0c38', '#120624', '#070210'], tower: '#241046', win: ['#ffb347', '#ff6ec7', '#7af3ff'],
      neon: ['#ff2bd6', '#00f0ff', '#ffe600', '#7b61ff'], rain: '#b9a7ff', street: '#ff2bd6' },
    { name: 'Notturno', skyTop: '#000106', skyBot: '#0c1d33', haze: '#3d7bff', moon: '#dfe8ff',
      layers: ['#0d1828', '#08101c', '#04080f'], tower: '#122036', win: ['#c9d6ff', '#8fb3ff', '#ffe9b0'],
      neon: ['#3d7bff', '#7a5cff', '#00c2a8', '#9ad1ff'], rain: '#8fa8cc', street: '#3d7bff' },
    { name: 'Pastello', skyTop: '#221b45', skyBot: '#e79bc0', haze: '#ffc4e1', moon: '#fff4e0',
      layers: ['#5b4a86', '#43366b', '#2c2350'], tower: '#4e3f7c', win: ['#fff0d6', '#ffd6ec', '#d6f6ff'],
      neon: ['#ffb3da', '#a8f0ff', '#fff3a8', '#c9b6ff'], rain: '#f3e8ff', street: '#ffb3da' },
    { name: 'Mono', skyTop: '#000000', skyBot: '#001a1f', haze: '#00e5ff', moon: '#c8faff',
      layers: ['#04191d', '#021014', '#01080a'], tower: '#05252b', win: ['#00e5ff', '#7ff3ff'],
      neon: ['#00e5ff', '#7ff3ff'], rain: '#4fd8e8', street: '#00e5ff' },
  ];

  const WORDS = ['BAR', 'HOTEL', '24H', 'RAMEN', 'CLUB', 'ARCADE', 'PIXEL', 'CYBER', 'DATA',
    'OPEN', 'LIVE', 'GAME', 'NET', 'LOOT', 'XP', 'NOVA'];

  const LAYERS = [
    { hMin: .22, hMax: .46, wMin: 40, wMax: 110, cw: 7, ch: 9, ww: 3, wh: 4, lit: .22, speed: 5, signs: 0 },
    { hMin: .28, hMax: .58, wMin: 60, wMax: 150, cw: 10, ch: 13, ww: 5, wh: 6, lit: .28, speed: 12, signs: .18 },
    { hMin: .40, hMax: .72, wMin: 100, wMax: 230, cw: 14, ch: 18, ww: 7, wh: 9, lit: .32, speed: 26, signs: .4 },
  ];

  let layers = [], cars = [], drops = [], stars = [], lifts = [], tower, Lw = 0;

  /* ---------- palazzi (disegnati una volta in canvas fuori schermo) ---------- */

  function drawBuilding(K, s, l, bx, b, cfg, idx, rowH) {
    const P = K.pal, r = K.seeded(b.seed), top = rowH - b.h;
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
        }
      }
    }
  }

  function makeSign(K, rnd, x, y, size, col) {
    const word = WORDS[(rnd() * WORDS.length) | 0];
    const vertical = rnd() < .6;
    const fs = size, pad = fs * .45;
    const w = vertical ? fs * 1.5 : word.length * fs * .78 + pad * 2;
    const h = vertical ? word.length * fs * 1.05 + pad * 2 : fs * 1.6;
    const g = 24, img = K.offscreen(w + g * 2, h + g * 2), c = img.x;
    c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(g, g, w, h);
    c.shadowColor = col; c.shadowBlur = 16;
    c.strokeStyle = col; c.lineWidth = 2; c.strokeRect(g + 1, g + 1, w - 2, h - 2);
    c.fillStyle = col; c.font = `700 ${fs}px "Segoe UI", Arial, sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let k = 0; k < 2; k++) {
      if (vertical) for (let i = 0; i < word.length; i++) c.fillText(word[i], g + w / 2, g + pad + fs * .55 + i * fs * 1.05);
      else c.fillText(word, g + w / 2, g + h / 2 + 1);
    }
    return { x, y, img, g, ph: rnd() * 100, glitchy: rnd() < .25 };
  }

  function buildLayer(K, cfg, idx, rnd, rowH) {
    const sil = K.offscreen(Lw, rowH), lights = K.offscreen(Lw, rowH);
    const bs = [], signs = [];
    let x = 0;
    while (x < Lw) {
      const w = cfg.wMin + rnd() * (cfg.wMax - cfg.wMin);
      bs.push({ x, w, h: rowH * (cfg.hMin + rnd() * (cfg.hMax - cfg.hMin)), seed: (rnd() * 1e9) | 0 });
      x += w + (rnd() < .3 ? rnd() * 30 : -rnd() * 10);
    }
    for (const b of bs) {
      for (const dx of [0, -Lw]) {
        const bx = b.x + dx;
        if (bx > Lw || bx + b.w < 0) continue;
        drawBuilding(K, sil.x, lights.x, bx, b, cfg, idx, rowH);
      }
      if (rnd() < cfg.signs) {
        const size = (idx === 2 ? 15 + rnd() * 8 : 10 + rnd() * 4) * rowH / 1080;
        const col = K.pal.neon[(rnd() * K.pal.neon.length) | 0];
        signs.push(makeSign(K, rnd, b.x + b.w * (.1 + rnd() * .5), rowH - b.h + 20 + rnd() * b.h * .35, Math.max(9, size), col));
      }
    }
    return { cfg, sil, lights, signs };
  }

  /* ---------- megatorre ---------- */

  function buildTower(K, lay, rnd) {
    const P = K.pal, m = lay.main;
    const th = lay.mode === 3 ? lay.ground - (lay.top.y + lay.top.h * .12) : lay.rowH * .84;
    const bw = Math.min(m.w * .2, lay.rowH * .36), pad = 30;
    const img = K.offscreen(bw + pad * 2, th + pad), c = img.x, cx = bw / 2 + pad;
    const tiers = [[1, .34], [.8, .24], [.6, .18], [.42, .13], [.26, .08], [.12, .03]];
    let y = th + pad;
    const geo = [];
    for (const [wf, hf] of tiers) {
      const w = bw * wf, h = th * hf;
      y -= h;
      c.fillStyle = P.tower; c.fillRect(cx - w / 2, y, w, h + 1);
      c.fillStyle = K.rgba(P.neon[0], .55);
      c.fillRect(cx - w / 2, y, 2, h); c.fillRect(cx + w / 2 - 2, y, 2, h);
      c.fillRect(cx - w / 2, y, w, 2);
      for (let wy = y + 10; wy < y + h - 6; wy += 9)
        for (let wx = cx - w / 2 + 8; wx < cx + w / 2 - 8; wx += 7)
          if (rnd() < .3) { c.fillStyle = K.rgba(P.win[(rnd() * P.win.length) | 0], .3 + rnd() * .5); c.fillRect(wx, wy, 3, 4); }
      geo.push({ w, y });
    }
    c.fillStyle = P.tower; c.fillRect(cx - 1.5, y - th * .06, 3, th * .06);           // antenna
    tower = { img, x: m.x + m.w * .7, base: lay.ground, th, bw, pad, topY: lay.ground - th - th * .06 };
    lifts = Array.from({ length: 7 }, (_, i) => ({ lane: (i % 3) - 1, p: rnd(), sp: .6 + rnd() * .7 }));
  }

  function drawTower(ctx, K) {
    const P = K.pal, t = tower;
    // fari che spazzano il cielo (verso l'alto e a sinistra: mai nell'angolo senza schermo)
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 2; k++) {
      const a = -Math.PI / 2 - .25 - .45 * (.5 + .5 * Math.sin(K.t * .25 + k * 2.4)), len = t.th * .9, sp = .06;
      const g = ctx.createLinearGradient(t.x, t.topY, t.x + Math.cos(a) * len, t.topY + Math.sin(a) * len);
      g.addColorStop(0, K.rgba(P.neon[k % P.neon.length], .16)); g.addColorStop(1, K.rgba(P.neon[k % P.neon.length], 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(t.x, t.topY);
      ctx.lineTo(t.x + Math.cos(a - sp) * len, t.topY + Math.sin(a - sp) * len);
      ctx.lineTo(t.x + Math.cos(a + sp) * len, t.topY + Math.sin(a + sp) * len);
      ctx.closePath(); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(t.img.c, t.x - t.bw / 2 - t.pad, t.base - t.th - t.pad, t.img.w, t.img.h);

    // ascensori di luce: salgono lungo la torre (con 3 schermi passano dal principale a quello di sopra)
    ctx.globalCompositeOperation = 'lighter';
    for (const l of lifts) {
      l.p += K.dt * .045 * l.sp * (1 + K.bass);
      if (l.p > 1) l.p -= 1;
      const x = t.x + l.lane * t.bw * .045, y = t.base - t.th * (.04 + l.p * .9);
      const g = ctx.createLinearGradient(x, y, x, y + 60);
      g.addColorStop(0, K.rgba(P.neon[1 % P.neon.length], .9)); g.addColorStop(1, K.rgba(P.neon[1 % P.neon.length], 0));
      ctx.fillStyle = g; ctx.fillRect(x - 1.5, y, 3, 60);
      ctx.fillStyle = '#fff'; ctx.fillRect(x - 2, y - 3, 4, 6);
    }
    ctx.globalCompositeOperation = 'source-over';
    if (Math.sin(K.real * 3) > 0) {                                   // luce di segnalazione
      ctx.fillStyle = '#ff3355'; ctx.beginPath(); ctx.arc(t.x, t.topY, 3, 0, 6.283); ctx.fill();
    }
  }

  /* ---------- costruzione ---------- */

  function makeCar(K, lay, rnd) {
    const inTop = lay.mode === 3 && rnd() < .4;
    const y = inTop ? lay.top.y + lay.top.h * (.2 + rnd() * .65) : lay.rowY + lay.rowH * (.1 + rnd() * .42);
    const xmax = inTop ? lay.top.x + lay.top.w : K.W;
    return { x: rnd() * xmax, y, z: .3 + rnd() * .7, dir: rnd() < .82 ? lay.flowDir : -lay.flowDir, xmax };
  }

  function build(ctx, K) {
    const rnd = K.seeded(1337), lay = K.layout();
    Lw = Math.max(K.W, 2400);
    layers = LAYERS.map((cfg, i) => buildLayer(K, cfg, i, rnd, lay.rowH));
    buildTower(K, lay, rnd);

    const skyBottom = lay.rowY + lay.rowH * .5;
    stars = [];
    for (let i = 0; i < K.W * skyBottom / 9000; i++) {
      const x = rnd() * K.W, y = rnd() * skyBottom;
      if (K.visible(x, y)) stars.push({ x, y, r: .5 + rnd() * 1.1, p: rnd() * 6.28 });
    }
    cars = Array.from({ length: Math.max(8, Math.round(K.W * lay.zones.length / 700)) }, () => makeCar(K, lay, rnd));
    drops = Array.from({ length: Math.min(4000, Math.round(K.W * K.H / 2800)) }, () => ({
      x: rnd() * K.W, y: rnd() * K.H, l: 8 + rnd() * 18, v: 550 + rnd() * 600 }));
  }

  /* ---------- disegno ---------- */

  function drawTiled(ctx, K, layer, lay) {
    const off = (K.t * layer.cfg.speed) % Lw;
    const x0 = lay.flowDir < 0 ? -off : off - Lw;          // scorre verso lo schermo principale
    const y = lay.rowY, h = lay.rowH;
    for (const ox of [x0, x0 + Lw]) if (ox < K.W && ox + Lw > 0) ctx.drawImage(layer.sil.c, ox, y, Lw, h);
    ctx.globalAlpha = K.clamp(.8 + K.bass * .6, 0, 1);
    ctx.globalCompositeOperation = 'lighter';
    for (const ox of [x0, x0 + Lw]) if (ox < K.W && ox + Lw > 0) ctx.drawImage(layer.lights.c, ox, y, Lw, h);
    for (const s of layer.signs) {
      let a = .85 + .15 * Math.sin(K.real * 2 + s.ph);
      if (s.glitchy && Math.sin(K.real * 9 + s.ph) * Math.sin(K.real * 5.3 + s.ph * 2) > .55) a = .12;
      ctx.globalAlpha = K.clamp(a * (1 + K.mid * .5), 0, 1);
      for (const ox of [x0, x0 + Lw]) {
        const x = s.x + ox - s.g;
        if (x < K.W && x + s.img.w > 0) ctx.drawImage(s.img.c, x, y + s.y - s.g, s.img.w, s.img.h);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function draw(ctx, K) {
    const P = K.pal, W = K.W, H = K.H, lay = K.layout(), m = lay.main;

    // cielo unico su tutti gli schermi: più scuro in alto
    let g = ctx.createLinearGradient(0, 0, 0, lay.rowY + lay.rowH * .8);
    g.addColorStop(0, P.skyTop); g.addColorStop(1, P.skyBot);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#fff';
    for (const s of stars) {
      ctx.globalAlpha = (.25 + .5 * Math.abs(Math.sin(K.real * .7 + s.p))) * K.clamp(1.2 - s.y / (lay.rowY + lay.rowH * .5), 0, 1);
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }
    ctx.globalAlpha = 1;

    // luna: sul secondario a sinistra (2 schermi), su quello di sopra (3 schermi)
    const mz = lay.mode === 2 ? lay.left : lay.mode === 3 ? lay.top : m;
    const mx = lay.mode === 1 ? m.x + m.w * .1 : mz.x + mz.w * .28;
    const my = mz.y + mz.h * (lay.mode === 3 ? .3 : .18), mr = mz.s * (lay.mode === 3 ? .09 : .07);
    g = ctx.createRadialGradient(mx, my, mr * .5, mx, my, mr * 5);
    g.addColorStop(0, K.rgba(P.moon, .35)); g.addColorStop(1, K.rgba(P.moon, 0));
    ctx.fillStyle = g; ctx.fillRect(mx - mr * 5, my - mr * 5, mr * 10, mr * 10);
    ctx.fillStyle = P.moon; ctx.beginPath(); ctx.arc(mx, my, mr, 0, 6.283); ctx.fill();

    drawTower(ctx, K);
    drawTiled(ctx, K, layers[0], lay);

    g = ctx.createLinearGradient(0, lay.rowY + lay.rowH * .45, 0, lay.ground);
    g.addColorStop(0, K.rgba(P.haze, 0)); g.addColorStop(1, K.rgba(P.haze, .14 + K.bass * .1));
    ctx.fillStyle = g; ctx.fillRect(0, lay.rowY + lay.rowH * .45, W, lay.rowH * .55);

    drawTiled(ctx, K, layers[1], lay);

    // auto volanti: la maggior parte va verso lo schermo principale
    ctx.lineCap = 'round';
    for (const c of cars) {
      c.x += c.dir * (50 + 150 * c.z) * K.dt;
      if (c.x > c.xmax + 120) c.x = -120; else if (c.x < -120) c.x = c.xmax + 120;
      const len = 40 * c.z, w = 1 + 2 * c.z;
      ctx.strokeStyle = K.rgba(P.neon[0], .35 * c.z); ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x - c.dir * len, c.y); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillRect(c.x - w, c.y - w / 2, w * 2, w);
      ctx.fillStyle = 'rgba(255,60,90,.9)'; ctx.fillRect(c.x - c.dir * len * .3 - w / 2, c.y - w / 2, w, w);
    }

    drawTiled(ctx, K, layers[2], lay);

    g = ctx.createLinearGradient(0, lay.ground - lay.rowH * .14, 0, lay.ground);
    g.addColorStop(0, K.rgba(P.street, 0)); g.addColorStop(1, K.rgba(P.street, .28 + K.bass * .2));
    ctx.fillStyle = g; ctx.fillRect(0, lay.ground - lay.rowH * .14, W, lay.rowH * .14);

    // pioggia, inclinata nella direzione del flusso
    if (K.props.pioggia) {
      ctx.strokeStyle = K.rgba(P.rain, .35); ctx.lineWidth = 1;
      ctx.beginPath();
      const slant = .12 * lay.flowDir;
      for (const d of drops) {
        d.y += d.v * K.dt; d.x += d.v * slant * K.dt;
        if (d.y > H) { d.y = -d.l; d.x = Math.random() * (W + 200) - 100; }
        ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - d.l * slant, d.y - d.l);
      }
      ctx.stroke();
    }

    // orologio come insegna al neon, sullo schermo principale
    if (K.props.orologio) {
      const ck = K.clock(), fs = m.s * .14;
      const cx = m.x + m.w * (lay.mode === 1 ? .4 : .36), cy = m.y + m.h * .15;
      const flick = Math.sin(K.real * 23) > .97 ? .55 : 1;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `200 ${fs}px "Segoe UI", Arial, sans-serif`;
      ctx.shadowColor = P.neon[0]; ctx.shadowBlur = 30 + K.bass * 30;
      ctx.fillStyle = K.rgba(P.neon[0], .9 * flick); ctx.fillText(ck.time, cx, cy);
      ctx.shadowBlur = 8; ctx.fillStyle = K.rgba('#ffffff', .85 * flick); ctx.fillText(ck.time, cx, cy);
      ctx.font = `400 ${fs * .2}px "Segoe UI", Arial, sans-serif`;
      ctx.shadowColor = P.neon[1 % P.neon.length]; ctx.shadowBlur = 14;
      ctx.fillStyle = P.neon[1 % P.neon.length];
      ctx.fillText(ck.date.toUpperCase().split('').join(' '), cx, cy + fs * .62);
      ctx.shadowBlur = 0;
    }
  }

  Kit.start({ palettes: PALETTES, defaults: { pioggia: true }, build, draw });
})();

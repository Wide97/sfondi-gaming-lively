/* Radar Tattico — radar con fascio rotante, mappa topografica, mirino e interfaccia tattica. */
(function () {
  'use strict';

  const PALETTES = [
    { name: 'Neon', bg: '#02060a', map: '#00f0ff', hud: '#00f0ff', alert: '#ff2bd6', text: '#bff9ff' },
    { name: 'Notturno', bg: '#010a04', map: '#3cff7a', hud: '#3cff7a', alert: '#ff4545', text: '#c8ffd8' },
    { name: 'Pastello', bg: '#1f2430', map: '#a8e6cf', hud: '#a8e6cf', alert: '#ffaaa5', text: '#f1fff8' },
    { name: 'Mono', bg: '#0a0600', map: '#ffb000', hud: '#ffb000', alert: '#ffe08a', text: '#ffd88a' },
  ];

  const MONO = '"Cascadia Mono", Consolas, "Courier New", monospace';
  const SQUAD = ['ALFA', 'BRAVO', 'CHARLIE', 'DELTA'];
  const LOG = [
    'CONTATTO {T} RILEVATO SETTORE {S}', 'SQUADRA {Q} IN POSIZIONE', 'SATELLITE: COPERTURA {P}%',
    'CANALE CRITTOGRAFATO STABILITO', 'DRONE RICOGNIZIONE IN RIENTRO', 'PERIMETRO {S} SICURO',
    'SQUADRA {Q} IN MOVIMENTO', 'INTERFERENZA RADIO SETTORE {S}', 'CONTATTO {T} PERSO',
    'RICHIESTA SUPPORTO AEREO', 'PUNTO DI ESTRAZIONE CONFERMATO', 'SCANSIONE TERMICA COMPLETATA',
  ];

  let staticLayer, scan, radar, contacts = [], logLines = [], nextLog = 0, glitchUntil = 0, nextGlitch = 4, lock = null;

  /* ---------- rumore per la mappa topografica ---------- */
  function noiseFn(seed) {
    const r = Kit.seeded(seed), perm = new Uint8Array(512), val = new Float32Array(256);
    for (let i = 0; i < 256; i++) { perm[i] = i; val[i] = r(); }
    for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; [perm[i], perm[j]] = [perm[j], perm[i]]; }
    for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
    const n = (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      const X = xi & 255, Y = yi & 255;
      const a = val[perm[perm[X] + Y]], b = val[perm[perm[X + 1] + Y]];
      const c = val[perm[perm[X] + Y + 1]], d = val[perm[perm[X + 1] + Y + 1]];
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
    return (x, y) => { let s = 0, a = .5; for (let i = 0; i < 4; i++) { s += a * n(x, y); x *= 2.02; y *= 2.02; a *= .5; } return s; };
  }

  const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

  function buildStatic(K) {
    const P = K.pal, W = K.W, H = K.H;
    staticLayer = K.offscreen(W, H);
    const s = staticLayer.x;
    s.fillStyle = P.bg; s.fillRect(0, 0, W, H);

    // curve di livello calcolate a mezza risoluzione
    const sc = .5, w = Math.ceil(W * sc), h = Math.ceil(H * sc), fbm = noiseFn(99);
    const hgt = new Float32Array((w + 1) * (h + 1));
    const freq = 1 / (H * .32 * sc);
    for (let y = 0; y <= h; y++) for (let x = 0; x <= w; x++) hgt[y * (w + 1) + x] = fbm(x * freq + 5, y * freq + 9);
    const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h;
    const tc = tmp.getContext('2d'), id = tc.createImageData(w, h), d = id.data;
    const [mr, mg, mb] = rgb(P.map), [br, bg, bb] = rgb(P.bg), LV = 16;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i0 = y * (w + 1) + x, v = hgt[i0] * LV;
      const gx = (hgt[i0 + 1] - hgt[i0]) * LV, gy = (hgt[i0 + w + 1] - hgt[i0]) * LV;
      const g = Math.hypot(gx, gy) + 1e-4, f = v - Math.floor(v), dist = Math.min(f, 1 - f) / g;
      const major = Math.round(v) % 4 === 0;
      const line = Math.max(0, 1 - dist / (major ? 1.1 : .7)) * (major ? .5 : .22);
      const a = line + hgt[i0] * .07;
      const p = (y * w + x) * 4;
      d[p] = br + (mr - br) * a; d[p + 1] = bg + (mg - bg) * a; d[p + 2] = bb + (mb - bb) * a; d[p + 3] = 255;
    }
    tc.putImageData(id, 0, 0);
    s.imageSmoothingEnabled = true;
    s.drawImage(tmp, 0, 0, w, h, 0, 0, W, H);

    // griglia con coordinate, allineata a ogni schermo
    s.font = `500 11px ${MONO}`; s.textBaseline = 'top'; s.textAlign = 'left';
    for (const z of K.zones()) {
      const gs = z.s / 9;
      s.strokeStyle = K.rgba(P.map, .08); s.lineWidth = 1;
      s.beginPath();
      for (let x = z.x; x < z.x + z.w; x += gs) { s.moveTo(Math.round(x) + .5, 0); s.lineTo(Math.round(x) + .5, H); }
      for (let y = 0; y < H; y += gs) { s.moveTo(z.x, Math.round(y) + .5); s.lineTo(z.x + z.w, Math.round(y) + .5); }
      s.stroke();
      s.fillStyle = K.rgba(P.map, .35);
      let c = 0;
      for (let x = z.x; x < z.x + z.w - gs / 2; x += gs) s.fillText(String.fromCharCode(65 + (c++ % 26)), x + 4, 4);
      c = 1;
      for (let y = gs; y < H - gs / 2; y += gs) s.fillText(String(c++), z.x + 4, y + 4);
    }

    // linee di scansione + vignettatura
    scan = K.offscreen(W, H);
    scan.x.fillStyle = 'rgba(0,0,0,.18)';
    for (let y = 0; y < H; y += 3) scan.x.fillRect(0, y, W, 1);
    for (const z of K.zones()) {
      const g = scan.x.createRadialGradient(z.cx, z.cy, z.s * .4, z.cx, z.cy, z.w * .75);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.55)');
      scan.x.fillStyle = g; scan.x.fillRect(z.x, 0, z.w, H);
    }
  }

  function newContact(rnd = Math.random) {
    const a = rnd() * 6.283, r = .15 + rnd() * .8;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r, vx: (rnd() - .5) * .02, vy: (rnd() - .5) * .02,
      lit: 0, hostile: rnd() < .35, id: 'T-' + String(((rnd() * 90) | 0) + 10) };
  }

  function addLog(K, secondsAgo = 0) {
    const ck = K.clock(new Date(Date.now() - secondsAgo * 1000)), pick = (a) => a[(Math.random() * a.length) | 0];
    const sector = String.fromCharCode(65 + ((Math.random() * 9) | 0)) + ((Math.random() * 9 + 1) | 0);
    let tpl = pick(LOG);
    while (logLines.length && logLines[logLines.length - 1].includes(tpl.split(' {')[0].split(':')[0])) tpl = pick(LOG);
    const msg = tpl.replace('{T}', pick(contacts).id).replace('{S}', sector)
      .replace('{Q}', pick(SQUAD)).replace('{P}', String(90 + ((Math.random() * 10) | 0)));
    logLines.push(`[${ck.time}:${ck.ss}] ${msg}`);
    if (logLines.length > 9) logLines.shift();
  }

  function build(ctx, K) {
    buildStatic(K);
    const lay = K.layout(), m = lay.main, rnd = K.seeded(5);
    radar = K.screens === 1
      ? { x: m.x + m.w * .38, y: K.H * .5, R: m.s * .38 }
      : { x: m.cx, y: K.H * .5, R: m.s * .4 };
    contacts = Array.from({ length: 8 }, () => newContact(rnd));
    if (!logLines.length) for (let i = 6; i > 0; i--) addLog(K, i * 9 + ((Math.random() * 6) | 0));
    lock = null;
  }

  /* ---------- elementi dell'interfaccia ---------- */
  function frame(ctx, K, x, y, w, h, title) {
    const P = K.pal, cut = 14;
    ctx.fillStyle = K.rgba(P.bg, .72);
    ctx.beginPath();
    ctx.moveTo(x + cut, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h - cut);
    ctx.lineTo(x + w - cut, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + cut); ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = K.rgba(P.hud, .55); ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = K.rgba(P.hud, .85); ctx.fillRect(x + cut, y, Math.min(w * .5, 190), 18);
    ctx.fillStyle = P.bg; ctx.font = `700 11px ${MONO}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(title, x + cut + 8, y + 9.5);
  }

  function clockPanel(ctx, K, x, y, w) {
    const P = K.pal, h = w * .5, ck = K.clock();
    frame(ctx, K, x, y, w, h, 'TIMER MISSIONE');
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = P.text; ctx.shadowColor = P.hud; ctx.shadowBlur = 10;
    ctx.font = `600 ${w * .17}px ${MONO}`;
    ctx.fillText(`${ck.hh}:${ck.mm}`, x + 16, y + h * .58);
    const tw = ctx.measureText(`${ck.hh}:${ck.mm}`).width;
    ctx.font = `600 ${w * .07}px ${MONO}`; ctx.fillStyle = P.alert;
    ctx.fillText(ck.ss, x + 24 + tw, y + h * .58);
    ctx.shadowBlur = 0;
    ctx.font = `500 ${Math.max(11, w * .04)}px ${MONO}`; ctx.fillStyle = K.rgba(P.text, .8);
    ctx.fillText(ck.date.toUpperCase(), x + 16, y + h * .76);
    ctx.fillStyle = K.rgba(P.hud, .55);
    ctx.fillText(`OP. TEMPESTA SILENZIOSA · ${ck.short}`, x + 16, y + h * .9);
  }

  function squadPanel(ctx, K, x, y, w) {
    const P = K.pal, h = w * .46;
    frame(ctx, K, x, y, w, h, 'STATO SQUADRA');
    const fs = Math.max(11, w * .038);
    ctx.font = `500 ${fs}px ${MONO}`; ctx.textBaseline = 'middle';
    SQUAD.forEach((name, i) => {
      const ry = y + h * (.32 + i * .17), hp = K.clamp(.55 + .4 * Math.sin(i * 2.3) + .05 * Math.sin(K.t * .4 + i), .1, 1);
      const moving = Math.sin(K.t * .15 + i * 1.7) > 0;
      ctx.textAlign = 'left'; ctx.fillStyle = K.rgba(P.text, .85); ctx.fillText(name, x + 16, ry);
      const bx = x + w * .3, bw = w * .3;
      ctx.fillStyle = K.rgba(P.hud, .15); ctx.fillRect(bx, ry - fs * .3, bw, fs * .6);
      ctx.fillStyle = hp < .4 ? P.alert : P.hud; ctx.fillRect(bx, ry - fs * .3, bw * hp, fs * .6);
      ctx.textAlign = 'right'; ctx.fillStyle = moving ? P.alert : K.rgba(P.hud, .8);
      ctx.fillText(moving ? 'IN MOVIMENTO' : 'IN POSIZIONE', x + w - 14, ry);
    });
  }

  function logPanel(ctx, K, x, y, w) {
    const P = K.pal, h = w * .52;
    frame(ctx, K, x, y, w, h, 'REGISTRO OPERAZIONI');
    const fs = Math.max(10, w * .028);
    ctx.font = `500 ${fs}px ${MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.save(); ctx.beginPath(); ctx.rect(x + 4, y + 24, w - 8, h - 30); ctx.clip();
    logLines.forEach((l, i) => {
      const last = i === logLines.length - 1;
      ctx.fillStyle = last ? P.text : K.rgba(P.hud, .35 + .5 * (i / logLines.length));
      ctx.fillText(last && Math.sin(K.real * 8) > 0 ? l + ' _' : l, x + 14, y + 30 + i * fs * 1.45);
    });
    ctx.restore();
  }

  function drawRadar(ctx, K) {
    const P = K.pal, { x, y, R } = radar;
    ctx.fillStyle = K.rgba(P.bg, .55); ctx.beginPath(); ctx.arc(x, y, R, 0, 6.283); ctx.fill();

    ctx.strokeStyle = K.rgba(P.hud, .3); ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) { ctx.beginPath(); ctx.arc(x, y, R * i / 4, 0, 6.283); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(x - R, y); ctx.lineTo(x + R, y); ctx.moveTo(x, y - R); ctx.lineTo(x, y + R); ctx.stroke();
    ctx.strokeStyle = K.rgba(P.hud, .75); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, R, 0, 6.283); ctx.stroke();
    ctx.lineWidth = 1; ctx.font = `500 11px ${MONO}`; ctx.fillStyle = K.rgba(P.hud, .6);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < 72; i++) {
      const a = i / 72 * 6.283 - Math.PI / 2, l = i % 6 === 0 ? 10 : 4;
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * R, y + Math.sin(a) * R);
      ctx.lineTo(x + Math.cos(a) * (R + l), y + Math.sin(a) * (R + l)); ctx.stroke();
      if (i % 6 === 0) ctx.fillText(String(i * 5).padStart(3, '0'), x + Math.cos(a) * (R + 24), y + Math.sin(a) * (R + 24));
    }

    // fascio rotante
    const prev = (K.t - K.dt) * 1.1, th = K.t * 1.1, trail = 1.1;
    const g = ctx.createConicGradient(th - trail, x, y);
    g.addColorStop(0, K.rgba(P.hud, 0)); g.addColorStop(trail / 6.283, K.rgba(P.hud, .32));
    g.addColorStop(trail / 6.283 + .001, K.rgba(P.hud, 0)); g.addColorStop(1, K.rgba(P.hud, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, R, th - trail, th); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = K.rgba(P.text, .9); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(th) * R, y + Math.sin(th) * R); ctx.stroke();

    // contatti: si illuminano quando il fascio li attraversa
    const norm = (a) => ((a % 6.283) + 6.283) % 6.283;
    for (let i = 0; i < contacts.length; i++) {
      const c = contacts[i];
      c.x += c.vx * K.dt; c.y += c.vy * K.dt;
      if (Math.hypot(c.x, c.y) > .95) { contacts[i] = newContact(); continue; }
      const a = norm(Math.atan2(c.y, c.x)), d0 = norm(a - prev), span = th - prev;
      if (d0 <= span + 1e-6) c.lit = 1;
      c.lit = Math.max(0, c.lit - K._frameDt * .35);
      if (c.lit <= 0) continue;
      const cx = x + c.x * R, cy = y + c.y * R, col = c.hostile ? P.alert : P.hud;
      ctx.globalAlpha = c.lit;
      const gg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 16);
      gg.addColorStop(0, K.rgba(col, .7)); gg.addColorStop(1, K.rgba(col, 0));
      ctx.fillStyle = gg; ctx.fillRect(cx - 16, cy - 16, 32, 32);
      ctx.fillStyle = col;
      if (c.hostile) { ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.PI / 4); ctx.fillRect(-4, -4, 8, 8); ctx.restore(); }
      else { ctx.beginPath(); ctx.arc(cx, cy, 4, 0, 6.283); ctx.fill(); }
      ctx.font = `600 11px ${MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(c.id, cx + 10, cy - 8);
      ctx.globalAlpha = 1;
    }
  }

  function crosshair(ctx, K) {
    const P = K.pal, m = K.mouse;
    if (!K.props.mouse || !m.inside) { lock = null; return; }
    // cerca un contatto visibile vicino al cursore
    let best = null, bd = 50;
    for (const c of contacts) {
      if (c.lit < .15) continue;
      const d = Math.hypot(radar.x + c.x * radar.R - m.x, radar.y + c.y * radar.R - m.y);
      if (d < bd) { bd = d; best = c; }
    }
    if (best) { if (!lock || lock.c !== best) lock = { c: best, t: 0 }; lock.t += K._frameDt; }
    else lock = null;

    ctx.strokeStyle = K.rgba(P.text, .85); ctx.lineWidth = 1.5;
    const g = 6, l = 16;
    ctx.beginPath();
    ctx.moveTo(m.x - g - l, m.y); ctx.lineTo(m.x - g, m.y); ctx.moveTo(m.x + g, m.y); ctx.lineTo(m.x + g + l, m.y);
    ctx.moveTo(m.x, m.y - g - l); ctx.lineTo(m.x, m.y - g); ctx.moveTo(m.x, m.y + g); ctx.lineTo(m.x, m.y + g + l);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(m.x, m.y, 26, 0, 6.283); ctx.strokeStyle = K.rgba(P.text, .35); ctx.stroke();
    ctx.font = `500 11px ${MONO}`; ctx.fillStyle = K.rgba(P.text, .7); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(`X ${Math.round(m.x).toString().padStart(4, '0')}  Y ${Math.round(m.y).toString().padStart(4, '0')}`, m.x + 30, m.y + 18);

    if (lock) {
      const c = lock.c, cx = radar.x + c.x * radar.R, cy = radar.y + c.y * radar.R;
      const k = Math.min(1, lock.t / .5), s = K.lerp(60, 22, k);
      ctx.save(); ctx.translate(cx, cy); ctx.rotate((1 - k) * 1.5);
      ctx.strokeStyle = P.alert; ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        ctx.beginPath(); ctx.moveTo(-s, -s + 8); ctx.lineTo(-s, -s); ctx.lineTo(-s + 8, -s); ctx.stroke();
      }
      ctx.restore();
      if (k >= 1) {
        ctx.fillStyle = P.alert; ctx.font = `700 12px ${MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(`BERSAGLIO AGGANCIATO · ${c.id}`, cx + 30, cy - 10);
        ctx.fillStyle = K.rgba(P.alert, .7); ctx.font = `500 11px ${MONO}`;
        ctx.fillText(`DIST ${Math.round(Math.hypot(c.x, c.y) * 1200)} m · ${c.hostile ? 'OSTILE' : 'NEUTRALE'}`, cx + 30, cy + 8);
      }
    }
  }

  /* ---------- disegno ---------- */
  function draw(ctx, K) {
    const W = K.W, H = K.H, lay = K.layout();
    ctx.drawImage(staticLayer.c, 0, 0, W, H);
    drawRadar(ctx, K);

    if (K.t > nextLog) { addLog(K); nextLog = K.t + 2 + Math.random() * 3; }

    if (K.screens === 1) {
      const m = lay.main, pw = Math.min(m.w * .27, m.s * .52), px = m.x + m.w * .69;
      if (K.props.orologio) clockPanel(ctx, K, px, H * .08, pw);
      squadPanel(ctx, K, px, H * .08 + pw * .55, pw);
      logPanel(ctx, K, px, H * .08 + pw * 1.07, pw);
    } else if (K.screens === 2) {
      const z = lay.info, pw = z.s * .62;
      if (K.props.orologio) clockPanel(ctx, K, z.x + z.w * .08, H * .1, pw * 1.1);
      squadPanel(ctx, K, z.x + z.w * .08, H * .1 + pw * .62, pw);
      logPanel(ctx, K, z.x + z.w * .92 - pw, H * .1 + pw * .62, pw);
    } else {
      const [l, r] = lay.side, pw = l.s * .62;
      squadPanel(ctx, K, l.cx - pw / 2, H * .12, pw);
      logPanel(ctx, K, l.cx - pw / 2, H * .12 + pw * .54, pw);
      if (K.props.orologio) clockPanel(ctx, K, r.cx - pw * .55, H * .3, pw * 1.1);
    }

    crosshair(ctx, K);
    ctx.drawImage(scan.c, 0, 0, W, H);

    // glitch digitale occasionale
    if (K.props.glitch) {
      if (K.real > nextGlitch) { glitchUntil = K.real + .12 + Math.random() * .15; nextGlitch = K.real + 5 + Math.random() * 9; }
      if (K.real < glitchUntil) {
        const c = K.canvas, dpr = K.dpr;
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
        for (let i = 0; i < 5; i++) {
          const y = Math.random() * c.height, h = (4 + Math.random() * 30) * dpr, dx = (Math.random() - .5) * 40 * dpr;
          ctx.drawImage(c, 0, y, c.width, h, dx, y, c.width, h);
        }
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = K.rgba(K.pal.alert, .06);
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.restore();
      }
    }
  }

  Kit.start({ palettes: PALETTES, defaults: { glitch: true }, build, draw });
})();

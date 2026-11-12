/* Radar Tattico — radar con fascio rotante, mappa topografica, mirino e interfaccia tattica.
 *
 * Flusso tra gli schermi:
 *  - il radar è sullo schermo principale; la mappa topografica continua su tutti gli schermi
 *  - ogni contatto rilevato parte come pacchetto dati dal radar e arriva al registro sul secondario
 *  - con 3 schermi un satellite sullo schermo di sopra manda scansioni giù al radar
 */
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
    'SQUADRA {Q} IN POSIZIONE', 'SATELLITE: COPERTURA {P}%', 'CANALE CRITTOGRAFATO STABILITO',
    'DRONE RICOGNIZIONE IN RIENTRO', 'PERIMETRO {S} SICURO', 'SQUADRA {Q} IN MOVIMENTO',
    'INTERFERENZA RADIO SETTORE {S}', 'RICHIESTA SUPPORTO AEREO', 'PUNTO DI ESTRAZIONE CONFERMATO',
    'SCANSIONE TERMICA COMPLETATA',
  ];

  // Quanto "spinge" ogni effetto: [calmo, equilibrato, vivace]
  const LIVELLI = {
    sweep:  [.5, .8, 1],          // fascio del radar
    blips:  [.55, .8, 1],         // bagliore dei contatti e dei pacchetti
    glitch: [0, .5, 1],           // frequenza dei glitch (0 = mai, anche con l'opzione attiva)
    blink:  [false, true, true],  // cursore del registro e spia del satellite
  };
  const lv = (k) => Kit.pick(LIVELLI[k]);

  let staticLayer, scan, radar, contacts = [], logLines = [], nextLog = 2, glitchUntil = 0, nextGlitch = 4, lock = null;
  let panels, links = {}, packets = [], pulses = [], sat = null, nextSat = 3, lastContactPacket = 0;

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
    const P = K.pal, W = K.W, H = K.H, lay = K.layout();
    staticLayer = K.offscreen(W, H);
    const s = staticLayer.x;
    s.fillStyle = P.bg; s.fillRect(0, 0, W, H);

    // curve di livello a mezza risoluzione, continue su tutti gli schermi
    const sc = .5, w = Math.ceil(W * sc), h = Math.ceil(H * sc), fbm = noiseFn(99);
    const hgt = new Float32Array((w + 1) * (h + 1));
    const freq = 1 / (lay.rowH * .32 * sc);
    for (let y = 0; y <= h; y++) for (let x = 0; x <= w; x++) {
      if (!K.visible(x / sc, y / sc) && !K.visible((x - 1) / sc, (y - 1) / sc)) continue;
      hgt[y * (w + 1) + x] = fbm(x * freq + 5, y * freq + 9);
    }
    const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h;
    const tc = tmp.getContext('2d'), id = tc.createImageData(w, h), d = id.data;
    const [mr, mg, mb] = rgb(P.map), [br, bg, bb] = rgb(P.bg), LV = 16;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      d[p + 3] = 255;
      if (!K.visible(x / sc, y / sc)) { d[p] = br; d[p + 1] = bg; d[p + 2] = bb; continue; }
      const i0 = y * (w + 1) + x, v = hgt[i0] * LV;
      const gx = (hgt[i0 + 1] - hgt[i0]) * LV, gy = (hgt[i0 + w + 1] - hgt[i0]) * LV;
      const g = Math.hypot(gx, gy) + 1e-4, f = v - Math.floor(v), dist = Math.min(f, 1 - f) / g;
      const major = Math.round(v) % 4 === 0;
      const a = Math.max(0, 1 - dist / (major ? 1.1 : .7)) * (major ? .5 : .22) + hgt[i0] * .07;
      d[p] = br + (mr - br) * a; d[p + 1] = bg + (mg - bg) * a; d[p + 2] = bb + (mb - bb) * a;
    }
    tc.putImageData(id, 0, 0);
    s.imageSmoothingEnabled = true;
    s.drawImage(tmp, 0, 0, w, h, 0, 0, W, H);

    // griglia con coordinate, allineata a ogni schermo
    s.font = `500 11px ${MONO}`; s.textBaseline = 'top'; s.textAlign = 'left';
    let col = 0;
    for (const z of lay.zones) {
      const gs = z.s / 9;
      s.strokeStyle = K.rgba(P.map, .08); s.lineWidth = 1;
      s.beginPath();
      for (let x = z.x; x < z.x + z.w; x += gs) { s.moveTo(Math.round(x) + .5, z.y); s.lineTo(Math.round(x) + .5, z.y + z.h); }
      for (let y = z.y; y < z.y + z.h; y += gs) { s.moveTo(z.x, Math.round(y) + .5); s.lineTo(z.x + z.w, Math.round(y) + .5); }
      s.stroke();
      s.fillStyle = K.rgba(P.map, .35);
      let c = 0;
      for (let x = z.x; x < z.x + z.w - gs / 2; x += gs) s.fillText(String.fromCharCode(65 + ((col + c++) % 26)), x + 4, z.y + 4);
      col += c;
      c = 1;
      for (let y = z.y + gs; y < z.y + z.h - gs / 2; y += gs) s.fillText(String(c++), z.x + 4, y + 4);
    }

    scan = K.offscreen(W, H);
    scan.x.fillStyle = 'rgba(0,0,0,.18)';
    for (let y = 0; y < H; y += 3) scan.x.fillRect(0, y, W, 1);
    for (const z of lay.zones) {
      const g = scan.x.createRadialGradient(z.cx, z.cy, z.s * .4, z.cx, z.cy, z.w * .75);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.55)');
      scan.x.fillStyle = g; scan.x.fillRect(z.x, z.y, z.w, z.h);
    }
  }

  /* ---------- disposizione pannelli e collegamenti ---------- */
  function computePanels(K) {
    const lay = K.layout(), m = lay.main, p = {};
    if (lay.mode === 1) {
      const pw = Math.min(m.w * .27, m.s * .52), x = m.x + m.w * .69, y = m.y + m.h * .08;
      p.clock = { x, y, w: pw, h: pw * .5 };
      p.squad = { x, y: y + pw * .55, w: pw, h: pw * .46 };
      p.log = { x, y: y + pw * 1.07, w: pw, h: pw * .52 };
    } else if (lay.mode === 2) {
      const z = lay.left, pw = z.s * .62, y = z.y + z.h * .1;
      p.clock = { x: z.x + z.w * .08, y, w: pw * 1.1, h: pw * .55 };
      p.squad = { x: z.x + z.w * .08, y: y + pw * .62, w: pw, h: pw * .46 };
      p.log = { x: z.x + z.w * .92 - pw, y: y + pw * .62, w: pw, h: pw * .52 };
    } else {
      const r = lay.right, t = lay.top, pw = r.s * .62;
      p.squad = { x: r.x + r.w * .08, y: r.y + r.h * .12, w: pw, h: pw * .46 };
      p.log = { x: r.x + r.w * .08, y: r.y + r.h * .12 + pw * .54, w: pw, h: pw * .52 };
      p.clock = { x: t.x + t.w * .08, y: t.y + t.h * .14, w: pw * 1.1, h: pw * .55 };
      sat = { x: t.x + t.w * .68, y: t.y + t.h * .4 };
    }
    return p;
  }

  // polilinea con gomiti ad angolo retto tra due punti
  function makeLink(a, b, vertical) {
    const pts = vertical
      ? [a, { x: a.x, y: (a.y + b.y) / 2 }, { x: b.x, y: (a.y + b.y) / 2 }, b]
      : [a, { x: (a.x + b.x) / 2, y: a.y }, { x: (a.x + b.x) / 2, y: b.y }, b];
    const seg = [];
    let len = 0;
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); seg.push(l); len += l; }
    return { pts, seg, len };
  }

  function pointOn(link, d) {
    for (let i = 0; i < link.seg.length; i++) {
      if (d <= link.seg[i] || i === link.seg.length - 1) {
        const k = link.seg[i] ? Math.min(1, d / link.seg[i]) : 0, a = link.pts[i], b = link.pts[i + 1];
        return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
      }
      d -= link.seg[i];
    }
    return link.pts[link.pts.length - 1];
  }

  function computeLinks() {
    const L = panels.log, toLeft = L.x + L.w / 2 < radar.x;
    const edgeX = toLeft ? L.x + L.w : L.x;
    const a = { x: radar.x + (toLeft ? -1 : 1) * (radar.R + 46), y: radar.y };
    links = { log: makeLink(a, { x: edgeX, y: L.y + L.h * .5 }, false) };
    if (sat) links.sat = makeLink({ x: sat.x, y: sat.y + 26 }, { x: radar.x, y: radar.y - radar.R - 46 }, true);
  }

  function sendPacket(link, color, onArrive) { packets.push({ link, d: 0, color, onArrive }); }

  /* ---------- contatti e registro ---------- */
  function newContact(rnd = Math.random) {
    const a = rnd() * 6.283, r = .15 + rnd() * .8;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r, vx: (rnd() - .5) * .02, vy: (rnd() - .5) * .02,
      lit: 0, hostile: rnd() < .35, id: 'T-' + String(((rnd() * 90) | 0) + 10) };
  }

  const sector = () => String.fromCharCode(65 + ((Math.random() * 9) | 0)) + ((Math.random() * 9 + 1) | 0);

  function pushLog(K, msg, secondsAgo = 0) {
    const ck = K.clock(new Date(Date.now() - secondsAgo * 1000));
    logLines.push(`[${ck.time}:${ck.ss}] ${msg}`);
    if (logLines.length > 9) logLines.shift();
  }

  function randomMsg() {
    const pick = (a) => a[(Math.random() * a.length) | 0];
    let tpl = pick(LOG);
    while (logLines.length && logLines[logLines.length - 1].includes(tpl.split(' {')[0].split(':')[0])) tpl = pick(LOG);
    return tpl.replace('{S}', sector()).replace('{Q}', pick(SQUAD)).replace('{P}', String(90 + ((Math.random() * 10) | 0)));
  }

  function build(ctx, K) {
    buildStatic(K);
    const lay = K.layout(), m = lay.main, rnd = K.seeded(5);
    radar = lay.mode === 1 ? { x: m.x + m.w * .38, y: m.cy, R: m.s * .38 } : { x: m.cx, y: m.cy, R: m.s * .4 };
    sat = null;
    panels = computePanels(K);
    computeLinks();
    contacts = Array.from({ length: 8 }, () => newContact(rnd));
    if (!logLines.length) for (let i = 6; i > 0; i--) pushLog(K, randomMsg(), i * 9 + ((Math.random() * 6) | 0));
    packets = []; pulses = []; lock = null;
  }

  /* ---------- elementi dell'interfaccia ---------- */
  function frame(ctx, K, r, title) {
    const P = K.pal, cut = 14, { x, y, w, h } = r;
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

  function clockPanel(ctx, K, r) {
    const P = K.pal, { x, y, w, h } = r, ck = K.clock();
    frame(ctx, K, r, 'TIMER MISSIONE');
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

  function squadPanel(ctx, K, r) {
    const P = K.pal, { x, y, w, h } = r;
    frame(ctx, K, r, 'STATO SQUADRA');
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

  function logPanel(ctx, K, r) {
    const P = K.pal, { x, y, w, h } = r;
    frame(ctx, K, r, 'REGISTRO OPERAZIONI');
    const fs = Math.max(10, w * .028);
    ctx.font = `500 ${fs}px ${MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.save(); ctx.beginPath(); ctx.rect(x + 4, y + 24, w - 8, h - 30); ctx.clip();
    logLines.forEach((l, i) => {
      const last = i === logLines.length - 1;
      ctx.fillStyle = last ? P.text : K.rgba(P.hud, .35 + .5 * (i / logLines.length));
      ctx.fillText(last && lv('blink') && Math.sin(K.real * 8) > 0 ? l + ' _' : l, x + 14, y + 30 + i * fs * 1.45);
    });
    ctx.restore();
  }

  function satellite(ctx, K) {
    const P = K.pal, x = sat.x + Math.sin(K.t * .2) * 30, y = sat.y + Math.sin(K.t * .3) * 8;
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(K.t * .15) * .08);
    ctx.strokeStyle = P.hud; ctx.lineWidth = 1.5;
    for (const sx of [-1, 1]) {
      ctx.fillStyle = K.rgba(P.hud, .18); ctx.fillRect(sx > 0 ? 18 : -62, -9, 44, 18);
      ctx.strokeRect(sx > 0 ? 18 : -62, -9, 44, 18);
      ctx.beginPath();
      for (let i = 1; i < 4; i++) { const gx = (sx > 0 ? 18 : -62) + i * 11; ctx.moveTo(gx, -9); ctx.lineTo(gx, 9); }
      ctx.moveTo(sx * 12, 0); ctx.lineTo(sx * 18, 0); ctx.stroke();
    }
    ctx.fillStyle = K.rgba(P.bg, .9); ctx.fillRect(-12, -12, 24, 24); ctx.strokeRect(-12, -12, 24, 24);
    ctx.beginPath(); ctx.arc(0, 18, 9, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = !lv('blink') || Math.sin(K.real * 4) > 0 ? P.alert : K.rgba(P.alert, .2); ctx.fillRect(-3, -3, 6, 6);
    ctx.restore();
    ctx.fillStyle = K.rgba(P.text, .8); ctx.font = `600 12px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('SAT-3 · UPLINK ATTIVO', x, y - 44);
  }

  function drawLinks(ctx, K) {
    const P = K.pal;
    ctx.lineWidth = 1.6; ctx.setLineDash([6, 6]);
    for (const k in links) {
      const l = links[k];
      ctx.strokeStyle = K.rgba(P.hud, .7); ctx.lineDashOffset = -K.t * 30;
      ctx.beginPath(); l.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
    }
    ctx.setLineDash([]);
    for (const k in links) for (const p of [links[k].pts[0], links[k].pts[links[k].pts.length - 1]]) {
      ctx.fillStyle = P.hud; ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
    }
    // pacchetti dati in viaggio
    for (let i = packets.length - 1; i >= 0; i--) {
      const pk = packets[i];
      pk.d += K._frameDt * Math.max(260, pk.link.len / 1.6) * (.6 + K.speed * .4);
      if (pk.d >= pk.link.len) { packets.splice(i, 1); pk.onArrive && pk.onArrive(); continue; }
      const p = pointOn(pk.link, pk.d), q = pointOn(pk.link, Math.max(0, pk.d - 40));
      const g = ctx.createLinearGradient(q.x, q.y, p.x, p.y);
      g.addColorStop(0, K.rgba(pk.color, 0)); g.addColorStop(1, K.rgba(pk.color, .9 * lv('blips')));
      ctx.strokeStyle = g; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(q.x, q.y);
      for (let d = Math.max(0, pk.d - 40) + 5; d < pk.d; d += 5) { const r = pointOn(pk.link, d); ctx.lineTo(r.x, r.y); }
      ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.fillStyle = K.rgba('#ffffff', lv('blips')); ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
    }
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

    // impulsi della scansione satellitare
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i]; p.k += K._frameDt / 1.6;
      if (p.k >= 1) { pulses.splice(i, 1); continue; }
      ctx.strokeStyle = K.rgba(P.text, (1 - p.k) * .7); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, R * p.k, 0, 6.283); ctx.stroke();
    }

    const prev = (K.t - K.dt) * 1.1, th = K.t * 1.1, trail = 1.1;
    const g = ctx.createConicGradient(th - trail, x, y);
    g.addColorStop(0, K.rgba(P.hud, 0)); g.addColorStop(trail / 6.283, K.rgba(P.hud, .32 * lv('sweep')));
    g.addColorStop(trail / 6.283 + .001, K.rgba(P.hud, 0)); g.addColorStop(1, K.rgba(P.hud, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, R, th - trail, th); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = K.rgba(P.text, .9 * lv('sweep')); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(th) * R, y + Math.sin(th) * R); ctx.stroke();

    const norm = (a) => ((a % 6.283) + 6.283) % 6.283;
    for (let i = 0; i < contacts.length; i++) {
      const c = contacts[i];
      c.x += c.vx * K.dt; c.y += c.vy * K.dt;
      if (Math.hypot(c.x, c.y) > .95) { contacts[i] = newContact(); continue; }
      const a = norm(Math.atan2(c.y, c.x)), d0 = norm(a - prev);
      if (d0 <= th - prev + 1e-6) {
        // nuovo rilevamento: il dato parte verso il registro sull'altro schermo
        if (c.lit < .3 && K.real - lastContactPacket > 1.2 && Math.random() < .6) {
          lastContactPacket = K.real;
          const msg = `CONTATTO ${c.id} ${c.hostile ? 'OSTILE' : 'NEUTRALE'} SETTORE ${sector()}`;
          sendPacket(links.log, c.hostile ? P.alert : P.hud, () => pushLog(K, msg));
        }
        c.lit = 1;
      }
      c.lit = Math.max(0, c.lit - K._frameDt * .35);
      if (c.lit <= 0) continue;
      const cx = x + c.x * R, cy = y + c.y * R, col = c.hostile ? P.alert : P.hud;
      ctx.globalAlpha = c.lit;
      const gg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 16);
      gg.addColorStop(0, K.rgba(col, .7 * lv('blips'))); gg.addColorStop(1, K.rgba(col, 0));
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
    let best = null, bd = 50;
    for (const c of contacts) {
      if (c.lit < .15) continue;
      const d = Math.hypot(radar.x + c.x * radar.R - m.x, radar.y + c.y * radar.R - m.y);
      if (d < bd) { bd = d; best = c; }
    }
    if (best) { if (!lock || lock.c !== best) lock = { c: best, t: 0 }; lock.t += K._frameDt; } else lock = null;
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
    const W = K.W, H = K.H, P = K.pal;
    ctx.drawImage(staticLayer.c, 0, 0, W, H);

    // messaggi periodici: anche loro arrivano al registro come pacchetti dal radar
    if (K.t > nextLog) { const msg = randomMsg(); sendPacket(links.log, P.hud, () => pushLog(K, msg)); nextLog = K.t + 3 + Math.random() * 4; }
    // scansione satellitare (3 schermi): dal satellite in alto giù fino al radar
    if (sat && K.t > nextSat) {
      nextSat = K.t + 7 + Math.random() * 5;
      sendPacket(links.sat, P.text, () => {
        pulses.push({ k: 0 });
        for (const c of contacts) c.lit = Math.max(c.lit, .8);
        sendPacket(links.log, P.hud, () => pushLog(K, `SCANSIONE SATELLITARE RICEVUTA · ${contacts.length} CONTATTI`));
      });
    }

    drawLinks(ctx, K);
    drawRadar(ctx, K);
    if (sat) satellite(ctx, K);
    if (K.props.orologio) clockPanel(ctx, K, panels.clock);
    squadPanel(ctx, K, panels.squad);
    logPanel(ctx, K, panels.log);

    crosshair(ctx, K);
    ctx.drawImage(scan.c, 0, 0, W, H);

    if (K.props.glitch && lv('glitch') > 0) {
      if (K.real > nextGlitch) { glitchUntil = K.real + .12 + Math.random() * .15; nextGlitch = K.real + (5 + Math.random() * 9) / lv('glitch'); }
      if (K.real < glitchUntil) {
        const c = K.canvas;
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
        for (let i = 0; i < 5; i++) {
          const y = Math.random() * c.height, h = (4 + Math.random() * 30) * K.dpr, dx = (Math.random() - .5) * 40 * K.dpr;
          ctx.drawImage(c, 0, y, c.width, h, dx, y, c.width, h);
        }
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = K.rgba(K.pal.alert, .06); ctx.fillRect(0, 0, c.width, c.height);
        ctx.restore();
      }
    }
  }

  // il radar è già scuro: basta un velo più leggero
  const veil = [{ b: .8, s: .78, c: .95 }, { b: .9, s: .9, c: .98 }, { b: 1, s: 1, c: 1 }];
  Kit.start({ palettes: PALETTES, defaults: { glitch: true }, veil, build, draw });
})();

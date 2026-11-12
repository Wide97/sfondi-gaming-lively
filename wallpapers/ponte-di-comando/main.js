/* Ponte di Comando — vista dalla plancia di un'astronave, con HUD olografico.
 *
 * Flusso tra gli schermi:
 *  - il pianeta è sullo schermo principale
 *  - dagli schermi secondari un collegamento dati porta pacchetti fino al pianeta
 *  - navette partono dai secondari (con 3 schermi dalla stazione orbitale di sopra) e atterrano sul pianeta
 *  - i montanti della cabina coincidono con le cornici dei monitor
 */
(function () {
  'use strict';

  const PALETTES = [
    { name: 'Neon', space: '#03010a', neb: ['#ff2bd6', '#5b2bff'], hud: '#00f0ff', alert: '#ff2bd6',
      planet: ['#ffb3f0', '#a03cc8', '#2a0a40'], band: '#ffd6fa', atm: '#ff6ad5', ring: '#ffd6fa', frame: '#07060d' },
    { name: 'Notturno', space: '#010208', neb: ['#1d3f8f', '#0e6f7a'], hud: '#6fb7ff', alert: '#ffb347',
      planet: ['#9fd0ff', '#2a5ca8', '#06122b'], band: '#d8ecff', atm: '#4fa3ff', ring: '#bcd8ff', frame: '#05070c' },
    { name: 'Pastello', space: '#1b1530', neb: ['#ffb3c7', '#b3d4ff'], hud: '#b5f5e0', alert: '#ffc6a8',
      planet: ['#ffe3c2', '#f0a5a0', '#5a3a5e'], band: '#fff3e0', atm: '#ffd0e0', ring: '#fff0f5', frame: '#141022' },
    { name: 'Mono', space: '#000000', neb: ['#ffb000', '#7a4a00'], hud: '#ffb000', alert: '#ffd27a',
      planet: ['#ffd27a', '#8a5a00', '#1a0f00'], band: '#ffe2a8', atm: '#ffb000', ring: '#ffcc66', frame: '#060400' },
  ];

  // Quanto "spinge" ogni effetto: [calmo, equilibrato, vivace]
  const LIVELLI = {
    atm:     [.45, .75, 1],       // alone dell'atmosfera del pianeta
    hudGlow: [.4, .75, 1],        // alone dell'orologio di bordo
    traffic: [.4, .7, 1],         // navette e comete (frequenza)
    blink:   [false, true, true], // spie della plancia e luci della stazione
  };
  const lv = (k) => Kit.pick(LIVELLI[k]);

  const MONO = '"Cascadia Mono", Consolas, "Courier New", monospace';
  let nebula, stars = [], storms = [], par = { x: 0, y: 0 }, comet = null;
  let shuttles = [], nextShuttle = 1, scene = null;

  /* ---------- posizioni degli elementi per ogni disposizione ---------- */
  function computeScene(K) {
    const lay = K.layout(), m = lay.main;
    const s = {
      planet: { x: m.cx + (lay.mode === 1 ? m.w * .12 : 0), y: m.y + m.h * .47, R: m.s * .26 },
      clock: null, status: null, nav: null, station: null, sources: [],
    };
    if (lay.mode === 1) {
      s.clock = { x: m.x + m.w * .05, y: m.y + m.h * .1, s: m.s };
      s.status = { x: m.x + m.w * .05, y: m.y + m.h * .56, s: m.s };
      s.sources.push({ x: m.x - 40, y: m.y + m.h * .35, spread: m.h * .25 });
    } else if (lay.mode === 2) {
      const z = lay.left;
      s.clock = { x: z.x + z.w * .08, y: z.y + z.h * .1, s: z.s };
      s.status = { x: z.x + z.w * .08, y: z.y + z.h * .54, s: z.s };
      s.nav = { x: z.x + z.w * .74, y: z.y + z.h * .5, s: z.s };
      s.sources.push({ x: z.x + z.w * .74, y: z.y + z.h * .5, spread: 0 });           // le navette partono dal punto sulla mappa
    } else {
      const r = lay.right, t = lay.top;
      s.status = { x: r.x + r.w * .1, y: r.y + r.h * .14, s: r.s };
      s.nav = { x: r.x + r.w * .62, y: r.y + r.h * .55, s: r.s };
      s.clock = { x: t.x + t.w * .07, y: t.y + t.h * .14, s: t.s };
      s.station = { x: t.x + t.w * .62, y: t.y + t.h * .5, r: t.s * .17 };
      s.sources.push({ x: s.station.x, y: s.station.y, spread: 0 });
      s.sources.push({ x: r.x + r.w + 40, y: r.y + r.h * .4, spread: r.h * .25 });
    }
    return s;
  }

  function build(ctx, K) {
    const rnd = K.seeded(42), P = K.pal, pad = 80;
    nebula = K.offscreen(K.W + pad * 2, K.H + pad * 2);
    const n = nebula.x;
    n.fillStyle = P.space; n.fillRect(0, 0, nebula.w, nebula.h);
    n.globalCompositeOperation = 'lighter';
    const blobs = Math.round(18 + K.W * K.H / 110000);
    for (let i = 0; i < blobs; i++) {
      const u = rnd();
      const x = u * nebula.w, y = nebula.h * (.35 + .3 * Math.sin(u * 7 + 1)) + (rnd() - .5) * nebula.h * .5;
      const r = (60 + rnd() * 260) * (K.layout().rowH / 1080);
      const g = n.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, K.rgba(P.neb[i % 2], .07 + rnd() * .06)); g.addColorStop(1, K.rgba(P.neb[i % 2], 0));
      n.fillStyle = g; n.fillRect(x - r, y - r, r * 2, r * 2);
    }
    n.globalCompositeOperation = 'source-over';

    stars = [];
    for (let i = 0; i < K.W * K.H / 2800; i++) {
      const x = rnd() * (K.W + pad * 2) - pad, y = rnd() * (K.H + pad * 2) - pad;
      if (K.visible(x, y)) stars.push({ x, y, d: rnd(), r: .4 + rnd() * 1.4, p: rnd() * 6.28 });
    }
    storms = Array.from({ length: 9 }, () => ({ lat: rnd() * 1.6 - .8, off: rnd(), w: .1 + rnd() * .25, a: .1 + rnd() * .15 }));
    scene = computeScene(K);
    shuttles = [];
    // qualche navetta già in viaggio all'avvio
    for (let i = 0; i < 3; i++) { spawnShuttle(K); shuttles[shuttles.length - 1].u = rnd() * .8; }
  }

  /* ---------- navette ---------- */
  function spawnShuttle(K) {
    const src = scene.sources[(Math.random() * scene.sources.length) | 0], pl = scene.planet;
    const p0 = { x: src.x, y: src.y + (Math.random() - .5) * src.spread };
    // arrivo su un punto del bordo del pianeta rivolto verso la partenza
    const a = Math.atan2(p0.y - pl.y, p0.x - pl.x) + (Math.random() - .5) * .8;
    const p1 = { x: pl.x + Math.cos(a) * pl.R * .95, y: pl.y + Math.sin(a) * pl.R * .95 };
    const c = { x: (p0.x + p1.x) / 2 + (Math.random() - .5) * 200, y: (p0.y + p1.y) / 2 - 80 - Math.random() * 160 };
    shuttles.push({ p0, c, p1, u: 0, sp: .07 + Math.random() * .05 });
  }

  function drawShuttles(ctx, K) {
    const P = K.pal;
    nextShuttle -= K.dt;
    if (nextShuttle <= 0) { spawnShuttle(K); nextShuttle = (2.5 + Math.random() * 3) / lv('traffic'); }
    for (let i = shuttles.length - 1; i >= 0; i--) {
      const s = shuttles[i];
      s.u += K.dt * s.sp;
      if (s.u >= 1) { shuttles.splice(i, 1); continue; }
      const b = K.bez(s.p0, s.c, s.p1, s.u), L = Math.hypot(b.tx, b.ty) || 1, dx = b.tx / L, dy = b.ty / L;
      const size = K.lerp(7, 1.5, s.u), fade = Math.min(1, (1 - s.u) * 6, s.u * 10);
      ctx.globalAlpha = fade;
      const g = ctx.createLinearGradient(b.x, b.y, b.x - dx * size * 9, b.y - dy * size * 9);
      g.addColorStop(0, K.rgba(P.hud, .9)); g.addColorStop(1, K.rgba(P.hud, 0));
      ctx.strokeStyle = g; ctx.lineWidth = size * .6;
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - dx * size * 9, b.y - dy * size * 9); ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(b.x + dx * size * 1.6, b.y + dy * size * 1.6);
      ctx.lineTo(b.x - dy * size * .8, b.y + dx * size * .8);
      ctx.lineTo(b.x + dy * size * .8, b.y - dx * size * .8);
      ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- collegamento dati (dal pannello al pianeta) ---------- */
  function dataLink(ctx, K, a, b) {
    const P = K.pal, pl = scene.planet;
    const ang = Math.atan2(a.y - pl.y, a.x - pl.x);
    const end = { x: pl.x + Math.cos(ang) * pl.R * 1.4, y: pl.y + Math.sin(ang) * pl.R * 1.4 };
    const c = { x: (a.x + end.x) / 2, y: Math.min(a.y, end.y) - Math.abs(a.x - end.x) * .12 };
    ctx.strokeStyle = K.rgba(P.hud, .55); ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 9]); ctx.lineDashOffset = -K.t * 40;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(c.x, c.y, end.x, end.y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = P.hud;
    for (let i = 0; i < 4; i++) {
      const u = (K.t * .18 + i / 4) % 1, q = K.bez(a, c, end, u);
      ctx.globalAlpha = Math.sin(u * Math.PI);
      ctx.fillRect(q.x - 3, q.y - 3, 6, 6);
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- stazione orbitale (3 schermi, schermo di sopra) ---------- */
  function station(ctx, K, st) {
    const P = K.pal;
    // anello visto in prospettiva (fisso); ruotano raggi e luci lungo l'anello
    const rot = K.t * .15, ry = .32;
    ctx.save(); ctx.translate(st.x, st.y); ctx.rotate(-.12);
    ctx.strokeStyle = K.rgba(P.ring, .4); ctx.lineWidth = st.r * .04;
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + rot;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * st.r, Math.sin(a) * st.r * ry); ctx.stroke();
    }
    ctx.strokeStyle = K.rgba(P.ring, .85); ctx.lineWidth = st.r * .12;
    ctx.beginPath(); ctx.ellipse(0, 0, st.r, st.r * ry, 0, 0, 6.283); ctx.stroke();
    ctx.fillStyle = P.planet[1];
    ctx.beginPath(); ctx.ellipse(0, 0, st.r * .2, st.r * .14, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = P.planet[0]; ctx.fillRect(-st.r * .03, -st.r * .45, st.r * .06, st.r * .35);
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * 6.283 + rot;
      ctx.fillStyle = !lv('blink') ? K.rgba(P.hud, .5) : Math.sin(K.real * 2 + i) > 0 ? P.hud : K.rgba(P.hud, .2);
      ctx.fillRect(Math.cos(a) * st.r - 1.5, Math.sin(a) * st.r * ry - 1.5, 3, 3);
    }
    ctx.restore();
    ctx.fillStyle = K.rgba(P.hud, .75); ctx.font = `600 ${Math.max(11, st.r * .09)}px ${MONO}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('STAZIONE ORBITALE · ATTRACCO 3', st.x, st.y + st.r * .5 + 16);
  }

  /* ---------- pianeta ---------- */
  function planet(ctx, K, px, py, R) {
    const P = K.pal, ringTilt = -.22, rx = R * 2.05, ry = R * .38;
    const ring = (from, to) => {
      ctx.save(); ctx.translate(px, py); ctx.rotate(ringTilt);
      for (let i = 0; i < 4; i++) {
        ctx.strokeStyle = K.rgba(P.ring, [.18, .32, .12, .24][i]);
        ctx.lineWidth = R * [.09, .05, .03, .06][i];
        ctx.beginPath(); ctx.ellipse(0, 0, rx * (1 - i * .09), ry * (1 - i * .09), 0, from, to); ctx.stroke();
      }
      ctx.restore();
    };
    let g = ctx.createRadialGradient(px, py, R * .9, px, py, R * 1.5);
    g.addColorStop(0, K.rgba(P.atm, .45 * lv('atm'))); g.addColorStop(1, K.rgba(P.atm, 0));
    ctx.fillStyle = g; ctx.fillRect(px - R * 1.6, py - R * 1.6, R * 3.2, R * 3.2);
    ring(Math.PI, Math.PI * 2);
    ctx.save();
    ctx.beginPath(); ctx.arc(px, py, R, 0, 6.283); ctx.clip();
    g = ctx.createRadialGradient(px - R * .45, py - R * .45, R * .1, px, py, R * 1.1);
    g.addColorStop(0, P.planet[0]); g.addColorStop(.55, P.planet[1]); g.addColorStop(1, P.planet[2]);
    ctx.fillStyle = g; ctx.fillRect(px - R, py - R, R * 2, R * 2);
    for (let i = 0; i < 16; i++) {
      const y = py - R + (i + .5) * (R * 2 / 16);
      ctx.fillStyle = K.rgba(P.band, .05 + .06 * (.5 + .5 * Math.sin(i * 1.7)));
      ctx.fillRect(px - R, y + Math.sin(K.t * .2 + i) * 2, R * 2, R * (.04 + .05 * (.5 + .5 * Math.sin(i * 3.1))));
    }
    for (const s of storms) {
      const u = ((s.off + K.t * .012) % 1) * 2 - 1;
      const y = py + s.lat * R, half = Math.sqrt(Math.max(0, 1 - s.lat * s.lat)) * R;
      const fore = Math.sqrt(Math.max(0, 1 - u * u));
      ctx.fillStyle = K.rgba(P.band, s.a * fore);
      ctx.beginPath(); ctx.ellipse(px + u * half, y, R * s.w * fore + 1, R * s.w * .25, 0, 0, 6.283); ctx.fill();
    }
    g = ctx.createLinearGradient(px - R * .7, py - R * .7, px + R * .8, py + R * .8);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(.55, 'rgba(0,0,0,.15)'); g.addColorStop(1, 'rgba(0,0,0,.9)');
    ctx.fillStyle = g; ctx.fillRect(px - R, py - R, R * 2, R * 2);
    ctx.restore();
    ctx.strokeStyle = K.rgba(P.atm, .6); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(px, py, R, Math.PI * .9, Math.PI * 1.6); ctx.stroke();
    ring(0, Math.PI);
    const a = K.t * .06, mx = px + Math.cos(a) * R * 2.7, my = py + Math.sin(a) * R * .55 - R * .3;
    if (Math.sin(a) > 0 || Math.hypot(mx - px, my - py) > R * 1.05) {
      const mr = R * .09;
      g = ctx.createRadialGradient(mx - mr * .4, my - mr * .4, 0, mx, my, mr);
      g.addColorStop(0, P.band); g.addColorStop(1, P.planet[2]);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(mx, my, mr, 0, 6.283); ctx.fill();
    }
  }

  /* ---------- HUD ---------- */
  function brackets(ctx, x, y, w, h, c, len = 14) {
    ctx.strokeStyle = c; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y + len); ctx.lineTo(x, y); ctx.lineTo(x + len, y);
    ctx.moveTo(x + w - len, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + len);
    ctx.moveTo(x + w, y + h - len); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - len, y + h);
    ctx.moveTo(x + len, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - len);
    ctx.stroke();
  }

  function panel(ctx, K, x, y, w, h, title) {
    const P = K.pal;
    ctx.fillStyle = K.rgba(P.hud, .05); ctx.fillRect(x, y, w, h);
    brackets(ctx, x, y, w, h, K.rgba(P.hud, .7));
    ctx.fillStyle = K.rgba(P.hud, .8);
    ctx.font = `600 ${Math.max(10, h * .07)}px ${MONO}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(title, x + 12, y + 10);
  }

  function reticle(ctx, K, px, py, R) {
    const P = K.pal, rr = R * 1.32;
    ctx.save(); ctx.translate(px, py);
    ctx.strokeStyle = K.rgba(P.hud, .35); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, rr, 0, 6.283); ctx.stroke();
    ctx.rotate(K.t * .08);
    ctx.strokeStyle = K.rgba(P.hud, .7); ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(0, 0, rr + 8, i * Math.PI / 2 + .2, i * Math.PI / 2 + .9); ctx.stroke(); }
    ctx.rotate(-K.t * .2);
    ctx.lineWidth = 1;
    for (let i = 0; i < 72; i++) {
      const a = i / 72 * 6.283, l = i % 6 === 0 ? 10 : 4;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * (rr - 4), Math.sin(a) * (rr - 4));
      ctx.lineTo(Math.cos(a) * (rr - 4 - l), Math.sin(a) * (rr - 4 - l)); ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = K.rgba(P.hud, .85);
    ctx.font = `600 ${Math.max(11, R * .07)}px ${MONO}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const lx = px + rr * .74, ly = py - rr * .74;
    ctx.strokeStyle = K.rgba(P.hud, .6);
    ctx.beginPath(); ctx.moveTo(px + rr * .7, py - rr * .7); ctx.lineTo(lx + 20, ly - 20); ctx.lineTo(lx + 130, ly - 20); ctx.stroke();
    ctx.fillText('KX-7 · GIGANTE GASSOSO', lx + 24, ly - 34);
    ctx.fillStyle = K.rgba(P.hud, .55);
    ctx.fillText(`DIST ${(1.2 + Math.sin(K.t * .05) * .05).toFixed(3)} UA · NAVETTE ${shuttles.length}`, lx + 24, ly - 4);
  }

  function clockPanel(ctx, K, x, y, s) {
    const P = K.pal, w = s * .5, h = s * .27, ck = K.clock();
    panel(ctx, K, x, y, w, h, 'TEMPO DI BORDO');
    ctx.fillStyle = P.hud; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = P.hud; ctx.shadowBlur = 12 * lv('hudGlow');
    ctx.font = `300 ${h * .42}px "Segoe UI", Arial, sans-serif`;
    ctx.fillText(ck.time, x + 12, y + h * .62);
    const tw = ctx.measureText(ck.time).width;
    ctx.font = `400 ${h * .15}px ${MONO}`; ctx.fillStyle = K.rgba(P.hud, .7);
    ctx.fillText(ck.ss, x + 22 + tw, y + h * .62);
    ctx.shadowBlur = 0;
    const doy = Math.floor((ck.d - new Date(ck.d.getFullYear(), 0, 0)) / 864e5);
    ctx.font = `500 ${h * .085}px ${MONO}`; ctx.fillStyle = K.rgba(P.hud, .85);
    ctx.fillText(ck.date.toUpperCase(), x + 14, y + h * .8);
    ctx.fillStyle = K.rgba(P.hud, .5);
    ctx.fillText(`DATA STELLARE ${ck.d.getFullYear()}.${String(doy).padStart(3, '0')}`, x + 14, y + h * .93);
  }

  function statusPanel(ctx, K, x, y, s) {
    const P = K.pal, w = s * .42, h = s * .26;
    panel(ctx, K, x, y, w, h, 'STATO NAVE');
    const rows = [['SCUDI', .92, .3], ['PROPULSORI', .74, .8], ['OSSIGENO', .98, .1], ['ENERGIA', .63, .55]];
    const fs = Math.max(10, h * .075);
    ctx.font = `500 ${fs}px ${MONO}`; ctx.textBaseline = 'middle';
    rows.forEach(([name, base, wob], i) => {
      const v = K.clamp(base + Math.sin(K.t * (.3 + wob) + i * 2) * .05 * wob, 0, 1);
      const ry = y + h * (.33 + i * .17), bx = x + w * .42, bw = w * .45;
      ctx.textAlign = 'left'; ctx.fillStyle = K.rgba(P.hud, .75); ctx.fillText(name, x + 12, ry);
      ctx.fillStyle = K.rgba(P.hud, .15); ctx.fillRect(bx, ry - fs * .35, bw, fs * .7);
      ctx.fillStyle = v < .7 ? P.alert : P.hud; ctx.fillRect(bx, ry - fs * .35, bw * v, fs * .7);
      ctx.textAlign = 'right'; ctx.fillStyle = K.rgba(P.hud, .75);
      ctx.fillText(Math.round(v * 100) + '%', x + w - 8, ry);
    });
  }

  function navMap(ctx, K, cx, cy, s) {
    const P = K.pal, r = s * .14;
    ctx.strokeStyle = K.rgba(P.hud, .25); ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) { ctx.beginPath(); ctx.arc(cx, cy, r * i / 4, 0, 6.283); ctx.stroke(); }
    brackets(ctx, cx - r - 14, cy - r - 14, r * 2 + 28, r * 2 + 28, K.rgba(P.hud, .6));
    ctx.fillStyle = P.hud; ctx.beginPath(); ctx.arc(cx, cy, 4, 0, 6.283); ctx.fill();
    for (let i = 1; i <= 4; i++) {
      const a = K.t * (.5 / i) + i * 1.3;
      ctx.fillStyle = i === 3 ? P.alert : K.rgba(P.hud, .8);
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r * i / 4, cy + Math.sin(a) * r * i / 4, i === 3 ? 4 : 2.5, 0, 6.283); ctx.fill();
    }
    ctx.font = `600 ${Math.max(10, r * .1)}px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillStyle = K.rgba(P.hud, .7); ctx.fillText('MAPPA DI NAVIGAZIONE', cx, cy + r + 22);
  }

  /* ---------- cornice della plancia ---------- */
  function cockpit(ctx, K) {
    const P = K.pal, lay = K.layout();
    for (const z of lay.zones) {
      ctx.fillStyle = P.frame; ctx.strokeStyle = K.rgba(P.hud, .35); ctx.lineWidth = 1.5;
      const bottomRow = z.y + z.h >= lay.ground - 1, Y = (k) => z.y + z.h * k;
      if (bottomRow) {
        ctx.beginPath();
        ctx.moveTo(z.x, z.y + z.h); ctx.lineTo(z.x, Y(.86)); ctx.lineTo(z.x + z.w * .18, Y(.925));
        ctx.lineTo(z.x + z.w * .82, Y(.925)); ctx.lineTo(z.x + z.w, Y(.86)); ctx.lineTo(z.x + z.w, z.y + z.h);
        ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(z.x, Y(.86)); ctx.lineTo(z.x + z.w * .18, Y(.925));
        ctx.lineTo(z.x + z.w * .82, Y(.925)); ctx.lineTo(z.x + z.w, Y(.86)); ctx.stroke();
        for (let i = 0; i < 14; i++) {
          // nel calmo le spie restano fisse invece di lampeggiare
          const on = lv('blink') ? Math.sin(K.real * (1 + (i % 5) * .7) + i * 2.1 + z.x) > -.2 : (i * 7 + 3) % 5 > 1;
          ctx.fillStyle = on ? K.rgba(i % 4 === 0 ? P.alert : P.hud, .85) : K.rgba(P.hud, .12);
          ctx.fillRect(z.x + z.w * (.3 + i * .03), Y(.955), z.w * .012, 4);
        }
        ctx.fillStyle = P.frame;
      }
      // angoli superiori (solo sui bordi esterni della plancia)
      const topEdge = z.y === 0;
      if (topEdge) for (const side of [0, 1]) {
        const x0 = side ? z.x + z.w : z.x, dir = side ? -1 : 1;
        ctx.beginPath(); ctx.moveTo(x0, z.y); ctx.lineTo(x0 + dir * z.w * .1, z.y); ctx.lineTo(x0, Y(.16)); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x0 + dir * z.w * .1, z.y); ctx.lineTo(x0, Y(.16)); ctx.stroke();
      }
    }
    // montanti verticali e traverse orizzontali sulle cornici dei monitor
    const beam = (x, y, w, h, vertical) => {
      const g = vertical ? ctx.createLinearGradient(x, 0, x + w, 0) : ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, P.frame); g.addColorStop(.5, '#1a1a24'); g.addColorStop(1, P.frame);
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = K.rgba(P.hud, .3); ctx.lineWidth = 1;
      ctx.beginPath();
      if (vertical) { ctx.moveTo(x, y); ctx.lineTo(x, y + h); ctx.moveTo(x + w, y); ctx.lineTo(x + w, y + h); }
      else { ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.moveTo(x, y + h); ctx.lineTo(x + w, y + h); }
      ctx.stroke();
    };
    const b = 26;
    if (lay.mode === 2) beam(lay.main.x - b, 0, b * 2, K.H, true);
    if (lay.mode === 3) {
      beam(lay.right.x - b, lay.rowY, b * 2, lay.rowH, true);
      beam(0, lay.rowY - b, lay.top.w, b * 2, false);
    }
  }

  /* ---------- disegno ---------- */
  function draw(ctx, K) {
    const P = K.pal, W = K.W, lay = K.layout(), sc = scene;
    const tx = K.props.mouse && K.mouse.inside ? K.mouse.nx : 0, ty = K.props.mouse && K.mouse.inside ? K.mouse.ny : 0;
    par.x += (tx - par.x) * .04; par.y += (ty - par.y) * .04;

    ctx.drawImage(nebula.c, -80 - par.x * 20, -80 - par.y * 12, nebula.w, nebula.h);

    // le stelle scorrono nella direzione del flusso, verso il principale
    const drift = lay.mode === 2 ? 1 : -1;
    ctx.fillStyle = '#fff';
    for (const s of stars) {
      s.x += drift * (2 + s.d * 10) * K.dt;
      if (s.x < -80) s.x += W + 160; else if (s.x > W + 80) s.x -= W + 160;
      ctx.globalAlpha = (.3 + .7 * s.d) * (.7 + .3 * Math.sin(K.real * 1.3 + s.p));
      ctx.fillRect(s.x - par.x * (10 + s.d * 40), s.y - par.y * (6 + s.d * 24), s.r, s.r);
    }
    ctx.globalAlpha = 1;

    if (!comet && Math.random() < .002 * K.speed * lv('traffic')) {
      const z = lay.zones[(Math.random() * lay.zones.length) | 0];
      comet = { x: z.x + Math.random() * z.w, y: z.y - 20, vx: -300 - Math.random() * 300, vy: 200 + Math.random() * 150, life: 0, z };
    }
    if (comet) {
      comet.x += comet.vx * K.dt; comet.y += comet.vy * K.dt; comet.life += K.dt;
      const g = ctx.createLinearGradient(comet.x, comet.y, comet.x - comet.vx * .25, comet.y - comet.vy * .25);
      g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = g; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(comet.x, comet.y); ctx.lineTo(comet.x - comet.vx * .25, comet.y - comet.vy * .25); ctx.stroke();
      if (comet.y > comet.z.y + comet.z.h * .9 || comet.life > 5) comet = null;
    }

    const px = sc.planet.x - par.x * 14, py = sc.planet.y - par.y * 8, R = sc.planet.R;
    if (sc.station) station(ctx, K, { ...sc.station, x: sc.station.x - par.x * 8, y: sc.station.y - par.y * 5 });
    planet(ctx, K, px, py, R);
    drawShuttles(ctx, K);
    reticle(ctx, K, px + par.x * 4, py + par.y * 3, R);

    const hx = par.x * 5, hy = par.y * 3;
    if (sc.nav) {
      dataLink(ctx, K, { x: sc.nav.x + hx, y: sc.nav.y + hy }, { x: px, y: py });
      navMap(ctx, K, sc.nav.x + hx, sc.nav.y + hy, sc.nav.s);
    }
    if (K.props.orologio && sc.clock) clockPanel(ctx, K, sc.clock.x + hx, sc.clock.y + hy, sc.clock.s);
    statusPanel(ctx, K, sc.status.x + hx, sc.status.y + hy, sc.status.s);

    if (K.props.cornice) cockpit(ctx, K);
  }

  Kit.start({ palettes: PALETTES, defaults: { cornice: true }, build, draw });
})();

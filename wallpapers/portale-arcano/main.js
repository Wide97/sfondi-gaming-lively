/* Portale Arcano — cerchi di rune rotanti, cristalli sospesi, lucciole e scintille magiche. */
(function () {
  'use strict';

  const PALETTES = [
    { name: 'Neon', bg: ['#14022a', '#030008'], ring: '#ff4fd8', ring2: '#00e5ff',
      core: ['#ffffff', '#ff4fd8', '#5b2bff'], crystal: ['#00e5ff', '#ff4fd8'], fly: '#ffe6ff', spark: '#ff9cf0', fog: '#5b2bff' },
    { name: 'Notturno', bg: ['#061426', '#010409'], ring: '#5fb0ff', ring2: '#3dffd0',
      core: ['#e6f7ff', '#3d8bff', '#0a2a66'], crystal: ['#5fb0ff', '#3dffd0'], fly: '#bfffea', spark: '#9fe6ff', fog: '#1d4f8f' },
    { name: 'Pastello', bg: ['#33295a', '#140f26'], ring: '#ffc6e8', ring2: '#c6f6ff',
      core: ['#fffaf0', '#ffc6e8', '#b8a6ff'], crystal: ['#c6f6ff', '#ffd6f0'], fly: '#fff6d6', spark: '#ffe0f4', fog: '#b8a6ff' },
    { name: 'Mono', bg: ['#1c1307', '#050301'], ring: '#ffcc66', ring2: '#ffe7b0',
      core: ['#fff8e6', '#ffcc66', '#7a4a00'], crystal: ['#ffcc66', '#ffe7b0'], fly: '#ffe7b0', spark: '#ffd98a', fog: '#7a4a00' },
  ];

  let portals = [], crystals = [], flies = [], sparks = [], fog, lastMouse = null;

  /* ---------- rune procedurali (simboli inventati) ---------- */
  function glyph(c, size, rnd) {
    const pt = () => [(((rnd() * 3) | 0) - 1) * size / 2, (((rnd() * 3) | 0) - 1) * size / 2];
    c.beginPath();
    let [x, y] = pt(); c.moveTo(x, y);
    const n = 2 + ((rnd() * 3) | 0);
    for (let i = 0; i < n; i++) { [x, y] = pt(); rnd() < .25 ? c.moveTo(x, y) : c.lineTo(x, y); }
    c.stroke();
    if (rnd() < .35) { c.beginPath(); c.arc(0, 0, size * .16, 0, 6.283); c.stroke(); }
  }

  function makeRing(K, r, variant, rnd) {
    const P = K.pal, pad = 30, img = K.offscreen(r * 2 + pad * 2, r * 2 + pad * 2), c = img.x;
    const col = variant === 2 ? P.ring2 : P.ring;
    c.translate(r + pad, r + pad);
    c.strokeStyle = col; c.fillStyle = col;
    c.shadowColor = col; c.shadowBlur = 12;
    c.lineCap = 'round'; c.lineJoin = 'round';

    if (variant === 1) {                                  // geometria sacra: stella a 7 punte
      c.lineWidth = 1.6;
      c.beginPath(); c.arc(0, 0, r, 0, 6.283); c.stroke();
      c.beginPath();
      for (let i = 0; i <= 7; i++) {
        const a = (i * 3 % 7) / 7 * 6.283 - Math.PI / 2;
        i ? c.lineTo(Math.cos(a) * r, Math.sin(a) * r) : c.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      c.stroke();
      c.beginPath(); c.arc(0, 0, r * .52, 0, 6.283); c.stroke();
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * 6.283 - Math.PI / 2;
        c.beginPath(); c.arc(Math.cos(a) * r, Math.sin(a) * r, r * .045, 0, 6.283); c.fill();
      }
    } else {                                              // anello di rune
      const inner = variant === 0 ? .84 : .8;
      c.lineWidth = variant === 0 ? 2.2 : 1.6;
      c.beginPath(); c.arc(0, 0, r, 0, 6.283); c.stroke();
      c.lineWidth = 1.2;
      c.beginPath(); c.arc(0, 0, r * inner, 0, 6.283); c.stroke();
      const mid = r * (1 + inner) / 2, gs = r * (1 - inner) * .55;
      const n = Math.max(12, Math.floor(6.283 * mid / (gs * 1.9)));
      c.lineWidth = Math.max(1.2, gs * .12);
      for (let i = 0; i < n; i++) {
        const a = i / n * 6.283;
        c.save(); c.rotate(a); c.translate(0, -mid);
        if (i % 6 === 5) { c.beginPath(); c.arc(0, 0, gs * .12, 0, 6.283); c.fill(); }
        else glyph(c, gs, rnd);
        c.restore();
      }
      if (variant === 2) {
        c.lineWidth = 1;
        for (let i = 0; i < 96; i++) {
          const a = i / 96 * 6.283, l = i % 8 ? r * .03 : r * .07;
          c.beginPath(); c.moveTo(Math.cos(a) * r * inner, Math.sin(a) * r * inner);
          c.lineTo(Math.cos(a) * (r * inner - l), Math.sin(a) * (r * inner - l)); c.stroke();
        }
      }
    }
    return img;
  }

  function makePortal(K, x, y, R, rnd) {
    return {
      x, y, R,
      rings: [
        { img: makeRing(K, R, 0, rnd), r: R, sp: .07 },
        { img: makeRing(K, R * .78, 1, rnd), r: R * .78, sp: -.11 },
        { img: makeRing(K, R * .56, 2, rnd), r: R * .56, sp: .18 },
      ],
      vortex: Array.from({ length: Math.round(120 + R * .6) }, () => ({ a: rnd() * 6.283, r: rnd(), sp: .6 + rnd() * .8 })),
    };
  }

  /* ---------- cristallo sospeso ---------- */
  function crystal(ctx, K, c) {
    const P = K.pal, col = P.crystal[c.ci], x = c.x, y = c.y + Math.sin(K.t * .8 + c.ph) * c.h * .12;
    const w = c.h * .38, h = c.h;
    let g = ctx.createRadialGradient(x, y, 0, x, y, h * 1.4);
    g.addColorStop(0, K.rgba(col, .22 + K.mid * .2)); g.addColorStop(1, K.rgba(col, 0));
    ctx.fillStyle = g; ctx.fillRect(x - h * 1.4, y - h * 1.4, h * 2.8, h * 2.8);
    ctx.save(); ctx.translate(x, y); ctx.rotate(c.tilt + Math.sin(K.t * .3 + c.ph) * .05);
    const pts = [[0, -h * .6], [w, -h * .2], [w * .75, h * .3], [0, h * .5], [-w * .75, h * .3], [-w, -h * .2]];
    g = ctx.createLinearGradient(-w, -h * .6, w, h * .5);
    g.addColorStop(0, K.rgba('#ffffff', .75)); g.addColorStop(.4, K.rgba(col, .55)); g.addColorStop(1, K.rgba(col, .12));
    ctx.fillStyle = g;
    ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = K.rgba('#ffffff', .55); ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -h * .6); ctx.lineTo(w * .15, h * .05); ctx.lineTo(0, h * .5);
    ctx.moveTo(-w, -h * .2); ctx.lineTo(w * .15, h * .05); ctx.lineTo(w, -h * .2); ctx.stroke();
    ctx.restore();
  }

  /* ---------- costruzione ---------- */
  function build(ctx, K) {
    const rnd = K.seeded(777), lay = K.layout(), H = K.H;
    portals = [];
    if (K.screens === 1) portals.push(makePortal(K, lay.main.cx, H * .45, lay.main.s * .29, rnd));
    else if (K.screens === 2) for (const z of lay.all) portals.push(makePortal(K, z.cx, H * .45, z.s * .27, rnd));
    else {
      portals.push(makePortal(K, lay.main.cx, H * .45, lay.main.s * .3, rnd));
      for (const z of lay.side) portals.push(makePortal(K, z.cx, H * .42, z.s * .16, rnd));
    }

    // cristalli dentro ogni zona, lontani dal centro dei portali
    crystals = [];
    for (const z of lay.all) {
      let tries = 0, placed = 0;
      while (placed < 5 && tries++ < 200) {
        const x = z.x + z.w * (.08 + rnd() * .84), y = H * (.15 + rnd() * .65);
        if (portals.some((p) => Math.hypot(p.x - x, p.y - y) < p.R * 1.35)) continue;
        if (crystals.some((c) => Math.hypot(c.x - x, c.y - y) < z.s * .14)) continue;
        crystals.push({ x, y, h: z.s * (.04 + rnd() * .05), ph: rnd() * 6.28, ci: (rnd() * 2) | 0, tilt: (rnd() - .5) * .4 });
        placed++;
      }
    }

    flies = Array.from({ length: Math.round(K.W * K.H / 9000) }, () => ({
      x: rnd() * K.W, y: rnd() * K.H, v: 8 + rnd() * 22, ph: rnd() * 6.28, r: .8 + rnd() * 1.8 }));

    fog = K.offscreen(K.W, K.H);
    const f = fog.x;
    for (let i = 0; i < 40; i++) {
      const x0 = rnd() * K.W, y = H * (.6 + rnd() * .45), r = H * (.12 + rnd() * .2);
      for (const x of [x0 - K.W, x0, x0 + K.W]) {          // ripetuto ai bordi: scorrimento senza giunture
        if (x + r < 0 || x - r > K.W) continue;
        const g = f.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, K.rgba(K.pal.fog, .12)); g.addColorStop(1, K.rgba(K.pal.fog, 0));
        f.fillStyle = g; f.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }
    sparks = [];
  }

  /* ---------- disegno ---------- */
  function drawPortal(ctx, K, p) {
    const P = K.pal, pulse = 1 + K.bass * .06;
    let g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.R * 1.5);
    g.addColorStop(0, K.rgba(P.core[1], .2 + K.bass * .2)); g.addColorStop(1, K.rgba(P.core[1], 0));
    ctx.fillStyle = g; ctx.fillRect(p.x - p.R * 1.5, p.y - p.R * 1.5, p.R * 3, p.R * 3);

    ctx.globalCompositeOperation = 'lighter';
    // nucleo
    const br = .85 + .15 * Math.sin(K.t * 1.4);
    g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.R * .5);
    g.addColorStop(0, K.rgba(P.core[0], .85 * br)); g.addColorStop(.35, K.rgba(P.core[1], .45 * br));
    g.addColorStop(1, K.rgba(P.core[2], 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.R * .5, 0, 6.283); ctx.fill();

    // vortice
    const Rc = p.R * .5;
    ctx.fillStyle = P.ring2;
    for (const v of p.vortex) {
      v.a += (1.4 / (v.r + .15)) * K.dt * v.sp;
      v.r -= .09 * K.dt * v.sp;
      if (v.r < .04) v.r = 1;
      ctx.globalAlpha = Math.min(1, (1 - v.r) * 1.2) * .8;
      const s = 1 + (1 - v.r) * 1.5;
      ctx.fillRect(p.x + Math.cos(v.a) * v.r * Rc, p.y + Math.sin(v.a) * v.r * Rc * .96, s, s);
    }
    ctx.globalAlpha = .9;

    for (const r of p.rings) {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(K.t * r.sp); ctx.scale(pulse, pulse);
      ctx.drawImage(r.img.c, -r.img.w / 2, -r.img.h / 2, r.img.w, r.img.h);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function draw(ctx, K) {
    const P = K.pal, W = K.W, H = K.H;
    const g = ctx.createRadialGradient(W / 2, H * .45, 0, W / 2, H * .45, Math.max(W, H) * .75);
    g.addColorStop(0, P.bg[0]); g.addColorStop(1, P.bg[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // nebbia che scorre
    const off = (K.t * 10) % W;
    ctx.globalAlpha = .9;
    ctx.drawImage(fog.c, -off, 0, W, H); ctx.drawImage(fog.c, W - off, 0, W, H);
    ctx.globalAlpha = 1;

    for (const p of portals) drawPortal(ctx, K, p);
    for (const c of crystals) crystal(ctx, K, c);

    // lucciole
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = P.fly;
    for (const f of flies) {
      f.y -= f.v * K.dt; f.x += Math.sin(K.t * .7 + f.ph) * 12 * K.dt;
      if (f.y < -10) { f.y = H + 10; f.x = Math.random() * W; }
      ctx.globalAlpha = .25 + .6 * Math.max(0, Math.sin(K.real * 1.6 + f.ph));
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.283); ctx.fill();
    }

    // scintille dal mouse
    if (K.props.mouse && K.mouse.inside) {
      const m = K.mouse;
      if (lastMouse) {
        const d = Math.hypot(m.x - lastMouse.x, m.y - lastMouse.y), n = Math.min(12, Math.floor(d / 6));
        for (let i = 0; i < n && sparks.length < 500; i++) {
          const k = i / n;
          sparks.push({ x: K.lerp(lastMouse.x, m.x, k), y: K.lerp(lastMouse.y, m.y, k),
            vx: (Math.random() - .5) * 60, vy: (Math.random() - .5) * 60 - 20, life: 1, r: 1 + Math.random() * 2 });
        }
      }
      lastMouse = { x: m.x, y: m.y };
    } else lastMouse = null;
    ctx.fillStyle = P.spark;
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.x += s.vx * K._frameDt; s.y += s.vy * K._frameDt; s.vy -= 30 * K._frameDt; s.life -= K._frameDt * .9;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      ctx.globalAlpha = s.life;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r * s.life, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // orologio sotto il portale principale
    if (K.props.orologio) {
      const p = portals[K.screens === 3 ? 0 : portals.length - 1], ck = K.clock(), s = K.layout().main.s;
      const y = p.y + p.R * 1.32;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `400 ${s * .065}px Georgia, "Times New Roman", serif`;
      ctx.shadowColor = P.ring; ctx.shadowBlur = 18 + K.bass * 20;
      ctx.fillStyle = K.rgba(P.core[0], .92);
      ctx.fillText(ck.time.split('').join(' '), p.x, y);
      ctx.font = `italic 400 ${s * .022}px Georgia, "Times New Roman", serif`;
      ctx.shadowBlur = 8; ctx.fillStyle = K.rgba(P.ring2, .85);
      ctx.fillText('— ' + ck.date + ' —', p.x, y + s * .055);
      ctx.shadowBlur = 0;
    }
  }

  Kit.start({ palettes: PALETTES, build, draw });
})();

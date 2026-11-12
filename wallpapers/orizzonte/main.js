/* Orizzonte — colline morbide sotto un cielo che segue l'ora e il meteo reali.
 *
 * Il cielo passa da notte ad alba, giorno e tramonto usando gli orari veri di alba e tramonto
 * della città scelta (Open-Meteo, vedi shared/info.js); senza meteo usa 07:00 e 17:30.
 * Nuvole, pioggia e neve seguono il tempo attuale.
 *
 * Flusso tra gli schermi:
 *  - le colline scorrono piano verso lo schermo principale
 *  - il sole e la luna attraversano il cielo di tutta la fila (con 3 schermi stanno in quello di sopra)
 *  - i pannelli informativi vanno sugli schermi secondari, così il principale resta libero per le icone
 */
(function () {
  'use strict';

  // colori del cielo per momento della giornata: top/bot = alto/basso del cielo, hill = colline vicine
  const PALETTES = [
    { name: 'Colline', accent: '#ffcf8a',
      night: { top: '#0b1022', bot: '#1d2744', hill: '#0e1822' }, dawn: { top: '#3a3f6c', bot: '#e6ad98', hill: '#46566a' },
      day: { top: '#5c8dbd', bot: '#a8c5d8', hill: '#5f8a76' }, dusk: { top: '#2d2a52', bot: '#d98f74', hill: '#3a3b57' } },
    { name: 'Lago', accent: '#9fd0ff',
      night: { top: '#070d1c', bot: '#14243e', hill: '#0a1524' }, dawn: { top: '#32446c', bot: '#dcb6a6', hill: '#3a506c' },
      day: { top: '#5a92c6', bot: '#a9c9df', hill: '#46738f' }, dusk: { top: '#273863', bot: '#cc8f86', hill: '#2c4262' } },
    { name: 'Dune', accent: '#ffc58f',
      night: { top: '#120f1c', bot: '#2a2233', hill: '#1a141e' }, dawn: { top: '#48395a', bot: '#e8b98f', hill: '#7d6052' },
      day: { top: '#7ea6c4', bot: '#d9c7a8', hill: '#b08c66' }, dusk: { top: '#3b2b4c', bot: '#dc9267', hill: '#644743' } },
    { name: 'Grafite', accent: '#d8dde6',
      night: { top: '#0a0b0e', bot: '#1a1c22', hill: '#101216' }, dawn: { top: '#383b44', bot: '#aaa6a2', hill: '#464950' },
      day: { top: '#76808d', bot: '#bcc2c9', hill: '#5f666f' }, dusk: { top: '#2d2f36', bot: '#97908b', hill: '#393c44' } },
  ];

  const LIVELLI = {
    clouds: [.6, .85, 1],      // opacità delle nuvole
    precip: [.5, .8, 1],       // pioggia e neve
    drift:  [.6, .85, 1],      // velocità di scorrimento delle colline
    stars:  [.6, .85, 1],
  };
  const lv = (k) => Kit.pick(LIVELLI[k]);

  // colline: posizione della cresta (frazione della fila), ampiezza, frequenze, velocità, foschia
  const HILLS = [
    { base: .52, amp: .06, f: [.0021, .0057, .013], sp: 1.5, haze: .62 },
    { base: .6, amp: .07, f: [.0017, .0049, .011], sp: 3, haze: .46 },
    { base: .68, amp: .075, f: [.0014, .0041, .0093], sp: 5, haze: .3 },
    { base: .77, amp: .07, f: [.0012, .0036, .0081], sp: 8, haze: .15 },
    { base: .88, amp: .06, f: [.001, .003, .007], sp: 12, haze: 0 },
  ];

  let stars = [], clouds = [], drops = [], cloudSprite, hillPh = [];

  /* ---------- colori ---------- */
  const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
  const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const smooth = (k) => k * k * (3 - 2 * k);

  const minutes = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

  // alba/tramonto di oggi (dal meteo) e minuti attuali
  function sunTimes() {
    const now = Info.now(), min = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    const d = Info.weather && Info.weather.daily && Info.weather.daily[0];
    return { min, sr: d ? minutes(d.sunrise) : 7 * 60, ss: d ? minutes(d.sunset) : 17 * 60 + 30 };
  }

  // colori del cielo in questo momento + quanto è notte (0..1)
  function skyNow(P, cloudy) {
    const { min, sr, ss } = sunTimes();
    const keys = [[0, 'night'], [sr - 75, 'night'], [sr - 10, 'dawn'], [sr + 90, 'day'], [ss - 90, 'day'], [ss + 10, 'dusk'], [ss + 70, 'night'], [1440, 'night']];
    let i = 0;
    while (i < keys.length - 2 && min >= keys[i + 1][0]) i++;
    const [a0, s0] = keys[i], [a1, s1] = keys[i + 1], k = smooth(Kit.clamp((min - a0) / Math.max(1, a1 - a0), 0, 1));
    const A = P[s0], B = P[s1];
    let top = mix(hex(A.top), hex(B.top), k), bot = mix(hex(A.bot), hex(B.bot), k);
    const hill = mix(hex(A.hill), hex(B.hill), k);
    const night = (s0 === 'night' ? 1 - k : 0) + (s1 === 'night' ? k : 0);
    // cielo coperto: i colori si spengono verso il grigio
    const grey = (c) => { const l = c[0] * .3 + c[1] * .59 + c[2] * .11; return [l, l, l]; };
    top = mix(top, grey(top), cloudy * .55); bot = mix(bot, grey(bot), cloudy * .6);
    return { top, bot, hill, night, min, sr, ss };
  }

  /* ---------- costruzione ---------- */
  function build(ctx, K) {
    const rnd = K.seeded(2024), lay = K.layout();
    hillPh = HILLS.map(() => [rnd() * 100, rnd() * 100, rnd() * 100]);

    stars = [];
    const skyBottom = lay.rowY + lay.rowH * .55;
    for (let i = 0; i < K.W * skyBottom / 4500; i++) {
      const x = rnd() * K.W, y = rnd() * skyBottom;
      if (K.visible(x, y)) stars.push({ x, y, r: .5 + rnd() * 1.1, p: rnd() * 6.28 });
    }

    // sprite della nuvola: più sbuffi morbidi
    cloudSprite = K.offscreen(360, 150);
    const c = cloudSprite.x;
    for (let i = 0; i < 6; i++) {
      const x = 90 + rnd() * 180, y = 75 + (rnd() - .5) * 24, r = 62 + rnd() * 26;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,.4)'); g.addColorStop(.6, 'rgba(255,255,255,.18)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    clouds = Array.from({ length: 22 }, (_, i) => {
      const z = lay.zones[i % lay.zones.length];
      return { x: z.x + rnd() * z.w, y: z.y + z.h * (.06 + rnd() * .38), s: .6 + rnd() * 1.1, v: 4 + rnd() * 8, k: rnd(), zone: z };
    });
    drops = Array.from({ length: Math.round(K.W * K.H / 5000) }, () => ({ x: rnd() * K.W, y: rnd() * K.H, v: .7 + rnd() * .6, ph: rnd() * 6.28 }));
  }

  /* ---------- disegno ---------- */
  function ridgeY(i, x, lay) {
    const h = HILLS[i], ph = hillPh[i], f = h.f;
    return lay.rowY + lay.rowH * (h.base + h.amp * (.55 * Math.sin(x * f[0] + ph[0]) + .3 * Math.sin(x * f[1] + ph[1]) + .15 * Math.sin(x * f[2] + ph[2])));
  }

  function drawSunMoon(ctx, K, lay, s, cloudy) {
    const veil = 1 - cloudy * .75;                  // col cielo coperto sole e luna si intravedono appena
    const z = lay.mode === 3 ? lay.top : lay.mode === 2 ? { x: 0, y: lay.rowY, w: K.W, h: lay.rowH } : lay.main;
    const arc = (p) => ({
      x: z.x + z.w * (.08 + .84 * p),
      y: lay.mode === 3 ? z.y + z.h * (1.05 - .82 * Math.sin(Math.PI * p)) : z.y + z.h * (.62 - .46 * Math.sin(Math.PI * p)),
    });
    const r = Math.min(z.w, z.h) * .045;
    const day = (s.min - s.sr) / (s.ss - s.sr);
    if (day > -.06 && day < 1.06) {
      const { x, y } = arc(day), low = 1 - Math.sin(Math.PI * Kit.clamp(day, 0, 1));
      const col = mix([255, 240, 205], [255, 170, 110], low);
      const g = ctx.createRadialGradient(x, y, r * .5, x, y, r * 7);
      g.addColorStop(0, css(col, .3 * veil)); g.addColorStop(1, css(col, 0));
      ctx.fillStyle = g; ctx.fillRect(x - r * 7, y - r * 7, r * 14, r * 14);
      ctx.fillStyle = css(col, .95 * veil); ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
    }
    // luna: attraversa il cielo durante la notte
    const nightLen = 1440 - s.ss + s.sr, pn = (((s.min - s.ss) % 1440) + 1440) % 1440 / nightLen;
    if (pn > -.06 && pn < 1.06) {
      const { x, y } = arc(pn), mr = r * .8;
      const g = ctx.createRadialGradient(x, y, mr * .5, x, y, mr * 5);
      g.addColorStop(0, 'rgba(220,228,255,.16)'); g.addColorStop(1, 'rgba(220,228,255,0)');
      ctx.fillStyle = g; ctx.fillRect(x - mr * 5, y - mr * 5, mr * 10, mr * 10);
      ctx.globalAlpha = veil;
      ctx.fillStyle = 'rgba(232,236,248,.9)'; ctx.beginPath(); ctx.arc(x, y, mr, 0, 6.283); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = css(s.top, .85 * veil); ctx.beginPath(); ctx.arc(x + mr * .45, y - mr * .25, mr * .9, 0, 6.283); ctx.fill();
    }
  }

  function draw(ctx, K) {
    const P = K.pal, W = K.W, H = K.H, lay = K.layout();
    const useSky = K.props.cielo !== false;
    const code = useSky && Info.weather ? Info.weather.current.code : 2;
    const cloudy = useSky && Info.weather ? Info.cloudiness(code) : .3;
    const s = skyNow(P, cloudy);

    // cielo unico su tutti gli schermi
    let g = ctx.createLinearGradient(0, 0, 0, lay.rowY + lay.rowH * .75);
    g.addColorStop(0, css(s.top)); g.addColorStop(1, css(s.bot));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    if (s.night > .05) {
      ctx.fillStyle = '#fff';
      for (const st of stars) {
        ctx.globalAlpha = s.night * (1 - cloudy * .8) * lv('stars') * (.35 + .35 * Math.sin(K.real * .5 + st.p));
        ctx.fillRect(st.x, st.y, st.r, st.r);
      }
      ctx.globalAlpha = 1;
    }
    drawSunMoon(ctx, K, lay, s, cloudy);

    // nuvole: scorrono verso il principale; più numerose e coprenti quando il cielo è coperto
    const nCloud = Math.round(4 + cloudy * 18);
    for (let i = 0; i < clouds.length && i < nCloud; i++) {
      const c = clouds[i], z = c.zone, w = 360 * c.s * (z.s / 1080), h = 150 * c.s * (z.s / 1080);
      c.x += lay.flowDir * c.v * K.dt * lv('drift');
      if (c.x > z.x + z.w + w) c.x = z.x - w; else if (c.x < z.x - w) c.x = z.x + z.w + w;
      ctx.globalAlpha = (.25 + .5 * cloudy) * (1 - s.night * .6) * lv('clouds');
      ctx.drawImage(cloudSprite.c, c.x - w / 2, c.y - h / 2, w, h);
    }
    ctx.globalAlpha = 1;

    // colline: dalla più lontana (velata dal cielo) alla più vicina
    const bot = s.bot, step = 6;
    for (let i = 0; i < HILLS.length; i++) {
      const h = HILLS[i], off = lay.flowDir * K.t * h.sp * lv('drift');
      const col = mix(mix(s.hill, bot, h.haze), [0, 0, 0], i * .05);   // le più vicine un filo più scure
      ctx.fillStyle = css(col);
      ctx.beginPath(); ctx.moveTo(0, lay.ground);
      for (let x = 0; x <= W + step; x += step) ctx.lineTo(x, ridgeY(i, x - off, lay));
      ctx.lineTo(W, lay.ground); ctx.closePath(); ctx.fill();
      if (i === 2) {                                  // foschia tra le colline
        g = ctx.createLinearGradient(0, lay.rowY + lay.rowH * .6, 0, lay.rowY + lay.rowH * .82);
        g.addColorStop(0, css(bot, 0)); g.addColorStop(1, css(bot, .18));
        ctx.fillStyle = g; ctx.fillRect(0, lay.rowY + lay.rowH * .6, W, lay.rowH * .22);
      }
    }

    // pioggia o neve, leggere
    const kind = Info.wmo(code)[1];
    if (useSky && Info.weather && /rain|drizzle|storm|snow/.test(kind)) {
      const snow = kind === 'snow', n = Math.round(drops.length * (kind === 'drizzle' ? .4 : 1) * lv('precip'));
      ctx.strokeStyle = 'rgba(210,225,245,.28)'; ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const d = drops[i];
        d.y += (snow ? 40 : 520) * d.v * K.dt; d.x += (snow ? Math.sin(K.t + d.ph) * 12 : 40 * lay.flowDir) * K.dt;
        if (d.y > H) { d.y = -10; d.x = Math.random() * W; }
        if (!K.visible(d.x, d.y)) continue;
        if (snow) { ctx.moveTo(d.x + 1.6, d.y); ctx.arc(d.x, d.y, 1.6, 0, 6.283); }
        else { ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - 3 * lay.flowDir, d.y - 14 * d.v); }
      }
      snow ? ctx.fill() : ctx.stroke();
    }

    drawInfo(ctx, K, lay, P);
  }

  /* ---------- pannelli ---------- */
  function widgetColors(P) {
    return {
      text: '#f5f7fb', dim: 'rgba(245,247,251,.72)', accent: P.accent, onAccent: '#14171f',
      panel: 'rgba(10,14,24,.4)', line: 'rgba(255,255,255,.14)', shadow: 'rgba(0,0,0,.45)',
      sun: '#ffd27a', moon: '#e8ecf5', cloud: 'rgba(240,244,250,.95)', cloudDark: 'rgba(176,186,202,.95)', rain: '#8fc3ff', snow: '#ffffff',
    };
  }

  function drawInfo(ctx, K, lay, P) {
    const C = widgetColors(P), panels = K.props.pannelli !== false;
    const col = (...names) => names.filter((n) => (n === 'clock' ? K.props.orologio : panels));
    const box = (z, fx, fy, fw, fh) => ({ x: z.x + z.w * fx, y: z.y + z.h * fy, w: z.w * fw, h: z.h * fh });
    if (lay.mode === 1) {
      Info.stack(ctx, K, box(lay.main, .7, .05, .27, .86), col('clock', 'weather', 'hourly', 'days'), C, 'right');
    } else if (lay.mode === 2) {
      Info.stack(ctx, K, box(lay.left, .07, .07, .3, .86), col('clock', 'weather', 'hourly', 'days'), C);
    } else {
      Info.stack(ctx, K, box(lay.top, .06, .08, .32, .7), col('clock', 'weather'), C);
      Info.stack(ctx, K, box(lay.right, .62, .06, .32, .62), col('hourly', 'days'), C);
    }
  }

  const veil = [{ b: .86, s: .86, c: .96 }, { b: .94, s: .94, c: .99 }, { b: 1, s: 1, c: 1 }];
  Kit.start({
    palettes: PALETTES, veil, build, draw,
    defaults: { citta: 'Milano', pannelli: true, cielo: true },
    onProp(name, val) { if (name === 'citta') Info.setCity(val); },
  });
  Info.setCity(Kit.props.citta);
})();

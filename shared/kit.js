/*
 * kit.js — base comune per tutti gli sfondi del repo.
 *
 * Gestisce:
 *  - proprietà di Lively (livelyPropertyListener) e parametri URL (?palette=1&schermi=2…)
 *  - velocità (lento/medio/dinamico), palette, FPS
 *  - layout multi-schermo: 1, 2 o 3 monitor in modalità "Span" (rilevamento automatico)
 *  - audio di sistema (livelyAudioListener)
 *  - mouse, orologio, canvas con supporto HiDPI
 *
 * Ogni sfondo chiama Kit.start({ palettes, defaults, build, draw }).
 */
(function () {
  'use strict';

  const SPEEDS = [0.45, 1, 1.9];          // lento, medio, dinamico

  const K = (window.Kit = {
    props: { velocita: 1, palette: 0, schermi: 0, fps: 1, orologio: true, mouse: true, audio: true },
    speed: 1,
    screens: 1,
    t: 0,              // tempo scalato dalla velocità (secondi)
    dt: 0,             // delta scalato
    real: 0,           // tempo reale (secondi)
    W: 0, H: 0, dpr: 1,
    pal: null,
    palettes: [],
    mouse: { x: -1e4, y: -1e4, nx: 0, ny: 0, inside: false },
    audio: new Float32Array(128),
    bass: 0, mid: 0, treble: 0, level: 0,
    _audioAt: -1e9,
    _o: null,
  });

  /* ---------- utilità ---------- */
  K.rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
  K.lerp = (a, b, k) => a + (b - a) * k;
  K.clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // generatore pseudo-casuale con seme (scene stabili tra un ridimensionamento e l'altro)
  K.seeded = function (seed) {
    let s = seed >>> 0 || 1;
    return function () {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      return ((s >>> 0) % 1e9) / 1e9;
    };
  };

  // colore esadecimale -> rgba con alfa
  K.rgba = function (hex, a) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };

  /* ---------- multi-schermo ---------- */
  // In modalità "Span" Lively crea un'unica finestra grande quanto il rettangolo che
  // contiene tutti i monitor. Disposizioni supportate (monitor uguali e allineati):
  //
  //   1 schermo     [ PRINCIPALE ]
  //
  //   2 schermi     [ sinistra ][ PRINCIPALE ]
  //
  //   3 schermi     [ sopra      ]  (vuoto)        ← l'angolo in alto a destra non ha monitor
  //                 [ PRINCIPALE ][ destra ]
  //
  // Rilevamento automatico: confronta l'area totale con la dimensione di un monitor.
  function detectScreens() {
    const sw = (window.screen && screen.width) || innerWidth, sh = (window.screen && screen.height) || innerHeight;
    const nx = Math.round(innerWidth / sw), ny = Math.round(innerHeight / sh);
    if (nx >= 2 && ny >= 2) return 3;
    if (nx >= 2) return 2;
    return innerWidth / Math.max(1, innerHeight) > 2.9 ? 2 : 1;
  }

  const zone = (name, x, y, w, h) => ({ name, x, y, w, h, cx: x + w / 2, cy: y + h / 2, s: Math.min(w, h) });

  // Restituisce le zone della disposizione corrente:
  //  main            schermo principale (dove sta l'elemento centrale della scena)
  //  left/right/top  schermi secondari (se presenti)
  //  side            elenco dei secondari · zones = tutte le zone visibili · dead = aree senza monitor
  //  flowDir         direzione orizzontale del flusso verso il principale (+1 → destra, -1 → sinistra)
  //  rowY/rowH/ground  la fila in basso (orizzonte, città, console…)
  let layCache = null, layKey = '';
  K.layout = function () {
    const key = `${K.W}x${K.H}:${K.screens}`;
    if (layCache && layKey === key) return layCache;
    const W = K.W, H = K.H;
    let L;
    if (K.screens === 2) {
      const left = zone('sinistra', 0, 0, W / 2, H), main = zone('principale', W / 2, 0, W / 2, H);
      L = { mode: 2, main, left, side: [left], zones: [left, main], dead: [], flowDir: 1 };
    } else if (K.screens === 3) {
      const w = W / 2, h = H / 2;
      const main = zone('principale', 0, h, w, h), right = zone('destra', w, h, w, h), top = zone('sopra', 0, 0, w, h);
      L = { mode: 3, main, right, top, side: [right, top], zones: [top, main, right], dead: [zone('vuoto', w, 0, w, h)], flowDir: -1 };
    } else {
      L = { mode: 1, main: zone('principale', 0, 0, W, H), side: [], dead: [], flowDir: -1 };
      L.zones = [L.main];
    }
    L.rowY = L.main.y; L.rowH = L.main.h; L.ground = L.main.y + L.main.h;
    layCache = L; layKey = key;
    return L;
  };

  // true se il punto cade su un monitor reale (non nell'angolo vuoto della disposizione a L)
  K.visible = function (x, y) {
    for (const d of K.layout().dead) if (x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h) return false;
    return true;
  };

  // curva di Bézier quadratica: punto e tangente normalizzata
  K.bez = function (p0, c, p1, u) {
    const a = 1 - u;
    return {
      x: a * a * p0.x + 2 * a * u * c.x + u * u * p1.x,
      y: a * a * p0.y + 2 * a * u * c.y + u * u * p1.y,
      tx: 2 * a * (c.x - p0.x) + 2 * u * (p1.x - c.x),
      ty: 2 * a * (c.y - p0.y) + 2 * u * (p1.y - c.y),
    };
  };

  /* ---------- proprietà ---------- */
  function recompute() {
    const p = K.props;
    K.speed = SPEEDS[K.clamp(p.velocita | 0, 0, 2)];
    K.screens = (p.schermi | 0) === 0 ? detectScreens() : K.clamp(p.schermi | 0, 1, 3);
    if (K.palettes.length) K.pal = K.palettes[K.clamp(p.palette | 0, 0, K.palettes.length - 1)];
  }

  function applyURL() {
    const q = new URLSearchParams(location.search);
    for (const [k, v] of q) {
      if (v === 'true' || v === 'false') K.props[k] = v === 'true';
      else if (!isNaN(+v)) K.props[k] = +v;
      else K.props[k] = v;
    }
  }

  let rebuildPending = false;
  function scheduleRebuild() {
    if (rebuildPending) return;
    rebuildPending = true;
    requestAnimationFrame(() => { rebuildPending = false; resize(); });
  }

  // Chiamata da Lively per ogni proprietà all'avvio e a ogni modifica dal pannello.
  window.livelyPropertyListener = function (name, val) {
    K.props[name] = val;
    const before = K.screens, palBefore = K.pal;
    recompute();
    if (K.screens !== before || K.pal !== palBefore) scheduleRebuild();
    if (K._o && K._o.onProp) K._o.onProp(name, val);
  };

  // Chiamata da Lively (sfondi di tipo "webaudio") con 128 valori di spettro.
  window.livelyAudioListener = function (arr) {
    const n = Math.min(128, arr.length);
    for (let i = 0; i < n; i++) K.audio[i] = Math.max(arr[i], K.audio[i] * 0.85);
    K._audioAt = performance.now();
  };

  function updateAudio(dtReal) {
    const on = K.props.audio && performance.now() - K._audioAt < 500;
    const avg = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += K.audio[i]; return s / (b - a); };
    const target = on
      ? { bass: avg(0, 8), mid: avg(8, 40), treble: avg(40, 128) }
      : { bass: 0, mid: 0, treble: 0 };
    const k = 1 - Math.exp(-dtReal * 12);
    K.bass = K.lerp(K.bass, K.clamp(target.bass, 0, 1.5), k);
    K.mid = K.lerp(K.mid, K.clamp(target.mid, 0, 1.5), k);
    K.treble = K.lerp(K.treble, K.clamp(target.treble, 0, 1.5), k);
    K.level = (K.bass + K.mid + K.treble) / 3;
    if (!on) for (let i = 0; i < 128; i++) K.audio[i] *= 0.9;
  }

  /* ---------- orologio ---------- */
  K.clock = function (d = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    return {
      hh: pad(d.getHours()), mm: pad(d.getMinutes()), ss: pad(d.getSeconds()),
      time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
      date: d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }),
      short: d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      d,
    };
  };

  /* ---------- canvas e ciclo ---------- */
  let canvas, ctx;

  function resize() {
    K.dpr = Math.min(window.devicePixelRatio || 1, 2);
    K.W = innerWidth; K.H = innerHeight;
    canvas.width = Math.round(K.W * K.dpr);
    canvas.height = Math.round(K.H * K.dpr);
    ctx.setTransform(K.dpr, 0, 0, K.dpr, 0, 0);
    recompute();
    if (K._o.build) K._o.build(ctx, K);
  }

  // crea un canvas fuori schermo già scalato per HiDPI
  K.offscreen = function (w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * K.dpr));
    c.height = Math.max(1, Math.round(h * K.dpr));
    const x = c.getContext('2d');
    x.setTransform(K.dpr, 0, 0, K.dpr, 0, 0);
    return { c, x, w, h };
  };

  K.start = function (o) {
    K._o = o;
    K.palettes = o.palettes || [];
    Object.assign(K.props, o.defaults || {});
    applyURL();
    recompute();

    document.documentElement.style.cssText = 'margin:0;height:100%;overflow:hidden;background:#000';
    document.body.style.cssText = 'margin:0;height:100%;overflow:hidden;background:#000';
    canvas = document.createElement('canvas');
    canvas.style.cssText = 'display:block;position:fixed;inset:0;width:100vw;height:100vh';
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d', { alpha: false });
    K.canvas = canvas; K.ctx = ctx;

    addEventListener('resize', scheduleRebuild);
    addEventListener('mousemove', (e) => {
      K.mouse.x = e.clientX; K.mouse.y = e.clientY; K.mouse.inside = true;
      K.mouse.nx = (e.clientX / K.W) * 2 - 1; K.mouse.ny = (e.clientY / K.H) * 2 - 1;
    });
    document.addEventListener('mouseleave', () => { K.mouse.inside = false; K.mouse.x = K.mouse.y = -1e4; });

    resize();

    // Limite FPS: 30 o 60. Senza limite requestAnimationFrame va alla frequenza del monitor
    // (144/180 Hz sui monitor da gioco) e lo sfondo lavorerebbe 2-3 volte più del necessario.
    // `next` avanza a passi fissi e assorbe il resto, così a 144 Hz si ottengono davvero ~60 FPS.
    let lastDraw = performance.now(), next = lastDraw;
    function frame(now) {
      requestAnimationFrame(frame);
      const interval = 1000 / ((K.props.fps | 0) === 0 ? 30 : 60);
      if (now < next - 1) return;                       // 1 ms di tolleranza per il jitter di vsync
      if (now - next > interval) next = now;             // dopo una pausa non recupera a raffica
      next += interval;
      K._frameDt = Math.min(0.1, (now - lastDraw) / 1000);
      lastDraw = now;
      const d = K._frameDt;
      K.real += d;
      K.dt = d * K.speed;
      K.t += K.dt;
      updateAudio(d);
      o.draw(ctx, K);
    }
    requestAnimationFrame(frame);
  };
})();

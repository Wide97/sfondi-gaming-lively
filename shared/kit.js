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
  // Rilevamento automatico dalle proporzioni dell'area totale:
  // 16:9 ≈ 1.78 → 1 schermo · 32:9 ≈ 3.56 → 2 schermi · 48:9 ≈ 5.33 → 3 schermi
  function detectScreens() {
    const a = innerWidth / Math.max(1, innerHeight);
    return a > 4.6 ? 3 : a > 2.9 ? 2 : 1;
  }

  // Zone = un rettangolo per ogni monitor. Gli elementi importanti stanno dentro una zona,
  // mai a cavallo di due (dove c'è la cornice fisica dei monitor).
  K.zones = function () {
    const w = K.W / K.screens;
    return Array.from({ length: K.screens }, (_, i) => ({
      i, x: i * w, w, h: K.H, cx: i * w + w / 2, cy: K.H / 2, s: Math.min(w, K.H),
    }));
  };

  // Restituisce la zona "principale" e le zone secondarie per il layout corrente.
  //  1 schermo: [centro]       2 schermi: principale = sinistra, secondaria = destra
  //  3 schermi: principale = centro, secondarie = lati
  K.layout = function () {
    const z = K.zones();
    if (K.screens === 1) return { main: z[0], side: [], info: z[0], all: z };
    if (K.screens === 2) return { main: z[0], side: [z[1]], info: z[1], all: z };
    return { main: z[1], side: [z[0], z[2]], info: z[2], all: z };
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

    let last = performance.now(), acc = 0;
    function frame(now) {
      requestAnimationFrame(frame);
      const dtReal = Math.min(0.1, (now - last) / 1000);
      last = now;
      if ((K.props.fps | 0) === 0) {            // limite a 30 FPS
        acc += dtReal;
        if (acc < 1 / 31) return;
        K._frameDt = acc; acc = 0;
      } else K._frameDt = dtReal;
      const d = Math.min(0.1, K._frameDt);
      K.real += d;
      K.dt = d * K.speed;
      K.t += K.dt;
      updateAudio(d);
      o.draw(ctx, K);
    }
    requestAnimationFrame(frame);
  };
})();

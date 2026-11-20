/* Sistema Solare — i pianeti attraversano gli schermi uno alla volta, davanti alla Via Lattea.
 *
 * I pianeti sono disegnati da uno shader WebGL: sfera illuminata dal Sole, rotazione sull'asse,
 * superfici procedurali (crateri, oceani e nuvole, bande dei giganti gassosi, anelli di Saturno
 * con la divisione di Cassini e l'ombra del pianeta). Senza WebGL si usa un disegno semplificato.
 *
 * Flusso tra gli schermi:
 *  - 2 schermi: i pianeti entrano da sinistra, attraversano la cornice ed escono a destra dal principale
 *  - 3 schermi a L: entrano da destra, passano sul principale e salgono uscendo dallo schermo di sopra
 *  - la Via Lattea è una sola fascia continua su tutti gli schermi, col nucleo sul principale
 */
(function () {
  'use strict';

  // tinta della Via Lattea; i pianeti restano realistici (Mono li rende in bianco e nero)
  const PALETTES = [
    { name: 'Realistica', bg: [2, 3, 8], cool: [.55, .63, .88], warm: [1, .87, .68], emis: [.75, .2, .28], emisK: .5, sat: 1, sun: '#fff1d6' },
    { name: 'Blu profondo', bg: [1, 3, 12], cool: [.4, .58, 1], warm: [.85, .9, 1], emis: [.3, .4, .9], emisK: .4, sat: 1, sun: '#dde8ff' },
    { name: 'Nebulosa', bg: [5, 2, 10], cool: [.62, .5, .95], warm: [1, .78, .8], emis: [.95, .25, .55], emisK: 1, sat: 1, sun: '#ffe0f0' },
    { name: 'Mono', bg: [3, 3, 3], cool: [.75, .75, .75], warm: [1, 1, 1], emis: [.5, .5, .5], emisK: .2, sat: 0, sun: '#ffffff' },
  ];

  const LIVELLI = {
    band:    [.62, .82, 1],     // luminosità della Via Lattea
    stars:   [.7, .85, 1],
    sun:     [.45, .75, 1],     // bagliore del Sole sul bordo
    twinkle: [.25, .55, 1],
    drift:   [.7, .85, 1],      // velocità delle stelle che scorrono
    meteor:  [0, .5, 1],        // frequenza delle stelle cadenti
    label:   [.55, .7, .85],
  };
  const lv = (k) => Kit.pick(LIVELLI[k]);

  // r = raggio (frazione dell'altezza dello schermo, non in scala reale), S = mezzo lato del riquadro
  // in raggi (anelli e alone), rot = rotazione (rad/s), roll/pitch = inclinazione dell'asse
  const PLANETS = [
    { id: 'mercurio', type: 0, name: 'Mercurio', r: .05, S: 1.15, rot: .004, roll: .02, pitch: .1,
      facts: ['0,39 UA dal Sole', 'Ø 4.879 km', 'giorno 59 giorni', 'anno 88 giorni'] },
    { id: 'venere', type: 1, name: 'Venere', r: .08, S: 1.25, rot: -.003, roll: .05, pitch: .1,
      facts: ['0,72 UA dal Sole', 'Ø 12.104 km', 'giorno 243 giorni', 'anno 225 giorni'] },
    { id: 'terra', type: 2, name: 'Terra', r: .085, S: 1.25, rot: .03, roll: .41, pitch: .2, moon: true,
      facts: ['1 UA dal Sole', 'Ø 12.742 km', 'giorno 23 h 56 min', 'anno 365 giorni'] },
    { id: 'marte', type: 3, name: 'Marte', r: .062, S: 1.2, rot: .029, roll: .44, pitch: .2,
      facts: ['1,52 UA dal Sole', 'Ø 6.779 km', 'giorno 24 h 37 min', 'anno 687 giorni'] },
    { id: 'giove', type: 4, name: 'Giove', r: .2, S: 1.2, rot: .07, roll: .05, pitch: .08,
      facts: ['5,2 UA dal Sole', 'Ø 139.820 km', 'giorno 9 h 56 min', 'anno 11,9 anni'] },
    { id: 'saturno', type: 5, name: 'Saturno', r: .15, S: 2.35, rot: .065, roll: .42, pitch: .38,
      facts: ['9,58 UA dal Sole', 'Ø 116.460 km', 'giorno 10 h 33 min', 'anno 29,4 anni'] },
    { id: 'urano', type: 6, name: 'Urano', r: .11, S: 2.1, rot: .04, roll: 1.66, pitch: .35,
      facts: ['19,2 UA dal Sole', 'Ø 50.724 km', 'giorno 17 h 14 min', 'anno 84 anni'] },
    { id: 'nettuno', type: 7, name: 'Nettuno', r: .105, S: 1.25, rot: .045, roll: .49, pitch: .18,
      facts: ['30,1 UA dal Sole', 'Ø 49.244 km', 'giorno 16 h 6 min', 'anno 165 anni'] },
  ];
  const MOON = { type: 8, r: .022, S: 1.05, rot: .01, roll: .1, pitch: .1 };

  /* ---------- shader dei pianeti ---------- */
  const VS = 'attribute vec2 a;varying vec2 v;void main(){v=a*.5+.5;gl_Position=vec4(a,0.,1.);}';
  const FS = `
precision highp float;
varying vec2 v;
uniform int uType;
uniform float uS, uRot, uSeed, uPx, uTime, uSat;
uniform vec3 uL;
uniform mat3 uM, uMi;

float h3(vec3 p){ p = fract(p * .3183099 + .1 + uSeed); p *= 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n3(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p){ float s = 0., a = .5; for (int i = 0; i < 6; i++) { s += a * n3(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= .5; } return s; }
float fbm3(vec3 p){ float s = 0., a = .5; for (int i = 0; i < 3; i++) { s += a * n3(p); p = p * 2.07 + vec3(4.1, 2.3, 7.7); a *= .5; } return s / .875; }

// densità degli anelli di Saturno (raggi del pianeta): C, B, divisione di Cassini, A con la divisione di Encke
float saturnRing(float d){
  float c = smoothstep(1.24, 1.26, d) * (1. - smoothstep(1.52, 1.54, d)) * .28;
  float b = smoothstep(1.52, 1.55, d) * (1. - smoothstep(1.94, 1.95, d)) * (.75 + .2 * sin(d * 60.));
  float a = smoothstep(2.02, 2.04, d) * (1. - smoothstep(2.26, 2.28, d)) * .62;
  a *= 1. - .8 * smoothstep(.012, 0., abs(d - 2.215));
  float fine = .82 + .18 * n3(vec3(d * 90., 0., 0.));
  return (c + b + a) * fine;
}
float uranusRing(float d){
  return (smoothstep(.012, 0., abs(d - 1.62)) + smoothstep(.01, 0., abs(d - 1.75)) + smoothstep(.02, 0., abs(d - 2.0)) * 1.3) * .35;
}

vec3 surface(vec3 q, vec3 n, float ndl, out vec3 atm, out float atmK, out vec3 emit){
  float lat = q.y;
  atm = vec3(0.); atmK = 0.; emit = vec3(0.);
  vec3 c;
  if (uType == 0 || uType == 8) {                                  // Mercurio / Luna: crateri
    float base = fbm(q * 4.);
    float cr = n3(q * 11.), rim = smoothstep(.6, .66, cr) - smoothstep(.66, .74, cr);
    c = vec3(.46, .44, .41) * (.6 + .55 * base) + .1 * rim - .06 * smoothstep(.74, .8, cr);
    if (uType == 8) c = mix(c, vec3(.3, .3, .32), .7 * smoothstep(.52, .6, fbm(q * 1.4 + 3.)));
  } else if (uType == 1) {                                         // Venere: nubi dense
    float s = fbm(vec3(q.x * 2., q.y * 7., q.z * 2.) + vec3(uTime * .01, 0., 0.));
    c = mix(vec3(.84, .72, .5), vec3(.97, .91, .76), s);
    atm = vec3(1., .86, .6); atmK = .7;
  } else if (uType == 2) {                                         // Terra
    float land = smoothstep(.5, .53, fbm(q * 1.55 + 7.3));
    float depth = fbm(q * 3.);
    vec3 ocean = mix(vec3(.01, .06, .2), vec3(.03, .18, .36), depth);
    float dry = smoothstep(.45, .65, fbm(q * 2.2 + 11.)) * (1. - smoothstep(.15, .5, abs(abs(lat) - .35)));
    vec3 ground = mix(vec3(.1, .26, .09), vec3(.58, .47, .3), dry) * (.75 + .4 * fbm(q * 8.));
    c = mix(ocean, ground, land);
    float ice = smoothstep(.78, .84, abs(lat) + (fbm(q * 5.) - .5) * .12);
    c = mix(c, vec3(.92, .95, 1.), ice);
    float cl = smoothstep(.5, .72, fbm(q * 2.6 + vec3(uTime * .004, 0., 0.)));
    c = mix(c, vec3(.96), cl * .88);
    float city = land * (1. - ice) * (1. - cl) * smoothstep(.62, .75, n3(q * 60.)) * smoothstep(.45, .6, fbm(q * 6.));
    emit = vec3(1., .72, .36) * city * smoothstep(-.02, -.22, ndl) * 1.4;
    float spec = pow(max(dot(reflect(-uL, n), vec3(0., 0., 1.)), 0.), 38.) * (1. - land) * (1. - cl);
    emit += vec3(.9, .85, .75) * spec * .55 * max(ndl, 0.);
    atm = vec3(.36, .6, 1.); atmK = .8;
  } else if (uType == 3) {                                         // Marte
    float d = smoothstep(.42, .66, fbm(q * 2.4 + 2.));
    c = mix(vec3(.74, .38, .19), vec3(.42, .2, .11), d) * (.85 + .3 * fbm(q * 9.));
    c = mix(c, vec3(.95, .93, .9), smoothstep(.9, .94, abs(lat) + (fbm(q * 6.) - .5) * .06));
    atm = vec3(.95, .6, .45); atmK = .2;
  } else if (uType == 4) {                                         // Giove: bande e Grande Macchia Rossa
    float t = fbm(q * vec3(2.5, 7., 2.5)) - .5;
    float b1 = sin((lat + t * .07) * 27.), b2 = sin((lat + t * .05) * 11. + 1.3);
    c = mix(vec3(.93, .87, .76), vec3(.76, .58, .42), .5 + .5 * b1);
    c = mix(c, vec3(.58, .4, .28), smoothstep(.3, 1., b2) * .55);
    c *= .9 + .2 * fbm(q * 14.);
    float lon = atan(q.x, q.z), la = asin(clamp(lat, -1., 1.));
    vec2 e = vec2((lon - .9) * .55, (la + .38) * 1.5);
    float spot = smoothstep(.16, .08, length(e));
    c = mix(c, vec3(.8, .4, .26), spot * .85);
    c = mix(c, c * vec3(.85, .88, .95), smoothstep(.75, .95, abs(lat)));
    atm = vec3(.95, .88, .75); atmK = .35;
  } else if (uType == 5) {                                         // Saturno
    float t = fbm(q * vec3(2., 6., 2.)) - .5;
    float b = sin((lat + t * .04) * 21.);
    c = mix(vec3(.9, .82, .62), vec3(.78, .67, .47), .5 + .5 * b);
    c = mix(c, vec3(.7, .72, .74), smoothstep(.8, .97, lat) * .6);
    atm = vec3(.95, .88, .7); atmK = .3;
  } else if (uType == 6) {                                         // Urano
    float b = sin(lat * 14. + (fbm(q * 3.) - .5) * .5);
    c = mix(vec3(.6, .84, .88), vec3(.66, .9, .93), .5 + .5 * b);
    atm = vec3(.6, .9, 1.); atmK = .7;
  } else {                                                         // Nettuno
    float t = fbm(q * vec3(2., 6., 2.) + vec3(uTime * .006, 0., 0.)) - .5;
    float b = sin((lat + t * .06) * 16.);
    c = mix(vec3(.17, .3, .78), vec3(.25, .42, .9), .5 + .5 * b);
    float lon = atan(q.x, q.z), la = asin(clamp(lat, -1., 1.));
    c = mix(c, vec3(.08, .14, .45), smoothstep(.14, .07, length(vec2((lon + .6) * .6, (la + .3) * 1.4))) * .8);
    c = mix(c, vec3(.9, .95, 1.), smoothstep(.72, .82, fbm(q * vec3(3., 14., 3.) + 5.)) * smoothstep(.0, .3, abs(lat)) * .7);
    atm = vec3(.4, .6, 1.); atmK = .75;
  }
  return c;
}

void main(){
  vec2 p = (v * 2. - 1.) * uS;
  float r = length(p);
  vec3 rn = uM * vec3(0., 1., 0.);                                  // normale del piano degli anelli
  bool ringed = uType == 5 || uType == 6;

  // anelli
  vec4 ring = vec4(0.); float ringZ = -1e3;
  if (ringed && abs(rn.z) > .001) {
    float z = -(rn.x * p.x + rn.y * p.y) / rn.z;
    vec3 P = vec3(p, z); float d = length(P);
    float dens = uType == 5 ? saturnRing(d) : uranusRing(d);
    if (dens > 0.) {
      float tl = dot(P, uL); vec3 perp = P - tl * uL;
      float shadow = (tl < 0. && dot(perp, perp) < 1.) ? .08 : 1.;
      vec3 rc = uType == 5 ? mix(vec3(.88, .8, .64), vec3(.62, .57, .5), smoothstep(1.3, 2.25, d)) : vec3(.5, .55, .58);
      float lit = (.35 + .65 * abs(dot(rn, uL))) * shadow;
      ring = vec4(rc * lit, clamp(dens, 0., 1.));
      ringZ = z;
    }
  }

  // sfera
  vec4 sph = vec4(0.); float sz = -1e3; vec3 atmC = vec3(0.); float atmK = 0.;
  if (r < 1.) {
    vec3 n = vec3(p, sqrt(1. - r * r)); sz = n.z;
    vec3 b = uMi * n;                                               // dal punto di vista al corpo del pianeta
    float cr = cos(uRot), sr = sin(uRot);
    vec3 q = vec3(cr * b.x - sr * b.z, b.y, sr * b.x + cr * b.z);
    float ndl = dot(n, uL);
    vec3 emit;
    vec3 alb = surface(q, n, ndl, atmC, atmK, emit);
    float light = smoothstep(-.06, .35, ndl) * (.55 + .45 * max(ndl, 0.));
    if (uType == 5) {                                               // ombra degli anelli sul pianeta
      float den = dot(rn, uL);
      if (abs(den) > .001) { float t = -dot(rn, n) / den; if (t > 0.) light *= 1. - .65 * saturnRing(length(n + t * uL)); }
    }
    vec3 col = alb * (light + .012) + emit;
    float rim = pow(1. - n.z, 2.4);
    col += atmC * atmK * rim * clamp(ndl + .35, 0., 1.) * .9;
    float edge = smoothstep(1., 1. - uPx * 1.5, r);
    sph = vec4(col, edge);
  }

  // alone dell'atmosfera fuori dal bordo
  vec4 halo = vec4(0.);
  if (r >= 1. - uPx * 2. && atmK > -1.) {
    float hw = .07;
    float k = smoothstep(1. + hw, 1., r) * smoothstep(1. - uPx * 2., 1. + uPx, r);
    vec3 hc = vec3(.36, .6, 1.); float hk = 0.;
    if (uType == 1) { hc = vec3(1., .86, .6); hk = .5; }
    else if (uType == 2) { hk = .75; }
    else if (uType == 3) { hc = vec3(.95, .6, .45); hk = .15; }
    else if (uType == 4 || uType == 5) { hc = vec3(.95, .88, .72); hk = .2; }
    else if (uType == 6) { hc = vec3(.6, .9, 1.); hk = .5; }
    else if (uType == 7) { hc = vec3(.4, .6, 1.); hk = .55; }
    float facing = clamp(dot(normalize(vec3(p, 0.)), uL) + .45, 0., 1.);
    halo = vec4(hc, k * k * hk * facing);
  }

  // composizione (colori premoltiplicati): anelli davanti o dietro la sfera
  vec4 outc = vec4(halo.rgb * halo.a, halo.a);
  if (ring.a > 0. && ringZ < sz && sph.a > 0.) { /* anello dietro al pianeta */
    outc = vec4(ring.rgb * ring.a, ring.a) * (1. - sph.a) + outc * (1. - ring.a * (1. - sph.a));
  }
  outc = vec4(sph.rgb * sph.a, sph.a) + outc * (1. - sph.a);
  if (ring.a > 0. && (ringZ >= sz || sph.a == 0.)) outc = vec4(ring.rgb * ring.a, ring.a) + outc * (1. - ring.a);
  float g = dot(outc.rgb, vec3(.299, .587, .114));
  outc.rgb = mix(vec3(g), outc.rgb, uSat);
  gl_FragColor = outc;
}`;

  let gl = null, glc = null, prog = null, U = {};
  function initGL() {
    glc = document.createElement('canvas');
    glc.width = glc.height = 16;
    gl = glc.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false, preserveDrawingBuffer: true });
    if (!gl) return false;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    } catch (e) { console.error(e); gl = null; return false; }
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    for (const n of ['uType', 'uS', 'uRot', 'uSeed', 'uPx', 'uTime', 'uSat', 'uL', 'uM', 'uMi']) U[n] = gl.getUniformLocation(prog, n);
    gl.clearColor(0, 0, 0, 0);
    return true;
  }

  // matrice corpo → vista: rotazione dell'asse (roll attorno a z, poi pitch attorno a x)
  function axis(roll, pitch) {
    const cr = Math.cos(roll), sr = Math.sin(roll), cp = Math.cos(pitch), sp = Math.sin(pitch);
    // M = Rx(pitch) * Rz(roll), righe
    const m = [
      [cr, -sr, 0],
      [cp * sr, cp * cr, -sp],
      [sp * sr, sp * cr, cp],
    ];
    const colMajor = (a) => new Float32Array([a[0][0], a[1][0], a[2][0], a[0][1], a[1][1], a[2][1], a[0][2], a[1][2], a[2][2]]);
    const t = m[0].map((_, i) => m.map((row) => row[i]));
    return { M: colMajor(m), Mi: colMajor(t) };
  }

  /* ---------- stato ---------- */
  let G, bg, twinkles = [], drifters = [], active = [], nextIdx = 0, meteor = null, nextMeteor = 20;
  // stelle che scorrono piano su 3 piani di profondità (px/s a 1080p, velocità Medio)
  const DRIFT = [1.2, 2.8, 5.5];

  const ROW = () => Kit.layout().rowH;

  // percorso dei pianeti per ogni disposizione, campionato per lunghezza d'arco
  function buildPath(K) {
    const lay = K.layout(), W = K.W, H = K.H, m = lay.main;
    // p0 = entrata, p1 = uscita (fuori dagli schermi), mid = punto da attraversare a metà strada
    let p0, mid, p1;
    if (lay.mode === 3) {
      const h = lay.rowH;
      p0 = { x: W + h * .55, y: m.cy }; mid = { x: m.cx, y: m.cy - h * .04 }; p1 = { x: lay.top.cx, y: -h * .55 };
    } else if (lay.mode === 2) {
      p0 = { x: -H * .55, y: H * .62 }; mid = { x: W * .5, y: H * .42 }; p1 = { x: W + H * .55, y: H * .52 };
    } else {
      p0 = { x: -H * .55, y: H * .6 }; mid = { x: W * .5, y: H * .45 }; p1 = { x: W + H * .55, y: H * .46 };
    }
    // punto di controllo della curva di Bézier che passa da `mid` a metà percorso
    const c = { x: 2 * mid.x - (p0.x + p1.x) / 2, y: 2 * mid.y - (p0.y + p1.y) / 2 };
    const N = 600, pts = [{ x: p0.x, y: p0.y, s: 0 }];
    for (let i = 1; i <= N; i++) {
      const b = K.bez(p0, c, p1, i / N), q = pts[i - 1];
      pts.push({ x: b.x, y: b.y, s: q.s + Math.hypot(b.x - q.x, b.y - q.y) });
    }
    return { pts, len: pts[N].s };
  }
  function at(path, s) {
    const pts = path.pts;
    let lo = 0, hi = pts.length - 1;
    if (s <= 0) return pts[0];
    if (s >= path.len) return pts[hi];
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pts[mid].s < s) lo = mid; else hi = mid; }
    const a = pts[lo], b = pts[hi], k = (s - a.s) / (b.s - a.s || 1);
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
  }

  // posizione del Sole (fuori schermo): a sinistra con 1-2 schermi, a destra con 3 a L
  function sunPos(K) {
    const lay = K.layout();
    return lay.mode === 3 ? { x: K.W + lay.rowH * .5, y: lay.rowY + lay.rowH * .5 } : { x: -lay.rowH * .5, y: lay.rowY + lay.rowH * .45 };
  }

  /* ---------- Via Lattea ---------- */
  function noise2(seed) {
    const r = Kit.seeded(seed), perm = new Uint8Array(512), val = new Float32Array(256);
    for (let i = 0; i < 256; i++) { perm[i] = i; val[i] = r(); }
    for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; [perm[i], perm[j]] = [perm[j], perm[i]]; }
    for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
    const n = (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), X = xi & 255, Y = yi & 255;
      const a = val[perm[perm[X] + Y]], b = val[perm[perm[X + 1] + Y]], c = val[perm[perm[X] + Y + 1]], d = val[perm[perm[X + 1] + Y + 1]];
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
    return (x, y, oct = 5) => { let s = 0, a = .5, t = 0; for (let i = 0; i < oct; i++) { s += a * n(x, y); t += a; x = x * 2.03 + 5.1; y = y * 2.03 + 1.7; a *= .5; } return s / t; };
  }

  function bandAxis(K) {
    const lay = K.layout(), W = K.W, H = K.H;
    let a, b;
    if (lay.mode === 3) { a = { x: W, y: H * .97 }; b = { x: W * .08, y: 0 }; }
    else if (lay.mode === 2) { a = { x: 0, y: H * .88 }; b = { x: W, y: H * .1 }; }
    else { a = { x: W * .05, y: H * .95 }; b = { x: W * .95, y: H * .05 }; }
    const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy);
    const d = { x: dx / L, y: dy / L }, nrm = { x: -d.y, y: d.x };
    // nucleo galattico: proiezione del centro dello schermo principale sull'asse
    const m = lay.main, t = (m.cx - a.x) * d.x + (m.cy - a.y) * d.y;
    const core = { x: a.x + d.x * t, y: a.y + d.y * t };
    return { a, d, nrm, core, width: Math.hypot(W, H) * .085 };
  }

  function buildBackground(K) {
    const P = K.pal, W = K.W, H = K.H, ax = bandAxis(K), fbm = noise2(31), rnd = K.seeded(2024);
    bg = K.offscreen(W, H);
    const c = bg.x;
    c.fillStyle = `rgb(${P.bg.join(',')})`; c.fillRect(0, 0, W, H);

    const perp = (x, y) => (x - ax.a.x) * ax.nrm.x + (y - ax.a.y) * ax.nrm.y;
    const prof = (x, y) => Math.exp(-Math.pow(perp(x, y) / ax.width, 2));
    const coreR = Math.min(W, H) * .32;
    const bulge = (x, y) => Math.exp(-((x - ax.core.x) ** 2 + (y - ax.core.y) ** 2) / (coreR * coreR));

    // nebulosità della fascia a un quarto di risoluzione
    const sc = .25, w = Math.ceil(W * sc), h = Math.ceil(H * sc), f = 1 / (ROW() * .35);
    const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h;
    const tc = tmp.getContext('2d'), id = tc.createImageData(w, h), d = id.data;
    const kB = lv('band');
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const X = x / sc, Y = y / sc, o = (y * w + x) * 4;
      if (!K.visible(X, Y)) { d[o + 3] = 0; continue; }
      const warp = (fbm(X * f * .5, Y * f * .5, 3) - .5) * ax.width * 1.1;
      const pp = (perp(X, Y) + warp) / ax.width;
      const pr = Math.exp(-pp * pp), core = bulge(X, Y);
      const dens = pr * (.45 + .75 * fbm(X * f * 1.6, Y * f * 1.6, 5)) + core * .9;
      const dustBand = Math.exp(-Math.pow(pp / .38, 2));
      const dust = Math.min(1, Math.max(0, (fbm(X * f * 2.4 + 9, Y * f * 2.4 + 3, 5) - .44) / .2)) * dustBand;
      const em = Math.max(0, (fbm(X * f * 3 + 21, Y * f * 3 + 8, 4) - .66) / .12) * pr * P.emisK;
      const k = Math.min(1, pr * .55 + core * .8);
      let r = P.cool[0] + (P.warm[0] - P.cool[0]) * k, g = P.cool[1] + (P.warm[1] - P.cool[1]) * k, b = P.cool[2] + (P.warm[2] - P.cool[2]) * k;
      const lum = dens * (1 - .82 * dust) * .34 * kB;
      r = r * lum + P.emis[0] * em * .12 * kB; g = g * lum + P.emis[1] * em * .12 * kB; b = b * lum + P.emis[2] * em * .12 * kB;
      d[o] = Math.min(255, r * 255); d[o + 1] = Math.min(255, g * 255); d[o + 2] = Math.min(255, b * 255); d[o + 3] = 255;
    }
    tc.putImageData(id, 0, 0);
    c.globalCompositeOperation = 'lighter';
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.drawImage(tmp, 0, 0, w, h, 0, 0, W, H);

    // stelle: più fitte nella fascia, con colori da stelle vere (blu, bianche, gialle, arancio)
    const cols = [[170, 191, 255], [202, 215, 255], [255, 250, 245], [255, 244, 222], [255, 222, 180], [255, 190, 140]];
    const kS = lv('stars'), n = Math.round(W * H / 160);
    twinkles = [];
    for (let i = 0; i < n; i++) {
      const x = rnd() * W, y = rnd() * H;
      if (!K.visible(x, y)) continue;
      const pr = prof(x, y), keep = .22 + 1.5 * pr + bulge(x, y);
      if (rnd() * 2.6 > keep) continue;
      const m = rnd(), size = m < .97 ? .5 + rnd() * .8 : 1.2 + rnd() * 1.3;
      const [R, Gc, B] = cols[(rnd() * cols.length) | 0];
      const a = (.25 + rnd() * .75) * kS;
      c.fillStyle = `rgba(${R},${Gc},${B},${a})`;
      c.fillRect(x, y, size, size);
      if (size > 1.6) {
        const g = c.createRadialGradient(x, y, 0, x, y, size * 4);
        g.addColorStop(0, `rgba(${R},${Gc},${B},${a * .35})`); g.addColorStop(1, `rgba(${R},${Gc},${B},0)`);
        c.fillStyle = g; c.fillRect(x - size * 4, y - size * 4, size * 8, size * 8);
        if (twinkles.length < 260) twinkles.push({ x, y, s: size, col: `${R},${Gc},${B}`, ph: rnd() * 6.28, f: .4 + rnd() * 1.2 });
      }
    }

    // stelle in primo piano che si muovono (densità uniforme, sopra la fascia che resta ferma)
    drifters = [];
    const nd = Math.round(W * H / 2300);
    for (let i = 0; i < nd; i++) {
      const k = i % 7 === 0 ? 2 : i % 3 === 0 ? 1 : 0;                  // pochi vicini, molti lontani
      const [R, Gc, B] = cols[(rnd() * cols.length) | 0];
      const s = [.6, .9, 1.4][k] + rnd() * .5, a = ([.35, .55, .8][k] + rnd() * .2) * kS;
      drifters.push({ x: rnd() * W, y: rnd() * H, s, k, col: `rgba(${R},${Gc},${B},${Math.min(1, a)})` });
    }

    // bagliore del Sole che sta appena fuori dal bordo
    const sp = sunPos(K), sr = ROW() * 1.1, kSun = lv('sun');
    const g = c.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, sr);
    g.addColorStop(0, K.rgba(P.sun, .5 * kSun)); g.addColorStop(.25, K.rgba(P.sun, .16 * kSun)); g.addColorStop(1, K.rgba(P.sun, 0));
    c.fillStyle = g; c.fillRect(sp.x - sr, sp.y - sr, sr * 2, sr * 2);
    c.globalCompositeOperation = 'source-over';
  }

  /* ---------- pianeti ---------- */
  function spawn(K, s0 = 0) {
    const def = PLANETS[nextIdx % PLANETS.length];
    nextIdx++;
    const R = def.r * ROW();
    active.push({ def, R, s: s0, rot: Math.random() * 6.28, seed: (nextIdx * .1731) % 1, ax: axis(def.roll, def.pitch), alpha: 0,
      moon: def.moon ? { ax: axis(MOON.roll, MOON.pitch), rot: 0, a: Math.random() * 6.28 } : null });
  }
  // distanza da lasciare tra un pianeta e il successivo
  const gapAfter = (a, bDef) => a.R * a.def.S + bDef.r * ROW() * bDef.S + ROW() * .55;

  function build(ctx, K) {
    if (!gl && !glc) initGL();
    G = { path: buildPath(K), fixed: !!K.props.galleria };
    buildBackground(K);
    if (G.fixed) {
      // ?galleria=1: tutti i pianeti fermi in fila (per anteprime e controlli)
      active = PLANETS.map((def, i) => ({ def, R: def.r * ROW(), s: 0, rot: 1 + i, seed: (i * .1731) % 1, ax: axis(def.roll, def.pitch), alpha: 1,
        px: K.W * (.06 + i * .125), py: K.H * .5, moon: def.moon ? { ax: axis(MOON.roll, MOON.pitch), rot: 0, a: .6 } : null }));
      return;
    }
    // all'avvio ci sono già alcuni pianeti in viaggio, in fila
    active = []; nextIdx = Math.floor(Math.random() * PLANETS.length);
    let s = G.path.len * .72;
    for (let i = 0; i < 6 && s > 0; i++) {
      spawn(K, s);
      const last = active[active.length - 1], nd = PLANETS[nextIdx % PLANETS.length];
      s -= gapAfter(last, nd);
    }
    active.reverse();                                     // il primo dell'elenco è il più indietro
  }

  // luce dal Sole: viene dal suo lato ma anche un po' da davanti, così un pianeta appena entrato
  // non mostra solo il lato in ombra (sembrerebbe un disco nero)
  function lightDir(K, x, y) {
    const sp = sunPos(K), lay = K.layout();
    const sx = sp.x + (lay.mode === 3 ? 1 : -1) * lay.rowH * 1.6;      // il Sole vero è più lontano del bagliore
    const dx = sx - x, dy = -(sp.y - y), L = Math.hypot(dx, dy) || 1;
    const v = [dx / L * .78, dy / L * .78, .62];
    const n = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / n, v[1] / n, v[2] / n];
  }

  function renderBody(ctx, K, type, R, S, x, y, rot, ax, seed) {
    const P = K.pal, size = Math.ceil(2 * S * R * K.dpr);
    const L = lightDir(K, x, y);
    if (gl) {
      if (glc.width < size || glc.height < size) { glc.width = glc.height = Math.min(4096, Math.max(size, glc.width)); }
      gl.viewport(0, 0, size, size);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1i(U.uType, type); gl.uniform1f(U.uS, S); gl.uniform1f(U.uRot, rot); gl.uniform1f(U.uSeed, seed);
      gl.uniform1f(U.uPx, 1 / (R * K.dpr)); gl.uniform1f(U.uTime, K.t); gl.uniform1f(U.uSat, P.sat);
      gl.uniform3f(U.uL, L[0], L[1], L[2]);
      gl.uniformMatrix3fv(U.uM, false, ax.M); gl.uniformMatrix3fv(U.uMi, false, ax.Mi);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      ctx.drawImage(glc, 0, glc.height - size, size, size, x - S * R, y - S * R, 2 * S * R, 2 * S * R);
    } else {
      // disegno semplificato senza WebGL
      const base = ['#8a8580', '#e6d3a8', '#3c6fb0', '#c1603a', '#d8b48a', '#e3cf9a', '#a6dde4', '#4166d4', '#9a9893'][type];
      const g = ctx.createRadialGradient(x + L[0] * R * .5, y - L[1] * R * .5, R * .1, x, y, R);
      g.addColorStop(0, base); g.addColorStop(.7, base); g.addColorStop(1, '#000');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R, 0, 6.283); ctx.fill();
      if (type === 5) { ctx.strokeStyle = 'rgba(220,200,160,.6)'; ctx.lineWidth = R * .25; ctx.beginPath(); ctx.ellipse(x, y, R * 1.9, R * .55, -.42, 0, 6.283); ctx.stroke(); }
    }
  }

  function drawLabel(ctx, K, p, x, y) {
    const a = p.alpha * lv('label');
    if (a < .02) return;
    const R = p.R, u = ROW() / 1080;
    // a destra del pianeta, oltre gli anelli e oltre l'orbita della Luna
    const lx = x + (p.def.S > 2 ? R * 1.6 : p.moon ? R * 2.7 : R * 1.15) + 24 * u, ly = y + R * .55;
    ctx.globalAlpha = a;
    ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + R * .75, y + R * .4); ctx.lineTo(lx - 8 * u, ly - 10 * u); ctx.lineTo(lx + 150 * u, ly - 10 * u); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.font = `300 ${22 * u}px "Segoe UI Light", "Segoe UI", Arial, sans-serif`;
    ctx.fillText(p.def.name.toUpperCase().split('').join(' '), lx, ly - 18 * u);
    ctx.font = `400 ${13 * u}px "Segoe UI", Arial, sans-serif`; ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.fillText(p.def.facts.slice(0, 2).join('  ·  '), lx, ly + 8 * u);
    ctx.fillText(p.def.facts.slice(2).join('  ·  '), lx, ly + 27 * u);
    ctx.globalAlpha = 1;
  }

  function drawClock(ctx, K) {
    const lay = K.layout(), z = lay.mode === 2 ? lay.left : lay.mode === 3 ? lay.top : lay.main;
    const u = z.h / 1080, ck = K.clock(), x = z.x + z.w * .05, y = z.y + z.h * .12;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(255,255,255,.88)';
    ctx.font = `200 ${92 * u}px "Segoe UI Light", "Segoe UI", Arial, sans-serif`;
    ctx.fillText(ck.time, x, y);
    ctx.font = `400 ${22 * u}px "Segoe UI", Arial, sans-serif`; ctx.fillStyle = 'rgba(255,255,255,.65)';
    ctx.fillText(ck.date.charAt(0).toUpperCase() + ck.date.slice(1), x + 4 * u, y + 36 * u);
  }

  function draw(ctx, K) {
    const W = K.W, H = K.H;
    ctx.drawImage(bg.c, 0, 0, W, H);

    // stelle che scorrono piano nella direzione dei pianeti (più veloci quelle più vicine)
    const dir = K.layout().mode === 3 ? -1 : 1, dk = lv('drift') * ROW() / 1080 * K.dt;
    for (const s of drifters) {
      s.x += dir * DRIFT[s.k] * dk;
      if (s.x > W + 2) s.x -= W + 4; else if (s.x < -2) s.x += W + 4;
      ctx.fillStyle = s.col;
      ctx.fillRect(s.x, s.y, s.s, s.s);
    }

    // poche stelle brillanti che scintillano piano
    const kt = lv('twinkle');
    for (const s of twinkles) {
      const a = (.5 + .5 * Math.sin(K.real * s.f + s.ph)) * .35 * kt;
      ctx.fillStyle = `rgba(${s.col},${a})`;
      ctx.fillRect(s.x - s.s * .5, s.y - s.s * .5, s.s * 2, s.s * 2);
    }

    // stella cadente rara
    const km = lv('meteor');
    if (km > 0) {
      nextMeteor -= K._frameDt;
      if (!meteor && nextMeteor <= 0) {
        const z = K.layout().zones[(Math.random() * K.layout().zones.length) | 0];
        meteor = { x: z.x + z.w * (.2 + Math.random() * .7), y: z.y + z.h * (.05 + Math.random() * .3), vx: -(350 + Math.random() * 250), vy: 160 + Math.random() * 120, t: 0 };
        nextMeteor = (25 + Math.random() * 35) / km;
      }
      if (meteor) {
        meteor.t += K._frameDt; meteor.x += meteor.vx * K._frameDt; meteor.y += meteor.vy * K._frameDt;
        const a = Math.sin(Math.min(1, meteor.t / 1.1) * Math.PI) * .8;
        const g = ctx.createLinearGradient(meteor.x, meteor.y, meteor.x - meteor.vx * .2, meteor.y - meteor.vy * .2);
        g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = g; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(meteor.x, meteor.y); ctx.lineTo(meteor.x - meteor.vx * .2, meteor.y - meteor.vy * .2); ctx.stroke();
        if (meteor.t > 1.1) meteor = null;
      }
    }

    // pianeti in viaggio
    if (!G.fixed) {
      const speed = ROW() * .028;
      for (const p of active) p.s += speed * K.dt;
      while (active.length && active[active.length - 1].s > G.path.len) active.pop();
      const first = active[0], nd = PLANETS[nextIdx % PLANETS.length];
      if (!first || first.s >= gapAfter(first, nd)) { spawn(K, 0); active.unshift(active.pop()); }
    }

    // i più piccoli (più lontani) prima, così i grandi passano davanti
    const order = active.slice().sort((a, b) => a.R - b.R);
    for (const p of order) {
      const q = G.fixed ? { x: p.px, y: p.py } : at(G.path, p.s);
      p.rot += p.def.rot * K.dt;
      const vis = K.visible(q.x, q.y) && q.x > p.R && q.x < W - p.R && q.y > p.R && q.y < H - p.R;
      p.alpha += ((vis ? 1 : 0) - p.alpha) * Math.min(1, K._frameDt * 1.5);
      if (p.moon) {
        p.moon.a += K.dt * .12; p.moon.rot += MOON.rot * K.dt;
        const mx = q.x + Math.cos(p.moon.a) * p.R * 2.4, my = q.y + Math.sin(p.moon.a) * p.R * .45;
        const behind = Math.sin(p.moon.a) < 0, mr = MOON.r * ROW();
        if (behind) renderBody(ctx, K, 8, mr, MOON.S, mx, my, p.moon.rot, p.moon.ax, .37);
        renderBody(ctx, K, p.def.type, p.R, p.def.S, q.x, q.y, p.rot, p.ax, p.seed);
        if (!behind) renderBody(ctx, K, 8, mr, MOON.S, mx, my, p.moon.rot, p.moon.ax, .37);
      } else renderBody(ctx, K, p.def.type, p.R, p.def.S, q.x, q.y, p.rot, p.ax, p.seed);
      if (K.props.nomi) drawLabel(ctx, K, p, q.x, q.y);
    }

    if (K.props.orologio) drawClock(ctx, K);
  }

  const veil = [{ b: .9, s: .92, c: .98 }, { b: .96, s: .97, c: 1 }, { b: 1, s: 1, c: 1 }];
  Kit.start({ palettes: PALETTES, veil, defaults: { nomi: true }, build, draw });
})();

// Genera shared/cielo.js: stelle vere (fino a magnitudine 4,8), le 88 costellazioni con le loro
// linee e nomi italiani, e la stella più luminosa con nome proprio di ogni costellazione.
//
//   node scripts/cielo.mjs
//
// Dati da d3-celestial di Olaf Frohn (licenza BSD 3-Clause, ricavati da cataloghi pubblici:
// Hipparcos/HYG per le stelle, Stellarium per le figure delle costellazioni).
// Il file generato va nel repo: lo sfondo non scarica niente.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://raw.githubusercontent.com/ofrohn/d3-celestial/master/';
const MAG = 4.8;

const get = async (f) => {
  const r = await fetch(BASE + f);
  if (!r.ok) throw new Error(`${f}: HTTP ${r.status}`);
  return f.endsWith('.json') ? r.json() : r.text();
};

const [lines, cons, stars, names, license] = await Promise.all([
  get('data/constellations.lines.json'), get('data/constellations.json'),
  get('data/stars.6.json'), get('data/starnames.json'), get('LICENSE'),
]);

const ra = (lon) => +(((lon % 360) + 360) % 360).toFixed(2);   // d3-celestial usa -180..180
const de = (lat) => +lat.toFixed(2);
const clean = (s) => String(s || '').replace(/[ -‏ ]/g, ' ').trim();

// stelle: [ra, dec, mag, b-v] appiattite
const flat = [];
let nStars = 0;
for (const f of stars.features) {
  const m = f.properties.mag;
  if (m > MAG) continue;
  const [lon, lat] = f.geometry.coordinates;
  flat.push(ra(lon), de(lat), +m.toFixed(2), +(parseFloat(f.properties.bv) || 0).toFixed(2));
  nStars++;
}

// stella più luminosa con un nome proprio, per costellazione
const brightest = {};
for (const f of stars.features) {
  const n = names[String(f.id)];
  if (!n || !n.c || !(n.it || n.name)) continue;
  const b = brightest[n.c];
  if (!b || f.properties.mag < b.m) brightest[n.c] = { n: clean(n.it || n.name), m: +f.properties.mag.toFixed(2) };
}

const lineById = Object.fromEntries(lines.features.map((f) => [f.id, f.geometry.coordinates]));
const out = cons.features.map((f) => {
  const p = f.properties, id = f.id;
  const segs = (lineById[id] || []).map((seg) => seg.flatMap(([lon, lat]) => [ra(lon), de(lat)]));
  const [lon, lat] = f.geometry.coordinates;
  return { id, n: clean(p.it || p.name), c: [ra(lon), de(lat)], r: +p.rank || 3, l: segs, b: brightest[id] || null };
}).filter((c) => c.l.length);

const header = `/*
 * cielo.js — il cielo vero per gli sfondi: ${nStars} stelle fino a magnitudine ${MAG},
 * ${out.length} costellazioni con linee, nomi italiani e stella più luminosa.
 * GENERATO da scripts/cielo.mjs: non modificare a mano.
 *
 * Dati da d3-celestial (https://github.com/ofrohn/d3-celestial), con la sua licenza:
 *
${license.trim().split('\n').map((l) => ' * ' + l).join('\n').replace(/ +$/gm, '')}
 */
`;

const helpers = `
  const D = Math.PI / 180;
  const C = window.Cielo = { stars: STARS, cons: CONS };

  // tempo siderale locale (gradi) per una data e una longitudine (gradi, est positivo)
  C.lst = function (date, lon) {
    const d = date.getTime() / 864e5 - 10957.5;               // giorni dal J2000 (1/1/2000 12:00 UT)
    return (((280.46061837 + 360.98564736629 * d + lon) % 360) + 360) % 360;
  };

  // proiezione stereografica centrata in (ra0, dec0), nord in alto ed est a sinistra
  // (come guardando il cielo). Restituisce una funzione (ra, dec) → {x, y, ok} in unità di "scala".
  C.projector = function (ra0, dec0) {
    const s0 = Math.sin(dec0 * D), c0 = Math.cos(dec0 * D);
    return function (ra, dec) {
      const h = (ra - ra0) * D, sd = Math.sin(dec * D), cd = Math.cos(dec * D), ch = Math.cos(h);
      const cosc = s0 * sd + c0 * cd * ch;
      const k = 2 / (1 + cosc);
      return { x: -k * cd * Math.sin(h), y: k * (c0 * sd - s0 * cd * ch), ok: cosc > -.3 };
    };
  };

  // colore approssimato di una stella dall'indice B-V
  C.color = function (bv) {
    const t = Math.max(-.4, Math.min(2, bv));
    const stops = [[-.4, [155, 176, 255]], [0, [202, 216, 255]], [.4, [248, 247, 255]], [.8, [255, 236, 210]], [1.2, [255, 210, 160]], [2, [255, 170, 110]]];
    for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) {
      const [a0, c0] = stops[i - 1], [a1, c1] = stops[i], k = (t - a0) / (a1 - a0);
      return c0.map((v, j) => Math.round(v + (c1[j] - v) * k));
    }
    return stops[stops.length - 1][1];
  };
`;

// tutto dentro una funzione: nello scope globale finisce solo window.Cielo
const wrapped = header + "(function () {\n  'use strict';\n" +
  `  const STARS = ${JSON.stringify(flat)};\n  const CONS = ${JSON.stringify(out)};\n` + helpers + '})();\n';
fs.writeFileSync(path.join(ROOT, 'shared', 'cielo.js'), wrapped);
console.log(`shared/cielo.js: ${nStars} stelle, ${out.length} costellazioni, ${(wrapped.length / 1024).toFixed(0)} KB`);

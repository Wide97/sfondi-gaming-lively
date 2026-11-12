/*
 * info.js — informazioni utili per gli sfondi "soft" (Orizzonte, Bruma).
 *
 *  - Meteo da Open-Meteo (gratis, senza chiave): proprietà "citta", aggiornamento ogni 30 minuti,
 *    ultima risposta salvata in localStorage per partire subito anche offline.
 *  - Calendario: mese corrente, settimana ISO, festività nazionali italiane (Pasqua compresa).
 *  - Sistema: CPU, GPU, RAM e rete da Lively (livelySystemInformation, serve "--system-information").
 *  - Brano in riproduzione da Lively (livelyCurrentTrack, serve "--system-nowplaying").
 *  - Widget pronti da disegnare: Info.stack(ctx, K, area, ['clock', 'weather', ...], P).
 *
 * Con ?demo=1 usa dati finti e un'ora fissa (anteprime e demo della galleria).
 * Richiede kit.js caricato prima.
 */
(function () {
  'use strict';

  const q = new URLSearchParams(location.search);
  const I = (window.Info = {
    demo: q.get('demo') === '1',
    weather: null,          // { place, at, current, hourly[], daily[] }
    weatherState: 'idle',   // idle (nessuna città) · loading · ok · error
    sys: null,              // { cpu, gpu, ramUsed, ramTotal, down, up, cpuName, gpuName, at }
    hist: { cpu: [], gpu: [], ram: [] },
    track: null,            // { title, artist, album, img }
  });

  // ora "vera" o, in demo, un pomeriggio fisso (così le anteprime sono sempre uguali)
  I.now = () => {
    if (!I.demo) return new Date();
    const d = new Date(); d.setHours(16, 42, 0, 0); return d;
  };

  /* ================= meteo ================= */

  const CACHE = 'info-meteo-v1';
  const REFRESH = 30 * 60e3;
  let city = null, debounce = 0, refreshAt = 0;

  const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE) || 'null'); } catch (e) { return null; } };
  const writeCache = (v) => { try { localStorage.setItem(CACHE, JSON.stringify(v)); } catch (e) { /* storage non disponibile */ } };

  async function getJSON(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  // la textbox di Lively chiama il listener a ogni tasto: aspetto che l'utente smetta di scrivere
  I.setCity = function (name) {
    name = String(name == null ? '' : name).trim();
    if (name === city) return;
    city = name;
    clearTimeout(debounce);
    debounce = setTimeout(loadWeather, I.weather ? 1200 : 50);
  };

  async function loadWeather() {
    if (I.demo) { I.weather = demoWeather(); I.weatherState = 'ok'; return; }
    const want = city;
    if (!want) { I.weather = null; I.weatherState = 'idle'; return; }
    const cached = readCache();
    if (cached && cached.city === want && cached.w) {
      I.weather = cached.w; I.weatherState = 'ok';
      if (Date.now() - cached.w.at < REFRESH) { refreshAt = cached.w.at + REFRESH; return; }
    } else if (!I.weather || I.weather.query !== want) { I.weather = null; I.weatherState = 'loading'; }
    try {
      const g = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(want)}&count=1&language=it&format=json`);
      const p = g.results && g.results[0];
      if (!p) throw new Error('Città non trovata');
      const f = await getJSON('https://api.open-meteo.com/v1/forecast?latitude=' + p.latitude + '&longitude=' + p.longitude +
        '&current=temperature_2m,apparent_temperature,weather_code,is_day,relative_humidity_2m,wind_speed_10m' +
        '&hourly=temperature_2m,weather_code,precipitation_probability,is_day' +
        '&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max' +
        '&timezone=auto&forecast_days=4');
      if (want !== city) return;                       // nel frattempo la città è cambiata
      I.weather = parseWeather(f, p.name, want); I.weatherState = 'ok'; I.weatherError = null;
      writeCache({ city: want, w: I.weather });
    } catch (e) {
      if (want !== city) return;
      I.weatherError = e.message || 'errore';
      if (!I.weather) I.weatherState = 'error';
    }
    refreshAt = Date.now() + (I.weatherState === 'error' ? 5 * 60e3 : REFRESH);
  }
  setInterval(() => { if (city && Date.now() > refreshAt) loadWeather(); }, 60e3);

  function parseWeather(f, place, query) {
    const c = f.current, h = f.hourly, d = f.daily, key = c.time.slice(0, 13);
    let i0 = h.time.findIndex((t) => t.slice(0, 13) === key);
    if (i0 < 0) i0 = 0;
    const hourly = [];
    for (let i = i0 + 1; i < h.time.length && hourly.length < 6; i += 2)
      hourly.push({ hour: h.time[i].slice(11, 16), t: h.temperature_2m[i], code: h.weather_code[i], pp: h.precipitation_probability[i], day: !!h.is_day[i] });
    const daily = d.time.map((t, i) => ({
      date: t, code: d.weather_code[i], max: d.temperature_2m_max[i], min: d.temperature_2m_min[i],
      pp: d.precipitation_probability_max[i], sunrise: d.sunrise[i].slice(11, 16), sunset: d.sunset[i].slice(11, 16),
    }));
    return {
      place, query, at: Date.now(), daily, hourly,
      current: { t: c.temperature_2m, feels: c.apparent_temperature, code: c.weather_code, day: !!c.is_day, hum: c.relative_humidity_2m, wind: c.wind_speed_10m },
    };
  }

  function demoWeather() {
    const d = I.now(), iso = (k) => { const x = new Date(d); x.setDate(x.getDate() + k); return x.toISOString().slice(0, 10); };
    const codes = [2, 61, 3, 0];
    return {
      place: 'Milano', query: 'Milano', at: Date.now(),
      current: { t: 12.4, feels: 11, code: 2, day: true, hum: 71, wind: 9 },
      hourly: [[18, 11, 2, 10], [20, 9, 3, 20], [22, 8, 61, 55], [0, 7, 61, 60], [2, 7, 3, 30], [4, 6, 45, 10]]
        .map(([hh, t, code, pp]) => ({ hour: String(hh).padStart(2, '0') + ':00', t, code, pp, day: hh > 7 && hh < 17 })),
      daily: codes.map((code, i) => ({ date: iso(i), code, max: [14, 12, 11, 15][i], min: [7, 8, 5, 4][i], pp: [20, 70, 35, 5][i], sunrise: '07:12', sunset: '16:51' })),
    };
  }

  // codici WMO → descrizione e tipo di icona
  const WMO = {
    0: ['Sereno', 'clear'], 1: ['Poco nuvoloso', 'partly'], 2: ['Parzialmente nuvoloso', 'partly'], 3: ['Coperto', 'cloudy'],
    45: ['Nebbia', 'fog'], 48: ['Nebbia con brina', 'fog'],
    51: ['Pioggerella debole', 'drizzle'], 53: ['Pioggerella', 'drizzle'], 55: ['Pioggerella fitta', 'drizzle'],
    56: ['Pioggerella gelata', 'drizzle'], 57: ['Pioggerella gelata', 'drizzle'],
    61: ['Pioggia debole', 'rain'], 63: ['Pioggia', 'rain'], 65: ['Pioggia forte', 'rain'],
    66: ['Pioggia gelata', 'rain'], 67: ['Pioggia gelata forte', 'rain'],
    71: ['Neve debole', 'snow'], 73: ['Neve', 'snow'], 75: ['Neve forte', 'snow'], 77: ['Nevischio', 'snow'],
    80: ['Rovesci deboli', 'rain'], 81: ['Rovesci', 'rain'], 82: ['Rovesci forti', 'rain'],
    85: ['Rovesci di neve', 'snow'], 86: ['Rovesci di neve forti', 'snow'],
    95: ['Temporale', 'storm'], 96: ['Temporale con grandine', 'storm'], 99: ['Temporale con grandine', 'storm'],
  };
  I.wmo = (code) => WMO[code] || ['—', 'cloudy'];
  // 0 sereno … 1 cielo tutto coperto (per nuvole e luce degli sfondi)
  I.cloudiness = (code) => ({ clear: 0, partly: .4, cloudy: .85, fog: .9, drizzle: .8, rain: .9, snow: .85, storm: 1 })[I.wmo(code)[1]];

  /* ================= calendario ================= */

  // domenica di Pasqua (algoritmo di Meeus/Jones/Butcher, calendario gregoriano)
  I.easter = function (y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const n = h + l - 7 * m + 114;
    return new Date(y, Math.floor(n / 31) - 1, (n % 31) + 1);
  };

  const holCache = {};
  // festività nazionali italiane: chiave "mese-giorno" (mese da 1) → nome
  I.holidays = function (y) {
    if (holCache[y]) return holCache[y];
    const map = new Map([
      ['1-1', 'Capodanno'], ['1-6', 'Epifania'], ['4-25', 'Festa della Liberazione'], ['5-1', 'Festa del Lavoro'],
      ['6-2', 'Festa della Repubblica'], ['8-15', 'Ferragosto'], ['11-1', 'Ognissanti'], ['12-8', 'Immacolata'],
      ['12-25', 'Natale'], ['12-26', 'Santo Stefano'],
    ]);
    if (y >= 2026) map.set('10-4', 'San Francesco');   // di nuovo festa nazionale dal 2026
    const e = I.easter(y), em = new Date(y, e.getMonth(), e.getDate() + 1);
    map.set(`${e.getMonth() + 1}-${e.getDate()}`, 'Pasqua');
    map.set(`${em.getMonth() + 1}-${em.getDate()}`, "Lunedì dell'Angelo");
    return (holCache[y] = map);
  };
  I.holiday = (d) => I.holidays(d.getFullYear()).get(`${d.getMonth() + 1}-${d.getDate()}`) || null;

  I.nextHoliday = function (from) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    for (let i = 1; i <= 400; i++) {
      d.setDate(d.getDate() + 1);
      const n = I.holiday(d);
      if (n) return { name: n, days: i, date: new Date(d) };
    }
    return null;
  };

  I.isoWeek = function (date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d - y0) / 864e5 + 1) / 7);
  };

  /* ================= sistema e musica (da Lively) ================= */

  // Lively manda una stringa JSON, circa una volta al secondo
  window.livelySystemInformation = function (data) {
    let o;
    try { o = typeof data === 'string' ? JSON.parse(data) : data; } catch (e) { return; }
    if (!o) return;
    const total = +o.TotalRam || 0, avail = +o.CurrentRamAvail || 0;
    I.sys = {
      cpu: +o.CurrentCpu || 0, gpu: +o.CurrentGpu3D || 0, ramTotal: total, ramUsed: Math.max(0, total - avail),
      down: +o.CurrentNetDown || 0, up: +o.CurrentNetUp || 0, cpuName: o.NameCpu || '', gpuName: o.NameGpu || '', at: Date.now(),
    };
    pushHist(I.sys);
  };

  function pushHist(s) {
    const add = (k, v) => { const h = I.hist[k]; h.push(Kit.clamp(v, 0, 100)); if (h.length > 60) h.shift(); };
    add('cpu', s.cpu); add('gpu', s.gpu); add('ram', s.ramTotal ? s.ramUsed / s.ramTotal * 100 : 0);
  }

  // null quando non suona niente
  window.livelyCurrentTrack = function (data) {
    let o = null;
    try { o = typeof data === 'string' ? JSON.parse(data) : data; } catch (e) { o = null; }
    if (!o || !o.Title) { I.track = null; return; }
    const t = { title: o.Title, artist: o.Artist || o.AlbumArtist || '', album: o.AlbumTitle || '', img: null };
    if (o.Thumbnail) {
      const im = new Image();
      im.onload = () => { if (I.track === t) t.img = im; };
      im.src = 'data:image/png;base64,' + o.Thumbnail;   // Chromium riconosce il formato reale dai byte
    }
    I.track = t;
  };

  if (I.demo) {
    let k = 0;
    setInterval(() => {
      k++;
      window.livelySystemInformation(JSON.stringify({
        CurrentCpu: 14 + 9 * Math.sin(k * .4) + 4 * Math.sin(k * 1.7), CurrentGpu3D: 22 + 15 * Math.sin(k * .23),
        TotalRam: 32768, CurrentRamAvail: 17800 + 400 * Math.sin(k * .1), CurrentNetDown: 2.4e6 + 1e6 * Math.sin(k), CurrentNetUp: 1.8e5,
        NameCpu: 'AMD Ryzen 7 5800X3D', NameGpu: 'NVIDIA GeForce RTX 5070',
      }));
    }, 1000);
    for (let i = 0; i < 60; i++) pushHist({ cpu: 14 + 9 * Math.sin(i * .4) + 4 * Math.sin(i * 1.7), gpu: 22 + 15 * Math.sin(i * .23), ramUsed: 15000, ramTotal: 32768 });
    I.sys = { cpu: 17, gpu: 25, ramTotal: 32768, ramUsed: 14900, down: 2.4e6, up: 1.8e5, cpuName: 'AMD Ryzen 7 5800X3D', gpuName: 'NVIDIA GeForce RTX 5070', at: Date.now() };
    I.track = { title: 'Notturno in sol minore', artist: 'Quartetto Immaginario', album: 'Demo', img: null };
  }

  /* ================= formattazione ================= */

  I.temp = (t) => (t == null || isNaN(t) ? '—' : `${Math.round(t)}°`);
  I.rate = (bps) => {
    const u = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    let v = bps, i = 0;
    while (v >= 1000 && i < u.length - 1) { v /= 1024; i++; }
    return `${v < 10 && i ? v.toFixed(1) : Math.round(v)} ${u[i]}`;
  };
  const DAYS = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  I.dayName = (d) => DAYS[d.getDay()];
  I.monthName = (m) => MONTHS[m];
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  function ellipsis(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    let s = text;
    while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    return s + '…';
  }

  /* ================= icone meteo (disegnate, nessuna immagine) ================= */

  // kind: clear · partly · cloudy · fog · drizzle · rain · snow · storm
  I.icon = function (ctx, kind, cx, cy, s, day, P) {
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const sun = (x, y, r) => {
      ctx.fillStyle = P.sun; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
      ctx.strokeStyle = P.sun; ctx.lineWidth = r * .22;
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * 6.283;
        ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r * 1.45, y + Math.sin(a) * r * 1.45);
        ctx.lineTo(x + Math.cos(a) * r * 1.85, y + Math.sin(a) * r * 1.85); ctx.stroke();
      }
    };
    const moon = (x, y, r) => {
      ctx.fillStyle = P.moon;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.arc(x + r * .55, y - r * .35, r * .85, 0, 6.283, true); ctx.fill('evenodd');
    };
    const cloud = (x, y, w, col) => {
      // un solo percorso con più archi: l'unione delle forme, senza sovrapposizioni visibili
      ctx.fillStyle = col; ctx.beginPath();
      ctx.arc(x - w * .28, y + w * .05, w * .22, 0, 6.283);
      ctx.arc(x, y - w * .1, w * .3, 0, 6.283);
      ctx.arc(x + w * .3, y + w * .06, w * .2, 0, 6.283);
      ctx.rect(x - w * .28, y + w * .05, w * .58, w * .21);
      ctx.fill('nonzero');
    };
    const sky = day ? sun : moon;
    if (kind === 'clear') sky(cx, cy, s * .26);
    else if (kind === 'partly') { sky(cx - s * .16, cy - s * .14, s * .2); cloud(cx + s * .06, cy + s * .08, s * .75, P.cloud); }
    else if (kind === 'fog') {
      cloud(cx, cy - s * .1, s * .75, P.cloud);
      ctx.strokeStyle = P.cloud; ctx.lineWidth = s * .06;
      for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.moveTo(cx - s * .32 + i * s * .1, cy + s * .26 + i * s * .12); ctx.lineTo(cx + s * .3, cy + s * .26 + i * s * .12); ctx.stroke(); }
    } else {
      cloud(cx, cy - s * .08, s * .8, kind === 'cloudy' ? P.cloud : P.cloudDark);
      ctx.strokeStyle = P.rain; ctx.fillStyle = P.snow; ctx.lineWidth = s * .055;
      if (kind === 'rain' || kind === 'drizzle') {
        const n = kind === 'rain' ? 3 : 2;
        for (let i = 0; i < n; i++) {
          const x = cx - s * .18 + i * s * .36 / Math.max(1, n - 1);
          ctx.beginPath(); ctx.moveTo(x, cy + s * .24); ctx.lineTo(x - s * .06, cy + s * .4); ctx.stroke();
        }
      } else if (kind === 'snow') {
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(cx - s * .18 + i * s * .18, cy + s * .32 + (i % 2) * s * .06, s * .045, 0, 6.283); ctx.fill(); }
      } else if (kind === 'storm') {
        ctx.fillStyle = P.sun; ctx.beginPath();
        ctx.moveTo(cx + s * .02, cy + s * .14); ctx.lineTo(cx - s * .1, cy + s * .34); ctx.lineTo(cx, cy + s * .34);
        ctx.lineTo(cx - s * .06, cy + s * .48); ctx.lineTo(cx + s * .12, cy + s * .26); ctx.lineTo(cx + s * .02, cy + s * .26);
        ctx.closePath(); ctx.fill();
      }
    }
    ctx.restore();
  };

  /* ================= widget ================= */
  // Ogni widget è progettato su una colonna larga 400 unità e scala con u = larghezza / 400.
  // P (colori): text, dim, accent, panel, line, sun, moon, cloud, cloudDark, rain, snow.
  // h(…) = altezza in unità; draw(…) disegna e può restituire false se non ha niente da mostrare.

  const FONT = '"Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif';
  const font = (ctx, weight, px) => { ctx.font = `${weight} ${px}px ${FONT}`; };

  function panel(ctx, x, y, w, h, u, P) {
    const r = 18 * u;
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    ctx.fillStyle = P.panel; ctx.fill();
    ctx.strokeStyle = P.line; ctx.lineWidth = Math.max(1, u); ctx.stroke();
  }

  const W = {};

  W.clock = {
    h: () => 150,
    draw(ctx, K, x, y, w, u, P) {
      const d = I.now(), ck = K.clock(d);
      ctx.save();
      // l'orologio non ha pannello: un'ombra morbida lo tiene leggibile anche su un cielo chiaro
      if (P.shadow) { ctx.shadowColor = P.shadow; ctx.shadowBlur = 14 * u; }
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = P.text;
      font(ctx, 200, 104 * u); ctx.fillText(ck.time, x, y + 100 * u);
      font(ctx, 400, 22 * u); ctx.fillStyle = P.dim;
      ctx.fillText(cap(ck.date), x + 4 * u, y + 138 * u);
      ctx.restore();
    },
  };

  W.weather = {
    h: () => 176,
    draw(ctx, K, x, y, w, u, P) {
      if (I.weatherState === 'idle') return false;
      panel(ctx, x, y, w, 176 * u, u, P);
      const pad = 22 * u;
      ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
      if (!I.weather) {
        font(ctx, 400, 18 * u); ctx.fillStyle = P.dim;
        ctx.fillText(I.weatherState === 'error' ? `Meteo non disponibile (${I.weatherError || 'offline'})` : 'Carico il meteo…', x + pad, y + 50 * u);
        font(ctx, 400, 14 * u);
        if (I.weatherState === 'error') ctx.fillText('Controlla il nome della città in Personalizza.', x + pad, y + 78 * u);
        return true;
      }
      const c = I.weather.current, [desc, kind] = I.wmo(c.code);
      I.icon(ctx, kind, x + pad + 44 * u, y + 66 * u, 92 * u, c.day, P);
      font(ctx, 300, 60 * u); ctx.fillStyle = P.text;
      ctx.fillText(I.temp(c.t), x + pad + 106 * u, y + 84 * u);
      font(ctx, 400, 18 * u); ctx.fillStyle = P.text;
      ctx.fillText(ellipsis(ctx, desc, w - pad * 2 - 110 * u), x + pad + 110 * u, y + 112 * u);
      font(ctx, 400, 14 * u); ctx.fillStyle = P.dim;
      ctx.fillText(`Percepita ${I.temp(c.feels)} · Umidità ${Math.round(c.hum)}% · Vento ${Math.round(c.wind)} km/h`, x + pad, y + 146 * u);
      const at = new Date(I.weather.at), stale = Date.now() - I.weather.at > 2 * 3600e3;
      ctx.textAlign = 'right';
      ctx.fillText(ellipsis(ctx, I.weather.place, w * .45), x + w - pad, y + 34 * u);
      if (stale) ctx.fillText(`agg. ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`, x + w - pad, y + 54 * u);
      return true;
    },
  };

  W.hourly = {
    h: () => 132,
    draw(ctx, K, x, y, w, u, P) {
      if (!I.weather) return false;
      panel(ctx, x, y, w, 132 * u, u, P);
      const list = I.weather.hourly, cw = (w - 24 * u) / list.length;
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      list.forEach((hh, i) => {
        const cx = x + 12 * u + cw * (i + .5);
        font(ctx, 400, 13 * u); ctx.fillStyle = P.dim; ctx.fillText(hh.hour, cx, y + 28 * u);
        I.icon(ctx, I.wmo(hh.code)[1], cx, y + 58 * u, 40 * u, hh.day, P);
        font(ctx, 500, 17 * u); ctx.fillStyle = P.text; ctx.fillText(I.temp(hh.t), cx, y + 98 * u);
        font(ctx, 400, 12 * u); ctx.fillStyle = hh.pp >= 40 ? P.accent : P.dim;
        ctx.fillText(hh.pp != null ? `${hh.pp}%` : '', cx, y + 118 * u);
      });
      return true;
    },
  };

  W.days = {
    h: () => 196,
    draw(ctx, K, x, y, w, u, P) {
      if (!I.weather) return false;
      panel(ctx, x, y, w, 196 * u, u, P);
      const pad = 22 * u, list = I.weather.daily.slice(0, 4);
      ctx.textBaseline = 'middle';
      list.forEach((d, i) => {
        const ry = y + 30 * u + i * 34 * u, dt = new Date(d.date + 'T12:00:00');
        font(ctx, 400, 16 * u); ctx.fillStyle = P.text; ctx.textAlign = 'left';
        ctx.fillText(i === 0 ? 'Oggi' : i === 1 ? 'Domani' : cap(I.dayName(dt)), x + pad, ry);
        I.icon(ctx, I.wmo(d.code)[1], x + w * .5, ry, 30 * u, true, P);
        ctx.textAlign = 'right';
        font(ctx, 400, 13 * u); ctx.fillStyle = d.pp >= 40 ? P.accent : P.dim;
        ctx.fillText(d.pp != null ? `${d.pp}%` : '', x + w * .7, ry);
        font(ctx, 500, 16 * u); ctx.fillStyle = P.text; ctx.fillText(I.temp(d.max), x + w - pad - 44 * u, ry);
        ctx.fillStyle = P.dim; ctx.fillText(I.temp(d.min), x + w - pad, ry);
      });
      const t = list[0];
      font(ctx, 400, 14 * u); ctx.fillStyle = P.dim; ctx.textAlign = 'left';
      ctx.fillText(`Alba ${t.sunrise}  ·  Tramonto ${t.sunset}`, x + pad, y + 174 * u);
      return true;
    },
  };

  W.calendar = {
    h: () => 330,
    draw(ctx, K, x, y, w, u, P) {
      panel(ctx, x, y, w, 330 * u, u, P);
      const now = I.now(), Y = now.getFullYear(), M = now.getMonth(), pad = 22 * u;
      ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
      font(ctx, 500, 20 * u); ctx.fillStyle = P.text;
      ctx.fillText(`${cap(I.monthName(M))} ${Y}`, x + pad, y + 38 * u);
      ctx.textAlign = 'right'; font(ctx, 400, 14 * u); ctx.fillStyle = P.dim;
      ctx.fillText(`settimana ${I.isoWeek(now)}`, x + w - pad, y + 38 * u);
      const cw = (w - pad * 2) / 7, gy = y + 70 * u, rh = 34 * u;
      ctx.textAlign = 'center';
      'LMMGVSD'.split('').forEach((l, i) => { ctx.fillStyle = i === 6 ? P.accent : P.dim; ctx.fillText(l, x + pad + cw * (i + .5), gy); });
      const first = (new Date(Y, M, 1).getDay() + 6) % 7, days = new Date(Y, M + 1, 0).getDate();
      font(ctx, 400, 15 * u);
      for (let d = 1; d <= days; d++) {
        const k = first + d - 1, col = k % 7, row = Math.floor(k / 7);
        const cx = x + pad + cw * (col + .5), cy = gy + 30 * u + row * rh;
        const date = new Date(Y, M, d), hol = I.holiday(date), today = d === now.getDate();
        if (today) { ctx.fillStyle = P.accent; ctx.beginPath(); ctx.arc(cx, cy - 5 * u, 14 * u, 0, 6.283); ctx.fill(); }
        ctx.fillStyle = today ? P.onAccent : hol || col === 6 ? P.accent : P.text;
        ctx.fillText(String(d), cx, cy);
        if (hol && !today) { ctx.beginPath(); ctx.arc(cx, cy + 7 * u, 2 * u, 0, 6.283); ctx.fill(); }
      }
      const todayHol = I.holiday(now), nx = I.nextHoliday(now);
      font(ctx, 400, 14 * u); ctx.textAlign = 'left'; ctx.fillStyle = P.dim;
      const line = todayHol ? `Oggi: ${todayHol}` : nx ? `Prossima festa: ${nx.name}, tra ${nx.days} ${nx.days === 1 ? 'giorno' : 'giorni'}` : '';
      ctx.fillText(ellipsis(ctx, line, w - pad * 2), x + pad, y + 312 * u);
      return true;
    },
  };

  function spark(ctx, data, x, y, w, h, col) {
    if (data.length < 2) return;
    ctx.beginPath();
    data.forEach((v, i) => { const px = x + w * i / 59, py = y + h - h * v / 100; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
    ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke();
  }

  W.system = {
    h: () => 214,
    draw(ctx, K, x, y, w, u, P) {
      const s = I.sys, live = sysLive();
      if (!live) return false;                         // fuori da Lively (o con l'opzione spenta) non c'è niente da mostrare
      panel(ctx, x, y, w, 214 * u, u, P);
      const pad = 22 * u;
      const rows = [
        ['CPU', s.cpu, I.hist.cpu, `${Math.round(s.cpu)}%`],
        ['GPU', s.gpu, I.hist.gpu, `${Math.round(s.gpu)}%`],
        ['RAM', s.ramTotal ? s.ramUsed / s.ramTotal * 100 : 0, I.hist.ram, `${(s.ramUsed / 1024).toFixed(1)} / ${Math.round(s.ramTotal / 1024)} GB`],
      ];
      ctx.textBaseline = 'middle';
      rows.forEach(([name, v, hist, label], i) => {
        const ry = y + 34 * u + i * 46 * u, bx = x + pad + 54 * u, bw = w - pad * 2 - 54 * u;
        font(ctx, 500, 14 * u); ctx.textAlign = 'left'; ctx.fillStyle = P.dim; ctx.fillText(name, x + pad, ry);
        ctx.textAlign = 'right'; ctx.fillStyle = P.text; ctx.fillText(label, x + w - pad, ry);
        spark(ctx, hist, bx, ry - 12 * u, bw * .55, 24 * u, P.accent);
        ctx.fillStyle = P.line; ctx.fillRect(bx, ry + 16 * u, bw, 3 * u);
        ctx.fillStyle = P.accent; ctx.fillRect(bx, ry + 16 * u, bw * Kit.clamp(v, 0, 100) / 100, 3 * u);
      });
      font(ctx, 400, 14 * u); ctx.textAlign = 'left'; ctx.fillStyle = P.dim;
      ctx.fillText(`Rete  ↓ ${I.rate(s.down)}   ↑ ${I.rate(s.up)}`, x + pad, y + 190 * u);
      return true;
    },
  };

  W.track = {
    h: () => 104,
    draw(ctx, K, x, y, w, u, P) {
      const t = I.track;
      if (!t) return false;
      panel(ctx, x, y, w, 104 * u, u, P);
      const pad = 20 * u, s = 64 * u, ix = x + pad, iy = y + 20 * u;
      if (t.img) ctx.drawImage(t.img, ix, iy, s, s);
      else {
        ctx.fillStyle = P.line; ctx.fillRect(ix, iy, s, s);
        ctx.fillStyle = P.dim; font(ctx, 400, 30 * u); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('♪', ix + s / 2, iy + s / 2);
      }
      // barre che si muovono piano (con la musica, se lo sfondo riceve l'audio)
      const tx = ix + s + 16 * u, tw = x + w - pad - tx;
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      font(ctx, 500, 17 * u); ctx.fillStyle = P.text; ctx.fillText(ellipsis(ctx, t.title, tw), tx, iy + 24 * u);
      font(ctx, 400, 14 * u); ctx.fillStyle = P.dim; ctx.fillText(ellipsis(ctx, t.artist || t.album, tw), tx, iy + 46 * u);
      ctx.fillStyle = P.accent;
      for (let i = 0; i < 4; i++) {
        const lv = .25 + .5 * Math.abs(Math.sin(K.real * (1.1 + i * .37) + i)) * (.4 + Math.min(1, K.level * 2));
        ctx.fillRect(tx + i * 7 * u, iy + 64 * u - 14 * u * lv, 4 * u, 14 * u * lv);
      }
      return true;
    },
  };

  I.widgets = W;

  // dati di sistema recenti (in demo sempre validi: le anteprime a 4K possono durare più di 10 s)
  function sysLive() { return !!(I.sys && (I.demo || Date.now() - I.sys.at < 10e3)); }

  // Disegna una colonna di widget dentro area {x, y, w, h}; align: 'left' | 'center' | 'right'.
  // I widget senza dati (es. musica ferma) non occupano spazio. Restituisce l'altezza usata.
  I.stack = function (ctx, K, area, names, P, align = 'left') {
    const gap = 18;
    const list = names.filter((n) => W[n] && I.has(n));
    if (!list.length) return 0;
    const total = list.reduce((s, n) => s + W[n].h(), 0) + gap * (list.length - 1);
    const u = Math.min(area.w / 400, area.h / total);
    const w = 400 * u, x = align === 'right' ? area.x + area.w - w : align === 'center' ? area.x + (area.w - w) / 2 : area.x;
    let y = area.y;
    for (const n of list) { W[n].draw(ctx, K, x, y, w, u, P); y += (W[n].h() + gap) * u; }
    return y - area.y;
  };

  // un widget ha qualcosa da mostrare? (serve per non lasciare buchi nella colonna)
  I.has = function (n) {
    if (n === 'weather') return I.weatherState !== 'idle';
    if (n === 'hourly' || n === 'days') return !!I.weather;
    if (n === 'system') return sysLive();
    if (n === 'track') return !!I.track;
    return true;
  };

  if (I.demo) loadWeather();
})();

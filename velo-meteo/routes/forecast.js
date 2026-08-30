/**
 * Prévisions réelles via Open-Meteo (gratuit, sans clé).
 *
 * Une seule requête couvre tous les points du trajet : Open-Meteo accepte des
 * listes de coordonnées et renvoie un tableau de lieux. On lit la pluie dans le
 * pas de 15 minutes (`minutely_15`), et la probabilité dans le pas horaire —
 * elle n'existe pas en 15 minutes.
 *
 * Le résultat est mis en cache 5 minutes : l'écran d'accueil fait trois appels
 * (route, météo, vent) qui doivent taper une seule fois sur l'API.
 */
'use strict';

const store = require('./store');
const geo   = require('./geo');

const API = 'https://api.open-meteo.com/v1/forecast';
const TIMEOUT_MS = 15000;
const CACHE_MS = 5 * 60 * 1000;

const cache = new Map(); // clé -> { at, data }

/* ---------- utilitaires temps ---------- */

const pad = n => String(n).padStart(2, '0');

/** "YYYY-MM-DDTHH:MM" à partir d'une Date lue en UTC (donc déjà décalée). */
function isoLocal(d, roundMin) {
  const m = roundMin ? Math.floor(d.getUTCMinutes() / roundMin) * roundMin : d.getUTCMinutes();
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) +
         'T' + pad(d.getUTCHours()) + ':' + pad(m);
}

/**
 * Prochaine occurrence du départ, dans le fuseau du lieu.
 * On reste sur aujourd'hui tant que l'heure de départ n'est pas dépassée de
 * plus de 2 h — au-delà, c'est le trajet de demain qui intéresse.
 */
function nextDeparture(hhmm, utcOffsetSec) {
  const parts = String(hhmm || '08:00').split(':');
  const localNow = new Date(Date.now() + utcOffsetSec * 1000);
  const dep = new Date(Date.UTC(
    localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate(),
    parseInt(parts[0], 10) || 0, parseInt(parts[1], 10) || 0
  ));
  if (dep.getTime() < localNow.getTime() - 2 * 3600 * 1000) dep.setUTCDate(dep.getUTCDate() + 1);
  return dep;
}

function angleDiff(a, b) {
  return Math.abs(((a - b + 540) % 360) - 180);
}

function dirLabel(deg) {
  const rose = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
  return rose[Math.round(((deg % 360) / 22.5)) % 16];
}

/* ---------- appel Open-Meteo ---------- */

async function fetchForecast(points) {
  const qs = new URLSearchParams({
    latitude: points.map(p => p.lat).join(','),
    longitude: points.map(p => p.lon).join(','),
    minutely_15: 'precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m,apparent_temperature',
    hourly: 'precipitation_probability',
    timezone: 'auto',
    forecast_days: '2',
    wind_speed_unit: 'kmh'
  });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(API + '?' + qs.toString(), { signal: ctrl.signal });
    if (!res.ok) throw new Error('Open-Meteo HTTP ' + res.status);
    const json = await res.json();
    const locs = Array.isArray(json) ? json : [json];
    if (locs.length !== points.length) throw new Error('Open-Meteo : ' + locs.length + ' lieux pour ' + points.length + ' points');
    return locs;
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- assemblage ---------- */

async function compute(type) {
  const trip = store.getTrip();
  if (!store.isConfigured(trip)) return null;

  const route = trip.routes[type];
  const hhmm  = type === 'evening' ? trip.evening_time : trip.morning_time;
  const locs  = await fetchForecast(route.points);

  const offset = locs[0].utc_offset_seconds || 0;
  const dep    = nextDeparture(hhmm, offset);

  const points = route.points.map((p, i) => {
    const loc = locs[i];
    const at  = new Date(dep.getTime() + p.offset_min * 60000);

    const q  = loc.minutely_15 || {};
    const qi = (q.time || []).indexOf(isoLocal(at, 15));
    const h  = loc.hourly || {};
    const hi = (h.time || []).indexOf(isoLocal(at, 60).slice(0, 13) + ':00');

    // precipitation est un cumul sur 15 min : ×4 pour une intensité en mm/h.
    const rate = qi >= 0 ? +((q.precipitation[qi] || 0) * 4).toFixed(2) : 0;

    return {
      i: p.i,
      time: pad(at.getUTCHours()) + ':' + pad(at.getUTCMinutes()),
      label: p.label,
      km: p.km,
      rate: rate,
      prob: hi >= 0 ? Math.round(h.precipitation_probability[hi] || 0) : 0,
      temp: qi >= 0 ? Math.round(q.apparent_temperature[qi]) : null,
      wind_kmh: qi >= 0 ? Math.round(q.wind_speed_10m[qi] || 0) : 0,
      gust_kmh: qi >= 0 ? Math.round(q.wind_gusts_10m[qi] || 0) : 0,
      wind_dir: qi >= 0 ? Math.round(q.wind_direction_10m[qi] || 0) : 0,
      bearing: p.bearing,
      found: qi >= 0
    };
  });

  if (!points.some(p => p.found)) {
    throw new Error('Aucun créneau de prévision pour ' + isoLocal(dep, 15) + ' (départ trop lointain ?)');
  }

  // Cumul réel : chaque point représente une tranche du trajet.
  const sliceH = (route.duration_min / Math.max(1, points.length - 1)) / 60;
  points.forEach(p => { p.mm = +(p.rate * sliceH).toFixed(2); });

  const total_mm  = +points.reduce((s, p) => s + p.mm, 0).toFixed(1);
  const max_prob  = Math.max.apply(null, points.map(p => p.prob));
  const peak      = points.reduce((a, b) => (b.rate > a.rate ? b : a), points[0]);
  const temps     = points.map(p => p.temp).filter(t => t !== null);

  // Vent : moyenne sur le trajet, orientation jugée sur le cap de chaque segment.
  const mean = arr => arr.reduce((s, v) => s + v, 0) / (arr.length || 1);
  const speed = Math.round(mean(points.map(p => p.wind_kmh)));
  const gust  = Math.round(Math.max.apply(null, points.map(p => p.gust_kmh)));
  const from  = Math.round(mean(points.map(p => p.wind_dir)));
  const align = mean(points.map(p => Math.cos(angleDiff(p.bearing, p.wind_dir) * Math.PI / 180)));
  const relative = align > 0.35 ? 'face' : align < -0.35 ? 'dos' : 'travers';

  // Le nom du trajet apparaît dans un titre de carte : on garde la rue seule.
  const street = s => String(s).split(',')[0].trim();
  const homeName = street(trip.home.label), workName = street(trip.work.label);

  return {
    route: {
      id: type, type: type,
      name: type === 'morning' ? homeName + ' → ' + workName : workName + ' → ' + homeName,
      departure: hhmm,
      duration_min: route.duration_min,
      distance_km: route.distance_km,
      points: route.points.map(p => ({ i: p.i, time: points[p.i].time, label: p.label, lat: p.lat, lon: p.lon, x: p.x, y: p.y })),
      track: route.track,
      rain_cells: []
    },
    weather: {
      type: type,
      points: points.map(p => ({ i: p.i, time: p.time, label: p.label, rate: p.rate, mm: p.mm, prob: p.prob, temp: p.temp })),
      total_mm: total_mm,
      max_rate: +Math.max.apply(null, points.map(p => p.rate)).toFixed(2),
      max_prob: max_prob,
      peak: { time: peak.time, label: peak.label, rate: peak.rate, mm: peak.mm, prob: peak.prob },
      temp_c: temps.length ? Math.round(mean(temps)) : null,
      for_date: isoLocal(dep, 15).slice(0, 10)
    },
    wind: {
      type: type, speed_kmh: speed, gust_kmh: gust,
      dir_deg: from, dir_label: dirLabel(from), relative: relative
    }
  };
}

/** Renvoie les données réelles, ou null si aucun trajet n'est configuré. */
async function getTripData(type) {
  const trip = store.getTrip();
  if (!store.isConfigured(trip)) return null;

  const key = type + '|' + (trip.updated_at || '');
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  const data = await compute(type);
  cache.set(key, { at: Date.now(), data: data });
  return data;
}

function invalidate() { cache.clear(); }

/**
 * Créneaux de départ alternatifs : on décale l'heure de départ et on recalcule
 * ce que ça donnerait, à partir de la même prévision.
 */
async function getWindows(type, stepMin, count) {
  const trip = store.getTrip();
  if (!store.isConfigured(trip)) return null;

  const route  = trip.routes[type];
  const hhmm   = type === 'evening' ? trip.evening_time : trip.morning_time;
  const locs   = await fetchForecast(route.points);
  const offset = locs[0].utc_offset_seconds || 0;
  const base   = nextDeparture(hhmm, offset);

  const step = stepMin || 15;
  const n    = count || 8;
  const half = Math.floor(n / 2);
  const sliceH = (route.duration_min / Math.max(1, route.points.length - 1)) / 60;

  const windows = [];
  for (let k = -half; k < n - half; k++) {
    const dep = new Date(base.getTime() + k * step * 60000);
    let mm = 0, probMax = 0, windSum = 0, seen = 0;

    route.points.forEach((p, i) => {
      const loc = locs[i];
      const at  = new Date(dep.getTime() + p.offset_min * 60000);
      const q   = loc.minutely_15 || {};
      const qi  = (q.time || []).indexOf(isoLocal(at, 15));
      const h   = loc.hourly || {};
      const hi  = (h.time || []).indexOf(isoLocal(at, 60).slice(0, 13) + ':00');
      if (qi < 0) return;
      seen++;
      mm += (q.precipitation[qi] || 0) * 4 * sliceH;
      windSum += q.wind_speed_10m[qi] || 0;
      if (hi >= 0) probMax = Math.max(probMax, Math.round(h.precipitation_probability[hi] || 0));
    });

    if (!seen) continue;

    mm = +mm.toFixed(2);
    const wind = Math.round(windSum / seen);
    const verdict = mm >= 0.5 && probMax > 50 ? 'pluie' : probMax > 30 || mm > 0.1 ? 'risque' : 'sec';

    // Le score pénalise la pluie, le vent, et l'écart à l'horaire habituel :
    // un créneau parfait à 2 h de décalage n'est pas une vraie proposition.
    const score = Math.max(0, Math.round(
      100 - mm * 22 - probMax * 0.45 - Math.max(0, wind - 15) * 0.8 - Math.abs(k) * step * 0.22
    ));

    windows.push({
      time: pad(dep.getUTCHours()) + ':' + pad(dep.getUTCMinutes()),
      mm: mm, prob_max: probMax, wind_kmh: wind, score: score, verdict: verdict,
      is_usual: k === 0
    });
  }

  return { type: type, windows: windows, usual: hhmm };
}

/**
 * Enveloppe tolérante utilisée par les routes de l'API : renvoie toujours
 * quelque chose d'affichable. Si aucun trajet n'est configuré, ou si une API
 * externe est indisponible, on retombe sur la maquette plutôt que de casser
 * l'écran — avec la raison, affichée dans l'interface.
 */
async function safeTripData(type) {
  const trip = store.getTrip();
  if (!store.isConfigured(trip)) return { data: null, source: 'mock', error: null };
  try {
    return { data: await getTripData(type), source: 'live', error: null };
  } catch (e) {
    return { data: null, source: 'mock', error: e.message || String(e) };
  }
}

module.exports = { getTripData, getWindows, safeTripData, invalidate, nextDeparture };

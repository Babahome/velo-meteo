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
function nextDeparture(hhmm, utcOffsetSec, shiftMin) {
  const parts = String(hhmm || '08:00').split(':');
  const localNow = new Date(Date.now() + utcOffsetSec * 1000);
  const dep = new Date(Date.UTC(
    localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate(),
    parseInt(parts[0], 10) || 0, parseInt(parts[1], 10) || 0
  ));
  if (dep.getTime() < localNow.getTime() - 2 * 3600 * 1000) dep.setUTCDate(dep.getUTCDate() + 1);

  // Décalage temporaire demandé depuis la carte : il déplace tout le trajet,
  // sans toucher à l'horaire enregistré dans /data.
  if (shiftMin) dep.setTime(dep.getTime() + shiftMin * 60000);
  return dep;
}

/** Le décalage vient de l'URL : borné à ±2 h et arrondi au pas de 5 minutes. */
function cleanShift(v) {
  const n = Math.round((parseFloat(v) || 0) / 5) * 5;
  return Math.max(-120, Math.min(120, n));
}

function angleDiff(a, b) {
  return Math.abs(((a - b + 540) % 360) - 180);
}

function dirLabel(deg) {
  const rose = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
  return rose[Math.round(((deg % 360) / 22.5)) % 16];
}

/* ---------- appel Open-Meteo ---------- */

/**
 * Deux modèles demandés en une seule requête, pour deux raisons distinctes.
 *
 *  - `meteofrance_seamless` enchaîne AROME HD (1,5 km), AROME et ARPEGE : c'est
 *    la meilleure résolution disponible sur la France, et la source dont partent
 *    les prévisions françaises. Le défaut d'Open-Meteo (`best_match`) sert en
 *    réalité ICON, le modèle allemand, dont la maille de 2 à 11 km lisse les
 *    averses locales — d'où des écarts visibles avec les autres sources.
 *  - `best_match` est gardé parce que Météo-France ne publie **pas** de
 *    probabilité de précipitation via Open-Meteo : le champ revient vide. Il
 *    sert aussi de repli hors couverture Météo-France.
 *
 * Avec plusieurs modèles, Open-Meteo suffixe les champs. `normalize()` refusionne
 * le tout en champs simples, valeur Météo-France d'abord, pour que le reste du
 * code ignore complètement cette mécanique.
 */
const MODELS = 'meteofrance_seamless,best_match';

/**
 * Modèles proposés à la comparaison en mode debug.
 *
 * `meteofrance_seamless` est celui de l'app. `arome_france_hd` est le même
 * modèle sans son repli : mesuré identique à `seamless` sur 1917 créneaux
 * comparés sur 1920, dans dix villes françaises et sur deux jours — les trois
 * écarts étant des créneaux où `seamless` a une donnée et AROME HD n'en a pas.
 * Les trois autres sont des modèles étrangers, utiles comme point de comparaison.
 */
const COMPARE_MODELS = [
  'meteofrance_seamless',
  'meteofrance_arome_france_hd',
  'best_match',
  'icon_eu',
  'ecmwf_ifs025'
];

/** Série Météo-France, trou par trou complétée par le modèle de repli. */
function mergeSeries(main, fallback) {
  if (!main) return fallback || [];
  if (!fallback) return main;
  return main.map((v, i) => (v === null || v === undefined ? fallback[i] : v));
}

function normalize(loc) {
  ['minutely_15', 'hourly'].forEach(name => {
    const block = loc[name];
    if (!block) return;

    const out = { time: block.time };
    Object.keys(block).forEach(key => {
      if (key === 'time') return;
      const m = key.match(/^(.+)_(meteofrance_seamless|best_match)$/);
      if (!m) { out[key] = block[key]; return; }
      if (out[m[1]]) return;   // déjà fusionné via l'autre modèle
      out[m[1]] = mergeSeries(block[m[1] + '_meteofrance_seamless'], block[m[1] + '_best_match']);
    });
    loc[name] = out;
  });
  return loc;
}

async function fetchForecast(points) {
  const qs = new URLSearchParams({
    latitude: points.map(p => p.lat).join(','),
    longitude: points.map(p => p.lon).join(','),
    minutely_15: 'precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m,apparent_temperature',
    hourly: 'precipitation_probability',
    models: MODELS,
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
    return locs.map(normalize);
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- assemblage ---------- */

async function compute(type, shift) {
  const trip = store.getTrip();
  if (!store.isConfigured(trip)) return null;

  const route = trip.routes[type];
  const hhmm  = type === 'evening' ? trip.evening_time : trip.morning_time;
  const locs  = await fetchForecast(route.points);

  const offset = locs[0].utc_offset_seconds || 0;
  const dep    = nextDeparture(hhmm, offset, shift);

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
      departure: pad(dep.getUTCHours()) + ':' + pad(dep.getUTCMinutes()),
      departure_usual: hhmm,
      shift_min: shift || 0,
      duration_min: route.duration_min,
      distance_km: route.distance_km,
      points: route.points.map(p => ({ i: p.i, time: points[p.i].time, label: p.label, lat: p.lat, lon: p.lon, x: p.x, y: p.y })),
      track: route.track,
      track_ll: route.track_ll || null,
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
async function getTripData(type, shift) {
  const trip = store.getTrip();
  if (!store.isConfigured(trip)) return null;

  const key = type + '|' + (shift || 0) + '|' + (trip.updated_at || '');
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  const data = await compute(type, shift);
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

/* ---------- champ de pluie autour du trajet ---------- */

/**
 * Grille de points couvrant le trajet et ses environs, à un pas d'environ
 * `stepM` mètres. La grille sert à dessiner les nuages de pluie sur la carte :
 * les 8 points de passage ne disent que ce qui tombe *sur* le trajet, pas ce
 * qui arrive à côté.
 */
function buildGrid(points, stepM, maxSide) {
  const lats = points.map(p => p.lat), lons = points.map(p => p.lon);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);

  // Marge autour du trajet : une averse qui arrive compte autant que celle qui
  // est déjà dessus. La carte cadre plus large que le trajet, la grille aussi.
  const midLat = (minLat + maxLat) / 2;
  const degLat = stepM / 111320;
  const degLon = stepM / (111320 * Math.cos(midLat * Math.PI / 180) || 1);

  const spanLat = (maxLat - minLat) * 1.6 + degLat;
  const spanLon = (maxLon - minLon) * 1.6 + degLon;

  const nLat = Math.max(3, Math.min(maxSide, Math.round(spanLat / degLat) + 1));
  const nLon = Math.max(3, Math.min(maxSide, Math.round(spanLon / degLon) + 1));

  const out = [];
  for (let i = 0; i < nLat; i++) {
    for (let j = 0; j < nLon; j++) {
      out.push({
        lat: +(midLat - spanLat / 2 + (spanLat * i) / (nLat - 1)).toFixed(5),
        lon: +((minLon + maxLon) / 2 - spanLon / 2 + (spanLon * j) / (nLon - 1)).toFixed(5)
      });
    }
  }
  return { cells: out, stepLat: spanLat / (nLat - 1), stepLon: spanLon / (nLon - 1) };
}

/** Rang du point de passage le plus proche d'une case de la grille. */
function nearestPoint(points, cell) {
  let best = 0, bestD = Infinity;
  points.forEach((p, i) => {
    const d = (p.lat - cell.lat) ** 2 + (p.lon - cell.lon) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

/**
 * Vue d'ensemble : chaque case prend l'intensité de l'image correspondant au
 * point de passage le plus proche. C'est la lecture « est-ce que je vais me
 * faire saucer sur ce trajet », là où une image seule répond « à cet instant ».
 */
function overview(grid, points, frames) {
  return grid.cells.map((c, j) => ({
    lat: c.lat, lon: c.lon,
    rate: frames[nearestPoint(points, c)].rates[j]
  }));
}

// La maille des modèles tourne autour de 2 km ; on échantillonne plus fin que
// ça. À 1,8 km de pas, une carte de vélotaf ne contient que deux cases et le
// rendu vire à l'aplat uniforme : ce sont les dégradés qui dessinent le nuage.
const GRID_STEP_M = 900;
const GRID_MAX_SIDE = 7;    // 49 points au maximum dans la requête Open-Meteo

/**
 * Champ de pluie autour du trajet, **à l'heure de passage** — et non à l'heure
 * courante comme le ferait une image radar.
 *
 * On renvoie une image par point de passage : la même requête Open-Meteo les
 * contient toutes, et le curseur de la carte peut alors passer de l'une à
 * l'autre sans aller-retour réseau. `cells` reste la vue d'ensemble.
 */
async function computeField(route, hhmm, shift) {
  const grid = buildGrid(route.points, GRID_STEP_M, GRID_MAX_SIDE);
  const locs = await fetchForecast(grid.cells);
  const dep = nextDeparture(hhmm, locs[0].utc_offset_seconds || 0, shift);

  // precipitation est un cumul sur 15 min : ×4 pour une intensité en mm/h.
  // null quand le créneau n'existe pas dans la réponse : « pas de donnée » et
  // « pas de pluie » ne doivent pas se confondre à l'écran.
  const rateAt = (loc, at) => {
    const q = loc.minutely_15 || {};
    const qi = (q.time || []).indexOf(isoLocal(at, 15));
    return qi >= 0 ? +((q.precipitation[qi] || 0) * 4).toFixed(2) : null;
  };

  const frames = route.points.map(p => {
    const at = new Date(dep.getTime() + p.offset_min * 60000);
    const raw = grid.cells.map((c, j) => rateAt(locs[j], at));
    return {
      i: p.i,
      offset_min: p.offset_min,
      time: pad(at.getUTCHours()) + ':' + pad(at.getUTCMinutes()),
      // Hors fenêtre de prévision (départ trop lointain), l'image est marquée
      // absente plutôt que renvoyée à zéro, qui se lirait « ciel sec ».
      found: raw.some(r => r !== null),
      rates: raw.map(r => (r === null ? 0 : r))
    };
  });

  return {
    cells: overview(grid, route.points, frames),
    frames: frames,
    step_lat: +grid.stepLat.toFixed(5),
    step_lon: +grid.stepLon.toFixed(5),
    at: isoLocal(dep, 15)
  };
}

/* ---------- averse simulée ---------- */

/*
 * Jeu d'essai complet, et pas seulement pour la carte : le graphe, le profil,
 * le verdict et les créneaux en dépendent aussi, sinon on compare un écran
 * arrosé à des chiffres secs et on ne peut rien valider.
 *
 * L'averse **traverse** le secteur en une heure. Sa position ne dépend donc pas
 * du rang du point de passage mais du **temps écoulé** : décaler le départ de
 * ±10 minutes la déplace pour de bon, et les créneaux se classent vraiment.
 */

const DEMO_CROSS_MIN = 60;   // durée de la traversée
const DEMO_PEAK = 14;        // mm/h au cœur, de quoi atteindre le dernier palier

/** Géométrie commune à toutes les vues de l'averse simulée. */
function demoGeom(route) {
  const grid = buildGrid(route.points, GRID_STEP_M, GRID_MAX_SIDE);
  const pts = route.points;
  return {
    grid: grid,
    pts: pts,
    mid: pts[Math.floor(pts.length / 2)],
    spread: Math.max(grid.stepLat, grid.stepLon) * 1.1,
    // Le jeu fictif n'a pas d'`offset_min` : on le reconstitue au prorata.
    offsetOf: (p, k) => (typeof p.offset_min === 'number' ? p.offset_min
      : Math.round(((route.duration_min || 30) * k) / Math.max(1, pts.length - 1)))
  };
}

/** Intensité fictive en un point, `tMin` minutes après le départ habituel. */
function demoRateAt(g, lat, lon, tMin) {
  const u = tMin / DEMO_CROSS_MIN - 0.5;
  const cLat = g.mid.lat + g.spread * 3 * u;
  const cLon = g.mid.lon + g.spread * 3 * u;
  const d1 = Math.hypot(lat - cLat, lon - cLon) / g.spread;
  const d2 = Math.hypot(lat - (cLat + g.spread * 1.6), lon - (cLon - g.spread * 1.6)) / g.spread;
  return +(DEMO_PEAK * Math.exp(-d1 * d1) + 2 * Math.exp(-d2 * d2)).toFixed(2);
}

/** Minutes du départ, décalage compris, à partir de "HH:MM". */
function minutesOf(hhmm, shift) {
  const parts = String(hhmm || '08:00').split(':');
  return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0) + (shift || 0);
}

const hhmmOf = m => pad(Math.floor(((m % 1440) + 1440) % 1440 / 60)) + ':' + pad(((m % 60) + 60) % 60);

/**
 * Intensité lue **dans la grille**, à la case la plus proche du point. Le
 * graphe et la pastille du curseur doivent afficher le même chiffre que la
 * tache dessinée sous le marqueur, pas une valeur calculée à côté.
 */
function demoRateOnRoute(g, p, tMin) {
  let best = null, bestD = Infinity;
  g.grid.cells.forEach(c => {
    const dd = (c.lat - p.lat) ** 2 + (c.lon - p.lon) ** 2;
    if (dd < bestD) { bestD = dd; best = c; }
  });
  return demoRateAt(g, best.lat, best.lon, tMin);
}

function demoField(route, hhmm, shift) {
  const g = demoGeom(route);
  const dep = minutesOf(hhmm, shift);

  const frames = g.pts.map((p, k) => {
    const t = g.offsetOf(p, k) + (shift || 0);
    return {
      i: p.i,
      offset_min: g.offsetOf(p, k),
      time: hhmmOf(dep + g.offsetOf(p, k)),
      found: true,
      rates: g.grid.cells.map(c => demoRateAt(g, c.lat, c.lon, t))
    };
  });

  return {
    cells: overview(g.grid, g.pts, frames),
    frames: frames,
    step_lat: +g.grid.stepLat.toFixed(5),
    step_lon: +g.grid.stepLon.toFixed(5),
    at: null
  };
}

/** Le même jeu d'essai, mis en forme comme une vraie réponse météo. */
function demoWeather(route, hhmm, shift, type) {
  const g = demoGeom(route);
  const dep = minutesOf(hhmm, shift);

  const points = g.pts.map((p, k) => {
    const off = g.offsetOf(p, k);
    const rate = demoRateOnRoute(g, p, off + (shift || 0));
    return {
      i: p.i,
      time: hhmmOf(dep + off),
      label: p.label,
      rate: rate,
      // Probabilité et ressenti sont fictifs eux aussi, mais cohérents avec la
      // pluie : un verdict calculé sur un ciel sec n'aurait aucun sens ici.
      prob: Math.min(95, Math.round(rate * 9 + (rate > 0.1 ? 25 : 5))),
      temp: 13
    };
  });

  const sliceH = ((route.duration_min || 30) / Math.max(1, points.length - 1)) / 60;
  points.forEach(p => { p.mm = +(p.rate * sliceH).toFixed(2); });

  const peak = points.reduce((a, b) => (b.rate > a.rate ? b : a), points[0]);
  return {
    type: type,
    points: points,
    total_mm: +points.reduce((s, p) => s + p.mm, 0).toFixed(1),
    max_rate: +Math.max.apply(null, points.map(p => p.rate)).toFixed(2),
    max_prob: Math.max.apply(null, points.map(p => p.prob)),
    peak: { time: peak.time, label: peak.label, rate: peak.rate, mm: peak.mm, prob: peak.prob },
    temp_c: 13,
    for_date: null
  };
}

/** Créneaux de départ sur le même jeu d'essai : l'averse s'éloigne vraiment. */
function demoWindows(route, hhmm, shift, stepMin, count) {
  const g = demoGeom(route);
  const step = stepMin || 15;
  const n = count || 9;
  const half = Math.floor(n / 2);
  const dep = minutesOf(hhmm, shift);
  const sliceH = ((route.duration_min || 30) / Math.max(1, g.pts.length - 1)) / 60;

  const windows = [];
  for (let k = -half; k < n - half; k++) {
    const delta = k * step;
    let mm = 0, probMax = 0;

    g.pts.forEach((p, i) => {
      const rate = demoRateOnRoute(g, p, g.offsetOf(p, i) + (shift || 0) + delta);
      mm += rate * sliceH;
      probMax = Math.max(probMax, Math.min(95, Math.round(rate * 9 + (rate > 0.1 ? 25 : 5))));
    });

    mm = +mm.toFixed(2);
    windows.push({
      time: hhmmOf(dep + delta),
      mm: mm,
      prob_max: probMax,
      wind_kmh: 14,
      score: Math.max(0, Math.round(100 - mm * 22 - probMax * 0.45 - Math.abs(delta) * 0.22)),
      verdict: mm >= 0.5 && probMax > 50 ? 'pluie' : probMax > 30 || mm > 0.1 ? 'risque' : 'sec',
      is_usual: k === 0
    });
  }

  return { type: 'demo', windows: windows, usual: hhmmOf(dep) };
}

/**
 * Enveloppe tolérante utilisée par les routes de l'API : renvoie toujours
 * quelque chose d'affichable. Si aucun trajet n'est configuré, ou si une API
 * externe est indisponible, on retombe sur la maquette plutôt que de casser
 * l'écran — avec la raison, affichée dans l'interface.
 */
async function safeTripData(type, shift) {
  const trip = store.getTrip();
  if (!store.isConfigured(trip)) return { data: null, source: 'mock', error: null };
  try {
    return { data: await getTripData(type, shift), source: 'live', error: null };
  } catch (e) {
    return { data: null, source: 'mock', error: e.message || String(e) };
  }
}

/**
 * Même trajet, même créneau, plusieurs modèles côte à côte.
 *
 * Un seul appel : `models` accepte une liste, et la réponse suffixe alors ses
 * champs. Pas de cache — on veut le relevé du moment, et l'appel est rare.
 */
async function compareModels(type, shift) {
  const trip = store.getTrip();
  if (!store.isConfigured(trip)) return null;

  const route = trip.routes[type];
  const hhmm = type === 'evening' ? trip.evening_time : trip.morning_time;

  const qs = new URLSearchParams({
    latitude: route.points.map(p => p.lat).join(','),
    longitude: route.points.map(p => p.lon).join(','),
    minutely_15: 'precipitation',
    hourly: 'precipitation_probability',
    models: COMPARE_MODELS.join(','),
    timezone: 'auto',
    forecast_days: '2'
  });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let locs;
  try {
    const res = await fetch(API + '?' + qs.toString(), { signal: ctrl.signal });
    if (!res.ok) throw new Error('Open-Meteo HTTP ' + res.status);
    const json = await res.json();
    locs = Array.isArray(json) ? json : [json];
  } finally {
    clearTimeout(timer);
  }

  const dep = nextDeparture(hhmm, locs[0].utc_offset_seconds || 0, shift);
  const sliceH = (route.duration_min / Math.max(1, route.points.length - 1)) / 60;

  const points = route.points.map(p => {
    const at = new Date(dep.getTime() + p.offset_min * 60000);
    return {
      i: p.i, label: p.label, lat: p.lat, lon: p.lon,
      time: pad(at.getUTCHours()) + ':' + pad(at.getUTCMinutes()),
      quarter: isoLocal(at, 15),
      hour: isoLocal(at, 60).slice(0, 13) + ':00'
    };
  });

  const models = COMPARE_MODELS.map(name => {
    const rates = points.map((pt, i) => {
      const q = locs[i].minutely_15 || {};
      const k = (q.time || []).indexOf(pt.quarter);
      const v = k >= 0 ? q['precipitation_' + name][k] : null;
      // Cumul sur 15 min converti en intensité, comme partout dans l'app.
      return (v === null || v === undefined) ? null : +(v * 4).toFixed(2);
    });

    const probs = points.map((pt, i) => {
      const h = locs[i].hourly || {};
      const k = (h.time || []).indexOf(pt.hour);
      const v = k >= 0 ? h['precipitation_probability_' + name][k] : null;
      return (v === null || v === undefined) ? null : Math.round(v);
    });

    const known = rates.filter(v => v !== null);
    return {
      name: name,
      available: known.length > 0,
      rates: rates,
      probs: probs,
      total_mm: +known.reduce((s, v) => s + v * sliceH, 0).toFixed(2),
      max_rate: known.length ? +Math.max.apply(null, known).toFixed(2) : null,
      max_prob: probs.some(v => v !== null) ? Math.max.apply(null, probs.filter(v => v !== null)) : null
    };
  });

  return {
    type: type,
    shift: shift || 0,
    at: isoLocal(dep, 15),
    current: 'meteofrance_seamless',
    points: points.map(p => ({ i: p.i, label: p.label, time: p.time })),
    models: models
  };
}

/** Champ de pluie mis en cache comme le reste : l'écran d'accueil est bavard. */
async function getField(type, shift) {
  const trip = store.getTrip();
  if (!store.isConfigured(trip)) return null;

  const key = 'field|' + type + '|' + (shift || 0) + '|' + (trip.updated_at || '');
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  const data = await computeField(trip.routes[type], type === 'evening' ? trip.evening_time : trip.morning_time, shift);
  cache.set(key, { at: Date.now(), data: data });
  return data;
}

module.exports = {
  getTripData, getWindows, safeTripData, invalidate, nextDeparture, cleanShift,
  getField, demoField, demoWeather, demoWindows,
  compareModels, COMPARE_MODELS
};

/**
 * Géocodage des adresses et calcul de l'itinéraire vélo.
 *
 *  - Géocodage : Nominatim (OpenStreetMap). Appelé uniquement à l'enregistrement
 *    du trajet, jamais en boucle : la politique d'usage impose 1 req/s max et un
 *    User-Agent identifiant l'application.
 *  - Itinéraire : instance OSRM publique FOSSGIS avec le profil vélo
 *    (l'instance de démo d'OSRM ne propose que le profil voiture).
 */
'use strict';

const UA = 'velo-meteo-hassio-addon/0.17.0 (Home Assistant add-on; personal use)';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const REVERSE   = 'https://nominatim.openstreetmap.org/reverse';
const OSRM      = 'https://routing.openstreetmap.de/routed-bike/route/v1/bike';

const TIMEOUT_MS = 15000;

async function getJson(url, headers) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: Object.assign({ 'User-Agent': UA }, headers || {}), signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- géocodage ---------- */

/**
 * Raccourcit un display_name Nominatim : il descend jusqu'au pays, ce qui est
 * illisible sur un écran de téléphone. On garde la rue et son contexte proche.
 */
function shortLabel(displayName) {
  const parts = String(displayName).split(',').map(s => s.trim()).filter(Boolean);
  return parts.slice(0, 2).join(', ');
}

async function geocode(query) {
  const q = String(query || '').trim();
  if (!q) throw new Error('Adresse vide');
  const url = NOMINATIM + '?format=jsonv2&limit=1&addressdetails=0&q=' + encodeURIComponent(q);
  const rows = await getJson(url, { 'Accept-Language': 'fr' });
  if (!Array.isArray(rows) || !rows.length) throw new Error('Adresse introuvable : ' + q);
  return {
    query: q,
    label: shortLabel(rows[0].display_name),
    lat: parseFloat(rows[0].lat),
    lon: parseFloat(rows[0].lon)
  };
}

/**
 * Nom d'un lieu à partir de ses coordonnées : une trace GPX ne porte aucune
 * adresse, mais « Départ · Rue de la Paix » reste plus parlant que « Départ ».
 * Un échec n'est pas bloquant, l'appelant retombe sur un libellé générique.
 */
async function reverseGeocode(lat, lon) {
  const url = REVERSE + '?format=jsonv2&zoom=17&addressdetails=0&lat=' + lat + '&lon=' + lon;
  const row = await getJson(url, { 'Accept-Language': 'fr' });
  if (!row || !row.display_name) throw new Error('Lieu introuvable');
  return { query: lat + ',' + lon, label: shortLabel(row.display_name), lat: lat, lon: lon };
}

/* ---------- géométrie ---------- */

const R = 6371000;
const rad = d => (d * Math.PI) / 180;

function haversine(a, b) {
  const dLat = rad(b[0] - a[0]), dLon = rad(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2 +
            Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Cap (0-360°, 0 = nord) du point a vers le point b. */
function bearing(a, b) {
  const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0]));
  const x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) -
            Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1]));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

/**
 * Projette une liste de points [lat, lon] dans un carré 0..1, en respectant
 * les proportions réelles (la longitude est compressée par cos(latitude)) et
 * le format de la carte SVG. y est inversé : 0 en haut, comme en SVG.
 */
function project(coords, aspect) {
  const MARGIN = 0.1; // le tracé ne doit pas toucher les bords de la carte

  const lat0 = rad(coords.reduce((s, c) => s + c[0], 0) / coords.length);
  const xs = coords.map(c => c[1] * Math.cos(lat0));
  const ys = coords.map(c => c[0]);

  const minX = Math.min(...xs), minY = Math.min(...ys);
  const spanX = Math.max(Math.max(...xs) - minX, 1e-9);
  const spanY = Math.max(Math.max(...ys) - minY, 1e-9);

  // x et y sont normalisés sur 0..1 mais l'image n'est pas carrée : une même
  // distance au sol vaut `aspect` fois plus en y qu'en x. On prend l'échelle
  // la plus contraignante des deux pour ne pas déformer le tracé.
  const k = Math.min(1 / spanX, aspect / spanY) * (1 - MARGIN);
  const w = spanX * k;
  const h = (spanY * k) / aspect;
  const padX = (1 - w) / 2, padY = (1 - h) / 2;

  return coords.map((c, i) => ({
    x: +(padX + (xs[i] - minX) * k).toFixed(4),
    y: +(1 - (padY + ((ys[i] - minY) * k) / aspect)).toFixed(4) // nord en haut
  }));
}

/* ---------- itinéraire ---------- */

/**
 * Échantillonne n points régulièrement répartis le long du tracé, avec pour
 * chacun le temps de parcours cumulé et le nom de la rue traversée.
 */
function sample(coords, bounds, totalDist, totalDur, n) {
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + haversine(coords[i - 1], coords[i]));
  const dist = cum[cum.length - 1] || totalDist || 1;

  const out = [];
  for (let k = 0; k < n; k++) {
    const target = (dist * k) / (n - 1);

    let i = 1;
    while (i < cum.length - 1 && cum[i] < target) i++;
    const span = cum[i] - cum[i - 1] || 1;
    const t = Math.min(1, Math.max(0, (target - cum[i - 1]) / span));
    const lat = coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * t;
    const lon = coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * t;

    const step = (bounds || []).find(b => target <= b.upTo);
    const name = step && step.name ? step.name : '';

    out.push({
      i: k,
      lat: +lat.toFixed(6),
      lon: +lon.toFixed(6),
      offset_min: Math.round((totalDur * (target / dist)) / 60),
      km: +(target / 1000).toFixed(1),
      name: name,
      bearing: Math.round(bearing(coords[Math.max(0, i - 1)], coords[Math.min(coords.length - 1, i)]))
    });
  }
  return out;
}

/** Libellé affiché sous chaque point du profil de pluie. */
function labelFor(pt, idx, last, from, to) {
  if (idx === 0) return 'Départ · ' + from;
  if (idx === last) return 'Arrivée · ' + to;
  return pt.name || ('km ' + String(pt.km).replace('.', ','));
}

const NB_POINTS = 8;
const MAP_ASPECT = 210 / 340; // doit rester aligné sur le viewBox de la carte SVG

/** Longueur d'un tracé, en mètres. */
function trackLength(coords) {
  let d = 0;
  for (let i = 1; i < coords.length; i++) d += haversine(coords[i - 1], coords[i]);
  return d;
}

/**
 * Met un tracé en forme pour l'app : points de passage, projection carte et
 * tracé allégé. Commun à l'itinéraire OSRM et à une trace GPX importée.
 */
/** Bornes de distance de chaque manœuvre OSRM, pour retrouver le nom de rue. */
function streetBounds(steps) {
  const bounds = [];
  let acc = 0;
  (steps || []).forEach(s => {
    acc += s.distance || 0;
    bounds.push({ upTo: Math.round(acc), name: (s.name || '').trim() });
  });
  return bounds.filter(b => b.name);
}

function assemble(coords, bounds, distance, duration, from, to, nbPoints) {
  const n = nbPoints || NB_POINTS;
  const short = s => String(s).split(',')[0].trim();
  const pts = sample(coords, bounds, distance, duration, n);
  const last = pts.length - 1;

  const xyPts   = project(pts.map(p => [p.lat, p.lon]).concat(coords), MAP_ASPECT);
  const xyTrack = xyPts.slice(pts.length);

  // Le tracé est stocké dans /data et renvoyé à chaque affichage : une trace
  // GPX brute fait des dizaines de milliers de points, ~300 suffisent à l'œil.
  const stride = Math.max(3, Math.ceil(coords.length / 300));
  const keep = (_, i) => i % stride === 0 || i === coords.length - 1;

  return {
    distance_km: +(distance / 1000).toFixed(1),
    duration_min: Math.round(duration / 60),
    points: pts.map((p, i) => Object.assign({}, p, {
      label: labelFor(p, i, last, short(from.label), short(to.label)),
      x: xyPts[i].x,
      y: xyPts[i].y
    })),
    track: xyTrack.filter(keep),
    // Le tracé en coordonnées réelles : la carte à tuiles le reprojette
    // elle-même en Mercator, `track` (0..1) ne lui sert à rien.
    track_ll: coords.filter(keep).map(c => [+c[0].toFixed(5), +c[1].toFixed(5)]),
    // Les noms de rue sont conservés avec le trajet : changer le pas de temps
    // rééchantillonne les points de passage sans rappeler OSRM, et il faut
    // pouvoir les renommer.
    streets: bounds || []
  };
}

/**
 * Nombre de points de passage pour un pas de temps donné.
 * `auto` garde les 8 points d'origine, un compromis qui tient sur un graphe de
 * téléphone quelle que soit la durée du trajet.
 */
function pointsForStep(durationMin, stepMin) {
  if (!stepMin || stepMin === 'auto') return NB_POINTS;
  const n = Math.round((durationMin || 30) / stepMin) + 1;
  return Math.max(3, Math.min(16, n));
}

/**
 * Rééchantillonne un trajet déjà calculé, à partir du tracé mémorisé : aucun
 * appel à OSRM, donc changer le pas de temps est instantané et gratuit.
 */
function resample(route, from, to, nbPoints) {
  const coords = route.track_ll;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const next = assemble(coords, route.streets || [], route.distance_km * 1000,
                        route.duration_min * 60, from, to, nbPoints);
  // La distance et la durée d'origine font foi : le tracé mémorisé est allégé,
  // sa longueur mesurée est légèrement inférieure à la vraie.
  next.distance_km = route.distance_km;
  next.duration_min = route.duration_min;
  if (route.elevation_gain_m !== undefined) next.elevation_gain_m = route.elevation_gain_m;
  return next;
}

async function buildRoute(from, to, nbPoints) {
  const url = OSRM + '/' + from.lon + ',' + from.lat + ';' + to.lon + ',' + to.lat +
              '?overview=full&geometries=geojson&steps=true&annotations=false';
  const data = await getJson(url);
  if (data.code !== 'Ok' || !data.routes || !data.routes.length) {
    throw new Error('Itinéraire introuvable (OSRM : ' + (data.code || 'réponse vide') + ')');
  }

  const r = data.routes[0];
  const coords = r.geometry.coordinates.map(c => [c[1], c[0]]); // [lon,lat] -> [lat,lon]
  const steps = (r.legs && r.legs[0] && r.legs[0].steps) || [];

  return assemble(coords, streetBounds(steps), r.distance, r.duration, from, to, nbPoints);
}

/**
 * Itinéraire à partir d'un tracé déjà connu (trace GPX) : aucun routeur n'est
 * appelé, et faute de manœuvres OSRM les points de passage sont nommés par
 * leur kilomètre.
 */
function buildRouteFromTrack(coords, from, to, durationSec, nbPoints) {
  if (!Array.isArray(coords) || coords.length < 2) throw new Error('Tracé vide');
  const distance = trackLength(coords);
  if (distance < 50) throw new Error('Tracé trop court (moins de 50 m)');
  return assemble(coords, [], distance, durationSec, from, to, nbPoints);
}

module.exports = {
  geocode, reverseGeocode, buildRoute, buildRouteFromTrack, resample,
  pointsForStep, trackLength, bearing, NB_POINTS
};

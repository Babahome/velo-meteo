/**
 * Lecture d'une trace GPX.
 *
 * Pas de dépendance : un GPX est un XML plat dont on n'exploite qu'une poignée
 * de balises (`trkpt`, `ele`, `time`, `name`). Ajouter un parseur XML complet
 * à une image Docker qui ne contient qu'express pour lire quatre balises ne se
 * justifie pas — on lit les points à l'expression régulière, en tolérant les
 * préfixes de namespace et l'ordre des attributs.
 */
'use strict';

const MAX_POINTS = 60000;

/** `<trkpt …>…</trkpt>` ou `<trkpt … />`, avec préfixe de namespace éventuel. */
const pointRe = tag => new RegExp('<((?:\\w+:)?' + tag + ')\\b([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/\\1\\s*>)', 'gi');
const LAT   = /\blat\s*=\s*["']([^"']+)["']/i;
const LON   = /\blon\s*=\s*["']([^"']+)["']/i;
const ELE   = /<(?:\w+:)?ele\b[^>]*>([^<]*)</i;
const TIME  = /<(?:\w+:)?time\b[^>]*>([^<]*)</i;
const NAME  = /<(?:\w+:)?name\b[^>]*>([^<]*)</i;

function decode(s) {
  return String(s)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

/** Extrait les points portant un tag donné, dans l'ordre du fichier. */
function collect(text, tag) {
  const coords = [], times = [], eles = [];
  const re = pointRe(tag);
  let m;
  while ((m = re.exec(text)) !== null) {
    const attrs = m[2] || '', body = m[3] || '';
    const la = LAT.exec(attrs), lo = LON.exec(attrs);
    if (!la || !lo) continue;

    const lat = parseFloat(la[1]), lon = parseFloat(lo[1]);
    if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;

    // Deux points identiques d'affilée (arrêt au feu) n'apportent rien.
    const prev = coords[coords.length - 1];
    if (prev && prev[0] === lat && prev[1] === lon) continue;

    coords.push([lat, lon]);

    const t = TIME.exec(body);
    const parsed = t ? Date.parse(decode(t[1])) : NaN;
    times.push(isFinite(parsed) ? parsed : null);

    const e = ELE.exec(body);
    const alt = e ? parseFloat(decode(e[1])) : NaN;
    eles.push(isFinite(alt) ? alt : null);

    if (coords.length > MAX_POINTS) throw new Error('Trace trop lourde (plus de ' + MAX_POINTS + ' points).');
  }

  return { coords, times, eles };
}

/**
 * Points d'une trace GPX, dans l'ordre du fichier.
 * Les segments (`trkseg`) sont concaténés : une coupure GPS se traduit par un
 * segment droit, ce qui reste plus juste que de perdre la fin de la trace.
 * `wpt` n'est lu qu'en dernier recours : ce sont des points d'intérêt isolés,
 * pas un tracé, mais certains exports n'ont que ça.
 */
function parse(xml) {
  const text = String(xml || '');
  if (!/<(?:\w+:)?gpx[\s>]/i.test(text)) {
    throw new Error('Ce fichier n’est pas un GPX (balise <gpx> absente).');
  }

  let found = { coords: [] };
  for (const tag of ['trkpt', 'rtept', 'wpt']) {
    found = collect(text, tag);
    if (found.coords.length >= 2) break;
  }

  if (found.coords.length < 2) throw new Error('Aucun point de trace exploitable dans ce GPX.');

  const nm = NAME.exec(text);
  return Object.assign(found, { name: nm ? decode(nm[1]).slice(0, 80) : '' });
}

/**
 * Durée réelle de la trace, en secondes, si elle est horodatée.
 * Renvoie null si les horodatages manquent ou sont incohérents (traces
 * exportées d'un planificateur d'itinéraire, où tous les points portent la
 * même date, ou trace enregistrée sur plusieurs jours avec une pause).
 */
function durationOf(times) {
  const stamps = times.filter(t => t !== null);
  if (stamps.length < 2) return null;
  const sec = (stamps[stamps.length - 1] - stamps[0]) / 1000;
  if (sec < 60 || sec > 24 * 3600) return null;
  return sec;
}

/** Dénivelé positif cumulé, en mètres. Le seuil filtre le bruit de l'altimètre. */
function elevationGain(eles, threshold) {
  const seuil = threshold === undefined ? 3 : threshold;
  let gain = 0, ref = null;
  eles.forEach(e => {
    if (e === null) return;
    if (ref === null) { ref = e; return; }
    if (e - ref >= seuil) { gain += e - ref; ref = e; }
    else if (ref - e >= seuil) { ref = e; }
  });
  return Math.round(gain);
}

module.exports = { parse, durationOf, elevationGain, MAX_POINTS };

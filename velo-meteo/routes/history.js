/**
 * Recherche d'averses passées sur le trajet, dans l'archive ERA5 d'Open-Meteo.
 *
 * Sert à deux endroits : l'outil en ligne de commande `tools/replay.js`, et le
 * mode debug de l'app, qui propose les averses trouvées en un clic.
 *
 * ERA5 a une maille d'environ 25 km au pas horaire. C'est assez pour repérer
 * *quand* il a plu, pas pour juger le détail d'une averse de quartier.
 */
'use strict';

const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
const TIMEOUT_MS = 30000;

async function getJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error('Archive Open-Meteo HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const asList = j => (Array.isArray(j) ? j : [j]);

/**
 * Journées pluvieuses du trajet, la plus arrosée d'abord, avec l'heure du pic.
 *
 * L'heure compte autant que le total : une journée à 34 mm ne sert à rien si
 * tout est tombé pendant qu'on était au bureau. Elle est relevée au point
 * milieu du trajet, ce qui suffit à viser le bon créneau.
 */
async function showers(points, from, to, limit) {
  const n = limit || 8;

  const daily = asList(await getJson(ARCHIVE + '?' + new URLSearchParams({
    latitude: points.map(p => p.lat).join(','),
    longitude: points.map(p => p.lon).join(','),
    start_date: from, end_date: to,
    daily: 'precipitation_sum', timezone: 'auto'
  })));

  const days = daily[0].daily.time;
  const rows = days.map((d, i) => ({
    date: d,
    max_mm: +Math.max.apply(null, daily.map(l => l.daily.precipitation_sum[i] || 0)).toFixed(1)
  })).filter(r => r.max_mm >= 1).sort((a, b) => b.max_mm - a.max_mm).slice(0, n);

  if (!rows.length) return [];

  const mid = points[Math.floor(points.length / 2)];
  const sorted = rows.map(r => r.date).sort();
  const hourly = await getJson(ARCHIVE + '?' + new URLSearchParams({
    latitude: mid.lat, longitude: mid.lon,
    start_date: sorted[0], end_date: sorted[sorted.length - 1],
    hourly: 'precipitation', timezone: 'auto'
  }));

  const want = new Set(rows.map(r => r.date));
  const peak = {};
  (hourly.hourly.time || []).forEach((t, i) => {
    const day = t.slice(0, 10);
    if (!want.has(day)) return;
    const mm = hourly.hourly.precipitation[i] || 0;
    if (!peak[day] || mm > peak[day].mm) peak[day] = { hour: t.slice(11, 16), mm: +mm.toFixed(1) };
  });

  return rows.map(r => Object.assign({}, r, {
    peak_hour: (peak[r.date] || {}).hour || null,
    peak_mm: (peak[r.date] || {}).mm || 0
  })).sort((a, b) => b.peak_mm - a.peak_mm);
}

module.exports = { showers };

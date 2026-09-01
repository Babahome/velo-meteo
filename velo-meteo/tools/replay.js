#!/usr/bin/env node
/**
 * Replay historique : tester l'app sur une vraie journée de pluie, sans
 * attendre qu'il pleuve sur le trajet.
 *
 * Trois API d'Open-Meteo, toutes gratuites et sans clé :
 *
 *  - **archive** (ERA5) : ce qui est *réellement* tombé. C'est la vérité terrain
 *    à laquelle on compare. Maille ~25 km et pas horaire : elle ne voit pas une
 *    averse de quartier, elle sert à juger un ordre de grandeur, pas un détail.
 *  - **historical-forecast** : ce que chaque modèle *avait prévu* ce jour-là,
 *    avec les mêmes paramètres que l'API live. Couverture depuis ~2021.
 *  - rien d'autre : pas de compte, pas de quota atteignable pour un usage perso.
 *
 * Usage :
 *   node tools/replay.js scan --from 2026-06-01 --to 2026-08-31
 *   node tools/replay.js day 2026-07-16
 *   node tools/replay.js day 2026-07-16 --at 17:00
 *   node tools/replay.js day 2026-07-16 --at 17:00 --fixture data/pluie.json
 *
 * `scan` liste les journées pluvieuses sur le trajet, avec l'heure où il est
 * tombé le plus d'eau — une journée à 30 mm ne sert à rien si tout est tombé
 * pendant qu'on était au bureau.
 * `day` rejoue une journée : prévision de chaque modèle contre la réalité.
 * `--at HH:MM` force l'heure de départ, pour viser l'averse plutôt que
 * l'horaire habituel. `--fixture` écrit un fichier réutilisable en jeu d'essai.
 */
'use strict';

const fs    = require('fs');
const path  = require('path');
const store = require('../routes/store');

const ARCHIVE  = 'https://archive-api.open-meteo.com/v1/archive';
const HISTORY  = 'https://historical-forecast-api.open-meteo.com/v1/forecast';

/** Les modèles comparés. Le premier est celui que l'app utilise aujourd'hui. */
const MODELS = [
  'meteofrance_seamless',
  'meteofrance_arome_france_hd',
  'best_match',
  'icon_eu',
  'ecmwf_ifs025'
];

const TIMEOUT_MS = 30000;

async function getJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' sur ' + url.slice(0, 80));
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- trajet ---------- */

function loadTrip() {
  const trip = store.getTrip();
  if (!store.isConfigured(trip)) {
    throw new Error('Aucun trajet configuré dans ' + store.FILE +
      '. Lance l\'add-on et enregistre un trajet, ou pointe DATA_PATH sur le bon dossier.');
  }
  return trip;
}

const pad = n => String(n).padStart(2, '0');
const mean = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);

/* ---------- scan : trouver les journées pluvieuses ---------- */

async function scan(trip, from, to) {
  const pts = trip.routes.morning.points;
  const qs = new URLSearchParams({
    latitude: pts.map(p => p.lat).join(','),
    longitude: pts.map(p => p.lon).join(','),
    start_date: from, end_date: to,
    daily: 'precipitation_sum',
    timezone: 'auto'
  });

  const locs = await getJson(ARCHIVE + '?' + qs.toString());
  const list = Array.isArray(locs) ? locs : [locs];

  // Une journée compte si elle a plu quelque part sur le trajet, pas seulement
  // au départ : c'est justement l'écart d'un bout à l'autre qui nous intéresse.
  const days = list[0].daily.time;
  const rows = days.map((d, i) => ({
    date: d,
    max_mm: Math.max(...list.map(l => l.daily.precipitation_sum[i] || 0)),
    moy_mm: mean(list.map(l => l.daily.precipitation_sum[i] || 0))
  })).filter(r => r.max_mm >= 1).sort((a, b) => b.max_mm - a.max_mm);

  console.log('\nJournées avec au moins 1 mm sur le trajet, du %s au %s :\n', from, to);
  if (!rows.length) return console.log('  aucune.');

  const top = rows.slice(0, 15);
  const peaks = await peakHours(pts[Math.floor(pts.length / 2)], top.map(r => r.date));

  // console.log de Node ne connaît pas les largeurs à la printf : on aligne à la main.
  top.forEach(r => {
    const pk = peaks[r.date] || { hour: '--:--', mm: 0 };
    console.log('  ' + r.date + '   ' + r.max_mm.toFixed(1).padStart(5) + ' mm sur la journée' +
      '   pic à ' + pk.hour + ' (' + pk.mm.toFixed(1).padStart(4) + ' mm/h)');
  });

  // On propose la journée dont le pic est le plus franc : c'est elle qui donnera
  // un replay parlant, pas forcément celle qui totalise le plus sur 24 h.
  const best = top.slice().sort((a, b) =>
    ((peaks[b.date] || {}).mm || 0) - ((peaks[a.date] || {}).mm || 0))[0];
  const at = (peaks[best.date] || {}).hour;
  console.log('\nRejoue-la avec :  node tools/replay.js day ' + best.date +
    (at && at !== '--:--' ? ' --at ' + at : '') + '\n');
}

/**
 * Heure la plus arrosée de chaque journée, au point milieu du trajet.
 * Une journée à 30 mm ne dit rien si tout est tombé à 15 h : c'est l'heure qui
 * décide si le replay tombera sur de la pluie ou sur du sec.
 */
async function peakHours(pt, dates) {
  const sorted = dates.slice().sort();
  const d = await getJson(ARCHIVE + '?' + new URLSearchParams({
    latitude: pt.lat, longitude: pt.lon,
    start_date: sorted[0], end_date: sorted[sorted.length - 1],
    hourly: 'precipitation', timezone: 'auto'
  }));

  const want = new Set(dates);
  const out = {};
  (d.hourly.time || []).forEach((t, i) => {
    const day = t.slice(0, 10);
    if (!want.has(day)) return;
    const mm = d.hourly.precipitation[i] || 0;
    if (!out[day] || mm > out[day].mm) out[day] = { hour: t.slice(11, 16), mm: mm };
  });
  return out;
}

/* ---------- day : rejouer une journée ---------- */

/** Heure de passage de chaque point, ce jour-là, au format "YYYY-MM-DDTHH:MM". */
function passageTimes(trip, type, date, at) {
  const hhmm = at || (type === 'evening' ? trip.evening_time : trip.morning_time);
  const parts = String(hhmm).split(':');
  const dep = new Date(Date.UTC(
    +date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10),
    parseInt(parts[0], 10) || 0, parseInt(parts[1], 10) || 0
  ));

  return trip.routes[type].points.map(p => {
    const at = new Date(dep.getTime() + p.offset_min * 60000);
    const q = new Date(at.getTime());
    q.setUTCMinutes(Math.floor(q.getUTCMinutes() / 15) * 15);
    return {
      i: p.i, lat: p.lat, lon: p.lon, label: p.label,
      quarter: iso(q, true),
      hour: iso(new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate(), at.getUTCHours())), false)
    };
  });
}

function iso(d, withMinutes) {
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) +
    'T' + pad(d.getUTCHours()) + ':' + (withMinutes ? pad(d.getUTCMinutes()) : '00');
}

async function day(trip, date, type, fixturePath, at) {
  const pts = passageTimes(trip, type, date, at);
  const lat = pts.map(p => p.lat).join(',');
  const lon = pts.map(p => p.lon).join(',');

  // 1. la réalité (ERA5), au pas horaire
  const truth = asList(await getJson(ARCHIVE + '?' + new URLSearchParams({
    latitude: lat, longitude: lon, start_date: date, end_date: date,
    hourly: 'precipitation', timezone: 'auto'
  })));

  // 2. ce que chaque modèle avait prévu, au pas de 15 min
  const fc = asList(await getJson(HISTORY + '?' + new URLSearchParams({
    latitude: lat, longitude: lon, start_date: date, end_date: date,
    minutely_15: 'precipitation', hourly: 'precipitation_probability',
    models: MODELS.join(','), timezone: 'auto'
  })));

  const reel = pts.map((p, i) => {
    const h = truth[i].hourly;
    const k = h.time.indexOf(p.hour);
    return k >= 0 ? +(h.precipitation[k] || 0).toFixed(2) : null;   // mm/h mesurés
  });

  const prevu = {};
  MODELS.forEach(m => {
    prevu[m] = pts.map((p, i) => {
      const q = fc[i].minutely_15;
      const k = q.time.indexOf(p.quarter);
      const v = k >= 0 ? q['precipitation_' + m][k] : null;
      // Le cumul sur 15 min devient une intensité, comme dans l'app.
      return v === null || v === undefined ? null : +(v * 4).toFixed(2);
    });
  });

  report(date, type, pts, reel, prevu);

  if (fixturePath) {
    const out = {
      generated_at: new Date().toISOString(),
      source: 'open-meteo historical-forecast + archive ERA5',
      date, type, depart: pts[0].quarter.slice(11),
      trip: { home: trip.home.label, work: trip.work.label },
      points: pts.map((p, i) => ({
        i: p.i, label: p.label, lat: p.lat, lon: p.lon,
        time: p.quarter.slice(11),
        reel_mm_h: reel[i],
        prevu: Object.fromEntries(MODELS.map(m => [m, prevu[m][i]]))
      }))
    };
    fs.mkdirSync(path.dirname(fixturePath), { recursive: true });
    fs.writeFileSync(fixturePath, JSON.stringify(out, null, 2), 'utf8');
    console.log('Jeu d\'essai écrit dans %s\n', fixturePath);
  }
}

function asList(j) { return Array.isArray(j) ? j : [j]; }

function report(date, type, pts, reel, prevu) {
  console.log('\n%s · trajet du %s\n', date, type === 'evening' ? 'soir' : 'matin');

  const w = 13;
  const head = ['heure'.padEnd(7), 'réel'.padStart(7)]
    .concat(MODELS.map(m => m.replace('meteofrance_', 'mf_').slice(0, w).padStart(w)));
  console.log('  ' + head.join(' '));

  pts.forEach((p, i) => {
    const row = [p.quarter.slice(11).padEnd(7),
                 (reel[i] === null ? '—' : reel[i].toFixed(2)).padStart(7)]
      .concat(MODELS.map(m => (prevu[m][i] === null ? '—' : prevu[m][i].toFixed(2)).padStart(w)));
    console.log('  ' + row.join(' '));
  });

  // Score : écart moyen à la réalité, et biais (positif = le modèle en rajoute).
  console.log('\n  %s %s %s %s', 'modèle'.padEnd(30), 'écart moyen'.padStart(12),
    'biais'.padStart(9), 'verdict identique'.padStart(19));

  const pluie = v => v !== null && v >= 0.1;
  MODELS.forEach(m => {
    const pairs = prevu[m].map((v, i) => [v, reel[i]]).filter(([a, b]) => a !== null && b !== null);
    if (!pairs.length) return console.log('  %s  (aucune donnée)', m.padEnd(30));
    const err = mean(pairs.map(([a, b]) => Math.abs(a - b)));
    const bias = mean(pairs.map(([a, b]) => a - b));
    const same = pairs.filter(([a, b]) => pluie(a) === pluie(b)).length;
    console.log('  %s %s %s %s', m.padEnd(30),
      (err.toFixed(2) + ' mm/h').padStart(12),
      (bias >= 0 ? '+' : '') + bias.toFixed(2),
      (same + '/' + pairs.length).padStart(19));
  });

  console.log('\n  « écart moyen » = |prévu − réel| moyenné sur les points de passage.');
  console.log('  « verdict identique » = le modèle et la réalité s\'accordent sur pluie / pas pluie.');
  console.log('  ERA5 a une maille de ~25 km au pas horaire : elle donne un ordre de');
  console.log('  grandeur, pas le détail d\'une averse de quartier.\n');
}

/* ---------- ligne de commande ---------- */

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

async function main() {
  const cmd = process.argv[2];
  const trip = loadTrip();

  if (cmd === 'scan') {
    const to = arg('to', new Date().toISOString().slice(0, 10));
    const from = arg('from', new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10));
    return scan(trip, from, to);
  }

  if (cmd === 'day') {
    const date = process.argv[3];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('Donne une date : node tools/replay.js day 2026-07-16');
    const at = arg('at', null);
    if (at && !/^[0-9]{2}:[0-9]{2}$/.test(at)) throw new Error('--at attend une heure HH:MM');
    return day(trip, date, arg('type', 'morning'), arg('fixture', null), at);
  }

  console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^\/\*\*?/, ''));
}

main().catch(e => { console.error('\n' + (e.message || e) + '\n'); process.exit(1); });

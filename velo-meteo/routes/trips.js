/**
 * Configuration du trajet : adresses, horaires, itinéraires calculés.
 * Persisté dans /data via store.js.
 */
'use strict';

const express  = require('express');
const router   = express.Router();
const store    = require('./store');
const geo      = require('./geo');
const gpx      = require('./gpx');
const forecast = require('./forecast');

const HHMM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Pas de temps entre deux points de passage. `auto` garde les 8 points
 * d'origine. En dessous de 15 minutes, Open-Meteo renvoie le même créneau pour
 * plusieurs points : on gagne en finesse **spatiale**, pas temporelle.
 */
const STEPS = ['auto', 5, 10, 15, 30];

function cleanStep(v) {
  if (v === 'auto' || v === undefined || v === null || v === '') return 'auto';
  const n = parseInt(v, 10);
  return STEPS.indexOf(n) >= 0 ? n : 'auto';
}

function publicRoute(r) {
  return {
    distance_km: r.distance_km,
    duration_min: r.duration_min,
    points: (r.points || []).length,
    elevation_gain_m: r.elevation_gain_m === undefined ? null : r.elevation_gain_m
  };
}

function publicTrip(trip) {
  if (!trip) return null;
  return {
    home: trip.home,
    work: trip.work,
    morning_time: trip.morning_time,
    evening_time: trip.evening_time,
    updated_at: trip.updated_at,
    source: trip.source || 'osrm',
    gpx_name: trip.gpx_name || null,
    gpx_file: trip.gpx_file || null,
    step_min: trip.step_min || 'auto',
    routes: {
      morning: publicRoute(trip.routes.morning),
      evening: publicRoute(trip.routes.evening)
    }
  };
}

/** Rééchantillonne un trajet au pas demandé, sans rappeler le routeur. */
function applyStep(route, from, to, step) {
  const n = geo.pointsForStep(route.duration_min, step);
  if (n === (route.points || []).length) return route;
  return geo.resample(route, from, to, n) || route;
}

// GET /api/trip - configuration courante
router.get('/', (_req, res) => {
  const trip = store.getTrip();
  res.json({ configured: store.isConfigured(trip), trip: publicTrip(trip) });
});

/**
 * POST /api/trip - géocode les deux adresses puis calcule les deux itinéraires.
 * Opération lourde (3 appels externes) : elle n'a lieu qu'à l'enregistrement.
 */
router.post('/', async (req, res) => {
  const b = req.body || {};
  const morning_time = HHMM.test(b.morning_time) ? b.morning_time : '08:00';
  const evening_time = HHMM.test(b.evening_time) ? b.evening_time : '18:00';

  if (!String(b.home_address || '').trim() || !String(b.work_address || '').trim()) {
    return res.status(400).json({ error: 'Les deux adresses sont obligatoires.' });
  }

  try {
    const home = await geo.geocode(b.home_address);
    await sleep(1100); // Nominatim : 1 requête par seconde maximum
    const work = await geo.geocode(b.work_address);

    // Le pas de temps déjà choisi est conservé d'un recalcul à l'autre.
    const step = cleanStep((store.getTrip() || {}).step_min);
    let mRoute = await geo.buildRoute(home, work);
    let eRoute = await geo.buildRoute(work, home);
    mRoute = applyStep(mRoute, home, work, step);
    eRoute = applyStep(eRoute, work, home, step);

    const trip = store.setTrip({
      home, work, morning_time, evening_time,
      source: 'osrm',
      step_min: step,
      routes: { morning: mRoute, evening: eRoute },
      updated_at: new Date().toISOString()
    });
    forecast.invalidate();

    res.status(201).json({ configured: true, trip: publicTrip(trip) });
  } catch (e) {
    res.status(502).json({ error: e.message || String(e) });
  }
});

/**
 * POST /api/trip/gpx - importe une trace GPX comme itinéraire.
 *
 * Le corps est le fichier brut (pas de JSON : une trace fait facilement
 * plusieurs mégaoctets, l'encapsuler en chaîne JSON la gonfle pour rien).
 * Paramètres en query : `direction` (sens de la trace), `speed_kmh` (utilisée
 * seulement si la trace n'est pas horodatée), `morning_time`, `evening_time`.
 *
 * L'autre sens est le tracé parcouru à l'envers. Approximation assumée — sens
 * uniques et pistes cyclables diffèrent souvent au retour — mais préférable à
 * mélanger une trace vécue et un itinéraire calculé sur le même trajet.
 */
router.post('/gpx', express.text({ type: () => true, limit: '12mb' }), async (req, res) => {
  const q = req.query || {};
  const morning_time = HHMM.test(q.morning_time) ? q.morning_time : '08:00';
  const evening_time = HHMM.test(q.evening_time) ? q.evening_time : '18:00';
  const direction = q.direction === 'evening' ? 'evening' : 'morning';
  const speed = Math.min(45, Math.max(5, parseFloat(q.speed_kmh) || 18));
  // Le nom du fichier n'existe que côté navigateur : sans lui, l'app ne peut plus
  // dire quelle trace est en place une fois l'import terminé.
  const filename = String(q.filename || '').replace(/[\r\n\t]/g, ' ').trim().slice(0, 120) || null;

  let track;
  try {
    track = gpx.parse(req.body);
  } catch (e) {
    return res.status(400).json({ error: e.message || String(e) });
  }

  try {
    const coords = track.coords;
    const first = coords[0], last = coords[coords.length - 1];

    // Une trace horodatée porte sa propre durée ; sinon on la déduit de la
    // vitesse moyenne saisie par l'utilisateur.
    const timed = gpx.durationOf(track.times);
    const meters = geo.trackLength(coords);
    const duration = timed || (meters / (speed * 1000 / 3600));
    const gain = gpx.elevationGain(track.eles);

    // Le géocodage inverse nomme le départ et l'arrivée ; son échec ne doit pas
    // faire échouer l'import (Nominatim indisponible, trace en pleine campagne).
    const fallback = (c, name) => ({ query: c[0].toFixed(5) + ',' + c[1].toFixed(5), label: name, lat: c[0], lon: c[1] });
    let start, end;
    try {
      start = await geo.reverseGeocode(first[0], first[1]);
      await sleep(1100); // Nominatim : 1 requête par seconde maximum
      end = await geo.reverseGeocode(last[0], last[1]);
    } catch (_) {
      start = fallback(first, 'Départ de la trace');
      end = fallback(last, 'Arrivée de la trace');
    }

    const step = cleanStep((store.getTrip() || {}).step_min);
    const nFwd = geo.pointsForStep(Math.round(duration / 60), step);

    const reversed = coords.slice().reverse();
    const forward = geo.buildRouteFromTrack(coords, start, end, duration, nFwd);
    const backward = geo.buildRouteFromTrack(reversed, end, start, duration, nFwd);
    forward.elevation_gain_m = gain;
    backward.elevation_gain_m = gpx.elevationGain(track.eles.slice().reverse());

    // Quel que soit le sens de la trace, `routes.morning` va toujours du
    // domicile au travail : c'est ce que suppose tout le reste de l'app.
    const home = direction === 'morning' ? start : end;
    const work = direction === 'morning' ? end : start;

    const trip = store.setTrip({
      home, work, morning_time, evening_time,
      source: 'gpx',
      step_min: step,
      gpx_name: track.name || null,
      gpx_file: filename,
      routes: direction === 'morning'
        ? { morning: forward, evening: backward }
        : { morning: backward, evening: forward },
      updated_at: new Date().toISOString()
    });
    forecast.invalidate();

    res.status(201).json({
      configured: true,
      trip: publicTrip(trip),
      imported: {
        file: filename,
        points: coords.length,
        distance_km: +(meters / 1000).toFixed(1),
        duration_min: Math.round(duration / 60),
        elevation_gain_m: gain,
        timed: !!timed
      }
    });
  } catch (e) {
    res.status(502).json({ error: e.message || String(e) });
  }
});

/**
 * PUT /api/trip/step - change le pas de temps.
 *
 * Le trajet est rééchantillonné à partir du tracé déjà mémorisé : ni Nominatim
 * ni OSRM ne sont rappelés, l'opération est instantanée et n'use aucun quota.
 */
router.put('/step', (req, res) => {
  const trip = store.getTrip();
  if (!store.isConfigured(trip)) return res.status(404).json({ error: 'Aucun trajet configuré.' });

  const step = cleanStep((req.body || {}).step_min);
  const ends = { morning: [trip.home, trip.work], evening: [trip.work, trip.home] };

  const missing = ['morning', 'evening'].some(t => !Array.isArray(trip.routes[t].track_ll));
  if (missing) {
    return res.status(409).json({
      error: 'Ce trajet a été calculé par une version antérieure et ne mémorise pas son tracé. ' +
             'Réenregistre-le pour pouvoir changer le pas de temps.'
    });
  }

  ['morning', 'evening'].forEach(t => {
    trip.routes[t] = applyStep(trip.routes[t], ends[t][0], ends[t][1], step);
  });
  trip.step_min = step;
  trip.updated_at = new Date().toISOString();

  store.setTrip(trip);
  forecast.invalidate();
  res.json({ configured: true, trip: publicTrip(trip) });
});

/** PUT /api/trip/times - change les horaires sans recalculer l'itinéraire. */
router.put('/times', (req, res) => {
  const trip = store.getTrip();
  if (!store.isConfigured(trip)) return res.status(404).json({ error: 'Aucun trajet configuré.' });

  const b = req.body || {};
  if (HHMM.test(b.morning_time)) trip.morning_time = b.morning_time;
  if (HHMM.test(b.evening_time)) trip.evening_time = b.evening_time;
  trip.updated_at = new Date().toISOString();

  store.setTrip(trip);
  forecast.invalidate();
  res.json({ configured: true, trip: publicTrip(trip) });
});

// DELETE /api/trip - repasse en mode maquette
router.delete('/', (_req, res) => {
  store.clearTrip();
  forecast.invalidate();
  res.status(204).end();
});

module.exports = router;

/**
 * Configuration du trajet : adresses, horaires, itinéraires calculés.
 * Persisté dans /data via store.js.
 */
'use strict';

const router   = require('express').Router();
const store    = require('./store');
const geo      = require('./geo');
const forecast = require('./forecast');

const HHMM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function publicTrip(trip) {
  if (!trip) return null;
  return {
    home: trip.home,
    work: trip.work,
    morning_time: trip.morning_time,
    evening_time: trip.evening_time,
    updated_at: trip.updated_at,
    routes: {
      morning: { distance_km: trip.routes.morning.distance_km, duration_min: trip.routes.morning.duration_min },
      evening: { distance_km: trip.routes.evening.distance_km, duration_min: trip.routes.evening.duration_min }
    }
  };
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

    const [mRoute, eRoute] = [await geo.buildRoute(home, work), await geo.buildRoute(work, home)];

    const trip = store.setTrip({
      home, work, morning_time, evening_time,
      routes: { morning: mRoute, evening: eRoute },
      updated_at: new Date().toISOString()
    });
    forecast.invalidate();

    res.status(201).json({ configured: true, trip: publicTrip(trip) });
  } catch (e) {
    res.status(502).json({ error: e.message || String(e) });
  }
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

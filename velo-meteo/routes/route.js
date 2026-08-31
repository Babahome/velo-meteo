/** Tracé + points de passage. Trajet réel si configuré, sinon maquette. */
'use strict';
const router = require('express').Router();
const { TRIPS } = require('./mock-data');
const forecast  = require('./forecast');

// GET /api/route?type=morning|evening
router.get('/', async (req, res) => {
  const type = req.query.type === 'evening' ? 'evening' : 'morning';
  const { data, source, error } = await forecast.safeTripData(type, forecast.cleanShift(req.query.shift));

  if (data) return res.json(Object.assign({ source, error }, data.route));

  const t = TRIPS[type];
  res.json({
    source, error,
    id: t.id, type: t.type, name: t.name, departure: t.departure,
    duration_min: t.duration_min, distance_km: t.distance_km,
    points: t.points.map(p => ({ i: p.i, time: p.time, label: p.label, lat: p.lat, lon: p.lon, x: p.x, y: p.y })),
    track: null,
    track_ll: null,
    rain_cells: t.rain_cells
  });
});

module.exports = router;

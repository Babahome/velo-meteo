/** MOCK - trace + points GPS du trajet. V2 : OSRM / GraphHopper. */
'use strict';
const router = require('express').Router();
const { TRIPS } = require('./mock-data');

// GET /api/route?type=morning|evening
router.get('/', (req, res) => {
  const type = req.query.type === 'evening' ? 'evening' : 'morning';
  const t = TRIPS[type];
  res.json({
    id: t.id, type: t.type, name: t.name, departure: t.departure,
    duration_min: t.duration_min, distance_km: t.distance_km,
    points: t.points.map(p => ({ i: p.i, time: p.time, label: p.label, lat: p.lat, lon: p.lon, x: p.x, y: p.y })),
    rain_cells: t.rain_cells
  });
});

module.exports = router;

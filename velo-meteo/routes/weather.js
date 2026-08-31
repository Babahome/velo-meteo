/** Précipitations par point de passage. Open-Meteo si configuré, sinon maquette. */
'use strict';
const router = require('express').Router();
const { weatherOf } = require('./mock-data');
const forecast      = require('./forecast');

// GET /api/weather?type=morning|evening
router.get('/', async (req, res) => {
  const type = req.query.type === 'evening' ? 'evening' : 'morning';
  const { data, source, error } = await forecast.safeTripData(type, forecast.cleanShift(req.query.shift));
  const body = data ? data.weather : weatherOf(type);
  res.json(Object.assign({ source, error }, body));
});

module.exports = router;

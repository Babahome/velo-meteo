/** Vent du trajet. Open-Meteo si configuré, sinon maquette. */
'use strict';
const router = require('express').Router();
const { TRIPS } = require('./mock-data');
const forecast  = require('./forecast');

// GET /api/wind?type=morning|evening
router.get('/', async (req, res) => {
  const type = req.query.type === 'evening' ? 'evening' : 'morning';
  const { data, source, error } = await forecast.safeTripData(type, forecast.cleanShift(req.query.shift));
  const body = data ? data.wind : Object.assign({ type }, TRIPS[type].wind);
  res.json(Object.assign({ source, error }, body));
});

module.exports = router;

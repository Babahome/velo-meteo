/** MOCK - vent par trajet (force, direction, orientation relative). V2 : Open-Meteo. */
'use strict';
const router = require('express').Router();
const { TRIPS } = require('./mock-data');

// GET /api/wind?type=morning|evening
router.get('/', (req, res) => {
  const type = req.query.type === 'evening' ? 'evening' : 'morning';
  res.json(Object.assign({ type }, TRIPS[type].wind));
});

module.exports = router;

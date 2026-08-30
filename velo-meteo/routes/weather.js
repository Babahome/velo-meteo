/** MOCK - precipitations par point de passage. V2 : Open-Meteo. */
'use strict';
const router = require('express').Router();
const { TRIPS } = require('./mock-data');

// GET /api/weather?type=morning|evening
router.get('/', (req, res) => {
  const type = req.query.type === 'evening' ? 'evening' : 'morning';
  const t = TRIPS[type];
  const points = t.points.map(p => ({ i: p.i, time: p.time, label: p.label, mm: p.mm, prob: p.prob, temp: p.temp }));
  const total_mm = +points.reduce((s, p) => s + p.mm, 0).toFixed(1);
  const peak = points.reduce((a, b) => (b.mm > a.mm ? b : a), points[0]);
  res.json({
    type, points, total_mm,
    max_prob: Math.max(...points.map(p => p.prob)),
    peak: { time: peak.time, label: peak.label, mm: peak.mm, prob: peak.prob },
    temp_c: points[0].temp
  });
});

module.exports = router;

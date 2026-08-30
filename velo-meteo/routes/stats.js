/** Historique et créneaux de départ. */
'use strict';

const router = require('express').Router();
const { HISTORY, WINDOWS } = require('./mock-data');
const store    = require('./store');
const forecast = require('./forecast');

// GET /api/stats/history - encore mocké : l'historique réel arrivera avec
// l'enregistrement quotidien des trajets dans /data.
router.get('/history', (_req, res) => {
  const trajets = HISTORY.length * 2;
  const mouilles = HISTORY.reduce((s, d) => s + (d.morning === 'pluie' ? 1 : 0) + (d.evening === 'pluie' ? 1 : 0), 0);
  res.json({
    source: 'mock',
    days: HISTORY,
    summary: {
      trajets, mouilles, secs: trajets - mouilles,
      taux_sec: Math.round(((trajets - mouilles) / trajets) * 100),
      mm_total: +HISTORY.reduce((s, d) => s + d.mm, 0).toFixed(1),
      serie_seche: 4
    }
  });
});

// GET /api/stats/windows?type=morning|evening
router.get('/windows', async (req, res) => {
  const type = req.query.type === 'evening' ? 'evening' : 'morning';

  if (store.isConfigured(store.getTrip())) {
    try {
      const live = await forecast.getWindows(type, 15, 9);
      if (live) return res.json(Object.assign({ source: 'live', error: null }, live));
    } catch (e) {
      return res.json({ source: 'mock', error: e.message || String(e), type, windows: WINDOWS[type] });
    }
  }

  res.json({ source: 'mock', error: null, type, windows: WINDOWS[type] });
});

module.exports = router;

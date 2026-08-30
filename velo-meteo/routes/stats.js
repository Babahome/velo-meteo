/** MOCK - historique jours secs / mouilles. V2 : SQLite local. */
'use strict';
const router = require('express').Router();
const { HISTORY, WINDOWS } = require('./mock-data');

// GET /api/stats/history
router.get('/history', (_req, res) => {
  const trajets = HISTORY.length * 2;
  const mouilles = HISTORY.reduce((s, d) => s + (d.morning === 'pluie' ? 1 : 0) + (d.evening === 'pluie' ? 1 : 0), 0);
  res.json({
    days: HISTORY,
    summary: {
      trajets, mouilles, secs: trajets - mouilles,
      taux_sec: Math.round(((trajets - mouilles) / trajets) * 100),
      mm_total: +HISTORY.reduce((s, d) => s + d.mm, 0).toFixed(1),
      serie_seche: 4
    }
  });
});

// GET /api/stats/windows?type=morning|evening  -> creneaux de depart alternatifs
router.get('/windows', (req, res) => {
  const type = req.query.type === 'evening' ? 'evening' : 'morning';
  res.json({ type, windows: WINDOWS[type] });
});

module.exports = router;

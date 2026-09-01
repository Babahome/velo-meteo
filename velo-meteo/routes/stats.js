/** Historique et créneaux de départ. */
'use strict';

const router = require('express').Router();
const { HISTORY, WINDOWS } = require('./mock-data');
const store    = require('./store');
const forecast = require('./forecast');
const { demoContext } = require('./demo');

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

// GET /api/stats/windows?type=morning|evening&demo=1
router.get('/windows', async (req, res) => {
  const type = req.query.type === 'evening' ? 'evening' : 'morning';

  // Sur le jeu d'essai, l'averse traverse le secteur en une heure : les créneaux
  // se classent donc vraiment, au lieu d'afficher une liste figée.
  if (req.query.demo === '1') {
    const d = demoContext(type);
    const shift = forecast.cleanShift(req.query.shift);
    const w = forecast.demoWindows(d.route, d.hhmm, shift, 15, 9);
    return res.json({ source: 'demo', error: null, type, windows: w.windows, usual: w.usual });
  }

  if (store.isConfigured(store.getTrip())) {
    const replay = forecast.cleanReplay(req.query.replay);
    try {
      const live = await forecast.getWindows(type, 15, 9, replay);
      if (live) return res.json(Object.assign({ source: replay ? 'replay' : 'live', error: null }, live));
    } catch (e) {
      return res.json({ source: 'mock', error: e.message || String(e), type, windows: WINDOWS[type] });
    }
  }

  res.json({ source: 'mock', error: null, type, windows: WINDOWS[type] });
});

module.exports = router;

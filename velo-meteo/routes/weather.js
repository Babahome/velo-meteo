/** Précipitations par point de passage. Open-Meteo si configuré, sinon maquette. */
'use strict';
const router = require('express').Router();
const { weatherOf } = require('./mock-data');
const forecast      = require('./forecast');
const { demoContext } = require('./demo');

// GET /api/weather?type=morning|evening&demo=1
router.get('/', async (req, res) => {
  const type = req.query.type === 'evening' ? 'evening' : 'morning';
  const shift = forecast.cleanShift(req.query.shift);

  // L'averse simulée doit arroser le graphe, le profil et le verdict autant que
  // la carte : comparer un écran mouillé à des chiffres secs ne validerait rien.
  if (req.query.demo === '1') {
    const d = demoContext(type, forecast.cleanNow(req.query.now));
    return res.json(Object.assign({ source: 'demo', error: null },
      forecast.demoWeather(d.route, d.hhmm, shift, type)));
  }

  const { data, source, error } = await forecast.safeTripData(type, shift,
    forecast.cleanReplay(req.query.replay), forecast.cleanNow(req.query.now));
  const body = data ? data.weather : weatherOf(type);
  res.json(Object.assign({ source, error }, body));
});

module.exports = router;

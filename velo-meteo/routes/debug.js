/**
 * Mode debug : comparer plusieurs modèles Open-Meteo sur le même trajet et le
 * même créneau.
 *
 * Deux usages : voir tout de suite où les modèles divergent, même par temps
 * sec ; et constituer un historique en appelant la route avec `log=1` une fois
 * par jour, pour comparer plus tard aux relevés réels.
 *
 * Un seul appel Open-Meteo pour tous les modèles : le paramètre `models`
 * accepte une liste et suffixe les champs de la réponse.
 */
'use strict';

const fs     = require('fs');
const path   = require('path');
const router = require('express').Router();
const store  = require('./store');
const forecast = require('./forecast');
const history  = require('./history');

const LOG = path.join(process.env.DATA_PATH || '/data', 'models-log.ndjson');
const LOG_MAX = 2000;   // ~5 ans à un relevé par jour

// GET /api/debug/models?type=morning|evening&shift=…&log=1
router.get('/models', async (req, res) => {
  const type = req.query.type === 'evening' ? 'evening' : 'morning';
  const shift = forecast.cleanShift(req.query.shift);

  if (!store.isConfigured(store.getTrip())) {
    return res.status(404).json({ error: 'Aucun trajet configuré : rien à comparer.' });
  }

  try {
    const data = await forecast.compareModels(type, shift);
    if (req.query.log === '1') data.logged = append(data);
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message || String(e) });
  }
});

/**
 * GET /api/debug/showers?days=… — les averses passées du trajet.
 * De quoi rejouer une vraie journée de pluie en un clic, sans avoir à deviner
 * une date ni sortir la ligne de commande.
 */
router.get('/showers', async (req, res) => {
  const trip = store.getTrip();
  if (!store.isConfigured(trip)) {
    return res.status(404).json({ error: 'Aucun trajet configuré.' });
  }

  const days = Math.max(7, Math.min(365, parseInt(req.query.days, 10) || 120));
  // L'archive s'arrête quelques jours avant aujourd'hui : on garde une marge.
  const to = new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10);
  const from = new Date(Date.now() - (days + 6) * 864e5).toISOString().slice(0, 10);

  try {
    const list = await history.showers(trip.routes.morning.points, from, to, 8);
    res.json({ from, to, showers: list });
  } catch (e) {
    res.status(502).json({ error: e.message || String(e) });
  }
});

// GET /api/debug/log?limit=…
router.get('/log', (req, res) => {
  const limit = Math.max(1, Math.min(500, parseInt(req.query.limit, 10) || 50));
  let lines = [];
  try {
    lines = fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean).slice(-limit);
  } catch (_) { /* pas encore de relevé */ }
  res.json({ file: LOG, count: lines.length, entries: lines.map(safeParse).filter(Boolean) });
});

function safeParse(l) { try { return JSON.parse(l); } catch (_) { return null; } }

/**
 * Un relevé par ligne : le format se lit à la volée et se tronque par le début
 * sans relire tout le fichier de travers.
 */
function append(data) {
  const row = {
    at: new Date().toISOString(),
    for: data.at,
    type: data.type,
    models: data.models.map(m => ({
      name: m.name, total_mm: m.total_mm, max_rate: m.max_rate, max_prob: m.max_prob
    }))
  };

  try {
    fs.mkdirSync(path.dirname(LOG), { recursive: true });
    fs.appendFileSync(LOG, JSON.stringify(row) + '\n', 'utf8');

    const lines = fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean);
    if (lines.length > LOG_MAX) {
      fs.writeFileSync(LOG, lines.slice(-LOG_MAX).join('\n') + '\n', 'utf8');
    }
    return true;
  } catch (_) {
    return false;   // un relevé perdu ne doit pas casser la comparaison
  }
}

module.exports = router;

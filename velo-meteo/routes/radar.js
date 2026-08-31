/**
 * Nuages de précipitations affichés sur la carte.
 *
 * Source : **Open-Meteo**, pas une image radar.
 *
 * RainViewer, l'overlay envisagé au départ, plafonne ses tuiles au zoom 7 en
 * accès libre (au-delà, il renvoie une image « Zoom Level Not Supported »).
 * Une case de radar y couvre plus d'un kilomètre : sur une carte de vélotaf
 * cadrée à quelques kilomètres, ça donne un aplat uniforme, pas des nuages.
 * Et une image radar montre ce qui tombe *maintenant*, alors que tout le reste
 * de l'app parle de l'heure de passage — deux lectures contradictoires sur le
 * même écran.
 *
 * On échantillonne donc une grille de points autour du trajet et on demande à
 * Open-Meteo la pluie de chaque case **à l'heure où le vélo passe à côté**.
 * Le rendu (nuages flous) est fait côté navigateur, dans le calque SVG déjà
 * posé sur les tuiles.
 */
'use strict';

const router   = require('express').Router();
const store    = require('./store');
const forecast = require('./forecast');
const { TRIPS } = require('./mock-data');

// GET /api/radar?type=morning|evening&demo=1
router.get('/', async (req, res) => {
  const type = req.query.type === 'evening' ? 'evening' : 'morning';
  const demo = req.query.demo === '1';
  const shift = forecast.cleanShift(req.query.shift);

  // Le mode démo doit marcher aussi sans trajet configuré : c'est justement
  // là qu'on regarde le rendu avant d'avoir renseigné quoi que ce soit.
  if (demo) {
    const trip = store.getTrip();
    const configured = store.isConfigured(trip);
    const route = configured ? trip.routes[type] : TRIPS[type];
    const hhmm = configured
      ? (type === 'evening' ? trip.evening_time : trip.morning_time)
      : TRIPS[type].departure;
    // Le décalage vaut aussi pour l'averse simulée : sans ça, les horaires du
    // curseur mentiraient dès qu'on touche aux boutons ±10 min.
    const field = forecast.demoField(route, hhmm, shift);
    return res.json(Object.assign({ available: true, source: 'demo', error: null }, field));
  }

  try {
    const field = await forecast.getField(type, shift);
    if (!field) return res.json({ available: false, source: 'mock', error: null, cells: [] });
    res.json(Object.assign({ available: true, source: 'open-meteo', error: null }, field));
  } catch (e) {
    // Pas de champ de pluie n'est pas une erreur : la carte s'affiche sans.
    res.json({ available: false, source: 'open-meteo', error: e.message || String(e), cells: [] });
  }
});

module.exports = router;

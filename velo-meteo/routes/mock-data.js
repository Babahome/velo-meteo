/**
 * Jeu de données fictif, utilisé tant qu'aucun trajet n'est configuré.
 * Trajet fictif Paris : Nation -> Bourse, 7,8 km, 8 points de passage.
 *
 *  - rate : intensité de pluie au passage, en mm/h (échelle météo usuelle :
 *           < 1 bruine, 2,5 modérée, > 7,6 forte)
 *  - mm   : cumul réellement reçu sur la tranche de trajet que le point
 *           représente, calculé à partir de rate et de la durée
 *  - x/y  : coordonnées normalisées (0..1) pour la carte SVG
 */
'use strict';

const MORNING = {
  id: 'morning',
  type: 'morning',
  name: 'Maison → Bureau',
  departure: '08:00',
  duration_min: 26,
  distance_km: 7.8,
  points: [
    { i: 0, time: '08:00', label: 'Départ · Nation',   lat: 48.848, lon: 2.396, x: 0.10, y: 0.80, rate: 0.0,  prob: 15, temp: 12 },
    { i: 1, time: '08:04', label: 'Bd Voltaire',       lat: 48.855, lon: 2.383, x: 0.19, y: 0.72, rate: 0.6,  prob: 30, temp: 12 },
    { i: 2, time: '08:08', label: 'Père-Lachaise',     lat: 48.860, lon: 2.371, x: 0.30, y: 0.70, rate: 3.2,  prob: 55, temp: 12 },
    { i: 3, time: '08:12', label: 'République',        lat: 48.867, lon: 2.363, x: 0.38, y: 0.56, rate: 8.0,  prob: 85, temp: 11 },
    { i: 4, time: '08:16', label: 'Bd Saint-Martin',   lat: 48.869, lon: 2.354, x: 0.52, y: 0.50, rate: 11.0, prob: 90, temp: 11 },
    { i: 5, time: '08:20', label: 'Grands Boulevards', lat: 48.871, lon: 2.343, x: 0.62, y: 0.36, rate: 4.5,  prob: 60, temp: 11 },
    { i: 6, time: '08:23', label: 'Rue Montmartre',    lat: 48.869, lon: 2.340, x: 0.78, y: 0.33, rate: 1.0,  prob: 35, temp: 12 },
    { i: 7, time: '08:26', label: 'Arrivée · Bourse',  lat: 48.869, lon: 2.341, x: 0.90, y: 0.22, rate: 0.0,  prob: 20, temp: 12 }
  ],
  wind: { speed_kmh: 23, gust_kmh: 38, dir_deg: 315, dir_label: 'NO', relative: 'face' },
  rain_cells: [
    { x: 0.50, y: 0.50, r: 0.19, intensity: 0.85 },
    { x: 0.63, y: 0.36, r: 0.12, intensity: 0.45 },
    { x: 0.29, y: 0.70, r: 0.09, intensity: 0.25 }
  ]
};

const EVENING = {
  id: 'evening',
  type: 'evening',
  name: 'Bureau → Maison',
  departure: '18:00',
  duration_min: 28,
  distance_km: 7.8,
  points: [
    { i: 0, time: '18:00', label: 'Départ · Bourse',   lat: 48.869, lon: 2.341, x: 0.90, y: 0.22, rate: 0.0, prob: 10, temp: 16 },
    { i: 1, time: '18:04', label: 'Rue Montmartre',    lat: 48.869, lon: 2.340, x: 0.78, y: 0.33, rate: 0.0, prob: 10, temp: 16 },
    { i: 2, time: '18:08', label: 'Grands Boulevards', lat: 48.871, lon: 2.343, x: 0.62, y: 0.36, rate: 0.0, prob: 15, temp: 16 },
    { i: 3, time: '18:13', label: 'Bd Saint-Martin',   lat: 48.869, lon: 2.354, x: 0.52, y: 0.50, rate: 0.0, prob: 15, temp: 15 },
    { i: 4, time: '18:17', label: 'République',        lat: 48.867, lon: 2.363, x: 0.38, y: 0.56, rate: 0.3, prob: 20, temp: 15 },
    { i: 5, time: '18:21', label: 'Père-Lachaise',     lat: 48.860, lon: 2.371, x: 0.30, y: 0.70, rate: 0.0, prob: 20, temp: 15 },
    { i: 6, time: '18:25', label: 'Bd Voltaire',       lat: 48.855, lon: 2.383, x: 0.19, y: 0.72, rate: 0.0, prob: 15, temp: 15 },
    { i: 7, time: '18:28', label: 'Arrivée · Nation',  lat: 48.848, lon: 2.396, x: 0.10, y: 0.80, rate: 0.0, prob: 10, temp: 15 }
  ],
  wind: { speed_kmh: 31, gust_kmh: 52, dir_deg: 250, dir_label: 'OSO', relative: 'face' },
  rain_cells: []
};

const TRIPS = { morning: MORNING, evening: EVENING };

/** Cumul reçu sur la tranche de trajet représentée par un point. */
function sliceHours(trip) {
  return (trip.duration_min / Math.max(1, trip.points.length - 1)) / 60;
}

function weatherOf(type) {
  const t = TRIPS[type];
  const h = sliceHours(t);
  const points = t.points.map(p => ({
    i: p.i, time: p.time, label: p.label,
    rate: p.rate, mm: +(p.rate * h).toFixed(2), prob: p.prob, temp: p.temp
  }));
  const peak = points.reduce((a, b) => (b.rate > a.rate ? b : a), points[0]);
  return {
    type,
    points,
    total_mm: +points.reduce((s, p) => s + p.mm, 0).toFixed(1),
    max_rate: Math.max(...points.map(p => p.rate)),
    max_prob: Math.max(...points.map(p => p.prob)),
    peak: { time: peak.time, label: peak.label, rate: peak.rate, mm: peak.mm, prob: peak.prob },
    temp_c: points[0].temp
  };
}

/** Créneaux de départ alternatifs (page « Meilleur créneau »). */
const WINDOWS = {
  morning: [
    { time: '07:15', mm: 0.00, prob_max: 20, wind_kmh: 18, score: 71, verdict: 'sec' },
    { time: '07:30', mm: 0.05, prob_max: 30, wind_kmh: 19, score: 74, verdict: 'sec' },
    { time: '07:45', mm: 0.30, prob_max: 55, wind_kmh: 21, score: 58, verdict: 'risque' },
    { time: '08:00', mm: 1.75, prob_max: 90, wind_kmh: 23, score: 18, verdict: 'pluie', is_usual: true },
    { time: '08:15', mm: 1.30, prob_max: 85, wind_kmh: 24, score: 26, verdict: 'pluie' },
    { time: '08:30', mm: 0.50, prob_max: 60, wind_kmh: 25, score: 49, verdict: 'risque' },
    { time: '08:45', mm: 0.10, prob_max: 35, wind_kmh: 26, score: 91, verdict: 'sec' },
    { time: '09:00', mm: 0.00, prob_max: 20, wind_kmh: 27, score: 85, verdict: 'sec' }
  ],
  evening: [
    { time: '17:00', mm: 0.00, prob_max: 10, wind_kmh: 28, score: 86, verdict: 'sec' },
    { time: '17:30', mm: 0.00, prob_max: 15, wind_kmh: 30, score: 82, verdict: 'sec' },
    { time: '18:00', mm: 0.02, prob_max: 20, wind_kmh: 31, score: 78, verdict: 'sec', is_usual: true },
    { time: '18:30', mm: 0.00, prob_max: 15, wind_kmh: 29, score: 84, verdict: 'sec' },
    { time: '19:00', mm: 0.00, prob_max: 10, wind_kmh: 24, score: 94, verdict: 'sec' },
    { time: '19:30', mm: 0.00, prob_max: 10, wind_kmh: 20, score: 96, verdict: 'sec' }
  ]
};

/** Historique fictif : 21 derniers jours. */
const HISTORY = (() => {
  const pattern = [
    ['sec', 'sec'], ['sec', 'pluie'], ['sec', 'sec'], ['pluie', 'pluie'], ['sec', 'sec'],
    ['sec', 'sec'], ['sec', 'sec'], ['pluie', 'sec'], ['sec', 'sec'], ['sec', 'sec'],
    ['pluie', 'pluie'], ['sec', 'sec'], ['sec', 'sec'], ['sec', 'pluie'], ['sec', 'sec'],
    ['sec', 'sec'], ['pluie', 'sec'], ['sec', 'sec'], ['sec', 'sec'], ['sec', 'sec'],
    ['sec', 'pluie']
  ];
  const out = [];
  for (let d = pattern.length - 1; d >= 0; d--) {
    const date = new Date();
    date.setDate(date.getDate() - d);
    const [m, e] = pattern[pattern.length - 1 - d];
    out.push({
      date: date.toISOString().slice(0, 10),
      weekday: date.getDay(),
      morning: m,
      evening: e,
      mm: (m === 'pluie' ? 2.1 : 0) + (e === 'pluie' ? 1.6 : 0)
    });
  }
  return out;
})();

module.exports = { TRIPS, WINDOWS, HISTORY, weatherOf };

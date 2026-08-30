/* Vélo Météo - données de repli embarquées.
   L'app interroge d'abord l'API du serveur (/api/...). Si elle n'est pas
   joignable (ouverture du fichier hors add-on, coupure réseau), elle retombe
   sur ce jeu de données pour que la maquette reste consultable.
   Doit rester aligné sur routes/mock-data.js. */
(function (w) {
  'use strict';

  var MORNING = {
    id: 'morning', type: 'morning', name: 'Maison → Bureau',
    departure: '08:00', duration_min: 26, distance_km: 7.8,
    points: [
      { i: 0, time: '08:00', label: 'Départ · Nation', lat: 48.848, lon: 2.396, x: 0.10, y: 0.80, rate: 0.0, prob: 15, temp: 12 },
      { i: 1, time: '08:04', label: 'Bd Voltaire', lat: 48.855, lon: 2.383, x: 0.19, y: 0.72, rate: 0.6, prob: 30, temp: 12 },
      { i: 2, time: '08:08', label: 'Père-Lachaise', lat: 48.860, lon: 2.371, x: 0.30, y: 0.70, rate: 3.2, prob: 55, temp: 12 },
      { i: 3, time: '08:12', label: 'République', lat: 48.867, lon: 2.363, x: 0.38, y: 0.56, rate: 8.0, prob: 85, temp: 11 },
      { i: 4, time: '08:16', label: 'Bd Saint-Martin', lat: 48.869, lon: 2.354, x: 0.52, y: 0.50, rate: 11.0, prob: 90, temp: 11 },
      { i: 5, time: '08:20', label: 'Grands Boulevards', lat: 48.871, lon: 2.343, x: 0.62, y: 0.36, rate: 4.5, prob: 60, temp: 11 },
      { i: 6, time: '08:23', label: 'Rue Montmartre', lat: 48.869, lon: 2.340, x: 0.78, y: 0.33, rate: 1.0, prob: 35, temp: 12 },
      { i: 7, time: '08:26', label: 'Arrivée · Bourse', lat: 48.869, lon: 2.341, x: 0.90, y: 0.22, rate: 0.0, prob: 20, temp: 12 }
    ],
    wind: { speed_kmh: 23, gust_kmh: 38, dir_deg: 315, dir_label: 'NO', relative: 'face' },
    rain_cells: [
      { x: 0.50, y: 0.50, r: 0.19, intensity: 0.85 },
      { x: 0.63, y: 0.36, r: 0.12, intensity: 0.45 },
      { x: 0.29, y: 0.70, r: 0.09, intensity: 0.25 }
    ]
  };

  var EVENING = {
    id: 'evening', type: 'evening', name: 'Bureau → Maison',
    departure: '18:00', duration_min: 28, distance_km: 7.8,
    points: [
      { i: 0, time: '18:00', label: 'Départ · Bourse', lat: 48.869, lon: 2.341, x: 0.90, y: 0.22, rate: 0.0, prob: 10, temp: 16 },
      { i: 1, time: '18:04', label: 'Rue Montmartre', lat: 48.869, lon: 2.340, x: 0.78, y: 0.33, rate: 0.0, prob: 10, temp: 16 },
      { i: 2, time: '18:08', label: 'Grands Boulevards', lat: 48.871, lon: 2.343, x: 0.62, y: 0.36, rate: 0.0, prob: 15, temp: 16 },
      { i: 3, time: '18:13', label: 'Bd Saint-Martin', lat: 48.869, lon: 2.354, x: 0.52, y: 0.50, rate: 0.0, prob: 15, temp: 15 },
      { i: 4, time: '18:17', label: 'République', lat: 48.867, lon: 2.363, x: 0.38, y: 0.56, rate: 0.3, prob: 20, temp: 15 },
      { i: 5, time: '18:21', label: 'Père-Lachaise', lat: 48.860, lon: 2.371, x: 0.30, y: 0.70, rate: 0.0, prob: 20, temp: 15 },
      { i: 6, time: '18:25', label: 'Bd Voltaire', lat: 48.855, lon: 2.383, x: 0.19, y: 0.72, rate: 0.0, prob: 15, temp: 15 },
      { i: 7, time: '18:28', label: 'Arrivée · Nation', lat: 48.848, lon: 2.396, x: 0.10, y: 0.80, rate: 0.0, prob: 10, temp: 15 }
    ],
    wind: { speed_kmh: 31, gust_kmh: 52, dir_deg: 250, dir_label: 'OSO', relative: 'face' },
    rain_cells: []
  };

  var WINDOWS = {
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

  var PATTERN = [
    ['sec', 'sec'], ['sec', 'pluie'], ['sec', 'sec'], ['pluie', 'pluie'], ['sec', 'sec'],
    ['sec', 'sec'], ['sec', 'sec'], ['pluie', 'sec'], ['sec', 'sec'], ['sec', 'sec'],
    ['pluie', 'pluie'], ['sec', 'sec'], ['sec', 'sec'], ['sec', 'pluie'], ['sec', 'sec'],
    ['sec', 'sec'], ['pluie', 'sec'], ['sec', 'sec'], ['sec', 'sec'], ['sec', 'sec'],
    ['sec', 'pluie']
  ];

  function buildHistory() {
    var out = [];
    for (var d = PATTERN.length - 1; d >= 0; d--) {
      var date = new Date();
      date.setDate(date.getDate() - d);
      var p = PATTERN[PATTERN.length - 1 - d];
      out.push({
        date: date.toISOString().slice(0, 10),
        weekday: date.getDay(),
        morning: p[0], evening: p[1],
        mm: (p[0] === 'pluie' ? 2.1 : 0) + (p[1] === 'pluie' ? 1.6 : 0)
      });
    }
    return out;
  }

  var TRIPS = { morning: MORNING, evening: EVENING };

  function weatherOf(type) {
    var t = TRIPS[type];
    var h = (t.duration_min / Math.max(1, t.points.length - 1)) / 60;
    var pts = t.points.map(function (p) {
      return {
        i: p.i, time: p.time, label: p.label, rate: p.rate,
        mm: +(p.rate * h).toFixed(2), prob: p.prob, temp: p.temp
      };
    });
    var total = 0, peak = pts[0], maxProb = 0, maxRate = 0;
    pts.forEach(function (p) {
      total += p.mm;
      if (p.rate > peak.rate) peak = p;
      if (p.prob > maxProb) maxProb = p.prob;
      if (p.rate > maxRate) maxRate = p.rate;
    });
    return {
      type: type, points: pts, total_mm: Math.round(total * 10) / 10,
      max_rate: maxRate, max_prob: maxProb,
      peak: { time: peak.time, label: peak.label, rate: peak.rate, mm: peak.mm, prob: peak.prob },
      temp_c: pts[0].temp
    };
  }

  function statsHistory() {
    var days = buildHistory();
    var trajets = days.length * 2;
    var mouilles = 0, mm = 0;
    days.forEach(function (d) {
      if (d.morning === 'pluie') mouilles++;
      if (d.evening === 'pluie') mouilles++;
      mm += d.mm;
    });
    return {
      days: days,
      summary: {
        trajets: trajets, mouilles: mouilles, secs: trajets - mouilles,
        taux_sec: Math.round(((trajets - mouilles) / trajets) * 100),
        mm_total: Math.round(mm * 10) / 10,
        serie_seche: 4
      }
    };
  }

  w.VM_MOCK = {
    route: function (type) { return TRIPS[type]; },
    weather: weatherOf,
    wind: function (type) { return TRIPS[type].wind; },
    windows: function (type) { return { type: type, windows: WINDOWS[type] }; },
    history: statsHistory,
    trip: { configured: false, trip: null },
    options: {
      home_address: '1 rue de la Paix, 75002 Paris',
      work_address: '10 place de la Bourse, 75002 Paris',
      morning_departure_time: '08:00',
      evening_departure_time: '18:00',
      rain_alert_threshold_mm: 0.5,
      notify_service: ''
    }
  };
})(window);

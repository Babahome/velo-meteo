/* Vélo Météo - briques d'affichage (aucune dépendance externe).
   Les graphes et la carte sont du SVG écrit à la main : en V2 ils seront
   remplacés par Recharts / MapLibre sans changer le layout des pages. */
(function (w) {
  'use strict';

  /* ---------- utilitaires ---------- */

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /** Palier d'intensité (0 à 4) selon les mm de pluie prévus. */
  function rainTier(mm) {
    if (mm <= 0.05) return 0;
    if (mm < 0.4) return 1;
    if (mm < 1.0) return 2;
    if (mm < 2.0) return 3;
    return 4;
  }

  /** Couleur d'un segment selon les mm de pluie prévus. */
  function rainColor(mm) {
    return 'var(--rain-' + rainTier(mm) + ')';
  }

  /**
   * Verdict global du trajet.
   * Règle de la maquette : un point > 50 % de proba => pluie probable ;
   * entre 30 et 50 % => risque ; sinon RAS.
   */
  function verdictOf(weather, seuilMm) {
    var seuil = typeof seuilMm === 'number' ? seuilMm : 0.5;
    var p = weather.max_prob;
    if (p > 50 && weather.total_mm >= seuil) {
      return { key: 'pluie', icon: '☔', title: 'Pluie probable' };
    }
    if (p > 30) {
      return { key: 'risque', icon: '🌦️', title: 'Risque d’averse' };
    }
    return { key: 'sec', icon: '☀️', title: 'RAS' };
  }

  function verdictSub(weather, v) {
    if (v.key === 'sec') return 'Aucune précipitation attendue sur le trajet.';
    return weather.peak.mm.toFixed(1).replace('.', ',') + ' mm vers ' + weather.peak.time +
      ' · ' + weather.peak.label + ' (' + weather.peak.prob + ' %)';
  }

  /* ---------- bloc verdict ---------- */

  function verdictCard(weather, v, compact) {
    return '' +
      '<section class="verdict ' + v.key + (compact ? ' compact' : '') + '">' +
        '<div class="verdict-head">' +
          '<div class="verdict-ico">' + v.icon + '</div>' +
          '<div class="verdict-txt">' +
            '<h2>' + esc(v.title) + '</h2>' +
            '<div class="verdict-sub">' + esc(verdictSub(weather, v)) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="verdict-stats">' +
          '<div class="stat"><b>' + weather.total_mm.toFixed(1).replace('.', ',') + '</b><span>mm cumul</span></div>' +
          '<div class="stat"><b>' + weather.max_prob + ' %</b><span>proba max</span></div>' +
          '<div class="stat"><b>' + weather.temp_c + '°</b><span>ressenti</span></div>' +
        '</div>' +
      '</section>';
  }

  /* ---------- bande "profil de pluie" ---------- */
  /* Lecture en une seconde : le trajet de gauche à droite, un bloc par point. */

  function profileStrip(route, weather) {
    var segs = weather.points.map(function (p) {
      return '<div class="seg t' + rainTier(p.mm) + '" style="background:' + rainColor(p.mm) + '">' +
        '<span class="lbl">' + (p.mm > 0 ? p.mm.toFixed(1).replace('.', ',') : '·') + '</span></div>';
    }).join('');

    var first = weather.points[0], last = weather.points[weather.points.length - 1];
    var peakTxt = weather.total_mm > 0
      ? 'Le plus arrosé : <b>' + esc(weather.peak.label) + '</b> vers ' + weather.peak.time
      : 'Trajet sec de bout en bout.';

    return '' +
      '<section class="card card-pad">' +
        '<div class="card-title">Profil de pluie · ' + esc(route.name) + '</div>' +
        '<div class="profile">' + segs + '</div>' +
        '<div class="profile-axis"><span>' + first.time + ' départ</span><span>' + last.time + ' arrivée</span></div>' +
        '<div class="profile-peak"><span class="dot"></span><span>' + peakTxt + '</span></div>' +
      '</section>';
  }

  /* ---------- bandeau vent ---------- */

  function windCard(wind) {
    var rel = wind.relative;
    var label = rel === 'face' ? 'Vent de face' : rel === 'dos' ? 'Vent dans le dos' : 'Vent de travers';
    var arrow = rel === 'face' ? '⬇' : rel === 'dos' ? '⬆' : '➡';
    var conseil = rel === 'face'
      ? (wind.speed_kmh >= 25 ? 'Prévois large : +5 min environ.' : 'Ça freinera un peu au retour.')
      : rel === 'dos' ? 'Tu devrais gagner quelques minutes.' : 'Attention aux rafales latérales.';
    return '' +
      '<section class="card wind">' +
        '<div class="wind-arrow">' + arrow + '</div>' +
        '<div>' +
          '<div class="wind-main">' + esc(label) + ' · ' + wind.speed_kmh + ' km/h ' +
            '<span class="badge ' + rel + '">' + esc(rel) + '</span></div>' +
          '<div class="wind-sub">Rafales ' + wind.gust_kmh + ' km/h · secteur ' + esc(wind.dir_label) + ' — ' + esc(conseil) + '</div>' +
        '</div>' +
      '</section>';
  }

  /* ---------- graphe mm + % ---------- */

  function rainChart(weather) {
    var W = 340, H = 156, L = 28, R = 30, T = 12, B = 30;
    var pw = W - L - R, ph = H - T - B;
    var pts = weather.points;
    var maxMm = Math.max(1, Math.ceil(Math.max.apply(null, pts.map(function (p) { return p.mm; }))));
    var step = pw / pts.length;
    var bw = Math.min(22, step * 0.56);

    var grid = '', bars = '', line = '', dots = '', xlab = '';
    [0, 0.5, 1].forEach(function (f) {
      var y = T + ph - f * ph;
      grid += '<line x1="' + L + '" y1="' + y.toFixed(1) + '" x2="' + (W - R) + '" y2="' + y.toFixed(1) +
        '" stroke="var(--line)" stroke-width="1"/>' +
        '<text x="' + (L - 5) + '" y="' + (y + 3.5).toFixed(1) + '" text-anchor="end" font-size="9" fill="var(--text-dim)">' +
        (f * maxMm).toFixed(f === 0 ? 0 : 1) + '</text>' +
        '<text x="' + (W - R + 5) + '" y="' + (y + 3.5).toFixed(1) + '" font-size="9" fill="var(--text-dim)">' +
        Math.round(f * 100) + '</text>';
    });

    pts.forEach(function (p, i) {
      var cx = L + step * i + step / 2;
      var h = (p.mm / maxMm) * ph;
      bars += '<rect x="' + (cx - bw / 2).toFixed(1) + '" y="' + (T + ph - h).toFixed(1) +
        '" width="' + bw.toFixed(1) + '" height="' + Math.max(h, 1.5).toFixed(1) +
        '" rx="3" fill="' + rainColor(p.mm) + '"/>';
      var py = T + ph - (p.prob / 100) * ph;
      line += (i === 0 ? 'M' : 'L') + cx.toFixed(1) + ' ' + py.toFixed(1) + ' ';
      dots += '<circle cx="' + cx.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="2.6" fill="var(--accent)"/>';
      if (i % 2 === 0) {
        xlab += '<text x="' + cx.toFixed(1) + '" y="' + (H - 10) + '" text-anchor="middle" font-size="9" fill="var(--text-dim)">' +
          p.time + '</text>';
      }
    });

    return '' +
      '<section class="card">' +
        '<div class="card-pad" style="padding-bottom:0"><div class="card-title">Pluie par point de passage</div></div>' +
        '<div class="chartbox">' +
          '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Pluie en mm et probabilité par point">' +
            grid + bars +
            '<path d="' + line.trim() + '" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
            dots + xlab +
          '</svg>' +
        '</div>' +
        '<div class="legend">' +
          '<span><i style="background:var(--rain-3)"></i>mm de pluie</span>' +
          '<span><i style="background:var(--accent);border-radius:99px"></i>probabilité (%)</span>' +
        '</div>' +
      '</section>';
  }

  /* ---------- carte radar (simulée) ---------- */

  function radarMap(route) {
    var W = 340, H = 210;
    var grid = '';
    for (var gx = 0; gx <= W; gx += 34) grid += '<line x1="' + gx + '" y1="0" x2="' + gx + '" y2="' + H + '" stroke="var(--line)" stroke-width="0.5"/>';
    for (var gy = 0; gy <= H; gy += 34) grid += '<line x1="0" y1="' + gy + '" x2="' + W + '" y2="' + gy + '" stroke="var(--line)" stroke-width="0.5"/>';

    var cells = (route.rain_cells || []).map(function (c, i) {
      return '<circle cx="' + (c.x * W).toFixed(1) + '" cy="' + (c.y * H).toFixed(1) +
        '" r="' + (c.r * W).toFixed(1) + '" fill="url(#cell' + i + ')"/>';
    }).join('');

    var defs = (route.rain_cells || []).map(function (c, i) {
      return '<radialGradient id="cell' + i + '">' +
        '<stop offset="0%" stop-color="var(--rain-4)" stop-opacity="' + (c.intensity * 0.85).toFixed(2) + '"/>' +
        '<stop offset="60%" stop-color="var(--rain-2)" stop-opacity="' + (c.intensity * 0.45).toFixed(2) + '"/>' +
        '<stop offset="100%" stop-color="var(--rain-1)" stop-opacity="0"/>' +
      '</radialGradient>';
    }).join('');

    var d = route.points.map(function (p, i) {
      return (i === 0 ? 'M' : 'L') + (p.x * W).toFixed(1) + ' ' + (p.y * H).toFixed(1);
    }).join(' ');

    var a = route.points[0], b = route.points[route.points.length - 1];

    return '' +
      '<section class="card mapwrap">' +
        '<svg class="map" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Carte du trajet et cellules de pluie">' +
          '<defs>' + defs + '</defs>' +
          '<rect width="' + W + '" height="' + H + '" fill="var(--surface-2)"/>' + grid + cells +
          '<path d="' + d + '" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>' +
          '<path d="' + d + '" fill="none" stroke="var(--accent)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>' +
          '<circle cx="' + (a.x * W).toFixed(1) + '" cy="' + (a.y * H).toFixed(1) + '" r="7" fill="var(--surface)" stroke="var(--accent)" stroke-width="3"/>' +
          '<circle cx="' + (b.x * W).toFixed(1) + '" cy="' + (b.y * H).toFixed(1) + '" r="7" fill="var(--accent)" stroke="var(--surface)" stroke-width="3"/>' +
        '</svg>' +
        '<div class="maplabel">Carte simulée · MapLibre + RainViewer en V2</div>' +
      '</section>';
  }

  /* ---------- carte résumé du trajet ---------- */

  function routeSummary(route) {
    return '' +
      '<section class="card row" style="border-bottom:0">' +
        '<div>' +
          '<div style="font-weight:700">' + esc(route.name) + '</div>' +
          '<div class="small muted">Départ habituel ' + route.departure + '</div>' +
        '</div>' +
        '<div class="v">' + route.distance_km.toFixed(1).replace('.', ',') + ' km · ' + route.duration_min + ' min</div>' +
      '</section>';
  }

  w.VM_UI = {
    esc: esc, rainColor: rainColor, verdictOf: verdictOf,
    verdictCard: verdictCard, profileStrip: profileStrip, windCard: windCard,
    rainChart: rainChart, radarMap: radarMap, routeSummary: routeSummary
  };
})(window);

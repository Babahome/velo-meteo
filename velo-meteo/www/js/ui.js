/* Vélo Météo - briques d'affichage (aucune dépendance externe).
   Les graphes et la carte sont du SVG écrit à la main : en V2 ils seront
   remplacés par Recharts / MapLibre sans changer le layout des pages. */
(function (w, d) {
  'use strict';

  /* ---------- utilitaires ---------- */

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /**
   * Palier d'intensité (0 à 4) à partir du taux de pluie en mm/h, sur
   * l'échelle météo usuelle : bruine < 1, modérée à 2,5, forte au-delà de 7,6.
   */
  function rainTier(rate) {
    if (rate < 0.1) return 0;
    if (rate < 1.0) return 1;
    if (rate < 2.5) return 2;
    if (rate < 7.6) return 3;
    return 4;
  }

  function rainColor(rate) {
    return 'var(--rain-' + rainTier(rate) + ')';
  }

  function num(v, d) {
    return Number(v).toFixed(d === undefined ? 1 : d).replace('.', ',');
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
    return num(weather.peak.rate) + ' mm/h vers ' + weather.peak.time +
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
          '<div class="stat"><b>' + num(weather.total_mm) + '</b><span>cumul mm</span></div>' +
          '<div class="stat"><b>' + weather.max_prob + ' %</b><span>proba max</span></div>' +
          '<div class="stat"><b>' + (weather.temp_c === null ? '—' : weather.temp_c + '°') + '</b><span>ressenti</span></div>' +
        '</div>' +
      '</section>';
  }

  /* ---------- bande "profil de pluie" ---------- */
  /* Lecture en une seconde : le trajet de gauche à droite, un bloc par point. */

  function profileStrip(route, weather) {
    var segs = weather.points.map(function (p) {
      return '<div class="seg t' + rainTier(p.rate) + '" style="background:' + rainColor(p.rate) + '" ' +
        'title="' + esc(p.label) + ' · ' + p.time + '">' +
        '<span class="lbl">' + (p.rate >= 0.1 ? num(p.rate) : '·') + '</span></div>';
    }).join('');

    var first = weather.points[0], last = weather.points[weather.points.length - 1];
    var peakTxt = weather.max_rate >= 0.1
      ? 'Le plus arrosé : <b>' + esc(weather.peak.label) + '</b> vers ' + weather.peak.time
      : 'Trajet sec de bout en bout.';

    return '' +
      '<section class="card card-pad">' +
        '<div class="card-title">Profil de pluie · ' + esc(route.name) + '</div>' +
        '<div class="profile">' + segs + '</div>' +
        '<div class="profile-axis"><span>' + first.time + ' départ</span><span>intensité mm/h</span><span>' + last.time + ' arrivée</span></div>' +
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

  /**
   * Géométrie du graphe, sortie en constantes : le curseur sous la carte doit
   * s'aligner au pixel sur les colonnes, et le CSS a besoin des mêmes nombres.
   */
  var CHART = { W: 340, H: 158, L: 28, R: 30 };

  /** Fraction de la largeur utile où se trouve le centre de la colonne `i`. */
  function chartCentre(i, n) {
    var step = (CHART.W - CHART.L - CHART.R) / n;
    return (CHART.L + step * i + step / 2) / CHART.W;
  }

  /**
   * Contenu du graphe, hors coquille. Isolé parce que la synchronisation le
   * réécrit à chaque déplacement du curseur : remplacer le `<svg>` lui-même
   * détruirait le nœud en cours de glissement, donc la capture du pointeur.
   */
  function chartInner(weather) {
    // T laisse la place aux valeurs ecrites au-dessus des barres.
    var W = CHART.W, H = CHART.H, L = CHART.L, R = CHART.R, T = 22, B = 30;
    var pw = W - L - R, ph = H - T - B;
    var pts = weather.points;
    var maxMm = Math.max(1, Math.ceil(Math.max.apply(null, pts.map(function (p) { return p.rate; }))));
    var step = pw / pts.length;
    var bw = Math.min(22, step * 0.56);

    var grid = '', bars = '', line = '', dots = '', xlab = '', hits = '', band = '';

    // Colonne du point choisi au curseur : le graphe doit dire la même chose que
    // la carte, sinon les deux se lisent séparément au lieu de se répondre.
    var active = overviewOn ? -1 : frame;

    // Un pas de temps fin peut monter à 16 colonnes : les étiquettes ne tiennent
    // plus toutes. On les espace, en gardant toujours celle du point choisi.
    var valueEvery = pts.length > 12 ? 2 : 1;
    var timeEvery  = Math.max(1, Math.ceil(pts.length / 6));
    var valueSize  = pts.length > 10 ? 9 : 10;
    [0, 0.5, 1].forEach(function (f) {
      var y = T + ph - f * ph;
      grid += '<line x1="' + L + '" y1="' + y.toFixed(1) + '" x2="' + (W - R) + '" y2="' + y.toFixed(1) +
        '" stroke="var(--line)" stroke-width="1"/>' +
        '<text x="' + (L - 5) + '" y="' + (y + 3.5).toFixed(1) + '" text-anchor="end" font-size="9" fill="var(--text-dim)">' +
        (f === 0 ? '0' : num(f * maxMm)) + '</text>' +
        '<text x="' + (W - R + 5) + '" y="' + (y + 3.5).toFixed(1) + '" font-size="9" fill="var(--text-dim)">' +
        Math.round(f * 100) + '</text>';
    });

    pts.forEach(function (p, i) {
      var cx = L + step * i + step / 2;
      var h = (p.rate / maxMm) * ph;
      var on = i === active;

      if (on) {
        band = '<rect x="' + (cx - step / 2).toFixed(1) + '" y="' + T + '" width="' + step.toFixed(1) +
          '" height="' + ph + '" rx="4" fill="var(--accent)" opacity=".12"/>';
      }

      bars += '<rect x="' + (cx - bw / 2).toFixed(1) + '" y="' + (T + ph - h).toFixed(1) +
        '" width="' + bw.toFixed(1) + '" height="' + Math.max(h, 1.5).toFixed(1) +
        '" rx="3" fill="' + rainColor(p.rate) + '"' +
        (on ? ' stroke="var(--accent)" stroke-width="2"' : '') + '/>';

      // L'intensité écrite au-dessus de la barre : sans elle, une barre courte
      // ne dit pas si on parle de bruine ou d'averse.
      if (p.rate >= 0.05 && (on || i % valueEvery === 0)) {
        bars += '<text x="' + cx.toFixed(1) + '" y="' + (T + ph - h - 4).toFixed(1) +
          '" text-anchor="middle" font-size="' + valueSize + '" font-weight="700" fill="var(--text)">' +
          num(p.rate) + '</text>';
      }

      var py = T + ph - (p.prob / 100) * ph;
      line += (i === 0 ? 'M' : 'L') + cx.toFixed(1) + ' ' + py.toFixed(1) + ' ';
      dots += '<circle cx="' + cx.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="' + (on ? 4.6 : 2.6) +
        '" fill="var(--accent)"' + (on ? ' stroke="var(--surface)" stroke-width="2"' : '') + '/>';

      // L'heure du point choisi est toujours écrite, les autres espacées.
      if (i % timeEvery === 0 || on) {
        xlab += '<text x="' + cx.toFixed(1) + '" y="' + (H - 10) + '" text-anchor="middle" font-size="9" ' +
          'font-weight="' + (on ? '700' : '400') + '" fill="var(--' + (on ? 'text' : 'text-dim') + ')">' +
          p.time + '</text>';
      }

      // Poignée du curseur, posée sur la colonne choisie : le graphe se
      // manipule directement, sans passer par le curseur du dessous.
      if (on) {
        hits = '<line x1="' + cx.toFixed(1) + '" y1="' + (T - 8) + '" x2="' + cx.toFixed(1) + '" y2="' + (T + ph) +
            '" stroke="var(--accent)" stroke-width="1.5" opacity=".55"/>' +
          '<circle cx="' + cx.toFixed(1) + '" cy="' + (T - 12) + '" r="6" ' +
            'fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/>';
      }
    });

    // La poignée passe **sous** les barres et leurs valeurs : posée par-dessus,
    // son trait vertical barrait le chiffre de la colonne choisie.
    return band + hits + grid + bars +
      '<path d="' + line.trim() + '" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      dots + xlab;
  }

  function rainChart(weather, standalone) {
    var open = standalone ? '<section class="card">' : '<div class="chartpane" data-chart>';
    var close = standalone ? '</section>' : '</div>';

    return open +
        '<div class="chartbox">' +
          '<svg class="chart" viewBox="0 0 ' + CHART.W + ' ' + CHART.H + '" ' +
            'data-n="' + weather.points.length + '" ' +
            'role="img" aria-label="Pluie en mm et probabilité par point">' +
            chartInner(weather) +
          '</svg>' +
        '</div>' +
        '<div class="legend">' +
          '<span><i style="background:var(--rain-3)"></i>intensité (mm/h)</span>' +
          '<span><i style="background:var(--accent);border-radius:99px"></i>probabilité (%)</span>' +
        '</div>' +
      close;
  }

  /** Le graphe seul, sans la coquille de carte : layout C, en accordéon. */
  function rainChartCard(weather) { return rainChart(weather, true); }

  /* ---------- carte : fond de tuiles + tracé ---------- */
  /* Carte déplaçable et zoomable, sans bibliothèque carto. Leaflet ou MapLibre
     auraient imposé d'embarquer 45 à 200 ko dans l'image Docker et de refaire
     tout le calque (tracé, nuages, curseur) dans leur système de coordonnées.
     Le déplacement et le zoom tiennent ici en ~120 lignes et réutilisent la
     projection déjà en place. */

  /**
   * Fonds disponibles. Les tuiles IGN passent par la Géoplateforme, **sans clé
   * d'API** et dans la même grille Web Mercator que l'OSM (TILEMATRIXSET=PM) :
   * elles se substituent à l'URL, rien d'autre à changer. Licence Ouverte
   * Etalab, mention obligatoire. Le Scan 25 (carte de rando) n'est pas dans
   * l'accès libre, il répond 400.
   */
  var IGN = 'https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile' +
            '&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';

  var BASEMAPS = {
    osm: {
      name: 'OpenStreetMap',
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      credit: '© OpenStreetMap', maxZoom: 19, invertible: true
    },
    ign: {
      name: 'Plan IGN',
      url: IGN + '&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&FORMAT=image/png',
      credit: '© IGN — Géoplateforme', maxZoom: 19, invertible: true
    },
    photo: {
      name: 'Photo aérienne',
      url: IGN + '&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&FORMAT=image/jpeg',
      // Inverser une photo aérienne en thème sombre donnerait un négatif.
      credit: '© IGN — Géoplateforme', maxZoom: 19, invertible: false
    }
  };

  /**
   * Icônes des trois repères de la carte. Par défaut 🏠 / 🏢 / 🚴 : trois formes
   * franchement différentes, là où les pastilles colorées d'avant ne se
   * distinguaient que par leur remplissage — illisible à côté l'une de l'autre.
   */
  var MARKER_SETS = {
    start:  ['🏠', '🚩', '🟢', '🚴', '📍'],
    end:    ['🏢', '🏁', '🔴', '🎯', '📍'],
    cursor: ['🚴', '🔵', '⏱️', '👤', '📍']
  };

  var markers = { start: '🏠', end: '🏢', cursor: '🚴' };

  function setMarkers(m) {
    ['start', 'end', 'cursor'].forEach(function (k) {
      if (m && m[k] && MARKER_SETS[k].indexOf(m[k]) >= 0) markers[k] = m[k];
    });
  }
  function markerSets() { return MARKER_SETS; }
  function markerFor(role) { return markers[role]; }

  /** Cap de a vers b, en degrés depuis le nord. */
  function bearingDeg(a, b) {
    var rad = Math.PI / 180;
    var dLon = (b[1] - a[1]) * rad;
    var y = Math.sin(dLon) * Math.cos(b[0] * rad);
    var x = Math.cos(a[0] * rad) * Math.sin(b[0] * rad) -
            Math.sin(a[0] * rad) * Math.cos(b[0] * rad) * Math.cos(dLon);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  /**
   * Cap au point `i`, pris entre le point précédent et le suivant plutôt qu'entre
   * deux points consécutifs : la moyenne lisse les zigzags du tracé, qui feraient
   * autrement tourner le repère à chaque virage de rue.
   */
  function headingAt(pts, i) {
    if (!pts || pts.length < 2) return null;
    var a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    if (a === b || (a[0] === b[0] && a[1] === b[1])) return null;
    return bearingDeg(a, b);
  }

  /**
   * Cône de cap, à la manière du point bleu des applis de navigation.
   *
   * L'émoji lui-même n'est **pas** pivoté : un cycliste tourné vers l'ouest se
   * retrouverait la tête en bas, et l'orientation de départ d'un émoji change
   * d'une plateforme à l'autre — impossible de savoir de quel côté il regarde.
   * Le cône, lui, est dessiné par nous : il indique le cap exactement, quel que
   * soit le repère choisi dans les réglages.
   */
  function headingCone(pt, deg, r) {
    if (deg === null || deg === undefined) return '';
    return '<g transform="translate(' + pt[0].toFixed(1) + ',' + pt[1].toFixed(1) + ') rotate(' + deg.toFixed(0) + ')">' +
      '<path d="M0 ' + (-r - 9) + ' L-6 ' + (-r + 1) + ' L6 ' + (-r + 1) + ' Z" ' +
        'fill="var(--accent)" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>' +
    '</g>';
  }

  /**
   * Un repère : pastille claire puis émoji par-dessus. La pastille détache
   * l'icône du fond de carte, qui peut être aussi bien une forêt qu'un rond-point.
   */
  function markerSvg(pt, role, size) {
    var r = size || 13;
    return '<circle cx="' + pt[0].toFixed(1) + '" cy="' + pt[1].toFixed(1) + '" r="' + r +
        '" fill="rgba(255,255,255,.92)" stroke="var(--accent)" stroke-width="2"/>' +
      '<text x="' + pt[0].toFixed(1) + '" y="' + pt[1].toFixed(1) + '" text-anchor="middle" ' +
        'dominant-baseline="central" font-size="' + (r * 1.15).toFixed(0) + '">' +
        esc(markers[role]) + '</text>';
  }

  var basemap = 'osm';
  function setBasemap(key) { basemap = BASEMAPS[key] ? key : 'osm'; }

  /**
   * Deux moteurs de rendu, pour pouvoir les comparer sur le terrain.
   *
   *  - `maison` : les tuiles posées à la main, ~120 lignes, rien à charger.
   *  - `leaflet` : la bibliothèque de référence, embarquée dans `www/vendor`.
   *
   * Leaflet n'est **pas** chargé tant qu'il n'est pas choisi : 160 ko de plus
   * sur chaque ouverture de l'app ne se justifient pas pour un mode de
   * comparaison. Les deux affichent les mêmes tuiles — la netteté ne vient pas
   * du moteur mais de la densité de pixels demandée (voir `tileScale`).
   */
  var engine = 'maison';
  function setEngine(key) { engine = key === 'leaflet' ? 'leaflet' : 'maison'; }
  function engineKeys() { return ['maison', 'leaflet']; }

  var leafletLoading = null;

  function ensureLeaflet(done) {
    if (w.L) return done(true);
    if (leafletLoading) { leafletLoading.push(done); return; }
    leafletLoading = [done];

    var css = d.createElement('link');
    css.rel = 'stylesheet';
    css.href = '/vendor/leaflet/leaflet.css';
    d.head.appendChild(css);

    var js = d.createElement('script');
    js.src = '/vendor/leaflet/leaflet.js';
    js.onload = function () { leafletLoading.forEach(function (f) { f(true); }); leafletLoading = null; };
    js.onerror = function () { leafletLoading.forEach(function (f) { f(false); }); leafletLoading = null; };
    d.head.appendChild(js);
  }

  /** Résout une variable CSS : Leaflet pose `fill` en attribut, pas en style. */
  function cssVar(name) {
    return getComputedStyle(d.documentElement).getPropertyValue(name).trim() || '#2563eb';
  }
  function basemapKeys() { return Object.keys(BASEMAPS); }
  function basemapName(key) { return (BASEMAPS[key] || BASEMAPS.osm).name; }

  var TILE_SIZE = 256;
  var MIN_ZOOM  = 3;

  /**
   * Un téléphone affiche 2 à 3 pixels physiques par pixel CSS : une tuile posée
   * à sa taille nominale y est agrandie d'autant, d'où un rendu mou. On prend
   * donc le zoom au-dessus et on affiche les tuiles à demi-taille — même cadrage,
   * deux fois plus de pixels. C'est ce que fait `detectRetina` dans Leaflet.
   */
  function tileScale(z, conf) {
    var dpr = w.devicePixelRatio || 1;
    return (dpr >= 1.5 && z + 1 <= conf.maxZoom) ? 2 : 1;
  }
  var FIT_ZOOM  = 17;         // zoom maximal au cadrage automatique
  var MAP_RATIO = 210 / 340;  // hauteur / largeur de la carte
  var MAP_PAD   = 0.12;       // le tracé ne doit pas toucher les bords

  var mapSeq = 0;
  var maps = {};   // id -> données de la carte, en attente d'insertion dans le DOM

  // Champ de pluie autour du trajet (grille Open-Meteo), renseigné par app.js.
  var field = { available: false, cells: [] };

  // Rang du point de passage choisi au curseur. Le curseur est purement
  // temporel : cran 0 = l'heure de départ, dernier cran = l'arrivée.
  var frame = 0;

  // La vue d'ensemble (chaque case à l'heure du point le plus proche) n'est pas
  // un instant : elle mélange plusieurs heures sur une même image. La mêler aux
  // crans du curseur prêtait à confusion, elle a son propre bouton.
  var overviewOn = false;

  function setField(data) { field = data || { available: false, cells: [] }; }
  function setFrame(i) { frame = Math.max(0, +i || 0); }
  function setOverview(on) { overviewOn = !!on; }

  function lonToWorld(lon, z) {
    return ((lon + 180) / 360) * TILE_SIZE * Math.pow(2, z);
  }

  function latToWorld(lat, z) {
    var s = Math.max(-0.9999, Math.min(0.9999, Math.sin(lat * Math.PI / 180)));
    return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE_SIZE * Math.pow(2, z);
  }

  /** Zoom le plus serré auquel le trajet tient encore dans W x H pixels. */
  function fitZoom(coords, W, H) {
    for (var z = FIT_ZOOM; z > MIN_ZOOM; z--) {
      var xs = coords.map(function (c) { return lonToWorld(c[1], z); });
      var ys = coords.map(function (c) { return latToWorld(c[0], z); });
      var dx = Math.max.apply(null, xs) - Math.min.apply(null, xs);
      var dy = Math.max.apply(null, ys) - Math.min.apply(null, ys);
      if (dx <= W * (1 - MAP_PAD) && dy <= H * (1 - MAP_PAD)) return z;
    }
    return 3;
  }

  /** Coordonnées du tracé : le vrai tracé si on l'a, sinon les points de passage. */
  function trackCoords(route) {
    if (route.track_ll && route.track_ll.length > 1) return route.track_ll;
    return (route.points || [])
      .filter(function (p) { return typeof p.lat === 'number' && typeof p.lon === 'number'; })
      .map(function (p) { return [p.lat, p.lon]; });
  }

  /**
   * Nuages de pluie : une tache par case de la grille, floutée pour que les
   * cases voisines se fondent en une seule masse. Sans le flou, on lit une
   * mosaïque de disques — ce qui donnerait à la grille une précision qu'elle
   * n'a pas (maille de ~2 km).
   */
  var RAIN_ALPHA = [0, 0.34, 0.44, 0.54, 0.62];

  /** Bornes de l'échelle météo usuelle, en mm/h, alignées sur `rainTier`. */
  var RAIN_BANDS = [
    { tier: 1, label: 'bruine' },
    { tier: 2, label: '1' },
    { tier: 3, label: '2,5' },
    { tier: 4, label: '7,6+' }
  ];

  /** Légende de l'échelle, sans laquelle les couleurs ne veulent rien dire. */
  function rainKey() {
    if (!field.available) return '';
    var bands = RAIN_BANDS.map(function (b) {
      return '<span class="band t' + b.tier + '" style="background:var(--rain-' + b.tier + ')">' +
        esc(b.label) + '</span>';
    }).join('');
    return '<div class="rainkey"><b>Pluie mm/h</b>' + bands + '</div>';
  }

  function fieldSvg(cells, px, spacingPx) {
    var blobs = cells.filter(function (c) { return c.rate >= 0.05; }).map(function (c) {
      var p = px([c.lat, c.lon]);
      var tier = rainTier(c.rate);
      // Opacité **fixée par palier**, pas proportionnelle à l'intensité : une
      // rampe continue saturait dès 5 mm/h, ce qui rendait « forte » et « très
      // forte » identiques. C'est la teinte qui porte l'information, l'opacité
      // se contente de laisser lire les rues dessous.
      var op = RAIN_ALPHA[tier];
      return '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) +
        '" r="' + (spacingPx * 0.62).toFixed(1) + '" fill="var(--rain-' + Math.max(1, tier) + ')" opacity="' + op.toFixed(2) + '"/>';
    }).join('');

    if (!blobs) return '';
    var sd = Math.max(5, spacingPx * 0.34);
    return '<filter id="rainblur" x="-30%" y="-30%" width="160%" height="160%">' +
        '<feGaussianBlur stdDeviation="' + sd.toFixed(1) + '"/>' +
      '</filter>' +
      '<g filter="url(#rainblur)">' + blobs + '</g>';
  }

  function cellDefs(cells) {
    return cells.map(function (c, i) {
      return '<radialGradient id="cell' + i + '">' +
        '<stop offset="0%" stop-color="var(--rain-4)" stop-opacity="' + (c.intensity * 0.85).toFixed(2) + '"/>' +
        '<stop offset="60%" stop-color="var(--rain-2)" stop-opacity="' + (c.intensity * 0.45).toFixed(2) + '"/>' +
        '<stop offset="100%" stop-color="var(--rain-1)" stop-opacity="0"/>' +
      '</radialGradient>';
    }).join('');
  }

  /** Le calque nuages + tracé + marqueurs, en pixels de la carte. */
  function overlaySvg(W, H, pxCoords, pxPoints, cells, rain, cursor) {
    var d = pxCoords.map(function (p, i) {
      return (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1);
    }).join(' ');

    var a = pxPoints[0], b = pxPoints[pxPoints.length - 1];

    // Point sélectionné par le curseur. Aux deux extrémités il tombe pile sur le
    // repère de départ ou d'arrivée : on n'y met alors que le halo, sinon
    // l'icône de position masquerait celle qu'on cherche justement à distinguer.
    var halo = '', mark = '';
    if (cursor !== null && cursor !== undefined && pxPoints[cursor]) {
      var c = pxPoints[cursor];
      var onEnd = cursor === 0 || cursor === pxPoints.length - 1;
      halo = '<circle cx="' + c[0].toFixed(1) + '" cy="' + c[1].toFixed(1) +
        '" r="' + (onEnd ? 21 : 20) + '" fill="var(--accent)" opacity="' + (onEnd ? '.32' : '.22') + '"/>' +
        headingCone(c, headingAt(sliderPoints, cursor), onEnd ? 21 : 20);
      if (!onEnd) mark = markerSvg(c, 'cursor', 14);
    }

    var cellSvg = cells.map(function (c, i) {
      return '<circle cx="' + (c.x * W).toFixed(1) + '" cy="' + (c.y * H).toFixed(1) +
        '" r="' + (c.r * W).toFixed(1) + '" fill="url(#cell' + i + ')"/>';
    }).join('');

    return '<svg class="maplayer" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" ' +
      'role="img" aria-label="Carte du trajet et nuages de pluie">' +
      '<defs>' + cellDefs(cells) + '</defs>' + cellSvg + (rain || '') +
      '<path d="' + d + '" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="' + d + '" fill="none" stroke="var(--accent)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>' +
      // Le halo passe sous les repères : aux extrémités il doit entourer l'icône
      // de départ ou d'arrivée, pas la recouvrir.
      halo + markerSvg(a, 'start') + markerSvg(b, 'end') + mark +
    '</svg>';
  }

  /* ---------- vue de la carte : zoom + déplacement ---------- */

  /** Coordonnées écran d'un point [lat, lon] dans la vue `v`. */
  function projector(v) {
    return function (c) {
      return [lonToWorld(c[1], v.z) - v.originX, latToWorld(c[0], v.z) - v.originY];
    };
  }

  /** Cadrage automatique sur le trajet. */
  function fitView(v) {
    v.z = fitZoom(v.data.coords, v.W, v.H);
    var xs = v.data.coords.map(function (c) { return lonToWorld(c[1], v.z); });
    var ys = v.data.coords.map(function (c) { return latToWorld(c[0], v.z); });
    v.originX = (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2 - v.W / 2;
    v.originY = (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2 - v.H / 2;
    clampView(v);
  }

  /** Empêche de sortir de la carte par le haut ou par le bas. */
  function clampView(v) {
    var world = TILE_SIZE * Math.pow(2, v.z);
    v.originY = Math.max(Math.min(v.originY, world - v.H), Math.min(0, world - v.H));
  }

  /** Zoome de `dz` crans en gardant fixe le point écran (px, py). */
  function zoomBy(v, dz, px, py) {
    var max = (BASEMAPS[basemap] || BASEMAPS.osm).maxZoom;
    var z = Math.max(MIN_ZOOM, Math.min(max, v.z + dz));
    if (z === v.z) return false;

    var k = Math.pow(2, z - v.z);
    v.originX = (v.originX + px) * k - px;
    v.originY = (v.originY + py) * k - py;
    v.z = z;
    clampView(v);
    return true;
  }

  /**
   * Pose les tuiles visibles. Les images déjà chargées sont **déplacées**, pas
   * recréées : sans ça, chaque pixel de déplacement reconstruirait le DOM et la
   * carte clignoterait. Une tuile de marge évite les bords blancs en glissant.
   */
  function layoutTiles(el, v) {
    var conf = BASEMAPS[basemap] || BASEMAPS.osm;
    var scale = tileScale(v.z, conf);
    var tileZ = v.z + scale - 1;      // un cran plus haut en haute densité
    var px    = TILE_SIZE / scale;    // ...et des tuiles deux fois plus petites
    var n     = Math.pow(2, tileZ);
    var need  = {};

    for (var tx = Math.floor(v.originX / px) - 1; tx <= Math.floor((v.originX + v.W) / px) + 1; tx++) {
      for (var ty = Math.floor(v.originY / px) - 1; ty <= Math.floor((v.originY + v.H) / px) + 1; ty++) {
        if (ty < 0 || ty >= n) continue;
        var wx = ((tx % n) + n) % n;   // la longitude s'enroule, pas la latitude
        need[tileZ + '/' + wx + '/' + ty] = [tx, ty, wx];
      }
    }

    Object.keys(need).forEach(function (key) {
      var t = need[key], img = v.tiles[key];
      if (!img) {
        img = new w.Image();
        img.className = 'tile';
        img.alt = '';
        img.decoding = 'async';
        img.src = conf.url.replace('{z}', tileZ).replace('{x}', t[2]).replace('{y}', t[1]);
        img.addEventListener('error', function () { tileFailed(el, v); });
        v.layer.appendChild(img);
        v.tiles[key] = img;
      }
      img.style.width = img.style.height = px + 'px';
      img.style.left = (t[0] * px - v.originX).toFixed(1) + 'px';
      img.style.top  = (t[1] * px - v.originY).toFixed(1) + 'px';
    });

    Object.keys(v.tiles).forEach(function (key) {
      if (need[key]) return;
      var img = v.tiles[key];
      if (img.parentNode) img.parentNode.removeChild(img);
      delete v.tiles[key];
    });
  }

  /**
   * Sans accès Internet (Home Assistant isolé, avion, etc.) aucune tuile ne
   * charge : on bascule sur le fond neutre plutôt que sur un cadre blanc.
   */
  function tileFailed(el, v) {
    if (++v.failed < 3) return;
    el.classList.add('notiles');
    var foot = el.parentNode && el.parentNode.querySelector('.mapfoot');
    if (foot) foot.textContent = 'Fond de carte indisponible (pas d’accès Internet) · tracé réel';
  }

  /** Redessine tuiles et calque pour la vue courante. */
  function applyView(el, v) {
    v.px = projector(v);
    v.coords = v.data.coords.map(v.px);
    v.points = v.data.points.map(v.px);
    layoutTiles(el, v);
    var svg = el.querySelector('.maplayer');
    if (svg) svg.outerHTML = layerFor(el);
  }

  /** Molette, pincement, glissement, double tap. */
  function bindGestures(el, v) {
    var pointers = {}, last = null, pinch = null;

    var pos = function (e) {
      var r = el.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    var ids = function () { return Object.keys(pointers); };
    var touched = function () { el.classList.add('moved'); applyView(el, v); };

    el.addEventListener('pointerdown', function (e) {
      pointers[e.pointerId] = pos(e);
      el.setPointerCapture(e.pointerId);
      if (ids().length === 2) {
        var a = pointers[ids()[0]], b = pointers[ids()[1]];
        pinch = Math.hypot(a[0] - b[0], a[1] - b[1]);
      }
      last = pos(e);
    });

    el.addEventListener('pointermove', function (e) {
      if (!pointers[e.pointerId]) return;
      var p = pos(e);
      pointers[e.pointerId] = p;

      if (ids().length >= 2) {
        var a = pointers[ids()[0]], b = pointers[ids()[1]];
        var dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
        // Un cran de zoom par variation notable de l'écart entre les doigts.
        if (pinch && Math.abs(Math.log(dist / pinch) / Math.LN2) > 0.4) {
          zoomBy(v, dist > pinch ? 1 : -1, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
          pinch = dist;
          touched();
        }
        return;
      }

      if (!last) return;
      v.originX -= p[0] - last[0];
      v.originY -= p[1] - last[1];
      last = p;
      clampView(v);
      touched();
    });

    var release = function (e) {
      delete pointers[e.pointerId];
      if (ids().length < 2) pinch = null;
      if (ids().length === 0) last = null;
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);

    el.addEventListener('dblclick', function (e) {
      var p = pos(e);
      if (zoomBy(v, 1, p[0], p[1])) touched();
    });

    el.addEventListener('wheel', function (e) {
      e.preventDefault();
      var p = pos(e);
      if (zoomBy(v, e.deltaY < 0 ? 1 : -1, p[0], p[1])) touched();
    }, { passive: false });
  }

  /**
   * Pose la carte dans un conteneur déjà inséré dans le DOM : la largeur réelle
   * n'est connue qu'à ce moment-là, et c'est elle qui décide du cadrage.
   */
  function mountMap(el) {
    var data = maps[el.getAttribute('data-map')];
    if (!data) return;

    var W = Math.round(el.clientWidth);
    if (!W) return;                                  // encore replié dans un <details>
    if (el.getAttribute('data-w') === String(W) && el._mounted) return;
    el.setAttribute('data-w', String(W));

    var H = Math.round(W * MAP_RATIO);
    el.style.height = H + 'px';

    if (engine === 'leaflet') {
      ensureLeaflet(function (ok) {
        // Leaflet indisponible (fichier absent) : on retombe sur le rendu maison
        // plutôt que sur une carte vide.
        if (ok && w.L) mountLeafletMap(el, data, W, H);
        else mountCanvasMap(el, data, W, H);
      });
      return;
    }
    mountCanvasMap(el, data, W, H);
  }

  function mountCanvasMap(el, data, W, H) {
    // En revenant de Leaflet, sa carte garde des écouteurs sur window : il faut
    // la fermer explicitement, vider le conteneur ne suffit pas.
    if (el._map) { el._map.remove(); el._map = null; }
    el._mounted = 'maison';

    el.innerHTML = '<div class="tilelayer"></div><svg class="maplayer"></svg>' +
      '<div class="mapctl">' +
        '<button type="button" data-map-zoom="1" aria-label="Zoomer">+</button>' +
        '<button type="button" data-map-zoom="-1" aria-label="Dézoomer">−</button>' +
        '<button type="button" data-map-fit aria-label="Recadrer sur le trajet">⌖</button>' +
      '</div>';

    // `raw` coupe l'inversion du thème sombre pour les fonds photographiques.
    el.classList.toggle('raw', !(BASEMAPS[basemap] || BASEMAPS.osm).invertible);

    var v = { W: W, H: H, data: data, tiles: {}, failed: 0,
              layer: el.querySelector('.tilelayer'), cells: data.cells };
    el._vm = v;
    el._redraw = function () {
      var svg = el.querySelector('.maplayer');
      if (svg) svg.outerHTML = layerFor(el);
    };
    fitView(v);
    applyView(el, v);

    el.querySelector('[data-map-fit]').addEventListener('click', function () {
      el.classList.remove('moved');
      fitView(v);
      applyView(el, v);
    });
    Array.prototype.forEach.call(el.querySelectorAll('[data-map-zoom]'), function (b) {
      b.addEventListener('click', function () {
        if (zoomBy(v, +b.getAttribute('data-map-zoom'), v.W / 2, v.H / 2)) {
          el.classList.add('moved');
          applyView(el, v);
        }
      });
    });

    bindGestures(el, v);
  }

  /**
   * Calque SVG de la carte : nuages de l'image courante, tracé, marqueurs.
   * `frame` vaut null pour la vue d'ensemble, sinon le rang du point de passage.
   */
  function currentCells() {
    if (!field.available) return null;
    if (overviewOn) return field.cells;
    var f = field.frames && field.frames[frame];
    if (!f || f.found === false) return null;
    return f.rates.map(function (rate, j) {
      return { lat: field.cells[j].lat, lon: field.cells[j].lon, rate: rate };
    });
  }

  function layerFor(el) {
    var v = el._vm;
    if (!v) return '';

    var cells = currentCells();

    var rain = '';
    if (cells && cells.length) {
      // Pas de la grille converti en pixels au zoom courant.
      var spacing = Math.abs(latToWorld(cells[0].lat + field.step_lat, v.z) - latToWorld(cells[0].lat, v.z));
      rain = fieldSvg(cells, v.px, Math.max(8, spacing));
    }

    // Pas de marqueur en vue d'ensemble : elle ne correspond à aucun instant,
    // donc à aucune position précise sur le trajet.
    return overlaySvg(v.W, v.H, v.coords, v.points, v.cells, rain, overviewOn ? null : frame);
  }

  /**
   * Même contenu que le rendu maison, dessiné par Leaflet : tuiles, nuages,
   * tracé, marqueurs, point du curseur. Les nuages vont dans un calque dédié
   * pour recevoir le flou sans emporter le tracé avec eux.
   */
  function mountLeafletMap(el, data, W, H) {
    var L = w.L;
    var conf = BASEMAPS[basemap] || BASEMAPS.osm;

    if (el._map) { el._map.remove(); el._map = null; }
    el._mounted = 'leaflet';
    el.innerHTML = '';
    el.classList.toggle('raw', !conf.invertible);

    var map = L.map(el, { attributionControl: false, zoomSnap: 1 });
    el._map = el._vm = null;

    // detectRetina applique exactement la même astuce que `tileScale` : un cran
    // de zoom en plus, des tuiles à demi-taille.
    L.tileLayer(conf.url, { detectRetina: true, maxZoom: conf.maxZoom, className: 'tile' }).addTo(map);

    map.createPane('rain');
    var rainPane = map.getPane('rain');
    rainPane.style.zIndex = 350;   // au-dessus des tuiles, sous le tracé

    var line = data.coords.map(function (c) { return [c[0], c[1]]; });
    L.polyline(line, { color: '#fff', weight: 8, opacity: 0.75, lineCap: 'round', lineJoin: 'round' }).addTo(map);
    L.polyline(line, { color: cssVar('--accent'), weight: 4, lineCap: 'round', lineJoin: 'round' }).addTo(map);

    var pin = function (role, size, deg) {
      var cone = (deg === null || deg === undefined) ? ''
        : '<i class="vm-cone" style="transform:rotate(' + deg.toFixed(0) + 'deg)"></i>';
      return L.divIcon({
        className: 'vm-pin', iconSize: [size, size], iconAnchor: [size / 2, size / 2],
        html: cone + '<span>' + esc(markerFor(role)) + '</span>'
      });
    };

    var a = data.points[0], b = data.points[data.points.length - 1];
    L.marker(a, { icon: pin('start', 28), keyboard: false }).addTo(map);
    L.marker(b, { icon: pin('end', 28), keyboard: false }).addTo(map);

    map.fitBounds(L.latLngBounds(line), { padding: [14, 14] });

    // Bouton de recadrage, l'équivalent du ⌖ du rendu maison.
    var Fit = L.Control.extend({
      options: { position: 'topright' },
      onAdd: function () {
        var box = L.DomUtil.create('div', 'leaflet-bar');
        var btn = L.DomUtil.create('a', '', box);
        btn.href = '#';
        btn.title = 'Recadrer sur le trajet';
        btn.innerHTML = '⌖';
        L.DomEvent.on(btn, 'click', function (e) {
          L.DomEvent.stop(e);
          map.fitBounds(L.latLngBounds(line), { padding: [14, 14] });
        });
        return box;
      }
    });
    map.addControl(new Fit());

    var rain = L.layerGroup([], { pane: 'rain' }).addTo(map);
    var cursor = null;

    el._redraw = function () {
      rain.clearLayers();
      var cells = currentCells();

      if (cells && cells.length) {
        var metres = field.step_lat * 111320;
        cells.forEach(function (c) {
          if (c.rate < 0.05) return;
          L.circle([c.lat, c.lon], {
            pane: 'rain', radius: metres * 0.78, stroke: false,
            fillColor: cssVar('--rain-' + Math.max(1, rainTier(c.rate))),
            fillOpacity: RAIN_ALPHA[rainTier(c.rate)]
          }).addTo(rain);
        });
        // Le flou se règle en pixels écran : il doit suivre le zoom courant.
        var p1 = map.latLngToLayerPoint([cells[0].lat, cells[0].lon]);
        var p2 = map.latLngToLayerPoint([cells[0].lat + field.step_lat, cells[0].lon]);
        rainPane.style.filter = 'blur(' + Math.max(5, Math.abs(p1.y - p2.y) * 0.34).toFixed(1) + 'px)';
      }

      if (cursor) { map.removeLayer(cursor); cursor = null; }
      var pt = !overviewOn && data.points[frame];
      if (pt) {
        cursor = L.marker(pt, {
          icon: pin('cursor', 32, headingAt(data.points, frame)),
          keyboard: false, zIndexOffset: 500
        }).addTo(map);
      }
    };

    map.on('zoomend', el._redraw);
    el._map = map;
    el._redraw();
  }

  // Trajet et météo de la page en cours : la synchronisation regénère le graphe
  // et l'étiquette du curseur, elle a besoin des deux.
  var shown = { route: null, weather: null };
  function setShown(route, weather) { shown.route = route; shown.weather = weather || null; }

  /**
   * Aligne les trois vues sur le point courant : carte, curseur et graphe.
   * Appelée quelle que soit celle des trois qu'on a manipulée.
   */
  function syncSelection(scope) {
    var root = scope || d;
    redrawLayers(root);

    Array.prototype.forEach.call(root.querySelectorAll('[data-slider]'), function (box) {
      var input = box.querySelector('input[type=range]');
      if (input && !overviewOn && +input.value !== frame) input.value = frame;
      var lbl = box.querySelector('[data-slider-label]');
      if (lbl && shown.route) lbl.innerHTML = sliderLabel(shown.route);
    });

    // Seul l'intérieur du SVG est réécrit : le nœud survit, avec ses écouteurs
    // et la capture du pointeur si un glissement est en cours.
    Array.prototype.forEach.call(root.querySelectorAll('[data-chart] svg.chart'), function (svg) {
      if (shown.weather) svg.innerHTML = chartInner(shown.weather);
    });

    Array.prototype.forEach.call(root.querySelectorAll('[data-overview]'), function (b) {
      b.setAttribute('aria-pressed', String(overviewOn));
    });

    Array.prototype.forEach.call(root.querySelectorAll('[data-shift-chip]'), function (box) {
      box.innerHTML = shiftChip();
    });
  }

  /** Redessine le calque de chaque carte affichée, sans retoucher aux tuiles. */
  function redrawLayers(root) {
    Array.prototype.forEach.call((root || d).querySelectorAll('.mapcanvas[data-map]'), function (el) {
      if (el._redraw) el._redraw();
    });
  }

  /** À appeler après chaque innerHTML : les cartes ne peuvent se calculer qu'insérées. */
  function mountMaps(root, route) {
    var scope = root || d;

    Array.prototype.forEach.call(scope.querySelectorAll('.mapcanvas[data-map]'), function (el) {
      mountMap(el);
      // Le layout C range la carte dans un <details> replié (largeur 0) et
      // l'orientation du téléphone change la largeur : on remonte à chaque fois.
      if (w.ResizeObserver && !el._ro) {
        el._ro = new w.ResizeObserver(function () { mountMap(el); });
        el._ro.observe(el);
      }
    });

    // Aucune des trois vues ne recharge la page ni les tuiles : elles se
    // redessinent entre elles.
    Array.prototype.forEach.call(scope.querySelectorAll('[data-slider] input[type=range]'), function (input) {
      input.addEventListener('input', function () {
        setFrame(input.value);
        setOverview(false);   // toucher le curseur, c'est demander un instant
        syncSelection(scope);
      });
    });

    Array.prototype.forEach.call(scope.querySelectorAll('[data-overview]'), function (btn) {
      btn.addEventListener('click', function () {
        setOverview(!overviewOn);
        syncSelection(scope);
      });
    });

    // Le graphe est la troisième poignée : cliquer ou glisser sur une colonne
    // déplace le curseur et la carte.
    bindChart(scope);
  }

  /**
   * Le graphe se manipule directement : on y attrape le curseur et on le glisse.
   *
   * La colonne est déduite de l'abscisse, pas d'une zone cliquable : avec la
   * capture du pointeur, la cible des événements devient le SVG lui-même, et le
   * doigt peut sortir du graphe sans que le geste s'interrompe.
   *
   * `touch-action: pan-y` (CSS) laisse le défilement vertical de la page au
   * navigateur : on ne prend que l'horizontal, celui du curseur.
   */
  function bindChart(scope) {
    Array.prototype.forEach.call(scope.querySelectorAll('[data-chart] svg.chart'), function (svg) {
      if (svg._bound) return;
      svg._bound = true;

      var n = +svg.getAttribute('data-n') || 1;
      var dragging = false;

      var pick = function (e) {
        var r = svg.getBoundingClientRect();
        if (!r.width) return;
        var x = ((e.clientX - r.left) / r.width) * CHART.W;      // en unités du viewBox
        var step = (CHART.W - CHART.L - CHART.R) / n;
        var i = Math.round((x - CHART.L - step / 2) / step);
        i = Math.max(0, Math.min(n - 1, i));
        if (!overviewOn && i === frame) return;
        setFrame(i);
        setOverview(false);
        syncSelection(scope);
      };

      svg.addEventListener('pointerdown', function (e) {
        dragging = true;
        if (svg.setPointerCapture) svg.setPointerCapture(e.pointerId);
        pick(e);
      });
      svg.addEventListener('pointermove', function (e) { if (dragging) pick(e); });

      // pointercancel arrive quand le navigateur décide que le geste est un
      // défilement vertical : il faut lâcher, sinon la page reste bloquée.
      var stop = function () { dragging = false; };
      svg.addEventListener('pointerup', stop);
      svg.addEventListener('pointercancel', stop);
    });
  }

  function radarMap(route, weather) {
    var coords = trackCoords(route);
    var cells = route.rain_cells || [];

    // Sans coordonnées exploitables, on garde l'ancienne carte schématique.
    if (coords.length < 2) return schematicMap(route);

    var pts = (route.points || []).filter(function (p) { return typeof p.lat === 'number'; })
                                  .map(function (p) { return [p.lat, p.lon]; });
    if (pts.length < 2) pts = [coords[0], coords[coords.length - 1]];

    var id = 'map' + (++mapSeq);
    maps[id] = { coords: coords, points: pts, cells: cells };
    sliderPoints = pts;

    var conf = BASEMAPS[basemap] || BASEMAPS.osm;
    // Deux coins voisins : la mention reste courte pour ne pas venir manger le
    // bouton d'en face. L'averse simulée, elle, a son propre coin.
    var caption = (route.track_ll ? 'Tracé réel' : 'Points de passage') + ' · ' + conf.credit;

    // Carte, curseur et graphe s'enchaînent sans rien entre eux : ce sont trois
    // vues du même trajet, elles doivent se lire d'un seul tenant. Le bouton de
    // vue d'ensemble, la légende et les crédits passent donc après le graphe.
    // La légende ouvre le bloc : elle vaut pour la carte et pour les barres du
    // graphe, qui partagent la même rampe. Le bouton de vue d'ensemble et les
    // crédits passent dans les coins de la carte, pour ne rien intercaler entre
    // la carte, le curseur et le graphe.
    return '' +
      '<section class="card mapwrap">' +
        rainKey() +
        '<div class="mapbox">' +
          '<div class="mapcanvas" data-map="' + id + '"></div>' +
          (field.source === 'demo'
            ? '<div class="mapover top"><div class="mapfoot demo">☔ averse simulée</div></div>'
            : '') +
          '<div class="mapover left">' + overviewBtn() + '</div>' +
          '<div class="mapover right"><div class="mapfoot">' + esc(caption) + '</div></div>' +
        '</div>' +
        timeSlider(route) +
        (weather ? rainChart(weather, false) : '') +
      '</section>';
  }

  /**
   * Curseur de parcours, purement temporel : un cran par point de passage, du
   * départ à l'arrivée. Chaque cran pose le marqueur sur le point et bascule
   * les nuages sur l'heure de passage — le ciel à cet instant, rien d'autre.
   *
   * La vue d'ensemble, elle, superpose plusieurs heures sur une même image :
   * en faire un cran du curseur prêtait à confusion, d'où son bouton séparé.
   */
  function timeSlider(route) {
    var pts = route.points || [];
    if (!field.available || !field.frames || field.frames.length !== pts.length || pts.length < 2) return '';

    return '<div class="mapslider" data-slider>' +
      // Les deux boutons décalent tout le trajet dans le temps ; le curseur, lui,
      // se déplace le long du trajet. Deux gestes voisins, deux effets distincts,
      // d'où les libellés explicites en minutes.
      // Le curseur est calé au pixel sur les colonnes du graphe : ses deux
      // extrémités tombent sur le centre de la première et de la dernière.
      // C'est ce qui a permis de réduire les boutons aux seuls signes — ils
      // tiennent maintenant dans les marges de l'axe.
      '<div class="slider-row" style="--first:' + (chartCentre(0, pts.length) * 100).toFixed(3) + '%;' +
          '--span:' + ((chartCentre(pts.length - 1, pts.length) - chartCentre(0, pts.length)) * 100).toFixed(3) + '%">' +
        '<button type="button" class="shift-btn" data-shift="-10" ' +
          'title="Partir 10 minutes plus tôt" aria-label="Partir 10 minutes plus tôt">−</button>' +
        '<input type="range" min="0" max="' + (pts.length - 1) + '" step="1" ' +
          'value="' + Math.min(frame, pts.length - 1) + '" ' +
          'aria-label="Heure de passage sur le trajet">' +
        '<button type="button" class="shift-btn" data-shift="10" ' +
          'title="Partir 10 minutes plus tard" aria-label="Partir 10 minutes plus tard">+</button>' +
      '</div>' +
      '<div class="slider-lbl" data-slider-label>' + sliderLabel(route) + '</div>' +
      '<div data-shift-chip>' + shiftChip() + '</div>' +
    '</div>';
  }

  /** Bouton de vue d'ensemble, posé dans le coin bas gauche de la carte. */
  function overviewBtn() {
    return '<button class="chip-toggle" data-overview aria-pressed="' + overviewOn + '">' +
      '🗺️ Vue d’ensemble</button>';
  }

  // Décalage du départ demandé depuis la carte, en minutes. Renseigné par app.js.
  var shiftMin = 0;
  function setShift(m) { shiftMin = +m || 0; }

  /** Rappel du décalage en cours, avec de quoi revenir à l'horaire habituel. */
  function shiftChip() {
    if (!shiftMin) return '';
    return '<button class="chip-toggle shifted" data-shift="0" aria-pressed="true">' +
      '⏱️ ' + (shiftMin > 0 ? '+' : '−') + Math.abs(shiftMin) + ' min · annuler</button>';
  }

  /** Ce que dit le curseur à sa position courante. */
  function sliderLabel(route) {
    var pts = route.points || [];
    if (overviewOn) {
      return '<b>Tout le trajet</b>' +
        '<span class="muted"> · chaque endroit à l’heure où tu y passes</span>';
    }
    var p = pts[frame] || {};
    var f = field.frames[frame] || {};
    var head = '<b>' + esc(f.time || p.time || '') + '</b>' +
      '<span class="muted"> · ' + esc(p.label || ('point ' + (frame + 1))) + '</span>';

    // Un départ au-delà de la fenêtre de prévision n'a pas d'image : le dire,
    // plutôt que d'afficher un ciel sec qui serait faux.
    if (f.found === false) {
      return head + '<span class="slider-rate">pas de prévision</span>';
    }

    var rate = onRoute(frame);
    return head + '<span class="slider-rate t' + rainTier(rate) + '">' +
      (rate >= 0.1 ? num(rate) + ' mm/h' : 'sec') + '</span>';
  }

  /** Intensité de l'image `i` à l'endroit où se trouve le vélo à ce moment-là. */
  function onRoute(i) {
    var f = field.frames && field.frames[i];
    if (!f || !field.cells || !field.cells.length) return 0;
    return f.rates[nearestCell(i)] || 0;
  }

  /** Case de la grille la plus proche du point de passage `i`. */
  function nearestCell(i) {
    var pt = sliderPoints[i];
    if (!pt) return 0;
    var best = 0, bestD = Infinity;
    field.cells.forEach(function (c, j) {
      var dLat = c.lat - pt[0], dLon = c.lon - pt[1];
      var dd = dLat * dLat + dLon * dLon;
      if (dd < bestD) { bestD = dd; best = j; }
    });
    return best;
  }

  // Coordonnées des points de passage du trajet affiché, pour situer le
  // curseur dans la grille de pluie.
  var sliderPoints = [];

  /** Repli sans coordonnées : la grille schématique de la V1. */
  function schematicMap(route) {
    var W = 340, H = 210;
    var grid = '';
    for (var gx = 0; gx <= W; gx += 34) grid += '<line x1="' + gx + '" y1="0" x2="' + gx + '" y2="' + H + '" stroke="var(--line)" stroke-width="0.5"/>';
    for (var gy = 0; gy <= H; gy += 34) grid += '<line x1="0" y1="' + gy + '" x2="' + W + '" y2="' + gy + '" stroke="var(--line)" stroke-width="0.5"/>';

    var cells = route.rain_cells || [];
    var cellSvg = cells.map(function (c, i) {
      return '<circle cx="' + (c.x * W).toFixed(1) + '" cy="' + (c.y * H).toFixed(1) +
        '" r="' + (c.r * W).toFixed(1) + '" fill="url(#cell' + i + ')"/>';
    }).join('');

    var line = (route.track && route.track.length > 1) ? route.track : route.points;
    var d = line.map(function (p, i) {
      return (i === 0 ? 'M' : 'L') + (p.x * W).toFixed(1) + ' ' + (p.y * H).toFixed(1);
    }).join(' ');

    var a = route.points[0], b = route.points[route.points.length - 1];

    return '' +
      '<section class="card mapwrap">' +
        '<svg class="map" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Carte schématique du trajet">' +
          '<defs>' + cellDefs(cells) + '</defs>' +
          '<rect width="' + W + '" height="' + H + '" fill="var(--surface-2)"/>' + grid + cellSvg +
          '<path d="' + d + '" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>' +
          '<path d="' + d + '" fill="none" stroke="var(--accent)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>' +
          '<circle cx="' + (a.x * W).toFixed(1) + '" cy="' + (a.y * H).toFixed(1) + '" r="7" fill="var(--surface)" stroke="var(--accent)" stroke-width="3"/>' +
          '<circle cx="' + (b.x * W).toFixed(1) + '" cy="' + (b.y * H).toFixed(1) + '" r="7" fill="var(--accent)" stroke="var(--surface)" stroke-width="3"/>' +
        '</svg>' +
        '<div class="mapfoot">Carte schématique · coordonnées indisponibles</div>' +
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
    esc: esc, num: num, rainColor: rainColor, rainTier: rainTier, verdictOf: verdictOf,
    verdictCard: verdictCard, profileStrip: profileStrip, windCard: windCard,
    rainChart: rainChart, radarMap: radarMap, mountMaps: mountMaps, routeSummary: routeSummary,
    setField: setField, setFrame: setFrame, setOverview: setOverview,
    setBasemap: setBasemap, basemapKeys: basemapKeys, basemapName: basemapName,
    setEngine: setEngine, engineKeys: engineKeys,
    setShift: setShift, setMarkers: setMarkers, markerSets: markerSets,
    setShown: setShown, rainChartCard: rainChartCard, syncSelection: syncSelection
  };
})(window, document);

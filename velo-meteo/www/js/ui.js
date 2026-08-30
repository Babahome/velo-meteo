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

  function rainChart(weather) {
    var W = 340, H = 156, L = 28, R = 30, T = 12, B = 30;
    var pw = W - L - R, ph = H - T - B;
    var pts = weather.points;
    var maxMm = Math.max(1, Math.ceil(Math.max.apply(null, pts.map(function (p) { return p.rate; }))));
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
      var h = (p.rate / maxMm) * ph;
      bars += '<rect x="' + (cx - bw / 2).toFixed(1) + '" y="' + (T + ph - h).toFixed(1) +
        '" width="' + bw.toFixed(1) + '" height="' + Math.max(h, 1.5).toFixed(1) +
        '" rx="3" fill="' + rainColor(p.rate) + '"/>';
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
          '<span><i style="background:var(--rain-3)"></i>intensité (mm/h)</span>' +
          '<span><i style="background:var(--accent);border-radius:99px"></i>probabilité (%)</span>' +
        '</div>' +
      '</section>';
  }

  /* ---------- carte : fond de tuiles OSM + tracé ---------- */
  /* Pas de MapLibre : la carte n'est ni déplaçable ni zoomable, elle cadre le
     trajet et c'est tout. Poser les tuiles à la main coûte ~70 lignes contre
     ~800 ko de bibliothèque à embarquer dans l'image Docker. */

  var TILE_URL  = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  var TILE_SIZE = 256;
  var MAX_ZOOM  = 17;
  var MAP_RATIO = 210 / 340;  // hauteur / largeur de la carte
  var MAP_PAD   = 0.12;       // le tracé ne doit pas toucher les bords

  var mapSeq = 0;
  var maps = {};   // id -> données de la carte, en attente d'insertion dans le DOM

  // Champ de pluie autour du trajet (grille Open-Meteo), renseigné par app.js.
  var field = { available: false, cells: [] };

  // Image affichée : null = vue d'ensemble, sinon le rang du point de passage
  // choisi au curseur.
  var frame = null;

  function setField(data) { field = data || { available: false, cells: [] }; }
  function setFrame(i) { frame = (i === null || i === undefined) ? null : +i; }

  function lonToWorld(lon, z) {
    return ((lon + 180) / 360) * TILE_SIZE * Math.pow(2, z);
  }

  function latToWorld(lat, z) {
    var s = Math.max(-0.9999, Math.min(0.9999, Math.sin(lat * Math.PI / 180)));
    return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE_SIZE * Math.pow(2, z);
  }

  /** Zoom le plus serré auquel le trajet tient encore dans W x H pixels. */
  function fitZoom(coords, W, H) {
    for (var z = MAX_ZOOM; z > 2; z--) {
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
  function fieldSvg(cells, px, spacingPx) {
    var blobs = cells.filter(function (c) { return c.rate >= 0.05; }).map(function (c) {
      var p = px([c.lat, c.lon]);
      var tier = rainTier(c.rate);
      // L'opacité sature vite : au-delà de l'averse modérée, plus sombre
      // n'apprend rien de plus et on ne lit plus les rues dessous.
      var op = Math.min(0.6, 0.1 + c.rate * 0.1);
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

    // Point sélectionné par le curseur : plus gros que les marqueurs de départ
    // et d'arrivée, pour rester repérable même posé juste à côté de l'un d'eux.
    var mark = '';
    if (cursor !== null && cursor !== undefined && pxPoints[cursor]) {
      var c = pxPoints[cursor];
      mark = '<circle cx="' + c[0].toFixed(1) + '" cy="' + c[1].toFixed(1) +
        '" r="12" fill="var(--accent)" opacity=".25"/>' +
        '<circle cx="' + c[0].toFixed(1) + '" cy="' + c[1].toFixed(1) +
        '" r="6.5" fill="#fff" stroke="var(--accent)" stroke-width="4"/>';
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
      '<circle cx="' + a[0].toFixed(1) + '" cy="' + a[1].toFixed(1) + '" r="7" fill="#fff" stroke="var(--accent)" stroke-width="3"/>' +
      '<circle cx="' + b[0].toFixed(1) + '" cy="' + b[1].toFixed(1) + '" r="7" fill="var(--accent)" stroke="#fff" stroke-width="3"/>' +
      mark +
    '</svg>';
  }

  /**
   * Pose les tuiles et le tracé dans un conteneur déjà inséré dans le DOM :
   * la largeur réelle n'est connue qu'à ce moment-là, et c'est elle qui décide
   * du zoom et du nombre de tuiles.
   */
  function mountMap(el) {
    var data = maps[el.getAttribute('data-map')];
    if (!data) return;

    var W = Math.round(el.clientWidth);
    if (!W) return;                                  // encore replié dans un <details>
    if (el.getAttribute('data-w') === String(W)) return;  // déjà monté à cette taille
    el.setAttribute('data-w', String(W));

    var H = Math.round(W * MAP_RATIO);
    el.style.height = H + 'px';

    var z = fitZoom(data.coords, W, H);
    var xs = data.coords.map(function (c) { return lonToWorld(c[1], z); });
    var ys = data.coords.map(function (c) { return latToWorld(c[0], z); });
    var originX = (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2 - W / 2;
    var originY = (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2 - H / 2;

    var px = function (c) { return [lonToWorld(c[1], z) - originX, latToWorld(c[0], z) - originY]; };
    var n = Math.pow(2, z);

    var tiles = '';
    for (var tx = Math.floor(originX / TILE_SIZE); tx <= Math.floor((originX + W) / TILE_SIZE); tx++) {
      for (var ty = Math.floor(originY / TILE_SIZE); ty <= Math.floor((originY + H) / TILE_SIZE); ty++) {
        if (ty < 0 || ty >= n) continue;
        var wx = ((tx % n) + n) % n;   // la longitude s'enroule, pas la latitude
        tiles += '<img class="tile" alt="" decoding="async" ' +
          'style="left:' + (tx * TILE_SIZE - originX).toFixed(1) + 'px;top:' + (ty * TILE_SIZE - originY).toFixed(1) + 'px" ' +
          'src="' + TILE_URL.replace('{z}', z).replace('{x}', wx).replace('{y}', ty) + '">';
      }
    }

    // Les tuiles ne bougent plus ; seul le calque SVG est réécrit quand le
    // curseur change d'heure, sinon chaque cran rechargerait la carte entière.
    el._vm = {
      W: W, H: H, z: z, px: px,
      coords: data.coords.map(px),
      points: data.points.map(px),
      cells: data.cells,
      tiles: tiles
    };
    el.innerHTML = tiles + layerFor(el);

    // Sans accès Internet (Home Assistant isolé, avion, etc.) aucune tuile ne
    // charge : on bascule sur le fond neutre plutôt que sur un cadre blanc.
    var imgs = el.querySelectorAll('img.tile');
    var failed = 0;
    Array.prototype.forEach.call(imgs, function (img) {
      img.addEventListener('error', function () {
        if (++failed >= imgs.length) {
          el.classList.add('notiles');
          var foot = el.parentNode.querySelector('.mapfoot');
          if (foot) foot.textContent = 'Fond de carte indisponible (pas d’accès Internet) · tracé réel';
        }
      });
    });
  }

  /**
   * Calque SVG de la carte : nuages de l'image courante, tracé, marqueurs.
   * `frame` vaut null pour la vue d'ensemble, sinon le rang du point de passage.
   */
  function layerFor(el) {
    var v = el._vm;
    if (!v) return '';

    var cells = null;
    if (field.available) {
      if (frame === null) cells = field.cells;
      else if (field.frames && field.frames[frame] && field.frames[frame].found !== false) {
        cells = field.frames[frame].rates.map(function (rate, j) {
          return { lat: field.cells[j].lat, lon: field.cells[j].lon, rate: rate };
        });
      }
    }

    var rain = '';
    if (cells && cells.length) {
      // Pas de la grille converti en pixels au zoom courant.
      var spacing = Math.abs(latToWorld(cells[0].lat + field.step_lat, v.z) - latToWorld(cells[0].lat, v.z));
      rain = fieldSvg(cells, v.px, Math.max(8, spacing));
    }

    return overlaySvg(v.W, v.H, v.coords, v.points, v.cells, rain, frame);
  }

  /** Redessine le calque de chaque carte affichée, sans retoucher aux tuiles. */
  function redrawLayers(root) {
    Array.prototype.forEach.call((root || d).querySelectorAll('.mapcanvas[data-map]'), function (el) {
      if (!el._vm) return;
      var svg = el.querySelector('.maplayer');
      if (svg) svg.outerHTML = layerFor(el);
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

    // Le curseur ne redessine que le calque SVG : passer d'un cran à l'autre
    // ne doit ni recharger les tuiles ni refaire le rendu de la page.
    Array.prototype.forEach.call(scope.querySelectorAll('[data-slider] input'), function (input) {
      input.addEventListener('input', function () {
        var v = +input.value;
        setFrame(v === 0 ? null : v - 1);
        redrawLayers(scope);
        var lbl = input.parentNode.querySelector('[data-slider-label]');
        if (lbl && route) lbl.innerHTML = sliderLabel(route);
      });
    });
  }

  function radarMap(route) {
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

    var caption = (route.track_ll ? 'Tracé réel' : 'Points de passage') +
      ' · fond de carte © OpenStreetMap';

    // Les nuages valent pour l'heure de passage, pas pour maintenant : c'est
    // toute la différence avec une image radar, et ça doit se lire.
    if (field.source === 'demo') caption += ' · ☔ averse simulée (test)';
    else if (field.available) caption += ' · nuages de pluie Open-Meteo';

    return '' +
      '<section class="card mapwrap">' +
        '<div class="mapcanvas" data-map="' + id + '"></div>' +
        timeSlider(route) +
        // En surimpression, l'étiquette masquait le marqueur quand le trajet
        // arrivait dans ce coin : elle est sous la carte.
        '<div class="mapfoot">' + esc(caption) + '</div>' +
      '</section>';
  }

  /**
   * Curseur de parcours : cran 0 = vue d'ensemble, crans suivants = les points
   * de passage. Chaque cran repositionne le marqueur sur la carte et bascule
   * les nuages sur l'heure de passage de ce point.
   *
   * Le cran « vue d'ensemble » est gardé en tête parce que c'est la lecture
   * utile avant de partir : où vais-je prendre l'averse *sur tout le trajet*.
   * Les crans suivants répondent à une autre question : à quoi ressemble le
   * ciel à cet instant précis.
   */
  function timeSlider(route) {
    var pts = route.points || [];
    if (!field.available || !field.frames || field.frames.length !== pts.length || pts.length < 2) return '';

    return '<div class="mapslider" data-slider>' +
      '<input type="range" min="0" max="' + pts.length + '" step="1" ' +
        'value="' + (frame === null ? 0 : frame + 1) + '" ' +
        'aria-label="Point du trajet">' +
      '<div class="slider-lbl" data-slider-label>' + sliderLabel(route) + '</div>' +
    '</div>';
  }

  /** Ce que dit le curseur à sa position courante. */
  function sliderLabel(route) {
    var pts = route.points || [];
    if (frame === null) {
      return '<b>Tout le trajet</b><span class="muted"> · pluie à l’heure de passage de chaque point</span>';
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
    setField: setField, setFrame: setFrame
  };
})(window, document);

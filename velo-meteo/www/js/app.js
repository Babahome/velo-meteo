/* Vélo Météo - routeur + pages.
   Tant qu'aucun trajet n'est configuré, l'app tourne sur les données fictives.
   Dès que le trajet est enregistré (Réglages), tout passe en données réelles :
   itinéraire OSRM et prévisions Open-Meteo. */
(function (w, d) {
  'use strict';

  var UI = w.VM_UI, MOCK = w.VM_MOCK;
  var esc = UI.esc, num = UI.num;

  var ENGINE_DESC = {
    'maison': {
      name: 'Maison',
      desc: 'Les tuiles posées à la main, ~120 lignes, rien à charger. Le défaut.'
    },
    'leaflet': {
      name: 'Leaflet',
      desc: 'La bibliothèque de référence, embarquée dans l’add-on (160 ko, chargés seulement si tu la choisis). Mêmes tuiles : c’est le confort de manipulation qui change, pas la netteté.'
    }
  };

  var BASEMAP_DESC = {
    osm: 'Le fond mondial d’OpenStreetMap. Pistes cyclables bien rendues, disponible partout.',
    ign: 'La carte de l’IGN, France uniquement. Chemins, sentiers et relief plus détaillés.',
    photo: 'Vue aérienne de l’IGN, France uniquement. Utile pour repérer un passage à vue.'
  };

  var LAYOUTS = {
    A: { name: 'A · Verdict d’abord', desc: 'Verdict → profil de pluie → vent → carte → graphe. Les chiffres avant l’image.' },
    B: { name: 'B · Carte d’abord', desc: 'Carte → graphe de pluie par point de passage → verdict → profil → vent. Le plus visuel.' },
    C: { name: 'C · Coup d’œil', desc: 'Verdict + profil + vent seulement, la carte repliée. Une seule hauteur d’écran, zéro scroll.' }
  };

  /**
   * B (carte d'abord) devient le layout par défaut. Le choix « A » hérité de la
   * phase maquette est basculé une seule fois, sinon le changement resterait
   * invisible sur un téléphone qui a déjà `vm.layout` en mémoire. Repasser en A
   * depuis Réglages reste possible, et n'est plus jamais écrasé ensuite.
   */
  function initialLayout() {
    var stored = localStorage.getItem('vm.layout');
    if (!localStorage.getItem('vm.layout.carte-dabord')) {
      localStorage.setItem('vm.layout.carte-dabord', '1');
      if (!stored || stored === 'A') {
        localStorage.setItem('vm.layout', 'B');
        return 'B';
      }
    }
    return stored || 'B';
  }

  var state = {
    // 'morning' | 'evening' | 'now' (départ immédiat) ; null = auto sur l'heure
    trip: null,
    layout: initialLayout(),
    options: null,
    config: { configured: false, trip: null },
    source: 'mock',
    error: null,
    offline: false,
    form: null,          // valeurs saisies dans Réglages, conservées entre deux rendus
    saving: false,
    saveMsg: null,
    stepping: false,
    stepMsg: null,
    // Import GPX : le fichier choisi survit aux rendus, l'<input type=file>
    // étant remis à zéro à chaque réécriture du formulaire.
    gpx: { direction: 'morning', speed: '18', file: null, busy: false, msg: null },
    field: { available: false, cells: [] },
    demoRain: localStorage.getItem('vm.demo-rain') === '1',
    debug: localStorage.getItem('vm.debug') === '1',
    // Replay : "YYYY-MM-DDTHH:MM" d'une averse passée, ou vide pour le direct.
    replay: localStorage.getItem('vm.replay') || '',
    showers: null,
    showersBusy: false,
    models: null,        // dernier relevé de comparaison, mode debug
    modelsBusy: false,
    modelsMsg: null,
    basemap: localStorage.getItem('vm.basemap') || 'osm',
    engine: localStorage.getItem('vm.engine') || 'maison',
    // Décalage temporaire du départ, en minutes. Volontairement non persisté :
    // c'est un « et si je partais 20 minutes plus tard », pas un réglage.
    shift: 0,
    markers: {
      start: localStorage.getItem('vm.icon.start') || '🏠',
      end: localStorage.getItem('vm.icon.end') || '🏢',
      cursor: localStorage.getItem('vm.icon.cursor') || '🚴'
    }
  };

  UI.setBasemap(state.basemap);
  UI.setEngine(state.engine);
  UI.setMarkers(state.markers);

  /** Minutes depuis minuit pour un "HH:MM". */
  function hhmmToMin(v) {
    var p = String(v || '').split(':');
    var h = parseInt(p[0], 10), m = parseInt(p[1], 10);
    return (isFinite(h) && isFinite(m)) ? h * 60 + m : null;
  }

  /**
   * Trajet affiché par défaut : le **prochain à venir**, pas un horaire fixe.
   *
   * Tant que le trajet du matin n'est pas terminé, c'est lui qui compte ; puis
   * celui du soir ; une fois le soir passé, c'est déjà le matin du lendemain
   * qui intéresse — le serveur bascule alors la prévision sur demain de
   * lui-même. On raisonne sur la fin du trajet, pas sur le départ : ouvrir
   * l'app en roulant doit montrer le trajet en cours.
   *
   * Sans trajet configuré, on garde la bascule à 13 h du mode maquette.
   */
  function currentTrip() {
    if (state.trip === 'now') return nowDirection();
    if (state.trip) return state.trip;   // bascule manuelle : elle prime

    var t = state.config && state.config.trip;
    var now = new Date();
    var mins = now.getHours() * 60 + now.getMinutes();

    if (!t) return mins < 13 * 60 ? 'morning' : 'evening';

    var startM = hhmmToMin(t.morning_time), startE = hhmmToMin(t.evening_time);
    if (startM === null || startE === null) return mins < 13 * 60 ? 'morning' : 'evening';

    var endM = startM + ((t.routes && t.routes.morning.duration_min) || 0);
    var endE = startE + ((t.routes && t.routes.evening.duration_min) || 0);

    if (mins <= endM) return 'morning';
    if (mins <= endE) return 'evening';
    return 'morning';   // la journée est faite : place à demain matin
  }

  /** Le bouton « Maintenant » est-il actif ? */
  function isNow() { return state.trip === 'now'; }

  /**
   * Direction d'un départ immédiat : celle dont l'horaire habituel est le plus
   * proche de l'heure qu'il est, dans un sens ou dans l'autre.
   *
   * Ce n'est pas la même question que « quel est le prochain trajet » : à 22 h
   * le prochain est l'aller de demain matin, mais si on part *maintenant*,
   * c'est évidemment vers la maison. On mesure donc un écart circulaire à
   * l'horaire de chaque sens, et le plus proche gagne.
   */
  function nowDirection() {
    var t = state.config && state.config.trip;
    var mins = new Date().getHours() * 60 + new Date().getMinutes();
    if (!t) return mins < 13 * 60 ? 'morning' : 'evening';

    var startM = hhmmToMin(t.morning_time), startE = hhmmToMin(t.evening_time);
    if (startM === null || startE === null) return mins < 13 * 60 ? 'morning' : 'evening';

    var gap = function (start) {
      var d = Math.abs(mins - start);
      return Math.min(d, 1440 - d);
    };
    return gap(startM) <= gap(startE) ? 'morning' : 'evening';
  }

  /* ---------- accès données (API puis repli local) ---------- */

  function get(url, fallback) {
    return fetch(url, { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .catch(function () { state.offline = true; return fallback(); });
  }

  function send(method, url, body) {
    return fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      if (r.status === 204) return null;
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(j && j.error ? j.error : 'HTTP ' + r.status);
        return j;
      });
    });
  }

  /** Suffixe de décalage, ajouté à toute requête qui dépend de l'heure de départ. */
  function sh() {
    return (state.shift ? '&shift=' + state.shift : '') +
           (state.replay ? '&replay=' + encodeURIComponent(state.replay) : '') +
           (isNow() ? '&now=1' : '');
  }

  /** L'averse simulée vaut pour tout l'écran, pas seulement pour la carte. */
  function dm() { return state.demoRain ? '&demo=1' : ''; }

  var api = {
    route: function (t) { return get('/api/route?type=' + t + sh(), function () { return MOCK.route(t); }); },
    weather: function (t) { return get('/api/weather?type=' + t + sh() + dm(), function () { return MOCK.weather(t); }); },
    wind: function (t) { return get('/api/wind?type=' + t + sh(), function () { return MOCK.wind(t); }); },
    windows: function (t) { return get('/api/stats/windows?type=' + t + sh() + dm(), function () { return MOCK.windows(t); }); },
    history: function () { return get('/api/stats/history', function () { return MOCK.history(); }); },
    options: function () { return get('/api/options', function () { return MOCK.options; }); },
    trip: function () { return get('/api/trip', function () { return MOCK.trip; }); },
    showers: function () { return get('/api/debug/showers', function () { return null; }); },
    models: function (t, log) {
      return get('/api/debug/models?type=' + t + sh() + (log ? '&log=1' : ''),
                 function () { return null; });
    },
    field: function (t) {
      return get('/api/radar?type=' + t + sh() + dm(),
                 function () { return { available: false, cells: [] }; });
    }
  };

  /** Recharge les nuages de pluie : ils suivent le trajet affiché et l'heure. */
  function refreshField(keepFrame) {
    return api.field(currentTrip()).then(function (f) {
      state.field = f || { available: false, cells: [] };
      UI.setField(state.field);
      // Un décalage garde le point regardé : seules les heures ont bougé, pas
      // les points de passage. Un changement de trajet, lui, repart du départ.
      if (!keepFrame) {
        UI.setFrame(0);
        UI.setOverview(false);
      }
      return state.field;
    });
  }

  /* ---------- coquille ---------- */

  var view = d.getElementById('view');
  var topbar = d.getElementById('topbar');

  // Trajet affiché par la page en cours : le curseur de la carte y lit le nom
  // et l'heure de chaque point de passage.
  var shownRoute = null;

  /** Bandeau d'origine des données, en haut de chaque page. */
  function sourceBar(forDate) {
    if (state.error) {
      return '<div class="mockbar warn-bar">⚠️ Prévisions indisponibles · repli sur la maquette<br>' +
        '<span style="text-transform:none;letter-spacing:0;font-weight:500">' + esc(state.error) + '</span></div>';
    }
    if (state.source === 'demo') {
      return '<div class="mockbar warn-bar">☔ Averse simulée · tout l’écran tourne sur le jeu d’essai</div>';
    }
    if (state.source === 'replay') {
      return '<div class="mockbar warn-bar">🎞️ Replay du ' + esc(prettyReplay(state.replay)) +
        ' · prévisions réellement émises ce jour-là</div>';
    }
    if (state.source === 'live') {
      return '<div class="livebar">✅ Données réelles · Open-Meteo' +
        (forDate ? ' · trajet du ' + esc(forDate.split('-').reverse().join('/')) : '') + '</div>';
    }
    return '<div class="mockbar">Maquette · données fictives' + (state.offline ? ' · hors-ligne' : '') + '</div>';
  }

  function setupCta() {
    return '<section class="card card-pad">' +
      '<div style="font-weight:700;margin-bottom:6px">Aucun trajet configuré</div>' +
      '<div class="small muted" style="margin-bottom:12px">Renseigne ton domicile, ton lieu de travail et tes horaires : ' +
      'l’app calculera ton itinéraire vélo réel et la météo sur chaque point de passage.</div>' +
      '<a class="btn" href="#/reglages">⚙️ Configurer mon trajet</a>' +
    '</section>';
  }

  function setTabs(path) {
    Array.prototype.forEach.call(d.querySelectorAll('.tabbar a'), function (a) {
      if (a.getAttribute('data-tab') === path) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  function setSwitch(show) {
    topbar.classList.toggle('no-switch', !show);
    var t = isNow() ? 'now' : currentTrip();
    Array.prototype.forEach.call(d.querySelectorAll('#trip-switch button'), function (b) {
      b.setAttribute('aria-selected', b.getAttribute('data-trip') === t ? 'true' : 'false');
    });
  }

  /** Mémorise l'origine des données renvoyée par l'API. */
  function noteSource(res) {
    state.source = res && res.source ? res.source : 'mock';
    state.error = (res && res.error) || null;
    return res;
  }

  /* ---------- page : Aujourd'hui ---------- */

  /**
   * Chaque bloc qui dépend de l'heure de départ est adressable, pour pouvoir
   * être réécrit seul lors d'un décalage. `display:contents` rend l'enveloppe
   * transparente : elle ne change rien à la mise en page.
   */
  function block(name, html) {
    return '<div data-block="' + name + '" style="display:contents">' + html + '</div>';
  }

  /** Les blocs liés au temps, dans l'ordre attendu par chaque layout. */
  function homeBlocks(route, weather, wind) {
    var seuil = state.options ? state.options.rain_alert_threshold_mm : 0.5;
    var v = UI.verdictOf(weather, seuil);
    var compact = state.layout === 'B';

    return {
      source: sourceBar(weather.for_date),
      verdict: UI.verdictCard(weather, v, compact),
      profile: UI.profileStrip(route, weather),
      wind: UI.windCard(wind),
      summary: UI.routeSummary(route)
    };
  }

  function pageHome() {
    var t = currentTrip();
    setSwitch(true);
    return Promise.all([api.route(t), api.weather(t), api.wind(t), refreshField()]).then(function (res) {
      var route = res[0], weather = noteSource(res[1]), wind = res[2];
      shownRoute = route;
      UI.setShown(route, weather);

      var b = homeBlocks(route, weather, wind);
      var head = block('source', b.source) + (state.config.configured ? '' : setupCta());

      var cta =
        '<a class="btn" href="#/creneaux">⏱️ Voir le meilleur créneau</a>' +
        '<a class="btn ghost" href="#/historique">📊 Historique du vélotaf</a>';

      // Carte, curseur et graphe forment un seul bloc : trois vues du même
      // trajet, qui se synchronisent entre elles.
      if (state.layout === 'B') {
        return head +
          UI.radarMap(route, weather) +
          block('verdict', b.verdict) +
          block('profile', b.profile) +
          block('wind', b.wind) +
          block('summary', b.summary) +
          cta;
      }

      if (state.layout === 'C') {
        return head +
          block('verdict', b.verdict) +
          block('profile', b.profile) +
          block('wind', b.wind) +
          '<details class="acc"><summary>Carte et pluie du trajet</summary>' +
            '<div class="acc-body">' + UI.radarMap(route, weather) + '</div></details>' +
          cta;
      }

      // Même en A, la carte passe avant le graphe : elle donne le contexte que
      // le graphe suppose connu, et les deux ne font plus qu'un bloc.
      return head +
        block('verdict', b.verdict) +
        block('profile', b.profile) +
        block('wind', b.wind) +
        UI.radarMap(route, weather) +
        block('summary', b.summary) +
        cta;
    });
  }

  /**
   * Rafraîchit **uniquement** ce qui dépend de l'heure de départ : verdict,
   * profil, vent, résumé, bandeau, plus le curseur, le graphe et la couche de
   * pluie de la carte.
   *
   * Un rendu complet remonterait la carte, donc rechargerait ses tuiles : tout
   * l'écran clignotait à chaque appui sur ±10 min, alors que le tracé, lui, ne
   * bouge pas d'un pixel.
   */
  function refreshTime() {
    var t = currentTrip();
    return Promise.all([api.route(t), api.weather(t), api.wind(t), refreshField(true)])
      .then(function (res) {
        var route = res[0], weather = noteSource(res[1]), wind = res[2];
        shownRoute = route;
        UI.setShown(route, weather);

        var b = homeBlocks(route, weather, wind);
        Object.keys(b).forEach(function (name) {
          var el = view.querySelector('[data-block="' + name + '"]');
          if (el) el.innerHTML = b[name];
        });

        // Curseur, graphe et calque de pluie ; les tuiles ne sont pas touchées.
        UI.syncSelection(view);
      })
      .catch(function () { render(true); });   // en dernier recours, rendu complet
  }

  /* ---------- page : Créneaux ---------- */

  function pageWindows() {
    var t = currentTrip();
    setSwitch(true);
    return Promise.all([api.windows(t), api.route(t)]).then(function (res) {
      var payload = noteSource(res[0]);
      var slots = payload.windows, route = res[1];
      shownRoute = route;
      UI.setShown(route, null);
      var best = slots.reduce(function (a, b) { return b.score > a.score ? b : a; }, slots[0]);
      var usual = slots.filter(function (s) { return s.is_usual; })[0] ||
                  slots.filter(function (s) { return s.time === route.departure; })[0];

      var ref = payload.departure_now ? 'qu’un départ immédiat' : 'que d’habitude';
      var delta = '';
      if (usual) {
        var dm = diffMin(usual.time, best.time);
        delta = dm === 0
          ? (payload.departure_now
              ? 'C’est le moment : pars maintenant.'
              : 'C’est déjà ton horaire habituel : rien à changer.')
          : 'Soit ' + Math.abs(dm) + ' min ' + (dm > 0 ? 'plus tard' : 'plus tôt') + ' ' + ref + '.';
      }

      var rows = slots.map(function (s) {
        var color = s.verdict === 'sec' ? 'var(--ok)' : s.verdict === 'risque' ? 'var(--warn)' : 'var(--bad)';
        var isUsual = s.is_usual || (usual && s.time === usual.time);
        return '<div class="slot' + (s === best ? ' best' : '') + (isUsual ? ' now' : '') + '">' +
          '<div class="slot-time">' + esc(s.time) + '</div>' +
          '<div>' +
            '<div class="bar"><i style="width:' + Math.max(2, s.score) + '%;background:' + color + '"></i></div>' +
            '<div class="slot-meta">' + num(s.mm, 2) + ' mm · ' + s.prob_max + ' % · vent ' + s.wind_kmh + ' km/h' +
              (isUsual ? ' · <b>' + (payload.departure_now ? 'maintenant' : 'ton horaire') + '</b>' : '') + '</div>' +
          '</div>' +
          '<span class="pill ' + s.verdict + '">' + (s.verdict === 'sec' ? 'sec' : s.verdict === 'risque' ? 'risqué' : 'pluie') + '</span>' +
        '</div>';
      }).join('');

      return sourceBar() +
        '<section class="card">' +
          '<div class="hero-slot ' + best.verdict + '">' +
            '<div>' +
              '<div class="small muted" style="text-transform:uppercase;letter-spacing:.06em;font-weight:700">Meilleur créneau</div>' +
              '<div class="big">' + esc(best.time) + '</div>' +
              '<div class="small">' + num(best.mm, 2) + ' mm · ' + best.prob_max + ' % de proba · vent ' + best.wind_kmh + ' km/h</div>' +
            '</div>' +
          '</div>' +
          (delta ? '<div class="card-pad small muted" style="border-top:1px solid var(--line)">' + esc(delta) + '</div>' : '') +
        '</section>' +
        '<section class="card">' +
          '<div class="card-pad" style="padding-bottom:6px"><div class="card-title">Tous les départs possibles</div></div>' +
          rows +
        '</section>' +
        '<div class="note">Le score combine cumul de pluie, probabilité, vent de face et écart à ton horaire habituel. Barème à affiner.</div>' +
        '<a class="btn ghost" href="#/">← Retour au trajet du jour</a>';
    });
  }

  function diffMin(a, b) {
    function m(s) { var p = String(s).split(':'); return (+p[0]) * 60 + (+p[1]); }
    return m(b) - m(a);
  }

  /* ---------- page : Historique ---------- */

  function pageHistory() {
    setSwitch(false);
    return api.history().then(function (data) {
      var s = data.summary;
      var dow = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
      var head = dow.map(function (x) { return '<div>' + x + '</div>'; }).join('');

      var offset = (data.days[0].weekday + 6) % 7;
      var pad = '';
      for (var k = 0; k < offset; k++) pad += '<div></div>';

      var cells = pad + data.days.map(function (day) {
        var label = day.date.slice(8) + '/' + day.date.slice(5, 7);
        return '<div class="hcell" title="' + label + '">' +
          '<div class="hhalf ' + day.morning + '"></div>' +
          '<div class="hhalf ' + day.evening + '"></div>' +
        '</div>';
      }).join('');

      return '<div class="mockbar">Historique encore fictif · enregistrement réel à venir</div>' +
        '<section class="card card-pad">' +
          '<div class="card-title">3 dernières semaines</div>' +
          '<div class="verdict-stats" style="margin-top:0">' +
            '<div class="stat"><b>' + s.taux_sec + ' %</b><span>trajets secs</span></div>' +
            '<div class="stat"><b>' + s.mouilles + '</b><span>trajets mouillés</span></div>' +
            '<div class="stat"><b>' + s.serie_seche + '</b><span>jours secs d’affilée</span></div>' +
          '</div>' +
        '</section>' +
        '<section class="card card-pad">' +
          '<div class="card-title">Calendrier matin / soir</div>' +
          '<div class="hdow">' + head + '</div>' +
          '<div class="hgrid">' + cells + '</div>' +
          '<div class="legend" style="padding-bottom:0">' +
            '<span><i style="background:color-mix(in srgb,var(--ok) 55%,transparent)"></i>sec</span>' +
            '<span><i style="background:var(--rain-3)"></i>pluie</span>' +
            '<span>haut = matin · bas = soir</span>' +
          '</div>' +
        '</section>' +
        '<section class="card card-pad">' +
          '<div class="card-title">Cumul</div>' +
          '<div class="small muted">' + num(s.mm_total) + ' mm reçus sur ' + s.trajets + ' trajets. ' +
          'Les vrais chiffres arriveront quand chaque trajet sera enregistré dans /data au fil des jours.</div>' +
        '</section>';
    });
  }

  /* ---------- page : Réglages ---------- */

  /** Valeurs du formulaire : saisie en cours, sinon trajet enregistré, sinon options de l'add-on. */
  function formValues() {
    if (state.form) return state.form;
    var t = state.config.trip, o = state.options || {};
    state.form = {
      home_address: t ? t.home.query : (o.home_address || ''),
      work_address: t ? t.work.query : (o.work_address || ''),
      morning_time: t ? t.morning_time : (o.morning_departure_time || '08:00'),
      evening_time: t ? t.evening_time : (o.evening_departure_time || '18:00')
    };
    return state.form;
  }

  /**
   * Nom du fichier sélectionné (avant import) ou importé (après). Isolé parce
   * qu'il est réécrit seul, sans repasser par un rendu complet de la page.
   */
  function gpxFileLine() {
    var g = state.gpx;
    var t = state.config.trip;
    if (g.file) return '📄 Fichier choisi : <b>' + esc(g.file.name) + '</b>';
    if (t && t.source === 'gpx' && t.gpx_file) {
      return '📄 Trace en place : <b>' + esc(t.gpx_file) + '</b>' +
        (t.gpx_name ? ' <span class="muted">· ' + esc(t.gpx_name) + '</span>' : '');
    }
    return '<span class="muted">Aucune trace importée.</span>';
  }

  /**
   * Pas de temps entre deux points de passage. Sous 15 minutes, Open-Meteo
   * renvoie le même créneau pour plusieurs points consécutifs : on gagne en
   * finesse **spatiale** (des endroits différents), pas temporelle.
   */
  var STEPS = [
    { key: '5', label: '5 minutes', desc: 'Le défaut, et le plus fin. Open-Meteo ne descend pas sous 15 min : plusieurs points liront le même créneau, mais à des endroits différents, donc sur des intensités différentes.' },
    { key: '10', label: '10 minutes', desc: 'Bon compromis sur un trajet d’une heure.' },
    { key: '15', label: '15 minutes', desc: 'Cale exactement sur le pas d’Open-Meteo : un point, un créneau.' },
    { key: '30', label: '30 minutes', desc: 'Vue d’ensemble, peu de points. Utile sur les longs trajets.' },
    { key: 'auto', label: 'Automatique', desc: '8 points quelle que soit la durée. L’ancien défaut, un compromis qui tient sur tous les trajets.' }
  ];

  /** Carte « Pas de temps » de la page Réglages. */
  function stepCard() {
    var t = state.config.trip;
    if (!t) return '';

    var cur = String(t.step_min || '5');
    var opts = STEPS.map(function (o) {
      return '<button class="opt" data-step="' + o.key + '" aria-checked="' + (cur === o.key) +
        '" role="radio"' + (state.stepping ? ' disabled' : '') + '><span class="mark"></span>' +
        '<span><span class="t">' + esc(o.label) + '</span>' +
        '<span class="d">' + esc(o.desc) + '</span></span></button>';
    }).join('');

    var msg = state.stepMsg
      ? '<div class="card-pad" style="padding-top:0"><div class="formmsg ' + state.stepMsg.kind + '">' +
        esc(state.stepMsg.text) + '</div></div>'
      : '';

    return '<section class="card">' +
        '<div class="card-pad" style="padding-bottom:4px"><div class="card-title">Pas de temps</div></div>' +
        '<div class="opt-list" role="radiogroup">' + opts + '</div>' + msg +
        '<div class="card-pad"><div class="note">Décide du nombre de points de passage, donc du nombre de crans du ' +
        'curseur et de colonnes du graphe. Actuellement <b>' + t.routes.morning.points + ' points</b> à l’aller. ' +
        'Le changement rééchantillonne le trajet déjà mémorisé : ni géocodage ni calcul d’itinéraire, ' +
        'c’est instantané.</div></div>' +
      '</section>';
  }

  /**
   * Carte « Mode debug » : comparaison des modèles Open-Meteo sur le trajet et
   * le créneau courants. Repliée par défaut — c'est un outil de mise au point,
   * pas un écran d'usage.
   */
  function debugCard() {
    var head = '<section class="card">' +
      '<div class="card-pad" style="padding-bottom:4px"><div class="card-title">Mode debug</div></div>' +
      '<div class="opt-list" role="group">' +
        '<button class="opt" data-action="toggle-debug" aria-checked="' + state.debug + '" role="checkbox">' +
          '<span class="mark"></span>' +
          '<span><span class="t">Comparer les modèles météo</span>' +
          '<span class="d">Affiche côte à côte ce que prévoient plusieurs modèles pour le même trajet et le même créneau. Utile même par temps sec : c’est là qu’on voit lesquels divergent.</span></span>' +
        '</button>' +
      '</div>';

    if (!state.debug) return head + '</section>';

    var m = state.models;
    var body;

    if (state.modelsBusy) body = '<div class="card-pad"><div class="note">Interrogation des modèles…</div></div>';
    else if (!m) body = '<div class="card-pad"><div class="note">Aucun relevé. Un trajet doit être configuré.</div></div>';
    else {
      var rows = m.models.map(function (mo) {
        var on = mo.name === m.current;
        return '<tr' + (on ? ' class="on"' : '') + '>' +
          '<td>' + esc(mo.name.replace('meteofrance_', 'mf ').replace(/_/g, ' ')) + (on ? ' •' : '') + '</td>' +
          '<td>' + (mo.available ? num(mo.total_mm, 2) : '—') + '</td>' +
          '<td>' + (mo.max_rate === null ? '—' : num(mo.max_rate)) + '</td>' +
          '<td>' + (mo.max_prob === null ? '—' : mo.max_prob + ' %') + '</td>' +
        '</tr>';
      }).join('');

      body = '<div class="card-pad" style="padding-top:0">' +
        '<div class="small muted" style="margin-bottom:8px">Départ ' + esc(m.at.replace('T', ' à ')) +
          ' · ' + m.points.length + ' points de passage</div>' +
        '<div class="dbg-wrap"><table class="dbg">' +
          '<thead><tr><th>modèle</th><th>cumul</th><th>pic</th><th>proba</th></tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table></div>' +
        '<div class="note" style="margin-top:8px">Cumul en mm sur le trajet, pic en mm/h, probabilité maximale. ' +
        'Le point • marque le modèle utilisé par l’app. Météo-France ne publie pas de probabilité via Open-Meteo, ' +
        'd’où les tirets.</div>' +
      '</div>';
    }

    var msg = state.modelsMsg
      ? '<div class="card-pad" style="padding-top:0"><div class="formmsg ' + state.modelsMsg.kind + '">' +
        esc(state.modelsMsg.text) + '</div></div>'
      : '';

    return head + body + msg +
      '<div class="form"><button class="btn ghost" data-action="log-models"' +
        (state.modelsBusy ? ' disabled' : '') + '>📈 Enregistrer ce relevé</button></div>' +
      '<div class="card-pad"><div class="note">Chaque relevé est ajouté à <code>/data/models-log.ndjson</code>. ' +
      'Une automatisation Home Assistant qui appelle <code>/api/debug/models?type=morning&amp;log=1</code> ' +
      'une fois par jour constitue l’historique toute seule.</div></div>' +
    '</section>';
  }

  var MARKER_ROLES = [
    { key: 'start', label: 'Départ' },
    { key: 'end', label: 'Arrivée' },
    { key: 'cursor', label: 'Position sur le trajet' }
  ];

  /** Carte « Repères de la carte » de la page Réglages. */
  function markersCard() {
    var sets = UI.markerSets();
    var rows = MARKER_ROLES.map(function (r) {
      var picks = sets[r.key].map(function (ic) {
        return '<button type="button" class="icon-pick" data-icon-role="' + r.key + '" ' +
          'data-icon="' + esc(ic) + '" aria-pressed="' + (state.markers[r.key] === ic) + '">' +
          esc(ic) + '</button>';
      }).join('');
      return '<div class="icon-row"><span class="k">' + esc(r.label) + '</span>' +
        '<span class="icon-picks">' + picks + '</span></div>';
    }).join('');

    return '<section class="card">' +
        '<div class="card-pad" style="padding-bottom:4px"><div class="card-title">Repères de la carte</div></div>' +
        '<div class="card-pad" style="padding-top:0">' + rows + '</div>' +
        '<div class="card-pad" style="padding-top:0"><div class="note">Départ, arrivée et position sur le trajet ' +
        'ont chacun leur icône. Par défaut 🏠 / 🏢 / 🚴 : trois formes franchement différentes, ' +
        'là où trois pastilles de couleur se ressemblaient trop.</div></div>' +
      '</section>';
  }

  /** Carte « Fond de carte » de la page Réglages. */
  function basemapCard() {
    var opts = UI.basemapKeys().map(function (k) {
      return '<button class="opt" data-basemap="' + k + '" aria-checked="' + (state.basemap === k) +
        '" role="radio"><span class="mark"></span>' +
        '<span><span class="t">' + esc(UI.basemapName(k)) + '</span>' +
        '<span class="d">' + esc(BASEMAP_DESC[k] || '') + '</span></span></button>';
    }).join('');

    return '<section class="card">' +
        '<div class="card-pad" style="padding-bottom:4px"><div class="card-title">Fond de carte</div></div>' +
        '<div class="opt-list" role="radiogroup">' + opts + '</div>' +
        '<div class="card-pad"><div class="note">Les fonds IGN viennent de la Géoplateforme, ' +
        'sans clé d’API et sous Licence Ouverte Etalab. La carte se déplace au doigt et se zoome ' +
        'au pincement, à la molette ou avec les boutons ; ⌖ la recadre sur le trajet.</div></div>' +
      '</section>' +

      '<section class="card">' +
        '<div class="card-pad" style="padding-bottom:4px"><div class="card-title">Moteur de carte</div></div>' +
        '<div class="opt-list" role="radiogroup">' +
          UI.engineKeys().map(function (k) {
            return '<button class="opt" data-engine="' + k + '" aria-checked="' + (state.engine === k) +
              '" role="radio"><span class="mark"></span>' +
              '<span><span class="t">' + esc(ENGINE_DESC[k].name) + '</span>' +
              '<span class="d">' + esc(ENGINE_DESC[k].desc) + '</span></span></button>';
          }).join('') +
        '</div>' +
        '<div class="card-pad"><div class="note">Les deux moteurs affichent exactement les mêmes ' +
        'tuiles. Sur un écran haute densité, ils demandent tous deux le zoom au-dessus en tuiles ' +
        'à demi-taille : c’est de là que vient la netteté, pas de la bibliothèque.</div></div>' +
      '</section>';
  }

  /** "2026-08-28T08:30" → "28/08/2026 à 08:30". */
  function prettyReplay(v) {
    if (!v) return '';
    return v.slice(8, 10) + '/' + v.slice(5, 7) + '/' + v.slice(0, 4) + ' à ' + v.slice(11);
  }

  /**
   * Carte « Rejouer une averse » : la liste des vraies averses passées du
   * trajet, à rejouer d'un clic.
   *
   * L'averse simulée sert à juger le rendu ; celle-ci sert à juger l'app sur ce
   * qui est vraiment tombé — carte, graphe, profil et verdict compris.
   */
  function replayCard() {
    var head = '<section class="card">' +
      '<div class="card-pad" style="padding-bottom:6px"><div class="card-title">Rejouer une averse passée</div></div>';

    if (state.replay) {
      head += '<div class="card-pad" style="padding-top:0">' +
        '<div class="formmsg ok">🎞️ Replay en cours : ' + esc(prettyReplay(state.replay)) + '</div></div>';
    }

    var body;
    if (state.showersBusy) {
      body = '<div class="card-pad"><div class="note">Recherche des averses des quatre derniers mois…</div></div>';
    } else if (!state.showers) {
      body = '<div class="form"><button class="btn ghost" data-action="find-showers">🔎 Chercher les averses passées</button></div>';
    } else if (!state.showers.length) {
      body = '<div class="card-pad"><div class="note">Aucune journée à plus d’1 mm sur le trajet dans la période.</div></div>';
    } else {
      body = '<div class="opt-list" role="group">' + state.showers.map(function (s) {
        var when = s.date + 'T' + (s.peak_hour || '12:00');
        return '<button class="opt" data-replay="' + esc(when) + '" aria-checked="' + (state.replay === when) + '" role="radio">' +
          '<span class="mark"></span>' +
          '<span><span class="t">' + esc(prettyReplay(when)) + '</span>' +
          '<span class="d">' + num(s.peak_mm) + ' mm/h au plus fort · ' + num(s.max_mm) + ' mm sur la journée</span></span>' +
        '</button>';
      }).join('') + '</div>';
    }

    return head + body +
      (state.replay ? '<div class="form"><button class="btn ghost" data-replay="">↩︎ Revenir au direct</button></div>' : '') +
      '<div class="card-pad"><div class="note">Les prévisions rejouées sont celles que les modèles avaient ' +
      '<b>réellement émises</b> ce jour-là, pas une reconstitution. L’heure proposée est celle du pic mesuré : ' +
      'c’est là que la carte a quelque chose à montrer.</div></div>' +
    '</section>';
  }

  /**
   * Carte « Nuages de pluie » de la page Réglages : état de la couche, et
   * interrupteur d'averse simulée. Sans lui, valider le rendu des nuages
   * demande d'attendre qu'il pleuve vraiment au-dessus du trajet — autant dire
   * jamais au moment où on regarde.
   */
  function radarCard() {
    var f = state.field || {};
    var wet = (f.cells || []).filter(function (c) { return c.rate >= 0.05; }).length;
    var etat;
    if (f.source === 'demo') etat = '☔ Averse simulée · ' + wet + ' cases de la grille arrosées';
    else if (f.available) {
      etat = '✅ Couche active · ' + (f.cells || []).length + ' points interrogés' +
        (wet ? ', ' + wet + ' avec de la pluie' : ', tous secs');
    } else {
      etat = '⚠️ Couche indisponible' + (f.error ? ' · ' + esc(f.error) : ' · aucun trajet configuré');
    }

    return '<section class="card">' +
        '<div class="card-pad" style="padding-bottom:4px"><div class="card-title">Nuages de pluie</div></div>' +
        '<div class="opt-list" role="group">' +
          '<button class="opt" data-action="toggle-demo-rain" aria-checked="' + state.demoRain + '" role="checkbox">' +
            '<span class="mark"></span>' +
            '<span><span class="t">Simuler une averse</span>' +
            '<span class="d">Fait traverser la carte à une averse fictive, de la bruine à l’averse forte, pour juger le rendu et l’échelle de couleur sans attendre la vraie pluie. Le verdict et les chiffres ne changent pas.</span></span>' +
          '</button>' +
        '</div>' +
        '<div class="card-pad"><div class="small muted">' + etat + '</div>' +
        '<div class="note" style="margin-top:8px">Modèle <b>Météo-France AROME</b> (1,5 km) via Open-Meteo, sur une grille ' +
        'd’environ 900 m autour du trajet. Les nuages valent pour <b>l’heure de passage</b>.</div>' +
        '<div class="note" style="margin-top:8px">C’est une <b>prévision</b>, pas un radar : elle ne montre pas ce qui tombe ' +
        'en ce moment. Un écart avec une image radar (weather.com, MétéoCiel…) est normal — l’une observe, l’autre anticipe. ' +
        'RainViewer a par ailleurs été écarté : ses tuiles s’arrêtent au zoom 7 en accès libre, bien trop grossier à ' +
        'l’échelle d’un vélotaf.</div></div>' +
      '</section>';
  }

  /** Carte « Importer une trace GPX » de la page Réglages. */
  function gpxCard() {
    var g = state.gpx;
    var msg = g.msg ? '<div class="formmsg ' + g.msg.kind + '">' + esc(g.msg.text) + '</div>' : '';

    return '<section class="card">' +
        '<div class="card-pad" style="padding-bottom:6px"><div class="card-title">Importer une trace GPX</div></div>' +
        '<div class="form">' +
          '<label class="field"><span>Fichier .gpx</span>' +
            '<input type="file" name="gpx_file" accept=".gpx,application/gpx+xml,text/xml"></label>' +
          '<div class="small filename" data-gpx-name>' + gpxFileLine() + '</div>' +
          // Un select à mi-largeur tronque les deux libellés sur un téléphone.
          '<label class="field"><span>Sens de la trace</span>' +
            '<select name="gpx_direction">' +
              '<option value="morning"' + (g.direction === 'morning' ? ' selected' : '') + '>Aller · domicile → travail</option>' +
              '<option value="evening"' + (g.direction === 'evening' ? ' selected' : '') + '>Retour · travail → domicile</option>' +
            '</select></label>' +
          '<label class="field"><span>Vitesse moyenne (km/h)</span>' +
            '<input type="number" name="gpx_speed" min="5" max="45" step="1" inputmode="numeric" value="' + esc(g.speed) + '"></label>' +
          msg +
          '<button class="btn ghost" data-action="import-gpx"' + (g.busy ? ' disabled' : '') + '>' +
            (g.busy ? '⏳ Lecture de la trace…' : '📄 Importer cette trace') + '</button>' +
        '</div>' +
        '<div class="card-pad"><div class="note">La trace remplace l’itinéraire calculé : mêmes points de passage, mêmes prévisions. ' +
        'L’autre sens est la trace parcourue à l’envers. La vitesse moyenne ne sert que si la trace n’est pas horodatée — ' +
        'sinon les horaires viennent du fichier.</div></div>' +
      '</section>';
  }

  function pageSettings() {
    setSwitch(false);
    // refreshField() aussi ici : sans lui, l'état des nuages affiché dans
    // Réglages serait celui du dernier passage sur l'accueil.
    return Promise.all([api.options(), api.trip(), refreshField()]).then(function (res) {
      state.options = res[0];
      state.config = res[1] || { configured: false, trip: null };

      var f = formValues();
      var t = state.config.trip;

      var leg = function (r) {
        return num(r.distance_km) + ' km · ' + r.duration_min + ' min' +
          (r.elevation_gain_m ? ' · +' + r.elevation_gain_m + ' m' : '');
      };

      var resolved = t ? '' +
        '<div class="row"><span class="k">Domicile reconnu</span><span class="v">' + esc(t.home.label) + '</span></div>' +
        '<div class="row"><span class="k">Travail reconnu</span><span class="v">' + esc(t.work.label) + '</span></div>' +
        '<div class="row"><span class="k">Aller</span><span class="v">' + leg(t.routes.morning) + '</span></div>' +
        '<div class="row"><span class="k">Retour</span><span class="v">' + leg(t.routes.evening) + '</span></div>' +
        (t.source === 'gpx'
          ? '<div class="row"><span class="k">Origine</span><span class="v">' +
            esc(t.gpx_file || 'Trace GPX') +
            (t.gpx_name ? ' · ' + esc(t.gpx_name) : '') + '</span></div>'
          : '') : '';

      var msg = state.saveMsg
        ? '<div class="formmsg ' + state.saveMsg.kind + '">' + esc(state.saveMsg.text) + '</div>'
        : '';

      var opts = Object.keys(LAYOUTS).map(function (k) {
        return '<button class="opt" data-layout="' + k + '" aria-checked="' + (state.layout === k) + '" role="radio">' +
          '<span class="mark"></span>' +
          '<span><span class="t">' + esc(LAYOUTS[k].name) + '</span>' +
          '<span class="d">' + esc(LAYOUTS[k].desc) + '</span></span>' +
        '</button>';
      }).join('');

      return '<section class="card">' +
          '<div class="card-pad" style="padding-bottom:6px"><div class="card-title">Mon trajet</div></div>' +
          '<div class="form">' +
            '<label class="field"><span>Adresse du domicile</span>' +
              '<input type="text" name="home_address" autocomplete="off" placeholder="12 rue des Lilas, Nantes" value="' + esc(f.home_address) + '"></label>' +
            '<label class="field"><span>Adresse du travail</span>' +
              '<input type="text" name="work_address" autocomplete="off" placeholder="3 quai de la Fosse, Nantes" value="' + esc(f.work_address) + '"></label>' +
            '<div class="field-row">' +
              '<label class="field"><span>Départ le matin</span>' +
                '<input type="time" name="morning_time" value="' + esc(f.morning_time) + '"></label>' +
              '<label class="field"><span>Départ le soir</span>' +
                '<input type="time" name="evening_time" value="' + esc(f.evening_time) + '"></label>' +
            '</div>' +
            msg +
            '<button class="btn" data-action="save-trip"' + (state.saving ? ' disabled' : '') + '>' +
              (state.saving ? '⏳ Calcul de l’itinéraire…' : '📍 Enregistrer et calculer l’itinéraire') + '</button>' +
            (state.config.configured
              ? '<button class="btn ghost" data-action="clear-trip">Revenir aux données fictives</button>'
              : '') +
          '</div>' +
          resolved +
          '<div class="card-pad"><div class="note">Le géocodage utilise Nominatim (OpenStreetMap) et l’itinéraire vélo une instance OSRM publique. ' +
          'Le calcul prend quelques secondes ; il n’a lieu qu’à l’enregistrement.</div></div>' +
        '</section>' +

        gpxCard() +

        '<section class="card">' +
          '<div class="card-pad" style="padding-bottom:4px"><div class="card-title">Layout de l’accueil</div></div>' +
          '<div class="opt-list" role="radiogroup">' + opts + '</div>' +
        '</section>' +

        basemapCard() +
        stepCard() +
        markersCard() +
        radarCard() +
        replayCard() +

        '<section class="card">' +
          '<div class="card-pad">' +
            '<div class="card-title">État</div>' +
            '<div class="small muted">Version 0.17.0 · ' +
              (state.config.configured ? 'trajet réel configuré' : 'aucun trajet : données fictives') +
              (state.offline ? ' · API injoignable' : '') + '.</div>' +
          '</div>' +
        '</section>' +
        debugCard() +
        '<div class="note">Les valeurs par défaut des adresses et horaires viennent de la configuration de l’add-on dans Home Assistant. ' +
        'Ce que tu saisis ici est enregistré dans /data et survit aux redémarrages.</div>';
    });
  }

  /* ---------- routeur ---------- */

  var ROUTES = { '/': pageHome, '/creneaux': pageWindows, '/historique': pageHistory, '/reglages': pageSettings };

  /**
   * `keepScroll` sert aux rendus déclenchés depuis la page elle-même : sans lui,
   * remonter en haut renvoie le message de confirmation hors de l'écran, et
   * l'utilisateur croit qu'il ne s'est rien passé.
   */
  function render(keepScroll) {
    var path = (location.hash || '#/').slice(1);
    if (!ROUTES[path]) path = '/';
    var y = w.scrollY || w.pageYOffset || 0;
    setTabs(path);
    view.innerHTML = '<div class="note">Chargement…</div>';
    return ROUTES[path]().then(function (html) {
      view.innerHTML = html;
      UI.mountMaps(view, shownRoute);   // les tuiles ont besoin de la largeur réelle du conteneur
      w.scrollTo(0, keepScroll ? y : 0);
    }).catch(function (e) {
      view.innerHTML = '<div class="card card-pad">Erreur d’affichage : ' + esc(e && e.message) + '</div>';
    });
  }

  /* ---------- interactions ---------- */

  d.getElementById('trip-switch').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-trip]');
    if (!b) return;
    state.trip = b.getAttribute('data-trip');
    // « Maintenant », c'est le présent : sortir d'un rejeu va de soi.
    if (isNow() && state.replay) {
      state.replay = '';
      localStorage.removeItem('vm.replay');
    }
    render();
  });

  d.getElementById('btn-refresh').addEventListener('click', function () { render(); });

  // Le formulaire est re-généré à chaque rendu : on garde la saisie en mémoire.
  view.addEventListener('input', function (e) {
    var el = e.target;
    if (!el.name) return;
    if (el.name === 'gpx_speed') { state.gpx.speed = el.value; return; }
    if (!state.form) return;
    if (Object.prototype.hasOwnProperty.call(state.form, el.name)) state.form[el.name] = el.value;
  });

  view.addEventListener('change', function (e) {
    var el = e.target;
    if (el.name === 'gpx_direction') { state.gpx.direction = el.value; return; }
    if (el.name !== 'gpx_file') return;

    state.gpx.file = el.files && el.files[0] ? el.files[0] : null;
    state.gpx.msg = null;
    // Surtout pas de rendu ici : il viderait l'<input type=file>, qui
    // réafficherait « Aucun fichier choisi » juste après la sélection. On met à
    // jour la seule ligne concernée.
    var out = view.querySelector('[data-gpx-name]');
    if (out) out.innerHTML = gpxFileLine();
  });

  view.addEventListener('click', function (e) {
    var sb = e.target.closest('[data-shift]');
    if (sb) {
      var delta = +sb.getAttribute('data-shift');
      applyShift(delta === 0 ? 0 : state.shift + delta);
      return;
    }

    var rp = e.target.closest('[data-replay]');
    if (rp) {
      state.replay = rp.getAttribute('data-replay');
      if (state.replay) localStorage.setItem('vm.replay', state.replay);
      else localStorage.removeItem('vm.replay');
      state.shift = 0;              // le décalage n'a pas de sens sur une date figée
      UI.setShift(0);
      render(true);
      return;
    }

    var st = e.target.closest('.opt[data-step]');
    if (st) { applyStep(st.getAttribute('data-step')); return; }

    var ic = e.target.closest('[data-icon-role]');
    if (ic) {
      var role = ic.getAttribute('data-icon-role');
      state.markers[role] = ic.getAttribute('data-icon');
      localStorage.setItem('vm.icon.' + role, state.markers[role]);
      UI.setMarkers(state.markers);
      render(true);
      return;
    }

    var eng = e.target.closest('.opt[data-engine]');
    if (eng) {
      state.engine = eng.getAttribute('data-engine');
      localStorage.setItem('vm.engine', state.engine);
      UI.setEngine(state.engine);
      render(true);
      return;
    }

    var bm = e.target.closest('.opt[data-basemap]');
    if (bm) {
      state.basemap = bm.getAttribute('data-basemap');
      localStorage.setItem('vm.basemap', state.basemap);
      UI.setBasemap(state.basemap);
      render(true);
      return;
    }

    var opt = e.target.closest('.opt[data-layout]');
    if (opt) {
      state.layout = opt.getAttribute('data-layout');
      localStorage.setItem('vm.layout', state.layout);
      render(true);
      return;
    }

    var btn = e.target.closest('[data-action]');
    if (!btn) return;

    if (btn.getAttribute('data-action') === 'save-trip') saveTrip();
    if (btn.getAttribute('data-action') === 'clear-trip') clearTrip();
    if (btn.getAttribute('data-action') === 'import-gpx') importGpx();

    if (btn.getAttribute('data-action') === 'toggle-debug') {
      state.debug = !state.debug;
      localStorage.setItem('vm.debug', state.debug ? '1' : '0');
      state.modelsMsg = null;
      if (state.debug && !state.models) loadModels(false);
      else render(true);
      return;
    }

    if (btn.getAttribute('data-action') === 'log-models') { loadModels(true); return; }

    if (btn.getAttribute('data-action') === 'find-showers') {
      state.showersBusy = true;
      render(true);
      api.showers().then(function (r) {
        state.showers = (r && r.showers) || [];
      }).then(function () { state.showersBusy = false; render(true); });
      return;
    }

    if (btn.getAttribute('data-action') === 'toggle-demo-rain') {
      state.demoRain = !state.demoRain;
      localStorage.setItem('vm.demo-rain', state.demoRain ? '1' : '0');
      refreshField().then(function () { render(true); });
    }
  });

  /**
   * Décale tout le trajet dans le temps. Chaque cran relance les prévisions :
   * on groupe les clics rapprochés pour ne pas enchaîner les requêtes pendant
   * qu'on martèle le bouton.
   */
  var shiftTimer = null;

  function applyShift(minutes) {
    state.shift = Math.max(-120, Math.min(120, minutes));
    UI.setShift(state.shift);

    if (shiftTimer) clearTimeout(shiftTimer);
    shiftTimer = setTimeout(function () {
      shiftTimer = null;
      var wrap = view.querySelector('.mapwrap');
      if (wrap) wrap.classList.add('pending');
      refreshTime().then(function () {
        var w = view.querySelector('.mapwrap');
        if (w) w.classList.remove('pending');
        var sl = view.querySelector('.mapslider');
        if (sl) sl.classList.remove('pending');
      });
    }, 320);

    // Retour immédiat sur la ligne du curseur, sans attendre le réseau.
    var box = view.querySelector('.mapslider');
    if (box) box.classList.add('pending');
  }

  /** Change le pas de temps : le serveur rééchantillonne le trajet mémorisé. */
  function applyStep(step) {
    if (state.stepping || String((state.config.trip || {}).step_min) === step) return;

    state.stepping = true;
    state.stepMsg = { kind: 'info', text: 'Rééchantillonnage du trajet…' };
    render(true);

    send('PUT', '/api/trip/step', { step_min: step }).then(function (res) {
      state.config = res;
      state.stepMsg = { kind: 'ok', text: 'Trajet redécoupé en ' + res.trip.routes.morning.points + ' points de passage.' };
    }).catch(function (err) {
      state.stepMsg = { kind: 'err', text: err.message || String(err) };
    }).then(function () {
      state.stepping = false;
      render(true);
    });
  }

  /** Interroge les modèles, et enregistre le relevé si `log` est vrai. */
  function loadModels(log) {
    state.modelsBusy = true;
    state.modelsMsg = null;
    render(true);

    api.models(currentTrip(), log).then(function (m) {
      state.models = m;
      if (!m) state.modelsMsg = { kind: 'err', text: 'Comparaison indisponible : aucun trajet configuré ?' };
      else if (log) state.modelsMsg = { kind: 'ok', text: m.logged ? 'Relevé enregistré dans le journal.' : 'Relevé impossible à enregistrer (accès à /data ?).' };
    }).then(function () {
      state.modelsBusy = false;
      render(true);
    });
  }

  function importGpx() {
    var g = state.gpx;
    if (!g.file) {
      g.msg = { kind: 'err', text: 'Choisis d’abord un fichier .gpx.' };
      return render(true);
    }

    var f = formValues();
    var name = g.file.name;
    var qs = '?direction=' + encodeURIComponent(g.direction) +
             '&speed_kmh=' + encodeURIComponent(g.speed) +
             '&morning_time=' + encodeURIComponent(f.morning_time) +
             '&evening_time=' + encodeURIComponent(f.evening_time) +
             '&filename=' + encodeURIComponent(name);

    g.busy = true;
    g.msg = { kind: 'info', text: 'Lecture de ' + name + ' et géocodage du départ…' };
    render(true);

    // Le fichier part tel quel : l'encapsuler en JSON gonflerait une trace de
    // plusieurs mégaoctets pour rien.
    fetch('/api/trip/gpx' + qs, {
      method: 'POST',
      headers: { 'Content-Type': 'application/gpx+xml' },
      body: g.file
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(j && j.error ? j.error : 'HTTP ' + r.status);
        return j;
      });
    }).then(function (res) {
      state.config = res;
      state.form = null;
      var im = res.imported;
      g.file = null;   // le nom réapparaît via le trajet enregistré, pas via l'input
      g.msg = { kind: 'ok', text: name + ' importé : ' + num(im.distance_km) + ' km, ' + im.duration_min + ' min ' +
        (im.timed ? '(durée lue dans la trace)' : '(estimés à ' + g.speed + ' km/h)') +
        (im.elevation_gain_m ? ' · +' + im.elevation_gain_m + ' m de dénivelé' : '') + '.' };
    }).catch(function (err) {
      g.msg = { kind: 'err', text: err.message || String(err) };
    }).then(function () {
      g.busy = false;
      render(true);
    });
  }

  function saveTrip() {
    var f = formValues();
    if (!f.home_address.trim() || !f.work_address.trim()) {
      state.saveMsg = { kind: 'err', text: 'Renseigne les deux adresses.' };
      return render(true);
    }

    var t = state.config.trip;
    // Si seules les heures changent, inutile de refaire géocodage et itinéraire.
    var sameAddresses = t && t.home.query === f.home_address.trim() && t.work.query === f.work_address.trim();

    state.saving = true;
    state.saveMsg = { kind: 'info', text: sameAddresses ? 'Mise à jour des horaires…' : 'Géocodage et calcul des deux itinéraires…' };
    render(true);

    var req = sameAddresses
      ? send('PUT', '/api/trip/times', { morning_time: f.morning_time, evening_time: f.evening_time })
      : send('POST', '/api/trip', {
          home_address: f.home_address.trim(), work_address: f.work_address.trim(),
          morning_time: f.morning_time, evening_time: f.evening_time
        });

    req.then(function (res) {
      state.config = res;
      state.form = null;
      state.saveMsg = { kind: 'ok', text: 'Trajet enregistré. Les prévisions sont maintenant réelles.' };
    }).catch(function (err) {
      state.saveMsg = { kind: 'err', text: err.message || String(err) };
    }).then(function () {
      state.saving = false;
      render(true);
    });
  }

  function clearTrip() {
    state.saving = true;
    render();
    send('DELETE', '/api/trip').catch(function () {}).then(function () {
      state.config = { configured: false, trip: null };
      state.form = null;
      state.saving = false;
      state.saveMsg = { kind: 'info', text: 'Trajet supprimé, retour aux données fictives.' };
      render();
    });
  }

  w.addEventListener('hashchange', function () { render(); });

  Promise.all([api.options(), api.trip()]).then(function (res) {
    state.options = res[0];
    state.config = res[1] || { configured: false, trip: null };
  }).then(function () { render(); });
})(window, document);

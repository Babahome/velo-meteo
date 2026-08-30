/* Vélo Météo - routeur + pages.
   Tant qu'aucun trajet n'est configuré, l'app tourne sur les données fictives.
   Dès que le trajet est enregistré (Réglages), tout passe en données réelles :
   itinéraire OSRM et prévisions Open-Meteo. */
(function (w, d) {
  'use strict';

  var UI = w.VM_UI, MOCK = w.VM_MOCK;
  var esc = UI.esc, num = UI.num;

  var LAYOUTS = {
    A: { name: 'A · Verdict d’abord', desc: 'Verdict → profil de pluie → vent → carte → graphe. Les chiffres avant l’image.' },
    B: { name: 'B · Carte d’abord', desc: 'Carte → graphe de pluie par point de passage → verdict → profil → vent. Le plus visuel.' },
    C: { name: 'C · Coup d’œil', desc: 'Verdict + profil + vent seulement, le reste replié. Une seule hauteur d’écran, zéro scroll.' }
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
    trip: null,          // 'morning' | 'evening' (null = auto selon l'heure)
    layout: initialLayout(),
    options: null,
    config: { configured: false, trip: null },
    source: 'mock',
    error: null,
    offline: false,
    form: null,          // valeurs saisies dans Réglages, conservées entre deux rendus
    saving: false,
    saveMsg: null,
    // Import GPX : le fichier choisi survit aux rendus, l'<input type=file>
    // étant remis à zéro à chaque réécriture du formulaire.
    gpx: { direction: 'morning', speed: '18', file: null, busy: false, msg: null },
    field: { available: false, cells: [] },
    demoRain: localStorage.getItem('vm.demo-rain') === '1'
  };

  function currentTrip() {
    if (state.trip) return state.trip;
    return new Date().getHours() < 13 ? 'morning' : 'evening';
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

  var api = {
    route: function (t) { return get('/api/route?type=' + t, function () { return MOCK.route(t); }); },
    weather: function (t) { return get('/api/weather?type=' + t, function () { return MOCK.weather(t); }); },
    wind: function (t) { return get('/api/wind?type=' + t, function () { return MOCK.wind(t); }); },
    windows: function (t) { return get('/api/stats/windows?type=' + t, function () { return MOCK.windows(t); }); },
    history: function () { return get('/api/stats/history', function () { return MOCK.history(); }); },
    options: function () { return get('/api/options', function () { return MOCK.options; }); },
    trip: function () { return get('/api/trip', function () { return MOCK.trip; }); },
    field: function (t) {
      return get('/api/radar?type=' + t + (state.demoRain ? '&demo=1' : ''),
                 function () { return { available: false, cells: [] }; });
    }
  };

  /** Recharge les nuages de pluie : ils suivent le trajet affiché et l'heure. */
  function refreshField() {
    return api.field(currentTrip()).then(function (f) {
      state.field = f || { available: false, cells: [] };
      UI.setField(state.field);
      // Les images ont changé : le curseur repart au départ du trajet.
      UI.setFrame(0);
      UI.setOverview(false);
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
    var t = currentTrip();
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

  function pageHome() {
    var t = currentTrip();
    setSwitch(true);
    return Promise.all([api.route(t), api.weather(t), api.wind(t), refreshField()]).then(function (res) {
      var route = res[0], weather = noteSource(res[1]), wind = res[2];
      shownRoute = route;
      var seuil = state.options ? state.options.rain_alert_threshold_mm : 0.5;
      var v = UI.verdictOf(weather, seuil);

      var head = sourceBar(weather.for_date) + (state.config.configured ? '' : setupCta());

      var cta =
        '<a class="btn" href="#/creneaux">⏱️ Voir le meilleur créneau</a>' +
        '<a class="btn ghost" href="#/historique">📊 Historique du vélotaf</a>';

      // Carte en premier, puis le graphe de pluie par point de passage :
      // on situe le trajet, puis on lit où ça tombe dessus.
      if (state.layout === 'B') {
        return head +
          UI.radarMap(route) +
          UI.rainChart(weather) +
          UI.verdictCard(weather, v, true) +
          UI.profileStrip(route, weather) +
          UI.windCard(wind) +
          UI.routeSummary(route) +
          cta;
      }

      if (state.layout === 'C') {
        return head +
          UI.verdictCard(weather, v, false) +
          UI.profileStrip(route, weather) +
          UI.windCard(wind) +
          '<details class="acc"><summary>Carte du trajet</summary>' +
            '<div class="acc-body">' + UI.radarMap(route) + '</div></details>' +
          '<details class="acc"><summary>Détail par point de passage</summary>' +
            '<div class="acc-body">' + UI.rainChart(weather) + '</div></details>' +
          cta;
      }

      // Même en A, la carte passe avant le graphe : elle donne le contexte que
      // le graphe suppose connu.
      return head +
        UI.verdictCard(weather, v, false) +
        UI.profileStrip(route, weather) +
        UI.windCard(wind) +
        UI.radarMap(route) +
        UI.rainChart(weather) +
        UI.routeSummary(route) +
        cta;
    });
  }

  /* ---------- page : Créneaux ---------- */

  function pageWindows() {
    var t = currentTrip();
    setSwitch(true);
    return Promise.all([api.windows(t), api.route(t)]).then(function (res) {
      var payload = noteSource(res[0]);
      var slots = payload.windows, route = res[1];
      shownRoute = route;
      var best = slots.reduce(function (a, b) { return b.score > a.score ? b : a; }, slots[0]);
      var usual = slots.filter(function (s) { return s.is_usual; })[0] ||
                  slots.filter(function (s) { return s.time === route.departure; })[0];

      var delta = '';
      if (usual) {
        var dm = diffMin(usual.time, best.time);
        delta = dm === 0
          ? 'C’est déjà ton horaire habituel : rien à changer.'
          : 'Soit ' + Math.abs(dm) + ' min ' + (dm > 0 ? 'plus tard' : 'plus tôt') + ' que d’habitude.';
      }

      var rows = slots.map(function (s) {
        var color = s.verdict === 'sec' ? 'var(--ok)' : s.verdict === 'risque' ? 'var(--warn)' : 'var(--bad)';
        var isUsual = s.is_usual || (usual && s.time === usual.time);
        return '<div class="slot' + (s === best ? ' best' : '') + (isUsual ? ' now' : '') + '">' +
          '<div class="slot-time">' + esc(s.time) + '</div>' +
          '<div>' +
            '<div class="bar"><i style="width:' + Math.max(2, s.score) + '%;background:' + color + '"></i></div>' +
            '<div class="slot-meta">' + num(s.mm, 2) + ' mm · ' + s.prob_max + ' % · vent ' + s.wind_kmh + ' km/h' +
              (isUsual ? ' · <b>ton horaire</b>' : '') + '</div>' +
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
            '<span class="d">Pose une averse fictive au milieu du trajet, pour juger le rendu sans attendre la vraie pluie. Le verdict et les chiffres ne changent pas.</span></span>' +
          '</button>' +
        '</div>' +
        '<div class="card-pad"><div class="small muted">' + etat + '</div>' +
        '<div class="note" style="margin-top:8px">Les nuages viennent d’Open-Meteo, sur une grille d’environ 2 km autour du trajet, ' +
        'et valent pour <b>l’heure de passage</b> — pas pour maintenant comme le ferait une image radar. ' +
        'RainViewer a été écarté : ses tuiles s’arrêtent au zoom 7 en accès libre, bien trop grossier à l’échelle d’un vélotaf.</div></div>' +
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

        radarCard() +

        '<section class="card">' +
          '<div class="card-pad">' +
            '<div class="card-title">État</div>' +
            '<div class="small muted">Version 0.5.1 · ' +
              (state.config.configured ? 'trajet réel configuré' : 'aucun trajet : données fictives') +
              (state.offline ? ' · API injoignable' : '') + '.</div>' +
          '</div>' +
        '</section>' +
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

    if (btn.getAttribute('data-action') === 'toggle-demo-rain') {
      state.demoRain = !state.demoRain;
      localStorage.setItem('vm.demo-rain', state.demoRain ? '1' : '0');
      refreshField().then(function () { render(true); });
    }
  });

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

/* Vélo Météo - routeur + pages.
   Objectif de cette V1 : valider le LAYOUT sur téléphone.
   L'écran d'accueil existe en 3 variantes commutables depuis Réglages, pour
   pouvoir les comparer en conditions réelles avant de figer la structure. */
(function (w, d) {
  'use strict';

  var UI = w.VM_UI, MOCK = w.VM_MOCK;
  var esc = UI.esc;

  /* ---------- état ---------- */

  var LAYOUTS = {
    A: { name: 'A · Verdict d’abord', desc: 'Verdict → profil de pluie → vent → graphe → carte. Le plus rapide à lire avant de partir.' },
    B: { name: 'B · Carte d’abord', desc: 'Carte radar en haut, verdict compact dessous. Plus visuel, demande un scroll pour les chiffres.' },
    C: { name: 'C · Coup d’œil', desc: 'Verdict + profil + vent seulement, le reste replié. Une seule hauteur d’écran, zéro scroll.' }
  };

  var state = {
    trip: null,        // 'morning' | 'evening' (null = auto selon l'heure)
    layout: localStorage.getItem('vm.layout') || 'A',
    options: null,
    offline: false
  };

  function currentTrip() {
    if (state.trip) return state.trip;
    return new Date().getHours() < 13 ? 'morning' : 'evening';
  }

  /* ---------- accès données (API puis repli local) ---------- */

  function get(url, fallback) {
    return fetch(url, { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .catch(function () { state.offline = true; return fallback(); });
  }

  var api = {
    route: function (t) { return get('/api/route?type=' + t, function () { return MOCK.route(t); }); },
    weather: function (t) { return get('/api/weather?type=' + t, function () { return MOCK.weather(t); }); },
    wind: function (t) { return get('/api/wind?type=' + t, function () { return MOCK.wind(t); }); },
    windows: function (t) { return get('/api/stats/windows?type=' + t, function () { return MOCK.windows(t); }); },
    history: function () { return get('/api/stats/history', function () { return MOCK.history(); }); },
    options: function () { return get('/api/options', function () { return MOCK.options; }); }
  };

  /* ---------- coquille ---------- */

  var view = d.getElementById('view');
  var topbar = d.getElementById('topbar');

  function mockbar() {
    return '<div class="mockbar">Maquette · données fictives' + (state.offline ? ' · hors-ligne' : '') + '</div>';
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

  /* ---------- page : Aujourd'hui ---------- */

  function pageHome() {
    var t = currentTrip();
    setSwitch(true);
    return Promise.all([api.route(t), api.weather(t), api.wind(t)]).then(function (res) {
      var route = res[0], weather = res[1], wind = res[2];
      var seuil = state.options ? state.options.rain_alert_threshold_mm : 0.5;
      var v = UI.verdictOf(weather, seuil);

      var cta =
        '<a class="btn" href="#/creneaux">⏱️ Voir le meilleur créneau</a>' +
        '<a class="btn ghost" href="#/historique">📊 Historique du vélotaf</a>';

      if (state.layout === 'B') {
        return mockbar() +
          UI.radarMap(route) +
          UI.verdictCard(weather, v, true) +
          UI.routeSummary(route) +
          UI.profileStrip(route, weather) +
          UI.windCard(wind) +
          UI.rainChart(weather) +
          cta;
      }

      if (state.layout === 'C') {
        return mockbar() +
          UI.verdictCard(weather, v, false) +
          UI.profileStrip(route, weather) +
          UI.windCard(wind) +
          '<details class="acc"><summary>Détail par point de passage</summary>' +
            '<div class="acc-body">' + UI.rainChart(weather) + '</div></details>' +
          '<details class="acc"><summary>Carte du trajet</summary>' +
            '<div class="acc-body">' + UI.radarMap(route) + '</div></details>' +
          cta;
      }

      // Variante A (défaut)
      return mockbar() +
        UI.verdictCard(weather, v, false) +
        UI.profileStrip(route, weather) +
        UI.windCard(wind) +
        UI.rainChart(weather) +
        UI.radarMap(route) +
        UI.routeSummary(route) +
        cta;
    });
  }

  /* ---------- page : Créneaux ---------- */

  function pageWindows() {
    var t = currentTrip();
    setSwitch(true);
    return Promise.all([api.windows(t), api.route(t)]).then(function (res) {
      var slots = res[0].windows, route = res[1];
      var best = slots.reduce(function (a, b) { return b.score > a.score ? b : a; }, slots[0]);
      var usual = slots.filter(function (s) { return s.time === route.departure; })[0];

      var delta = usual
        ? 'Soit ' + Math.abs(diffMin(route.departure, best.time)) + ' min ' +
          (diffMin(route.departure, best.time) > 0 ? 'plus tard' : 'plus tôt') + ' que d’habitude.'
        : '';

      var rows = slots.map(function (s) {
        var color = s.verdict === 'sec' ? 'var(--ok)' : s.verdict === 'risque' ? 'var(--warn)' : 'var(--bad)';
        return '<div class="slot' + (s === best ? ' best' : '') + (s.time === route.departure ? ' now' : '') + '">' +
          '<div class="slot-time">' + s.time + '</div>' +
          '<div>' +
            '<div class="bar"><i style="width:' + s.score + '%;background:' + color + '"></i></div>' +
            '<div class="slot-meta">' + s.mm.toFixed(1).replace('.', ',') + ' mm · ' + s.prob_max + ' % · vent ' + s.wind_kmh + ' km/h' +
              (s.time === route.departure ? ' · <b>ton horaire</b>' : '') + '</div>' +
          '</div>' +
          '<span class="pill ' + s.verdict + '">' + (s.verdict === 'sec' ? 'sec' : s.verdict === 'risque' ? 'risqué' : 'pluie') + '</span>' +
        '</div>';
      }).join('');

      return mockbar() +
        '<section class="card">' +
          '<div class="hero-slot">' +
            '<div>' +
              '<div class="small muted" style="text-transform:uppercase;letter-spacing:.06em;font-weight:700">Meilleur créneau</div>' +
              '<div class="big">' + best.time + '</div>' +
              '<div class="small">' + best.mm.toFixed(1).replace('.', ',') + ' mm · ' + best.prob_max + ' % de proba · vent ' + best.wind_kmh + ' km/h</div>' +
            '</div>' +
          '</div>' +
          (delta ? '<div class="card-pad small muted" style="border-top:1px solid var(--line)">' + esc(delta) + '</div>' : '') +
        '</section>' +
        '<section class="card">' +
          '<div class="card-pad" style="padding-bottom:6px"><div class="card-title">Tous les départs possibles</div></div>' +
          rows +
        '</section>' +
        '<div class="note">Le score combine cumul de pluie, probabilité, vent de face et écart à ton horaire habituel. Barème à affiner en V2.</div>' +
        '<a class="btn ghost" href="#/">← Retour au trajet du jour</a>';
    });
  }

  function diffMin(a, b) {
    function m(s) { var p = s.split(':'); return (+p[0]) * 60 + (+p[1]); }
    return m(b) - m(a);
  }

  /* ---------- page : Historique ---------- */

  function pageHistory() {
    setSwitch(false);
    return api.history().then(function (data) {
      var s = data.summary;
      var dow = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
      var head = dow.map(function (x) { return '<div>' + x + '</div>'; }).join('');

      // La grille commence un lundi : on décale le premier jour dans sa colonne.
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

      return mockbar() +
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
          '<div class="small muted">' + s.mm_total.toFixed(1).replace('.', ',') + ' mm reçus sur ' + s.trajets + ' trajets. ' +
          'En V2 : cumul réel enregistré chaque jour, plus comparaison avec la moyenne saisonnière.</div>' +
        '</section>';
    });
  }

  /* ---------- page : Réglages ---------- */

  function pageSettings() {
    setSwitch(false);
    return api.options().then(function (o) {
      state.options = o;

      var rows = [
        ['Adresse domicile', o.home_address],
        ['Adresse travail', o.work_address],
        ['Départ matin', o.morning_departure_time],
        ['Départ soir', o.evening_departure_time],
        ['Seuil d’alerte pluie', String(o.rain_alert_threshold_mm).replace('.', ',') + ' mm'],
        ['Service de notification', o.notify_service || '— non configuré —']
      ].map(function (r) {
        return '<div class="row"><span class="k">' + esc(r[0]) + '</span><span class="v">' + esc(r[1]) + '</span></div>';
      }).join('');

      var opts = Object.keys(LAYOUTS).map(function (k) {
        return '<button class="opt" data-layout="' + k + '" aria-checked="' + (state.layout === k) + '" role="radio">' +
          '<span class="mark"></span>' +
          '<span><span class="t">' + esc(LAYOUTS[k].name) + '</span>' +
          '<span class="d">' + esc(LAYOUTS[k].desc) + '</span></span>' +
        '</button>';
      }).join('');

      return mockbar() +
        '<section class="card">' +
          '<div class="card-pad" style="padding-bottom:4px"><div class="card-title">Layout de l’accueil (maquette)</div></div>' +
          '<div class="opt-list" role="radiogroup">' + opts + '</div>' +
          '<div class="card-pad" style="padding-top:0"><div class="note">Change la variante puis reviens sur « Aujourd’hui ». ' +
          'C’est le point à trancher avant de brancher les vraies API.</div></div>' +
        '</section>' +
        '<section class="card">' +
          '<div class="card-pad" style="padding-bottom:4px"><div class="card-title">Configuration de l’add-on</div></div>' +
          rows +
        '</section>' +
        '<div class="note">Ces valeurs se modifient dans Home Assistant : Paramètres → Modules complémentaires → Vélo Météo → Configuration.</div>' +
        '<section class="card">' +
          '<div class="card-pad">' +
            '<div class="card-title">État</div>' +
            '<div class="small muted">Version 0.1.0 · données ' + (state.offline ? 'de repli (API injoignable)' : 'servies par l’add-on') + ' · toutes mockées.</div>' +
          '</div>' +
        '</section>';
    });
  }

  /* ---------- routeur ---------- */

  var ROUTES = { '/': pageHome, '/creneaux': pageWindows, '/historique': pageHistory, '/reglages': pageSettings };

  function render() {
    var path = (location.hash || '#/').slice(1);
    if (!ROUTES[path]) path = '/';
    setTabs(path);
    view.innerHTML = '<div class="note">Chargement…</div>';
    ROUTES[path]().then(function (html) {
      view.innerHTML = html;
      w.scrollTo(0, 0);
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

  view.addEventListener('click', function (e) {
    var o = e.target.closest('.opt[data-layout]');
    if (!o) return;
    state.layout = o.getAttribute('data-layout');
    localStorage.setItem('vm.layout', state.layout);
    render();
  });

  w.addEventListener('hashchange', render);

  api.options().then(function (o) { state.options = o; }).then(render);
})(window, document);

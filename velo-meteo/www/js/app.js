/* Vélo Météo - routeur + pages.
   Tant qu'aucun trajet n'est configuré, l'app tourne sur les données fictives.
   Dès que le trajet est enregistré (Réglages), tout passe en données réelles :
   itinéraire OSRM et prévisions Open-Meteo. */
(function (w, d) {
  'use strict';

  var UI = w.VM_UI, MOCK = w.VM_MOCK;
  var esc = UI.esc, num = UI.num;

  var LAYOUTS = {
    A: { name: 'A · Verdict d’abord', desc: 'Verdict → profil de pluie → vent → graphe → carte. Le plus rapide à lire avant de partir.' },
    B: { name: 'B · Carte d’abord', desc: 'Carte en haut, verdict compact dessous. Plus visuel, demande un scroll pour les chiffres.' },
    C: { name: 'C · Coup d’œil', desc: 'Verdict + profil + vent seulement, le reste replié. Une seule hauteur d’écran, zéro scroll.' }
  };

  var state = {
    trip: null,          // 'morning' | 'evening' (null = auto selon l'heure)
    layout: localStorage.getItem('vm.layout') || 'A',
    options: null,
    config: { configured: false, trip: null },
    source: 'mock',
    error: null,
    offline: false,
    form: null,          // valeurs saisies dans Réglages, conservées entre deux rendus
    saving: false,
    saveMsg: null
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
    trip: function () { return get('/api/trip', function () { return MOCK.trip; }); }
  };

  /* ---------- coquille ---------- */

  var view = d.getElementById('view');
  var topbar = d.getElementById('topbar');

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
    return Promise.all([api.route(t), api.weather(t), api.wind(t)]).then(function (res) {
      var route = res[0], weather = noteSource(res[1]), wind = res[2];
      var seuil = state.options ? state.options.rain_alert_threshold_mm : 0.5;
      var v = UI.verdictOf(weather, seuil);

      var head = sourceBar(weather.for_date) + (state.config.configured ? '' : setupCta());

      var cta =
        '<a class="btn" href="#/creneaux">⏱️ Voir le meilleur créneau</a>' +
        '<a class="btn ghost" href="#/historique">📊 Historique du vélotaf</a>';

      if (state.layout === 'B') {
        return head +
          UI.radarMap(route) +
          UI.verdictCard(weather, v, true) +
          UI.routeSummary(route) +
          UI.profileStrip(route, weather) +
          UI.windCard(wind) +
          UI.rainChart(weather) +
          cta;
      }

      if (state.layout === 'C') {
        return head +
          UI.verdictCard(weather, v, false) +
          UI.profileStrip(route, weather) +
          UI.windCard(wind) +
          '<details class="acc"><summary>Détail par point de passage</summary>' +
            '<div class="acc-body">' + UI.rainChart(weather) + '</div></details>' +
          '<details class="acc"><summary>Carte du trajet</summary>' +
            '<div class="acc-body">' + UI.radarMap(route) + '</div></details>' +
          cta;
      }

      return head +
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
      var payload = noteSource(res[0]);
      var slots = payload.windows, route = res[1];
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

  function pageSettings() {
    setSwitch(false);
    return Promise.all([api.options(), api.trip()]).then(function (res) {
      state.options = res[0];
      state.config = res[1] || { configured: false, trip: null };

      var f = formValues();
      var t = state.config.trip;

      var resolved = t ? '' +
        '<div class="row"><span class="k">Domicile reconnu</span><span class="v">' + esc(t.home.label) + '</span></div>' +
        '<div class="row"><span class="k">Travail reconnu</span><span class="v">' + esc(t.work.label) + '</span></div>' +
        '<div class="row"><span class="k">Aller</span><span class="v">' + num(t.routes.morning.distance_km) + ' km · ' + t.routes.morning.duration_min + ' min</span></div>' +
        '<div class="row"><span class="k">Retour</span><span class="v">' + num(t.routes.evening.distance_km) + ' km · ' + t.routes.evening.duration_min + ' min</span></div>' : '';

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

        '<section class="card">' +
          '<div class="card-pad" style="padding-bottom:4px"><div class="card-title">Layout de l’accueil</div></div>' +
          '<div class="opt-list" role="radiogroup">' + opts + '</div>' +
        '</section>' +

        '<section class="card">' +
          '<div class="card-pad">' +
            '<div class="card-title">État</div>' +
            '<div class="small muted">Version 0.2.0 · ' +
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

  function render() {
    var path = (location.hash || '#/').slice(1);
    if (!ROUTES[path]) path = '/';
    setTabs(path);
    view.innerHTML = '<div class="note">Chargement…</div>';
    return ROUTES[path]().then(function (html) {
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

  // Le formulaire est re-généré à chaque rendu : on garde la saisie en mémoire.
  view.addEventListener('input', function (e) {
    var el = e.target;
    if (!el.name || !state.form) return;
    if (Object.prototype.hasOwnProperty.call(state.form, el.name)) state.form[el.name] = el.value;
  });

  view.addEventListener('click', function (e) {
    var opt = e.target.closest('.opt[data-layout]');
    if (opt) {
      state.layout = opt.getAttribute('data-layout');
      localStorage.setItem('vm.layout', state.layout);
      render();
      return;
    }

    var btn = e.target.closest('[data-action]');
    if (!btn) return;

    if (btn.getAttribute('data-action') === 'save-trip') saveTrip();
    if (btn.getAttribute('data-action') === 'clear-trip') clearTrip();
  });

  function saveTrip() {
    var f = formValues();
    if (!f.home_address.trim() || !f.work_address.trim()) {
      state.saveMsg = { kind: 'err', text: 'Renseigne les deux adresses.' };
      return render();
    }

    var t = state.config.trip;
    // Si seules les heures changent, inutile de refaire géocodage et itinéraire.
    var sameAddresses = t && t.home.query === f.home_address.trim() && t.work.query === f.work_address.trim();

    state.saving = true;
    state.saveMsg = { kind: 'info', text: sameAddresses ? 'Mise à jour des horaires…' : 'Géocodage et calcul des deux itinéraires…' };
    render();

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
      render();
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

  w.addEventListener('hashchange', render);

  Promise.all([api.options(), api.trip()]).then(function (res) {
    state.options = res[0];
    state.config = res[1] || { configured: false, trip: null };
  }).then(render);
})(window, document);

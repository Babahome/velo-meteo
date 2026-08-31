/**
 * Velo Meteo v0.1 - Home Assistant Add-on
 * V1 maquette : toutes les donnees sont mockees (aucun appel API externe).
 * Le decoupage des routes correspond deja aux futures sources reelles :
 *   route.js   -> OSRM / GraphHopper
 *   weather.js -> Open-Meteo (precipitation)
 *   wind.js    -> Open-Meteo (vent)
 *   stats.js   -> historique local (SQLite en V2)
 *   trips.js   -> trajets favoris (SQLite en V2)
 */
'use strict';

const express = require('express');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = parseInt(process.env.PORT || '8100', 10);

const DATA_DIR = process.env.DATA_PATH || '/data';
if (!fs.existsSync(DATA_DIR)) { try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (_) {} }

// Options de l'add-on (fournies par le superviseur HA dans /data/options.json)
function readOptions() {
  const defaults = {
    home_address: 'Maison',
    work_address: 'Bureau',
    morning_departure_time: '08:00',
    evening_departure_time: '18:00',
    rain_alert_threshold_mm: 0.5,
    notify_service: ''
  };
  try {
    const raw = fs.readFileSync(path.join(DATA_DIR, 'options.json'), 'utf8');
    return Object.assign(defaults, JSON.parse(raw));
  } catch (_) {
    return defaults;
  }
}

app.use(express.json());

// --- API -------------------------------------------------------------------
app.use('/api/route',   require('./routes/route'));
app.use('/api/weather', require('./routes/weather'));
app.use('/api/wind',    require('./routes/wind'));
app.use('/api/trip',    require('./routes/trips'));
app.use('/api/stats',   require('./routes/stats'));
app.use('/api/radar',   require('./routes/radar'));

app.get('/api/options', (_req, res) => res.json(readOptions()));

// Toute route /api inconnue doit répondre en JSON : sans ça, le catch-all
// plus bas renverrait index.html et le front planterait sur le JSON.parse.
app.use('/api', (_req, res) => res.status(404).json({ error: 'Route API inconnue' }));

app.get('/health', (_req, res) => {
  const store = require('./routes/store');
  res.json({ status: 'ok', version: '0.12.0', configured: store.isConfigured(store.getTrip()) });
});

// --- Front statique --------------------------------------------------------
// Pas de cache sur l'app : on itere sur le layout, on veut voir les changements
// immediatement apres un redemarrage de l'add-on (surtout depuis le telephone).
app.use(express.static(path.join(__dirname, 'www'), {
  etag: false,
  lastModified: false,
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-store')
}));

app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'www', 'index.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`Velo Meteo (maquette) listening on ${PORT}`));

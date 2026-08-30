/**
 * Persistance du trajet dans /data (monté par l'add-on via `map: data:rw`).
 * Un simple fichier JSON : le volume de données est minuscule et ça évite
 * better-sqlite3, dont la compilation native est très lente sur armv7/aarch64.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_PATH || '/data';
const FILE     = path.join(DATA_DIR, 'velo-meteo.json');

const EMPTY = { version: 1, trip: null, updated_at: null };

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function read() {
  try {
    return Object.assign({}, EMPTY, JSON.parse(fs.readFileSync(FILE, 'utf8')));
  } catch (_) {
    return Object.assign({}, EMPTY);
  }
}

function write(data) {
  ensureDir();
  const next = Object.assign({}, data, { updated_at: new Date().toISOString() });
  // Écriture atomique : on ne veut pas d'un JSON tronqué si l'add-on est coupé.
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8');
  fs.renameSync(tmp, FILE);
  return next;
}

function getTrip() {
  return read().trip;
}

function setTrip(trip) {
  const data = read();
  data.trip = trip;
  return write(data).trip;
}

function clearTrip() {
  const data = read();
  data.trip = null;
  write(data);
}

/** Le trajet est-il exploitable (géocodé + itinéraire calculé) ? */
function isConfigured(trip) {
  return !!(trip && trip.routes && trip.routes.morning && trip.routes.evening &&
            Array.isArray(trip.routes.morning.points) && trip.routes.morning.points.length > 1);
}

module.exports = { getTrip, setTrip, clearTrip, isConfigured, FILE };

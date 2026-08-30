/**
 * MOCK - trajets favoris. V2 : table SQLite `trips`
 * (id, name, type [morning/evening], gpx_or_addresses, created_at).
 * En V1 on garde un stockage memoire pour ne pas embarquer better-sqlite3
 * (compilation native tres lente sur armv7/aarch64).
 */
'use strict';
const router = require('express').Router();
const { TRIPS } = require('./mock-data');

let store = Object.values(TRIPS).map((t, i) => ({
  id: i + 1, name: t.name, type: t.type,
  addresses: t.type === 'morning' ? 'Maison → Bureau' : 'Bureau → Maison',
  created_at: new Date().toISOString()
}));

router.get('/', (_req, res) => res.json(store));

router.post('/', (req, res) => {
  const { name, type, addresses } = req.body || {};
  if (!name || !type) return res.status(400).json({ error: 'name et type requis' });
  const row = { id: Math.max(0, ...store.map(t => t.id)) + 1, name, type, addresses: addresses || '', created_at: new Date().toISOString() };
  store.push(row);
  res.status(201).json(row);
});

router.delete('/:id', (req, res) => {
  store = store.filter(t => t.id !== parseInt(req.params.id, 10));
  res.status(204).end();
});

module.exports = router;

/**
 * Contexte de l'averse simulée : sur quel trajet et à quelle heure la poser.
 *
 * Le mode démo doit marcher avec un trajet configuré comme sans, puisque c'est
 * justement avant d'avoir renseigné quoi que ce soit qu'on regarde le rendu.
 */
'use strict';

const store = require('./store');
const { TRIPS } = require('./mock-data');

function demoContext(type) {
  const trip = store.getTrip();
  if (store.isConfigured(trip)) {
    return {
      route: trip.routes[type],
      hhmm: type === 'evening' ? trip.evening_time : trip.morning_time
    };
  }
  return { route: TRIPS[type], hhmm: TRIPS[type].departure };
}

module.exports = { demoContext };

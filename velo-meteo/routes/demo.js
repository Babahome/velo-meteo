/**
 * Contexte de l'averse simulée : sur quel trajet et à quelle heure la poser.
 *
 * Le mode démo doit marcher avec un trajet configuré comme sans, puisque c'est
 * justement avant d'avoir renseigné quoi que ce soit qu'on regarde le rendu.
 */
'use strict';

const store = require('./store');
const { TRIPS } = require('./mock-data');

/**
 * "HH:MM" du prochain top de 5 minutes, en heure locale du serveur.
 *
 * Le mode démo raisonne en minutes depuis minuit, sans appel réseau : il n'a
 * pas le décalage horaire que renvoie Open-Meteo, et se contente donc de
 * l'horloge de la machine. C'est exact pour un add-on qui tourne chez soi.
 */
function nowHHMM() {
  const t = new Date(Math.ceil(Date.now() / 3e5) * 3e5);
  return String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0');
}

/**
 * `now` demande un départ immédiat : l'averse simulée se pose alors sur
 * l'heure qu'il est, pour que le curseur affiche les mêmes horaires que le
 * trajet réel affiché à côté.
 */
function demoContext(type, now) {
  const trip = store.getTrip();
  const usual = store.isConfigured(trip)
    ? (type === 'evening' ? trip.evening_time : trip.morning_time)
    : TRIPS[type].departure;

  return {
    route: store.isConfigured(trip) ? trip.routes[type] : TRIPS[type],
    hhmm: now ? nowHHMM() : usual
  };
}

module.exports = { demoContext, nowHHMM };

# Changelog

## 0.1.0 — V1 maquette

Première version : structure de l'add-on et layout des pages, sur données fictives.

- Add-on Node/Express sur le port 8100, sans ingress (pas de sidebar HA).
- API mockée découpée par future source : `route`, `weather`, `wind`, `stats`, `trips`.
- Interface mobile-first, thème clair et sombre, barre d'onglets à 4 pages :
  Aujourd'hui, Créneaux, Historique, Réglages.
- Écran d'accueil disponible en 3 variantes de layout (A verdict d'abord, B carte d'abord,
  C coup d'œil), commutables depuis Réglages pour les comparer sur téléphone.
- Bloc « profil de pluie » : le trajet déroulé en segments colorés par intensité.
- Graphe mm + probabilité et carte radar en SVG maison, sans dépendance externe.
- Données de repli embarquées côté navigateur si l'API est injoignable.

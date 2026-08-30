# Changelog

## 0.2.0 — Trajet réel et vraies prévisions

Saisie du trajet et bascule sur les données réelles. Le mode maquette reste disponible
et sert de repli automatique.

- **Formulaire de trajet** (Réglages) : adresses du domicile et du travail, heures de
  départ matin et soir. Enregistré dans `/data/velo-meteo.json`, survit aux redémarrages.
- **Géocodage** des adresses via Nominatim, avec affichage de l'adresse reconnue pour
  vérifier qu'il ne s'agit pas d'une rue homonyme.
- **Itinéraires vélo réels** via OSRM, calculés séparément à l'aller et au retour ;
  8 points de passage avec temps de parcours cumulé et nom de rue.
- **Prévisions Open-Meteo** sur chaque point de passage, à l'heure exacte du passage :
  pluie au pas de 15 minutes, probabilité horaire, vent, ressenti.
- **Orientation du vent** calculée à partir du cap réel de chaque segment (face / dos /
  travers) au lieu d'être fixée dans les données.
- **Créneaux de départ** recalculés sur la vraie prévision, de −1 h à +1 h autour de
  l'horaire habituel ; le score pénalise aussi l'écart à cet horaire.
- Changer seulement les horaires ne relance plus le géocodage ni le calcul d'itinéraire.
- Bandeau d'origine des données en haut de chaque page, avec la raison en cas de repli.

Corrections :

- La projection de la carte inversait le facteur d'aspect et écrasait le tracé
  verticalement ; ajout d'une marge pour que le trajet ne touche plus les bords.
- L'étiquette de la carte masquait le marqueur d'arrivée quand le trajet finissait dans
  ce coin ; elle est passée sous la carte.
- Le nom et la description des variantes de layout se collaient faute de `display:block`.
- Les routes `/api` inconnues renvoyaient `index.html` au lieu d'une erreur JSON.

Unités : le profil de pluie et le graphe passent en **intensité (mm/h)**, échelle météo
usuelle, tandis que la carte verdict garde le **cumul en mm** sur le trajet. Les paliers
de couleur suivent désormais l'intensité, seule échelle qui reste lisible avec de vraies
prévisions.

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

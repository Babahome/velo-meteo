# Vélo Météo — dépôt d'add-ons Home Assistant

Météo (pluie, vent) sur le trajet vélotaf du matin et du soir.

| Add-on | Version | Port | État |
|---|---|---|---|
| [`velo-meteo`](velo-meteo/) | 0.14.1 | 8100 | Le prochain trajet à l’ouverture |

Renseigne ton domicile, ton lieu de travail et tes horaires dans l'onglet Réglages :
l'add-on géocode les adresses, calcule ton itinéraire vélo réel et affiche les prévisions
Open-Meteo sur chaque point de passage, tracées sur un fond de carte OpenStreetMap. Si le
routeur ne trouve pas le trajet comme tu le fais vraiment, importe ta trace GPX à la place.
Tant qu'aucun trajet n'est configuré — ou si une API externe tombe — il tourne sur un jeu
de données fictif, ce qui permet aussi de juger le layout des pages hors ligne.

Installation, configuration et description des écrans : [`velo-meteo/DOCS.md`](velo-meteo/DOCS.md).

## Ajouter le dépôt dans Home Assistant

**Paramètres → Modules complémentaires → Boutique → ⋮ → Dépôts**, puis coller l'URL
de ce dépôt GitHub. Mettre à jour `url:` dans `repository.yaml` si le nom du dépôt change.

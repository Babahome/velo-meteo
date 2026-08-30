# Vélo Météo — dépôt d'add-ons Home Assistant

Météo (pluie, vent) sur le trajet vélotaf du matin et du soir.

| Add-on | Version | Port | État |
|---|---|---|---|
| [`velo-meteo`](velo-meteo/) | 0.1.0 | 8100 | **V1 maquette** — données fictives |

La V1 sert à valider le **layout des pages** sur téléphone. Aucune API météo n'est
encore appelée : tout est mocké côté serveur, avec un repli côté navigateur.

Installation, configuration et description des écrans : [`velo-meteo/DOCS.md`](velo-meteo/DOCS.md).

## Ajouter le dépôt dans Home Assistant

**Paramètres → Modules complémentaires → Boutique → ⋮ → Dépôts**, puis coller l'URL
de ce dépôt GitHub. Mettre à jour `url:` dans `repository.yaml` si le nom du dépôt change.

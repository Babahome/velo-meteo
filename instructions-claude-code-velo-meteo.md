# Instructions pour Claude Code — Maquette "Vélo Météo"

## Contexte à donner à Claude Code (à coller en premier)

Je veux créer un add-on Home Assistant appelé **"Vélo Météo"** qui affiche la météo (pluie, vent) sur mon trajet vélotaf (matin/soir). C'est un add-on HA structuré comme mes add-ons existants `Sudoku` et `ha-kitchen-core` (repos GitHub : github.com/Babahome/Sudoku et github.com/Babahome/ha-kitchen-core).

**Avant de commencer, regarde la structure de ces deux repos existants sur mon PC** (demande-moi leur chemin local si tu ne les trouves pas) pour :

* reprendre la même convention de `config.yaml` / `Dockerfile` / `run.sh`
* reprendre la même organisation de dossiers (app/, rootfs/, etc.)
* reprendre le même style de version/CHANGELOG.md si j'en ai un

Pour cette V1, on fait une **maquette avec données mockées** (pas d'appel API réel) pour valider l'UI et la structure avant de brancher les vraies API.

\---

## Étape 1 — Scaffolding du repo add-on

Crée un nouveau dossier `velo-meteo/` avec cette structure :

```
velo-meteo/
├─ config.yaml
├─ Dockerfile
├─ run.sh
├─ icon.png (placeholder pour l'instant)
├─ CHANGELOG.md
├─ DOCS.md
└─ app/
   ├─ server/              (backend Node/Express)
   │  ├─ index.js
   │  ├─ routes/
   │  │  ├─ route.js       (mock : retourne un tracé + points GPS)
   │  │  ├─ weather.js      (mock : retourne mm/% par point)
   │  │  ├─ wind.js         (mock : force/direction par point)
   │  │  ├─ trips.js         (CRUD trajets favoris, SQLite)
   │  │  └─ stats.js         (mock : historique jours mouillés/secs)
   │  └─ db.js              (init SQLite dans /data/velo-meteo.db)
   └─ frontend/             (React + Vite)
      ├─ src/
      │  ├─ pages/
      │  │  ├─ Home.jsx           (écran principal = trajet du jour)
      │  │  ├─ BestWindow.jsx     (suggestion créneau optimal)
      │  │  ├─ History.jsx        (stats)
      │  │  └─ Settings.jsx       (config trajets favoris)
      │  ├─ components/
      │  │  ├─ RadarMap.jsx       (MapLibre GL JS + mock tuiles)
      │  │  ├─ RainChart.jsx      (Recharts : cumul mm + % par point)
      │  │  ├─ WindBanner.jsx
      │  │  └─ RouteSummaryCard.jsx
      │  ├─ hooks/
      │  │  └─ useRouteWeather.js
      │  └─ services/api.js       (appels vers le backend local)
      └─ vite.config.js
```

## Étape 2 — `config.yaml`

Génère un `config.yaml` avec :

* `name: "Velo Meteo"`, `slug: "velo\_meteo"`
* `ingress: false` (important : l'app ne doit **pas** apparaître dans la sidebar HA)
* `ports: { "8099/tcp": 8099 }` avec `ports\_description`
* `startup: application`, `boot: auto`
* `options` : `home\_address`, `work\_address`, `morning\_departure\_time` (défaut "08:00"), `evening\_departure\_time` (défaut "18:00"), `rain\_alert\_threshold\_mm` (défaut 0.5), `ha\_long\_lived\_token` (pour les futures notifications), `notify\_service` (ex: "notify.mobile\_app\_xxx")
* `schema` correspondant

## Étape 3 — Backend (mock data)

Le serveur Express doit servir :

* l'API sur les routes listées ci-dessus (avec des données mockées réalistes : un trajet Paris fictif de \~8 points, avec mm de pluie variables, % de précipitation, vent)
* les fichiers statiques du build frontend (`app/frontend/dist`)
* SQLite via `better-sqlite3` avec une table `trips` (id, name, type \[morning/evening], gpx\_or\_addresses, created\_at) — même vide au départ

## Étape 4 — Frontend (écran principal = priorité #1)

L'écran `Home.jsx` doit reproduire exactement cette logique :

* Détecte l'heure actuelle → si avant 13h, affiche le trajet "matin" ; sinon "soir"
* Header : nom du trajet + heure de départ habituelle
* Indicateur global gros et visible : "☔ Pluie probable" ou "☀️ RAS" (calculé à partir du mock : si un point a >50% de proba, afficher pluie probable)
* Carte radar (MapLibre + OpenStreetMap comme fond, pas besoin de vraies tuiles RainViewer pour la maquette — juste le tracé du trajet en overlay coloré)
* Graphe sous la carte (Recharts) : axe X = points de passage, barres = mm de pluie, ligne = % de précipitation (axe Y secondaire)
* Bandeau vent : force + direction relative (face/dos/travers) simplifié
* Bouton "Voir meilleur créneau" (peut rediriger vers une page vide pour l'instant)
* Icônes d'accès rapide : Historique, Réglages

Les autres écrans (BestWindow, History, Settings) peuvent être des squelettes simples pour cette V1 maquette — pas besoin de logique complète, juste la structure de navigation.

## Étape 5 — Style

Utilise un style mobile-first, épuré, lisible en extérieur (contraste fort, gros indicateur en haut). Palette : bleu/gris pour la neutralité, rouge/orange pour l'alerte pluie, vert pour RAS.

## Étape 6 — Vérification finale

* `docker build` doit passer sans erreur
* Le conteneur doit démarrer et servir l'app sur le port 8099
* Documente dans `DOCS.md` comment ajouter le repo dans HA (Paramètres > Add-ons > Dépôts) et comment accéder à l'app une fois installée (`http://<ip-ha>:8099`)

\---

## Points à ne PAS faire à ce stade (V1 maquette)

* Pas d'appel réel à Open-Meteo / RainViewer / OSRM (tout est mocké)
* Pas de notifications réelles (juste prévoir le champ de config)
* Pas d'authentification (accès protégé par le réseau local uniquement)


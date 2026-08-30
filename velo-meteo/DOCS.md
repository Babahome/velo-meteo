# Vélo Météo — V1 maquette

Add-on Home Assistant qui affiche la météo (pluie, vent) sur le trajet vélotaf du matin et du soir.

> **Cette version est une maquette.** Toutes les données affichées sont fictives et figées :
> aucun appel à Open-Meteo, RainViewer ou OSRM. L'objectif est de valider le **layout des pages**
> sur téléphone avant de brancher les vraies sources.

---

## Installer l'add-on

### Option A — depuis le dépôt GitHub (recommandé)

1. Pousser ce dossier sur un dépôt GitHub (par ex. `github.com/Babahome/velo-meteo`),
   avec `repository.yaml` à la racine et le dossier `velo-meteo/` à côté.
2. Dans Home Assistant : **Paramètres → Modules complémentaires → Boutique → ⋮ → Dépôts**.
3. Ajouter l'URL du dépôt, puis rafraîchir la page.
4. Ouvrir **Velo Meteo** dans la liste, cliquer **Installer**, puis **Démarrer**.

### Option B — installation locale (sans GitHub)

1. Copier le dossier `velo-meteo/` dans le partage `addons/` de Home Assistant
   (via l'add-on Samba ou File Editor) → `/addons/velo-meteo/`.
2. **Paramètres → Modules complémentaires → Boutique → ⋮ → Vérifier les mises à jour**.
3. L'add-on apparaît dans la section « Local add-ons ». Installer, puis démarrer.

## Accéder à l'app

L'add-on écoute sur le port **8100**. Il n'apparaît **pas** dans la barre latérale
(`ingress` désactivé, conformément au besoin) : on y accède directement par le réseau local.

```
http://<ip-de-ton-home-assistant>:8100
```

Le bouton **OUVRIR L'INTERFACE WEB** sur la page de l'add-on pointe vers cette même adresse.

> **Port 8100 et non 8099** : les add-ons `sudoku` et `kitchencore` occupent déjà le 8099.
> Les trois peuvent donc tourner en même temps.

### Sur le téléphone

Ouvrir l'URL dans Chrome/Safari, puis **Ajouter à l'écran d'accueil**. Le `manifest.json`
fait démarrer l'app en plein écran, sans barre d'adresse — c'est dans ces conditions
qu'il faut juger le layout (barre d'onglets en bas, zones de pouce, safe areas).

Aucun *service worker* n'est embarqué à ce stade : chaque ouverture recharge la dernière
version servie par l'add-on, ce qui évite de se battre avec le cache pendant les itérations.

## Configuration

Onglet **Configuration** de l'add-on :

| Option | Défaut | Rôle |
|---|---|---|
| `home_address` | `1 rue de la Paix, 75002 Paris` | Adresse de départ du trajet matin |
| `work_address` | `10 place de la Bourse, 75002 Paris` | Adresse de départ du trajet soir |
| `morning_departure_time` | `08:00` | Heure de départ habituelle le matin |
| `evening_departure_time` | `18:00` | Heure de départ habituelle le soir |
| `rain_alert_threshold_mm` | `0.5` | Cumul au-delà duquel on parle de pluie |
| `ha_long_lived_token` | *(vide)* | Réservé aux notifications (non utilisé en V1) |
| `notify_service` | *(vide)* | Ex. `notify.mobile_app_pixel` (non utilisé en V1) |

Ces valeurs sont lues et **affichées** dans l'écran Réglages, mais n'influencent pas encore
les données : seul `rain_alert_threshold_mm` entre dans le calcul du verdict.

---

## Les pages

| Onglet | Contenu |
|---|---|
| **Aujourd'hui** | Le trajet du jour. Matin avant 13 h, soir ensuite ; commutable à la main. |
| **Créneaux** | Les départs possibles autour de l'heure habituelle, classés par score. |
| **Historique** | Trois semaines de trajets secs / mouillés, matin et soir. |
| **Réglages** | Choix de la variante de layout + configuration de l'add-on en lecture seule. |

### Les trois variantes de l'écran d'accueil

C'est le point à trancher. Réglages → *Layout de l'accueil*, puis retour sur **Aujourd'hui**.
Le choix est mémorisé dans le navigateur du téléphone.

- **A — Verdict d'abord** : verdict → profil de pluie → vent → graphe → carte.
  Tout ce qui décide « j'y vais ou pas » tient dans le premier écran ; la carte sert de preuve.
- **B — Carte d'abord** : la carte radar en haut, verdict compact dessous.
  Plus séduisant, mais il faut scroller pour avoir les chiffres.
- **C — Coup d'œil** : verdict + profil + vent, le reste replié en accordéons.
  Une seule hauteur d'écran, zéro scroll — le format « je regarde en enfilant mes chaussures ».

### Le bloc « profil de pluie »

C'est la brique inventée pour cette maquette : le trajet déroulé de gauche à droite,
un bloc par point de passage, coloré par intensité, avec les mm inscrits dedans.
Elle répond en une seconde à la vraie question — *« à quel moment du trajet je vais me faire saucer ? »* —
là où une carte demande de se repérer et un graphe demande de lire deux axes.
À valider ou à jeter après essai sur le terrain.

---

## Architecture

```
velo-meteo/
├─ config.yaml / build.yaml / Dockerfile   convention identique à sudoku et kitchencore
├─ server.js                               Express : API + statique, port 8100
├─ routes/
│  ├─ mock-data.js   jeu de données fictif (trajet Paris, 8 points)
│  ├─ route.js       trajet + points GPS      → V2 : OSRM / GraphHopper
│  ├─ weather.js     mm et % par point        → V2 : Open-Meteo
│  ├─ wind.js        force / direction        → V2 : Open-Meteo
│  ├─ stats.js       historique + créneaux    → V2 : SQLite local
│  └─ trips.js       trajets favoris (CRUD)   → V2 : table SQLite `trips`
└─ www/
   ├─ index.html     coquille + barre d'onglets
   ├─ css/app.css    thème clair et sombre, safe areas, contraste extérieur
   └─ js/
      ├─ mock.js     données de repli si l'API est injoignable
      ├─ ui.js       verdict, profil, vent, graphe SVG, carte SVG
      └─ app.js      routeur par hash, les 4 pages, les 3 variantes
```

### Écarts assumés par rapport au cahier des charges initial

| Prévu | Fait en V1 | Pourquoi |
|---|---|---|
| React + Vite | HTML/CSS/JS vanilla | Pas d'étape de build : `docker build` en quelques secondes sur le Pi, et une modif de layout est visible après un simple redémarrage de l'add-on. Aligné sur `sudoku` et `kitchencore`. |
| Recharts | Graphe SVG écrit à la main | ~60 lignes, aucune dépendance, et le layout ne change pas quand on passera à Recharts. |
| MapLibre GL JS | Carte SVG simulée | MapLibre a besoin de tuiles distantes ; on valide d'abord la *place* et la *hauteur* de la carte dans la page. |
| SQLite (`better-sqlite3`) | Stockage mémoire | Compilation native très lente sur armv7/aarch64, pour zéro bénéfice tant que les données sont fictives. La table `trips` est déjà décrite dans `routes/trips.js`. |

`map: data:rw` est déjà déclaré dans `config.yaml` : `/data` est monté et prêt pour la V2.

---

## API (toutes mockées)

| Route | Réponse |
|---|---|
| `GET /api/route?type=morning\|evening` | Trajet, points, cellules de pluie |
| `GET /api/weather?type=…` | mm, % et température par point + cumul, pic, proba max |
| `GET /api/wind?type=…` | Force, rafales, secteur, orientation relative |
| `GET /api/stats/windows?type=…` | Créneaux de départ alternatifs avec score |
| `GET /api/stats/history` | 21 jours de trajets secs / mouillés |
| `GET /api/trips` | Trajets favoris (`POST`, `DELETE` disponibles) |
| `GET /api/options` | Options de l'add-on |
| `GET /health` | `{ status: "ok", version, mock: true }` |

## Ce qui reste à faire (V2)

- Brancher Open-Meteo (précipitations + vent) et OSRM (tracé réel).
- Tuiles RainViewer sur MapLibre pour la carte.
- Persistance SQLite dans `/data` : trajets favoris et historique réel.
- Notification push via `notify_service` quand le seuil de pluie est dépassé avant le départ.
- Calcul réel de l'orientation du vent par rapport au cap de chaque segment.

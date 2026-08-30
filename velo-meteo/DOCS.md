# Vélo Météo

Add-on Home Assistant qui affiche la météo (pluie, vent) sur le trajet vélotaf du matin et du soir.

Deux modes, selon qu'un trajet est configuré ou non :

| | Sans trajet configuré | Avec trajet configuré |
|---|---|---|
| Itinéraire | Trajet fictif Paris | Ton itinéraire vélo réel (OSRM) |
| Météo | Données figées | Prévisions réelles (Open-Meteo) |
| Bandeau en haut | « Maquette · données fictives » | « Données réelles · Open-Meteo » |

Le mode maquette sert à juger le **layout des pages** sans dépendre du réseau ; il reste
aussi le repli automatique si une API externe est indisponible.

---

## Installer l'add-on

### Option A — depuis le dépôt GitHub (recommandé)

1. **Paramètres → Modules complémentaires → Boutique → ⋮ → Dépôts**.
2. Ajouter `https://github.com/Babahome/velo-meteo`, puis rafraîchir la page.
3. Ouvrir **Velo Meteo**, cliquer **Installer**, puis **Démarrer**.

### Option B — installation locale (sans GitHub)

1. Copier le dossier `velo-meteo/` dans le partage `addons/` de Home Assistant
   (via l'add-on Samba ou File Editor) → `/addons/velo-meteo/`.
2. **Boutique → ⋮ → Vérifier les mises à jour**. L'add-on apparaît en « Local add-ons ».

> **Mise à jour** : Home Assistant ne propose une mise à jour que si le champ `version` de
> `config.yaml` a changé. Un simple commit ne suffit pas.

## Accéder à l'app

L'add-on écoute sur le port **8100** et n'apparaît **pas** dans la barre latérale
(`ingress` désactivé) : on y accède directement par le réseau local.

```
http://<ip-de-ton-home-assistant>:8100
```

> **8100 et non 8099** : les add-ons `sudoku` et `kitchencore` occupent déjà le 8099.
> Les trois peuvent tourner en même temps.

### Sur le téléphone

Ouvrir l'URL dans Chrome/Safari, puis **Ajouter à l'écran d'accueil** : le `manifest.json`
fait démarrer l'app en plein écran, sans barre d'adresse. Aucun *service worker* n'est
embarqué, chaque ouverture recharge la dernière version servie par l'add-on.

---

## Configurer son trajet

Onglet **Réglages → Mon trajet**. Saisir :

- l'**adresse du domicile** et celle du **travail**, en clair (« 12 rue des Lilas, Nantes ») ;
- l'heure de **départ le matin** et **le soir**.

Puis **Enregistrer et calculer l'itinéraire**. L'add-on :

1. géocode les deux adresses via **Nominatim** (OpenStreetMap) ;
2. calcule les deux itinéraires **vélo** (aller et retour, qui diffèrent souvent : sens
   uniques, pistes cyclables) via une instance publique **OSRM** ;
3. échantillonne 8 points de passage, avec le temps de parcours cumulé et le nom de rue ;
4. enregistre le tout dans `/data/velo-meteo.json`.

Le calcul prend quelques secondes et n'a lieu qu'à l'enregistrement. Les adresses reconnues
et les distances s'affichent juste en dessous — c'est là qu'on vérifie que Nominatim n'a pas
choisi une rue homonyme à l'autre bout du pays. Si c'est le cas, préciser l'adresse
(code postal, ville).

Changer **uniquement les horaires** ne relance pas le géocodage : seule la date de
consultation des prévisions bouge.

**Revenir aux données fictives** efface le trajet enregistré et repasse en mode maquette.

### Les options de l'add-on

Onglet **Configuration** dans Home Assistant. Elles servent de **valeurs par défaut** du
formulaire ; ce qui est saisi dans l'app prend le dessus et survit aux redémarrages.

| Option | Défaut | Rôle |
|---|---|---|
| `home_address` / `work_address` | Adresses parisiennes | Pré-remplissage du formulaire |
| `morning_departure_time` | `08:00` | Idem |
| `evening_departure_time` | `18:00` | Idem |
| `rain_alert_threshold_mm` | `0.5` | Cumul au-delà duquel le verdict passe à « pluie » |
| `ha_long_lived_token` | *(vide)* | Réservé aux notifications (non utilisé) |
| `notify_service` | *(vide)* | Ex. `notify.mobile_app_pixel` (non utilisé) |

---

## Les pages

| Onglet | Contenu |
|---|---|
| **Aujourd'hui** | Le trajet du jour. Matin avant 13 h, soir ensuite ; commutable à la main. |
| **Créneaux** | Les départs possibles autour de l'heure habituelle, classés par score. |
| **Historique** | Trois semaines de trajets secs / mouillés — **encore fictif**. |
| **Réglages** | Trajet, horaires, variante de layout. |

### Les trois variantes de l'écran d'accueil

Réglages → *Layout de l'accueil*, puis retour sur **Aujourd'hui**. Le choix est mémorisé
dans le navigateur du téléphone.

- **A — Verdict d'abord** : verdict → profil de pluie → vent → graphe → carte.
  Tout ce qui décide « j'y vais ou pas » tient dans le premier écran.
- **B — Carte d'abord** : plus visuel, mais il faut scroller pour les chiffres.
- **C — Coup d'œil** : verdict + profil + vent, le reste replié. Zéro scroll.

### mm/h ou mm : deux chiffres différents

- Le **profil de pluie** et les barres du graphe affichent une **intensité en mm/h** —
  l'échelle météo usuelle : bruine sous 1, averse modérée vers 2,5, forte au-delà de 7,6.
  C'est ce qui dit à quel point on prend cher à cet endroit-là.
- Le **cumul mm** de la carte verdict est ce qu'on reçoit réellement sur tout le trajet :
  chaque point compte pour sa tranche de parcours. Traverser 5 minutes d'averse à
  10 mm/h ne fait que 0,8 mm — d'où deux chiffres qui semblent se contredire mais
  répondent à deux questions différentes.

### Le bloc « profil de pluie »

Le trajet déroulé de gauche à droite, un bloc par point de passage, coloré par intensité.
Il répond en une seconde à « à quel moment du trajet je vais me faire saucer ? », là où une
carte demande de se repérer et un graphe de lire deux axes. C'est la brique à valider ou à
jeter après essai sur le terrain.

---

## Architecture

```
velo-meteo/
├─ config.yaml / build.yaml / Dockerfile   convention identique à sudoku et kitchencore
├─ server.js                               Express : API + statique, port 8100
├─ routes/
│  ├─ store.js      persistance /data/velo-meteo.json (écriture atomique)
│  ├─ geo.js        géocodage Nominatim, itinéraire OSRM, projection carte
│  ├─ forecast.js   Open-Meteo, assemblage, cache 5 min, créneaux
│  ├─ mock-data.js  jeu de données fictif (repli)
│  ├─ route.js      tracé + points de passage
│  ├─ weather.js    mm/h et % par point
│  ├─ wind.js       force, rafales, orientation relative
│  ├─ stats.js      historique + créneaux
│  └─ trips.js      configuration du trajet (CRUD)
└─ www/
   ├─ index.html    coquille + barre d'onglets
   ├─ css/app.css   thème clair et sombre, safe areas, contraste extérieur
   └─ js/
      ├─ mock.js    données de repli si l'API est injoignable
      ├─ ui.js      verdict, profil, vent, graphe SVG, carte SVG
      └─ app.js     routeur par hash, les 4 pages, les 3 variantes
```

### Sources de données

| Service | Usage | Quand |
|---|---|---|
| [Nominatim](https://nominatim.openstreetmap.org) | Géocodage des adresses | À l'enregistrement du trajet |
| [OSRM](https://routing.openstreetmap.de) (profil vélo, FOSSGIS) | Itinéraire | À l'enregistrement du trajet |
| [Open-Meteo](https://open-meteo.com) | Pluie, vent, ressenti | À l'affichage, cache 5 min |

Aucune clé d'API n'est nécessaire. Nominatim impose 1 requête/seconde et un User-Agent
identifiant l'application : les deux sont respectés, et l'appel n'a lieu qu'à
l'enregistrement, jamais en boucle. Données © contributeurs OpenStreetMap.

### Choix techniques

| Prévu au départ | Retenu | Pourquoi |
|---|---|---|
| React + Vite | HTML/CSS/JS vanilla | Pas d'étape de build : image Docker construite en quelques secondes sur le Pi, et une modif de layout est visible après un simple redémarrage. Aligné sur `sudoku` et `kitchencore`. |
| Recharts | Graphe SVG écrit à la main | ~60 lignes, aucune dépendance. |
| MapLibre GL JS | Carte SVG, tracé réel projeté | Le tracé est exact ; il manque le fond de carte, qui viendra avec MapLibre + tuiles RainViewer. |
| SQLite (`better-sqlite3`) | JSON dans `/data` | Compilation native très lente sur armv7/aarch64 pour un volume de données minuscule. |

---

## API

Toutes les routes renvoient `source: "live"` ou `"mock"`, et `error` quand un repli a eu lieu.

| Route | Réponse |
|---|---|
| `GET /api/route?type=morning\|evening` | Trajet, points de passage, tracé projeté |
| `GET /api/weather?type=…` | mm/h, cumul, % et ressenti par point ; pic, cumul total |
| `GET /api/wind?type=…` | Force, rafales, secteur, orientation relative au trajet |
| `GET /api/stats/windows?type=…` | 9 créneaux de départ autour de l'horaire habituel |
| `GET /api/stats/history` | 21 jours de trajets secs / mouillés (fictif) |
| `GET /api/trip` | Trajet configuré, ou `{ configured: false }` |
| `POST /api/trip` | Géocode et calcule les itinéraires. Corps : `home_address`, `work_address`, `morning_time`, `evening_time` |
| `PUT /api/trip/times` | Change les horaires sans recalculer l'itinéraire |
| `DELETE /api/trip` | Efface le trajet, retour au mode maquette |
| `GET /api/options` | Options de l'add-on |
| `GET /health` | `{ status, version, configured }` |

## Ce qui reste à faire

- **Historique réel** : enregistrer chaque trajet dans `/data` au fil des jours.
- **Fond de carte** : MapLibre + tuiles de pluie RainViewer, à la place de la carte SVG.
- **Notifications** : push via `notify_service` quand le seuil de pluie est dépassé avant
  le départ, en utilisant `ha_long_lived_token`.
- **Trajets multiples** : la structure ne gère aujourd'hui qu'un couple domicile ↔ travail.
- **Import GPX**, pour les trajets que le routeur ne trouve pas comme on les fait vraiment.

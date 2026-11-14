# Vélo Météo

Add-on Home Assistant qui affiche la météo (pluie, vent) sur le trajet vélotaf du matin et du soir.

Deux modes, selon qu'un trajet est configuré ou non :

| | Sans trajet configuré | Avec trajet configuré |
|---|---|---|
| Itinéraire | Trajet fictif Paris | Ton itinéraire vélo réel (OSRM) ou ta trace GPX |
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
fait démarrer l'app en plein écran, sans barre d'adresse, avec l'icône du vélo sous la
pluie. Aucun *service worker* n'est embarqué, chaque ouverture recharge la dernière
version servie par l'add-on.

> Un raccourci créé avant la 0.3.0 garde l'ancienne icône (une capture de la page) :
> le supprimer et le recréer suffit.

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

### Importer une trace GPX

Réglages → *Importer une trace GPX*, pour les trajets que le routeur ne trouve pas comme
on les fait vraiment (raccourci par un parc, passage vélo que la carte ignore, détour
volontaire). La trace remplace l'itinéraire calculé : mêmes points de passage, mêmes
prévisions, même carte.

1. Choisir le fichier `.gpx` (export Strava, Komoot, Garmin, OsmAnd…).
2. Indiquer le **sens de la trace** — aller ou retour. L'autre sens est la trace parcourue
   à l'envers : approximation assumée, les sens uniques diffèrent souvent au retour, mais
   préférable à mélanger une trace vécue et un itinéraire calculé sur le même trajet.
3. La **vitesse moyenne** ne sert que si la trace n'est pas horodatée. Une trace
   enregistrée à vélo l'est ; une trace construite dans un planificateur ne l'est pas.

Le départ et l'arrivée sont nommés par géocodage inverse Nominatim ; si Nominatim est
indisponible l'import aboutit quand même, avec des libellés génériques. Les horaires de
départ restent ceux du formulaire au-dessus.

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
| **Aujourd'hui** | Le **prochain trajet à venir**, déduit des horaires enregistrés ; commutable à la main, ou « Maintenant » pour un départ immédiat. |
| **Créneaux** | Les départs possibles autour de l'heure habituelle, classés par score. |
| **Historique** | Trois semaines de trajets secs / mouillés — **encore fictif**. |
| **Réglages** | Trajet, horaires, variante de layout. |

### La carte

Cadrée automatiquement sur le trajet au premier affichage, avec le tracé réel par-dessus.
Elle se **déplace** au doigt (ou à la souris) et se **zoome** au pincement, à la molette,
au double-clic ou avec les boutons `+` / `−`. Le bouton `⌖` la recadre sur le trajet ; il
n'apparaît qu'une fois qu'on l'a bougée.

Trois fonds au choix dans **Réglages → Fond de carte** :

| Fond | Couverture | Pour quoi faire |
|---|---|---|
| **OpenStreetMap** | Monde | Pistes cyclables bien rendues, le défaut |
| **Plan IGN** | France | Chemins, sentiers et relief plus détaillés |
| **Photo aérienne** | France | Repérer un passage à vue |

Les fonds IGN viennent de la **Géoplateforme**, sans clé d'API, sous Licence Ouverte
Etalab ; la mention figure sous la carte. Dans le thème sombre les tuiles de plan sont
assombries — une carte claire éblouit la nuit — mais pas la photo aérienne, qu'une
inversion transformerait en négatif. Sans accès Internet, seul le tracé reste, sur fond
neutre, et la légende le dit.

### Deux moteurs de rendu

**Réglages → Moteur de carte** bascule entre :

- **Maison** (défaut) : les tuiles posées à la main, ~120 lignes, rien à charger.
- **Leaflet** : la bibliothèque de référence, embarquée dans `www/vendor/leaflet/`
  (160 ko) et **chargée seulement si elle est choisie**. Elle rend le même contenu et
  obéit au même curseur de parcours.

Les deux affichent **exactement les mêmes tuiles**. Une bibliothèque carto ne rend pas un
fond raster plus net — elle affiche les mêmes images. Ce qui compte est la **densité
demandée** : sur un écran où un pixel CSS vaut 2 ou 3 pixels physiques, l'app prend le
zoom au-dessus et pose les tuiles à demi-taille. Les deux moteurs le font (`tileScale`
côté maison, `detectRetina` côté Leaflet). Ce qui change entre eux, c'est le confort de
manipulation et l'écosystème de contrôles, pas la netteté.

### Le pas de temps

**Réglages → Pas de temps** : 5 (défaut), 10, 15, 30 minutes ou `Automatique`. Il décide du nombre
de points de passage, donc du nombre de crans du curseur et de colonnes du graphe. Sur un
trajet de 55 minutes : 3 points à 30 min, 5 à 15, 7 à 10, 12 à 5 — et 8 en automatique,
l'ancien défaut.

Les boutons `−10` et `+10` ne provoquent **pas** de rendu complet : seuls le verdict, le
profil, le vent, le résumé, le bandeau, le curseur, le graphe et la couche de pluie sont
réécrits. La carte et ses tuiles restent en place — le tracé ne bouge pas quand on décale
l'heure — et le curseur garde le point qu'on regardait.

Le changement **rééchantillonne le tracé déjà mémorisé** : ni géocodage ni calcul
d'itinéraire, c'est instantané et ça n'use aucun quota. Les noms de rue survivent au
redécoupage, les bornes de manœuvre d'OSRM étant mémorisées avec le trajet.

> **Sous 15 minutes**, Open-Meteo renvoie le même créneau pour plusieurs points consécutifs :
> on gagne en finesse **spatiale** (des endroits différents), pas temporelle.

Un trajet enregistré avant la 0.3.0 ne mémorise pas son tracé : le réglage le dit et
demande de le réenregistrer.

### Quel trajet à l'ouverture

Celui qui vient. Tant que le trajet du matin n'est pas **terminé**, c'est lui ; puis celui
du soir ; une fois le soir passé, c'est le matin du lendemain, et la prévision bascule sur
demain toute seule. On raisonne sur la fin du trajet et non sur le départ : ouvrir l'app
en roulant montre le trajet en cours. La bascule manuelle Matin / Soir prime toujours.

### Maintenant

Le bouton du milieu, entre **Matin** et **Soir** : le trajet en partant **à l'instant**,
et non à l'horaire enregistré. Utile quand on part en décalé — pause déjeuner, départ
anticipé, sortie improvisée.

Le départ est arrondi au **prochain top de 5 minutes** : il ne tombe jamais dans le passé
— le temps de sortir le vélo — et la même réponse sert pendant cinq minutes au lieu de
changer à chaque seconde.

**Le sens est déduit de l'heure** : celui des deux trajets dont l'horaire habituel est le
plus proche de maintenant, dans un sens ou dans l'autre. Ce n'est pas la même question que
« quel est le prochain trajet » : à 22 h le prochain est l'aller de demain matin, mais si
on part *maintenant*, c'est évidemment vers la maison.

Tout suit : la carte, le curseur, le graphe, le verdict, et les créneaux, qui se recentrent
sur l'heure courante au lieu de l'horaire habituel. Le décalage ±10 min continue de
fonctionner par-dessus. Choisir « Maintenant » pendant un rejeu en sort : les deux se
contredisent.

### Les repères

🏠 le domicile, 🏢 le travail, 🚴 la position choisie au curseur. Trois formes franchement
différentes : trois pastilles de couleur, elles, se ressemblaient trop sur un fond de
carte. Chacun se change dans **Réglages → Repères de la carte**.

**L'icône suit le lieu, pas la place dans le trajet.** Au retour, le départ est le travail
et l'arrivée le domicile : poser 🏠 sur le premier point des deux sens mettait la maison
sur le bureau un jour sur deux. Une icône qui change de lieu selon le sens ne repère plus
rien. Les anciens réglages « Départ » / « Arrivée » sont relus tels quels : un choix déjà
fait n'est pas perdu.

Aux deux extrémités du curseur, la position tombe exactement sur le départ ou l'arrivée :
seul le halo est alors dessiné, pour ne pas masquer l'icône qu'on cherche à distinguer.

Un **cône de cap** pivote autour du repère de position, à la manière du point bleu des
applis de navigation. L'émoji, lui, reste droit : un cycliste tourné vers l'ouest se
retrouverait la tête en bas, et l'orientation de départ d'un émoji change d'une plateforme
à l'autre. Le cône est dessiné par l'app, donc fiable, et fonctionne avec n'importe quel
repère choisi. Le cap est pris entre le point précédent et le suivant, ce qui lisse les
zigzags du tracé.

### Les nuages de pluie

Par-dessus la carte, les précipitations **à l'heure où tu passes**. Une grille est
échantillonnée autour du trajet chez Open-Meteo — 9 × 9 cases au plus, soit 81 points en
une requête — chaque case à l'horaire du point de passage le plus proche, et le résultat
est dessiné en taches floues.

La grille cadre 1,6 fois la boîte du trajet : une averse qui arrive compte autant que
celle qui est déjà dessus. Sur un trajet de 18 km, cela donne environ **20 × 13 km pour
une maille de 2,4 × 1,6 km** — proche de la maille native d'AROME (1,5 km). À 7 × 7 cases,
la maille tombait à 3,3 km et une cellule isolée pouvait passer entre deux points.

La couleur suit l'**échelle météo usuelle**, rappelée par la légende sous la carte :
bruine sous 1 mm/h, modérée à partir de 1, forte à partir de 2,5, très forte au-delà de
7,6. La rampe traverse la teinte (cyan → bleu → violet → magenta) plutôt que de rester
dans les bleus, et l'opacité est fixe par palier : sur un fond de carte déjà coloré et
sous un flou, quatre bleus se confondent, quatre teintes non.

C'est une **prévision**, pas une image radar, et c'est délibéré : un radar montre ce qui
tombe maintenant, alors que le reste de l'écran (verdict, profil, créneaux) parle de
l'heure de départ. Deux échelles de temps sur le même écran se lisent de travers.

> **« Il pleut sur l'autre radar et l'app n'affiche rien. »** C'est la conséquence directe
> du paragraphe ci-dessus, et c'est presque toujours une question d'**heure**, pas de
> chargement. À 22 h 45, le trajet affiché est celui du lendemain matin : la carte montre
> la pluie prévue à 7 h 55, qui peut être nulle pendant qu'il tombe des cordes dehors. La
> ligne de provenance, sous le graphe, donne la date du trajet affiché, et le curseur
> l'heure exacte de chaque case. Pour voir ce qui tombe **maintenant**, le bouton
> **Maintenant** est là pour ça. Reste ensuite la maille : 2,4 km, contre quelques
> centaines de mètres pour une image radar — une cellule de quartier peut encore passer
> entre deux points.

> **Pourquoi ça ne colle pas avec weather.com.** D'abord parce qu'une prévision et une
> observation radar ne peuvent pas coïncider. Ensuite parce que le modèle compte : le
> défaut d'Open-Meteo sert ICON (allemand, maille de 2 à 11 km), qui lisse les averses
> locales. L'app demande donc explicitement `meteofrance_seamless`, soit **AROME** à
> 1,5 km sur la France. La probabilité de précipitation, que Météo-France ne publie pas
> via Open-Meteo, reste prise sur le modèle global — qui sert aussi de repli hors
> couverture française.

> RainViewer, envisagé au départ, plafonne ses tuiles au **zoom 7** en accès libre : une
> case y dépasse le kilomètre, ce qui donne un aplat uniforme sur une carte cadrée à
> quelques kilomètres. D'où le choix d'Open-Meteo.

**Réglages → Nuages de pluie → Simuler une averse** fait traverser le secteur à une averse
fictive, de la bruine à l'averse forte, sans attendre qu'il pleuve pour de bon au-dessus
du trajet.

Elle alimente **toutes les vues de pluie**, pas seulement la carte : graphe, profil,
verdict et créneaux. Comparer un écran mouillé à des chiffres secs ne permettrait rien de
valider. Les chiffres du graphe sont d'ailleurs lus dans la même grille que la carte, à la
case la plus proche du point de passage : les deux affichent exactement la même valeur.

Sa position dépend du **temps écoulé**, pas du rang du point de passage. Les boutons
±10 min la déplacent donc pour de bon, et la page Créneaux se classe vraiment. Un bandeau
en haut de chaque page rappelle qu'on regarde un jeu d'essai.

Le **vent reste réel** : le jeu d'essai simule la pluie, lui inventer une rose des vents
n'apporterait rien de vérifiable.

### Carte, curseur et graphe : un seul bloc

Les trois se suivent sans rien entre eux, dans une même carte : ce sont trois vues du
même trajet. La légende de l'échelle ouvre le bloc — elle vaut pour la carte comme pour
les barres du graphe, qui partagent la même rampe — et la **provenance** le ferme, sous le
graphe : tracé, fond de carte et source météo d'un seul tenant. Elle occupait un coin de
la carte, où elle masquait le terrain, et un bandeau vert permanent au-dessus de la carte
annonçait « données réelles » sans prévenir de rien. Seul le bouton de vue d'ensemble
reste en surimpression, dans le coin où il agit.

Le haut de l'écran ne garde donc que ce qui **avertit** : averse simulée, rejeu, repli sur
la maquette, prévisions indisponibles. En direct, il n'y a plus rien à y mettre.

Et ils sont **synchronisés** : déplacer le curseur, ou attraper la poignée posée sur le
graphe et la faire glisser, désigne le même point. Le marqueur de la carte, la position
du curseur et la colonne mise en avant suivent ensemble.

Le curseur est **aligné au pixel sur les colonnes** : ses deux extrémités tombent sur le
centre de la première et de la dernière, chaque cran intermédiaire sur la sienne. C'est
pour cela que les boutons de décalage n'affichent que `−` et `+` : réduits, ils tiennent
dans les marges de l'axe au lieu de rogner dessus.

Sur le graphe, la colonne est déduite de l'abscisse du doigt et le pointeur est capturé :
le geste continue même si le doigt sort du cadre. `touch-action: pan-y` laisse le
défilement vertical de la page au navigateur.

### Le curseur de parcours

Sous la carte, un curseur déplace un point le long du trajet. Il est **purement
temporel** : un cran par point de passage, du départ à l'arrivée.

Les boutons `−10` et `+10` qui l'encadrent font autre chose : ils **décalent tout le
trajet dans le temps**, par pas de 10 minutes, même durée, et relancent les prévisions.
Utile pour « et si je partais vingt minutes plus tard ». Le décalage n'est pas
enregistré — l'horaire de `/data` n'est jamais touché — et un rappel permet de revenir à
l'horaire habituel. Le marqueur se pose sur
le point et toute la carte bascule sur **l'heure où tu y seras**. On voit ainsi l'averse
arriver ou s'éloigner au fil du parcours ; le libellé donne l'heure, le lieu et
l'intensité à cet endroit.

Le bouton **Vue d'ensemble du trajet**, juste dessous, montre autre chose : chaque case de
la grille à l'heure du point de passage le plus proche, soit « où vais-je me faire saucer
sur *tout* le trajet ». Ce n'est pas un instant — l'image mélange plusieurs heures — d'où
son bouton séparé plutôt qu'un cran du curseur, et l'absence de marqueur. Toucher le
curseur y met fin.

Les images arrivent toutes dans la même réponse — une par point de passage — donc changer
de cran ne déclenche aucune requête : seul le calque SVG est réécrit, les tuiles restent
en place. Si l'heure d'un point sort de la fenêtre de prévision, le curseur affiche
« pas de prévision » plutôt qu'un ciel sec, qui serait faux.

### Les trois variantes de l'écran d'accueil

Réglages → *Layout de l'accueil*, puis retour sur **Aujourd'hui**. Le choix est mémorisé
dans le navigateur du téléphone.

- **B — Carte d'abord** (par défaut) : carte → graphe de pluie par point de passage →
  verdict → profil → vent. On situe le trajet, puis on lit où ça tombe dessus.
- **A — Verdict d'abord** : verdict → profil de pluie → vent → carte → graphe.
  Tout ce qui décide « j'y vais ou pas » tient dans le premier écran.
- **C — Coup d'œil** : verdict + profil + vent, la carte et le graphe repliés dans un
  unique accordéon. Zéro scroll.

### Les deux valeurs du point choisi

Sous le curseur, à droite, une pastille donne l'**intensité et la probabilité** du point
regardé : `1,2 mm/h · 65 %`. « Sec » tout seul ne disait pas s'il s'agissait d'un ciel sûr
ou d'un créneau à 60 % qui peut tourner. Sur le graphe, le point choisi écrit la même
probabilité à côté de son rond, du côté de la barre voisine la plus basse ; son intensité
est déjà au-dessus de sa barre. Les deux chiffres du point regardé se lisent donc sans
viser l'axe de droite.

> **Pourquoi un décalage peut bouger l'une sans l'autre.** Les deux courbes ne viennent
> pas du même pas de temps chez Open-Meteo : l'intensité du pas de **15 minutes**, la
> probabilité du pas **horaire**. Décaler le départ de 10 minutes change souvent
> l'intensité sans toucher à la probabilité — et par temps sec, l'inverse : la probabilité
> dérive de 15 à 20 % pendant que l'intensité reste à 0,0 et semble figée. Un rappel sous
> la légende du graphe le dit, parce que l'écran seul donnait l'impression d'un bug.

### La température

L'air et le ressenti, tous les deux. À vélo en novembre, l'écart entre les deux décide du
nombre de couches bien plus que le thermomètre seul.

- Sous le curseur, à gauche : `7° ressenti 4°` **au point regardé**. Le ressenti n'est
  écrit que lorsqu'il s'écarte d'au moins deux degrés — en deçà, la mention n'apprend rien.
- Dans la carte verdict, la moyenne du trajet, avec le même principe sur son étiquette.

Les deux suivent le curseur et le décalage horaire, comme la pluie et le vent. Open-Meteo
sert `temperature_2m` et `apparent_temperature` dans la requête qui porte déjà la pluie :
aucune source ni aucun appel en plus.

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

## Comparer les modèles, rejouer une journée de pluie

### Le mode debug

**Réglages → Mode debug → Comparer les modèles météo.** Cinq modèles Open-Meteo sur le
trajet et le créneau courants, avec cumul, pic et probabilité maximale. Utile même par
temps sec : c'est là qu'on voit lesquels divergent.

« Enregistrer ce relèvé » ajoute une ligne à `/data/models-log.ndjson`. Une automatisation
Home Assistant qui appelle `/api/debug/models?type=morning&log=1` une fois par jour
constitue l'historique toute seule.

### Rejouer une averse dans l'app

**Réglages → Rejouer une averse passée.** Le bouton « Chercher les averses passées »
interroge l'archive sur les quatre derniers mois et propose les journées pluvieuses du
trajet, **la plus intense d'abord, à l'heure de son pic**. Un clic, et l'app entière
bascule sur ce jour-là : carte des nuages, curseur, graphe, profil, verdict et créneaux.

Ce sont les prévisions que les modèles avaient **réellement émises** ce jour-là, pas une
reconstitution : le replay tape sur `historical-forecast-api.open-meteo.com`, avec les
mêmes modèles et les mêmes paramètres que le direct. Seule l'origine du JSON change — le
reste de l'app ne voit aucune différence.

Un bandeau ambré rappelle en permanence qu'on n'est pas dans le direct, et « Revenir au
direct » referme la parenthèse. Le décalage de départ est remis à zéro pendant un replay :
il n'a pas de sens sur une date figée.

> C'est le complément visuel de l'averse simulée : celle-ci sert à juger le rendu, le
> replay à juger l'app sur ce qui est vraiment tombé.

Toutes les routes de données acceptent `&replay=YYYY-MM-DDTHH:MM`. Une date d'aujourd'hui
ou du futur est ignorée et rend la main au direct.

### Le replay en ligne de commande

`tools/replay.js` teste l'app avec de **vraies** données de pluie, sans attendre qu'il
pleuve sur le trajet. Il s'appuie sur deux API Open-Meteo supplémentaires, gratuites et
sans clé : l'**archive ERA5** pour ce qui est réellement tombé, et l'**historical
forecast** pour ce que chaque modèle avait prévu ce jour-là.

```bash
node tools/replay.js scan --from 2026-06-01 --to 2026-08-31
node tools/replay.js day 2026-08-28 --at 08:30
node tools/replay.js day 2026-08-28 --at 08:30 --fixture data/pluie.json
```

`scan` liste les journées pluvieuses **avec l'heure du pic** : une journée à 34 mm ne sert
à rien si tout est tombé pendant qu'on était au bureau. `--at` force alors l'heure de
départ pour viser l'averse.

> ERA5 a une maille d'environ 25 km au pas horaire. Elle donne un ordre de grandeur, pas
> le détail d'une averse de quartier : un modèle « en écart » peut avoir raison localement.

### Quel modèle, et pourquoi

L'app utilise `meteofrance_seamless`, qui sert AROME HD (1,5 km) sur la France et enchaîne
sur AROME puis ARPEGE au-delà de son horizon.

Le pinner directement sur `meteofrance_arome_france_hd` a été évalué et écarté : sur dix
villes françaises et deux jours au pas de 15 minutes, les deux s'accordent sur **1917
créneaux sur 1920**, et les trois écarts sont des créneaux où `seamless` a une donnée que
AROME HD n'a pas. AROME HD seul s'arrête vers 48 h. Le pinner ne gagnerait rien et
coûterait de la couverture — il reste dans la comparaison du mode debug.

Même conclusion pour `meteofrance_arome_france_hd_15min`, le modèle de très courte
échéance (1,5 km, 15 min, **6 h d'horizon**, un run par heure) : sur les 77 créneaux où il
a une donnée, `seamless` donne **exactement la même valeur**, et il n'en a aucune sur les
115 autres. Autrement dit, l'app reçoit déjà AROME HD au pas de 15 minutes sur toute la
fenêtre de très courte échéance, sans rien demander de particulier.

### Les sources écartées, et pourquoi

**WeatherNext 3 (Google DeepMind).** Évalué en novembre 2026. La précipitation y est
publiée au pas **horaire sur une grille de 0,1°, soit environ 10 km** — les « 5 km »
annoncés concernent d'autres variables de surface. Pour un trajet de 18 km, cela fait deux
cases et un chiffre par heure, là où l'app travaille au point de passage et au pas de
5 minutes sur une maille de 1,5 km. Quarante fois plus grossier en surface, quatre fois
plus grossier dans le temps : le modèle ne peut pas répondre à la question que pose l'app.
S'ajoutent un accès sur liste blanche et des conditions d'usage « expérimentales » pour le
temps réel. Son intérêt est ailleurs — la prévision globale à 15 jours — et n'a pas de
place ici.

**PIAF (Météo-France), via le portail API.** Repéré grâce à
[pleutpas.fr](https://github.com/jlzdev/pleutpas), qui vise la même chose que cette app.
PIAF fusionne extrapolation radar et modèle, se recalcule **toutes les 5 minutes** et
couvre **−1 h à +3 h**. Ce qu'il apporterait n'est pas la résolution — elle est déjà
équivalente, voir ci-dessus — mais la **fraîcheur** : un nouveau champ toutes les 5 min au
lieu d'un run par heure, et l'observation radar mêlée à la prévision. C'est exactement ce
qui manque au bouton « Maintenant ». Le prix : une clé d'API à configurer, la lecture de
grilles WCS côté add-on, la France seule, et une seconde source à maintenir pour les trois
premières heures. Gain réel mais ciblé, chantier non négligeable : à traiter à part.

> L'architecture de pleutpas — aucun backend, deux workflows GitHub Actions qui colorisent
> les grilles en PNG et les publient sur des branches orphelines — est élégante pour un
> site public et statique. Elle ne transpose pas ici : un add-on Home Assistant *est* un
> backend, qui tourne déjà chez soi avec son `/data`, et le trajet est personnel. On
> perdrait la personnalisation pour résoudre un problème qu'on n'a pas.

## Architecture

```
velo-meteo/
├─ config.yaml / build.yaml / Dockerfile   convention identique à sudoku et kitchencore
├─ server.js                               Express : API + statique, port 8100
├─ routes/
│  ├─ store.js      persistance /data/velo-meteo.json (écriture atomique)
│  ├─ geo.js        géocodage Nominatim, itinéraire OSRM, projection carte
│  ├─ gpx.js        lecture d'une trace GPX (points, horodatage, altitude)
│  ├─ forecast.js   Open-Meteo, assemblage, cache 5 min, créneaux
│  ├─ mock-data.js  jeu de données fictif (repli)
│  ├─ route.js      tracé + points de passage
│  ├─ radar.js      nuages de pluie autour du trajet (+ averse simulée)
│  ├─ demo.js       contexte de l'averse simulée (trajet et heure)
│  ├─ debug.js      comparaison des modèles, journal, averses passées
│  ├─ history.js    averses passées du trajet dans l'archive ERA5
│  ├─ weather.js    mm/h et % par point
│  ├─ wind.js       force, rafales, orientation relative
│  ├─ stats.js      historique + créneaux
│  └─ trips.js      configuration du trajet (CRUD)
├─ tools/
│  └─ replay.js     rejoue une journée passée : prévision contre réalité
└─ www/
   ├─ index.html    coquille + barre d'onglets
   ├─ manifest.json PWA : nom, couleurs, icônes du raccourci
   ├─ icons/        icônes 192/512, maskable, apple-touch (dérivées de icon.png)
   ├─ vendor/       Leaflet 1.9.4, chargé à la demande (second moteur de carte)
   ├─ css/app.css   thème clair et sombre, safe areas, contraste extérieur
   └─ js/
      ├─ mock.js    données de repli si l'API est injoignable
      ├─ ui.js      verdict, profil, vent, graphe SVG, carte à tuiles
      └─ app.js     routeur par hash, les 4 pages, les 3 variantes
```

### Sources de données

| Service | Usage | Quand |
|---|---|---|
| [Nominatim](https://nominatim.openstreetmap.org) | Géocodage des adresses | À l'enregistrement du trajet |
| [OSRM](https://routing.openstreetmap.de) (profil vélo, FOSSGIS) | Itinéraire | À l'enregistrement du trajet |
| [Open-Meteo](https://open-meteo.com) | Pluie, vent, ressenti — modèle **Météo-France AROME** | À l'affichage, cache 5 min |
| [Tuiles OSM](https://tile.openstreetmap.org) | Fond de carte (défaut) | À chaque affichage de la carte |
| [Géoplateforme IGN](https://geoservices.ign.fr) | Fonds Plan IGN et photo aérienne | Idem, si le fond IGN est choisi |
| [Open-Meteo](https://open-meteo.com) | Nuages de pluie (grille ~900 m) | À l'affichage de la carte, cache 5 min |

Aucune clé d'API n'est nécessaire. Nominatim impose 1 requête/seconde et un User-Agent
identifiant l'application : les deux sont respectés, et l'appel n'a lieu qu'à
l'enregistrement, jamais en boucle. Données © contributeurs OpenStreetMap.

### Choix techniques

| Prévu au départ | Retenu | Pourquoi |
|---|---|---|
| React + Vite | HTML/CSS/JS vanilla | Pas d'étape de build : image Docker construite en quelques secondes sur le Pi, et une modif de layout est visible après un simple redémarrage. Aligné sur `sudoku` et `kitchencore`. |
| Recharts | Graphe SVG écrit à la main | ~60 lignes, aucune dépendance. |
| MapLibre GL JS / Leaflet | Tuiles posées à la main par défaut, **Leaflet disponible en second moteur** | Le déplacement et le zoom tiennent en ~120 lignes et réutilisent la projection déjà en place. Leaflet est embarqué pour comparaison, chargé seulement s'il est choisi. Les deux rendent les mêmes tuiles : une bibliothèque n'améliore pas la netteté d'un fond raster. |
| Tuiles radar RainViewer | Grille Open-Meteo dessinée en SVG | RainViewer plafonne au zoom 7 en accès libre : trop grossier pour un vélotaf. Et il montre « maintenant » là où le reste de l'app montre l'heure de départ. |
| Une lib GPX | Lecture à l'expression régulière | Un GPX est un XML plat dont on n'exploite que `trkpt`, `ele` et `time`. Ajouter un parseur XML complet à une image qui ne contient qu'express pour quatre balises ne se justifie pas. |
| SQLite (`better-sqlite3`) | JSON dans `/data` | Compilation native très lente sur armv7/aarch64 pour un volume de données minuscule. |

---

## API

Toutes les routes renvoient `source: "live"` ou `"mock"`, et `error` quand un repli a eu lieu.

| Route | Réponse |
|---|---|
| `GET /api/route?type=morning\|evening` | Trajet, points de passage, tracé projeté |
| `GET /api/weather?type=…&demo=1` | mm/h, cumul, % et ressenti par point ; pic, cumul total. `demo=1` renvoie le jeu d'essai |
| `GET /api/wind?type=…` | Force, rafales, secteur, orientation relative au trajet |
| `GET /api/radar?type=…&demo=1` | Nuages de pluie : grille autour du trajet, `cells` en vue d'ensemble et `frames` (une image par point de passage) pour le curseur. `demo=1` renvoie une averse fictive |
| `GET /api/stats/windows?type=…` | 9 créneaux de départ autour de l'horaire habituel |
| *(`&replay=YYYY-MM-DDTHH:MM`)* | Sur `route`, `weather`, `wind`, `radar` et `stats/windows` : rejoue les prévisions émises ce jour-là |
| *(`&now=1`)* | Sur les mêmes routes : départ à l'instant plutôt qu'à l'horaire enregistré. Le rejeu, s'il est présent, l'emporte |
| `GET /api/stats/history` | 21 jours de trajets secs / mouillés (fictif) |
| `GET /api/trip` | Trajet configuré, ou `{ configured: false }` |
| `POST /api/trip` | Géocode et calcule les itinéraires. Corps : `home_address`, `work_address`, `morning_time`, `evening_time` |
| `POST /api/trip/gpx` | Importe une trace GPX. Corps : le fichier brut. Query : `direction`, `speed_kmh`, `morning_time`, `evening_time` |
| `PUT /api/trip/times` | Change les horaires sans recalculer l'itinéraire |
| `PUT /api/trip/step` | Change le pas de temps. Rééchantillonne le tracé mémorisé, sans appel externe |
| `DELETE /api/trip` | Efface le trajet, retour au mode maquette |
| `GET /api/debug/models?type=…&log=1` | Cinq modèles côte à côte sur le trajet. `log=1` ajoute un relèvé au journal |
| `GET /api/debug/log?limit=…` | Les derniers relèvés enregistrés |
| `GET /api/debug/showers?days=…` | Les averses passées du trajet, la plus intense d'abord, avec l'heure du pic |
| `GET /api/options` | Options de l'add-on |
| `GET /health` | `{ status, version, configured }` |

## Ce qui reste à faire

- **Historique réel** : enregistrer chaque trajet dans `/data` au fil des jours.
- **Lecture automatique** : le curseur se déplace à la main ; une animation en boucle
  donnerait le mouvement de l'averse d'un coup d'œil.
- **Notifications** : push via `notify_service` quand le seuil de pluie est dépassé avant
  le départ, en utilisant `ha_long_lived_token`.
- **Trajets multiples** : la structure ne gère aujourd'hui qu'un couple domicile ↔ travail.
- **Trace GPX du retour** : aujourd'hui le retour est la trace de l'aller à l'envers.

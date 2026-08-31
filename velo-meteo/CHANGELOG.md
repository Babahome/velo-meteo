# Changelog

## 0.8.0 — Échelle de pluie lisible, décalage du départ, repères distincts

- **L'échelle de couleur de la pluie est refaite.** Elle était calibrée en opacité
  proportionnelle à l'intensité, ce qui saturait dès 5 mm/h : « forte » et « très forte »
  s'affichaient à l'identique, et les quatre paliers étaient quatre bleus qui se
  confondaient sous le flou. Désormais la rampe traverse la teinte — cyan, bleu, violet,
  magenta — et l'opacité est fixée par palier. C'est la teinte qui porte l'information.
  - **Une légende** sous la carte donne les bornes en mm/h : sans elle, les couleurs ne
    voulaient rien dire.
  - L'averse simulée monte maintenant à 14 mm/h et traverse les quatre paliers, ce qu'il
    faut pour juger le dégradé.

- **Décaler le départ** avec deux boutons `−10` / `+10` de part et d'autre du curseur :
  tout le trajet se déplace dans le temps, même durée, et les prévisions sont recalculées.
  Un rappel affiche le décalage en cours et permet de revenir à l'horaire habituel.
  - Le décalage est **volontairement non enregistré** : c'est un « et si je partais vingt
    minutes plus tard », pas un réglage. L'horaire de `/data` n'est jamais touché.
  - Les clics rapprochés sont groupés : marteler le bouton ne déclenche qu'une requête.

- **Repères distincts sur la carte** : 🏠 départ, 🏢 arrivée, 🚴 position. Trois formes
  franchement différentes, là où trois pastilles ne se distinguaient que par leur
  remplissage. Chacun est personnalisable dans Réglages → Repères de la carte, parmi cinq
  icônes.
  - Aux deux extrémités, la position tombe pile sur le départ ou l'arrivée : seul le halo
    est dessiné, pour ne pas masquer l'icône qu'on cherche justement à distinguer.

## 0.7.0 — Tuiles nettes, et Leaflet en second moteur

- **La carte n'est plus floue sur téléphone.** Les tuiles étaient posées à leur taille
  nominale (256 px) alors qu'un écran de téléphone affiche 2 à 3 pixels physiques par
  pixel CSS : elles étaient donc agrandies d'autant. L'app demande maintenant le zoom
  au-dessus et pose les tuiles à demi-taille — même cadrage, deux fois plus de pixels.
  C'est exactement ce que fait `detectRetina` dans Leaflet.

  À noter : **la netteté ne venait pas du moteur de rendu.** Leaflet affiche les mêmes
  images raster ; c'est la densité demandée qui compte, et elle se règle des deux côtés.

- **Second moteur de carte : Leaflet** (Réglages → Moteur de carte), pour comparer sur le
  terrain. Il rend le même contenu — tuiles, tracé, nuages de pluie floutés dans un
  calque dédié, marqueurs, point du curseur — et reste piloté par le même curseur de
  parcours.
  - Leaflet 1.9.4 est embarqué dans `www/vendor/leaflet/` (160 ko), mais **chargé
    seulement s'il est choisi** : le mode par défaut ne paie rien.
  - Si le fichier manque, l'app retombe sur le rendu maison plutôt que sur une carte vide.

## 0.6.0 — Carte interactive, fonds IGN, modèle AROME

- **La carte se déplace et se zoome.** C'était bien une image fixe : les tuiles étaient
  posées une fois pour cadrer le trajet, sans aucune interaction. Elle accepte maintenant
  le glissement au doigt ou à la souris, le pincement, la molette, le double-clic, et
  trois boutons (+, −, et ⌖ qui recadre sur le trajet, visible seulement après un
  déplacement).
  - Toujours **sans bibliothèque carto**. Leaflet ou MapLibre auraient imposé 45 à 200 ko
    dans l'image Docker *et* la réécriture de tout le calque — tracé, nuages, curseur —
    dans leur système de coordonnées. Le zoom et le déplacement tiennent en ~120 lignes
    et réutilisent la projection déjà en place.
  - Les tuiles déjà chargées sont **déplacées**, pas recréées : sans ça, chaque pixel de
    déplacement reconstruirait le DOM et la carte clignoterait.
- **Fonds de carte IGN** (Réglages → Fond de carte) : *Plan IGN* et *Photo aérienne*, en
  plus d'OpenStreetMap. La Géoplateforme sert ses tuiles **sans clé d'API**, dans la même
  grille Web Mercator que l'OSM — une URL à changer, rien d'autre. Licence Ouverte Etalab,
  mention affichée sous la carte. Le Scan 25 (carte de rando) n'est pas en accès libre.
  La photo aérienne n'est pas assombrie dans le thème sombre : l'inverser donnerait un
  négatif.

Corrections :

- **Modèle de prévision** : Open-Meteo servait en réalité **ICON** (modèle allemand,
  maille de 2 à 11 km), qui lisse les averses locales — d'où des écarts visibles avec les
  sources françaises. L'app demande désormais `meteofrance_seamless`, soit **AROME**
  (1,5 km) sur la France. Comme Météo-France ne publie pas de probabilité de
  précipitation via Open-Meteo, celle-ci est prise sur le modèle global, qui sert aussi
  de repli hors couverture. Les deux modèles arrivent dans la même requête.

  Cela rapproche l'app des prévisions françaises, mais ne la fera jamais coïncider avec
  une image radar : l'app **prévoit** l'heure de passage, un radar **observe** l'instant
  présent. Le point est expliqué dans Réglages → Nuages de pluie.

## 0.5.1 — Le curseur ne montre plus que des instants

Le cran 0 du curseur affichait la vue d'ensemble, qui superpose plusieurs heures sur une
même image : la mêler aux crans temporels prêtait à confusion. Le curseur est maintenant
purement temporel — **cran 0 = l'heure de départ**, dernier cran = l'arrivée — et la vue
d'ensemble a son propre bouton sous le curseur.

- Toucher le curseur quitte la vue d'ensemble : demander un cran, c'est demander un instant.
- Pas de marqueur en vue d'ensemble : elle ne correspond à aucun instant, donc à aucune
  position précise sur le trajet.

## 0.5.0 — Curseur de parcours

Un curseur sous la carte déplace un point le long du trajet. À chaque cran, le marqueur
se pose sur le point de passage et **les nuages basculent sur l'heure de passage de ce
point** : on voit l'averse arriver ou s'éloigner au fil du trajet, au lieu d'une seule
image figée.

- Le libellé donne l'heure, le lieu et l'intensité au point choisi.
- La **vue d'ensemble** reste accessible à côté (voir 0.5.1) : chaque case de la grille à
  l'heure du point de passage le plus proche, soit « où vais-je me faire saucer sur tout
  le trajet ».
- Les images de pluie arrivent **toutes dans la même réponse** (une image par point de
  passage) : passer d'un cran à l'autre ne déclenche aucune requête, et seul le calque
  SVG est réécrit — les tuiles ne sont pas rechargées.
- Une heure de passage hors fenêtre de prévision affiche « pas de prévision » plutôt
  qu'un ciel sec, qui serait faux.
- L'averse simulée **traverse** désormais la carte au fil des images : un nuage immobile
  ne dirait pas si le curseur change vraiment d'heure.

## 0.4.0 — Nuages de pluie, carte d'abord, nom du GPX

- **Nuages de précipitations sur la carte**, à l'heure de passage. Une grille de ~900 m
  autour du trajet est interrogée chez Open-Meteo, chaque case à l'heure où le vélo passe
  à côté ; le rendu est un aplat flouté dans le calque SVG déjà posé sur les tuiles.
  - **RainViewer a été écarté** : ses tuiles s'arrêtent au zoom 7 en accès libre (au-delà
    il renvoie une image « Zoom Level Not Supported »), soit une case de plus d'un
    kilomètre — un aplat uniforme à l'échelle d'un vélotaf. Et une image radar montre ce
    qui tombe *maintenant*, quand tout le reste de l'app parle de l'heure de départ :
    deux lectures contradictoires sur le même écran.
  - **Averse simulée** (Réglages → Nuages de pluie) : pose une averse fictive sur le
    trajet pour juger le rendu sans attendre qu'il pleuve vraiment. Elle passe par le
    même chemin que les vraies données, donc elle teste bien l'affichage réel.
- **Carte en premier** sur l'écran d'accueil, puis le graphe de pluie par point de
  passage. Le layout B devient le layout par défaut ; un choix « A » hérité de la phase
  maquette est basculé une seule fois, sinon le changement resterait invisible sur un
  téléphone qui a déjà son réglage en mémoire. Repasser en A dans Réglages reste possible.
  La carte passe aussi avant le graphe dans les layouts A et C.

Corrections :

- **Nom du fichier GPX** : il disparaissait dès que le formulaire était réaffiché.
  Choisir un fichier ne provoque plus de rendu complet — c'est lui qui vidait l'`<input
  type=file>` et faisait réapparaître « Aucun fichier choisi ». Le nom est désormais
  enregistré avec le trajet, et visible dans le message de confirmation, sous le champ
  et dans la ligne « Origine ».
- Un rendu déclenché depuis la page ne remonte plus en haut de l'écran : les messages de
  confirmation restaient hors de vue, et on croyait qu'il ne s'était rien passé.

## 0.3.0 — Fond de carte, trace GPX, icône PWA

- **Fond de carte** : les tuiles OpenStreetMap remplacent la grille SVG. Le tracé se
  lit enfin par rapport aux rues et aux repères réels. Pas de MapLibre : la carte n'est
  ni déplaçable ni zoomable, poser les tuiles à la main coûte ~70 lignes contre ~800 ko
  de bibliothèque dans l'image Docker.
  - Cadrage automatique sur le trajet, projection Web Mercator, zoom entier pour garder
    les tuiles nettes.
  - Les tuiles sont assombries dans le thème sombre — une carte OSM brute éblouit.
  - Sans accès Internet, la carte retombe sur le fond neutre et le dit ; le tracé et les
    marqueurs restent affichés.
- **Import de trace GPX** (Réglages) : une trace remplace l'itinéraire calculé, avec les
  mêmes points de passage et les mêmes prévisions. Utile pour les trajets que le routeur
  ne trouve pas comme on les fait vraiment.
  - `trkpt`, à défaut `rtept` puis `wpt` ; préfixes de namespace et ordre des attributs
    indifférents ; segments concaténés.
  - Horaires de passage lus dans la trace si elle est horodatée, sinon déduits d'une
    vitesse moyenne saisie.
  - Départ et arrivée nommés par géocodage inverse Nominatim ; son échec n'empêche pas
    l'import.
  - Dénivelé positif cumulé lu dans les `<ele>` et affiché dans Réglages.
  - L'autre sens est la trace parcourue à l'envers — approximation assumée, préférable à
    mélanger une trace vécue et un itinéraire calculé sur le même trajet.
- **Icône du raccourci PWA** : le manifest ne déclarait aucune icône, l'écran d'accueil
  affichait donc une capture de la page. Icônes 192 et 512, variantes *maskable* (fond à
  bord perdu, contenu dans la zone sûre) et `apple-touch-icon` pour iOS, qui ignore le
  manifest.

Le tracé stocké est ramené à ~300 points quelle que soit sa taille d'origine : une trace
GPX brute en compte des dizaines de milliers, illisibles à l'œil et lourds dans `/data`.

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

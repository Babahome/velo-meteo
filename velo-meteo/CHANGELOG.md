# Changelog

## 0.13.0 — Le décalage ne recharge plus la page

- **Un appui sur ±10 min ne re-rend plus que ce qui dépend de l'heure** : verdict, profil,
  vent, résumé, bandeau, plus le curseur, le graphe et la couche de pluie de la carte.
  - Le rendu complet d'avant remontait la carte, donc **rechargeait ses tuiles** : tout
    l'écran clignotait, alors que le tracé ne bouge pas d'un pixel quand on décale l'heure.
  - Chaque bloc concerné est désormais adressable, dans une enveloppe en `display:contents`
    qui ne change rien à la mise en page.
  - **Le curseur garde le point regardé.** Il revenait au départ à chaque décalage ; seules
    les heures changent, pas les points de passage.
  - En cas d'erreur réseau, on retombe sur un rendu complet plutôt que sur un écran
    à moitié à jour.

- **Le pas de 5 minutes devient le défaut** (était `Automatique`). Sur un trajet d'une
  heure, 12 points au lieu de 8 : même si Open-Meteo ne descend pas sous 15 min, les points
  intermédiaires tombent à des endroits différents, donc sur des intensités différentes.
  `Automatique` reste disponible.
  - Les étiquettes du graphe s'espacent au-delà de 12 colonnes, et leur corps diminue
    au-delà de 10 : à 16 colonnes elles ne tiendraient plus toutes.
  - La poignée du curseur passe **sous** les barres : son trait vertical barrait le chiffre
    de la colonne choisie.

## 0.12.0 — Pas de temps réglable, et cap du trajet

- **Pas de temps** (Réglages) : `Automatique`, 5, 10, 15 ou 30 minutes. Il décide du nombre
  de points de passage, donc du nombre de crans du curseur et de colonnes du graphe. Sur
  un trajet de 55 min : 3 points à 30 min, 5 à 15, 7 à 10, 12 à 5, et 8 en automatique.
  - Le changement **rééchantillonne le tracé déjà mémorisé** : ni Nominatim ni OSRM ne sont
    rappelés, c'est instantané et ça n'use aucun quota.
  - Les **noms de rue survivent** au redécoupage : les bornes de manœuvre d'OSRM sont
    désormais mémorisées avec le trajet, faute de quoi les points intermédiaires seraient
    retombés sur un « km 5,3 ».
  - Sous 15 minutes, Open-Meteo renvoie le même créneau pour plusieurs points consécutifs.
    On gagne alors en finesse **spatiale** — des endroits différents — pas temporelle. Le
    réglage le dit.
  - `Automatique` reste le défaut et garde le comportement d'avant.

- **Cap du trajet** au point choisi : un cône pivote autour du repère, à la manière du
  point bleu des applis de navigation.
  - L'émoji lui-même n'est **pas** pivoté. Un cycliste tourné vers l'ouest se retrouverait
    la tête en bas, et l'orientation de départ d'un émoji change d'une plateforme à
    l'autre — impossible de savoir de quel côté il regarde. Le cône, lui, est dessiné par
    nous : il indique le cap exactement, et fonctionne avec n'importe quel repère choisi.
  - Le cap est pris **entre le point précédent et le suivant** : la moyenne lisse les
    zigzags du tracé, qui feraient autrement tourner le repère à chaque virage de rue.

## 0.11.0 — Le curseur se cale sur le graphe, et s'y attrape

- **Les boutons de décalage n'affichent plus que `−` et `+`.** Ce n'est pas qu'esthétique :
  c'est ce qui a libéré la place nécessaire au point suivant.
- **Le curseur est aligné au pixel sur les colonnes du graphe.** Ses deux extrémités
  tombent exactement sur le centre de la première et de la dernière colonne, et chaque
  cran intermédiaire sur la sienne — écart mesuré nul sur les huit crans. Les boutons
  réduits tiennent désormais dans les marges de l'axe, de part et d'autre.
- **Le graphe s'attrape directement** : une poignée et un trait vertical marquent la
  colonne choisie, et on la fait glisser d'un bout à l'autre. Curseur, carte et graphe
  restent synchronisés, comme avant.

Deux points qui rendent le glissement fiable plutôt que fragile :

- La colonne est déduite de l'**abscisse du doigt**, pas d'une zone cliquable. Avec la
  capture du pointeur, la cible des événements devient le graphe lui-même : le doigt peut
  sortir du cadre sans que le geste s'interrompe.
- La synchronisation ne réécrit plus que **l'intérieur** du `<svg>`. Remplacer le nœud,
  comme avant, le détruisait en cours de glissement — et avec lui la capture du pointeur,
  donc le geste dès le premier déplacement.

`touch-action: pan-y` laisse le défilement vertical de la page au navigateur : le graphe
ne prend que l'horizontal, celui du curseur.

## 0.10.0 — L'averse simulée arrose tout l'écran

L'averse de test ne colorait que la carte : le graphe, le profil et le verdict continuaient
d'afficher la vraie prévision. Comparer un écran mouillé à des chiffres secs ne permettait
de rien valider. Le jeu d'essai alimente maintenant **toutes** les vues de pluie.

- **Graphe, profil de pluie et verdict** suivent l'averse simulée, avec des probabilités
  cohérentes avec l'intensité.
- **Les chiffres du graphe et ceux de la carte sont les mêmes** : l'intensité d'un point de
  passage est lue dans la grille, à la case la plus proche — exactement ce que fait la
  pastille du curseur. Vérifié point par point.
- **La position de l'averse dépend maintenant du temps écoulé**, plus du rang du point de
  passage. Conséquence : les boutons ±10 min la déplacent pour de bon (−30 min et +60 min
  donnent un trajet sec, l'horaire habituel prend 1,7 mm), et **la page Créneaux se classe
  vraiment** au lieu d'afficher une liste figée.
- Un bandeau « ☔ Averse simulée · tout l'écran tourne sur le jeu d'essai » remplace celui
  d'origine des données : impossible de confondre un test avec une vraie prévision.

Le vent reste réel : le jeu d'essai simule la pluie, inventer une rose des vents avec
n'aurait rien apporté de vérifiable.

## 0.9.1 — Le graphe dit ses chiffres, la carte gagne ses coins

- **L'intensité est écrite au-dessus de chaque barre** du graphe. Une barre courte ne
  disait pas si on parlait de bruine ou d'averse ; on lit maintenant « 0,6 », « 3,2 »,
  « 11,0 » directement.
- **Le titre « Pluie par point de passage » disparaît** : le graphe suit immédiatement le
  curseur, son objet est évident.
- **La légende de l'échelle passe en tête du bloc**, au-dessus de la carte.
- **Les crédits** (« Tracé réel · © OpenStreetMap ») passent **en surimpression dans le
  coin bas droit** de la carte, sur fond translucide.
- **Le bouton « Vue d'ensemble »** passe dans le **coin bas gauche**, même traitement.
  Chaque coin tient dans sa moitié de carte : les deux ne peuvent pas se chevaucher,
  quelle que soit la largeur de l'écran.
- Le marqueur d'**averse simulée** prend le coin haut gauche, seul endroit encore libre :
  il ne faut pas pouvoir confondre une averse de test avec une vraie.
- Les graduations de l'axe passent à la virgule décimale, comme le reste de l'app.

## 0.9.0 — Carte, curseur et graphe ne font plus qu'un

- **La carte et le graphe de pluie sont contigus.** Le bouton de vue d'ensemble et la
  ligne de crédits s'intercalaient entre les deux et cassaient la lecture : ils passent
  après le graphe, avec la légende de l'échelle — qui sert d'ailleurs aux deux, puisque
  les barres du graphe et les nuages de la carte partagent la même rampe. Le bloc
  enchaîne désormais carte → curseur → graphe, dans une seule carte.
- **Les trois vues sont synchronisées.** Déplacer le curseur, cliquer une colonne du
  graphe ou glisser le long de celui-ci désigne le même point du trajet : le marqueur de
  la carte, la position du curseur, la colonne mise en avant et l'étiquette d'heure
  suivent ensemble.
  - La colonne active est soulignée d'une bande, sa barre cernée, son point de
    probabilité grossi et son heure mise en gras.
  - Les zones de saisie du graphe couvrent toute la hauteur d'une colonne : viser une
    barre de deux pixels au doigt serait intenable.
  - Cliquer le graphe quitte la vue d'ensemble, comme le curseur — désigner un point,
    c'est demander un instant.
- La pastille d'intensité du curseur reprend la couleur exacte de son palier, comme la
  légende, au lieu d'une seule couleur pour trois paliers.

Le layout C fond aussi les deux dans un unique accordéon « Carte et pluie du trajet »,
au lieu de deux repliables séparés.

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

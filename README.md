# Yamanote 3D — 山手線

Expérience web contemplative et passive : vous êtes passager d'une rame JR East
série E235 sur la ligne Yamanote (Tokyo, boucle de 30 stations). Aucun objectif,
aucun score : on marche dans le wagon, on s'assoit, on regarde la ville défiler,
on écoute les annonces et les mélodies — et, si on s'arrête devant quelqu'un, on
l'écoute parler. La boucle tourne indéfiniment, en temps
quasi réel (environ 1 à 3 minutes par tronçon selon la gare, ~67 minutes la boucle).

## Lancer

```bash
npm install
npm run dev      # développement
npm run build    # production (tsc + vite)
npm run preview  # servir le build
npm run lint     # oxlint
```

## Contrôles

- Regarder : un clic dans le jeu capture la souris (regard libre) ; Échap pour
  libérer. Si le verrou est refusé (iframe), cliquer-glisser reste disponible
- Marcher : ZQSD, WASD ou les flèches ; Maj pour presser le pas
- S'asseoir : un clic net vers une place libre (ou le bouton du HUD) une fois
  le regard capturé ; se lever : espace, un nouveau clic, ou le bouton du HUD
- **Descendre / remonter : marcher à travers une porte ouverte.** Aucune touche —
  la porte ouverte *est* le passage
- **Parler : E**, quand un voyageur est en face et à portée de voix — une
  invite l'annonce sous le réticule. Depuis le quai on parle aux gens du quai,
  jamais à travers la vitre à ceux qui sont assis dans la rame
- M : couper le son, F : plein écran
- Mobile : joystick virtuel à gauche, glisser sur la scène pour regarder,
  bouton s'asseoir, bouton « Parler » quand quelqu'un est à portée

Avant de monter, le menu laisse choisir la **date**, l'heure et l'arrêt. Par
défaut, l'instant réel à Tokyo et une gare tirée au hasard. La date n'est pas un
détail d'état civil : c'est elle qui donne la saison — couleur des frondaisons,
hauteur du soleil, heure de la tombée de nuit — et le temps qu'il fera ce
jour-là. Le HUD affiche le temps qu'il fait et la température.

## Descendre en gare

Pendant l'arrêt, on peut sortir du wagon et rester sur le quai. Le train
termine son arrêt, joue sa 発車メロディ, ferme ses portes et **s'en va sans
nous** : il faut attendre le suivant, environ deux minutes plus tard, comme sur
la vraie ligne. Le quai se vide puis se repeuple, l'annonce d'approche tombe, la
rame suivante freine le long du quai et rouvre ses portes.

Techniquement, c'est un renversement de référentiel. En marche, le train est
fixe à l'origine et c'est le monde qui défile ; dès que le joueur pose le pied
sur le quai, la gare devient le repère fixe (`runtime.distance` gelé, donc le
décor reste calé sur elle) et c'est la rame qui glisse (`runtime.trainZ`, appliqué
par `three/TrainRig`). Le cycle station passe alors la main à
`systems/platformWait`, qui tient son propre chrono sans jamais toucher
`runtime.phaseT` ; `resumeDwellAt()` rend la main proprement à la remontée, sans
rejouer la mélodie ni sauter l'annonce de fermeture.

Le volume praticable vit dans `systems/walkable` : des rectangles alignés sur les
axes, plus un « portillon » par porte qui ne s'ouvre que si la porte de la rame
**et** la porte palière en face sont réellement dégagées. Train absent, tous les
seuils se ferment — on ne peut pas tomber sur la voie. Une seule voiture est
accessible, celle du joueur : c'est la seule dont l'intérieur existe.

## Les gares

Le quai fait sa vraie longueur : 224 m, onze voitures de 20 m, 44 baies de portes
palières. `data/stationLayouts.ts` est une **table explicite de trente lignes**,
une par gare, qui se lit en face du relevé : profondeur, hauteur libre, entraxe
des piliers, style d'auvent, fond de quai, palette, densité de foule, ambiance
sonore.

Trois axes y sont tenus séparés, parce que les confondre uniformise tout :

- `elevation` — le niveau où court la voie : **sol** (12 gares), **viaduc**
  (13), **tranchée** (5 : Tabata, Komagome, Sugamo, Mejiro, Meguro) ;
- `config` — ce qu'on a de l'autre côté du quai : îlot partagé avec une autre
  ligne (13, la Keihin-Tōhoku sauf à Yoyogi), îlot Yamanote pur (14), quais
  latéraux (Harajuku, seul cas de la boucle), double îlot de terminus
  (Ikebukuro, Ōsaki) ;
- `signature` — le caractère qui ne se paramètre pas, dessiné à part
  (`three/station/signatures/`).

S'y ajoutent l'état des portes de quai en 2026 (`psd`) et le drapeau `works` des
cinq gares en travaux (Shinjuku, Shibuya, Shinagawa, Tamachi, Hamamatsuchō).

**Deux gares n'ont pas de portes de quai** : à Shinjuku et à Shibuya, les grands
travaux en interdisent encore la pose. Le bord y est nu — bande podotactile
élargie de 42 à 86 cm, joue de rive visible, ballast en contrebas — et la
mécanique suit : le seuil de porte ne dépend plus que de la porte de la rame
(`systems/walkable`), la mélodie de départ entre dès que celle-ci s'écarte
(`three/Engine`), et on n'entend plus déverrouiller ni glisser ce qui n'existe
pas (`systems/doorMotion`). Les boutons d'arrêt d'urgence, faute de muret pour
les porter, passent sur des bornes en retrait de la bande podotactile.

Le bord nu n'était toutefois nu **qu'à l'écran** : la marche s'y arrêtait quand
même, 20 cm avant le vide, sur rien du tout. Les deux bords de ces deux quais
portent donc la même limite de zone que les abouts et le pied des volées
(`three/station/Barrier`) : une maille hexagonale rouge, éteinte de loin, qui
s'allume au dernier pas — à la hauteur exacte du muret qui manque, pour qu'on
regarde par-dessus. Elle reprend la trame des 44 baies et **s'ouvre au droit
d'une porte en même temps que le portillon** de `systems/walkable` ; le bord
d'en face, où aucune rame ne se présente, reste continu.

`psd: 'partial'` — Ōsaki seul désormais — ne change rien sous nos pieds : c'est
la voie *secondaire* qui n'est pas encore équipée (voies 2 et 4, travaux jusqu'à
fin 2026), et le jeu circule sur la principale, qui l'est. La différence se
verra sur le quai d'en face. Ikebukuro a reçu ses portes secondaires le
18 mars 2026 et est passé en `full`.

Ces valeurs étaient auparavant **déduites du tronçon traversé**
(`data/segments`), ce qui est une erreur de principe — un tronçon dit ce qu'on
voit *entre* deux gares, pas comment la gare est bâtie — et sortait fausse pour
sept d'entre elles. Chaque gare porte donc maintenant ses propres cotes.

Quatorze gares déclarent une `signature`, et **toutes les quatorze sont
dessinées**, une par fichier dans `three/station/signatures/` :

- **Takanawa Gateway** — la toiture pliée de Kengo Kuma, versants d'acier blanc
  doublés de bois clair qui enjambent d'un seul tenant les deux quais et les
  voies, verrière de faîte, passerelles vitrées. La plus claire des trente.
- **Akihabara** — le viaduc de la Chūō–Sōbu qui franchit le site
  perpendiculairement : poutres à âme pleine, sous-face rivetée, piles posées
  hors de tout quai et de toute voie.
- **Ueno** — la halle rivetée sur la moitié sud, et l'ouverture franche vers le
  nord : c'est le contraste qui fait la gare, pas le détail des fermes.
- **Nippori** — deux ponts-concours qui enjambent tout le faisceau.
- **Harajuku** — le bâtiment blanc et vitré de 2020, son hall du niveau
  supérieur, le quai latéral d'en face et la masse sombre du Meiji-jingū.
- **Yūrakuchō** — le vieux viaduc riveté à entraxe court, socles de brique, et
  les coques de verre de l'International Forum en contrepoint.
- **Ōtsuka** — la toiture centrale à deux pentes, et les deux extrémités du
  quai laissées à ciel ouvert : le seul auvent de la boucle qui ne court pas
  d'un bout à l'autre.
- **Ebisu** — le complexe Atre qui enjambe les voies, sa sous-face de dalle en
  guise de ciel, et la passerelle couverte qui part vers Garden Place.
- **Gotanda** — la Tōkyū Ikegami perchée au quatrième niveau : non pas un
  tablier vu d'en dessous, mais une gare entière — quai, auvent, garde-corps —
  suspendue dix mètres au-dessus.
- **Hamamatsuchō** — la verticalité, et le joint franc entre une moitié de quai
  sous couverture ancienne et l'autre sous charpente neuve.
- **Shimbashi** — la couverture générale en treillis qui court sur tout le
  faisceau, socles de brique, poteaux centenaires.
- **Tokyo**, **Shinjuku**, **Shibuya** — comme avant.

Cinq gares — Ueno, Nippori, Ōsaki, Shinagawa, Shimbashi — portent `openFarSide` : la
travée d'en face ne se ferme pas par un mur mais par un faisceau, des voies
encore jusqu'au bord du champ. C'est la perspective dégagée qu'un mur de fond
escamotait.

Les repères de quartier (`three/Landmarks`) se rangent maintenant derrière
l'emprise bâtie de la gare, et non plus à une distance fixe : le tram d'Ōtsuka
et la poutre de monorail de Hamamatsuchō, plantés à huit mètres de l'axe,
tombaient dans le ballast de la voie d'en face depuis que la gare s'y prolonge.

`systems/stationPlacement` est la source unique du mobilier, partagée par le rendu
et par la marche : un banc dessiné à un endroit et infranchissable à un autre se
verrait au premier pas. Tout ce qui se répète passe par un `InstancedMesh`.

**Il n'y a pas de mur derrière vous.** Vingt-neuf des trente gares sont des
îlots : deux bords d'embarquement, l'ossature ramenée au milieu — piliers,
bancs, distributeurs, caissons publicitaires dos à dos — et, au-delà du second
bord, une voie puis un autre quai. Laquelle voie change tout : la Keihin-Tōhoku
à Tokyo, Ueno ou Yūrakuchō, la Yamanote elle-même en sens inverse à Kanda ou
Mejiro, la deuxième paire de voies des terminus à Ikebukuro et Ōsaki. Ce que
`elevation` ferme au fond — paroi de tranchée, garde-corps de viaduc, mur — se
trouve alors quinze mètres plus loin, derrière le quai d'en face, et non plus à
portée de main. Harajuku, seul quai latéral de la boucle, garde son mur et son
soubassement carrelé.

`place.backX` désigne cette ossature dans les deux cas — mur de fond ou épine
centrale — pour que tout ce qui se pose « au fond » n'ait pas à savoir lequel
des deux il a devant lui. Le champ `backdrop`, qui nommait une famille de rendu
au lieu d'un fait, a disparu : c'était lui qui donnait à vingt-neuf quais le
même mur gris.

### Le train qui ne s'arrête pas

Cette voie d'en face restait vide en toute circonstance. Là où elle appartient
à une autre ligne, elle voit maintenant passer, **de temps en temps, à pleine
vitesse**, une rame qui ne ralentit même pas : le 快速 de la Keihin-Tōhoku, dix
caisses, deux cents mètres, une quinzaine de secondes à trois mètres du bord de
quai — l'événement le plus physique d'un quai japonais.

Onze gares peuvent en voir traverser (`data/passingTrains`), et deux régimes s'y
succèdent selon l'heure de Tokyo :

- **快速**, de 10 h 30 à 15 h 30 entre Tabata et Shinagawa, aux cinq gares que
  le rapide saute vraiment : 御徒町 (en semaine — le week-end il s'y arrête),
  鶯谷, 日暮里, 西日暮里 et 有楽町. C'est le passage fréquent, celui qu'on finit
  par attendre. Il saute aussi 新橋, mais le gabarit du jeu en fait un îlot
  Yamanote pur : aucune voie Keihin-Tōhoku n'y borde le quai.
- **回送**, une rame vide qui rejoint son dépôt ou en sort : aux onze gares,
  rare en pleine journée, nettement moins après 22 h et avant 7 h — les
  mouvements de dépôt se font avant le premier train et après le dernier.

La gare le dit comme elle le dit en vrai — signal électronique, puis
`まもなく、1番線を、電車が通過します。危ないですから、黄色い点字ブロックまで、
お下がりください。`, sa reprise anglaise, et l'avertissement court
`電車が通過します。ご注意ください。` au moment où la rame débouche. **Le numéro
de voie annoncé n'est pas le nôtre** : c'est celui d'en face, relevé gare par
gare (à Ueno la Keihin-Tōhoku 北行 est la voie 1, à Okachimachi la numérotation
est inversée et c'est la 4). Ces textes se gravent comme les autres
(`announcements-export.ts` puis `announcements-gen.py --reuse`, qui ne
synthétise que les clips absents) ; tant qu'ils manquent, c'est `speechSynthesis`
qui les dit.

Deux règles gouvernent le déclenchement (`systems/passingTrain`), et la première
compte plus que le passage lui-même : **la gare ne parle jamais par-dessus
elle-même**. Le passage n'est tiré que dans un vrai creux — sono du quai
silencieuse et assez de temps devant soi. Le créneau décide même de la langue :
tout le temps qu'il faut, japonais puis anglais ; un peu moins, le japonais
seul ; pas assez, et il ne se passe rien du tout. Deux moments s'y prêtent : le
creux entre deux rames quand on attend sur le quai (l'attente s'allonge alors un
peu, non pas à cause de l'express mais parce que c'est dans les creux plus longs
qu'on a le temps de voir passer autre chose), et le milieu de l'arrêt quand on
est resté à bord, entre les consignes de l'agent et l'annonce de fermeture.

Côté rendu (`three/exterior/PassingTrain`), la rame emprunte la coque du E235 et
change de livrée : inox à deux traits bleus au lieu du vert uguisu aux portes,
dix voitures au lieu de onze, portes closes du début à la fin — personne ne
monte dans un train qui passe. Rien n'est construit tant qu'aucun passage n'a
été annoncé : la rame naît pendant l'annonce, une trentaine de secondes avant
d'entrer en gare. Côté son, c'est la seule source du jeu qui **traverse
vraiment** l'auditeur : un `Panner3D` posé au point de la rame le plus proche de
l'oreille (deux cents mètres de caisse ne sont pas une source ponctuelle), le
grondement qui monte puis se referme d'un cran quand la cabine arrive à notre
hauteur, le souffle aigu qui n'existe qu'au passage, le martèlement des joints
et l'avertisseur à l'entrée en gare.

En qualité *basse* et *très basse*, aucun passage n'est tiré : une seconde rame
complète coûte trop cher là où le quai suffit déjà à saturer la machine.

### Paliers de qualité

Tout ce que les gares ont gagné se règle par `platformDetail()` :

| palier | ce qui tombe |
|---|---|
| **ultra, très élevé** | rien |
| **élevé** | caméras, miroirs de départ, repères de voiture peints |
| **moyen** | charpentes signature, bandeaux publicitaires de pilier, bannières |
| **bas** | trousse réglementaire, bande directionnelle, plaques de balisage, auvent et rails du quai d'en face |

Ce qui reste à tous les paliers est ce sans quoi la gare cesserait d'être
lisible : dalle, bords d'embarquement, portes palières, piliers, auvent, voie
d'en face et son ballast, bacs, gouttières, ligne de guidage.

Le module **range** ce mobilier au lieu de l'empiler. La structure fait autorité —
piliers, trémies, escaliers mécaniques, ascenseur, kiosque — puis chaque famille
vient chercher son creux, en glissant le long de la voie et en renonçant si elle
n'en trouve pas : mieux vaut un banc de moins qu'un banc dans un poteau. La trame
de piliers, elle, saute la travée d'une trémie ou d'une gaine d'ascenseur.

`three/station/PlatformKit` pose la trousse réglementaire, celle qu'on ne remarque
qu'en son absence : diffuseurs de la sonorisation sous l'auvent, caméras en dôme,
coffrets d'extincteur, boutons d'arrêt d'urgence sur la face pleine des portes
palières, armoires électriques, téléphone ferroviaire, bacs de tri par trois,
gouttière et descentes d'eau, chemin de câbles, ligne verte de guidage et repères
「N号車 乗車位置」 peints au sol. Rien de tout cela ne se pose au hasard : les
bornes d'urgence évitent les baies de portes, les diffuseurs évitent les poutres,
et rien n'atterrit dans une file d'attente.

### Les trémies d'escalier

C'est le seul endroit d'une gare où le décor doit tenir **en coupe** : la dalle
est vraiment percée, le joueur descend dedans, sa tête passe sous le niveau du
quai. Tout y vient d'une source unique (`data/stationGeometry`) — profil des
marches, ligne des nez, palier bas, longueur praticable — parce que quatre
consommateurs doivent voir exactement le même escalier : le rendu
(`three/station/Stairwell`), le percement de la dalle, la marche du joueur
(`systems/walkable`) et les voyageurs qui s'en vont (`systems/platformCrowd`).

La volée est un **bloc plein** et non un empilement de plateaux : chaque marche
descend jusqu'à une sous-face commune, ce qui ferme d'elle-même la gaine. Les
joues et le voile de tête ne s'arrêtent pas au chant du percement, ils le
**coiffent** — deux faces coplanaires sur quarante-quatre centimètres d'épaisseur
de dalle, et la trémie se borde d'un liseré clignotant. Chaque nez de marche
porte sa bande antidérapante jaune, la main courante descend avec la pente et
se termine par un retour horizontal à chaque bout, et un bandeau lumineux
encastré dans les joues éclaire ce que le jour tombant du percement n'atteint
plus. Au fond, le fléchage de sortie de la gare courante.

Le sol sur lequel on marche n'est délibérément **pas** en marches d'escalier :
c'est la ligne des nez relevée d'une demi-contremarche, qui passe par le milieu
de chaque giron. Un profil en escalier faisait tomber le marcheur de dix-sept
centimètres tous les trente-quatre — quatre chutes par seconde au pas de
promenade, pour le joueur comme pour les voyageurs.

Deux nappes horizontales passaient enfin **en travers** de la cage : le ballast
de la voie et la rue de la ville, toutes deux un mètre sous la dalle. Elles se
dérobent maintenant sur l'emprise du quai, et seulement là — les écarter sur
leurs quatre cent soixante mètres ouvrait un vide au-delà des abouts de quai
(`three/groundStrip`, `systems/stationOcclusion`).

C'est ce dégagement qui a libéré la place du **niveau inférieur**. La volée ne
s'arrête plus sur une cloison : elle passe sous un linteau, repart sous la
dalle et débouche sur un couloir de correspondance — soubassement de faïence,
caissons publicitaires rétroéclairés, ligne de guidage peinte. Rien n'y est
praticable — le joueur est arrêté cinq marches plus haut — mais c'est ce fond
de champ qui décide si la trémie descend vers une gare ou s'arrête dans un
puits de deux mètres.

**C'est la hauteur sous linteau qui commande tout le profil.** La sous-face de
la dalle est à quarante-quatre centimètres ; pour qu'un homme passe dessous, il
faut être descendu de deux mètres soixante avant d'y arriver, et il n'y a pour
cela que cinq mètres d'emprise. Quinze marches de 17,5 sur 31 y tiennent et
donnent 2,15 m — la cote d'un passage de gare. Le fléchage de sortie se pose
donc AU-DESSUS du passage, sur le linteau, et non suspendu dans la cage où il
pendait à un mètre du sol.

Le reste est calé sur ce qu'on peut réellement en voir : depuis le haut de la
volée, le rayon rasant part de la sous-face du linteau et descend d'un demi-
mètre par mètre ; à neuf mètres il a rejoint le sol. Les caissons se tiennent
donc à hauteur d'affiche et pas plus loin que sept mètres — une réglette de
plafond, elle, n'atteindrait jamais l'œil. Et les voyageurs qui s'en vont ne
s'effacent plus à une altitude donnée : ils marchent jusqu'à un mètre après le
linteau, où c'est la dalle qui les cache.

### La signalétique

Le panneau de nom de gare n'a pas changé : code JY, gare précédente et suivante,
bande verte directionnelle, redessiné au changement de gare.

**Le tableau d'affichage, lui, vit.** Il annonçait 「まもなく発車」 en permanence,
y compris en pleine voie entre deux gares où aucun train ne longe le quai. Il
suit désormais l'état réel — approche, embarquement, départ, attente avec
décompte — et alterne japonais et anglais toutes les trois secondes et demie,
avec un bandeau qui clignote quand la fermeture est imminente. Deux sources
selon l'endroit d'où on le regarde : debout sur le quai c'est `platformWait`,
à bord c'est la phase du cycle station. Le canvas n'est redessiné que lorsque
son contenu change réellement, soit environ une fois par seconde.

**Les accès sont balisés par lettre**, comme sur les plans officiels JR : A, B,
C… dans l'ordre où on les rencontre en marchant, tous types confondus —
escaliers, escaliers mécaniques, ascenseur. La lettre est posée au-dessus de
l'accès et répétée en bout de potence, pour se lire de loin.

**La grande bande verte directionnelle** est suspendue au-dessus de l'épine, en
trois tronçons calés dans les creux de la trame des bannières publicitaires :
une flèche, les gares desservies, et rien d'autre.

## Le paysage

La ville qui défile était peinte sur trois plans fixes, et c'est la **texture**
qui coulait — `offset.x = distance / metersPerRepeat`. Le compte ne tombait
juste sur aucune des trois couches : sur la plus proche, un motif couvrait 100 m
de monde mais avançait d'une répétition tous les 60 m parcourus. La ville
glissait donc à **1,67 fois la vitesse du train**, et à contresens de la
parallaxe perspective du plan lui-même. C'est ce qui se lisait immédiatement
comme un décor tiré au fil.

Elle est maintenant **bâtie dans le monde**, et c'est le train qui la dépasse.

**Le ruban** (`systems/cityField` + `three/city/CityRibbon`) découpe la voie en
cellules de 40 m et engendre, pour chacune, un tissu de bâtiments à partir de
son seul index monde. Le rendu n'en garde qu'un anneau glissant de treize
cellules par côté — 520 m, au-delà de la portée de la brume — recyclé une
cellule à la fois, soit une réécriture toutes les 1,6 s à vitesse de croisière.
Entre deux recyclages, plus rien ne bouge : le groupe entier recule d'un
`runtime.distance` et les instances gardent une abscisse fixe.

Trois rangs, et c'est le point : un bord de voie **bas** (12 à 21 m de l'axe,
deux à quatre niveaux), un rang d'îlot (22 à 38 m), un fond haut (40 à 66 m).
C'est la stratification qui produit l'occultation mutuelle, donc la profondeur ;
un plan unique, aussi bien dessiné soit-il, reste du carton. Le premier rang
reste bas à dessein — un premier rang haut est un mur, et un mur ne fait pas une
ville. Une cellule sur deux est traversée par une **rue perpendiculaire** qui
perce les trois rangs au même endroit : c'est le seul moment où le regard
s'enfonce, et le meilleur révélateur de vitesse qui soit en train.

**Le sol de la ville n'est pas celui de la voie.** `elevation` ne servait
jusqu'ici qu'à habiller — murs en tranchée, piles de pont plus hautes en
viaduc. C'est pourtant la cote qui commande tout le paysage. Depuis un siège,
par une baie, on ne voit d'un bâtiment posé à douze mètres qu'une **tranche de
quatre mètres de haut** : ni ciel, ni ligne de toit. C'est exact au niveau du
sol ; ça ne l'est pas sur les treize tronçons en viaduc, où l'on court sept
mètres au-dessus de la rue et où le regard passe *par-dessus* les toits bas.
`segEnv.cityY` fait donc descendre la ville de sept mètres sous un viaduc et la
fait remonter sur la crête des murs en tranchée ; le morph passe par les poids
fondus de tronçon, masqué par le quai à l'arrêt, exactement comme le glissement
vertical des murs. Un corridor ferroviaire, lui, la fait reculer de neuf mètres
— le faisceau de voies parallèles court jusqu'à quatorze mètres de l'axe.

Le sol descend avec elle, et il est **fendu en deux nappes** qui laissent
l'emprise de la voie libre : une nappe unique passerait au-dessus du train dès
qu'elle monte sur les murs d'une tranchée. Sous un viaduc, une joue de tablier
(`three/SegmentEnvironment`) pousse vers le bas depuis le niveau de la voie et
ferme le vide entre le ballast et la rue.

**Acrotères, édicules, chaussées.** Chaque bâtiment porte un acrotère
légèrement débordant : c'est le détail qui manque le plus dès qu'on regarde du
haut d'un viaduc, parce qu'une boîte nue ne se lit pas comme un immeuble — un
immeuble a un *bord* de toiture. Ce qui a des étages à desservir reçoit en plus
un édicule de couverture, et chaque rue perpendiculaire reçoit sa chaussée, ce
qui fait de la trouée une perspective au lieu d'un trou. Tout cela passe par un
second `InstancedMesh` et le même matériau, avec un drapeau « volume nu » : ni
fenêtres, ni vitrine, teinte de couverture sur toutes les faces.

**La trame de façade se mesure en mètres**, pas en fraction de bâtiment
(`three/city/cityMaterial`). Le nuanceur reconstitue dans le sommet les
dimensions réelles de l'instance depuis `instanceMatrix` et choisit l'UV selon
la face — le long de la voie sur les pignons, en profondeur sur les faces qui
regardent les rails, à plat sur les toitures. Un étage fait trois mètres sur une
tour de cinquante comme sur une échoppe de six, et c'est cette constance qui
donne une **taille** aux bâtiments. Sous trois mètres, un second échantillon
prend la main : la devanture, vitrine, bandeau d'enseigne et store — mais
seulement là où le quartier est commerçant, sinon la frise redevient continue.

Jour et nuit ne sont plus deux jeux de textures fondus l'un dans l'autre : la
ville est **éclairée** par le soleil et l'ambiante de `three/Scene`, elle se dore
donc à l'heure dorée. La nuit n'ajoute que l'émissif. Chaque vitrage porte dans
l'alpha de sa texture un tirage stable, et le seuil d'allumage descend avec la
nuit : les étages s'allument par paquets au fil de la soirée au lieu de basculer
tous ensemble.

**Le quartier appartient à un endroit, plus à un instant.** L'ancien fondu
suivait la progression `p` du trajet : le quartier changeait avec le temps, où
qu'on regarde, y compris derrière soi. `cityField` mesure l'inter-gare réel et
donne à chaque gare un territoire d'un demi-inter-gare de part et d'autre. On
entre dans un quartier, on le traverse, on en sort. À la frontière, les deux
tissus s'entremêlent bâtiment par bâtiment sur ±90 m — une ville ne change pas
de caractère sur une ligne.

**Le ciel et l'horizon** tiennent en une passe (`three/city/SkyDome`) : un seul
cylindre opaque, test de profondeur désactivé, dessiné avant tout le reste. Le
ciel était fait de trois cylindres transparents fondus, ce qui marchait tant que
tout le décor était transparent et n'écrivait pas la profondeur ; un ruban
opaque posé à deux cents mètres dans l'axe de la voie passerait maintenant
*derrière* un ciel posé à soixante-dix-huit. La silhouette lointaine est
composée dans le même nuanceur, dans une bande de `v`, et défile par rotation
pure — ce qui est exactement la parallaxe d'un objet infiniment loin. Le taux
est calé pour se lire à ~900 m.

### La nuit

Jour et nuit ne sont pas deux étalonnages d'une même image : ce sont deux
sources différentes. Le jour, la ville est éclairée par le haut. La nuit, elle
l'est **par le bas et par elle-même**, et c'est ce renversement qu'il fallait
modéliser.

- **Le rebond de rue.** Lampadaires, vitrines, phares : les trois ou quatre
  premiers mètres d'une façade sont, la nuit, plus clairs que ses étages —
  l'inverse exact du jour. Une décroissance exponentielle sur `vCityUp` suffit,
  et elle coûte une ligne. La portée compte autant que l'intensité : étalée sur
  six mètres, elle éclairait la façade *entière* d'un quartier bas, et
  Nishi-Nippori s'allumait comme en plein jour.
- **La température des fenêtres.** Un bureau est au néon, un logement à la
  lampe. Une ville dont toutes les fenêtres ont la même température se lit
  comme une texture ; c'est le mélange qui donne à Shinjuku sa dureté et à
  Nishi-Nippori sa douceur, à la même heure. La proportion vient des `feats`
  du quartier, et le fond, plus souvent tertiaire, est plus froid que le bâti bas.
- **Les foyers d'éclairage.** Sur JR East, ils sont portés par les mâts de
  caténaire eux-mêmes ; ils héritent donc de leur entraxe, et c'est ce
  chapelet — une lumière toutes les trente secondes de vitesse — qui dit la
  nuit mieux que n'importe quel étalonnage. Ils s'allument à la tombée du jour :
  un lampadaire allumé à quinze heures se remarque.
- **La lueur urbaine.** Au-dessus de Tokyo, le ciel de nuit n'est pas noir. Les
  millions de lampes que la ville tourne vers le haut lui font un dôme orangé
  qui s'éteint en montant, et c'est sur lui que les silhouettes se détachent —
  jamais sur du bleu nuit. Ajoutée dans le nuanceur de `SkyDome`, sous la
  composition de la silhouette. La brume de nuit se réchauffe d'autant : elle
  diffuse cette lueur, et sans elle le lointain tombait dans un aplat sombre.

### Ce qui distingue un quartier d'un autre

Les `feats` de `data/districts` — Akihabara électrique, Ueno verdoyant, Shibuya
à écrans — ne vivaient que dans la **silhouette peinte de l'horizon**, c'est-à-
dire à neuf cents mètres, dans la brume. Le long de la voie, là où on regarde,
le tissu était partout le même aux palettes près.

`tissueOf()` les traduit maintenant en réglages de génération. Chaque champ est
une **proportion** de bâtiments concernés, jamais un interrupteur : un quartier
de temples garde des immeubles, un quartier électrique garde des murs aveugles.
C'est le mélange qui fait le caractère, pas l'uniformité.

- **Les bosquets** (`parkGreen`, `torii`, un peu `templeLowtown`) ne s'ajoutent
  pas au tissu : ils le REMPLACENT. C'est ce qui fait la lisière du parc d'Ueno
  ou le bois du Meiji-jingū — non pas des arbres posés le long de la voie, mais
  du bâti qui manque. Trois sujets serrés par masse, parce qu'un arbre isolé se
  lit comme du mobilier et une masse comme un lieu.
- **Les toitures en croupe** (`templeLowtown`, `upscaleResidential`) coiffent le
  bâti bas, jamais une tour. Une croupe, géométriquement, c'est un cylindre à
  quatre pans tourné d'un huitième de tour ; le faîte reste large, comme sur une
  maison de ville japonaise, et le débord est franc.
- **Les enseignes** (`electricNeon`, `koreatownSigns`, `giantScreen`,
  `animeBillboard`) se plaquent sur la face qui regarde la voie. Une seule tuile
  pour les deux formes : ce qui distingue un écran de Shibuya d'une enseigne de
  Shin-Ōkubo, c'est leur proportion, pas leur graphisme. Elles existent le jour,
  ternes ; la nuit elles deviennent la source la plus forte du quartier.
- **Les marchés** (`shotengai`, `lowriseMarket`) rabattent le plafond de hauteur
  du premier rang et multiplient les rez-de-chaussée commerçants ; les quartiers
  de tours, à l'inverse, n'ont pas d'échoppes en pied d'immeuble.

Quatre familles, quatre `InstancedMesh` par côté : le générateur les entremêle
dans un seul tampon, le rendu les répartit. Bosquets et croupes sont écrits dans
un cube unité posé PAR LA BASE, ce qui rend leur matrice d'instance directement
lisible en mètres.

### L'emprise ferroviaire

`three/Wayside` (anciennement `three/Scenery`) tient le rang qui défile le plus
vite, donc **celui qui vend la vitesse**. Il se résumait à huit portiques
caténaires et douze arbres boules — un objet toutes les trente secondes de
regard, là où une voie réelle en présente un par seconde.

Ce qu'on en voit vraiment se calcule : l'œil est à 1,55 m dans l'allée, le bas
de vitre à 0,85 m pour une demi-largeur de caisse de 1,40 m. Le rayon rasant
descend donc d'un demi-mètre par mètre, et le sol n'apparaît qu'à **5,4 m de
l'axe**. Tout ce qui est plus bas et plus près est invisible de l'intérieur —
et une tête de signal, à cinq mètres de haut, passe au-dessus de la vitre. D'où
ce qui est modélisé, et à quelle cote :

- la **plate-forme** : ballast, traverses de 2,40 m tous les 65 cm, écartement
  de 1 435 mm, caniveaux à câbles en rive — la seule ligne continue que l'œil
  puisse suivre à quatre-vingt-dix ;
- les **rails en volume**, deux prismes métalliques : à contre-jour ce sont les
  deux seules lignes brillantes du paysage, et une texture plate ne les rend pas ;
- le **garde-corps de viaduc**, montants tous les 2,5 m, deux lisses et une
  plinthe — la plus forte affirmation qu'on court en l'air, et il pousse depuis
  le tablier au lieu de se fondre ;
- le **mobilier recyclé** : armoires relais tous les 52 m, bornes tous les 38 m,
  signaux tous les 190 m avec leur feu émissif — vert en voie libre, rouge
  pendant un arrêt d'urgence ;
- les **portiques caténaires**, qui portent enfin leurs fils : câble porteur en
  chaînette, fil de contact tendu, pendules. Toutes les portées étant
  identiques et espacées de trente mètres, une portée accrochée à chaque
  portique pave la voie sans couture, recyclage compris.

Chaque famille est fusionnée en une seule géométrie rendue par un
`InstancedMesh` : un signal, ce sont cinq volumes, et sans fusion le premier
plan coûterait plus cher que la ville entière.

**Deux surfaces mentaient encore du même 1,67×.** Le ballast et le faisceau des
corridors portaient `repeat.y = 24` sur un plan de 400 m — une tuile tous les
16,7 m — quand `offset.y` en avançait une tous les 10. Exactement le mensonge
des plans de ville, sur les deux surfaces les plus proches et les plus rapides
du champ. Les tuiles sont désormais dimensionnées en mètres et le rendu s'y cale.

### Ce que ça coûte

`node scripts/scenery-cost.mjs` relève la scène palier par palier, en pleine
voie et à quai. Les chiffres retenus — appels de rendu, triangles, programmes —
ne dépendent pas de la carte graphique : on peut donc les prendre sous
SwiftShader et en tirer un budget valable partout. Le temps par image, lui, n'y
voudrait rien dire, et n'est pas relevé.

Attention au piège : `gl.info` se remet à zéro à chaque `render()`, et le
post-traitement en appelle plusieurs par image. Lu naïvement, il ne rapporte que
la dernière passe plein écran — un appel, un triangle. La sonde coupe donc la
remise à zéro automatique et cumule sur un nombre d'images connu.

| palier | où | appels | triangles | instances |
|---|---|---|---|---|
| ultra | voie | 759 | 273 k | 1 612 |
| ultra | quai | 634 | 167 k | 2 209 |
| medium | voie | 274 | 131 k | 1 428 |
| veryLow | voie | 225 | 94 k | 785 |

Deux enseignements. D'abord, **le paysage n'est pas le poste dominant** : il pèse
une quarantaine de maillages sur sept cent vingt visibles, et une cinquantaine
de milliers de triangles sur deux cent soixante-treize mille — l'intérieur du
wagon et ses passagers font le reste. Ensuite, **le grand levier du palier est
l'ombre du soleil**, coupée à partir de `medium` : c'est elle qui fait passer de
690 à 274 appels, en supprimant une seconde passe sur tout ce qui projette.

Trois corrections sont sorties de cette première mesure — la première fois que
le paysage était mesuré plutôt que supposé :

- **Les emplacements réservés se paient.** Une instance dégénérée — mise à
  l'échelle zéro faute d'objet à poser — coûte son traitement de sommets comme
  les autres. Réserver douze emplacements de bosquet par cellule pour en remplir
  un ou deux passait **cent vingt mille triangles par image** au pilote pour
  rien. Les capacités couvrent maintenant le cas courant, pas le maximum
  théorique ; au-delà, le générateur laisse tomber, et personne ne compte les
  arbres d'un bosquet depuis un train.
- **Les arbres du bord de voie** coûtaient trente-six appels de rendu pour douze
  sujets. Ils prennent le bosquet de la ville : même dessin, une instance chacun,
  un appel.
- **Toutes les ombres ne servent pas.** `userData.noShadow` permet de refuser
  explicitement : le garde-corps projette à l'aplomb du tablier, les rails sur
  le ballast, le mobilier sur lui-même. Le portique, lui, garde la sienne — la
  barre qui balaie l'intérieur du wagon toutes les trente secondes est l'un des
  plus beaux effets de la course.

Aux deux derniers paliers, acrotères, croupes et bosquets tombent — mais pas les
enseignes : un quad par bâtiment, et c'est tout ce qui reste de reconnaissable à
Akihabara ou Shin-Ōkubo une fois la nuit tombée.

Pour regarder tout ça : `node scripts/scenery-shots.mjs /tmp/decor` se cale au
milieu d'un inter-gare, vise par une baie et capture, de jour comme de nuit. La
sonde de gare, elle, se pose à l'arrêt — là où le quai masque justement tout le
paysage.

### Ville géoréférencée (prototype PLATEAU)

Tout ce qui précède est **procédural** : un paysage crédible, jamais le vrai. Un
prototype teste l'autre voie — construire le décor à partir des données ouvertes
[Project PLATEAU](https://www.mlit.go.jp/plateau/) (modèles CityGML 3D des villes
japonaises, 国土交通省) — sur **un seul tronçon à la fois**, par défaut
Shibuya → Ebisu (`SEGMENTS[19]`). Le choix du tronçon compte : sur un viaduc, le
train court sept mètres au-dessus de la rue et le regard passe par-dessus les
toits ; dans une tranchée, le mur de soutènement masque tout, et c'est exact
mais inutile à regarder.

```bash
npm run world:build:prototype -- --dry-run   # vérifie outils et configuration
npm run world:build:prototype                # CityGML → GLB optimisés + manifeste
npm run dev                                  # puis /?plateau=1
```

**Le prototype est éteint par défaut** : il faut `?plateau=1` dans l'URL, en
développement comme en ligne. Le paramètre allume le monde géoréférencé *et*
fait embarquer directement sur le tronçon. Sans lui, rien n'est chargé et le
jeu est exactement celui d'avant. C'est délibéré : tant que le build tourne sur
l'échantillon synthétique, les bâtiments sont inventés, et les montrer d'office
ferait passer une ville fictive pour Tokyo.

Le pipeline projette en JGD2011 / CS IX, sélectionne les bâtiments dans un
corridor de ±300 m, les classe par distance à la voie, découpe en chunks de
400 m recentrés sur leur propre origine, triangule, simplifie, compresse en
meshopt et génère `public/world/plateau/manifest.json`. Dans le jeu, le wagon
reste à l'origine et c'est le monde qui tourne autour de lui : on applique au
groupe des chunks l'inverse de la transformation du train sur le tracé réel, à
la vitesse réelle de la rame. Ailleurs sur la boucle, et sans `?plateau=1`, le
décor procédural reprend tout.

Changer de tronçon est une variable d'environnement — `PLATEAU_PROTOTYPE` —
plus une constante à aligner côté jeu ; la validation du build refuse de publier
un monde que le jeu chercherait ailleurs sur la boucle.

⚠️ Le dépôt ne contient **aucune donnée PLATEAU** : le build par défaut tourne
sur un échantillon CityGML *synthétique* au format PLATEAU. Tout est expliqué —
outils, licences, limites, extension aux 30 tronçons — dans
[`docs/PLATEAU_PIPELINE.md`](docs/PLATEAU_PIPELINE.md).

## Les saisons

Le décor n'avait qu'une horloge, celle des heures. Un 21 décembre s'y déroulait
comme un 21 juin : mêmes frondaisons, même hauteur de soleil, même tombée de
nuit. La date n'est plus un détail d'état civil — elle commande le paysage.

`systems/season` dérive de `runtime.tokyoDate` **deux familles de valeurs, et il
faut les distinguer**. Les **poids de saison**, quatre nombres qui somment à 1,
fondus sur vingt-six jours de part et d'autre de quatre bornes — bornes qui ne
tombent pas sur les équinoxes : au Japon l'été s'étire jusqu'à fin septembre, et
le basculement de juin est celui de l'entrée du 梅雨. Ils servent aux réglages
continus, teinte de l'air, portée du regard. Et les **phénomènes datés** —
sakura, kōyō, ramure nue, tsuyu, canicule, froid —, des cloches indépendantes
posées sur le quantième. Ils ne se déduisent PAS des poids : la floraison des
cerisiers dure douze jours au milieu d'un printemps qui en dure quatre-vingt-sept,
et le tsuyu chevauche la frontière printemps / été au lieu de la suivre.

**La lumière du jour ne se fond pas : elle se calcule.** Deux cosinus calés sur
les extrêmes réels de Tokyo (lever 4 h 25 / coucher 19 h 00 au solstice d'été,
6 h 47 / 16 h 32 à celui d'hiver), et de phases différentes — le lever le plus
précoce tombe vers le 13 juin, le coucher le plus tardif vers le 1er juillet.
C'est cette asymétrie qui fait qu'en décembre la nuit tombe déjà à 16 h 30 sans
que le soleil se lève plus tard qu'en janvier. `daynight` ne porte plus de
bornes en dur : il les prend au lever et au coucher du jour. Deux heures et
demie d'écart sur le coucher entre les deux solstices, c'est le fait saisonnier
le plus fort de tous, et le plus facile à rater.

**La hauteur du soleil** vient ensuite : 31° à midi le 21 décembre, 78° le
21 juin. C'est la plus grande différence visible depuis une place assise — à
31° le soleil entre par la baie et va frapper le dossier d'en face ; à 78° il
tombe presque à pic et ne dépasse pas l'appui de fenêtre. La position est
ramenée à un rayon constant : seule la direction compte pour une lumière
directionnelle, mais **pas sa distance**, puisque la caméra d'ombre est posée
dessus et que son `far` vaut cent. Elle plafonne à 73° pour la même raison —
au-delà, l'ombre du portique caténaire cesse de balayer l'intérieur du wagon.

**L'air.** Un janvier de Tokyo est sec et sans particules : la lumière bleuit,
le lointain reste net à perte de vue — c'est en hiver qu'on voit le Fuji depuis
les tours. Un août est chargé de vapeur : le blanc jaunit et les tours se noient
à six cents mètres. `season.clarity` multiplie la portée de la brume,
`season.airTone` teinte soleil, brume, fond et ciel. Sur le dôme, le voile ne se
répand pas uniformément sur la voûte : il s'accumule dans les basses couches,
l'horizon vire au blanc laiteux pendant que le zénith reste bleu. Un ciel teinté
de haut en bas se lit comme un filtre de photo ; c'est le **dégradé** qui se lit
comme de l'air.

### Le feuillage n'est plus vert dans les sommets

C'était le mur contre lequel butait toute idée de saison. La couleur d'instance
**multiplie** la couleur de sommet, et un vert multiplié par un rouge d'automne
ne donne pas du rouge : il donne de la boue. Les sommets du bosquet
(`three/city/cityProps`) ne portent donc plus qu'un ombrage neutre — trois
valeurs de gris, une par sujet, pour que la masse garde son relief — et c'est la
couleur d'instance qui porte la teinte entière : verte en juillet, rousse fin
novembre, rose lavé fin mars.

Deux choses que la couleur d'instance seule ne sait toujours pas faire, et que
le nuanceur du bosquet ajoute :

- **garder le tronc brun** quand la frondaison rougit. Un attribut de sommet dit
  qui est bois et qui est feuille ;
- **dépouiller l'arbre**. Ce qui dit l'hiver de loin n'est pas la couleur, c'est
  le *volume* : une frondaison de juillet est une masse pleine, une ramure de
  janvier est un dessin. Les sommets de couronne se rétractent vers le centre de
  leur propre sujet — mettre l'instance entière à l'échelle rapetisserait
  l'arbre au lieu de le dénuder.

La teinte n'est plus tirée par le générateur de cellules, seulement le **numéro
de variante** : une cellule reste posée plusieurs secondes, et la saison peut
changer sous elle. Le rendu va chercher la couleur du jour dans la palette de
`season`. Au plus fort de la floraison, un sujet sur trois est en fleurs — pas
davantage : au-delà, la ville devient un décor de carte postale et la floraison
cesse d'être un événement.

Pour regarder tout ça : `node scripts/season-shots.mjs /tmp/saisons` se pose au
milieu d'un inter-gare d'Ueno — le seul quartier de la boucle où les bosquets
remplacent franchement le bâti —, vise le bord de voie en plongée et capture six
dates de l'année, plus les deux solstices à la même heure d'horloge. La question
posée à chaque image est toujours la même : depuis une place assise, sait-on en
quel mois on est ?

## La météo

### Ce n'est pas un tirage par image

Une météo tirée au hasard à chaque instant n'est pas de la météo : c'est du
bruit. Le temps a une **durée** — une averse tient vingt minutes, un ciel couvert
tient l'après-midi, le tsuyu tient six semaines. `systems/weather` engendre donc
la journée **entière** d'un coup, sous forme d'une suite d'épisodes datés, à
partir d'une graine tirée de la date civile. Deux conséquences, et les deux
comptent :

- le temps est le même pour tout le monde un jour donné. Le 21 juin il
  pleuvait ; on peut y revenir, et il y pleuvra encore ;
- monter à bord à 8 h ou à 18 h ne rejoue pas le même dé : on tombe à l'endroit
  qu'on occupe dans la journée, avec ce qui l'a précédé — le sol est encore
  mouillé de l'averse de midi.

### La climatologie de Tokyo, et non « la pluie en général »

Dans l'ordre d'importance :

- le **梅雨**, du 7 juin au 20 juillet : six semaines de gris et de bruine, c'est
  LE fait météorologique de l'année à Tokyo ;
- le **夕立**, l'averse d'orage de fin d'après-midi en plein été, qui tombe d'un
  ciel bleu une heure plus tôt. Le poids de l'orage est nul le matin, maximal
  entre 15 h et 19 h : c'est un phénomène de convection, il suit le
  réchauffement du sol ;
- l'**hiver sec et lumineux**, contre-intuitif pour qui imagine le Japon
  pluvieux : janvier est le mois le plus ensoleillé de l'année ;
- la **neige**, rare. Tokyo en compte quelques jours par an. Elle est donc
  décidée au niveau de la *journée*, pas de l'épisode : simulé sur cinq années,
  le modèle en donne de zéro à quatre par hiver, toujours entre la mi-janvier et
  la fin février.

Chaque poids est une propension, jamais un interrupteur : il pleut en janvier et
il fait beau pendant le tsuyu — simplement pas souvent. Le bilan d'une année
entière, tel que le modèle la tire :

| mois | pluie | couvert | dégagé | T moyenne |
|---|---|---|---|---|
| janvier | 4 % | 14 % | 60 % | 5,4 °C |
| juin | 24 % | 65 % | 16 % | 21,8 °C |
| juillet | 23 % | 64 % | 21 % | 24,9 °C |
| août | 8 % | 32 % | 39 % | 25,8 °C |
| décembre | 5 % | 16 % | 62 % | 8,5 °C |

Le badge du HUD nomme le ciel d'après **ce qu'il est**, jamais d'après l'épisode
en cours. La distinction n'est pas cosmétique : l'épisode bascule au milieu du
fondu de vingt minutes qui le relie au suivant, si bien qu'il annonçait
« dégagé » dix minutes avant que la dernière goutte soit tombée — et le badge
contredisait alors la fenêtre. Déduit de la couverture, de la pluie et de la
neige, il ne *peut* plus les contredire.

Les pourcentages comptent des *heures*, pas des jours. Les moyennes de
température tombent à quelques dixièmes des normales de Tokyo — c'est le seul
chiffre du modèle qui soit vérifiable directement, et il l'est.

La **température** est calculée, et pas décorative : moyenne du jour (cosinus
calé sur les normales de Tokyo, 5 °C début février, 27 °C début août), marche
diurne qui n'est pas un cosinus — une journée ne se refroidit pas aussi vite
qu'elle se réchauffe, minimum à 4 h, maximum à 14 h, retombée étalée sur les
quatorze heures qui restent —, puis correction du temps qu'il fait. C'est elle
qui arbitre pluie ou neige, et c'est elle qui décide si la neige **tient** : à
Tokyo, une neige de midi ne tient pas, celle de 4 h du matin, oui.

### La pluie à l'image

Faire tomber la pluie sur les six cents mètres de décor visibles coûterait des
centaines de milliers de gouttes pour une image où l'on ne distingue que les
quinze premiers mètres. Au-delà, la pluie ne se voit plus goutte à goutte : elle
se voit comme une **perte de portée**, et c'est le premier effet de la pluie bien
avant les gouttes elles-mêmes.

`three/Weather` ne modélise donc qu'une boîte de ±14 m **attachée à la caméra**,
dans laquelle la précipitation se replie sur elle-même par un modulo : la goutte
qui sort par le bas rentre par le haut. Personne ne peut le voir, puisque le
repliement a lieu à quatorze mètres, hors du cône où l'œil distingue encore un
trait de deux centimètres. Tout est calculé dans le nuanceur de sommets à partir
d'une graine par goutte et d'une dérive repliée : aucune position n'est écrite
depuis le processeur, et le champ entier tient en **un appel de rendu**.

**L'inclinaison est tout.** Une pluie verticale vue depuis un train à
quatre-vingt-dix, c'est la faute qui tue l'effet. Dans le repère du wagon, la
goutte ne tombe pas : elle file vers l'arrière à la vitesse du train, et son
trait s'incline d'autant. Le trait est donc construit dans l'espace de la
caméra, aligné sur la vitesse **relative** — chute plus vent plus vitesse du
train —, et sa longueur est la distance parcourue pendant le temps de pose de
l'œil : un mètre vingt à quatre-vingt-dix. À l'arrêt en gare elle se redresse,
et c'est en la regardant se redresser pendant le freinage qu'on sent le mieux
qu'on ralentit. Descendu sur le quai, le joueur change de repère : la gare
devient fixe, le terme de vitesse tombe, la pluie redevient verticale — rien de
spécial à écrire pour ça, il suffit de lire `runtime.playerFrame`.

Le flocon, lui, ne tombe pas droit : il flotte. C'est ce qui le distingue d'une
goutte bien plus que sa forme ou sa vitesse.

**Deux volumes soustraits**, et deux seulement, parce que ce sont les deux seuls
endroits d'où l'œil regarde en étant *sous* quelque chose : l'intérieur du wagon
— sans lui il pleut entre la banquette et le plafond, et le test de profondeur
ne peut rien puisque la goutte est devant la paroi qu'elle devrait avoir
derrière elle — et l'auvent du quai, dont `systems/stationOcclusion` tient déjà
l'emprise exacte pour le décor de voie. Les deux sont retranchés en écrasant le
quad à une aire nulle : rien à rastériser, pas de `discard`, pas de surcoût.

Une averse ne tombe pas plus vite qu'une bruine : elle tombe plus **dru**. C'est
donc le nombre d'instances affichées qui varie, pas leur vitesse ni leur
opacité — un fondu d'opacité donnerait une pluie fantôme.

Le coût : deux appels de rendu et six mille triangles au palier ultra, sous une
averse — le tiers d'un seul immeuble de la ville. Par temps sec les deux
maillages sont éteints, et le budget du décor (voir plus haut) est inchangé.

### Ce que la pluie fait au reste du décor

- **La portée du regard** tombe : `weather.visibility` multiplie le `near` et le
  `far` de la brume, par-dessus la clarté de la saison ;
- **le ciel se ferme** : la couverture nuageuse mange le bleu du dôme et éteint
  la silhouette de l'horizon bien avant que les gouttes ne se voient ;
- **les surfaces foncent.** Une chaussée mouillée est deux fois plus sombre
  qu'une chaussée sèche, et elle **renvoie** : la nuit, sous la pluie, les néons
  du quartier se lisent au sol. Le mouillé monte vite et sèche lentement, et une
  averse d'août sèche en dix minutes quand une bruine de février tient
  l'après-midi ;
- **la neige blanchit par le haut.** Elle se pose sur ce qui regarde le ciel —
  toitures, acrotères, ballast, frondaisons — et jamais sur une façade
  verticale. Le nuanceur de ville le sait déjà : il distingue les faces de
  couverture des faces de mur pour poser sa texture.

## L'extérieur de la rame

`three/exterior/` modélise la rame E235-0 complète, visible depuis le quai :
onze caisses inox à bandeau uguisu et portes vertes, bogies, climatisation de
toit, soufflets d'intercirculation, pantographes, et le nez de cabine à masque
vert, grand pare-brise, damier dégradé, girouette LED 山手線 et feux. Les cotes
(`data/e235.ts`) sont les cotes réelles ramenées au repère du jeu, et l'entraxe
de 20 m est celui sur lequel le quai est bâti : les portes tombent en face des
portes palières.

Chaque matériau ne fait qu'un `InstancedMesh` de onze instances. Le groupe entier
reste éteint tant qu'on est à bord d'une rame immobile — de l'intérieur, on ne
voit jamais sa propre caisse : coût nul en jeu normal.

## Langues

L'interface (menu, HUD, contrôles tactiles) existe en **français, anglais et
japonais**. La langue est détectée au premier lancement depuis
`navigator.languages` — `ja-*` → japonais, `fr-*` → français, tout le reste →
anglais — et le sélecteur FR / EN / 日本語 (menu principal et barre du HUD)
permet d'en changer à tout moment ; le choix explicite est mémorisé dans
`localStorage` (`yamanote.lang`) et l'emporte ensuite sur la détection.

Tous les libellés vivent dans `src/i18n/strings.ts` (un dictionnaire par
langue) ; `useT()` renvoie celui de la langue courante. Ajouter une langue =
ajouter une entrée à `STRINGS` et son code à `LANGS`.

En revanche la signalétique **embarquée** n'est pas traduite, volontairement :
annonces sonores, écrans LCD, plans de quai et affiches restent en japonais et
en anglais, comme dans une vraie rame de la Yamanote. C'est du décor, pas de
l'interface.

## Personnages (modèles 3D riggés)

Les passagers peuvent être rendus de deux façons, avec la **même** logique de
jeu (états, embarquements, regards, poignées) :

- **Modèles « librairie »** (recommandé) : des personnages low-poly riggés et
  animés (GLB) installés dans `public/models/` avec un `manifest.json`. Clips
  assis / debout / marche en crossfade, regard et bras vers la poignée
  superposés sur les os, lunettes / masques / sacs ajoutés par-dessus.
- **Procédural** (repli automatique) : si `public/models/manifest.json` est
  absent ou qu'un GLB ne charge pas, l'ancien rendu en primitives est utilisé.

Installation des modèles — les packs conseillés sont ceux de
[Quaternius](https://quaternius.com) (licence CC0, usage libre) :
« Ultimate Modular Men/Women Pack » (personnages complets animés), ou
« Universal Base Characters » combiné à l'« Universal Animation Library »
(animations séparées, rig identique). Télécharger les zips, puis :

```bash
# tout-en-un : extraction, filtrage des humanoïdes riggés, optimisation
# (compression meshopt), mesures et génération de public/models/manifest.json
npm run models:import -- ~/Téléchargements/UltimateModularMen.zip \
  ~/Téléchargements/UltimateModularWomen.zip

# packs avec animations séparées (rig identique) :
npm run models:import -- UniversalBaseCharacters.zip --anims UniversalAnimationLibrary.zip

# inspecter un pack sans l'installer (os, clips, matériaux, hauteur) :
npm run models:inspect -- pack.zip
```

Après import : vérifier/ajuster `archetypes` (salaryman, officeLady, casual,
student, senior, tourist) et `feminine` dans `public/models/manifest.json`,
contrôler le rendu avec `npm run dev`, puis committer `public/models/`.
En dev, `/rig-probe.html?file=mon-perso.glb&clip=Sit_Chair_Idle` rend un GLB
seul, clip par clip, pour diagnostiquer un modèle hors du jeu.
Les GLB sont normalisés automatiquement à l'échelle du jeu (aucune retouche
Blender nécessaire) ; les clips et les os sont détectés par correspondance
floue (conventions Quaternius / KayKit / Mixamo), avec overrides possibles
par variante dans le manifest (`clips`, `faceYaw`, `sitHipY`, `tint`).

## Ce que font les voyageurs

Une centaine d'occupations vivent dans `data/paxActions`, mais l'essentiel
n'est pas leur nombre : c'est leur **rythme**, tenu par `systems/paxBehavior`
et partagé par la rame et le quai.

- **Occupation de fond.** Un voyageur choisit ce qu'il fait des prochaines
  minutes — téléphone, sieste, vitre, livre, conversation — et y reste. Sur dix
  minutes de vie de wagon, le téléphone occupe environ un tiers du temps, la
  vitre et la sieste un huitième chacune : à peu près ce qu'on observe.
- **Gestes brefs.** De loin en loin (une dizaine de secondes chez un nerveux,
  une demi-minute chez un placide), l'occupation est interrompue par un
  bâillement, un coup d'œil à la montre, un sac remonté — puis **reprise**.
- **Tempérament.** Chaque PNJ a un caractère stable tiré de son identifiant,
  comme son apparence : bavard, nerveux, dormeur, curieux, susceptible. Sans
  lui, tout le monde ferait tout et la foule redeviendrait uniforme.
- **Budget d'événements rares.** Disputes, bagarres, chutes et séductions
  passent par un compteur global, séparé pour la rame et pour le quai : une
  dispute toutes les quelques minutes, une bagarre à peine une fois par tour de
  boucle.

Le contexte module le reste : silence de la pointe du matin, rires et
titubements du vendredi soir, bras au corps quand c'est bondé, regards vers les
portes à quai plutôt que par la vitre, éventails en août seulement.

### Tomber

Un coup de frein, une poignée lâchée, un joueur qui pousse un peu trop : il
arrive qu'on tombe. Ces chutes étaient longtemps une **rotation** — le groupe
du personnage basculait autour de son bassin, corps raide, jambes tendues dans
la pose debout, et se relevait à l'endroit. De loin ça passait ; d'un mètre, le
voyageur tombait comme une planche à repasser.

Les packs livrent pourtant de vraies animations clés à clés qui ne servaient à
rien : un corps qui perd ses jambes, s'assoit sur ses talons, part en arrière et
s'étale, avec le contrecoup des bras et le tassement final. `characters/fall.ts`
les **monte** au lieu de les jouer : chaque chute est une piste
`[temps de l'action → position dans le clip]` que le rendu applique en scrubbant
l'animation image par image. On y gagne trois choses qu'un simple `play()` ne
donne pas :

- le **rythme** propre à chaque chute — on vacille une demi-seconde, on
  s'écroule en trois dixièmes, on reste à terre deux secondes, on se relève
  lentement — là où le clip d'origine tient en une seconde ;
- le **temps au sol**, en tenant le clip sur une image ;
- le **relevé**, en repassant le clip à l'envers : un corps qui ramène ses
  jambes sous lui et se hisse, ce qu'aucun pack ne fournit. Le milieu du clip
  ainsi repris donne même l'**assise par terre** — jambes devant, buste en
  arrière sur les mains — qui fait la chute plutôt que le plongeon.

Trois montages : la **chute** complète en rame (4 s, du vacillement au
redressement penaud), le **faux pas** rattrapé sur ses jambes, la **glissade**
de quai où l'on descend à mi-hauteur avant de se reprendre. Deux couches se
superposent au clip : le **regard** (`paxMotion`), qui joue la gêne pendant
qu'on est au sol, et les **bras** (`characters/pose`), repris le temps de la
bascule — moulinet, mains vers le sol — parce que le clip d'origine est une mort
par balle, où les bras partent en arrière au lieu de chercher à se rattraper.

Les temps sont calés sur les bruitages : l'impact tombe avec le `thud`, le
relevé avec le froissement de tissu. Le cap se vrille pendant qu'on tombe, du
côté que l'action a tiré au sort, pour que deux chutes ne soient jamais la
même. Et la vieille bascule reste là, en **repli**, pour un pack qui n'aurait ni
chute ni recul dans ses clips.

En dev, `/rig-probe.html?fall=fall&t=2.4` rejoue une chute image par image avec
le vrai montage du jeu (`&rigid=1` pour revoir le repli seul).

## Parler aux voyageurs

Un voyageur regardé d'assez près (moins de 2,9 m, dans un cône de 24°) affiche
une invite ; **E** lui délie la langue. Il se tourne, parle, et la bulle
s'accroche à sa tête — pas au bas de l'écran : dans une rame où trente
personnes sont à portée, il faut voir qui parle. Un second appui coupe court,
comme on tourne les talons.

Le catalogue compte **416 échanges**, écrits dans les trois langues de
l'interface côte à côte et déclinés selon le genre du personnage là où la
langue l'impose (« je suis descendue » / « je suis descendu », 僕 / 私,
～だよ / ～わよ). Ce qui se dit dépend du contexte : l'heure de Tokyo, la gare
suivante, le remplissage, l'archétype, l'âge, les accessoires, la saison, le
jour de la semaine. Chaque contexte laisse entre cinquante et soixante
échanges éligibles ; personne ne se répète, et ce qui vient d'être entendu est
écarté du tirage suivant.

Sept situations font parler les gens **sans qu'on leur ait rien demandé** : une
bousculade, un voisin qui s'étale, le joueur qui monte ou descend, qui s'assoit
à côté, qui passe à un mètre, la rame qui entre en gare — et l'arrêt d'urgence.
Une réplique spontanée toutes les quarante à cent vingt secondes, jamais deux
de suite par la même personne : c'est ce qui prouve que les gens sont là même
quand on ne les regarde pas.

**L'arrêt d'urgence est le seul qui fasse parler plusieurs personnes.** Les six
autres s'adressent à un voisin ; un coup de frein d'urgence, lui, arrive à tout
le wagon en même temps, et un wagon qui vient de freiner en urgence ne produit
pas une remarque polie. Tout le monde sursaute d'abord — les debout qui ne
tiennent aucune poignée partent en avant, les autres cherchent des yeux ce qui
arrive, les assis lèvent le nez de leur écran — puis **deux à quatre voisins
différents disent leur peur**, l'un après l'autre, la bulle passant de l'un à
l'autre pendant une quarantaine de secondes. Ce qui se disait juste avant
s'arrête : une conversation ne survit pas à ça.

La peur se dit en deux temps, que le catalogue distingue par la vitesse de la
rame. **Au coup de frein**, on ne sait pas encore ce qui se passe : « qu'est-ce
qui se passe ?! », les mains qui tremblent, le cœur qui bat, la peur d'avoir
percuté quelque chose. **Une fois la rame immobilisée** en pleine voie, la peur
change de nature et devient celle de l'attente : le silence, le motif qu'on ne
donne pas vraiment, le réseau qui ne passe plus, et chez les plus âgés le
souvenir du grand séisme. Les deux vagues partent d'elles-mêmes, la seconde une
dizaine de secondes après l'immobilisation.

Ils ne prononcent pas de vrais mots. La voix est un **murmure de syllabes**
synthétisé (Tone.js), dont la hauteur suit le genre, la stature et l'âge : on
entend que quelqu'un parle, on lit ce qu'il dit.

Pour mesurer tout ça sans attendre dix minutes devant l'écran :

```bash
# dix minutes de vie de wagon, hors rendu, puis quelques échanges tirés
node scripts/pax-probe.mjs

# trente minutes de vie, douze échanges
node scripts/pax-probe.mjs 30 --lines 12
```

La sonde imprime la part de temps passée dans chaque occupation, le nombre
d'événements rares déclenchés, et le nombre d'échanges éligibles par contexte —
c'est là qu'on voit tout de suite si un créneau horaire est à sec. En dev, les
consoles `__pax`, `__crowd` et `__conversation` donnent l'état courant, et
`__talk()` fait parler le voyageur le plus proche sans avoir à viser.

## Références visuelles (maquettes hors dépôt)

Le jeu ne contient **aucun modèle 3D d'intérieur** : la coque, les banquettes et
tous les aménagements sont procéduraux. Une maquette peut néanmoins servir de
mètre-étalon pendant le développement, pour arbitrer une forme ou relever une
cote — sans jamais finir dans le dépôt.

⚠️ **N'utiliser qu'une maquette dont on a le droit de se servir.** Sur Sketchfab,
la licence se lit sur `https://api.sketchfab.com/v3/models/<uid>` : un
`"license": {}` vide avec `"isDownloadable": false` signifie que l'auteur n'a
rien diffusé et n'accorde aucun droit. Chercher plutôt des modèles CC0 ou CC-BY,
et créditer l'auteur dans ce fichier.

⚠️ **Se méfier de la série.** Beaucoup de maquettes « E235 » mélangent
l'extérieur E235-0 (Yamanote) et l'intérieur E235-1000 (Yokosuka / Sōbu), aux
banquettes bleues. Le vrai E235-0 a des sièges **vert uguisu** et des places
prioritaires **rouges**, avec 優先席 sur le dossier : c'est ce que rend le jeu
(`GREEN_CHECKER` / `RED_CHECKER` dans `src/textures/procedural.ts`). Une
maquette sert à lire des formes et des cotes, pas des teintes.

Les maquettes vivent dans `public/models/raw/`, ignoré par git, et un greffon de
build les retire de `dist/` (voir `vite.config.ts`) pour qu'un build local ne les
publie jamais. Pour préparer une référence et la mesurer :

```bash
# isole un wagon, redresse les axes, sort en mètres (plancher à y = 0)
npm run models:inspect -- maquette.gltf \
  --extract e235y_m_middle_1155 --out public/models/raw/e235-ref-module.glb

# cotes : histogramme des hauteurs et demi-largeurs, en mètres
npm run models:inspect -- public/models/raw/e235-ref-module.glb --measure --scale 1
```

En dev, `/car-probe.html` superpose ou juxtapose le wagon procédural et la
maquette à la même caméra, pour arbitrer élément par élément.

## Déploiement (GitHub Pages)

Le dépôt contient un workflow GitHub Actions (`.github/workflows/deploy.yml`)
qui lint, build et publie `dist/` sur GitHub Pages à chaque push sur `main`
(ou manuellement depuis l'onglet Actions via « Run workflow »).

Mise en place, une seule fois : dans le dépôt GitHub, ouvrir
Settings → Pages, puis choisir « GitHub Actions » comme source.
Le site sera servi sur `https://<utilisateur>.github.io/yamanote-3d/`
(le build utilise des chemins relatifs, il fonctionne aussi à la racine
d'un domaine ou sur tout autre hébergeur statique).

## Stack

Vite + TypeScript strict, React, React Three Fiber, drei, @react-three/postprocessing,
zustand, Tone.js, Web Speech API. Aucune autre dépendance runtime.

## Architecture

```
src/
  store.ts               zustand : état discret (phase, station, portes, réglages)
  data/                  stations réelles JY01→JY30, correspondances, annonces, config
  systems/               logique pure : machine à états du cycle station, audio Tone.js,
                         file d'annonces vocales, PNJ, slots d'assise, runtime 60 fps
  systems/season.ts      la saison, dérivée de la date : poids fondus, phénomènes
                         datés, lever et coucher réels à Tokyo
  systems/weather.ts     le temps qu'il fait : une journée d'épisodes engendrée
                         d'un coup, semée par la date
  three/                 rendu R3F : wagon, sièges, portes, poignées, pubs, écrans LCD,
                         PNJ, caméra
  three/Wayside.tsx      l'emprise ferroviaire : plate-forme, rails, garde-corps
                         de viaduc, mobilier de voie, caténaire
  three/Weather.tsx      pluie et neige : champ replié autour de l'œil, calculé
                         dans le nuanceur, incliné par la vitesse du train
  three/city/            le paysage : ruban urbain instancié, matériau de façade,
                         ciel et ligne d'horizon en une passe
  three/exterior/        rame E235-0 vue de dehors : caisses, bogies, cabines,
                         et la rame qui traverse la voie d'en face sans s'arrêter
  three/station/         quai praticable de 224 m, trente gabarits de gare, signalétique
  three/station/signatures/ les charpentes propres à une gare : Takanawa, Akihabara…
  three/characters/      PNJ « librairie » : manifest, chargement/clonage GLB,
                         overrides d'os (regard, tsurikawa), accessoires
  data/dialogue/         les 416 conversations : conditions d'emploi et texte
                         FR / EN / JA, décliné au féminin et au masculin
  scripts/               models:import / models:inspect (packs → public/models/),
                         sondes navigateur : station-probe, pax-probe,
                         scenery-shots, scenery-cost, pass-shots, season-shots,
                         weather-shots
  scripts/plateau/       pipeline CityGML PLATEAU → GLB (docs/PLATEAU_PIPELINE.md)
  three/PlateauWorld.tsx monde géoréférencé du prototype (un tronçon à la fois)
  textures/              CanvasTexture procédurales (sol, moquette, ville, pubs, visages)
  i18n/                  dictionnaires FR / EN / JA, détection de langue
  ui/                    HUD, menu principal, logo, sélecteur de langue, contrôles tactiles
```

Les valeurs continues (vitesse, distance, ouverture des portes) vivent dans
`systems/runtime.ts` et sont mutées chaque frame sans re-render React ; la boucle
60 fps est un unique `useFrame` (`three/Engine.tsx`).

## Audio

Roulement, onduleur VVVF, joints de rail, frein et carillons sont synthétisés
(Tone.js). Les mélodies de départ (発車メロディ) sont des **compositions
originales** du projet : une par quai câblé, inspirée du caractère de la
mélodie réelle (gamme, tempo, timbre) sans en reprendre les notes — les
enregistrements protégés ne sont pas embarqués. Elles sont générées par
`scripts/melodies-gen.py` dans `public/audio/melodies/` et activées via
`ENABLE_DEPARTURE_MELODY_CLIPS = true` (`src/data/melodies.ts`) ; flag à
`false` = retour à la synthèse Tone.js seule. Les deux branchements principaux
(Inner et Outer, câblés sur une vingtaine de quais chacun) existent en **deux
versions** : chaque gare garde toujours la sienne (`version` dans
`innerMainMelodyPlatforms` / `outerMainMelodyPlatforms`), mais elles alternent
le long de la boucle pour qu'on n'entende jamais deux fois la même d'affilée.
La séquence de départ respecte la
chronologie réelle, comptée depuis l'arrêt complet : portes ouvertes à 1–3 s,
mélodie **une vingtaine de secondes plus tard** (15–25 s selon la taille de la
gare et l'état de la ligne, comme le chef de train qui la lance ~25 s avant le
départ), coupée en fondu au bout d'une dizaine de secondes — elle n'arrive
jamais au bout — l'annonce de fermeture prenant le relais sur ce silence, puis
la fermeture vers 40 s et le départ vers 45–50 s.
Les annonces (sens de la boucle 内回り avec gares repères, 次は… avec numéro
JY, まもなく…, fermeture, accueil, messages de courtoisie en rotation) sont
dites en japonais puis en anglais, avec les correspondances réelles de chaque
gare. Les voix sont des clips pré-générés avec **Kokoro TTS**, stockés dans
`public/audio/announcements/` et régénérables via
`scripts/announcements-export.ts` + `scripts/announcements-gen.py` ; un texte
sans clip retombe sur `speechSynthesis`. Le japonais est synthétisé segment par
segment, avec de vraies pauses aux 、/。 — la cadence posée des annonces
automatiques JR (まもなく。…渋谷。…渋谷。), que Kokoro ne marque pas de
lui-même. Les annonces **de bord** n'écrivent plus aucune virgule (ni 、 ni
« , ») : rien que des points, donc partout la pause longue du 。 plutôt que la
respiration courte du 、 (`data/announcements`) ; le quai, lui, garde sa
ponctuation. `--reuse` ne grave que les clips absents : un texte inchangé garde
exactement le fichier qu'il avait, et une version plus récente de Kokoro ne
fait pas dériver en douce les annonces déjà en place.

**Ce que l'analyseur lit, et ce qu'il croit lire.** Kokoro ne reçoit pas du
texte mais des phonèmes, fabriqués par misaki. Or un analyseur morphologique se
trompe, et il se trompe surtout sur les noms propres : 「山手線内回り」 sortait
en *yamate sen-nai mawari* — 山手 lu やまて, 線内回り recollé en un mot —, soit
le nom de la ligne écorché dans presque chaque annonce, et 御徒町 en tête de
phrase sortait *gotochō*. Les mots concernés sont réécrits en katakana pour la
synthèse seule (`JA_READINGS` dans `announcements-export.ts`), le texte du jeu
gardant son orthographe ; les noms de GARES, eux, sont vérifiés tout seuls
contre leur transcription kana (`stations.ts`) — avec le même misaki que la
synthèse, sans quoi le contrôle valide une lecture que personne n'entendra.
Une correction de lecture ne change pas la clé du clip, qui hache le texte du
jeu : il faut supprimer les MP3 concernés pour que `--reuse` les regrave.

### La gare parle aussi

Une gare a sa propre sonorisation, et elle ne dit pas la même chose que la
rame. Le quai annonce le train qui arrive, le numéro de voie et la ligne
jaune ; la rame annonce la gare suivante et les correspondances. Sur un quai
ATOS, la séquence se déroule toujours dans le même ordre : annonce anticipée du
prochain train, carillon, まもなく、1番線に…、危ないですから、黄色い点字ブロック
までお下がりください, sa reprise anglaise, puis 電車がまいります répété pendant
que la rame entre, le nom de la gare à l'arrêt, l'agent qui presse l'échange,
la mélodie, 1番線、ドアが閉まります et les bips des portes palières. Un arrêt
d'urgence subi en cours de route met la ligne en retard : les quais s'en
excusent, motif à l'appui, pendant les quelques arrêts qui suivent
(`data/stationAnnouncements`, `systems/stationPa`).

Cet arrêt d'urgence (急停車) tombe **toutes les dix à vingt-quatre gares**, soit
de vingt-cinq minutes à une heure de trajet — le premier plus tôt, pour qu'un
trajet court puisse le vivre. Le train freine sec, reste immobilisé de 45 s à
2 min 30 avec les annonces du conducteur et les écrans rouges, puis repart ; le
chrono de phase n'avance que **au prorata de la vitesse** pendant tout
l'événement, si bien que la gare suivante arrive au bon moment après la reprise
et que le retard se lit sur l'horloge murale, pas sur le trajet
(`systems/stationCycle`). Ce que ça fait aux voyageurs est décrit plus haut.

**Quatre locutrices, toutes féminines**, parce que quatre sources parlent et
qu'on doit les distinguer sans regarder : la sono de la rame (`jf_alpha`),
l'annonce automatique du quai (`jf_gongitsune`), l'agent de quai au micro
(`jf_nezumi`, un peu plus rapide et moins lisse — c'est une personne, pas un
automate), et les deux voix anglaises (`af_heart` à bord, `af_sarah` au quai,
un cran plus lente : dehors, sous une verrière, une annonce trop rapide ne
s'attrape pas).

S'y ajoute, sur les gares dont l'îlot est partagé avec une autre ligne, la seule
annonce de quai qui parle d'une voie qui n'est pas la nôtre : まもなく、1番線を、
電車が通過します — voir *Le train qui ne s'arrête pas*.

Le numéro de voie annoncé est le vrai (`data/platforms`), y compris les voies
secondaires d'Ikebukuro et d'Ōsaki. Les clips ne sont gravés que pour le sens
réellement circulé (`DIRECTIONS` dans `scripts/announcements-export.ts`) : dans
l'autre sens, ni le numéro de voie ni la direction annoncée ne seraient les
mêmes.

### L'ambiance du lieu

Ce qu'on entend **par-dessus** la sonorisation, et qui n'est pas le même d'une
gare à l'autre : les oiseaux d'Uguisudani — 鶯谷, « la vallée du rossignol » —,
le timbre du tram à Ōtsuka, le passage feutré du monorail à Hamamatsuchō, la
rumeur d'Ameyoko sous Okachimachi, le silence d'une tranchée à Mejiro. Chaque
gare porte sa clé `ambience` (`data/stationLayouts`), et un lit de bruit filtré
lui donne sa couleur ; trois petits générateurs y posent les événements.

La **réverbération du lieu** ne se décrète pas gare par gare : elle découle de
la forme (`roomTone`). Un quai de viaduc est à ciel ouvert et n'a pour ainsi
dire pas de queue (0,18) ; une tranchée a ses deux parois à portée de voix, une
halle sous charpente renvoie long et clair (0,70). Une seule queue de
réverbération, dont on ne fait varier que le niveau d'envoi et la brillance :
recréer une réponse impulsionnelle à chaque gare coûterait un rendu asynchrone
pour un effet que l'oreille attribue surtout à la quantité.

L'ambiance entre par les mêmes ouvertures que la mélodie : pleine sur le quai,
réduite dans la rame portes fermées, muette entre deux gares.

### Le temps qu'il fait, à l'oreille

La pluie s'entend en **deux endroits qui n'ont rien à voir**, et c'est ce qui la
rend crédible depuis un train.

Sur le **pavillon**, au-dessus de la tête : un crépitement mat, sans aigus, que
la tôle et l'isolant ont mangés. Il ne passe pas par les portes — il est là même
portes fermées, et c'est le seul son du jeu dont l'ouverture des portes ne change
rien. Il appartient à la rame, donc au bus qui s'atténue quand on la regarde
depuis le quai : là, le toit sous lequel on se tient est celui de la gare.
L'averse y crépite plus haut que la bruine, la goutte étant plus grosse et
frappant plus fort.

**Dehors**, sur la ville et sur le quai : un souffle large et brillant, qui
n'entre dans le wagon que par les ouvertures, comme l'ambiance de gare et pour la
même raison. Portes fermées, il n'en reste que le grave — le vitrage coupe tout
au-dessus de deux ou trois kilohertz. Une seule source pour les deux aurait forcé
à choisir un timbre, et le timbre est précisément ce qui distingue les deux
endroits.

Le **tonnerre** est un grondement long, plus un claquement qui ne vaut que pour
les coups proches : c'est le *rapport* des deux qui donne la distance, bien plus
que le niveau. Le retard suit la même distance — trois secondes par kilomètre —,
si bien que l'éclair lointain s'allume sept secondes avant qu'on l'entende.

Le **rail mouillé** fait monter le roulement dans les aigus : c'est la pellicule
d'eau qui siffle sous la bande de roulement, et c'est souvent à ça qu'un voyageur
régulier devine qu'il pleut avant de regarder dehors.

La **neige**, elle, n'ajoute rien : elle *retire*. Une ville sous la neige est
plus silencieuse que d'ordinaire, la couche absorbant les aigus au lieu de les
renvoyer. Le lit d'ambiance du lieu perd donc sa coupure haute, et c'est tout ce
qu'il faut pour l'entendre tomber.

### Sonorisation en 3D

Le son de la sonorisation est spatialisé : il sort des haut-parleurs, pas du
centre de la tête.

- Huit diffuseurs sont modélisés au plafond du wagon (grilles perforées de part
  et d'autre du caisson central, au droit de chaque porte). Chacun est un
  `Panner3D` Web Audio à part entière, cône dirigé vers le bas ; l'auditeur
  (`Tone.Listener`) suit la caméra, donc le son tourne quand on tourne la tête
  et se rapproche quand on marche sous une grille.
- Avant diffusion, tout passe par un bus « PA » (coupe-bas 300 Hz, bosse de
  présence, coupe-haut 5 kHz, compression) : le timbre d'un haut-parleur de
  wagon, pas celui d'un synthé.
- La 発車メロディ vient des haut-parleurs du **quai**, pas de la rame : sourde
  et lointaine portes fermées, elle entre franchement par les ouvertures quand
  les portes de la rame **et** les portes palières sont dégagées, du côté qui
  s'ouvre à cette gare. Elle est faite pour être entendue des voyageurs déjà
  montés : elle porte jusque dans le wagon.
- Elle a son **propre niveau**, à part du reste de la sono du quai (les clips
  sont normalisés en crête et sonnaient bien plus fort que tout le reste de la
  gare). Ce niveau dépend du lieu d'écoute : sur le quai, à trois mètres sous
  un diffuseur, on en retire une dizaine de décibels ; dans la rame, où elle
  arrive déjà filtrée par les ouvertures, moitié moins — plus une petite bosse
  de présence vers 2 kHz qui la garde lisible par-dessus le brouhaha et la
  clim. Le rapport entre les deux la maintient du côté du quai : à l'oreille,
  elle reste plus présente dehors que dedans, elle vient toujours de la gare.

Les annonces vocales (clips Kokoro) passent par ces mêmes bus : elles sont
réellement pannées sur les diffuseurs, ceux du plafond pour la rame, ceux du
quai pour la gare. Seul le repli `speechSynthesis` (texte sans clip) sort hors
du graphe Web Audio et ne peut pas être panné ; il reste ancré aux diffuseurs
par le souffle de ligne spatialisé (la sono s'ouvre et se referme avec un
déclic autour de chaque annonce) et par un volume qui suit la distance au
diffuseur le plus proche.

**Où on est décide ce qu'on entend.** Les deux voix ont chacune leur robinet, et
il dépend du côté de la porte où se trouve la tête :

- sur le **quai**, la voix de bord est muette — les diffuseurs sont dans le
  wagon, derrière les vitres. On n'entend que la gare, et en clair ;
- dans la **rame arrêtée**, la voix du quai n'est qu'un lointain qui entre par
  les portes ouvertes : assez pour reconnaître qu'une annonce passe dehors et
  en attraper des morceaux, pas assez pour couvrir celle du wagon.

Ce partage ne vaut que pour la **parole**. Les carillons de porte, le jingle
d'arrivée, le carillon ATOS, les bips des portes palières et la mélodie de
départ sont des signaux : ils traversent, dans les deux sens. Chaque
sonorisation a sa propre file d'annonces, si bien que la gare et la rame
peuvent parler en même temps — ce qu'elles font vraiment quand on est assis
porte ouverte et que le quai annonce la fermeture une seconde après le wagon.

Optionnel : déposez d'autres enregistrements dans `public/audio/`
(`door-open.mp3`, `door-close.mp3`, `arrival.mp3`, `melody-JY01.mp3`…) ; ils seront
utilisés à la place de la synthèse, et passent par le même bus spatialisé.

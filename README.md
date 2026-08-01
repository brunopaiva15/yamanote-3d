# Yamanote 3D - 山手線

Expérience web contemplative et passive : vous êtes passager d'une rame JR East
série E235 sur la ligne Yamanote (Tokyo, boucle de 30 stations). Aucun objectif,
aucun score : on marche dans le wagon, on s'assoit, on regarde la ville défiler,
on écoute les annonces et les mélodies - et, si on s'arrête devant quelqu'un, on
l'écoute parler. La boucle tourne indéfiniment, en temps
quasi réel (environ 1 à 3 minutes par tronçon selon la gare, ~67 minutes la boucle).

## Lancer

```bash
npm install
npm run dev      # développement
npm run build    # production (tsc + vite)
npm run preview  # servir le build
npm run lint     # oxlint
npm test         # node:test
```

## Contrôles

- Regarder : un clic dans le jeu capture la souris (regard libre) ; Échap pour
  libérer. Si le verrou est refusé (iframe), cliquer-glisser reste disponible
- Marcher : ZQSD, WASD ou les flèches ; Maj pour presser le pas
- S'asseoir : un clic net vers une place libre (ou le bouton du HUD) une fois
  le regard capturé ; se lever : espace, un nouveau clic, ou le bouton du HUD
- **Descendre / remonter : marcher à travers une porte ouverte.** Aucune touche -
  la porte ouverte *est* le passage
- **Parler : E**, quand un voyageur est en face et à portée de voix - une
  invite l'annonce sous le réticule. Depuis le quai on parle aux gens du quai,
  jamais à travers la vitre à ceux qui sont assis dans la rame
- M : couper le son, F : entrer et sortir du plein écran. Les deux ne répondent
  qu'une fois à bord, et jamais quand le curseur est dans un champ du menu
- Le **⚠ en bout de barre** déroule les deux arrêts en pleine voie - coup de
  frein d'urgence, coupure de courant - et les déclenche tout de suite. Ils
  tombent d'eux-mêmes, mais rarement : jusqu'à trois heures de trajet pour la
  coupure. Grisé tant qu'on n'est pas entre deux gares, la rame lancée
- Mobile : joystick virtuel à gauche, glisser sur la scène pour regarder,
  bouton s'asseoir, bouton « Parler » quand quelqu'un est à portée

Avant de monter, le menu laisse choisir la **date**, l'heure, l'arrêt et le
**sens de circulation**. Par défaut, l'instant réel à Tokyo, une gare tirée au
hasard et un sens tiré à pile ou face. La date n'est pas un détail d'état
civil : c'est elle qui donne la saison - couleur des frondaisons, hauteur du
soleil, heure de la tombée de nuit - et le temps qu'il fera ce jour-là. Le HUD
affiche le temps qu'il fait et la température.

## Les deux sens

La Yamanote n'a pas de terminus : elle a deux sens, et c'est tout ce qui les
distingue. **内回り** (*uchi-mawari*, la boucle intérieure) suit l'ordre des
codes JY - 東京 → 神田 → 上野 → 池袋 → 新宿 → 渋谷 → 品川 → 東京 ; **外回り**
(*soto-mawari*) fait le même tour à l'envers. On les choisit au menu, et le HUD
porte le sens en pastille verte.

Le sens n'est pas un miroir posé sur le rendu : c'est une donnée
(`store.loopDirection`) que toute l'arithmétique de la boucle (`data/loop.ts`)
prend en paramètre. Ce qu'il change :

- **le tronçon parcouru.** En 内回り on arrive à la gare `i` par le tronçon
  `i−1` ; en 外回り par le tronçon `i`, à contresens de son nom. Les
  intervalles n'étant pas symétriques (`SEGMENT_HEADWAY_MIN`), la durée de
  croisière, la progression du trajet et l'environnement traversé en dépendent ;
- **les quartiers.** Le territoire d'une gare se déroule dans le sens de
  marche : en 外回り, Shibuya vient avant Harajuku et non après ;
- **le remplissage.** `data/occupancy.ts` porte DEUX relevés à 08:15, un par
  sens, et ils ne se déduisent pas l'un de l'autre : le 内回り est écrasé entre
  Shin-Ōkubo et Shinjuku (139 %) quand le 外回り l'est entre Ueno et
  Okachimachi (134 %) - c'est le sens qui va vers les bureaux qui se remplit.
  Le second dormait « en réserve » ; il est branché ;
- **ce qui est dit.** 「山手線内回り」 devient 「山手線外回り」, et les gares
  repères de la direction sont prises vers l'arrière - depuis Tamachi,
  東京・上野 en 内回り, 品川・渋谷 en 外回り. La rame et le quai tirent la
  formule de la même fonction, pour ne pas pouvoir se contredire ;
- **le numéro de voie.** `data/platforms.ts` le relève pour les deux sens : la
  sono du quai, le caisson 番線 suspendu au-dessus et la 発車メロディ le suivent
  (Kanda ver.A voie 2 en 外回り, ver.B voie 3 en 内回り) ;
- **la signalétique.** Le 駅名標 retourne sa flèche et échange ses deux gares
  encadrantes, le totem d'orientation et la bande directionnelle listent la
  suite dans le bon ordre, le 発車標 annonce les bons repères ;
- **la girouette.** Le numéro de course porte la parité réglementaire JR East :
  impair en 内回り, pair en 外回り.

Ce qu'il ne change **pas**, et ce n'est pas une simplification : le **côté
d'ouverture des portes**. Un plan de voies à deux tracks est symétrique par
rotation d'un demi-tour autour de l'axe de la ligne, et le Japon roule à
gauche - sur un îlot central les deux sens ouvrent à droite, sur deux quais
latéraux les deux ouvrent à gauche, et sur les doubles îlots 方向別 (上野,
東京, 田町…) chaque sens a le sien, du même côté. Le côté appartient à la gare.
`DOOR_SIDE` reste donc une table de trente valeurs, et 「お出口は右側です」 se
dit à l'identique dans les deux sens : les 次は… et les まもなく… des trente
gares, japonais et anglais, sont gravés une seule fois pour les deux. Ne
s'ajoutent au corpus que les textes qui NOMMENT le sens ou un numéro de voie -
quatre-vingt-trois clips, contre les quatre cent douze du total.

Seule exception documentée : le prototype PLATEAU (§ *Ville géoréférencée*) ne
couvre que le 内回り. Son tracé exporté est une polyligne orientée ; la
parcourir à l'envers demanderait d'inverser chunks et origines de distance. En
外回り, le décor procédural - lui, symétrique - reprend la main.

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
**et** la porte palière en face sont réellement dégagées. Train absent - ou rame
en mouvement - tous les seuils se ferment : on ne peut pas tomber sur la voie, ni
descendre d'un train qui roule. Une seule voiture est accessible, celle du
joueur : c'est la seule dont l'intérieur existe.

Un portillon refermé garde une exception, et c'est la seule : celui qu'on occupe
déjà reste franchissable. Une porte qui se referme sur quelqu'un ne l'emmure pas
- elle s'arrête sur lui (`systems/doorObstruction`) et il lui reste les deux
côtés. L'exception se lit sur les PIEDS (`runtime.stanceX/Z`) et non sur l'œil
(`runtime.playerX/Z`), qui balance de deux centimètres avec la caisse. Lue sur
l'œil, elle s'auto-alimentait : adossé au fond de l'alcôve pendant que la rame
entrait en gare, un pic de roulis suffisait à faire croire qu'on avait un pied
dans l'encadrement, ce qui autorisait le pas suivant, qui rendait la chose vraie
à son tour - et on traversait ainsi une porte fermée, à 90 km/h, jusqu'au quai.
Le référentiel basculait alors en pleine voie et la rame s'arrêtait net.
`tests/walkable.test.ts` tient la règle des deux côtés : la porte fermée ne
s'ouvre pas, et celle qui se referme sur vous ne vous enferme pas.

### Se poser à quai

Un train ne s'arrête pas : il se pose. La dernière seconde d'un arrêt réussi ne
se sent pas, et c'est justement ce qui est le plus difficile à obtenir. Deux
choses s'y jouent, et elles étaient toutes les deux fausses.

Le **profil de freinage** (`systems/trainPhysics`) gardait 0,35 m/s² jusqu'au
bout : la rame arrivait devant les portières encore à 0,3 m/s et l'arrêt se
lisait comme une coupure. Il applique désormais le lâcher final des conducteurs
JR - 停止直前の緩め : sous ~4 km/h le frein se relâche franchement et la vitesse
s'éteint au lieu d'être coupée. Le dernier mètre prend près de quatre secondes,
les dix derniers centimètres se parcourent à moins de 0,2 m/s, et on les voit
passer. Le freinage complet dure ~23 s au lieu de 21 ; les deux secondes sont
reprises sur le forfait d'arrêt de `data/config`, l'horaire de la boucle ne
bouge pas.

Le **glissement du quai** vu depuis le wagon, lui, n'était pas branché sur la
physique du tout : une courbe de temps calée sur la progression du trajet, qui
finissait sa course plusieurs secondes avant l'immobilisation réelle. Sur un
tronçon court (Mejiro→Takadanobaba et ses 8 s de croisière), la gare entière
arrivait d'un bloc alors que la rame était déjà presque à l'arrêt. Le quai est
maintenant posé à **la distance qui reste à parcourir** avant l'arrêt
(`stopDistance`, le profil intégré depuis l'état courant) : il défile donc
exactement à la vitesse du train, comme le reste du décor, et se cale de
lui-même - il n'y a plus de raccord à la fin, puisque la distance restante vaut
zéro pile quand la vitesse s'annule.

Reste qu'aucune rame ne se pose au millimètre sur son 定位置. La tolérance JR
East est de ±35 cm, le TASC des lignes à portes palières en garde une dizaine de
centimètres : chaque arrêt tire donc son **écart d'arrêt** de 3 à 11 cm, d'un
côté ou de l'autre (`runtime.berthOffset`). Portes ouvertes, le décalage se lit
très bien entre le montant de la baie palière et celui de la portière - et il ne
gêne rien : une baie palière fait 1,80 m pour une porte de rame de 1,32 m.
L'écart appartient à la rame, pas à la gare : il devient `platformSlide` dans le
repère du wagon, `−trainZ` dans celui du quai, et se reporte de l'un à l'autre
quand on descend ou qu'on remonte.

## Les gares

Le quai fait sa vraie longueur : 224 m, onze voitures de 20 m, 44 baies de portes
palières. `data/stationLayouts.ts` est une **table explicite de trente lignes**,
une par gare, qui se lit en face du relevé : profondeur, hauteur libre, entraxe
des piliers, style d'auvent, fond de quai, palette, densité de foule, ambiance
sonore.

Trois axes y sont tenus séparés, parce que les confondre uniformise tout :

- `elevation` - le niveau où court la voie : **sol** (12 gares), **viaduc**
  (13), **tranchée** (5 : Tabata, Komagome, Sugamo, Mejiro, Meguro) ;
- `config` - ce qu'on a de l'autre côté du quai : îlot partagé avec une autre
  ligne (16 au relevé de janvier 2026, la Keihin-Tōhoku partout sauf à Yoyogi et
  Shinjuku, où c'est la Chūō–Sōbu), îlot Yamanote pur (11), quais latéraux
  (Harajuku, seul cas de la boucle), double îlot de terminus (Ikebukuro,
  Ōsaki) ;
- `signature` - le caractère qui ne se paramètre pas, dessiné à part
  (`three/station/signatures/`).

S'y ajoutent l'état des portes de quai en 2026 (`psd`) et le drapeau `works` des
cinq gares en travaux (Shinjuku, Shibuya, Shinagawa, Tamachi, Hamamatsuchō).

**Deux gares n'ont pas de portes de quai** : à Shinjuku et à Shibuya, les grands
travaux en interdisent encore la pose. Le bord y est nu - bande podotactile
élargie de 42 à 86 cm, joue de rive visible, ballast en contrebas - et la
mécanique suit : le seuil de porte ne dépend plus que de la porte de la rame
(`systems/walkable`), la mélodie de départ entre dès que celle-ci s'écarte
(`three/Engine`), et on n'entend plus déverrouiller ni glisser ce qui n'existe
pas (`systems/doorMotion`). Les boutons d'arrêt d'urgence, faute de muret pour
les porter, passent sur des bornes en retrait de la bande podotactile.

Le bord nu n'était toutefois nu **qu'à l'écran** : la marche s'y arrêtait quand
même, 20 cm avant le vide, sur rien du tout. Les deux bords de ces deux quais
portent donc la même limite de zone que les abouts et le pied des volées
(`three/station/Barrier`) : une maille hexagonale rouge, éteinte de loin, qui
s'allume au dernier pas - à la hauteur exacte du muret qui manque, pour qu'on
regarde par-dessus. Elle reprend la trame des 44 baies et **s'ouvre au droit
d'une porte en même temps que le portillon** de `systems/walkable` ; le bord
d'en face, où aucune rame ne se présente, reste continu.

`psd: 'partial'` - Ōsaki seul désormais - ne change rien sous nos pieds : c'est
la voie *secondaire* qui n'est pas encore équipée (voies 2 et 4, travaux jusqu'à
fin 2026), et le jeu circule sur la principale, qui l'est. La différence se
verra sur le quai d'en face. Ikebukuro a reçu ses portes secondaires le
18 mars 2026 et est passé en `full`.

Ces valeurs étaient auparavant **déduites du tronçon traversé**
(`data/segments`), ce qui est une erreur de principe - un tronçon dit ce qu'on
voit *entre* deux gares, pas comment la gare est bâtie - et sortait fausse pour
sept d'entre elles. Chaque gare porte donc maintenant ses propres cotes.

Quatorze gares déclarent une `signature`, et **toutes les quatorze sont
dessinées**, une par fichier dans `three/station/signatures/` :

- **Takanawa Gateway** - la toiture pliée de Kengo Kuma, et c'est elle qui
  couvre le quai : seule gare de la boucle à déclarer `sigCanopy`, elle n'a pas
  de dalle d'auvent générique. Pans blancs cassés en accordéon tous les 4,5 m,
  fermes triangulaires de cèdre et d'acier qui enjambent d'un seul tenant les
  quatre voies et les deux quais, noue vitrée tous les neuf mètres, colonnes-
  arbres, mezzanines vitrées qui franchissent tout le site, mur-rideau de fond
  toute hauteur à meneaux blancs et traverses de cèdre. La plus claire des
  trente - sans être la plus blanche : le bois y tient la moitié de ce qu'on
  voit.
- **Akihabara** - le viaduc de la Chūō–Sōbu qui franchit le site
  perpendiculairement : poutres à âme pleine, sous-face rivetée, piles posées
  hors de tout quai et de toute voie.
- **Ueno** - la halle rivetée sur la moitié sud, et l'ouverture franche vers le
  nord : c'est le contraste qui fait la gare, pas le détail des fermes.
- **Nippori** - deux ponts-concours qui enjambent tout le faisceau.
- **Harajuku** - le bâtiment blanc et vitré de 2020, son hall du niveau
  supérieur, le quai latéral d'en face et la masse sombre du Meiji-jingū.
- **Yūrakuchō** - le vieux viaduc riveté à entraxe court, socles de brique, et
  les coques de verre de l'International Forum en contrepoint.
- **Ōtsuka** - la toiture centrale à deux pentes, et les deux extrémités du
  quai laissées à ciel ouvert : le seul auvent de la boucle qui ne court pas
  d'un bout à l'autre.
- **Ebisu** - le complexe Atre qui enjambe les voies, sa sous-face de dalle en
  guise de ciel, et la passerelle couverte qui part vers Garden Place.
- **Gotanda** - la Tōkyū Ikegami perchée au quatrième niveau : non pas un
  tablier vu d'en dessous, mais une gare entière - quai, auvent, garde-corps -
  suspendue dix mètres au-dessus.
- **Hamamatsuchō** - la verticalité, et le joint franc entre une moitié de quai
  sous couverture ancienne et l'autre sous charpente neuve.
- **Shimbashi** - la couverture générale en treillis qui court sur tout le
  faisceau, socles de brique, poteaux centenaires.
- **Tokyo**, **Shinjuku**, **Shibuya** - comme avant.

Cinq gares - Ueno, Nippori, Ōsaki, Shinagawa, Shimbashi - portent `openFarSide` : la
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
îlots : deux bords d'embarquement, l'ossature ramenée au milieu - piliers,
bancs, distributeurs, caissons publicitaires dos à dos - et, au-delà du second
bord, une voie puis un autre quai. Laquelle voie change tout : la Keihin-Tōhoku
à Tokyo, Ueno, Kanda ou Yūrakuchō, la Yamanote elle-même en sens inverse à
Mejiro ou Komagome, la deuxième paire de voies des terminus à Ikebukuro et
Ōsaki. Ce que
`elevation` ferme au fond - paroi de tranchée, garde-corps de viaduc, mur - se
trouve alors quinze mètres plus loin, derrière le quai d'en face, et non plus à
portée de main. Harajuku, seul quai latéral de la boucle, garde son mur et son
soubassement carrelé.

`place.backX` désigne cette ossature dans les deux cas - mur de fond ou épine
centrale - pour que tout ce qui se pose « au fond » n'ait pas à savoir lequel
des deux il a devant lui. Le champ `backdrop`, qui nommait une famille de rendu
au lieu d'un fait, a disparu : c'était lui qui donnait à vingt-neuf quais le
même mur gris.

### Le train qui ne s'arrête pas

Cette voie d'en face restait vide en toute circonstance. Là où elle appartient
à une autre ligne, elle voit maintenant passer, **de temps en temps, à pleine
vitesse**, une rame qui ne ralentit même pas : le 快速 de la Keihin-Tōhoku, dix
caisses, deux cents mètres, une quinzaine de secondes à trois mètres du bord de
quai - l'événement le plus physique d'un quai japonais.

Onze gares peuvent en voir traverser (`data/passingTrains`), et deux régimes s'y
succèdent selon l'heure de Tokyo :

- **快速**, de 10 h 30 à 15 h 30 entre Tabata et Shinagawa, aux cinq gares que
  le rapide saute vraiment : 御徒町 (en semaine - le week-end il s'y arrête),
  鶯谷, 日暮里, 西日暮里 et 有楽町. C'est le passage fréquent, celui qu'on finit
  par attendre. Il saute aussi 新橋, mais le gabarit du jeu en fait un îlot
  Yamanote pur : aucune voie Keihin-Tōhoku n'y borde le quai.
- **回送**, une rame vide qui rejoint son dépôt ou en sort : aux onze gares,
  rare en pleine journée, nettement moins après 22 h et avant 7 h - les
  mouvements de dépôt se font avant le premier train et après le dernier.

La gare le dit comme elle le dit en vrai - signal électronique, puis
`まもなく、1番線を、電車が通過します。危ないですから、黄色い点字ブロックまで、
お下がりください。`, sa reprise anglaise, et l'avertissement court
`電車が通過します。ご注意ください。` au moment où la rame débouche. **Le numéro
de voie annoncé n'est pas le nôtre** : c'est celui d'en face, relevé gare par
gare (à Ueno la Keihin-Tōhoku 北行 est la voie 1, à Okachimachi la numérotation
est inversée et c'est la 4). Ces textes se gravent comme les autres
(`announcements-export.ts` puis `announcements-gen.py --reuse`, qui ne
synthétise que les clips absents) ; tant qu'ils manquent, l'annonce ne se dit
pas - voir *La cinquième voix*.

Deux règles gouvernent le déclenchement (`systems/passingTrain`), et la première
compte plus que le passage lui-même : **la gare ne parle jamais par-dessus
elle-même**. Le passage n'est tiré que dans un vrai creux - sono du quai
silencieuse et assez de temps devant soi. Le créneau décide même de la langue :
tout le temps qu'il faut, japonais puis anglais ; un peu moins, le japonais
seul ; pas assez, et il ne se passe rien du tout. Deux moments s'y prêtent : le
creux entre deux rames quand on attend sur le quai (l'attente s'allonge alors un
peu, non pas à cause de l'express mais parce que c'est dans les creux plus longs
qu'on a le temps de voir passer autre chose), et le milieu de l'arrêt quand on
est resté à bord, entre les consignes de l'agent et l'annonce de fermeture.

Côté rendu (`three/exterior/PassingTrain`), la rame emprunte la coque du E235 et
change de livrée : inox à deux traits bleus au lieu du vert uguisu aux portes,
dix voitures au lieu de onze, portes closes du début à la fin - personne ne
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

### La porte qui ne se ferme pas

Il arrive qu'un arrêt ne se termine pas. Le conducteur a commandé la fermeture,
les quarante-quatre portes sont parties ensemble, les portes palières une
seconde derrière - et l'une d'elles s'arrête en chemin, parce que quelqu'un est
resté dans l'encadrement.

**Rien ne se rouvre tout seul.** C'est tout l'intérêt de la séquence, et c'est
exactement ce qu'une porte d'ascenseur ne fait pas. Sur le E235, la détection
est sensible et la force de maintien réduite avant le démarrage : la porte
touche, s'arrête, relâche sa pression de deux centimètres pour qu'on puisse se
dégager - et elle en reste là. Elle ne se verrouille pas, donc le circuit de
départ n'est pas établi, donc l'indication de départ n'apparaît pas en cabine de
tête, donc **la rame ne part pas**. C'est un verrouillage, pas un minuteur : le
chrono de l'arrêt est retenu au bord de la bascule tant que la porte n'est pas
confirmée fermée (`runtime.departureBlockers.doorBlocked`).

Ce qui débloque la situation est un **geste humain** : le conducteur arrière
utilise la commande de réouverture, le `再開閉スイッチ`. Elle ne rouvre que la ou
les portes qui ne sont pas complètement fermées - bouton maintenu, la porte
s'ouvre ; bouton relâché, elle se referme aussitôt. La durée d'appui dit ce
qu'il a vu : une impulsion d'une demi-seconde pour décoincer une sangle, une à
trois secondes quand quelqu'un est réellement en travers. Rien de tout cela ne
touche aux quarante-trois autres portes.

```
fermeture rame → ~1 s → fermeture des portes palières
   → contact, la porte s'arrête sans se verrouiller
   → 0,5 à 2 s de réaction humaine
   → 再開閉 : réouverture de la seule porte concernée
   → 「ドアから離れてください」
   → 1 à 3 s d'ouverture, puis nouvelle fermeture
   → contrôle → départ
```

Deux obstacles, et ils ne se ressemblent pas. **Une personne** entrebâille la
porte de vingt-cinq centimètres : ça se voit depuis la cabine, ça se voit sur
les moniteurs de quai, et la réaction est rapide. **Un objet fin** - une sangle
de sac, un câble d'écouteur - laisse les vantaux se rejoindre à deux
centimètres près : il n'y a rien à voir, et ce qui alerte n'est pas la vue mais
l'indication de départ qui ne vient pas. C'est le cas difficile, et il est
modélisé comme tel : détection plus lente, réouverture plus brève, plus de
tentatives.

Après trois tentatives, le conducteur renonce à la porte seule et **rouvre
tout** : un agent de quai vient dégager le passage lui-même, la gare explique
l'attente, puis la rame referme et repart. C'est la seule branche où l'incident
touche les autres portes.

Côté annonces, il n'y a pas de message automatique pour une obstruction : c'est
une phrase dite au micro, `ドアから離れてください`, par le conducteur d'abord,
puis par l'agent de quai si ça traîne - et elle se durcit,
`ドアが閉まりません。ドアから離れてください。`. À l'intérieur du wagon, le témoin
orange au-dessus de la porte concernée continue de clignoter quand tous les
autres se sont éteints : c'est comme ça qu'on repère la porte qui coince sans
rien voir d'autre. Depuis le quai, c'est un seul intervalle resté ouvert sur
quarante-quatre.

**Et si c'est vous ?** Se planter dans l'encadrement déclenche exactement la
même chose, à un détail près, mais il est de taille : plus rien n'est tiré au
sort. Ce n'est pas la chance qui décide qu'un joueur se dégage, c'est lui. La
porte s'arrête sur vous, la rame ne part pas, le conducteur rouvre votre porte
et vous demande de vous écarter - et il recommencera aussi longtemps qu'il
faudra. Après trois tentatives il rouvre tout et un agent s'en mêle, mais rien
ne se referme tant que vous êtes dedans : le train reste à quai, indéfiniment,
et c'est vous qui décidez quand il repart. Un pas de côté et la porte reprend
sa course là où elle s'était arrêtée - sans attendre la fin de la procédure si
vous êtes parti avant.

**Et quelqu'un vient.** Un haut-parleur n'a jamais fait reculer personne :
quand c'est le joueur qui tient la porte, un agent de quai se met en route dès
le contact. Il accourt depuis la trémie la plus proche - au pas pressé, une
porte bloquée retarde la ligne -, se poste **à côté** de la baie (jamais
devant : il ne bouche pas le passage qu'il vient dégager), se tourne vers celui
qui bloque et lui parle, en toutes lettres au-dessus de sa tête. Sa consigne
monte d'un cran à chaque tentative, et il ne repart qu'une fois la porte
fermée. Pour une obstruction ordinaire, il n'intervient qu'en dernier recours,
quand le conducteur a renoncé à la porte seule et rouvert tout.

Techniquement, une place du pool de foule lui est réservée depuis le début
(`CrowdPax.staff`) : le rendu « librairie » choisit le modèle 3D de chaque
voyageur **une fois pour toutes** à partir de son apparence, on ne peut donc
pas déguiser un civil en agent en cours de route. Il hérite du costume du pack,
teint bleu nuit, casquette, pas de sac.

Et on vous le dit à l'oreille aussi. L'agent s'adresse à vous **dès la première
réouverture** quand c'est vous qui bloquez, là où une obstruction ordinaire lui
laisse d'abord la parole au conducteur : à cheval sur le seuil, on est déjà
« dehors » pour le moteur audio, la sono de la rame est coupée net
(`setListenerOutside`) et le conducteur parlerait tout seul dans une voiture
qu'on vient de quitter. Depuis l'intérieur, c'est l'inverse : la voix du quai
est filtrée par ce que les portes laissent passer, et il fallait compter la
porte entrebâillée sur vous - vingt-cinq centimètres à un pas de l'oreille -
au lieu de la seule porte de référence, qui est close.

Corollaire indispensable : **un seuil occupé ne devient jamais infranchissable**.
Le volume praticable (`systems/walkable`) ferme un portillon dès que la porte
se referme, ce qui emmurait proprement quiconque se tenait dedans. Il reste
désormais ouvert pour celui qui y est déjà - on n'y ENTRE plus, mais on en
sort, des deux côtés. Sortir côté quai est d'ailleurs la façon la plus directe
de dégager le passage : le train referme et s'en va sans vous.

L'incident se tire une fois par arrêt, en même temps que la chronologie de
l'arrêt, et sa fréquence suit le remplissage du tronçon : de l'ordre d'un arrêt
sur vingt-cinq en heure creuse, un sur six en pointe (`data/doorObstruction`,
sans dépendance et couvert par `tests/doorObstruction.test.ts`). La procédure
elle-même vit dans `systems/doorObstruction` ; la mécanique du vantail - course
partielle, butée souple, porte palière asservie - dans `systems/doorMotion`, qui
tient désormais une porte à part du reste de l'ensemble. En développement,
`__blockDoor()` arme une obstruction pour la prochaine fermeture, et
`__blockDoor('object')` force le cas difficile.

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

Le module **range** ce mobilier au lieu de l'empiler. La structure fait autorité -
piliers, trémies, escaliers mécaniques, ascenseur, kiosque - puis chaque famille
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
et rien n'atterrit dans une file d'attente. Les diffuseurs, justement, ne sont pas
qu'un décor : c'est de ces grilles-là que sort l'annonce (voir « Sonorisation en
3D »), et les deux lisent la même cote.

### Les trémies d'escalier

C'est le seul endroit d'une gare où le décor doit tenir **en coupe** : la dalle
est vraiment percée, le joueur descend dedans, sa tête passe sous le niveau du
quai. Tout y vient d'une source unique (`data/stationGeometry`) - profil des
marches, ligne des nez, palier bas, longueur praticable - parce que quatre
consommateurs doivent voir exactement le même escalier : le rendu
(`three/station/Stairwell`), le percement de la dalle, la marche du joueur
(`systems/walkable`) et les voyageurs qui s'en vont (`systems/platformCrowd`).

La volée est un **bloc plein** et non un empilement de plateaux : chaque marche
descend jusqu'à une sous-face commune, ce qui ferme d'elle-même la gaine. Les
joues et le voile de tête ne s'arrêtent pas au chant du percement, ils le
**coiffent** - deux faces coplanaires sur quarante-quatre centimètres d'épaisseur
de dalle, et la trémie se borde d'un liseré clignotant. Chaque nez de marche
porte sa bande antidérapante jaune, la main courante descend avec la pente et
se termine par un retour horizontal à chaque bout, et un bandeau lumineux
encastré dans les joues éclaire ce que le jour tombant du percement n'atteint
plus. Au fond, le fléchage de sortie de la gare courante.

Le sol sur lequel on marche n'est délibérément **pas** en marches d'escalier :
c'est la ligne des nez relevée d'une demi-contremarche, qui passe par le milieu
de chaque giron. Un profil en escalier faisait tomber le marcheur de dix-sept
centimètres tous les trente-quatre - quatre chutes par seconde au pas de
promenade, pour le joueur comme pour les voyageurs.

Deux nappes horizontales passaient enfin **en travers** de la cage : le ballast
de la voie et la rue de la ville, toutes deux un mètre sous la dalle. Elles se
dérobent maintenant sur l'emprise du quai, et seulement là - les écarter sur
leurs quatre cent soixante mètres ouvrait un vide au-delà des abouts de quai
(`three/groundStrip`, `systems/stationOcclusion`).

C'est ce dégagement qui a libéré la place du **niveau inférieur**. La volée ne
s'arrête plus sur une cloison : elle passe sous un linteau, repart sous la
dalle et débouche sur un couloir de correspondance - soubassement de faïence,
caissons publicitaires rétroéclairés, ligne de guidage peinte. Rien n'y est
praticable - le joueur est arrêté cinq marches plus haut - mais c'est ce fond
de champ qui décide si la trémie descend vers une gare ou s'arrête dans un
puits de deux mètres.

**C'est la hauteur sous linteau qui commande tout le profil.** La sous-face de
la dalle est à quarante-quatre centimètres ; pour qu'un homme passe dessous, il
faut être descendu de deux mètres soixante avant d'y arriver, et il n'y a pour
cela que cinq mètres d'emprise. Quinze marches de 17,5 sur 31 y tiennent et
donnent 2,15 m - la cote d'un passage de gare. Le fléchage de sortie se pose
donc AU-DESSUS du passage, sur le linteau, et non suspendu dans la cage où il
pendait à un mètre du sol.

Le reste est calé sur ce qu'on peut réellement en voir : depuis le haut de la
volée, le rayon rasant part de la sous-face du linteau et descend d'un demi-
mètre par mètre ; à neuf mètres il a rejoint le sol. Les caissons se tiennent
donc à hauteur d'affiche et pas plus loin que sept mètres - une réglette de
plafond, elle, n'atteindrait jamais l'œil. Et les voyageurs qui s'en vont ne
s'effacent plus à une altitude donnée : ils marchent jusqu'à un mètre après le
linteau, où c'est la dalle qui les cache.

### Entrer dans la gare

Ce couloir se terminait sur un mur, et le joueur était de toute façon arrêté
cinq marches plus haut, sur rien du tout. **Une trémie par gare descend
maintenant jusqu'au bout** - première volée, palier de mi-étage, seconde volée,
couloir - et débouche sur le niveau de correspondance : zone payante, ligne de
portillons, zone libre, bouches de sortie. On y marche, on franchit un
portillon, on va lire ce qui est écrit dessus.

`data/stationInterior` pose les rectangles, `three/station/Concourse` les
dessine, `systems/walkable` les fait respecter - la même table pour les deux,
sinon une borne se contourne là où elle est dessinée et barre là où elle ne
l'est pas. Le tout est écrit dans le repère du quai, donc se retourne avec lui,
et tient DANS l'emprise de la dalle : au-delà, la nappe de rue reprend sa place
un mètre sous le quai (`three/groundStrip`) et couperait le hall à hauteur
d'épaule.

**Une seule trémie y mène**, la plus proche du milieu du quai. Les autres
gardent leur couloir borgne - c'est aussi ce que fait une vraie gare, où toutes
les volées d'un quai ne débouchent pas au même endroit, ni toutes sur un
endroit.

Ce que ça change sous les pieds : il y a désormais **deux sols à une même
abscisse**, la dalle du quai et le hall trois mètres et demi dessous. Aucune
coordonnée ne dit lequel des deux porte le marcheur ; `runtime.playerLevel` le
porte, et il ne bascule **que dans une trémie** - le seul endroit où les deux
n'en font qu'un. Sans cet état, on traversait la ligne de portillons en marchant
sur son plafond.

Le nom écrit au-dessus des portillons est un relevé, gare par gare -
電気街口 à Akihabara, ハチ公改札 à Shibuya, 早稲田口 à Takadanobaba ; les gares
dont le nom n'est pas établi portent 中央改札, qui est réel et courant. Les
sorties, elles, ne sont pas renommées : chaque bouche porte **le même panneau
jaune que les potences du quai**, tiré du même relevé (`data/lines`) - une gare
ne fléche pas 八重洲中央口 en haut des marches et autre chose en bas.

**Cinq gares ont leur hall en haut.** Les tranchées - Tabata, Komagome, Sugamo,
Mejiro, Meguro - ont leur billetterie **au-dessus** des voies, sur le bâtiment
qui enjambe : c'est ce que montre le plan de Mejiro, et c'est l'inverse d'une
gare de viaduc. Ce n'est pas la trémie avec un signe changé, c'est un autre
ouvrage : la volée ne perce pas la dalle, elle se **pose** dessus - donc pas de
joues qui coiffent un percement, pas de linteau -, sa **sous-face** est visible
et c'est même la première chose qu'on en voit du quai, elle perce en revanche
l'**auvent**, et elle monte cinq mètres en deux volées séparées d'un palier :
vingt-neuf marches d'un trait n'existent dans aucune gare.

Onze mètres de long, ce n'est pas l'emprise d'une trémie : poteaux, poutres,
néons, diffuseurs et conduites la sautent comme ils sautent une gaine
d'ascenseur, sans quoi une poutre transversale passait en travers des marches à
mi-hauteur.

**Nippori reste à part.** Ses deux ponts-concours SONT son niveau de
correspondance - dessinés par sa charpente, sous-face à 5,10 m, la cote exacte
d'un hall d'en haut. Y poser le hall générique reviendrait à bâtir deux fois la
même chose, l'une dans l'autre : elle attend son traitement propre. Le
découpage complet est dans `docs/STATION_INTERIOR.md`.

### Ce qu'il y a dans le hall

Un hall vide n'est pas un hall. Une gare japonaise est **saturée**, et c'est
cette saturation qui la fait reconnaître : `data/stationInterior` range donc le
mobilier le long des deux parois, zone par zone, et
`three/station/Fixtures` le dessine — la même liste que la marche contourne.

Ce qui est en **zone payante** ne peut pas se retrouver en zone libre, et
réciproquement : l'ajusteur de fin de course (精算機, jaune, pour qu'on le
trouve sans lire) est derrière les portillons ; les distributeurs de titres
(券売機), les consignes, le konbini, le guichet et le tampon sont devant. Un
distributeur de titres derrière les portillons ne servirait à personne.

**L'affluence commande la liste.** Une gare à 0,55 — Uguisudani — n'a ni
konbini, ni guichet, ni consigne : deux distributeurs, un banc, une poubelle de
tri, un plan. Shinjuku a tout. Et la largeur tranche en dernier : un konbini
fait 3,20 m de fond, et le moteur le refuse plutôt que d'étrangler à moins de
deux mètres le passage du milieu.

**Un meuble se reconnaît à sa silhouette, pas à sa texture.** Une batterie de
券売機 se lit à son bandeau vert continu et à ses écrans inclinés ; une consigne
à sa trame de portes carrées numérotées, avec sa borne de paiement plus haute à
un bout ; un konbini à sa devanture vitrée pleine hauteur sous une enseigne
allumée, gondoles et vitrine réfrigérée visibles au travers. C'est la règle qui
a fait refaire le **kiosque du quai** : c'était une boîte blanche de 2,50 × 4,80
avec une affiche collée sur un flanc, c'est maintenant deux comptoirs ouverts
sous un auvent, des présentoirs à journaux et magazines, une armoire réfrigérée
et un bandeau d'enseigne qui affiche ses prix.

### 駅スタンプ

Le tampon de gare est le détail que les voyageurs viennent chercher, et il ne se
paramètre pas. Sa table est le premier meuble qu'on trouve en sortant des
portillons — c'est là qu'il est en vrai, près de la fenêtre du bureau — avec son
plateau incliné, son encreur, son tampon à poignée de bois et le cahier d'essai
ouvert, deux empreintes déjà prises dessus.

**Trente empreintes, une par gare.** La composition ne change jamais — double
cercle, motif au centre, nom de la gare en haut, code JY et 記念スタンプ en bas,
à l'encre violet-rouge — et c'est justement cette constance qui fait qu'on les
collectionne. Huit motifs tournent (la halle de brique, le chien, le torii, la
tour, le tram, la lanterne, le pont-concours, le faisceau de voies) et le
cartouche fait le reste : le motif dit le quartier, le texte dit la gare.

### Les distributeurs, tous

`textures/vending` savait faire les boissons — trois enseignes froides, une
chaude, une à sachets. Deux familles s'y ajoutent, sur la même caisse creusée et
au même coût : le **bac à glaces** (アイス), bleu givré, dont les pots sont deux
fois plus larges que hauts, et la machine à **nouilles instantanées** (カップめん)
dont les pots sont tronconiques sous un couvercle d'aluminium. Deux silhouettes
qu'on distingue à dix mètres sans lire une lettre — c'est tout ce qu'on demande
à une vitrine.

### Les piliers, et la trame

Un pilier de quai était une boîte de 30 × 30 avec une bague verte. Il a
maintenant un **socle** de béton plus large que le fût - sans lui le poteau
semble posé sur la dalle comme un meuble - et des **cornières d'inox** sur ses
quatre arêtes jusqu'à 1,60 m. Ces cornières existent parce qu'on cogne les
valises dedans, et ce sont elles qui attrapent la lumière rasante d'un quai : un
fût nu reste un aplat gris quelle que soit l'heure. La descente d'eau, qui
descendait jusqu'à la dalle, s'arrête maintenant **sur** ce socle, comme toute
descente d'eau sur son ouvrage de pied.

Le hall a sa propre trame : des **pilastres engagés** dans les deux parois, à
5,20 m d'entraxe. Elle est calculée **avant** le mobilier, comme au quai — un
distributeur l'esquive, une devanture de plus de trois mètres l'enjambe et
l'absorbe (le poteau passe derrière la vitrine, comme en vrai), et la travée des
portillons en est exclue, parce qu'elle est tenue par ses propres joues.

C'est cette trame qui porte les affiches : une par pilastre sur deux. C'est là
qu'un caisson se pose dans une gare — sur la face d'un poteau, pas en plein mur.

### ecute, atré

Une galerie de gare n'est pas un konbini plus long. Elle s'ouvre par des
**baies** — trois travées vitrées séparées par des trumeaux — au lieu d'une
seule devanture, et son bandeau est long, bas, en bas-de-casse fine, avec le nom
de la gare à côté de la marque : `ecute 上野`, `atré 恵比寿`. Une galerie
appartient à sa gare.

Sept gares en déclarent une, et **la liste est prudente et incomplète à
dessein** : n'y figurent que celles dont l'enseigne est établie. Une gare absente
n'affirme pas qu'elle n'a rien — elle affirme qu'on ne l'a pas relevé, ce qui
n'est pas la même chose et se corrige ligne à ligne. Tabata, elle, la déclare et
ne l'obtient pas : 3,60 m de fond dans un hall de 5,50 m ne laisseraient plus
deux mètres de passage, et c'est la règle du passage libre qui tranche.

Le découpage complet du garnissage est dans `docs/STATION_DETAIL.md`.

### La signalétique

Le panneau de nom de gare n'a pas changé : code JY, gare précédente et suivante,
bande verte directionnelle, redessiné au changement de gare.

### Le 発車標 - le tableau des départs

Les quais de la Yamanote portent un afficheur suspendu, le **発車標**
(*hasshahyō*), qui dit dans combien de temps arrivent les prochaines rames. JR
East l'a déployé sur les trente gares de la ligne entre novembre 2019 et juillet
2020, et il annonce toujours **DEUX** trains, l'un sous l'autre, avec pour
chacun la même phrase :

```
山手線　約2分後　東京・上野方面
山手線　約5分後　東京・上野方面
```

```
YAMANOTE LINE   2 min.   TŌKYŌ & UENO
YAMANOTE LINE   5 min.   TŌKYŌ & UENO
```

Le tableau du jeu tenait sur une ligne et disait un ÉTAT (「ご乗車ください」,
「まもなく発車」). Il dit maintenant ce qu'on vient y chercher : **dans combien
de temps**. Le 約 est le mot important - ce n'est pas un compte à rebours à la
seconde mais une estimation, et c'est pour cela qu'il n'y a jamais de
「約0分後」 : sous les quarante-cinq secondes, le chiffre laisse la place à
「まもなく」, et à 「まもなく発車」 pour la rame qui s'ébranle, seul moment où
l'afficheur bat.

**Très tôt le matin et très tard le soir** (avant 5 h 15, après 23 h 45), le
décompte laisse la place à l'**heure de départ** - `05:12`. Les intervalles y
sont trop longs pour qu'un « environ » veuille encore dire quelque chose, et ce
sont les seuls moments où l'on regarde le tableau pour savoir si l'on a raté la
dernière. La règle de mise en forme est isolée dans `data/departureBoard.ts`,
qui ne connaît ni le train ni la gare : on lui donne des secondes d'attente et
l'heure qu'il est, il rend ce qu'il faut écrire (`tests/departureBoard.test.ts`).

Les secondes, elles, viennent de deux sources selon l'endroit d'où on regarde :
debout sur le quai c'est `platformWait`, qui sait où en est la rame et quel
creux a été tiré pour l'attente en cours ; à bord c'est la phase du cycle
station, où la rame qui intéresse le tableau est celle où l'on se trouve. Les
deux durées de course qui entrent dans le calcul - dégager les 320 m du quai,
freiner depuis la vitesse de ligne - sont **mesurées sur le profil E235
lui-même** et non estimées : le tableau annonce des minutes, et une minute
d'écart se voit.

**Deux équipements coexistent sur la ligne**, et le dessin change avec eux : la
matrice à LED ambre et verte, avec son inter-diode visible et son halo de
diode, qui est l'image classique du quai japonais ; et les dalles LCD des quais
neufs ou refaits - Takanawa Gateway, Shibuya, Shinagawa - au trait plus fin et
sans trame. Le canvas n'est redessiné que lorsque son contenu change réellement,
soit environ une fois par seconde.

**Il est suspendu dans la rangée du bord de voie**, celle des caissons 番線 -
en travers du quai, recto-verso, aligné sur eux par le bas à la hauteur libre
commune. Il y en a **quatre par quai**, un dans chaque intervalle de la
rangée : les deux modèles alternent donc sur toute la longueur, un panneau
tous les dix-huit mètres, et on n'attend jamais son train hors de vue d'un
tableau. C'est l'assemblage réel : sur un quai japonais, le tableau des départs
et le panneau de quai pendent côte à côte, de face pour qui marche le long du
quai. Il pendait auparavant à côté des panneaux de nom, tourné comme eux vers
la voie : il se lisait depuis le train et de nulle part ailleurs, alors que
c'est le tableau de ceux qui attendent. L'emprise de la rangée et ses creux
libres sont calculés une fois (`stationPlacement.trackSignBox` /
`departureBoardZs`) et lus par les deux : deux caissons de la même rangée ne
peuvent pas être en désaccord, et le tableau ne se glisse ni sur un 番線 ni
sous la traverse d'une potence, qui passe à six centimètres au-dessus de lui.

Enfin, la colonne de droite nomme les **repères de la boucle** (東京, 上野,
池袋, 新宿, 渋谷, 品川) et non les deux gares suivantes : un tableau de Tamachi
annonce 「東京・上野方面」 quand l'arrêt d'après est Hamamatsuchō. On ne prend
pas la Yamanote pour la gare d'à côté.

**Les accès sont balisés par lettre**, comme sur les plans officiels JR : A, B,
C… dans l'ordre où on les rencontre en marchant, tous types confondus -
escaliers, escaliers mécaniques, ascenseur. La lettre est posée au-dessus de
l'accès et répétée en bout de potence, pour se lire de loin.

**La grande bande verte directionnelle** est suspendue au-dessus de l'épine, en
trois tronçons calés dans les creux de la trame des bannières publicitaires :
une flèche, les gares desservies, et rien d'autre.

## Le paysage

La ville qui défile était peinte sur trois plans fixes, et c'est la **texture**
qui coulait - `offset.x = distance / metersPerRepeat`. Le compte ne tombait
juste sur aucune des trois couches : sur la plus proche, un motif couvrait 100 m
de monde mais avançait d'une répétition tous les 60 m parcourus. La ville
glissait donc à **1,67 fois la vitesse du train**, et à contresens de la
parallaxe perspective du plan lui-même. C'est ce qui se lisait immédiatement
comme un décor tiré au fil.

Elle est maintenant **bâtie dans le monde**, et c'est le train qui la dépasse.

**Le ruban** (`systems/cityField` + `three/city/CityRibbon`) découpe la voie en
cellules de 40 m et engendre, pour chacune, un tissu de bâtiments à partir de
son seul index monde. Le rendu n'en garde qu'un anneau glissant de treize
cellules par côté - 520 m, au-delà de la portée de la brume - recyclé une
cellule à la fois, soit une réécriture toutes les 1,6 s à vitesse de croisière.
Entre deux recyclages, plus rien ne bouge : le groupe entier recule d'un
`runtime.distance` et les instances gardent une abscisse fixe.

Trois rangs, et c'est le point : un bord de voie **bas** (12 à 21 m de l'axe,
deux à quatre niveaux), un rang d'îlot (22 à 38 m), un fond haut (40 à 66 m).
C'est la stratification qui produit l'occultation mutuelle, donc la profondeur ;
un plan unique, aussi bien dessiné soit-il, reste du carton. Le premier rang
reste bas à dessein - un premier rang haut est un mur, et un mur ne fait pas une
ville. Une cellule sur deux est traversée par une **rue perpendiculaire** qui
perce les trois rangs au même endroit : c'est le seul moment où le regard
s'enfonce, et le meilleur révélateur de vitesse qui soit en train.

**Le sol de la ville n'est pas celui de la voie.** `elevation` ne servait
jusqu'ici qu'à habiller - murs en tranchée, piles de pont plus hautes en
viaduc. C'est pourtant la cote qui commande tout le paysage. Depuis un siège,
par une baie, on ne voit d'un bâtiment posé à douze mètres qu'une **tranche de
quatre mètres de haut** : ni ciel, ni ligne de toit. C'est exact au niveau du
sol ; ça ne l'est pas sur les treize tronçons en viaduc, où l'on court sept
mètres au-dessus de la rue et où le regard passe *par-dessus* les toits bas.
`segEnv.cityY` fait donc descendre la ville de sept mètres sous un viaduc et la
fait remonter sur la crête des murs en tranchée ; le morph passe par les poids
fondus de tronçon, masqué par le quai à l'arrêt, exactement comme le glissement
vertical des murs. Un corridor ferroviaire, lui, la fait reculer de neuf mètres
- le faisceau de voies parallèles court jusqu'à quatorze mètres de l'axe.

Le sol descend avec elle, et il est **fendu en deux nappes** qui laissent
l'emprise de la voie libre : une nappe unique passerait au-dessus du train dès
qu'elle monte sur les murs d'une tranchée. Sous un viaduc, une joue de tablier
(`three/SegmentEnvironment`) pousse vers le bas depuis le niveau de la voie et
ferme le vide entre le ballast et la rue.

**Acrotères, édicules, chaussées.** Chaque bâtiment porte un acrotère
légèrement débordant : c'est le détail qui manque le plus dès qu'on regarde du
haut d'un viaduc, parce qu'une boîte nue ne se lit pas comme un immeuble - un
immeuble a un *bord* de toiture. Ce qui a des étages à desservir reçoit en plus
un édicule de couverture, et chaque rue perpendiculaire reçoit sa chaussée, ce
qui fait de la trouée une perspective au lieu d'un trou. Tout cela passe par un
second `InstancedMesh` et le même matériau, avec un drapeau « volume nu » : ni
fenêtres, ni vitrine, teinte de couverture sur toutes les faces.

**La trame de façade se mesure en mètres**, pas en fraction de bâtiment
(`three/city/cityMaterial`). Le nuanceur reconstitue dans le sommet les
dimensions réelles de l'instance depuis `instanceMatrix` et choisit l'UV selon
la face - le long de la voie sur les pignons, en profondeur sur les faces qui
regardent les rails, à plat sur les toitures. Un étage fait trois mètres sur une
tour de cinquante comme sur une échoppe de six, et c'est cette constance qui
donne une **taille** aux bâtiments. Sous trois mètres, un second échantillon
prend la main : la devanture, vitrine, bandeau d'enseigne et store - mais
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
tissus s'entremêlent bâtiment par bâtiment sur ±90 m - une ville ne change pas
de caractère sur une ligne.

**Le ciel et l'horizon** tiennent en une passe (`three/city/SkyDome`) : un seul
cylindre opaque, test de profondeur désactivé, dessiné avant tout le reste. Le
ciel était fait de trois cylindres transparents fondus, ce qui marchait tant que
tout le décor était transparent et n'écrivait pas la profondeur ; un ruban
opaque posé à deux cents mètres dans l'axe de la voie passerait maintenant
*derrière* un ciel posé à soixante-dix-huit. La silhouette lointaine est
composée dans le même nuanceur, dans une bande de `v`, et défile par rotation
pure - ce qui est exactement la parallaxe d'un objet infiniment loin. Le taux
est calé pour se lire à ~900 m.

### La nuit

Jour et nuit ne sont pas deux étalonnages d'une même image : ce sont deux
sources différentes. Le jour, la ville est éclairée par le haut. La nuit, elle
l'est **par le bas et par elle-même**, et c'est ce renversement qu'il fallait
modéliser.

- **Le rebond de rue.** Lampadaires, vitrines, phares : les trois ou quatre
  premiers mètres d'une façade sont, la nuit, plus clairs que ses étages -
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
  chapelet - une lumière toutes les trente secondes de vitesse - qui dit la
  nuit mieux que n'importe quel étalonnage. Ils s'allument à la tombée du jour :
  un lampadaire allumé à quinze heures se remarque.
- **La lueur urbaine.** Au-dessus de Tokyo, le ciel de nuit n'est pas noir. Les
  millions de lampes que la ville tourne vers le haut lui font un dôme orangé
  qui s'éteint en montant, et c'est sur lui que les silhouettes se détachent -
  jamais sur du bleu nuit. Ajoutée dans le nuanceur de `SkyDome`, sous la
  composition de la silhouette. La brume de nuit se réchauffe d'autant : elle
  diffuse cette lueur, et sans elle le lointain tombait dans un aplat sombre.

### Ce qui distingue un quartier d'un autre

Les `feats` de `data/districts` - Akihabara électrique, Ueno verdoyant, Shibuya
à écrans - ne vivaient que dans la **silhouette peinte de l'horizon**, c'est-à-
dire à neuf cents mètres, dans la brume. Le long de la voie, là où on regarde,
le tissu était partout le même aux palettes près.

`tissueOf()` les traduit maintenant en réglages de génération. Chaque champ est
une **proportion** de bâtiments concernés, jamais un interrupteur : un quartier
de temples garde des immeubles, un quartier électrique garde des murs aveugles.
C'est le mélange qui fait le caractère, pas l'uniformité.

- **Les bosquets** (`parkGreen`, `torii`, un peu `templeLowtown`) ne s'ajoutent
  pas au tissu : ils le REMPLACENT. C'est ce qui fait la lisière du parc d'Ueno
  ou le bois du Meiji-jingū - non pas des arbres posés le long de la voie, mais
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
caténaires et douze arbres boules - un objet toutes les trente secondes de
regard, là où une voie réelle en présente un par seconde.

Ce qu'on en voit vraiment se calcule : l'œil est à 1,55 m dans l'allée, le bas
de vitre à 0,85 m pour une demi-largeur de caisse de 1,40 m. Le rayon rasant
descend donc d'un demi-mètre par mètre, et le sol n'apparaît qu'à **5,4 m de
l'axe**. Tout ce qui est plus bas et plus près est invisible de l'intérieur -
et une tête de signal, à cinq mètres de haut, passe au-dessus de la vitre. D'où
ce qui est modélisé, et à quelle cote :

- la **plate-forme** : ballast, traverses de 2,40 m tous les 65 cm, écartement
  de 1 435 mm, caniveaux à câbles en rive - la seule ligne continue que l'œil
  puisse suivre à quatre-vingt-dix ;
- les **rails en volume**, deux prismes métalliques : à contre-jour ce sont les
  deux seules lignes brillantes du paysage, et une texture plate ne les rend pas ;
- le **garde-corps de viaduc**, montants tous les 2,5 m, deux lisses et une
  plinthe - la plus forte affirmation qu'on court en l'air, et il pousse depuis
  le tablier au lieu de se fondre ;
- le **mobilier recyclé** : armoires relais tous les 52 m, bornes tous les 38 m,
  signaux tous les 190 m avec leur feu émissif - vert en voie libre, rouge
  pendant un arrêt d'urgence ;
- les **portiques caténaires**, qui portent enfin leurs fils : câble porteur en
  chaînette, fil de contact tendu, pendules. Toutes les portées étant
  identiques et espacées de trente mètres, une portée accrochée à chaque
  portique pave la voie sans couture, recyclage compris.

Chaque famille est fusionnée en une seule géométrie rendue par un
`InstancedMesh` : un signal, ce sont cinq volumes, et sans fusion le premier
plan coûterait plus cher que la ville entière.

**Deux surfaces mentaient encore du même 1,67×.** Le ballast et le faisceau des
corridors portaient `repeat.y = 24` sur un plan de 400 m - une tuile tous les
16,7 m - quand `offset.y` en avançait une tous les 10. Exactement le mensonge
des plans de ville, sur les deux surfaces les plus proches et les plus rapides
du champ. Les tuiles sont désormais dimensionnées en mètres et le rendu s'y cale.

### Ce que ça coûte

`node scripts/scenery-cost.mjs` relève la scène palier par palier, en pleine
voie et à quai. Les chiffres retenus - appels de rendu, triangles, programmes -
ne dépendent pas de la carte graphique : on peut donc les prendre sous
SwiftShader et en tirer un budget valable partout. Le temps par image, lui, n'y
voudrait rien dire, et n'est pas relevé.

Attention au piège : `gl.info` se remet à zéro à chaque `render()`, et le
post-traitement en appelle plusieurs par image. Lu naïvement, il ne rapporte que
la dernière passe plein écran - un appel, un triangle. La sonde coupe donc la
remise à zéro automatique et cumule sur un nombre d'images connu.

| palier | où | appels | triangles | instances |
|---|---|---|---|---|
| ultra | voie | 759 | 273 k | 1 612 |
| ultra | quai | 634 | 167 k | 2 209 |
| medium | voie | 274 | 131 k | 1 428 |
| veryLow | voie | 225 | 94 k | 785 |

Deux enseignements. D'abord, **le paysage n'est pas le poste dominant** : il pèse
une quarantaine de maillages sur sept cent vingt visibles, et une cinquantaine
de milliers de triangles sur deux cent soixante-treize mille - l'intérieur du
wagon et ses passagers font le reste. Ensuite, **le grand levier du palier est
l'ombre du soleil**, coupée à partir de `medium` : c'est elle qui fait passer de
690 à 274 appels, en supprimant une seconde passe sur tout ce qui projette.

Trois corrections sont sorties de cette première mesure - la première fois que
le paysage était mesuré plutôt que supposé :

- **Les emplacements réservés se paient.** Une instance dégénérée - mise à
  l'échelle zéro faute d'objet à poser - coûte son traitement de sommets comme
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
  le ballast, le mobilier sur lui-même. Le portique, lui, garde la sienne - la
  barre qui balaie l'intérieur du wagon toutes les trente secondes est l'un des
  plus beaux effets de la course.

Aux deux derniers paliers, acrotères, croupes et bosquets tombent - mais pas les
enseignes : un quad par bâtiment, et c'est tout ce qui reste de reconnaissable à
Akihabara ou Shin-Ōkubo une fois la nuit tombée.

Pour regarder tout ça : `node scripts/scenery-shots.mjs /tmp/decor` se cale au
milieu d'un inter-gare, vise par une baie et capture, de jour comme de nuit. La
sonde de gare, elle, se pose à l'arrêt - là où le quai masque justement tout le
paysage.

### Ville géoréférencée (prototype PLATEAU)

Tout ce qui précède est **procédural** : un paysage crédible, jamais le vrai. Un
prototype teste l'autre voie - construire le décor à partir des données ouvertes
[Project PLATEAU](https://www.mlit.go.jp/plateau/) (modèles CityGML 3D des villes
japonaises, 国土交通省) - sur **un seul tronçon à la fois**, par défaut
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

Changer de tronçon est une variable d'environnement - `PLATEAU_PROTOTYPE` -
plus une constante à aligner côté jeu ; la validation du build refuse de publier
un monde que le jeu chercherait ailleurs sur la boucle.

⚠️ Le dépôt ne contient **aucune donnée PLATEAU** : le build par défaut tourne
sur un échantillon CityGML *synthétique* au format PLATEAU. Tout est expliqué -
outils, licences, limites, extension aux 30 tronçons - dans
[`docs/PLATEAU_PIPELINE.md`](docs/PLATEAU_PIPELINE.md).

## Les saisons

Le décor n'avait qu'une horloge, celle des heures. Un 21 décembre s'y déroulait
comme un 21 juin : mêmes frondaisons, même hauteur de soleil, même tombée de
nuit. La date n'est plus un détail d'état civil - elle commande le paysage.

`systems/season` dérive de `runtime.tokyoDate` **deux familles de valeurs, et il
faut les distinguer**. Les **poids de saison**, quatre nombres qui somment à 1,
fondus sur vingt-six jours de part et d'autre de quatre bornes - bornes qui ne
tombent pas sur les équinoxes : au Japon l'été s'étire jusqu'à fin septembre, et
le basculement de juin est celui de l'entrée du 梅雨. Ils servent aux réglages
continus, teinte de l'air, portée du regard. Et les **phénomènes datés** -
sakura, kōyō, ramure nue, tsuyu, canicule, froid -, des cloches indépendantes
posées sur le quantième. Ils ne se déduisent PAS des poids : la floraison des
cerisiers dure douze jours au milieu d'un printemps qui en dure quatre-vingt-sept,
et le tsuyu chevauche la frontière printemps / été au lieu de la suivre.

**La lumière du jour ne se fond pas : elle se calcule.** Deux cosinus calés sur
les extrêmes réels de Tokyo (lever 4 h 25 / coucher 19 h 00 au solstice d'été,
6 h 47 / 16 h 32 à celui d'hiver), et de phases différentes - le lever le plus
précoce tombe vers le 13 juin, le coucher le plus tardif vers le 1er juillet.
C'est cette asymétrie qui fait qu'en décembre la nuit tombe déjà à 16 h 30 sans
que le soleil se lève plus tard qu'en janvier. `daynight` ne porte plus de
bornes en dur : il les prend au lever et au coucher du jour. Deux heures et
demie d'écart sur le coucher entre les deux solstices, c'est le fait saisonnier
le plus fort de tous, et le plus facile à rater.

**La hauteur du soleil** vient ensuite : 31° à midi le 21 décembre, 78° le
21 juin. C'est la plus grande différence visible depuis une place assise - à
31° le soleil entre par la baie et va frapper le dossier d'en face ; à 78° il
tombe presque à pic et ne dépasse pas l'appui de fenêtre. La position est
ramenée à un rayon constant : seule la direction compte pour une lumière
directionnelle, mais **pas sa distance**, puisque la caméra d'ombre est posée
dessus et que son `far` vaut cent. Elle plafonne à 73° pour la même raison -
au-delà, l'ombre du portique caténaire cesse de balayer l'intérieur du wagon.

**L'air.** Un janvier de Tokyo est sec et sans particules : la lumière bleuit,
le lointain reste net à perte de vue - c'est en hiver qu'on voit le Fuji depuis
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
(`three/city/cityProps`) ne portent donc plus qu'un ombrage neutre - trois
valeurs de gris, une par sujet, pour que la masse garde son relief - et c'est la
couleur d'instance qui porte la teinte entière : verte en juillet, rousse fin
novembre, rose lavé fin mars.

Deux choses que la couleur d'instance seule ne sait toujours pas faire, et que
le nuanceur du bosquet ajoute :

- **garder le tronc brun** quand la frondaison rougit. Un attribut de sommet dit
  qui est bois et qui est feuille ;
- **dépouiller l'arbre**. Ce qui dit l'hiver de loin n'est pas la couleur, c'est
  le *volume* : une frondaison de juillet est une masse pleine, une ramure de
  janvier est un dessin. Les sommets de couronne se rétractent vers le centre de
  leur propre sujet - mettre l'instance entière à l'échelle rapetisserait
  l'arbre au lieu de le dénuder.

La teinte n'est plus tirée par le générateur de cellules, seulement le **numéro
de variante** : une cellule reste posée plusieurs secondes, et la saison peut
changer sous elle. Le rendu va chercher la couleur du jour dans la palette de
`season`. Au plus fort de la floraison, un sujet sur trois est en fleurs - pas
davantage : au-delà, la ville devient un décor de carte postale et la floraison
cesse d'être un événement.

Pour regarder tout ça : `node scripts/season-shots.mjs /tmp/saisons` se pose au
milieu d'un inter-gare d'Ueno - le seul quartier de la boucle où les bosquets
remplacent franchement le bâti -, vise le bord de voie en plongée et capture six
dates de l'année, plus les deux solstices à la même heure d'horloge. La question
posée à chaque image est toujours la même : depuis une place assise, sait-on en
quel mois on est ?

## La météo

### Ce n'est pas un tirage par image

Une météo tirée au hasard à chaque instant n'est pas de la météo : c'est du
bruit. Le temps a une **durée** - une averse tient vingt minutes, un ciel couvert
tient l'après-midi, le tsuyu tient six semaines. `systems/weather` engendre donc
la journée **entière** d'un coup, sous forme d'une suite d'épisodes datés, à
partir d'une graine tirée de la date civile. Deux conséquences, et les deux
comptent :

- le temps est le même pour tout le monde un jour donné. Le 21 juin il
  pleuvait ; on peut y revenir, et il y pleuvra encore ;
- monter à bord à 8 h ou à 18 h ne rejoue pas le même dé : on tombe à l'endroit
  qu'on occupe dans la journée, avec ce qui l'a précédé - le sol est encore
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
il fait beau pendant le tsuyu - simplement pas souvent. Le bilan d'une année
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
« dégagé » dix minutes avant que la dernière goutte soit tombée - et le badge
contredisait alors la fenêtre. Déduit de la couverture, de la pluie et de la
neige, il ne *peut* plus les contredire.

Les pourcentages comptent des *heures*, pas des jours. Les moyennes de
température tombent à quelques dixièmes des normales de Tokyo - c'est le seul
chiffre du modèle qui soit vérifiable directement, et il l'est.

La **température** est calculée, et pas décorative : moyenne du jour (cosinus
calé sur les normales de Tokyo, 5 °C début février, 27 °C début août), marche
diurne qui n'est pas un cosinus - une journée ne se refroidit pas aussi vite
qu'elle se réchauffe, minimum à 4 h, maximum à 14 h, retombée étalée sur les
quatorze heures qui restent -, puis correction du temps qu'il fait. C'est elle
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
caméra, aligné sur la vitesse **relative** - chute plus vent plus vitesse du
train -, et sa longueur est la distance parcourue pendant le temps de pose de
l'œil : un mètre vingt à quatre-vingt-dix. À l'arrêt en gare elle se redresse,
et c'est en la regardant se redresser pendant le freinage qu'on sent le mieux
qu'on ralentit. Descendu sur le quai, le joueur change de repère : la gare
devient fixe, le terme de vitesse tombe, la pluie redevient verticale - rien de
spécial à écrire pour ça, il suffit de lire `runtime.playerFrame`.

Le flocon, lui, ne tombe pas droit : il flotte. C'est ce qui le distingue d'une
goutte bien plus que sa forme ou sa vitesse.

**Deux volumes soustraits**, et deux seulement, parce que ce sont les deux seuls
endroits d'où l'œil regarde en étant *sous* quelque chose : l'intérieur du wagon
- sans lui il pleut entre la banquette et le plafond, et le test de profondeur
ne peut rien puisque la goutte est devant la paroi qu'elle devrait avoir
derrière elle - et l'auvent du quai, dont `systems/stationOcclusion` tient déjà
l'emprise exacte pour le décor de voie. Les deux sont retranchés en écrasant le
quad à une aire nulle : rien à rastériser, pas de `discard`, pas de surcoût.

Une averse ne tombe pas plus vite qu'une bruine : elle tombe plus **dru**. C'est
donc le nombre d'instances affichées qui varie, pas leur vitesse ni leur
opacité - un fondu d'opacité donnerait une pluie fantôme.

Le coût : deux appels de rendu et six mille triangles au palier ultra, sous une
averse - le tiers d'un seul immeuble de la ville. Par temps sec les deux
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
- **la neige blanchit par le haut.** Elle se pose sur ce qui regarde le ciel -
  toitures, acrotères, ballast, frondaisons - et jamais sur une façade
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
reste éteint tant qu'on est à bord d'une rame immobile - de l'intérieur, on ne
voit jamais sa propre caisse : coût nul en jeu normal.

## Langues

L'interface (menu, HUD, contrôles tactiles) existe en **français, anglais et
japonais**. La langue se décide en trois temps, du plus explicite au plus
deviné : le paramètre d'URL `?lang=fr|en|ja` s'il est présent, sinon le choix
mémorisé dans `localStorage` (`yamanote.lang`), sinon la détection depuis
`navigator.languages` - `ja-*` → japonais, `fr-*` → français, tout le reste →
anglais. Le sélecteur FR / EN / 日本語 (menu principal et barre du HUD) permet
d'en changer à tout moment ; un choix explicite est mémorisé **et** inscrit dans
l'URL, qui devient partageable telle quelle (voir *Référencement*).

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

Installation des modèles - les packs conseillés sont ceux de
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

### Voyager avec son chien

Sur un quai, on croise **parfois** quelqu'un qui traverse la gare avec son
chien - mais jamais en laisse. Les règles de JR East ne laissent aucune
latitude, et ce sont elles qui dictent tout ce qui suit :

- l'animal doit être **entièrement enfermé** dans une caisse, sans sortir la
  tête ;
- **longueur + largeur + hauteur ≤ 120 cm** ;
- **poids total, animal compris, ≤ 10 kg** - donc un petit chien, jamais un
  husky ;
- un billet **« bagage à main » à 290 ¥**, pris au guichet, la caisse présentée
  à l'agent avant les portiques.

Un chien tenu en laisse, porté dans les bras, glissé dans une écharpe ou
promené en poussette est explicitement **interdit** à l'intérieur des
portiques. Une première version de cette page décrivait une promenade en
laisse le long du quai : c'était joli et c'était faux. Corollaire agréable de
la règle vraie - un chien en caisse, lui, **monte dans le train** : son porteur
est un voyageur comme un autre.

Ces règles ont leur affiche, qu'on croise de temps en temps : une sur neuf des
caissons portrait des quais, et l'une des quatre affiches d'about du wagon.
Pictogrammes dessinés au trait dans `textures/procedural` - le cas autorisé
cerclé de rouge, les trois cas barrés en dessous, les cotes en pied de page.
Le dessin est **original**, comme les mélodies de départ : c'est la règle qu'on
reprend, pas le visuel de la compagnie.

Le pack animalier vit à part, dans `public/models/animals/`, avec son propre
manifeste et sa propre licence. Une race est installée (shiba inu - Quaternius,
CC0) ; pour en importer d'autres :

```bash
# Quaternius - « Ultimate Animated Animals » (CC0)
npm run animals:import -- ~/Téléchargements/AnimatedAnimals.zip

# toutes les espèces, pas seulement celles qu'on promène en laisse :
npm run animals:import -- pack.zip --all
```

Sans ce dossier, le quai n'a simplement pas de chiens : rien d'autre ne change.

Trois choses distinguent un quadrupède d'un passager, et elles sont dans
`characters/animals.ts` :

- **la taille est réelle, et par espèce.** Un personnage est toujours ramené à
  `SKELETON_TOP` ; un chien, non - un shiba fait 46 cm, un husky 62. La hauteur
  est donc une donnée du manifeste (`height`, en mètres), et le manifeste garde
  la taille **vraie** de la race : c'est le rendu qui ramène l'animal au
  gabarit de la caisse, puisque la limite des 10 kg exclut de toute façon tout
  ce qui n'y tiendrait pas.
- **le reniflage est le clip de repas.** Aucun pack ne livre de « Sniff » ;
  leur « Eating » est exactement ça - museau au sol, corps planté.
- **la vitesse d'auteur des cycles est mesurée**, jamais déclarée. Le
  déplacement de la racine quand il y en a un ; sinon la **foulée** - un pied
  posé ne glisse pas, son va-et-vient sur un cycle mesure exactement la
  distance dont le sol défile. Les packs animaliers animent tous sur place,
  c'est donc la foulée qui sert, et elle est courte : le « Walk » d'un shiba
  vaut 0,24 m/s, son « Gallop » 0,59. Ces mesures ne servent plus au chien en
  caisse, qui ne marche pas ; elles restent justes pour tout pack importé.

La caisse elle-même (`characters/carrier.ts`) est modelée aux cotes que la
règle impose - 50 × 34 × 34 cm, soit 118 cm de somme - avec coque à deux tons,
fentes d'aération, poignée et une porte à barreaux **réellement ajourée** :
sans vrais trous, il n'y aurait rien à voir derrière. Elle pend à l'os de main
de son porteur, donc elle suit le balancement du bras, mais elle reste
d'aplomb : un bagage porté ne prend pas l'orientation du poignet. Et son
porteur prend son téléphone de l'autre main, par le mécanisme qui sert déjà à
la poignée en rame.

En dev, `__pets` donne l'état de chaque caisse en console (porteur, main),
`node scripts/make-test-dog.mjs` fabrique un chien de test riggé pour éprouver
la chaîne sans le vrai pack (à ne pas committer), et
`node scripts/pet-shots.mjs /tmp/chiens` va chercher un porteur sur le quai et
le photographie - la rencontre est trop rare pour se juger en jouant.

## Ce que font les voyageurs

Une centaine d'occupations vivent dans `data/paxActions`, mais l'essentiel
n'est pas leur nombre : c'est leur **rythme**, tenu par `systems/paxBehavior`
et partagé par la rame et le quai.

- **Occupation de fond.** Un voyageur choisit ce qu'il fait des prochaines
  minutes - téléphone, sieste, vitre, livre, conversation - et y reste. Sur dix
  minutes de vie de wagon, le téléphone occupe environ un tiers du temps, la
  vitre et la sieste un huitième chacune : à peu près ce qu'on observe.
- **Gestes brefs.** De loin en loin (une dizaine de secondes chez un nerveux,
  une demi-minute chez un placide), l'occupation est interrompue par un
  bâillement, un coup d'œil à la montre, un sac remonté - puis **reprise**.
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
arrive qu'on tombe. Ces chutes étaient longtemps une **rotation** - le groupe
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

- le **rythme** propre à chaque chute - on vacille une demi-seconde, on
  s'écroule en trois dixièmes, on reste à terre deux secondes, on se relève
  lentement - là où le clip d'origine tient en une seconde ;
- le **temps au sol**, en tenant le clip sur une image ;
- le **relevé**, en repassant le clip à l'envers : un corps qui ramène ses
  jambes sous lui et se hisse, ce qu'aucun pack ne fournit. Le milieu du clip
  ainsi repris donne même l'**assise par terre** - jambes devant, buste en
  arrière sur les mains - qui fait la chute plutôt que le plongeon.

Trois montages : la **chute** complète en rame (4 s, du vacillement au
redressement penaud), le **faux pas** rattrapé sur ses jambes, la **glissade**
de quai où l'on descend à mi-hauteur avant de se reprendre. Deux couches se
superposent au clip : le **regard** (`paxMotion`), qui joue la gêne pendant
qu'on est au sol, et les **bras** (`characters/pose`), repris le temps de la
bascule - moulinet, mains vers le sol - parce que le clip d'origine est une mort
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
s'accroche à sa tête - pas au bas de l'écran : dans une rame où trente
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

Neuf situations font parler les gens **sans qu'on leur ait rien demandé** : une
bousculade, un voisin qui s'étale, le joueur qui monte ou descend, qui s'assoit
à côté, qui passe à un mètre, la rame qui entre en gare - et les trois moments
d'un arrêt subi : le coup de frein d'urgence, la coupure de courant, le retour
du courant. Une réplique spontanée toutes les quarante à cent vingt secondes,
jamais deux de suite par la même personne : c'est ce qui prouve que les gens
sont là même quand on ne les regarde pas.

**Les arrêts subis sont les seuls à faire parler plusieurs personnes.** Les six
autres situations s'adressent à un voisin ; un coup de frein d'urgence, lui,
arrive à tout le wagon en même temps, et un wagon qui vient de freiner en
urgence ne produit pas une remarque polie. Tout le monde sursaute d'abord - les debout qui ne
tiennent aucune poignée partent en avant, les autres cherchent des yeux ce qui
arrive, les assis lèvent le nez de leur écran - puis **deux à quatre voisins
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

**La coupure de courant se dit autrement**, et c'est là que le catalogue gagne
son intérêt. Rien n'a secoué : personne ne sursaute, personne ne se raccroche.
Ce qui se remarque est ce qui MANQUE - la lumière qui baisse, le moteur qu'on
n'entend plus, les écrans devenus noirs, la clim qui s'arrête -, si bien que la
première réplique n'est jamais « qu'est-ce qui se passe ?! » mais un constat, à
voix basse. Puis vient l'attente, et avec elle des remarques qu'un coup de frein
ne produit jamais : le wagon qui va chauffer sans ventilation en août ou se
refroidir en janvier, la consigne de ne pas toucher au robinet de secours, la
rame de Yokosuka qui, elle, aurait pu rejoindre la gare à la batterie. Le retour
du courant a ses propres répliques, brèves - c'est du soulagement, ça ne
s'étire pas.

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
d'événements rares déclenchés, et le nombre d'échanges éligibles par contexte -
c'est là qu'on voit tout de suite si un créneau horaire est à sec. En dev, les
consoles `__pax`, `__crowd` et `__conversation` donnent l'état courant, et
`__talk()` fait parler le voyageur le plus proche sans avoir à viser.

## Références visuelles (maquettes hors dépôt)

Le jeu ne contient **aucun modèle 3D d'intérieur** : la coque, les banquettes et
tous les aménagements sont procéduraux. Une maquette peut néanmoins servir de
mètre-étalon pendant le développement, pour arbitrer une forme ou relever une
cote - sans jamais finir dans le dépôt.

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

### Compteur « voyageurs en ligne » (facultatif)

Le HUD peut afficher le nombre de personnes actuellement connectées au site,
mis à jour en temps réel. Le site étant purement statique, un fichier ne peut
pas compter qui est là : le décompte passe par le canal *Realtime Presence* de
[Supabase](https://supabase.com), contacté directement depuis le navigateur.
Aucun backend à écrire, aucune table ni SQL - seulement le canal de présence.

La fonctionnalité est **désactivée par défaut** : sans configuration, le badge
reste masqué, le jeu tourne à l'identique et la bibliothèque Supabase (chargée
en import dynamique) n'est jamais téléchargée par le visiteur.

Pour l'activer :

1. Créer un projet gratuit sur Supabase, puis relever, dans
   Project Settings → API, l'« URL » du projet et la clé **anon public**
   (publique par nature : elle finit dans le code livré, c'est prévu - ne
   jamais utiliser la clé `service_role`).
2. **En local** : copier `.env.example` en `.env` et y coller les deux valeurs
   (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Le fichier `.env` est ignoré
   par git.
3. **En production** : les définir dans le dépôt GitHub via
   Settings → Secrets and variables → Actions. Le workflow accepte les deux
   onglets - **Variables** (recommandé, la clé anon est publique) ou
   **Secrets** - et les injecte au moment du build.

## Référencement

Le problème est celui de toutes les applications d'une seule page : ce que le
serveur envoie, c'est `index.html` et un `<div id="root">`. Un robot qui
n'exécute pas de JavaScript n'y trouve rien à lire ; un robot qui en exécute
trouve un `<canvas>`. Un jeu WebGL n'a pas de contenu textuel *à indexer* - sauf
si on le lui écrit.

**Le document sans JavaScript dit déjà ce que la page est.** `index.html` porte
un vrai contenu dans `#root` : un `<h1>`, l'accroche, ce qu'on fait à bord, et
les trente gares en romaji et en kanji - le vocabulaire par lequel on cherche ce
genre de page. React le remplace intégralement au premier rendu
(`createRoot(…).render()` vide son conteneur), donc rien n'est caché à personne :
c'est le même propos que l'écran d'accueil, servi avant lui. Effet de bord
heureux : le visiteur n'attend plus les 730 kio du module devant un écran noir,
il lit quelque chose tout de suite, et le plus grand élément de la page est
peint avant que le premier octet de Three.js n'arrive.

**Une fois React monté, le document se nomme encore.** Le logo est un dessin, et
un dessin n'est pas un titre : `src/ui/Logo.tsx` est donc explicitement décoratif
(`aria-hidden`) et l'écran d'accueil porte un `<h1>` en texte, retiré de l'écran
par `.visually-hidden` puisque le logo le dit déjà en plus grand. Sans cela le
titre extrait de la page serait « YAMANOTE YAMANOTE 3D 山手線 山手線 » : chaque
mot du logo existe en deux `<text>` superposés, l'ombre puis les lettres cernées.

**Trois langues, une seule page.** `?lang=fr|en|ja` force la langue, et c'est ce
qui rend les `<link rel="alternate" hreflang>` de `index.html` honnêtes : un
moteur qui suit l'alternate japonais doit recevoir la page en japonais. L'URL nue
reste le `x-default`, celle qui s'adapte au visiteur - la détection automatique
n'écrit donc *pas* `?lang=` dans l'URL, seul un choix au sélecteur le fait.
`src/i18n/documentMeta.ts` réécrit alors `lang`, le titre, la description, les
balises Open Graph et Twitter, la canonique et `og:url` ; il ne crée aucune
balise, il ne fait que remplir celles que `index.html` porte déjà en anglais.

**Les URL absolues ne peuvent pas être relatives.** Canonique, alternates,
`og:url`, images sociales : un moteur les recopie telles quelles dans son index,
un aperçu de partage les résout depuis un autre domaine. Elles désignent
l'hébergement de référence (`https://brunopaiva15.github.io/yamanote-3d/`), et
`index.html` en est la source unique - `documentMeta.ts` lit la canonique dans le
document plutôt que de la redéclarer, si bien qu'un déploiement ailleurs n'a
qu'un fichier à changer.

Ce que le dépôt contient, et ce que chaque pièce sert à :

| Fichier | Rôle |
| --- | --- |
| `index.html` | titre, description, robots, canonique, alternates, Open Graph, Twitter, JSON-LD, et le contenu de repli |
| `src/i18n/documentMeta.ts` | les mêmes métadonnées, tenues à jour avec la langue affichée |
| `public/robots.txt` | indexation ouverte, et le sitemap déclaré |
| `public/sitemap.xml` | l'URL nue et ses trois variantes de langue, chacune portant le jeu complet d'alternates |
| `public/site.webmanifest` | installation sur l'écran d'accueil : nom, description, couleurs, icônes |
| `assets/icon.svg` | la pastille JY, source unique des favicons et icônes |
| `scripts/seo-assets.mjs` | `npm run seo:assets` : en tire favicon, icônes PWA, icône Apple et carte de partage |

Les données structurées (JSON-LD) déclarent un `VideoGame` gratuit, ses trois
langues, son auteur, et - c'est le lien qui compte - le sujet dont il parle
relié à sa fiche Wikidata : ce qui raccroche la page à l'**entité** « ligne
Yamanote » plutôt qu'à la chaîne de caractères.

Deux pièges qui ne se voient pas :

- un robot ne lit `robots.txt` qu'à la **racine du domaine**. Servi sous
  `/yamanote-3d/`, le nôtre atterrit en
  `…github.io/yamanote-3d/robots.txt` et n'est donc pas celui qui fait loi -
  c'est celui de `…github.io` qui compte. Il reste juste le jour où le site
  passe à la racine d'un domaine, et le sitemap, lui, se déclare directement
  dans la Search Console quelle que soit la profondeur ;
- les images produites par `npm run seo:assets` **sont versionnées**. Un crawler
  ou un aperçu de partage doit pouvoir les tirer du site déployé sans que
  personne n'ait relancé le script, et un build de production ne doit pas
  dépendre de `sharp`.

Rien de tout cela ne fait échouer un build : une canonique changée à un endroit
et pas aux trois autres, une langue ajoutée à `LANGS` sans son alternate, une
carte de partage régénérée à d'autres dimensions que celles annoncées, un fichier
référencé mais jamais produit - tout se voit six semaines plus tard dans un
rapport d'indexation. D'où `tests/seo.test.mjs`, qui relit `index.html`,
`robots.txt`, `sitemap.xml`, le manifeste et l'en-tête des PNG et vérifie qu'ils
décrivent tous le même site, et `tests/documentMeta.test.ts`, qui tient les
titres et descriptions des trois langues dans les longueurs qu'un moteur
n'ampute pas.

## Stack

Vite + TypeScript strict, React, React Three Fiber, drei, @react-three/postprocessing,
zustand, Tone.js, Web Speech API. Aucune autre dépendance runtime.

## Architecture

```
src/
  store.ts               zustand : état discret (phase, station, portes, réglages)
  data/                  stations réelles JY01→JY30, correspondances, annonces, config
  data/loop.ts           l'arithmétique de la boucle, orientée : gare suivante /
                         précédente, k-ième saut, libellés 内回り／外回り
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
  three/characters/animals.ts  pack animalier : taille réelle par espèce, clips
                         du quadrupède, vitesse d'auteur mesurée à la foulée
  three/characters/carrier.ts  la caisse de transport, aux cotes que la règle
                         de JR East impose (≤ 120 cm de somme, ≤ 10 kg)
  systems/petCarriers.ts qui voyage avec son chien : tirage par gare, main qui
                         porte - la caisse ne se simule pas, elle se porte
  data/dialogue/         les 416 conversations : conditions d'emploi et texte
                         FR / EN / JA, décliné au féminin et au masculin
  scripts/               models:import / models:inspect / animals:import
                         (packs → public/models/, public/models/animals/),
                         seo:assets (favicons, icônes PWA, carte de partage),
                         sondes navigateur : station-probe, pax-probe,
                         scenery-shots, scenery-cost, pass-shots, season-shots,
                         weather-shots
  scripts/plateau/       pipeline CityGML PLATEAU → GLB (docs/PLATEAU_PIPELINE.md)
  three/PlateauWorld.tsx monde géoréférencé du prototype (un tronçon à la fois)
  textures/              CanvasTexture procédurales (sol, moquette, ville, pubs, visages)
  i18n/                  dictionnaires FR / EN / JA, détection de langue
  i18n/documentMeta.ts   titre, description, Open Graph et canonique, suivant
                         la langue affichée (voir Référencement)
  ui/                    HUD, menu principal, logo, sélecteur de langue, contrôles tactiles
```

Les valeurs continues (vitesse, distance, ouverture des portes) vivent dans
`systems/runtime.ts` et sont mutées chaque frame sans re-render React ; la boucle
60 fps est un unique `useFrame` (`three/Engine.tsx`).

## Audio

Roulement, onduleur VVVF, joints de rail, frein et carillons sont synthétisés
(Tone.js). Les mélodies de départ (発車メロディ) sont des **compositions
originales** du projet : une par quai câblé, inspirée du caractère de la
mélodie réelle (gamme, tempo, timbre) sans en reprendre les notes - les
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
départ), **deux passages entiers**, puis l'annonce de fermeture, la fermeture
neuf secondes plus tard et le départ.

Ces deux passages ne sont pas négociables, et c'est le DWELL qui s'ajuste, pas
la mélodie : la fenêtre sonore de chaque arrêt est taillée sur la longueur du
clip câblé à ce quai-là (`melodyRoundsDuration`, `plannedDepartureMelodyPath`
dans `data/melodies` ; `randomizeStopTimings` dans `systems/stationCycle`), si
bien qu'un arrêt à Komagome - *Sakura Sakura*, 13,6 s le passage - dure une
quinzaine de secondes de plus qu'un arrêt à Takadanobaba - *Tetsuwan Atom*,
6,4 s. La version précédente coupait tout le monde en fondu après dix secondes
fixes : la moitié des quais perdaient leur seconde reprise, et Komagome
n'atteignait même pas la fin de la première. La coupure du chef de train existe
toujours, mais elle referme désormais un silence. Les durées viennent d'un
manifeste (`src/data/melodyManifest.ts`, gravé par
`node scripts/melody-manifest-gen.mjs`) : `tests/melodyTiming.test.ts` échoue
s'il a dérivé des MP3.
Les annonces (sens de la boucle - 内回り ou 外回り - avec ses gares repères,
次は… avec numéro JY, まもなく…, fermeture, accueil, messages de courtoisie en
rotation) sont
dites en japonais puis en anglais, avec les correspondances réelles de chaque
gare. Les voix sont des clips pré-générés avec **Kokoro TTS**, stockés dans
`public/audio/announcements/` et régénérables via
`scripts/announcements-export.ts` + `scripts/announcements-gen.py`. Le
japonais est synthétisé segment par
segment, avec de vraies pauses aux 、/。 - la cadence posée des annonces
automatiques JR (まもなく。…渋谷。…渋谷。), que Kokoro ne marque pas de
lui-même. Les annonces **de bord** n'écrivent plus aucune virgule (ni 、 ni
« , ») : rien que des points, donc partout la pause longue du 。 plutôt que la
respiration courte du 、 (`data/announcements`) ; le quai, lui, garde sa
ponctuation. Le point y marque une PAUSE et pas seulement une fin de phrase, en
anglais comme en japonais : la voix de bord détache le nom de la gare et son
code du reste, « The next station is. Shibuya. JY. 20. The doors on the right
side will open. », comme 「次は。渋谷。渋谷。」 le fait de l'autre côté.
`--reuse` ne grave que les clips absents : un texte inchangé garde
exactement le fichier qu'il avait, et une version plus récente de Kokoro ne
fait pas dériver en douce les annonces déjà en place.

**Ce que l'analyseur lit, et ce qu'il croit lire.** Kokoro ne reçoit pas du
texte mais des phonèmes, fabriqués par misaki. Or un analyseur morphologique se
trompe, et il se trompe surtout sur les noms propres : 「山手線内回り」 sortait
en *yamate sen-nai mawari* - 山手 lu やまて, 線内回り recollé en un mot (et
線外回り en *sengai mawari*) -, soit
le nom de la ligne écorché dans presque chaque annonce, et 御徒町 en tête de
phrase sortait *gotochō*. Les mots concernés sont réécrits en katakana pour la
synthèse seule (`JA_READINGS` dans `announcements-export.ts`), le texte du jeu
gardant son orthographe ; les noms de GARES, eux, sont vérifiés tout seuls
contre leur transcription kana (`stations.ts`) - avec le même misaki que la
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
subi en cours de route met la ligne en retard : les quais s'en excusent, motif à
l'appui, pendant les quelques arrêts qui suivent (`data/stationAnnouncements`,
`systems/stationPa`). Après un 急停車 le motif est tiré parmi ceux qui vont avec
un coup de frein ; après une coupure de courant il ne se tire pas - le quai
annonce 架線の停電, c'est-à-dire exactement ce que le joueur vient de vivre.

Cet arrêt d'urgence (急停車) tombe **toutes les dix à vingt-quatre gares**, soit
de vingt-cinq minutes à une heure de trajet - le premier plus tôt, pour qu'un
trajet court puisse le vivre. Le train freine sec, reste immobilisé de 45 s à
2 min 30 avec les annonces du conducteur et les écrans rouges, puis repart ; le
chrono de phase n'avance que **au prorata de la vitesse** pendant tout
l'événement, si bien que la gare suivante arrive au bon moment après la reprise
et que le retard se lit sur l'horloge murale, pas sur le trajet
(`systems/stationCycle`). Ce que ça fait aux voyageurs est décrit plus haut.

### Ce que la gare ne dit pas toujours

La séquence ci-dessus est ce qu'une gare PEUT dire, pas ce qu'elle dit à chaque
rame. Elle se déroulait pourtant intégralement, tous les tours : quatorze
secondes après le départ d'une rame, le remerciement d'ouverture puis l'annonce
anticipée du prochain train ; à l'ouverture des portes, 「降りるお客さまを先に
お通しください」 ; puis deux consignes d'agent, aux mêmes secondes, tirées dans
l'ordre du numéro d'arrêt. À la troisième gare on connaissait la bande-son par
cœur - et c'est exactement ce qu'un vrai quai n'est pas. ATOS saute l'anticipée
quand les rames se succèdent, et un agent de quai ne prend le micro que quand il
a quelque chose à dire.

**Un plan par rame, tiré une fois.** À l'entrée du creux entre deux rames, la
gare décide de tout ce qui est facultatif : anticipée ou non, remerciement ou
non, « laissez descendre » ou non, zéro, un ou deux messages d'agent et
lesquels. Le calcul est pur - ni store, ni audio, ni `Math.random()` : le tirage
entre par un argument (`systems/platformAnnouncementPlan`), ce qui le rend
testable et surtout **reproductible**. La graine vient de l'arrêt lui-même (gare,
numéro de rame, sens, minute simulée), si bien qu'un rerender, une chute de FPS
ou un aller-retour entre le quai et la rame ne rejouent pas les dés au milieu
d'un arrêt. La rame suivante, elle, obtient un autre plan.

Ce qui pèse sur le plan est ce qui pèse sur un vrai quai :

| Facteur | Effet |
| --- | --- |
| **Creux** entre deux rames | l'anticipée passe de 25 % sous 90 s à 55 % à 150 s et 80 % au-delà - c'est la place disponible |
| **Heure** (pointe 7 h–9 h 30 et 17 h–19 h 30) | rames rapprochées : l'anticipée tombe encore d'un facteur 0,6 ; l'agent, lui, parle plus |
| **Gare** (`isMajorHub`, la liste des annonces de direction, pas une seconde) | un hub annonce un peu plus, et penche vers deux consignes en pointe |
| **Affluence** (le modèle de remplissage, pas le nombre de PNJ - la sono ne doit pas changer avec le réglage de qualité) | quai calme : 55 % de silence complet ; quai moyen : une consigne ; quai bondé : une, parfois deux |
| **Retard** | le silence est divisé par deux, et les consignes de circulation et de portes passent devant |

Le remerciement ne précède donc plus l'anticipée par principe : c'est une
politesse de creux calme, et en pleine pointe personne ne remercie personne.
「降りるお客さまを先に…」 devient presque certain sur un quai chargé, dans un hub,
en pointe - et rare dans une petite gare déserte, où l'entendre pour trois
personnes sonnait faux.

**Les consignes d'agent ont maintenant un propos.** Chaque message porte une
catégorie, un poids, une affluence minimale et un multiplicateur de retard
(`data/stationAnnouncements`) : demander d'avancer vers le milieu de la voiture à
trois personnes n'a aucun sens, et 「無理なご乗車はおやめください。次の電車をご
利用ください。」 ne se dit que quand il n'y a vraiment plus de place - c'est
d'ailleurs le message que le retard rend le plus probable, parce que c'est le
moment où l'on arrête de charger la rame pour tenir l'intervalle. Deux créneaux,
deux registres : on fait descendre et avancer pendant l'échange, on décourage le
saut dans les portes juste avant la mélodie.

**Et ce qui ne tient pas dans son créneau est abandonné, pas repoussé.** La sono
du quai n'a qu'une file : rien ne peut sonner par-dessus autre chose, mais une
consigne mise en file derrière une autre sortirait après le moment où elle
voulait dire quelque chose. Avant chaque message facultatif, la gare mesure ce
qu'elle a encore à dire (`speechQueueRemaining`) et la durée du clip, et compare
au temps qui reste avant l'annonce prioritaire suivante - la mélodie, la
fermeture, le carillon d'approche. Si ça ne tient pas, le message tombe. L'excuse
de retard, l'anticipée et les consignes d'agent ne se marchent donc jamais
dessus, et **l'annonce d'approche, elle, n'est pas facultative** : une rame qui
entre en gare s'annonce toujours.

### Ce que certaines gares disent en plus

Trente gares qui disent exactement la même chose ne s'entendent pas comme une
ligne, elles s'entendent comme un gabarit. Quelques-unes ajoutent une consigne
qui n'appartient qu'à elles, parce que leur quai a une particularité - et la
première est **Shibuya**, dont le quai Yamanote décrit une courbe que la réunion
des deux voies sur un seul îlot (janvier 2023) n'a pas redressée : l'écart entre
le seuil de la rame et le bord du quai s'y signale, dans les deux sens :
「電車とホームの間が空いているところがありますので、足元にご注意ください。」

**Et pas dans les mêmes mots des deux côtés.** Le japonais, oui : 「足元にご注意
ください」 ne dit pas dans quel sens on franchit l'écart, et vaut pour qui descend
comme pour qui monte. L'anglais, non. *Please watch your step when you leave the
train* est juste dans la RAME, où l'on ne parle qu'à des gens déjà à bord ; sur le
quai, la même phrase est entendue par ceux qui attendent pour monter - et qui sont,
à cette seconde précise, les plus concernés par l'écart. Le quai nomme donc l'écart
plutôt que le geste : *Please mind the gap between the train and the platform.*
Deux textes, deux clips, un par canal.

Ces consignes vivent en **données** (`data/stationAnnouncementRules`), indexées
par code JY, et nulle part ailleurs : pas un seul `if (index === 19)` dans le
cycle station. Chacune choisit son canal (la rame ou le quai - ce ne sont ni les
mêmes voix ni les mêmes oreilles), son sens (un quai en courbe ne se courbe pas
forcément des deux côtés) et l'endroit exact où elle s'insère dans la séquence :
après le nom de la gare, après les correspondances, pendant l'approche pour la
rame ; derrière l'anticipée, derrière l'annonce d'approche ou derrière le nom de
la gare pour le quai. La consigne de Shibuya passe donc à l'approche dans le
wagon - aux gens qui vont descendre - et à l'arrivée sur le quai, aux gens qui
vont monter, et à aucun autre moment.

Cette séquence d'arrivée est aussi la plus longue de la ligne : le nom de la gare,
la consigne en japonais, puis en anglais. C'est elle qui décide du sort de ce qui
suit - « laissez descendre » n'a de sens que pendant que les voyageurs descendent,
et sur l'arrêt le plus court il n'y a plus de place pour lui derrière tout cela. Il
est alors ABANDONNÉ, comme n'importe quelle consigne facultative, plutôt que
repoussé sur les premières notes de la mélodie (`tests/shibuyaAnnouncementTimeline`
rejoue l'arrêt entier, seconde par seconde, sur les durées réelles des clips).

La règle de peuplement de cette table est explicite dans le fichier : **on
n'invente pas**. Chaque entrée porte au-dessus d'elle la raison pour laquelle
elle existe. Une gare dont on ne sait rien n'a pas d'entrée - l'architecture est
là, elle attend.

### La coupure de courant

C'est le second arrêt subi, et il ne ressemble en rien au premier. Un coup de
frein s'annonce par une secousse ; une coupure de caténaire (停電) ne s'annonce
pas du tout. **Elle ne fait aucun bruit : elle en retire.**

Dans l'ordre, ce que vit le wagon :

```
0 s        la traction disparaît. Le chant de l'onduleur s'éteint,
           le souffle de la climatisation meurt en deux secondes.
           La rame roule sur son élan (惰行) et ne ralentit presque pas.
0–1,8 s    ÇA CLIGNOTE, ET ÇA CLAQUE. Le disjoncteur s'ouvre sous le
           plancher, le convertisseur décroche, se réamorce sur ce qui reste
           dans ses condensateurs, décroche encore - trois fois, de plus en
           plus court -, puis un dernier soubresaut à 1,7 s et plus rien.
           Contacteurs, grésillements de tubes qui essaient de se rallumer,
           sifflement du convertisseur qui s'effondre : chaque bruit tombe
           sur son clignotement, pas à côté.
           Les tubes s'affaissent progressivement ; les dalles LCD et les
           douze écrans 窓上, eux, CLAQUENT - un rétroéclairage tient ou il
           ne tient pas. À mi-décrochage le wagon est encore parfaitement
           lisible alors que tous les écrans sont déjà noirs.
~1 s       le relais de secours bascule : deux lampes froides s'allument,
           une fois les néons vraiment perdus (et pas entre deux
           décrochages, ou elles battraient en opposition de phase).
2–4 s      le conducteur serre les freins. Freinage de SERVICE, au pneumatique :
           la récupération n'a plus de ligne où renvoyer son courant.
~14 s      première annonce, au combiné, sur les batteries de bord.
2 min 50   à 5 min 40 d'immobilisation, portes closes. Le wagon n'est pas
   à 5'40  muet pour autant : un relais travaille sous le plancher toutes
           les 9 à 26 s. Un rappel d'attente à mi-parcours - et la seule
           consigne de sécurité du jeu qui vise un geste que le joueur
           pourrait vraiment faire : ne pas toucher au robinet de secours
           des portes.
−24 s      le courant revient, et il met trois secondes. Deux contacteurs se
           referment sans tenir, le troisième tient, puis les tubes montent
           doucement en puissance - un fluorescent ne donne pas son plein
           flux d'un coup. Les écrans se rallument NOIRS : la lampe revient,
           le contrôleur redémarre derrière, l'image arrive après.
           L'annonce, elle, tombe neuf secondes plus tard : c'est la lumière
           qui prévient le wagon, pas la voix.
0 s        desserrage, la rame repart.
```

Le point qui commande tout le reste : **une E235-0 de la Yamanote n'a pas de
batterie de traction**. Elle ne peut pas rejoindre la gare suivante par ses
propres moyens. Cette fonction est arrivée plus tard, sur les E235-1000 des
lignes Yokosuka et Sōbu rapide, que JR East a présentées comme une première du
genre. La rame verte, elle, attend le retour de la tension - et c'est pour ça
que l'immobilisation se compte en minutes là où un 急停車 se compte en secondes.
Le vrai ordre de grandeur est d'ailleurs bien pire : lors de la panne de Tamachi
du 16 janvier 2026, deux rames de la Keihin-Tōhoku sont restées bloquées entre
deux gares et quelque 4 000 voyageurs ont fini par descendre à pied, après une
heure passée dans des voitures sans climatisation. Le jeu n'a ni évacuation ni
marche le long des voies : au-delà de quelques minutes il ne resterait plus rien
à vivre, l'événement est donc coupé court.

Ce qui reste allumé est ce qui tient sur les batteries, et la liste n'est pas
décorative : la réglementation japonaise impose que l'essentiel reste utilisable
pendant une panne d'alimentation - sono du conducteur, interphone, signalisation
de porte, lampes de secours. Les écrans, eux, ne sont pas des équipements de
sécurité : ils tombent, et ils tombent les premiers (`LCD_CUTOFF` est plus haut
que le seuil des lampes, un panneau perdant son rétroéclairage bien avant qu'un
tube ne s'éteigne).

Tout cela passe par **une seule valeur**, `runtime.carPower` (0..1) : les néons
et le bandeau LED la lisent en puissance 1,6 - un tube tient, blêmit, puis lâche
-, les dalles et les écrans publicitaires en MARCHE et non en rampe, le moteur
audio pour couper l'onduleur et laisser mourir les turbines à leur propre
inertie. Le reste du jeu n'a pas à savoir qu'une coupure existe.

La forme des deux séquences vit dans `systems/carPower`, en images-clés plutôt
qu'en formules : on les lit, et on les règle en déplaçant un chiffre. Le module
n'a aucune dépendance, donc Node l'exécute tel quel et
`tests/carPower.test.ts` vérifie ce que l'œil doit pouvoir compter - au moins
trois extinctions franches à la coupure, deux retombées de contacteur au
retour, une remontée finale qui ne redescend jamais, et un éclairage de secours
qui ne s'allume jamais entre deux décrochages ni ne laisse le wagon dans le noir
complet pendant que le courant revient.

**Et ça fait du bruit.** Une coupure est un événement sonore avant d'être un
événement visuel : entre les deux silences, il se passe quelque chose de très
court et de très électrique. Le disjoncteur principal s'ouvre sous le plancher,
des contacteurs claquent, les tubes grésillent en essayant de se réamorcer, le
sifflement du convertisseur s'effondre en une demi-seconde - et remonte au
retour. Rien de tout cela n'a de corps : c'est du bruit blanc très court et très
aigu, le seul timbre du jeu qui n'ait que du haut.

Ces instants sont déclarés **dans `carPower`, à côté des images-clés de la
lumière**, et non dans le moteur audio, qui ne fournit que les timbres. C'est la
seule façon de garantir qu'ils ne se décalent jamais : un claquement qui arrive
un dixième de seconde après son clignotement se lit comme un deuxième
événement. Régler la courbe, c'est régler le son en même temps - et le test le
vérifie, chaque commutation devant tomber sur une image-clé. Une frame lente ne
perd rien non plus : elle récolte d'un coup tous les bruits que son pas a
traversés, ce qui vaut mieux que de les sauter.

Reste ce qu'on entend **pendant** les minutes de noir, et c'est peut-être le
plus important : de loin en loin, un relais travaille quelque part sous le
plancher (toutes les 9 à 26 s, très ténu). Cinq minutes de silence absolu ne
s'entendent pas comme une panne, elles s'entendent comme un bug audio ; ce sont
ces déclics qui font qu'un wagon éteint reste habité.

Une seconde valeur l'accompagne, `runtime.emergencyLight`, et ce n'est
délibérément **pas** le complément de la première : le relais de secours ne
bascule pas au premier décrochage, il attend que l'alimentation normale soit
vraiment perdue. Des lampes de secours qui battraient en opposition de phase
avec les néons ne ressembleraient à rien.

Rien de tout cela ne se juge sur une capture d'écran : le clignotement dure
moins de deux secondes, et le rendu logiciel des scripts tourne à quatre images
par seconde - il le consomme en quelques frames. `__holdPower(niveau)` fige donc
l'alimentation à un point choisi de la courbe, et `scripts/outage-shots.mjs` en
tire une pellicule des états traversés.

La coupure tombe **toutes les trente-quatre à soixante-dix gares**, soit d'une
heure et demie à trois heures de trajet - la première plus tôt. C'est
volontairement au-delà d'une session ordinaire : une vraie panne d'alimentation
est un événement qu'on raconte, pas un qu'on croise. Elle passe devant l'arrêt
d'urgence quand les deux tombent sur la même course.

Ce qui pose un problème que la rareté ne résout pas : un événement qu'on peut
ne jamais voir est un événement qu'on ne peut pas non plus regarder deux fois.
D'où le **⚠ discret en bout de barre du HUD** (`ui/IncidentMenu`), qui déroule
les deux arrêts et les déclenche à la demande. Il n'invente rien et ne double
aucune mécanique : il appelle exactement les fonctions du tirage automatique,
avec les mêmes conditions - la rame doit rouler en pleine voie, et rien ne doit
être déjà en cours. Quand ce n'est pas le cas, il le DIT plutôt que de se
contenter d'être gris. Le menu est volontairement effacé tant qu'on ne le
survole pas : ce n'est pas un réglage, et on ne doit pas tomber dessus en
cherchant le volume.

En développement, `__emergencyStop()` et `__powerOutage()` font la même chose
depuis la console, `__outageSkip(-n)` avance jusqu'aux abords du retour de la
tension, `__holdPower(niveau)` fige l'alimentation à un point de la courbe, et
`scripts/outage-shots.mjs` en fait la planche de contrôle.

**Cinq sources, et trois automates qu'on ne confond pas** : la sono de la rame
(`jf_alpha`), les deux annonces automatiques du quai - **une femme sur le
内回り** (`jf_tebukuro`) et **un homme sur le 外回り** (`jm_kumo`) -, l'agent de
quai au micro (`jf_nezumi`, une femme, un peu plus rapide et moins lisse -
c'est une personne, pas un automate, et elle prend la parole juste après lui),
et les deux voix anglaises (`af_heart` à bord, `am_michael` au quai, un cran
plus lent : dehors, sous une verrière, une annonce trop rapide ne s'attrape
pas).

**Pourquoi deux automates de quai.** Les machines se répondent à une seconde
d'écart - 「1番線、ドアが閉まります」 sur le quai puis 「ドアが閉まります」 dans le
wagon - et il ne faut pas avoir à chercher laquelle vient de parler. Sur un îlot
central, le problème est le même d'un quai à l'autre : les deux sens annoncent le
MÊME script, mot pour mot, et 「渋谷、渋谷。ご乗車、ありがとうございます。」 est
identique au caractère près dans un sens comme dans l'autre. La voix est alors la
seule chose qui dise laquelle des deux voies vient d'annoncer, donc de quel côté
se tourner. Le sens choisit l'automate en un seul endroit
(`atosVoiceForDirection`), et aucune annonce automatique ne fixe sa voix
elle-même. Il ne s'agit pas d'imiter les voix réelles de JR East, seulement de
rendre les deux quais séparables à l'oreille.

Cela s'est joué dans la **clé du clip**, pas seulement dans le générateur : un
MP3 était identifié par le couple (langue, texte), si bien que deux automates
disant les mêmes mots se seraient partagé un fichier - le dernier gravé aurait
pris la bouche de l'autre, et un quai sur deux aurait parlé du mauvais sens sans
que rien n'échoue. La clé des annonces de quai porte donc aussi le **rôle vocal**
(`data/clipKey`) ; celle des annonces de bord, qui n'ont qu'une voix par langue,
n'a pas changé d'un octet.

S'y ajoute, sur les gares dont l'îlot est partagé avec une autre ligne, la seule
annonce de quai qui parle d'une voie qui n'est pas la nôtre : まもなく、1番線を、
電車が通過します - voir *Le train qui ne s'arrête pas*.

**La cinquième voix.** Il y en avait une de trop, et c'était la seule qu'on
n'avait pas choisie. Neuf textes joués n'avaient pas de clip : le remerciement
d'ouverture, dont le texte venait de changer, et toute la procédure de porte
bloquée, ajoutée sans regravure. Faute de MP3, ils partaient sur
`speechSynthesis` - la voix du navigateur, Kyoko ou Nanami selon la machine,
qui sort **hors du graphe Web Audio** : ni panoramique, ni souffle de ligne,
juste un volume approché. Sur le quai, où l'on entend l'ATOS et l'agent
enchaîner, elle s'entendait comme une intruse.

Le générateur, lui, ne pouvait plus tourner : un clip est identifié par le seul
couple (langue, texte), et l'agent de quai disait mot pour mot la phrase du
conducteur - 「ドアから離れてください。」. Deux voix pour une clé : l'export
refusait de continuer, à juste titre, et personne ne pouvait plus regraver quoi
que ce soit. L'agent a donc sa propre formulation, ce qui est d'ailleurs plus
juste : il ne lit pas un script depuis une cabine, il parle à quelqu'un qu'il a
devant lui (「危ないですから、ドアから離れてください。」).

Les neuf clips gravés, le repli a été **supprimé** plutôt que réparé. Un texte
sans clip ne se dit plus : une annonce muette passe inaperçue là où une voix
étrangère casse la scène, et un clip qui ne se charge pas est simplement rejoué
une fois avant qu'on renonce. Pour que le cas n'arrive jamais,
`tests/announcementClips.test.ts` énumère ce que grave le générateur et vérifie
que chaque texte a son MP3, que chaque MP3 est là, et qu'aucun ne traîne sans
être réclamé. Retoucher un mot d'annonce sans regraver fait désormais échouer
la suite de tests - pas le rendu sonore, trois semaines plus tard, dans une
gare qu'on ne visitait plus.

**Quinze gares attendent leur regravure.** Le relevé de janvier 2026 a corrigé
le côté d'ouverture de quinze gares (voir *Les gares*), et une annonce d'arrivée
DIT ce côté : 「お出口は。左側です。」. Le texte a donc changé, la clé de clip
avec lui, et comme le repli a été supprimé, **ces quinze gares sont muettes**
tant que les MP3 ne sont pas regravés - 128 clips, arrivée et approche, japonais
et anglais, à bord et au quai. Tokyo, Akihabara, Okachimachi, Uguisudani,
Nishi-Nippori, Tabata, Komagome, Ikebukuro, Mejiro, Shin-Ōkubo, Shinjuku,
Ebisu, Gotanda, Tamachi et Shimbashi.

C'est exactement le cas que `tests/announcementClips` est là pour attraper, et
il l'a attrapé. La regravure est incrémentale :

```bash
python scripts/announcements-gen.py textes.json kokoro-v1.0.onnx \
    voices-v1.0.bin public/audio/announcements src/data/pa-manifest.ts --reuse
```

`--reuse` ne synthétise que les clips absents et supprime au passage ceux que
plus personne ne réclame : les 200 annonces déjà en place ne dérivent pas.

Le numéro de voie annoncé est le vrai (`data/platforms`), y compris les voies
secondaires d'Ikebukuro et d'Ōsaki. Les clips ne sont gravés que pour le sens
réellement circulé (`DIRECTIONS` dans `scripts/announcements-export.ts`) : dans
l'autre sens, ni le numéro de voie ni la direction annoncée ne seraient les
mêmes.

### L'ambiance du lieu

Ce qu'on entend **par-dessus** la sonorisation, et qui n'est pas le même d'une
gare à l'autre : les oiseaux d'Uguisudani - 鶯谷, « la vallée du rossignol » -,
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
la tôle et l'isolant ont mangés. Il ne passe pas par les portes - il est là même
portes fermées, et c'est le seul son du jeu dont l'ouverture des portes ne change
rien. Il appartient à la rame, donc au bus qui s'atténue quand on la regarde
depuis le quai : là, le toit sous lequel on se tient est celui de la gare.
L'averse y crépite plus haut que la bruine, la goutte étant plus grosse et
frappant plus fort.

**Dehors**, sur la ville et sur le quai : un souffle large et brillant, qui
n'entre dans le wagon que par les ouvertures, comme l'ambiance de gare et pour la
même raison. Portes fermées, il n'en reste que le grave - le vitrage coupe tout
au-dessus de deux ou trois kilohertz. Une seule source pour les deux aurait forcé
à choisir un timbre, et le timbre est précisément ce qui distingue les deux
endroits.

Le **tonnerre** est un grondement long, plus un claquement qui ne vaut que pour
les coups proches : c'est le *rapport* des deux qui donne la distance, bien plus
que le niveau. Le retard suit la même distance - trois secondes par kilomètre -,
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
- Le quai, lui, n'est pas sonorisé par un point mais par une **ligne** de
  diffuseurs - un tous les dix-neuf mètres sur les 224 m, ceux-là mêmes qu'on
  voit sous l'auvent. Le graphe en panne les six plus proches de la tête, et
  c'est la gare qui les désigne à chaque image : le diffuseur au-dessus de soi
  change quand on marche, et l'annonce s'entend aussi bien au bout du quai que
  devant sa porte (moins d'un décibel d'écart d'un bout à l'autre, contre plus
  de vingt quand la sono tenait en quatre points calés sur les portes du
  milieu). L'atténuation n'est pas celle d'une source ponctuelle : distance de
  référence large et rolloff doux, le champ à peu près constant d'une vraie
  sono de quai.
- La 発車メロディ vient des haut-parleurs du **quai**, pas de la rame : sourde
  et lointaine portes fermées, elle entre franchement par les ouvertures quand
  les portes de la rame **et** les portes palières sont dégagées, du côté qui
  s'ouvre à cette gare. Elle est faite pour être entendue des voyageurs déjà
  montés : elle porte jusque dans le wagon.
- Elle a son **propre niveau**, à part du reste de la sono du quai (les clips
  sont normalisés en crête et sonnaient bien plus fort que tout le reste de la
  gare). Ce niveau dépend du lieu d'écoute : sur le quai, à trois mètres sous
  un diffuseur, on en retire une dizaine de décibels ; dans la rame, où elle
  arrive déjà filtrée par les ouvertures, moitié moins - plus une petite bosse
  de présence vers 2 kHz qui la garde lisible par-dessus le brouhaha et la
  clim. Le rapport entre les deux la maintient du côté du quai : à l'oreille,
  elle reste plus présente dehors que dedans, elle vient toujours de la gare.

Les annonces vocales (clips Kokoro) passent par ces mêmes bus : elles sont
réellement pannées sur les diffuseurs, ceux du plafond pour la rame, ceux du
quai pour la gare - toutes, sans exception, puisqu'il n'existe plus de voix qui
sorte du graphe Web Audio. Chacune est prise sous le souffle de sa ligne, qui
s'ouvre et se referme avec un déclic autour d'elle.

**Où on est décide ce qu'on entend.** Les deux voix ont chacune leur robinet, et
il dépend du côté de la porte où se trouve la tête :

- sur le **quai**, la voix de bord est muette - les diffuseurs sont dans le
  wagon, derrière les vitres. On n'entend que la gare, et en clair ;
- dans la **rame arrêtée**, la voix du quai n'est qu'un lointain qui entre par
  les portes ouvertes : assez pour reconnaître qu'une annonce passe dehors et
  en attraper des morceaux, pas assez pour couvrir celle du wagon.

Ce partage ne vaut que pour la **parole**. Les carillons de porte, le jingle
d'arrivée, le carillon ATOS, les bips des portes palières et la mélodie de
départ sont des signaux : ils traversent, dans les deux sens. Chaque
sonorisation a sa propre file d'annonces, si bien que la gare et la rame
peuvent parler en même temps - ce qu'elles font vraiment quand on est assis
porte ouverte et que le quai annonce la fermeture une seconde après le wagon.

Optionnel : déposez d'autres enregistrements dans `public/audio/`
(`door-open.mp3`, `door-close.mp3`, `arrival.mp3`, `melody-JY01.mp3`…) ; ils seront
utilisés à la place de la synthèse, et passent par le même bus spatialisé.

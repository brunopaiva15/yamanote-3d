# Entrer dans la gare — découpage en phases

Jusqu'ici, le jeu s'arrête au bord du quai : on descend du train, on marche
224 mètres, on descend cinq marches dans une trémie et une limite invisible
arrête le pas. Tout ce qu'il y a en dessous — le couloir, les portillons, le
hall, la rue — est du décor qu'on regarde sans y aller.

Ce document découpe le passage de « voir la gare » à « s'y promener ». Chaque
phase est livrable seule, se teste seule, et ne casse pas la précédente.

## Ce qui existe déjà, et sur quoi on s'appuie

| Brique | Fichier | Ce qu'elle donne |
|---|---|---|
| Cotes de quai et d'escalier | `data/stationGeometry` | profil des marches, palier, linteau, couloir bas |
| Gabarit par gare | `data/stationLayouts` | élévation, configuration, auvent, palette, équipements |
| Implantation du mobilier | `systems/stationPlacement` | source unique du rendu ET de la marche |
| Volume praticable | `systems/walkable` | rectangles, seuils de porte, descente bornée |
| Étage et altitude | `systems/stationLevels` | quel des deux sols est sous les pieds — joueur ET foule |
| Rendu de la trémie | `three/station/Stairwell` | volée pleine, palier, couloir bas, fond de champ |

Trois principes du dépôt s'appliquent tels quels et ne se négocient pas :

1. **Une seule source.** Un banc dessiné à un endroit et infranchissable à un
   autre se voit au premier pas. L'intérieur passe donc par une couche de
   données lue à la fois par le rendu et par la marche.
2. **Pas de physique.** Le volume praticable se décrit en rectangles alignés
   sur les axes, plus une altitude de sol. L'intérieur n'y change rien : il
   ajoute des rectangles à d'autres altitudes.
3. **Le relevé fait autorité.** Ce qui est incertain se déclare incertain
   (`data/evidence`), il ne se devine pas.

---

## Phase 0 — Le relevé de janvier 2026 ✅

**Livré.** Avant de bâtir l'intérieur, remettre d'aplomb ce qui décrit le plan
de voies, parce que tout l'intérieur s'y accroche : le côté d'ouverture décide
de quel bord on descend, la famille de quai décide de ce qu'il y a sous nos
pieds.

- côté d'ouverture (`data/stations`, `DOOR_SIDE`) : **quinze gares corrigées** ;
- côté par voie quand il diffère du côté de la gare (`data/platforms`) :
  Ōsaki extérieure, voies terminales d'Ikebukuro et d'Ōsaki ;
- famille de quai (`data/stationLayouts`, `config`) : Kanda, Shinjuku et
  Shimbashi passent en îlot partagé ;
- le tout gelé par `tests/stationTrackPlan.test.ts`, une ligne par gare.

## Phase 1 — Le volume intérieur, en données ✅

**Livré.** `data/stationInterior` : ce qu'il y a au-delà du bas de la volée,
gare par gare, sans une ligne de rendu.

- un **niveau** de correspondance par gare (parfois deux : Ueno), avec son
  altitude signée — *sous* les voies pour une gare sur viaduc ou au sol,
  *au-dessus* pour une gare en tranchée, où le bâtiment enjambe la
  tranchée (Komagome, Sugamo, Tabata, Mejiro, Meguro) ;
- un **couloir** par accès, qui rejoint le hall transversal ;
- une **ligne de portillons** (改札口) nommée, avec son nombre de passages et
  sa position ;
- de part et d'autre, la **zone payante** (改札内) et la **zone libre**
  (改札外), plus les bouches de sortie.

## Phase 2 — La marche continue ✅

**Livré.** `systems/walkable` ne connaissait qu'un sol : le quai, à altitude
constante, plus la volée bornée à cinq marches. Il connaît maintenant une pile
de niveaux et les liens verticaux entre eux.

- la volée se descend **entière**, jusqu'au palier puis au couloir bas ;
- le couloir débouche sur le hall, qui se parcourt ;
- le portillon se franchit, et l'on passe en zone libre ;
- `runtime.playerLevel` porte l'étage courant. Ce n'est PAS un troisième repère
  de coordonnées - le hall vit dans celui du quai, il se retourne avec lui et la
  gare y reste épinglée. Ce qui change, c'est qu'à une même abscisse il y a
  maintenant deux sols, et que rien dans les coordonnées ne dit lequel est sous
  les pieds. L'étage ne bascule que dans une trémie, seul endroit où les deux
  n'en font qu'un ;
- la rame repart sans nous : c'est déjà le cas sur le quai, et rien dans la
  descente ne le change.

## Phase 3 — Le rendu du niveau de correspondance ✅

**Livré.** `three/station/Concourse` : le hall qu'on parcourt, bâti sur les
mêmes cotes que la marche.

- sol, plafond, soubassement de faïence, bandeau lumineux, poteaux ;
- ligne de portillons : bornes, lecteurs IC, volets, feux de passage ;
- signalétique : le bandeau 改札 porte le nom réel du passage, et chaque bouche
  de sortie porte le MÊME panneau jaune que les potences du quai - tiré du même
  relevé (`data/lines`), parce qu'une gare ne fléche pas 八重洲中央口 en haut
  des marches et autre chose en bas ;
- le mur de fond du couloir bas s'efface là où le hall commence ;
- vérifié à pied, dans un vrai navigateur : `__probeInterior` donne l'itinéraire
  du quai à la zone libre, `__probeGo` le parcourt avec le `resolveMove` du jeu.

## Phase 4 — La sortie et la rue

**À faire.** Aujourd'hui, la zone libre se ferme sur une bouche d'escalier
éclairée par le jour. La phase suivante décide ce qu'on en fait :

- volée montante vers un débouché de rue borné (le trottoir devant la gare,
  quelques dizaines de mètres, la ville existante en fond) ;
- ou limite franche assumée, comme les abouts de quai, avec le fléchage qui
  dit où elle mène.

Elle apporte aussi les distributeurs de titres, les consignes, les toilettes,
le bureau de la gare (みどりの窓口) et les commerces sous marque réelle qu'on
voit sur les plans (ecute à Ueno, atré à Meguro et Tabata).

## Phase 5 — Les accès montants ✅

**Livré.** Cinq gares en tranchée ont leur hall **au-dessus** des voies, et ce
n'est pas la trémie avec un signe changé — c'est un autre ouvrage :

- elle ne perce **pas** la dalle, elle se pose dessus : ni joues qui coiffent un
  percement, ni linteau, ni voile de tête ;
- sa **sous-face** est visible, et c'est même la première chose qu'on en voit du
  quai — une volée montante se lit par en dessous ;
- elle perce en revanche l'**auvent**, qui devient une dalle extrudée à trou,
  comme celle du quai l'est déjà pour les trémies ;
- elle monte cinq mètres au lieu de trois et demi, en **deux volées** séparées
  d'un palier : vingt-neuf marches d'un trait n'existent dans aucune gare.

Son emprise entre dans la trame : poteaux, poutres, néons, diffuseurs et
conduites la sautent, comme ils sautent une gaine d'ascenseur — une volée de
onze mètres n'a pas l'emprise d'une trémie de cinq.

**Nippori reste à part**, et pour une raison précise : ses deux ponts-concours
SONT son niveau de correspondance, dessinés par sa charpente, sous-face à
5,10 m — la cote exacte d'un hall d'en haut. Y poser le hall générique
reviendrait à bâtir deux fois la même chose, l'une dans l'autre. Elle rejoint
donc la phase 6, où elle était déjà attendue.

## Phase 6 — Les gares qui ne se paramètrent pas

**À faire.** Même logique que les `signature` de quai : ce qui ne se
paramètre pas se dessine à part.

- **Ueno** — deux groupes d'accès, quatre portillons nommés (不忍・中央 en M2F,
  公園・入谷 en 3F), ecute entre les deux ;
- **Shinjuku** — le plus grand hall de la boucle, deux quais Yamanote séparés ;
- **Shibuya** — l'îlot de 2023 et ses circulations provisoires ;
- **Nippori**, **Akihabara** — les niveaux superposés ;
- **Takanawa Gateway** — la halle de bois et de verre, qui descend jusqu'au
  hall.

## Phase 7 — La vie intérieure

**La foule est livrée ; le son reste à faire.** Un hall vide n'est pas un hall.

Ce qui marche maintenant (`systems/concourseRoute`, `systems/platformCrowd`) :

- **la foule traverse, dans les deux sens.** Un voyageur qui quitte le quai
  descend la volée principale, traverse la zone payante, **valide** au
  portillon, ressort côté libre et ne s'efface qu'en haut de la volée d'une
  bouche de sortie, là où le linteau le cache. Une part des arrivants fait le
  chemin inverse depuis la rue. Il s'effaçait jusqu'ici au fond du couloir
  bas — invisible depuis le quai, en plein champ depuis le hall ;
- **on s'y arrête.** Devant les distributeurs de titres, le plan de quartier,
  l'ajusteur de fin de course, le tampon de gare ; et l'on **entre au
  konbini**, où l'on fait le tour des rayons avant de passer à la caisse
  (`data/konbiniPlan`, `stops`) ;
- **le portillon fait son ピッ** à chaque validation, et son feu s'allume.
  On **bipe avant de passer**, du côté d'où l'on vient — côté libre pour qui
  entre, côté payant pour qui sort (`systems/concourseRoute`, `paidLegs`) — et
  les **battants se rabattent** devant qui s'approche sans avoir rien présenté,
  la foule comme le joueur : ils claquent, on pose sa carte, ils s'écartent, on
  passe. La baie n'ouvre que pour celui qui a validé : un voyageur qui la
  franchit ne laisse pas le joueur entrer derrière lui (`systems/fareGate`) ;
- **on peut leur parler** : descendu au niveau du hall, c'est la foule d'EN BAS
  qui devient joignable, et celle du quai qui cesse de l'être
  (`systems/paxTargeting`).

Ce qui reste :

- le son change de pièce : la sonorisation du quai s'assourdit, le hall a sa
  propre réverbération ;
- on entend la mélodie de départ d'en bas, et l'on peut remonter à temps —
  ou pas.

## Phase 8 — Ce que ça coûte

**À faire.** Occlusion et budget d'affichage : le hall ne doit pas se rendre
depuis le train, ni le quai depuis le hall.

---

## Invariants à ne pas casser

- `DOOR_SIDE` reste indexé **par gare** : le plan de voies est symétrique par
  rotation d'un demi-tour. Les exceptions par voie vivent dans
  `data/platforms`, pas dans une seconde dimension de la table.
- La géométrie de l'intérieur est construite dans le **repère du quai** (avant
  la rotation de π du côté d'ouverture) : le hall se retourne avec la gare,
  sans une ligne de code de plus.
- La marche et le rendu lisent le **même** `data/stationInterior`. Un portillon
  franchissable là où il n'est pas dessiné se verrait au premier pas.

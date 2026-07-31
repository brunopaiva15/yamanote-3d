# Meubler la gare — découpage en phases

Le hall existe et se parcourt (`docs/STATION_INTERIOR.md`), mais il est **vide** :
quatre parois, une ligne de portillons, deux caissons publicitaires. Une gare
japonaise, elle, est saturée — commerces, distributeurs, consignes, plans,
fléchage à trois niveaux de lecture, piliers habillés du sol au plafond. C'est
cette saturation qui fait qu'on la reconnaît, et c'est elle qui manque.

Ce document découpe ce garnissage. Chaque phase est livrable seule et se voit à
l'écran le jour où elle tombe.

## La règle qui tient tout

Le dépôt a déjà tranché deux fois, et ça ne se rejoue pas :

1. **Une implantation, deux lecteurs.** `systems/stationPlacement` pose le
   mobilier du quai ; `data/stationInterior` pose celui du hall. Le rendu et la
   marche lisent la même liste. Un distributeur dessiné à un endroit et
   traversable à un autre se voit au premier pas.
2. **Ce qui se répète s'instancie.** Une gare tient dans quelques dizaines
   d'appels de rendu, pas quelques centaines. Les caisses passent par
   `InstancedMesh` (`three/station/instancing`), les visuels par un pool
   construit une fois pour la session (`three/station/adPool`).

Et une troisième, propre à ce chantier :

3. **Un meuble se reconnaît à sa SILHOUETTE, pas à sa texture.** Un distributeur
   JR se lit de loin parce qu'il est creusé de trois niches ; un konbini parce
   qu'il a une devanture vitrée pleine hauteur sous un bandeau allumé ; une
   consigne parce qu'elle est une grille de portes carrées. Une boîte avec une
   image collée dessus ne ressemble à rien - c'est ce qu'était le kiosque.

---

## Phase 1 — L'implantation du hall ✅

**Livré.** `data/stationInterior` ne posait que les bornes de portillons. Il
pose maintenant tout le mobilier du niveau, rangé le long des deux parois, zone
par zone : ce qui est en zone payante (精算機, stamp, bancs) ne peut pas se
retrouver en zone libre, et réciproquement (券売機, consignes, konbini).

- un moteur de rangement le long des parois, qui refuse ce qui ne rentre pas
  plutôt que de le tasser ;
- l'échelle de la gare commande la liste : une gare à 0,7 d'affluence n'a ni
  konbini ni consigne, Shinjuku a tout ;
- chaque meuble déclare son emprise, sa paroi et le sens de sa façade — et
  cette emprise EST l'obstacle de marche.

## Phase 2 — Les meubles de billetterie ✅

**Livré.** `three/station/Fixtures` : ce qu'on trouve de part et d'autre des
portillons.

- **券売機** — la batterie de distributeurs de titres, écran incliné, fente à
  billets, plan tarifaire au-dessus ;
- **精算機** — l'ajusteur de fin de course, côté payant, seul et signalé en
  jaune ;
- **コインロッカー** — la grille de consignes, trois tailles de portes,
  numérotées, avec sa borne de paiement ;
- **みどりの窓口 / 案内** — le comptoir vitré, sa banque, ses écrans.

## Phase 3 — Les commerces ✅

**Livré.**

- **NEWDAYS** — le konbini de gare : devanture vitrée pleine hauteur, bandeau
  d'enseigne allumé, portes coulissantes, gondoles et vitrine réfrigérée
  visibles au travers, caisse au fond ;
- **le kiosque du quai** cesse d'être une boîte blanche : auvent, présentoir à
  journaux et magazines, réfrigérateur à boissons, comptoir, bandeau d'enseigne.

## Phase 4 — Les distributeurs, tous ✅

**Livré.** `textures/vending` savait faire les boissons. Trois familles de plus,
sur la même caisse creusée :

- **アイス** — le bac à glaces, couvercle vitré horizontal et flanc réfrigéré ;
- **カップ麺** — nouilles et conserves, spirales visibles derrière la vitre ;
- **軽食** — snacks salés et sucrés, la machine des couloirs de correspondance.

Elles se posent aussi bien sur le quai que dans le hall, à la même caisse et au
même coût.

## Phase 5 — 駅スタンプ ✅

**Livré.** Le tampon de gare, sa table, son tampon encreur, son cahier — et
**trente dessins différents**, un par gare, tirés de ce que la gare a de
reconnaissable : le chien d'Hachikō à Shibuya, la porte de Kaminarimon nulle
part mais le pavillon du parc à Ueno, le tram à Ōtsuka, la halle de brique à
Tokyo. C'est le détail que les voyageurs viennent chercher, et il ne se
paramètre pas : c'est une table de trente lignes.

## Phase 6 — Le fléchage du hall ✅

**Livré, en partie.** Une gare japonaise se lit à trois couleurs et jamais à
autre chose : le jaune mène dehors, le blanc mène aux trains, le bleu mène aux
installations. Un voyageur qui ne lit pas un mot de japonais s'oriente sur la
couleur seule.

- **suspendu** — quatre caissons, et leur position est le message : celui qui
  accueille en bas des marches dit la sortie, celui du milieu les installations,
  celui qui suit les portillons les quais (à l'envers, pour qui arrive de la
  rue), le dernier vers quelle bouche aller. Ils se calent dans le passage
  RÉELLEMENT libre, lu dans l'implantation - centré bêtement, un panneau rentre
  dans le konbini, qui fait 3,20 m de fond et monte au plafond ;
- **mural** — le plan de quartier (周辺案内図) est posé, un par gare, avec sa
  trame de rues, son parc, sa rivière et son point rouge. Le plan de ligne, les
  tarifs et le plan des sorties numérotées restent à faire ;
- **au sol** — la bande de guidage mène du couloir au passage large. Les flèches
  peintes et les files d'attente restent à faire.

## Phase 7 — Les piliers, et ce qu'ils portent

**À faire.** Ils sont des boîtes nues, au quai comme au hall. Un pilier de gare
porte : habillage émaillé, cornières d'angle, plaque de nom de gare, affiches
portrait, coffret d'incendie, boîtier de caméra, chemin de câbles, et souvent un
banc adossé.

## Phase 8 — Les petits détails, et le désordre

**À faire.** Ce qui reste, et qui fait la différence entre un décor et un lieu :
poubelles de tri, porte-parapluies, extincteurs, DAE, miroirs de couloir,
plantes en bac, panneaux d'affichage de service, cônes de chantier, chariot de
ménage, rideaux de fer baissés hors des heures d'ouverture, traces d'usure au
sol devant les portillons.

## Phase 9 — Les commerces sous marque

**À faire.** `ecute` à Ueno et Shinagawa, `atré` à Meguro, Tabata et Ebisu :
ce ne sont pas des konbini mais des galeries, et elles changent la forme du
hall. À traiter avec les gares spéciales (`docs/STATION_INTERIOR.md`, phase 6).

---

## Ce qui ne doit pas grossir

Le hall est **du fond de champ** : on ne le voit que si l'on y est. Tout ce qui
est posé ici tombe au palier de qualité, et le budget se relève à la sonde
(`node scripts/station-probe.mjs`, `__probePerf`) plutôt qu'à l'estime. La règle
de départ : le niveau entier ne doit pas coûter plus cher que le quai qu'il
double.

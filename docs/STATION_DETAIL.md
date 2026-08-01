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
   construit une fois pour la session (`three/station/adPool`, et
   `three/station/shopKit` pour tout ce qui garnit un commerce).

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

Cette phase a posé les SILHOUETTES, et rien de plus : les deux commerces sont
refaits en volume à la **phase 10**, où leurs cotes et leur garniture sont
décrites. Ce qui suit ici n'a plus cours que comme point de départ.

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
  dans le konbini, qui fait 3,40 m de fond et monte au plafond ;
- **mural** — le plan de quartier (周辺案内図) est posé, un par gare, avec sa
  trame de rues, son parc, sa rivière et son point rouge. Le plan de ligne, les
  tarifs et le plan des sorties numérotées restent à faire ;
- **au sol** — la bande de guidage mène du couloir au passage large. Les flèches
  peintes et les files d'attente restent à faire.

## Phase 7 — Les piliers, et ce qu'ils portent ✅

**Livré.** Au quai comme au hall, et la règle est la même des deux côtés : la
trame porteuse passe AVANT le mobilier.

- **au quai** — socle de béton plus large que le fût, cornières d'inox sur les
  quatre arêtes jusqu'à 1,60 m (elles existent parce qu'on cogne les valises
  dedans, et ce sont elles qui attrapent la lumière rasante) ; le chapiteau,
  lui, a été abandonné : la poutre transversale POSE déjà sur le poteau et en
  tient lieu. La descente d'eau s'arrête maintenant SUR le socle, comme toute
  descente d'eau sur son ouvrage de pied ;
- **au hall** — une trame de pilastres engagés dans les deux parois, à 5,20 m
  d'entraxe. Elle est calculée avant le mobilier : un distributeur l'esquive,
  une devanture de plus de trois mètres l'enjambe et l'absorbe (le poteau passe
  derrière la vitrine, comme en vrai), et la travée des portillons en est
  exclue - elle est tenue par ses propres joues ;
- **et ce qu'ils portent** : une affiche portrait sur un pilastre sur deux.
  C'est là qu'un caisson se pose dans une gare, sur la face d'un poteau, et non
  en plein mur - les deux caissons flottants du hall ont disparu avec cette
  trame, qu'ils percutaient une fois sur trois.

## Phase 8 — Les petits détails, et le désordre ✅

**Livré, en partie.** Cinq familles de plus, rangées par le même moteur :

- **coffret d'extincteur** (rouge) et **armoire de défibrillateur** (verte) —
  même silhouette normalisée, seule la couleur les distingue, et c'est
  exactement ce qui permet de les repérer sans lire, y compris en courant ;
- **panneau d'affichage de service** — trois feuilles punaisées de travers :
  c'est le désordre qui fait le panneau ;
- **porte-parapluies** en zone libre, près des sorties ;
- **bac à plante** — trois masses de feuillage décalées et aplaties, jamais
  deux boules empilées : deux sphères sur un pot font un bonhomme de neige.

Ce qui est plaqué sur la paroi (coffrets, panneaux, plans) ne se contourne pas :
moins de vingt-cinq centimètres de saillie, on passe devant sans les toucher, et
en faire des obstacles rétrécirait le hall pour rien.

**Restent** : miroirs de couloir, cônes et chariot de ménage, rideaux de fer hors
des heures d'ouverture, traces d'usure au sol devant les portillons.

## Phase 9 — Les commerces sous marque ✅

**Livré.** Une galerie n'est pas un konbini plus long : elle s'ouvre par des
BAIES - trois travées vitrées séparées par des trumeaux - au lieu d'une seule
devanture, et son bandeau est long, bas, écrit en bas-de-casse fine avec le nom
de la gare à côté de la marque : `ecute 上野`, `atré 恵比寿`. Une galerie
appartient à sa gare, et c'est ce couple qui la distingue d'une boutique.

Sept gares en déclarent une, et la liste est **prudente et incomplète à
dessein** : n'y figurent que celles dont l'enseigne est établie. Une gare absente
n'affirme pas qu'elle n'a rien, elle affirme qu'on ne l'a pas relevé.

Tabata la déclare et ne l'obtient pas : 3,60 m de fond dans un hall de 5,50 m ne
laisseraient plus deux mètres de passage, et c'est la règle du passage libre qui
tranche - pas un oubli.

## Phase 10 — Les commerces, vraiment ✅

**Livré.** Les phases 3 et 9 avaient posé les SILHOUETTES : une devanture
vitrée sous une enseigne allumée, un auvent sur deux comptoirs. Elles se
lisaient de loin, et c'était leur objet. De près, elles ne tenaient pas : le
konbini n'avait aucune profondeur - son « fond de magasin » était un plan peint
à seize centimètres de la vitre - et le kiosque, à 2,50 × 4,80, était trop
petit pour ce qu'un kiosque contient. On les reconnaissait ; on ne les croyait
pas. À côté d'une rame dont on compte les rivets, c'était le contraste le plus
voyant qui restât dans une gare.

Les deux sont refaits en VOLUME. Ce qui change, et pourquoi :

- **le konbini est une pièce** (`three/station/Konbini`) : mur de vitrines
  réfrigérées au fond, meuble froid ouvert à onigiri, gondole centrale garnie
  des DEUX côtés, présentoir à magazines contre la vitre, comptoir de caisse
  avec écran client, bac à friture, machine à café, armoire à cigarettes au
  mur derrière, îlot promotionnel, pile de paniers, portes 自動ドア et cinq
  réglettes nues au plafond. Emprise : 6,40 × 3,20 → **7,80 × 3,40** ;
- **le kiosque est un îlot servi des deux bords** (`three/station/Kiosk`) :
  2,50 × 4,80 → **3,00 × 6,40**, et cette cote se déduit plutôt qu'elle ne se
  choisit - deux comptoirs de 0,80 m dos à dos plus 1,30 m de passage pour le
  vendeur. Dedans : étalage de journaux à plat, râteliers à magazines en
  gradins sous le comptoir côté client, paniers à hauteur de main, claie
  suspendue garnie jusqu'à l'auvent, armoire réfrigérée vitrée à un bout, épine
  de rangement entre les deux comptoirs (interrompue au droit de la caisse, par
  où le vendeur passe), auvent ÉPAIS dont la rive EST le bandeau d'enseigne,
  ceinturant les quatre faces ;
- **il est enfin centré sur l'épine**, comme les trémies et pour la même
  raison. Décalé de 1,35 m vers la voie comme il l'était, il ne laissait que
  vingt-cinq centimètres de passage à Takadanobaba, et le comptoir de ce
  côté-là donnait sur un mur d'air ;
- **un vendeur derrière chaque caisse** (`three/station/ShopStaff`). Une
  boutique garnie jusqu'au plafond mais vide ne se lit pas comme « le vendeur
  revient » : elle se lit comme un décor. C'est un VOYAGEUR qui tient la
  caisse — même chemin que les PNJ de la rame et la foule du quai (modèles GLB
  de `three/characters/library`, repli procédural, même frontière d'erreur),
  et non une silhouette à part : il n'a aucune raison d'avoir un autre
  gabarit, d'autres matériaux ni d'être le seul personnage du jeu qui ne
  respire pas. Son apparence est celle d'un voyageur, mise en uniforme — haut
  bleu NEWDAYS, bas anthracite, ni sac ni écharpe ;
- **la flaque de lumière** que chaque commerce jette au sol - peinte, non
  éclairée, et suivant la tombée du jour au quai comme les foyers de la voie.

**La marchandise est en volume, pas en image.** Les centaines d'articles en
rayon passent par un `InstancedMesh` et un seul appel de rendu par boutique
(`three/station/shopKit`), teintés par exemplaire, rangés par FACINGS - le même
article répété deux à cinq fois, comme dans un vrai linéaire. Un rayon où
chaque boîte diffère de sa voisine est un vide-grenier, pas un commerce.

**Les images sont mutualisées pour la session**, sur le modèle du pool
d'affiches : le même paquet de biscuits est sur la même étagère à Ueno et à
Shinagawa, et les redessiner à chaque arrivée en gare aurait coûté une
quarantaine de canvas par arrêt. Seul le bandeau d'enseigne appartient à la
gare - il porte son nom, `NEWDAYS 池袋`, comme les enseignes de galerie.

**Ce qui a été vérifié.** Sonde de gare sur les trente gares : zéro paire de
volumes en interpénétration (`node scripts/station-probe.mjs`). Et
`tests/stationShops.test.ts` tient les cotes de passage, que rien au rendu ne
montre : 1,20 m libre de chaque côté du kiosque, deux mètres dans le hall
devant le konbini, et aucune gare qui perde sa boutique en la voyant grandir -
3,40 m de fond est la dernière profondeur qui les garde toutes.

**Pour juger sur pièces :** `/shop-probe.html`, qui pose les deux commerces
seuls sous une caméra qu'on tourne autour. Le konbini est au fond du hall, deux
niveaux sous le quai, derrière une trémie, une ligne de portillons et quarante
mètres de couloir : descendre l'y chercher à chaque essai n'était pas tenable.

---

## Ce qui ne doit pas grossir

Le hall est **du fond de champ** : on ne le voit que si l'on y est. Tout ce qui
est posé ici tombe au palier de qualité, et le budget se relève à la sonde
(`node scripts/station-probe.mjs`, `__probePerf`) plutôt qu'à l'estime. La règle
de départ : le niveau entier ne doit pas coûter plus cher que le quai qu'il
double.

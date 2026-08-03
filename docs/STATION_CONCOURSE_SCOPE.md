# Ce que le chantier a livré, et ce qu'il n'a pas livré

Document de PORTÉE : ce qui est fait, ce qui est approché, ce qui reste à
vérifier. Il se lit avec `STATION_CONCOURSE_PLAN.md` (le découpage en phases) et
`STATION_CONCOURSE_EVIDENCE.md` (le relevé, plan par plan).

Date de référence architecturale et commerciale : **août 2026**.

---

## 1. Où en est chaque gare

`branchée` = la gare passe par son RELEVÉ (`data/stationConcourseWired`). Elles
le sont toutes depuis la phase 29 ; la colonne reste parce que la question se
reposera le jour où l'on ajoutera une gare ou une ligne.

`écarts` compte ce que `networkIssues` signale : lignes trop serrées, bouches
rétrécies, devantures rognées. **Un écart n'est pas un défaut caché — c'est un
défaut DIT.**

| code | gare | confiance | branchée | pièces | contrôles | sorties | corresp. | commerces | repères | travaux | écarts |
|---|---|---|---|---|---|---|---|---|---|---|---|
| JY01 | Tokyo | mostlyVerified | oui | 6 | 2 | 7 | 4 | 2 | 2 | oui | 0 |
| JY02 | Kanda | mostlyVerified | oui | 4 | 2 | 4 | 2 | 0 | 1 | — | 6 |
| JY03 | Akihabara | mostlyVerified | oui | 7 | 3 | 3 | 3 | 3 | 1 | — | 3 |
| JY04 | Okachimachi | approximate | oui | 6 | 2 | 2 | 0 | 0 | 1 | — | 2 |
| JY05 | Ueno | mostlyVerified | oui | 4 | 2 | 4 | 3 | 2 | 2 | oui | 0 |
| JY06 | Uguisudani | approximate | oui | 4 | 2 | 2 | 0 | 0 | 1 | — | 0 |
| JY07 | Nippori | mostlyVerified | oui | 6 | 2 | 3 | 3 | 1 | 1 | — | 1 |
| JY08 | Nishi-Nippori | approximate | oui | 3 | 1 | 2 | 4 | 1 | 1 | — | 3 |
| JY09 | Tabata | approximate | oui | 4 | 2 | 2 | 0 | 1 | 1 | — | 0 |
| JY10 | Komagome | mostlyVerified | oui | 4 | 2 | 3 | 1 | 1 | 1 | — | 2 |
| JY11 | Sugamo | mostlyVerified | oui | 2 | 1 | 3 | 1 | 2 | 1 | — | 3 |
| JY12 | Ōtsuka | mostlyVerified | oui | 2 | 1 | 2 | 1 | 0 | 1 | — | 0 |
| JY13 | Ikebukuro | mostlyVerified | oui | 4 | 4 | 2 | 4 | 2 | 2 | — | 0 |
| JY14 | Mejiro | mostlyVerified | oui | 3 | 1 | 2 | 0 | 0 | 1 | — | 0 |
| JY15 | Takadanobaba | mostlyVerified | oui | 4 | 2 | 2 | 2 | 0 | 1 | — | 1 |
| JY16 | Shin-Ōkubo | mostlyVerified | oui | 3 | 2 | 2 | 0 | 0 | 1 | — | 4 |
| JY17 | Shinjuku | mostlyVerified | oui | 7 | 4 | 9 | 4 | 3 | 2 | oui | 0 |
| JY18 | Yoyogi | mostlyVerified | oui | 4 | 2 | 3 | 3 | 0 | 1 | — | 3 |
| JY19 | Harajuku | mostlyVerified | oui | 4 | 2 | 3 | 1 | 1 | 1 | — | 2 |
| JY20 | Shibuya | mostlyVerified | oui | 4 | 4 | 4 | 4 | 0 | 1 | oui | 0 |
| JY21 | Ebisu | mostlyVerified | oui | 4 | 2 | 2 | 2 | 2 | 2 | — | 2 |
| JY22 | Meguro | mostlyVerified | oui | 3 | 1 | 2 | 1 | 2 | 1 | — | 2 |
| JY23 | Gotanda | mostlyVerified | oui | 3 | 1 | 2 | 2 | 3 | 1 | — | 4 |
| JY24 | Ōsaki | mostlyVerified | oui | 3 | 2 | 4 | 2 | 2 | 1 | — | 0 |
| JY25 | Shinagawa | mostlyVerified | oui | 3 | 2 | 2 | 3 | 1 | 2 | oui | 1 |
| JY26 | Takanawa Gateway | mostlyVerified | oui | 3 | 2 | 2 | 1 | 0 | 2 | — | 0 |
| JY27 | Tamachi | mostlyVerified | oui | 3 | 2 | 2 | 1 | 0 | 1 | oui | 1 |
| JY28 | Hamamatsuchō | mostlyVerified | oui | 4 | 2 | 2 | 2 | 0 | 2 | oui | 1 |
| JY29 | Shimbashi | mostlyVerified | oui | 7 | 3 | 4 | 4 | 0 | 2 | oui | 2 |
| JY30 | Yūrakuchō | mostlyVerified | oui | 6 | 4 | 5 | 1 | 2 | 2 | — | 7 |

**Les trente gares passent par leur relevé.** La volée de quai se
règle désormais sur ce qu'elle dessert (`data/stationGeometry.lowerFlightTo`) :
la seconde volée compte le nombre entier de contremarches qui tombe juste sur le
sol visé — vingt-deux pour descendre à −6,40 m sous les voies, six pour la
profondeur ordinaire — et la descente s'allonge de deux mètres vingt-cinq. Cela
a débloqué Tokyo, Ueno et Harajuku.

Les trois plus grandes gares de la boucle ont suivi (phase 24). Chacune était un
cas, et chacune a coûté une règle de plus au compilateur — mais une règle
générale, pas une exception nominative :

- **Ikebukuro** — la trouée la plus PROCHE plutôt que la plus large, sans quoi
  la file traversait la galerie Tōbu pour rejoindre l'axe d'en face ;
- **Shinjuku** — une ligne de portillons comble un jeu entre deux pièces, elle
  ne s'étire pas dans l'une d'elles : sa zone payante fait soixante-six mètres,
  et l'ancienne règle y enfonçait la ligne de dix ;
- **Shibuya** — les palissades du chantier de 2026 comptent parmi ce qui occupe
  une paroi, faute de quoi une bouche s'ouvrait dans les travaux.

**Okachimachi a suivi** (phase 29), et pour une raison qui n'était pas celle
qu'on croyait : son demi-niveau était posé « à mi-hauteur de la volée », soit
−1,84 m, au-dessus du palier de mi-étage où la volée de quai s'arrête. Or aucun
plan japonais ne cote une altitude — ce « à mi-hauteur » était une composition,
pas un relevé. Le palier existe déjà à −2,63 m : quinze contremarches sous le
quai, six au-dessus du 1F, exactement la seconde volée ordinaire. Le M2F est ce
palier-là élargi en plancher. Il n'y avait pas d'ouvrage à inventer, il y avait
une cote composée à remettre là où l'ouvrage tombe.

---

## 2. Ce qui est RELEVÉ, et ce qui est COMPOSÉ

La distinction court dans tout le chantier, et elle décide des arbitrages du
compilateur : **ce qui est relevé passe avant ce qui est composé.**

**Relevé** (lu sur un plan officiel, daté, cité dans `STATION_CONCOURSE_EVIDENCE`) :

- les niveaux et leur ordre ;
- les groupes de portillons, leur nombre de passages, leur nom, et les mentions
  qui changent ce qu'on peut y faire (carte sans contact seule, sortie seule,
  horaires) ;
- les sorties, leur nom et la zone libre dont elles partent ;
- les correspondances et leur direction ;
- les enseignes commerciales quand le plan les nomme ;
- les emprises de chantier d'août 2026 ;
- les repères du lieu, en toutes lettres.

**Composé** (le moteur décide, parce qu'aucun plan ne le donne) :

- **toutes les dimensions.** Les plans de gare japonais n'ont pas d'échelle :
  largeurs, longueurs et profondeurs sont déduites de la bande du quai et des
  cotes du moteur ;
- **le sens de l'axe z** d'une gare par rapport au plan ;
- **la position** des bouches sur leur paroi, des baies sur leur ligne, des
  seuils de correspondance sur leur mur ;
- **le mobilier**, entièrement : un plan officiel ne cote pas une batterie de
  distributeurs.

---

## 3. Les approximations qui restent, et pourquoi

1. **Vingt et une lignes de portillons ne tiennent pas leur compte de baies.**
   Dix-neuf sont posées en travers de la bande du quai, large de 5,3 à 6,7 m ;
   une baie coûte 0,98 m avec ses bornes, et le relevé en demande jusqu'à neuf.
   C'est le dernier reste de la contrainte G1 : les vrais halls de Kanda ou de
   Shimbashi sont larges comme le VIADUC, pas comme le quai. Les élargir demande
   de reculer la nappe de rue au droit de chaque gare — la phase 6 a établi que
   le décor sait le faire.
2. **Vingt-trois bouches sont rétrécies** sous leur cote nominale, faute de
   trumeau : une bouche rétrécit plutôt que de mordre sur sa voisine.
3. **Deux lignes sont cotées hors des pièces qu'elles séparent** (Ikebukuro sud,
   Shibuya Hachikō). Le compilateur ne les déplace pas — ce serait décider à la
   place du relevé — il refuse seulement de laisser croire qu'on les franchit.
4. **Deux devantures ont disparu** (Gotanda, Yūrakuchō) : deux vitrines de trois
   mètres de fond qui se font face dans un hall de six fermeraient le passage
   d'un mur à l'autre.
5. **Six devantures ne se dessinent pas encore** : le relevé les pose dans une
   pièce qu'on REGARDE sans y aller — GRANSTA depuis Tokyo, le Seibu depuis
   Ikebukuro, NEWoMan depuis Shinjuku. Dessiner une *vue* reste à faire.
6. **Quatre catégories de repères sur sept ne se dessinent pas**, et c'est
   délibéré : `ceiling` et `material` sont des qualités du volume, `trackView`
   est déjà l'archétype `overbridge`, `void` demande une emprise que le relevé ne
   donne pas.
7. **Le mobilier d'une gare branchée est plus maigre** que celui du hall
   générique : ses pièces sont plus courtes, et ce qui ne rentre pas disparaît
   plutôt que de ressortir par une paroi. Deux konbini sur trente n'ont plus la
   place.
8. **Trois enseignes lues ne sont pas dans `SPECS`** (atre vie à Sugamo, deux
   atre à Gotanda, Dila à Ōsaki). Les y ajouter changerait le hall GÉNÉRIQUE de
   trois gares — travail que leur branchement jette aussitôt. Le relevé les
   porte.

---

## 4. Ce qui reste à faire

**Le chantier est livré.** Trente gares sur trente passent par leur relevé.

Deux limites connues restent, écrites plutôt que masquées :

- **le mobilier ne tourne pas avec sa pièce.** Il se range contre la paroi qu'il
  regarde, repérée sur x — la profondeur du hall générique. Trois halls (Tokyo,
  Ikebukuro, Shibuya) se développent en X : « contre la paroi x1 » y désigne le
  pignon, et leur boutique se retrouve à trente-cinq mètres du trajet. Lui
  donner un axe demanderait de reprendre le rendu, le plan de konbini et la
  marche ;
- **deux lignes de portillons se partagent du sol à Shin-Ōkubo.** Leurs largeurs
  sont composées et demandent 5,80 m dans un hall qui en fait 5,20 ; le
  compilateur garde la cote du relevé et lève `gateOverlap` plutôt que de rendre
  un contrôle qu'on ne franchit pas ;
- **la ville entre dans les halls HAUTS**, et pas dans les autres. Le décor de
  tronçon ne s'écarte que du côté du quai ; depuis que des halls passent sous la
  voie, il s'écarte aussi de l'autre côté (`underNear`, six gares), ce qui a
  vidé Tokyo, Shinjuku et Shibuya. Restent les PLATEAUX — Ueno, Ōsaki,
  Shinagawa, Tamachi —, qui enjambent la voie huit mètres plus haut et
  s'avancent de quarante mètres au-dessus de la ville : là, des bâtiments se
  tiennent dans la zone libre. Étendre l'écartement à ces gares-là toucherait le
  décor de DIX-HUIT d'entre elles pour en réparer quatre, et cela ne se décide
  pas sans regarder les dix-huit ;
- **deux ouvrages mineurs entrent encore dans un hall**, relevés par
  `node scripts/station-inside.mjs` : un couvre-joint de douze centimètres à
  Shinagawa (le détail de mur n'a pas d'arase par tronçon, contrairement au mur
  qu'il habille) et une pile de la charpente de Takanawa Gateway qui traverse le
  plateau de part en part — c'est ce que fait une pile.

---

## 4 ter. Ce que le relevé coûte

Phase 28. Tout ce qui suit se refait en une commande —
`node scripts/concourse-cost.mjs [--gpu]` — et les chiffres de STRUCTURE sont
exacts et reproductibles ; les temps, non : ils dépendent de la machine, et
c'est pourquoi `tests/stationConcourseCost` tient un budget sur les premiers et
pas sur les seconds.

### Ce que le relevé ajoute, sur les trente gares

| poste | hall générique | relevé | écart |
|---|---:|---:|---:|
| pièces | 60 | 120 | +60 |
| pièces praticables | 58 | 62 | +4 |
| volumes | 29 | 31 | +2 |
| ouvrages de liaison | 0 | 13 | +13 |
| lignes de portillons | 30 | 63 | +33 |
| baies | 126 | 206 | +80 |
| bouches de sortie | 60 | 91 | +31 |
| **obstacles** | **799** | **804** | **+5** |
| meubles | 450 | 395 | −55 |
| devantures relevées | 0 | 28 | +28 |
| repères du lieu | 0 | 39 | +39 |

**La ligne qui compte est celle des obstacles : +5 sur 799.** C'est le seul poste
que la marche paie à chaque pas, et il n'a pas bougé — le relevé pose des
devantures, des palissades et des poteaux que le hall générique n'avait pas,
mais il pose aussi cinquante-cinq meubles de moins, faute de place. Les deux se
compensent presque exactement, et c'est ce fait-là qu'un test garde.

Le doublement des pièces (60 → 120) est ce que le chantier cherchait : les
soixante nouvelles sont les zones payantes secondaires, les mezzanines, les
ponts-concours et les volumes qu'on REGARDE sans y aller.

### Les trois coûts, et ils ne se comparent pas

| coût | quand on le paie | hall générique | relevé |
|---|---|---:|---:|
| compilation | une fois, au chargement | 0,6 ms pour trente gares | **11 ms** pour trente gares |
| marche (`walkerBlocked` + `concourseFloorAt`) | à chaque image, par voyageur | 3,4 M appels/s | **3,1 M appels/s** |
| itinéraire | une fois par voyageur | — | **146 µs**, 37 étapes |

La compilation est vingt fois plus chère et **cela n'a aucune importance** :
onze millisecondes une fois au chargement, contre quatre secondes de tour de
boucle entre deux gares. L'essentiel du temps part dans `fittedFixtures`, qui
essaie chaque meuble contre chaque pièce et le fait glisser de proche en proche.
La plus longue est Ikebukuro, à 0,9 ms.

La marche perd 8 %, ce qui est le prix de cinq obstacles de plus et de la
recherche de pièce qui a remplacé une boîte unique. Sur les quelque huit mille
appels par seconde que la foule d'une gare consomme réellement, cela représente
trois millisecondes par heure.

### Le rendu : ce n'est PAS la taille du hall qui coûte

Appels de dessin et triangles, relevés au milieu de la zone payante, sous
SwiftShader — ces deux chiffres-là ne dépendent pas de la carte graphique, le
temps par image si, et il n'est donc pas relevé.

| gare | appels | triangles | maillages visibles |
|---|---:|---:|---:|
| JY16 Shin-Ōkubo | 1 410 | 536 939 | 1 959 |
| JY12 Ōtsuka | 690 | 266 419 | 1 987 |
| JY09 Tabata | 474 | 262 634 | 2 604 |
| JY07 Nippori | 322 | 181 407 | 2 829 |
| JY19 Harajuku | 441 | 124 636 | 3 035 |
| JY25 Shinagawa | 207 | 59 628 | 2 935 |
| JY13 Ikebukuro | 162 | 55 850 | 3 206 |
| JY01 Tokyo | 165 | 55 029 | 3 487 |

**La liste est presque exactement l'inverse de celle des tailles.** La plus
petite gare du relevé coûte huit fois plus que la plus grande, et ce n'est pas
un défaut : c'est l'occlusion interne (`visibleShells`, phase 17) qui fonctionne.
Un grand hall souterrain FERME la vue — on n'y voit que lui — tandis que le
souterrain court de Shin-Ōkubo laisse voir sa passerelle, le faisceau, la rame
et la ville derrière. Ce qu'une gare coûte à dessiner n'est pas ce qu'elle
contient, c'est ce qu'elle LAISSE VOIR.

Corollaire pratique : il n'y a rien à optimiser du côté des grandes gares. Le
budget de rendu se joue sur les gares ouvertes, et il se jouait déjà là avant le
chantier.

---

## 4 bis. Ce que les trois commandes disent

Exigence #18 du cahier des charges, relevée à la phase 26 :

| commande | résultat |
|---|---|
| `npm test` | **553 tests, 0 échec** (538 à la phase 26 ; +3 au budget de la phase 28, +4 aux percées de plateau, voir §4.28 du plan) |
| `npm run build` | `tsc -b && vite build` — aucune erreur |
| `npm run lint` | `oxlint` — 0 erreur ; 21 avertissements, tous dans `.tmp/announcements/announcements-export.mjs`, un fichier généré antérieur au chantier |

La matrice qui associe chacune des dix-huit exigences à ses tests vit en tête de
`tests/stationRequirements.test.ts` — au plus près de ce qu'elle décrit, et non
dans un document qui dériverait le jour où un test change de nom.

---

## 5. Les questions ouvertes du relevé

Cent questions, notées gare par gare au moment de la lecture des plans. Elles ne
bloquent rien : chacune désigne un endroit où le dépôt a choisi une convention
plutôt que de deviner, et où un plan mieux lu la corrigerait.

- **JY01 Tokyo** — Le hall passe SOUS LA VOIE, et non sous le quai : la volée dessinée aujourd’hui (`DESCENT_LEN`) n’y descend pas. Il lui faut une volée plus longue — phase 7.
- **JY01 Tokyo** — Le niveau des Marunouchi Exits n’est pas explicité : le plan porte aussi « for Marunouchi (Underground) », donc un débouché souterrain distinct, non cartographié.
- **JY01 Tokyo** — De quel côté du repère quai se tient Marunouchi ? Le plan a un ouest, le dépôt a un −x : l’appariement n’est pas établi. Convention retenue ici, et à corriger si elle se démontre fausse.
- **JY01 Tokyo** — Ni Tokyo Metro Marunouchi ni les correspondances hors JR ne sont cartographiés.
- **JY02 Kanda** — Le plan n’attribue aucun nom aux deux groupes ; 改札口 est la valeur prudente, pas un relevé de panneau.
- **JY02 Kanda** — Le nombre de baies par groupe n’est pas lisible sur le document.
- **JY02 Kanda** — Les commerces sous les arches sont hors emprise JR : ils ne figurent pas au profil, et c’est volontaire.
- **JY03 Akihabara** — Les noms japonais viennent de l’édition anglaise du plan par concordance de panneau ; seul 電気街口 est déjà relevé au dépôt.
- **JY03 Akihabara** — Les feuilles 2F-M3 et 3F n’ont pas été dépouillées en détail : la géométrie de la Chūō-Sōbu est une mise en place, pas un relevé.
- **JY03 Akihabara** — Le plan date de janvier 2026, sept mois avant la référence.
- **JY04 Okachimachi** — Le plan date de janvier 2024 : plus de deux ans avant la référence, le plus grand écart du relevé, et la seule raison de la confiance `approximate`.
- **JY04 Okachimachi** — Le nombre de baies par groupe n’est pas lisible.
- **JY04 Okachimachi** — Ameyoko est un marché de rue hors emprise JR : il ne figure pas au profil, et ne doit pas y entrer.
- **JY05 Ueno** — Le Central Gate (中央改札) et le Shinobazu Gate (不忍口) sont hors cadrage : le dépôt les déclare, le plan ne les contredit pas, leur niveau reste à établir.
- **JY05 Ueno** — ⚠ Le plan place les voies 1 à 12 au 2F, alors que `data/stationLayouts` donne Ueno en `elevation: ground`. Rien n’a été modifié : `elevation` commande le rendu du quai, et cela déborde de ce chantier.
- **JY05 Ueno** — La feuille B4-B1 (Shinkansen, Tokyo Metro) n’a pas été dépouillée.
- **JY06 Uguisudani** — Le hall passe SOUS LA VOIE, et non sous le quai : la volée dessinée aujourd’hui (`DESCENT_LEN`) n’y descend pas. Il lui faut une volée plus longue — phase 7.
- **JY06 Uguisudani** — ⚠ Le plan date de juin 2022, quatre ans avant la date de référence — de très loin le plus ancien du relevé, et la seule raison de la confiance `approximate`.
- **JY06 Uguisudani** — Uguisudani est la seule gare que la série « Guide Maps for Major Stations » ne couvre pas.
- **JY06 Uguisudani** — La longueur réelle du 地下通路 n’est pas cotée : l’emprise ci-dessus est une mise en place.
- **JY07 Nippori** — ⚠ Le plan date d’avril 2025, seize mois avant la référence : le plus grand écart du relevé après Uguisudani et Okachimachi.
- **JY07 Nippori** — Le West Exit que le dépôt attendait n’apparaît pas sous ce nom ; le document nomme East Exit, East Exit Square et le Free Passage (Over Tracks).
- **JY07 Nippori** — Le niveau 3F (Toneri Liner) est fléché mais pas cartographié : sa cote est extrapolée.
- **JY08 Nishi-Nippori** — Le plan date de février 2024.
- **JY08 Nishi-Nippori** — Les niveaux Chiyoda et Toneri Liner ne sont pas cartographiés : leur position relative au JR est extrapolée.
- **JY08 Nishi-Nippori** — Le plan ne nomme aucune sortie ; les noms viennent de `data/lines`, où ils sont marqués comme non relevés.
- **JY09 Tabata** — Le plan date de février 2024.
- **JY09 Tabata** — Le plan ne montre aucune galerie au-delà d’atre vie : aucune ne doit être forcée.
- **JY09 Tabata** — Le nombre de baies par groupe n’est pas lisible.
- **JY10 Komagome** — Le plan date de septembre 2025.
- **JY10 Komagome** — Aucun des deux contrôles n’est nommé ; le dépôt tenait 北口改札, que le plan ne confirme pas.
- **JY11 Sugamo** — Le plan date de septembre 2025.
- **JY11 Sugamo** — Le contrôle n’est pas nommé ; le dépôt tenait 北口改札, non confirmé.
- **JY12 Ōtsuka** — Le plan date de septembre 2025.
- **JY12 Ōtsuka** — Le contrôle n’est pas nommé ; le dépôt tenait 北口改札, non confirmé.
- **JY12 Ōtsuka** — Aucun atre vie n’est cartographié — ce qui n’est pas une preuve d’absence, mais interdit d’en poser un.
- **JY13 Ikebukuro** — Le hall passe SOUS LA VOIE, et non sous le quai : la volée dessinée aujourd’hui (`DESCENT_LEN`) n’y descend pas. Il lui faut une volée plus longue — phase 7.
- **JY13 Ikebukuro** — Le plan est de février 2026, six mois avant la référence.
- **JY13 Ikebukuro** — Ni le Seibu Ikebukuro, ni les lignes Yūrakuchō / Fukutoshin ne sont cartographiés : le document est JR + Tōbu + Marunouchi.
- **JY13 Ikebukuro** — Aucun aplat « large store inside the ticket gates » : rien derrière les portillons, et c’est un fait de relevé.
- **JY13 Ikebukuro** — Les noms japonais des passages (オレンジロード, アップルロード…) viennent de l’édition anglaise par concordance, et restent à confirmer.
- **JY14 Mejiro** — Le plan date de septembre 2025.
- **JY14 Mejiro** — Le contrôle n’est pas nommé ; le dépôt tenait 中央改札, non confirmé.
- **JY14 Mejiro** — Aucune sortie nommée n’apparaît dans le cadrage : les deux noms viennent de `data/lines`, marqués non relevés.
- **JY14 Mejiro** — Le renvoi « for Shops (2F) » ne porte aucune enseigne : le niveau est déclaré, son contenu non.
- **JY15 Takadanobaba** — Le plan date de juin 2026, deux mois avant la référence.
- **JY15 Takadanobaba** — Les noms japonais viennent de l’édition anglaise par concordance ; 早稲田口 est déjà au dépôt et le plan le corrobore comme nom de SORTIE.
- **JY16 Shin-Ōkubo** — Le plan date de septembre 2025.
- **JY16 Shin-Ōkubo** — Le contrôle n’est pas nommé ; le dépôt tenait 中央改札, non confirmé.
- **JY16 Shin-Ōkubo** — Aucune sortie nommée : les deux noms de `data/lines` sont marqués non relevés.
- **JY16 Shin-Ōkubo** — Le renvoi « for Station Building (2F) » ne porte aucune enseigne.
- **JY17 Shinjuku** — Le hall passe SOUS LA VOIE, et non sous le quai : la volée dessinée aujourd’hui (`DESCENT_LEN`) n’y descend pas. Il lui faut une volée plus longue — phase 7.
- **JY17 Shinjuku** — Le cadrage ne montre pas l’implantation exacte des East Gate et West Gate (B1F) : leurs noms et leur niveau sont établis par les brackets du plan de quais, leur géométrie non.
- **JY17 Shinjuku** — Le plan est celui de JR seul : ni Tokyo Metro Marunouchi, ni Seibu Shinjuku, ni les numéros de sortie Metro n’y figurent.
- **JY17 Shinjuku** — Les noms japonais des neuf groupes ne sont pas sur cette édition anglaise.
- **JY17 Shinjuku** — Cinq des neuf groupes ne sont pas modélisés ici : East, West, South, Kōshū-kaidō et MIRAINA TOWER sont attestés par les brackets, mais non situés.
- **JY18 Yoyogi** — Le plan date de janvier 2026.
- **JY18 Yoyogi** — ⚠ L’appariement voies ↔ îlots n’est pas résolu à la résolution fournie : le relevé du dépôt (`sharedIsland` avec la Chūō-Sōbu) n’est ni confirmé ni contredit.
- **JY18 Yoyogi** — Le plan nomme les SORTIES (North, West, East), pas les contrôles : les noms de groupes ci-dessus suivent la concordance de panneau.
- **JY19 Harajuku** — Le hall passe SOUS LA VOIE, et non sous le quai : la volée dessinée aujourd’hui (`DESCENT_LEN`) n’y descend pas. Il lui faut une volée plus longue — phase 7.
- **JY19 Harajuku** — Le plan date de septembre 2025 : onze mois avant la référence.
- **JY19 Harajuku** — La ligne Metro en correspondance n’est pas nommée sur le document ; les deux clés ci-dessus sont une lecture de voisinage, pas un relevé.
- **JY19 Harajuku** — Aucun aplat de grand commerce : les boutiques du quartier ne sont pas dans la gare, et le plan le confirme.
- **JY20 Shibuya** — Le hall passe SOUS LA VOIE, et non sous le quai : la volée dessinée aujourd’hui (`DESCENT_LEN`) n’y descend pas. Il lui faut une volée plus longue — phase 7.
- **JY20 Shibuya** — ⚠ Le plan est de juin 2026, la référence est août 2026. Sur une gare qui bouge tous les trimestres, deux mois déplacent une palissade ou rouvrent un passage.
- **JY20 Shibuya** — Le New South Gate est très loin au sud, séparé du reste : il n’est pas modélisé ici, faute de pouvoir le situer.
- **JY20 Shibuya** — Les niveaux Ginza (au-dessus) et Tōkyū / Metro (en dessous) sont absents du document : leur position relative reste à établir.
- **JY20 Shibuya** — Les noms japonais des groupes ne sont pas sur cette édition anglaise.
- **JY21 Ebisu** — Le plan date de septembre 2025.
- **JY21 Ebisu** — Le Yebisu Skywalk est fléché, pas cartographié : sa longueur reste inconnue. Ce n’est pas une ligne, donc pas un portail de correspondance — il est porté par un repère.
- **JY21 Ebisu** — Les noms japonais 東口 / 西口 viennent de l’édition anglaise par concordance.
- **JY22 Meguro** — Le plan date de septembre 2025.
- **JY22 Meguro** — Le cadrage ne montre qu’un seul groupe de portillons ; un côté ouest éventuel n’est pas dans le champ.
- **JY22 Meguro** — La feuille B3-B2 n’a pas été dépouillée : la cote de -12,9 m est extrapolée d’une hauteur d’étage ordinaire.
- **JY23 Gotanda** — Le plan date de septembre 2025.
- **JY23 Gotanda** — Le 3F n’apparaît pas : l’onglet couvre 1F-4F mais le plan ne montre que 1F, 2F et 4F. Ce qui occupe le 3F reste inconnu.
- **JY23 Gotanda** — Les noms japonais ne sont pas sur cette édition anglaise.
- **JY24 Ōsaki** — Le plan date d’avril 2026.
- **JY24 Ōsaki** — Les quatre débouchés (New West, West, East, New East) sont des SORTIES, pas des contrôles : les seuls contrôles sont South Gate et North Gate.
- **JY24 Ōsaki** — Les noms japonais ne sont pas sur cette édition anglaise.
- **JY25 Shinagawa** — ⚠ Il n’y a pas de voie 2 : la voie Yamanote intérieure a une face de quai POUR ELLE SEULE, tandis que l’extérieure partage son îlot avec la Keihin-Tōhoku. Le dépôt décrit Shinagawa par un unique `config: sharedIsland` : cette asymétrie ne s’y exprime pas, et elle se tranche hors de ce chantier.
- **JY25 Shinagawa** — Le plan date de juillet 2026, un mois avant la référence.
- **JY25 Shinagawa** — Les noms japonais ne sont pas sur cette édition anglaise.
- **JY26 Takanawa Gateway** — ⚠ Le plan date de septembre 2025, alors que Takanawa Gateway City s’ouvre par tranches : les commerces et les liaisons de dalle d’août 2026 ne peuvent pas y être lus.
- **JY26 Takanawa Gateway** — Le 3F Deck est fléché mais pas cartographié : sa cote est extrapolée.
- **JY26 Takanawa Gateway** — Les noms japonais des deux groupes ne sont pas sur cette édition.
- **JY27 Tamachi** — Le plan date d’avril 2026, quatre mois avant la référence, sur une gare en travaux.
- **JY27 Tamachi** — Le 3F est fléché mais pas cartographié : c’est probablement le deck côté Shibaura, sans confirmation.
- **JY27 Tamachi** — Les noms japonais 三田口 / 芝浦口 restent à confirmer.
- **JY28 Hamamatsuchō** — Le plan date de juin 2026, deux mois avant la référence, sur une gare en travaux au sud.
- **JY28 Hamamatsuchō** — Le World Trade Center n’apparaît pas nommément sur le plan.
- **JY28 Hamamatsuchō** — Les noms japonais ne sont pas sur cette édition anglaise.
- **JY29 Shimbashi** — Le plan date de septembre 2025, onze mois avant la référence.
- **JY29 Shimbashi** — Le nombre exact de baies par groupe n’est pas lisible.
- **JY29 Shimbashi** — Les niveaux B2F et B3F ne sont pas cartographiés : le vide entre le B1F et le B4F est un fait de document, pas une mesure.
- **JY29 Shimbashi** — Karasumori est ici une SORTIE, pas un portillon — même piège qu’à Harajuku, corrigé au dépôt en phase 3.
- **JY30 Yūrakuchō** — Le plan date de septembre 2025.
- **JY30 Yūrakuchō** — Le Ginza Exit n’est pas dans le cadrage du 1F ; seul son bracket de quai l’atteste, et il n’est donc pas modélisé.
- **JY30 Yūrakuchō** — Les noms japonais ne sont pas sur cette édition anglaise.
- **JY30 Yūrakuchō** — Le Kyōbashi Exit est attesté mais non situé : il appartient au même ensemble que l’International Forum.

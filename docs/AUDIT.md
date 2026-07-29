# Audit — bugs et incohérences

Relevé au 29 juillet 2026, sur `claude/yamanote-3d-audit-e5d99a` (base `57bf4b1`).

## Méthode et état de l'outillage

Tout l'outillage est vert, et c'est le point de départ de cet audit : les défauts
relevés ici ne sont attrapés par aucune des barrières existantes.

| Vérification | Résultat |
| --- | --- |
| `tsc -b` | 0 erreur |
| `oxlint` | 0 signalement |
| `npm test` | 131 / 131 |
| `vite build` | réussi (2,38 Mo en un seul chunk) |
| Chemins `/audio/*` référencés vs disque | 19 / 19 présents, 0 manquant |
| Cohérence `STATIONS` × `platforms` × `segments` × `loop` | aucune divergence |

À quoi se sont ajoutées :

- une relecture des systèmes (cycle station, portes, embarquement, quai,
  voyageurs, dialogue, météo, saison, sono) et de l'interface ;
- des scripts de recoupement de données lancés sur les modules réels ;
- **une session pilotée dans Chromium** (build de production puis serveur de
  développement) : embarquement, tour de boucle, arrêt d'urgence, coupure de
  caténaire, descente sur le quai. C'est elle qui a livré le défaut n° 1, que ni
  la relecture ni les tests ne pouvaient voir.

Sévérité : **A** = casse l'expérience, **B** = contradiction franche,
**C** = à corriger, **D** = propreté.

---

## A1 — Les portes se désynchronisent du cycle sous 20 images/seconde

`src/three/Engine.tsx:42-44`, `:101-125`

La boucle sépare deux pas de temps :

```ts
const CYCLE_DT_CAP = 5;     // le cycle station avance en temps réel
const PHYS_DT_CAP  = 0.05;  // portes / voyageurs / audio : 0,05 s par IMAGE
...
const cycleDt = skipCycle ? 0 : Math.min(raw, CYCLE_DT_CAP);
const physDt  = Math.min(raw, PHYS_DT_CAP);
```

`physDt` n'est pas un sous-pas : c'est un **plafond appliqué une seule fois par
image**. En dessous de 20 fps (1 / 0,05), l'animation des portes n'avance donc
plus qu'à la fraction `fps / 20` du temps réel, pendant que `updateCycle`, lui,
consomme tout le temps écoulé. L'écart n'est pas borné : il grandit tant que le
cadre reste bas.

Mesuré en session réelle (rendu logiciel, ~0,35 fps — cas extrême, mais le
mécanisme est linéaire à partir de 20 fps) :

```
fps=0.3  phase=à quai     phaseT=39.8  doorT=0.7 (cible 1)  doorOpen=0.19  v=0
fps=0.3  phase=à quai     phaseT=48.7  doorT=0.1 (cible 0)  doorOpen=0.99  v=0   <- saut
fps=0.3  phase=départ     phaseT=13.3  doorT=0.3 (cible 0)  doorOpen=0.76  v=10.6
fps=0.4  phase=en route   phaseT=17.2  doorT=0.8 (cible 0)  doorOpen=0.30  v=23.6
fps=0.4  phase=en route   phaseT=24.3  doorT=1.0 (cible 0)  doorOpen=0.15  v=25.0
```

Trois conséquences, toutes visibles :

1. **La rame roule à 90 km/h portes ouvertes.** `portalOpen()`
   (`systems/walkable.ts:88-100`) interdit bien de FRANCHIR le seuil en marche,
   mais les vantaux, eux, sont toujours dessinés à 30–76 % d'ouverture.
2. **Le vantail saute.** À l'ordre de fermeture, `setTrainDoors(0)` remet
   `doorT` à 0 et `trainDoorPos` repart de `1 − movePos(0)` : la porte téléporte
   de 0,19 à 0,99 d'ouverture en une image (`systems/doorMotion.ts:89-93`,
   `:332-338`). Le profil suppose que le mouvement précédent était terminé.
3. **On ne peut plus descendre.** Le seuil exige `doorOpen ≥ 0.55`
   (`PORTAL_MIN_OPEN`). Dans la trace ci-dessus, l'ouverture plafonne à 0,19 sur
   tout l'arrêt : la porte n'est jamais franchissable, et le joueur reste
   enfermé dans la rame pour toute la session.

Le seuil de 20 fps n'est pas théorique : la qualité par défaut est `ultra`
(`systems/perf.ts:56`, aucune détection automatique) sur une scène qui porte
224 m de quai, la ville et plusieurs dizaines de PNJ.

Les mêmes appels sont concernés : `updateDoorObstruction`, `updatePassengers`,
`updatePlatformCrowd`, `updateConversation`, `updateAmbience`, `updateAudio`.

**Correction.** Sous-pas plutôt que plafond, comme le fait déjà `integrateTrain`
(`systems/trainPhysics.ts:136-145`) :

```ts
for (let left = cycleDt; left > 1e-6; left -= PHYS_DT_CAP) {
  const step = Math.min(PHYS_DT_CAP, left);
  updateDoorMotion(step);
  updateDoorObstruction(step);
  ...
}
```

---

## B1 — Le côté d'ouverture contredit le plan de voies pour 13 gares sur 30

`src/data/stations.ts:54-63` vs `src/data/stationLayouts.ts`

Le code énonce la règle deux fois, en toutes lettres — dans `data/stations.ts`
et à nouveau dans `data/loop.ts:14-20` :

> « sur un îlot central les deux sens ouvrent à droite, sur deux quais latéraux
> les deux ouvrent à gauche »

C'est juste : le Japon roule à gauche, un îlot entre les deux voies se présente
donc à droite de chaque rame, deux quais latéraux à gauche. Or `DOOR_SIDE` et
`stationLayouts.config` ne s'accordent que pour 17 gares :

| Gare | `config` | `DOOR_SIDE` | attendu par la règle |
| --- | --- | --- | --- |
| Kanda | `island` | −1 | +1 |
| Ueno | `sharedIsland` | −1 | +1 |
| Nippori | `sharedIsland` | −1 | +1 |
| Komagome | `island` | −1 | +1 |
| Mejiro | `island` | −1 | +1 |
| Shin-Ōkubo | `island` | −1 | +1 |
| Yoyogi | `sharedIsland` | −1 | +1 |
| **Harajuku** | `side` | **+1** | **−1** |
| Ebisu | `island` | −1 | +1 |
| Gotanda | `island` | −1 | +1 |
| Takanawa Gateway | `island` | −1 | +1 |
| Hamamatsuchō | `sharedIsland` | −1 | +1 |
| Yūrakuchō | `sharedIsland` | −1 | +1 |

Les deux tables sont consommées ensemble : `three/station/Station.tsx:91-92`
retourne toute la gare selon `DOOR_SIDE[platformIndex]`, et construit son fond de
travée selon `config`. Une gare déclarée `sharedIsland` — donc censée montrer la
voie Keihin-Tōhoku de l'autre côté de l'îlot — se retrouve rendue avec ses
portes du côté opposé à ce que son plan de voies implique. Le rendu reste
géométriquement cohérent (c'est un miroir), mais l'une des deux tables est
fausse pour ces treize gares, et le commentaire qui prétend les relier est
inapplicable.

À noter que `DOOR_SIDE` a l'allure d'une alternance décidée pour la variété
visuelle (19 fois à droite, 11 à gauche, en alternance quasi régulière) plutôt
que d'un relevé. Si c'est le cas, c'est `DOOR_SIDE` qu'il faut dériver de
`config`, et le commentaire de `stations.ts` deviendra vrai au lieu d'être un
vœu.

---

## B2 — Les touches du jeu restent actives dans les champs du menu de départ

`src/three/Player.tsx:75-87`

L'écouteur `keydown` est posé sur `window` sans regarder ni `started` ni la cible
de l'événement, alors que `<Player />` est monté dès le premier rendu
(`App.tsx:90`) et que `StartScreen` présente deux `<input>` et trois `<select>`.

Vérifié en session, curseur dans le champ **date** de l'écran de démarrage :

```
avant :  { muted: false, started: false }   { keys: [], talk: false }
après M/E/Espace : { muted: true, started: false }   { talk: true }
après F : document.fullscreenElement = true
```

- **M** coupe le son avant même d'embarquer, sans HUD pour le montrer : on monte
  dans un jeu muet sans savoir pourquoi.
- **F** fait basculer le navigateur en plein écran pendant la saisie.
- **Espace** appelle `e.preventDefault()` sans condition (`:78-81`) : la touche
  qui déroule un `<select>` est neutralisée sur les sélecteurs gare, sens et
  qualité.
- **E** arme `talkRequest`.

Le même défaut vaut HUD affiché : régler le volume au clavier
(`Hud.tsx:197-207`) ajoute `ArrowLeft`/`ArrowRight` à `input.keys` et fait
marcher le joueur de côté pendant qu'il déplace le curseur.

**Correction.** Sortir tôt si `event.target` est un champ de saisie
(`INPUT`/`SELECT`/`TEXTAREA`/`isContentEditable`), et n'agir sur `KeyM`/`KeyF`/
`KeyE`/`Space` que si `started`.

---

## B3 — Les touches restent enfoncées après une perte de focus

`src/three/Player.tsx:77-88`, `src/systems/input.ts:6`

`input.keys` n'est vidé que par `keyup`. Aucun écouteur `blur` ni
`visibilitychange` ne le remet à zéro — `Engine.tsx:57-61` en pose un, mais pour
le seul `tabJustResumed`.

Vérifié en session :

```
[C] touches encore enfoncées après window.blur : ["KeyW"]
```

Alt-Tab (ou Cmd-Tab, ou un clic hors de la page) touche de marche enfoncée, et le
`keyup` part dans une autre fenêtre : au retour, le joueur marche seul, sans
fin, jusqu'à ce qu'on represse puis relâche la touche. Le cas est fréquent —
c'est exactement le geste de quelqu'un qui va lire ses messages en laissant le
train rouler.

**Correction.** `window.addEventListener('blur', () => input.keys.clear())`, et
la même chose au `visibilitychange` et à la sortie du verrou de pointeur.

---

## C1 — Trois mélodies sur dix-neuf ne peuvent jamais sonner

`src/systems/runtime.ts:181`, `src/systems/departureSequence.ts:153-165`

`runtime.useAlternativePlatform` est **déclaré, lu quatre fois, jamais écrit** :
aucun `= true` n'existe dans le dépôt. `resolvePlatform()` rend donc toujours la
voie principale, et les mélodies câblées sur les voies secondaires sont
inatteignables. Énumération des 60 couples (gare × sens) contre le manifeste :

```
clips au manifeste : 19 | atteignables en jeu : 16
CLIPS INJOUABLES :
  - /audio/melodies/03_jre-ikst-010-03_inner-secondary-osaki.mp3   (Ōsaki 内 voie 2)
  - /audio/melodies/04_jre-ikst-010-05_outer-secondary-osaki.mp3   (Ōsaki 外 voie 4)
  - /audio/melodies/18_bic-camera-theme-a.mp3                      (Ikebukuro 内 voie 5)
```

Les trois redeviennent jouables dès que le drapeau est posé. Trois fonctions
complètes de `departureSequence.ts` (`playOsakiInnerSecondaryMelody`,
`playOsakiOuterSecondaryMelody`, `playIkebukuroInnerBicCameraA`) et leurs
prédicats dans `melodies.ts` sont donc du code mort, ainsi que les deux
`alternativePlatform` de `data/platforms.ts`.

Même situation pour `runtime.terminusStop`, `runtime.outOfService` et
`runtime.autonomousDepartureSequence` : jamais posés, alors qu'ils commandent
`serviceTypeFromRuntime()`, `serviceStateFromRuntime()` et toute la queue de
`startDepartureSequence()`.

---

## C2 — Ordre des annonces inversé entre Mejiro et Takadanobaba

`src/data/segments.ts:104`, `src/systems/stationCycle.ts:533`, `:944-1002`

Le tronçon 13 porte un intervalle d'**une** minute, seul de la boucle :

```ts
/* 13 Mejiro→Takadanobaba */ 1,
```

`cruiseDuration` en retire le forfait `departTime + brakeTime + dwellTime` = 61 s
et bute sur son plancher : **8 s de croisière**, contre 59 ou 119 s partout
ailleurs. Or l'annonce d'approche part `APPROACH_ANNOUNCE_LEAD = 20` s avant la
fin de la croisière :

```ts
once('announce-soon', t >= cruiseSec - APPROACH_ANNOUNCE_LEAD, ...)  // 0 >= −12 → vrai
once('announce-depart', t > 0.6, ...)                                 // 0,6 s plus tard
```

La condition est donc déjà vraie à la première image de la croisière : la file
`cabin` reçoit 「まもなく高田馬場」 **avant** 「次は、高田馬場」, et les joue dans
cet ordre. Les deux sens sont touchés (arrivée à Takadanobaba en 内回り, arrivée
à Mejiro en 外回り).

L'intervalle réel Mejiro ↔ Takadanobaba est de 2 minutes ; la valeur 1 semble
être une coquille de saisie, et la corriger règle le symptôme *et* la donnée.
Une garde reste souhaitable (`Math.max(0.8, cruiseSec − LEAD)`), sans quoi tout
raccourcissement futur d'un intervalle rouvrira le défaut.

---

## C3 — La table des jours fériés expire fin 2027

`src/data/occupancy.ts:232-288`

`HOLIDAYS` est un ensemble littéral de dates 2025–2027. Le menu propose par
défaut la date réelle à Tokyo (`StartScreen.tsx:102`) et l'horloge du monde
avance les jours d'elle-même (`runtime.advanceClock`). À partir du
1er janvier 2028, `isJapaneseHoliday()` rendra faux pour les seize jours fériés
de l'année : `morningMatrixFactor` prendra la colonne du jour ouvrable au lieu
de celle du dimanche, et le remplissage annoncé sautera d'environ 0,35 à 1,0 —
un 元日 rendu comme un mardi de pointe. Aucun test ne couvre ce basculement.

Trois issues : dériver les fériés par la règle (les fêtes japonaises sont
calculables, y compris les 振替休日 et le 国民の休日), prolonger la table avec un
test de fraîcheur qui échoue quand la dernière année couverte approche, ou au
minimum retomber sur un profil « week-end » hors de la plage connue.

---

## C4 — Bouton plein écran à sens unique

`src/ui/Hud.tsx:216-222`, `src/three/Player.tsx:84-86`

Les deux chemins n'appellent que `requestFullscreen()`. Le bouton du HUD reste
affiché une fois en plein écran et ne fait plus rien ; **F** non plus. Le
README (« F : plein écran ») laisse pourtant attendre une bascule. Il manque le
`document.exitFullscreen()` quand `document.fullscreenElement` est posé.

---

## C5 — `walkable` lit un côté d'ouverture que le reste du rendu ne lit pas

`src/systems/walkable.ts:136`, `:166`, `:200`, `:206`, `:246`, `:259`, `:279`

Tout ce qui touche au repère du quai passe par `DOOR_SIDE[platformIndex]` — le
rendu de la gare (`Station.tsx:92`), la foule (`ProceduralPlatformCrowd.tsx:239`,
`LibraryPlatformCrowd.tsx:78`), les animaux (`PlatformPets.tsx:43`), le train
croisé (`PassingTrain.tsx:339`) et les conversions de `playerFrame.ts:47-61`.
`walkable`, seul, lit `useStore.getState().doorSide`.

Les deux divergent sur une fenêtre réelle : `store.doorSide` bascule vers la
gare suivante dès la première image de la croisière
(`stationCycle.ts:930-934`), alors que `platformIndex` retient la gare quittée
jusqu'à ce que son quai soit hors de vue (`platformPresence.ts:130`). Pendant
cet intervalle, `platformFloorY()` calcule son `u` avec le côté de la gare à
venir tout en interrogeant l'emprise de la gare précédente.

Sans conséquence aujourd'hui — le joueur est forcément à bord à ce moment, et
`inCar()` est symétrique en `u` —, mais c'est une incohérence latente qui
attend le premier changement de calendrier des phases. La correction est d'une
ligne : lire `platformFlip()` comme tout le monde.

---

## D — Propreté et dettes mineures

| # | Constat | Emplacement |
| --- | --- | --- |
| D1 | `PLATFORM_TOP = -0.06` déclaré **deux fois**, dans deux modules ; `walkable` importe l'un, `paxTargeting` et `platformCrowd` l'autre. | `data/stationGeometry.ts:8`, `systems/playerFrame.ts:22` |
| D2 | Les six gares repères sont définies **trois fois** — `LOOP_HUBS`, `MAJOR_HUBS`, `ROOF_HUBS` — toutes égales à {0, 4, 12, 16, 19, 24}. Le commentaire de `segments.ts:188` affirme pourtant que `ROOF_HUBS` en est un « superset » : il ne l'est plus depuis le retrait de Takanawa Gateway. | `stations.ts:156`, `announcements.ts:40`, `segments.ts:198` |
| D3 | `CONFIG.cruiseTime` (59) et `CONFIG.exposure` (0,85) ne sont lus nulle part. La croisière vient de `SEGMENT_HEADWAY_MIN`, et aucun `toneMappingExposure` n'est posé. | `data/config.ts:17`, `:41` |
| D4 | `shuffle` = `sort(() => Math.random() - 0.5)`, biais connu et non uniforme : il décide qui descend à chaque arrêt. | `systems/passengers.ts:624` |
| D5 | Exports sans consommateur : `trainStateFromRuntime`, `melodyDepartureGuardState`, `playOuterMainMelodyOncePerStop`. | `systems/departureSequence.ts` |
| D6 | « Le quai fait 96 m de long » — il en fait 224 (`FULL_PLATFORM_LEN`). | `three/Player.tsx:262` |
| D7 | `__jumpTo()` ne remet pas `runtime.emergencyStop` à zéro : après un incident, le badge du HUD reste figé sur « arrêt d'urgence » et `beginPowerOutage()` refuse de partir. Observé en session. Outil de développement seulement. | `systems/stationCycle.ts:1168-1189` |
| D8 | Dépréciations three.js signalées à chaque lancement : `PCFSoftShadowMap` et `THREE.Clock`. | console navigateur |
| D9 | `updateBlockedDoor` fait partir la porte palière de `b.from`, qui est la position du vantail de la RAME, et non de `b.psdPos`. Sans effet tant que les deux sont à ~1 au moment du blocage. | `systems/doorMotion.ts:311-314` |
| D10 | Bundle de 2,38 Mo en un seul chunk (728 ko gzip), sans découpage. | `vite build` |
| D11 | Le paramètre `dt` d'`updateBoardable` n'est jamais utilisé (`void dt`). | `systems/platformWait.ts:230` |

---

## Ce qui a résisté à l'audit

Pour situer ce qui précède : le cœur du simulateur est sain, et plusieurs
recoupements qui échouent d'ordinaire passent ici sans une divergence.

- **L'arithmétique de la boucle.** Les 30 gares, leurs codes JY, les gares
  suivantes des deux sens, `INNER_LOOP_ORDER` / `OUTER_LOOP_ORDER` et les
  intervalles se recoupent sans une erreur. La boucle fait bien 67 minutes.
- **Les ressources sonores.** Les 19 chemins `/audio/*` référencés existent tous,
  et `tests/announcementClips.test.ts` garantit dans les deux sens que chaque
  texte joué a son clip et qu'aucun clip n'est orphelin.
- **Les places.** 51 assises et 30 debout, exactement les plafonds de
  `PAX_CURVE` — la courbe de remplissage ne peut pas demander plus que le wagon
  n'offre.
- **Le profil de traction.** Testé sans harnais, y compris la marche sur l'élan
  et le lâcher final du freinage.
- **Le renversement de repère à la descente** (`playerFrame`, `platformWait`) est
  la partie la plus délicate du projet et tient debout : `beginPlatformWait` /
  `endPlatformWait` sont exactement inverses, et le seuil de porte est couvert
  par des tests qui reproduisent la fin d'image de `three/Player`.

## Ordre de traitement suggéré

1. **A1** — sous-pas de la physique dans `Engine`. Une dizaine de lignes, et
   c'est le seul défaut qui rende le jeu injouable sur une machine modeste.
2. **B2 + B3** — les deux défauts clavier. Quelques lignes chacun, aucun risque.
3. **B1** — trancher entre `DOOR_SIDE` et `config`, puis dériver l'un de l'autre
   et verrouiller la règle par un test.
4. **C2**, **C1**, **C3** — la coquille d'intervalle, les drapeaux morts, la
   table de fériés.
5. **C4**, **C5**, puis la série **D**.

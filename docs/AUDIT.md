# Audit — bugs et incohérences

Relevé au 29 juillet 2026 sur `claude/yamanote-3d-audit-e5d99a`, **puis corrigé**.
Chaque entrée porte son état : ✅ corrigé, ⚠️ corrigé en partie, ↺ demande une
décision qui n'est pas technique.

## Méthode et état de l'outillage

Tout l'outillage était vert avant l'audit, et c'est le point de départ : les
défauts relevés ici n'étaient attrapés par aucune barrière existante.

| Vérification | Avant | Après |
| --- | --- | --- |
| `tsc -b` | 0 erreur | 0 erreur |
| `oxlint` | 0 signalement | 0 signalement |
| `npm test` | 131 / 131 | **147 / 147** (+16) |
| `vite build` | 2,38 Mo en un seul chunk | 746 ko + three 1,38 Mo + tone 245 ko |

À quoi se sont ajoutées une relecture des systèmes et de l'interface, des
scripts de recoupement lancés sur les modules réels, et **une session pilotée
dans Chromium** — c'est elle qui a livré le défaut n° 1, que ni la relecture ni
les tests ne pouvaient voir, et c'est elle qui a validé sa correction.

Sévérité : **A** = casse l'expérience, **B** = contradiction franche,
**C** = à corriger, **D** = propreté.

---

## A1 ✅ Les portes se désynchronisaient du cycle sous 20 images/seconde

`src/three/Engine.tsx`

La boucle séparait deux pas de temps, et `physDt` n'était pas un sous-pas mais un
**plafond appliqué une seule fois par image** :

```ts
const cycleDt = skipCycle ? 0 : Math.min(raw, CYCLE_DT_CAP); // temps réel
const physDt  = Math.min(raw, PHYS_DT_CAP);                  // 0,05 s par IMAGE
```

En dessous de 20 fps (1 / 0,05), l'animation des portes n'avançait plus qu'à la
fraction `fps / 20` du temps réel pendant que `updateCycle` consommait tout le
temps écoulé. L'écart n'était pas borné : il grandissait tant que le cadre
restait bas. Mesuré en session (rendu logiciel, ~0,3 fps — cas extrême, mécanisme
linéaire à partir de 20 fps) :

```
fps=0.3  phase=à quai     phaseT=39.8  doorT=0.7 (cible 1)  doorOpen=0.19  v=0
fps=0.3  phase=à quai     phaseT=48.7  doorT=0.1 (cible 0)  doorOpen=0.99  v=0   <- saut
fps=0.4  phase=en route   phaseT=24.3  doorT=1.0 (cible 0)  doorOpen=0.15  v=25.0
```

Trois conséquences, toutes visibles : la rame roulait **à 90 km/h portes
ouvertes** ; le vantail **sautait de 0,19 à 0,99** à l'ordre de fermeture, le
profil supposant le mouvement précédent terminé ; et l'ouverture plafonnant à
0,19 ne franchissait jamais le seuil de 0,55 de `PORTAL_MIN_OPEN`, si bien que
**sur une machine lente on ne pouvait plus descendre du train**. Le seuil de
20 fps n'était pas théorique : la qualité par défaut est `ultra`, sans détection
automatique, sur une scène qui porte 224 m de quai, la ville et des dizaines de
PNJ.

**Correction.** Le temps écoulé est désormais *parcouru* en autant de sous-pas de
0,05 s qu'il faut, au lieu d'être tronqué — comme le fait déjà `integrateTrain`.
Ce qui intègre du temps (portes, obstruction, PNJ, foule, dialogue, audio,
ambiance) est dans la boucle ; ce qui ne fait que publier l'état courant
(niveaux, ambiance de gare, tonnerre) reste après, une fois par image. Un
plafond de 1 s de physique simulée par image borne le travail : la physique suit
le temps réel exactement jusqu'à 1 fps, et se dégrade doucement en dessous.

Même trace, après correction :

```
fps=0.30 à quai     phaseT=10.9  doorT=3  (cible 1)  doorOpen=1     v=0
fps=0.33 à quai     phaseT=51.1  doorT=1  (cible 0)  doorOpen=0.09  v=0
fps=0.47 en route   phaseT=31.4  doorT=20 (cible 0)  doorOpen=0     v=25.0
```

Portes grandes ouvertes tout l'arrêt, fermées sur toute la course, plus de saut.

---

## B1 ↺ Le côté d'ouverture ne se déduit pas du plan de voies — et ne le prétend plus

`src/data/stations.ts`, `src/data/loop.ts`

**Correction d'une erreur de ma première analyse.** Le rapport initial affirmait
que « 13 gares sur 30 contredisent la règle », avec un tableau des côtés
attendus. Ce tableau était faux : je l'avais construit en tenant `sharedIsland`
pour un îlot central, alors qu'un îlot 方向別 partagé avec le Keihin-Tōhoku est
au contraire *à l'extérieur* de la paire de voies Yamanote — le côté attendu s'y
inverse. Recoupement des trois lectures possibles de la règle contre les données
réelles :

```
17/30  îlot→droite, latéral→gauche (lecture littérale du commentaire)
12/30  îlot Yamanote→droite, le reste→gauche (plan de voies réel)
13/30  tout îlot→gauche, latéral→droite
```

Aucune ne fait mieux que le hasard, et les treize gares dites `island` se
partagent le côté **sept-sept**. La conclusion juste n'est donc pas « une des
deux tables est fausse pour treize gares » mais : **`DOOR_SIDE` n'est pas
dérivable de `config`, sous aucune lecture.** C'est un relevé écrit à la main,
quasi alternant (18 à droite, 12 à gauche).

Le défaut réel était donc plus étroit, et c'est celui-là qui est corrigé : le
commentaire de `DOOR_SIDE` — repris mot pour mot dans `data/loop.ts` — énonçait
la règle d'une façon qui se lisait comme une dérivation, et conduisait tout
lecteur à conclure qu'une des deux tables était cassée. Les deux commentaires
distinguent maintenant ce qui est garanti (le côté est le même dans les deux
sens, et c'est pour cela que la table n'a pas de colonne de sens) de ce qui ne
l'est pas (il ne se calcule pas depuis `config` ; c'est un relevé, et il se
corrige en regardant la gare). `tests/doorSide.test.ts` verrouille les
invariants qui tiennent : trente entrées, toutes ±1, indexées par gare seule.

**Ce qui reste, et qui n'est pas à moi.** Savoir si le relevé lui-même est juste
gare par gare est une question de terrain, pas de code : rien dans le dépôt ne
permet de la trancher, et retourner treize quais sur une déduction que les
données démentent aurait été pire que de ne rien faire. Si le relevé doit être
révisé, c'est une passe de vérification sur les trente gares — dis-le et je la
prépare, table en main.

---

## B2 ✅ Les touches du jeu restaient actives dans les champs du menu

`src/three/Player.tsx`, `src/systems/browser.ts`

L'écouteur `keydown` était posé sur `window` sans regarder ni `started` ni la
cible de l'événement, alors que `<Player />` est monté dès le premier rendu et
que `StartScreen` présente deux `<input>` et trois `<select>`. Vérifié, curseur
dans le champ date : **M** coupait le son avant l'embarquement (sans HUD pour le
montrer), **F** passait le navigateur en plein écran, **Espace** appelait
`preventDefault()` sans condition et neutralisait donc l'ouverture des
sélecteurs gare / sens / qualité. HUD affiché, le même défaut faisait marcher le
joueur de côté quand on réglait le volume aux flèches.

**Correction.** `isTypingTarget()` rend le clavier au champ qui a le focus
(`INPUT`, `SELECT`, `TEXTAREA`, `contentEditable`), et rien ne s'applique avant
d'être monté à bord. Vérifié en session : `muted` reste `false` après M depuis le
champ date, pas de plein écran après F, Espace rendu au `<select>` — et M
fonctionne toujours une fois à bord.

---

## B3 ✅ Les touches restaient enfoncées après une perte de focus

`src/three/Player.tsx`

`input.keys` n'était vidé que par `keyup`, et aucun écouteur ne le remettait à
zéro. Alt-Tab touche de marche enfoncée, le `keyup` partait dans l'autre
fenêtre, et le joueur marchait seul, sans fin, au retour sur l'onglet.

**Correction.** Tout ce qui fait perdre le clavier vide le jeu de touches :
`blur`, `visibilitychange` et la sortie du verrou de pointeur. Vérifié :
`["KeyW"]` avant, `[]` après.

---

## C1 ✅ Trois mélodies sur dix-neuf ne pouvaient jamais sonner

`src/systems/runtime.ts`, `src/systems/stationCycle.ts`

`runtime.useAlternativePlatform` était **déclaré, lu quatre fois, jamais écrit** :
`resolvePlatform()` rendait donc toujours la voie principale, et les mélodies
câblées sur les voies secondaires étaient inatteignables, avec les prédicats et
les fonctions qui allaient avec.

```
clips au manifeste : 19 | atteignables en jeu : 16
  03_jre-ikst-010-03_inner-secondary-osaki.mp3   (Ōsaki 内 voie 2)
  04_jre-ikst-010-05_outer-secondary-osaki.mp3   (Ōsaki 外 voie 4)
  18_bic-camera-theme-a.mp3                      (Ikebukuro 内 voie 5)
```

**Correction.** La voie est tirée à chaque arrêt, au début de
`randomizeStopTimings` — donc avant la mesure de la fenêtre sonore, puisque c'est
le quai qui décide de la mélodie et la mélodie qui décide de la durée de
l'arrêt. Un seul point d'entrée pour les deux : l'ordre ne peut plus se perdre.
Ōsaki 28 %, Ikebukuro 12 %, rien ailleurs. Vérifié en session sur 400 tirages par
gare : les trois clips sortent, et Mejiro ne tire jamais de voie secondaire.

`terminusStop` et `outOfService` restent sans producteur, et c'est assumé : la
boucle du jeu n'a pas de rame de service ni de terminus. Ils sont documentés
comme réservés — les prédicats de `data/melodies` sont écrits sur le contrat réel
du quai, où ces états existent, et une garde qui dort coûte moins cher qu'une
garde qui manque. En revanche `autonomousDepartureSequence` et
`startDepartureSequence` sont partis : c'était un **second ordonnanceur de
départ**, en sommeil, en face de celui de `stationCycle` qui mène l'arrêt.

---

## C2 ✅ Ordre des annonces inversé entre Mejiro et Takadanobaba

`src/data/segments.ts`, `src/systems/stationCycle.ts`

Le tronçon 13 porte une minute d'intervalle, seul de la boucle : après retrait du
forfait d'arrêt il ne reste que **8 s de croisière** — le plancher de
`cruiseDuration` —, contre 59 ou 119 s partout ailleurs. `cruiseSec − 20` y
valait −12, donc la condition de l'annonce d'approche était déjà vraie à la
première image :

```ts
once('announce-soon', t >= cruiseSec - APPROACH_ANNOUNCE_LEAD, ...)  // 0 >= −12 → vrai
once('announce-depart', t > 0.6, ...)                                // 0,6 s plus tard
```

La file de la rame étant sérielle, elle recevait 「まもなく高田馬場」 avant
「次は、高田馬場」 et les jouait dans cet ordre — les deux sens touchés.

**Correction.** `approachAnnounceAt()` borne l'instant pour qu'il ne passe jamais
devant l'annonce de départ. La fonction et ses deux constantes ont migré dans
`data/segments`, avec `cruiseDuration` dont elles se déduisent : c'est de
l'arithmétique d'horaire, et elle se teste comme telle
(`tests/announceOrder.test.ts` balaie les soixante couples gare × sens).
`SEGMENT_HEADWAY_MIN` n'est pas touché : il est dérivé d'un horaire cité en
commentaire, et corriger la borne règle le défaut sans réécrire l'horaire de la
boucle.

---

## C3 ✅ La table des jours fériés expirait fin 2027

`src/data/holidays.ts` (nouveau), `src/data/occupancy.ts`

`HOLIDAYS` était une liste littérale de dates 2025–2027. Le menu propose par
défaut la date réelle à Tokyo et l'horloge du monde avance les jours d'elle-même :
au 1er janvier 2028, `isJapaneseHoliday()` aurait rendu faux pour les seize
fériés de l'année, `morningMatrixFactor` aurait pris la colonne du jour ouvrable
au lieu de celle du dimanche, et le remplissage annoncé aurait sauté d'environ
0,35 à 1,0 — un 元日 rendu comme un mardi de pointe, sans un mot.

**Correction.** Les fériés sont **calculés** depuis le 祝日法 : dates fixes,
Happy Monday (n-ième lundi), les deux équinoxes par la formule valable
1980–2099, le 振替休日 (report du dimanche au premier jour non férié) et le
国民の休日 (jour ordinaire pris en sandwich — c'est lui qui donne le 22 septembre
2026). Un tableau qui périme est une bombe à retardement silencieuse ; la loi ne
périme pas.

Le calcul reproduit les trois années publiées à la date près — **et trouve deux
fériés que la table oubliait** : le 23 novembre 2025 et le 21 mars 2027, tous
deux des dimanches dont elle ne gardait que le report. Huit tests couvrent la
conformité aux calendriers du Cabinet Office et les invariants sur les 120 années
du domaine.

---

## C4 ✅ Bouton plein écran à sens unique

`src/systems/browser.ts`, `src/ui/Hud.tsx`, `src/three/Player.tsx`

Les deux chemins n'appelaient que `requestFullscreen()` : une fois dedans, le
bouton du HUD restait affiché sans plus rien faire, et **F** non plus, alors que
le pense-bête du menu promet « F : plein écran ». `toggleFullscreen()` bascule
maintenant dans les deux sens, depuis un seul endroit — le bouton et la touche ne
peuvent plus diverger. Le README le dit.

---

## C5 ✅ `walkable` lisait un côté d'ouverture que le reste du rendu ne lisait pas

`src/systems/walkable.ts`

Tout ce qui touche au repère du quai passe par `DOOR_SIDE[platformIndex]` — la
gare, la foule, les animaux, la rame croisée, `playerFrame`. `walkable`, seul,
lisait `store.doorSide`, qui bascule vers la gare suivante dès la première image
de la croisière alors que `platformIndex` retient la gare quittée jusqu'à ce que
son quai soit hors de vue. Pendant cette fenêtre, `platformFloorY()` calculait
son `u` avec le côté de la gare à venir tout en interrogeant l'emprise de la gare
précédente. Sans conséquence tant que le joueur est à bord — `inCar` est
symétrique en `u` — mais rien ne garantissait qu'il y reste. Les huit lectures
passent par `walkFlip()`, qui est `platformFlip()`.

---

## D ✅ Propreté et dettes mineures

| # | Constat | Correction |
| --- | --- | --- |
| D1 | `PLATFORM_TOP` déclaré deux fois ; `walkable` lisait l'une, `paxTargeting` l'autre. | `playerFrame` le ré-exporte depuis `data/stationGeometry`, source unique. |
| D2 | Les six gares repères définies **trois fois** (`LOOP_HUBS`, `MAJOR_HUBS`, `ROOF_HUBS`), toutes égales — avec un commentaire affirmant que `ROOF_HUBS` en était un « superset », ce qui n'était plus vrai depuis le retrait de Takanawa Gateway. | `LOOP_HUB_JY` / `LOOP_HUB_INDICES` dans `data/stations` ; les deux autres en dérivent. Takanawa Gateway, qui n'est pas une gare repère, s'exclut de lui-même. |
| D3 | `CONFIG.cruiseTime` (59) et `CONFIG.exposure` (0,85) lus nulle part — réglables sans effet. | Supprimés, avec la note de ce qui les remplace. |
| D4 | `sort(() => Math.random() - 0.5)` décidait qui descend à chaque arrêt : un comparateur aléatoire n'est pas un ordre, et la permutation n'est pas uniforme. | Fisher-Yates. |
| D5 | Exports sans consommateur : `trainStateFromRuntime`, `melodyDepartureGuardState`, `playOuterMainMelodyOncePerStop`. | Le premier redevient interne, les deux autres partent. |
| D6 | « Le quai fait 96 m de long » — il en fait 224. | Corrigé. |
| D7 | `__jumpTo()` ne remettait pas `runtime.emergencyStop` à zéro : le badge du HUD restait figé sur « arrêt d'urgence » et `beginPowerOutage()` refusait de partir. | L'outil remet l'incident, l'alimentation et les tirages à zéro. |
| D8 ⚠️ | Deux dépréciations three.js à chaque lancement. | `shadows="percentage"` (PCFShadowMap, ce que le moteur choisissait déjà) : plus d'avertissement. **`THREE.Clock` vient de `@react-three/fiber`**, pas du projet — rien à corriger ici, il partira avec une mise à jour de la dépendance. |
| D9 | `updateBlockedDoor` faisait partir la porte palière de la position du vantail de la RAME. | Elle part de la sienne (`psdFrom`), tenue à jour à chaque reprise de mouvement. |
| D10 | Bundle de 2,38 Mo en un seul chunk. | three.js et Tone.js sortis dans leurs propres chunks : le morceau du jeu tombe à 746 ko (250 ko gzip) et le reste, qui ne change jamais, tient en cache d'un déploiement au suivant. |
| D11 | Paramètre `dt` d'`updateBoardable` jamais utilisé (`void dt`). | Retiré. |

---

## Ce qui a résisté à l'audit

Le cœur du simulateur est sain, et plusieurs recoupements qui échouent
d'ordinaire passent ici sans une divergence.

- **L'arithmétique de la boucle.** Les 30 gares, leurs codes JY, les gares
  suivantes des deux sens, `INNER_LOOP_ORDER` / `OUTER_LOOP_ORDER` et les
  intervalles se recoupent sans une erreur. La boucle fait bien 67 minutes.
- **Les ressources sonores.** Les 19 chemins `/audio/*` référencés existent tous,
  et `tests/announcementClips.test.ts` garantit dans les deux sens que chaque
  texte joué a son clip et qu'aucun clip n'est orphelin.
- **Les places.** 51 assises et 30 debout, exactement les plafonds de
  `PAX_CURVE` — la courbe de remplissage ne peut pas demander plus que le wagon
  n'offre.
- **Le profil de traction**, testé sans harnais, marche sur l'élan et lâcher
  final du freinage compris.
- **Le renversement de repère à la descente** (`playerFrame`, `platformWait`),
  la partie la plus délicate du projet : `beginPlatformWait` et `endPlatformWait`
  sont exactement inverses, et le seuil de porte est couvert par des tests qui
  reproduisent la fin d'image de `three/Player`.

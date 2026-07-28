# Yamanote 3D — 山手線

Expérience web contemplative et passive : vous êtes passager d'une rame JR East
série E235 sur la ligne Yamanote (Tokyo, boucle de 30 stations). Aucun objectif,
aucun score : on marche dans le wagon, on s'assoit, on regarde la ville défiler,
on écoute les annonces et les mélodies. La boucle tourne indéfiniment, en temps
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

- Regarder : cliquer-glisser avec la souris (pointer lock en bonus sur double-clic, Échap pour sortir)
- Marcher : ZQSD, WASD ou les flèches ; Maj pour presser le pas
- S'asseoir : un clic net vers une place libre ; se lever : espace ou un nouveau clic
- **Descendre / remonter : marcher à travers une porte ouverte.** Aucune touche —
  la porte ouverte *est* le passage
- M : couper le son, F : plein écran
- Mobile : joystick virtuel à gauche, glisser sur la scène pour regarder, bouton s'asseoir

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

`psd: 'partial'` — Ikebukuro et Ōsaki — ne change rien sous nos pieds : c'est la
voie *secondaire* qui n'est pas équipée (voies 5 et 8, voies 2 et 4), et le jeu
circule en 外回り sur la principale, qui l'est. La différence se verra sur le
quai d'en face.

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
  three/                 rendu R3F : wagon, sièges, portes, poignées, pubs, écrans LCD,
                         ville en parallaxe, PNJ, caméra
  three/exterior/        rame E235-0 vue de dehors : caisses, bogies, cabines
  three/station/         quai praticable de 224 m, trente gabarits de gare, signalétique
  three/station/signatures/ les charpentes propres à une gare : Takanawa, Akihabara…
  three/characters/      PNJ « librairie » : manifest, chargement/clonage GLB,
                         overrides d'os (regard, tsurikawa), accessoires
  scripts/               models:import / models:inspect (packs → public/models/)
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
`false` = retour à la synthèse Tone.js seule. La séquence de départ respecte la
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
automatiques JR (まもなく、…渋谷、…渋谷。), que Kokoro ne marque pas de
lui-même. `--reuse` ne grave que les clips absents : un texte inchangé garde
exactement le fichier qu'il avait, et une version plus récente de Kokoro ne
fait pas dériver en douce les annonces déjà en place.

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

**Quatre locutrices, toutes féminines**, parce que quatre sources parlent et
qu'on doit les distinguer sans regarder : la sono de la rame (`jf_alpha`),
l'annonce automatique du quai (`jf_gongitsune`), l'agent de quai au micro
(`jf_nezumi`, un peu plus rapide et moins lisse — c'est une personne, pas un
automate), et les deux voix anglaises (`af_heart` à bord, `af_sarah` au quai,
un cran plus lente : dehors, sous une verrière, une annonce trop rapide ne
s'attrape pas).

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

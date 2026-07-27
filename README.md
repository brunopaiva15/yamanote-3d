# Yamanote 3D — 山手線

Expérience web contemplative et passive : vous êtes passager d'une rame JR East
série E235 sur la ligne Yamanote (Tokyo, boucle de 30 stations). Aucun objectif,
aucun score : on marche dans le wagon, on s'assoit, on regarde la ville défiler,
on écoute les annonces et les mélodies. La boucle tourne indéfiniment, en temps
quasi réel (~2 minutes par station, ~1 heure la boucle).

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
- Marcher : ZQSD, WASD ou les flèches
- S'asseoir : un clic net vers une place libre ; se lever : espace ou un nouveau clic
- M : couper le son, F : plein écran
- Mobile : joystick virtuel à gauche, glisser sur la scène pour regarder, bouton s'asseoir

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
                         ville en parallaxe, quai + portes palières, PNJ, caméra
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
(Tone.js). Les mélodies de départ (発車メロディ) utilisent pour l’instant une
**synthèse originale** uniquement : les clips MP3 de quais (œuvres protégées)
sont désactivés (`ENABLE_DEPARTURE_MELODY_CLIPS = false` dans
`src/data/melodies.ts`) faute d’autorisations copyright. Le câblage par gare /
quai / sens reste en place pour une réactivation ultérieure. La séquence de
départ respecte l'ordre réel : la mélodie joue portes ouvertes et se termine
**avant** l'annonce de fermeture, puis viennent le carillon et la fermeture.
Les annonces (sens de la boucle 内回り avec gares repères, 次は… avec numéro
JY, まもなく…, fermeture, accueil, messages de courtoisie en rotation) sont
dites en japonais puis en anglais, avec les correspondances réelles de chaque
gare. Les voix sont des clips pré-générés avec **Kokoro TTS** (japonais
`jf_alpha`, anglais `af_heart`), stockés dans `public/audio/announcements/` et
régénérables via `scripts/announcements-export.ts` +
`scripts/announcements-gen.py` ; un texte sans clip retombe sur
`speechSynthesis`.

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
  s'ouvre à cette gare.

Les annonces vocales (clips Kokoro) passent par ce même bus PA : elles sont
réellement pannées sur les diffuseurs du plafond. Seul le repli
`speechSynthesis` (texte sans clip) sort hors du graphe Web Audio et ne peut
pas être panné ; il reste ancré aux diffuseurs par le souffle de ligne
spatialisé (la sono s'ouvre et se referme avec un déclic autour de chaque
annonce) et par un volume qui suit la distance au diffuseur le plus proche.

Optionnel : déposez d'autres enregistrements dans `public/audio/`
(`door-open.mp3`, `door-close.mp3`, `arrival.mp3`, `melody-JY01.mp3`…) ; ils seront
utilisés à la place de la synthèse, et passent par le même bus spatialisé.

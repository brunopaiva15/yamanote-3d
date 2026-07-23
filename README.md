# 山手線 Yamanote Line Ride

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
- Avance rapide (HUD) : saute à la séquence d'arrivée de la station suivante

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

## Vocabulaire (esprit Shashingo)

Regarder un objet du wagon (porte, tsurikawa, siège, fenêtre, porte-bagages,
écran, affiche…) affiche une petite fiche : mot en japonais, lecture kana,
romaji et traduction française. Neuf mots du quotidien ferroviaire.

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
  ui/                    HUD français, écran de démarrage, contrôles tactiles
```

Les valeurs continues (vitesse, distance, ouverture des portes) vivent dans
`systems/runtime.ts` et sont mutées chaque frame sans re-render React ; la boucle
60 fps est un unique `useFrame` (`three/Engine.tsx`).

## Audio

Tout est synthétisé (Tone.js) : roulement, onduleur VVVF, joints de rail, frein,
carillons de porte, jingle d'arrivée et mélodies de départ originales (structure
fidèle à la réalité : deux mélodies « maison » alternées, quelques gares avec leur
propre jingle ; aucune mélodie réelle n'est transcrite). La séquence de départ
respecte l'ordre réel : la 発車メロディ joue portes ouvertes et se termine **avant**
l'annonce de fermeture, puis viennent le carillon et la fermeture. Les annonces
(sens de la boucle 内回り avec gares repères, 次は… avec numéro JY, まもなく…,
fermeture, accueil, messages de courtoisie en rotation) sont dites en japonais puis
en anglais via `speechSynthesis`, avec les correspondances réelles de chaque gare.

Optionnel : déposez vos propres enregistrements dans `public/audio/`
(`door-open.mp3`, `door-close.mp3`, `arrival.mp3`, `melody-JY01.mp3`…) ; ils seront
utilisés à la place de la synthèse. Aucun asset audio protégé n'est fourni.

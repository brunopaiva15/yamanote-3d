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
propre jingle ; aucune mélodie réelle n'est transcrite). Les annonces (次は…,
まもなく…, fermeture, accueil, places prioritaires) sont dites en japonais puis en
anglais via `speechSynthesis`, avec les correspondances réelles de chaque gare.

Optionnel : déposez vos propres enregistrements dans `public/audio/`
(`door-open.mp3`, `door-close.mp3`, `arrival.mp3`, `melody-JY01.mp3`…) ; ils seront
utilisés à la place de la synthèse. Aucun asset audio protégé n'est fourni.

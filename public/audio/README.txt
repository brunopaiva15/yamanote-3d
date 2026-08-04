announcements/ : annonces vocales pré-générées avec Kokoro TTS - rame
(ja jf_alpha, en af_heart), quai (automate ja jm_kumo, agent ja jf_nezumi,
en am_michael) - voir scripts/announcements-gen.py.
Ne pas éditer à la main : régénérer via le script.

Déposez ici vos propres enregistrements mp3 (optionnel) :
door-open.mp3, door-close.mp3, melody-JY01.mp3 ... melody-JY30.mp3
Sans fichier, la synthèse Tone.js est utilisée.

Mélodies de départ par quai (発車メロディ) :
Les clips MP3 sous melodies/ sont des compositions ORIGINALES du projet -
une par quai câblé, inspirée du caractère de la mélodie réelle (gamme,
tempo, timbre) sans en reprendre les notes. Aucun enregistrement protégé
n'est embarqué. Activées via ENABLE_DEPARTURE_MELODY_CLIPS = true
(src/data/melodies.ts) ; repasser le flag à false pour revenir à la
synthèse Tone.js seule.
Deux générateurs, un propriétaire par fichier :
  scripts/melodies-gen.py       cloches, boîte à musique, koto, marimba…
  scripts/piano-melody-gen.py   01_…_inner-main et 02_…_outer-main. Seuls
                                clips NON synthétisés : la partition part en
                                MIDI et un piano échantillonné la joue
                                (FluidR3_GM, licence MIT). Demande
                                `apt-get install fluidsynth fluid-soundfont-gm`.
                                Masters WAV 48 kHz / 24 bits dans
                                assets/melodies/
Ne pas éditer les MP3 à la main : régénérer via le script, puis
`node scripts/melody-manifest-gen.mjs` (le manifeste des durées taille la
fenêtre sonore de l'arrêt).

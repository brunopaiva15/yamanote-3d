announcements/ : annonces vocales pré-générées avec Kokoro TTS - rame
(ja jf_alpha, en af_heart), quai (automate ja jm_kumo, agent ja jf_nezumi,
en am_michael) - voir scripts/announcements-gen.py.
Ne pas éditer à la main : régénérer via le script.

Déposez ici vos propres enregistrements mp3 (optionnel) :
door-open.mp3, door-close.mp3, melody-JY01.mp3 ... melody-JY30.mp3
Sans fichier, la synthèse Tone.js est utilisée.

Mélodies de départ par quai (発車メロディ) :
Les clips MP3 sous melodies/ sont des compositions ORIGINALES du projet,
générées par scripts/melodies-gen.py - une par quai câblé, inspirée du
caractère de la mélodie réelle (gamme, tempo, timbre) sans en reprendre
les notes. Aucun enregistrement protégé n'est embarqué. Activées via
ENABLE_DEPARTURE_MELODY_CLIPS = true (src/data/melodies.ts) ; repasser
le flag à false pour revenir à la synthèse Tone.js seule.
Ne pas éditer les MP3 à la main : régénérer via le script.

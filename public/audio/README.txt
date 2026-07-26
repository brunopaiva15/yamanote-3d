announcements/ : annonces vocales pré-générées avec Kokoro TTS
(ja jf_alpha, en af_heart) — voir scripts/announcements-gen.py.
Ne pas éditer à la main : régénérer via le script.

Déposez ici vos propres enregistrements mp3 (optionnel) :
door-open.mp3, door-close.mp3, arrival.mp3, melody-JY01.mp3 ... melody-JY30.mp3
Sans fichier, la synthèse Tone.js est utilisée.

Mélodies de départ par quai (発車メロディ) :
Les clips MP3 sous melodies/ sont désactivés tant que
ENABLE_DEPARTURE_MELODY_CLIPS = false (src/data/melodies.ts),
faute d’autorisations copyright. Le jeu utilise la synthèse Tone.js.
Le câblage (shouldPlay* / play*) reste dans le code pour une
réactivation ultérieure une fois les droits obtenus.

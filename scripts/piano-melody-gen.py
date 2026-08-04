#!/usr/bin/env python3
"""Grave la 発車メロディ PIANO des deux branchements principaux (Inner / Outer).

Le son vient d'un VRAI piano enregistré, pas d'une synthèse. Ça n'a pas été le
premier choix, et l'histoire vaut d'être écrite ici parce qu'elle se rejouera :
ce script a d'abord synthétisé le piano par addition de partiels, avec cordes à
l'unisson, inharmonicité, étouffoirs, pédale, résonance sympathique et table
d'harmonie. Le modèle était juste et le résultat ne sonnait toujours pas comme
un piano. C'est le plafond de la méthode, pas un défaut de réglage : le timbre
d'un piano tient à la mécanique du marteau sur la corde, au couplage par le
chevalet et au rayonnement de la caisse - rien de tout cela ne se reconstruit en
additionnant des sinusoïdes. On échantillonne, ou on n'a pas de piano.

La partition part donc en MIDI et c'est un échantillonneur qui la joue :

    partition (ci-dessous) -> MIDI -> fluidsynth + FluidR3_GM -> finition numpy

Tout le travail musical est conservé - il s'exprime en MIDI sans rien perdre :
vélocités, accents, crescendo de la mesure 3, équilibre des mains (vélocité, qui
sur un piano échantillonné change aussi le TIMBRE : plus fort, plus brillant),
pédale forte (CC64) renouvelée au début de chaque mesure, panoramique (CC10).

Pourquoi ce script vit à côté de scripts/melodies-gen.py : celui-là synthétise
des cloches, du koto, du marimba, sans dépendance externe. Celui-ci a besoin
d'un échantillonneur et d'une banque d'échantillons. Seul le format de sortie
est commun (MP3 stéréo 44,1 kHz, 160 kb/s) pour que les vingt clips sonnent au
même niveau sur le quai.

UNE partition, DEUX interprétations. `SCORE_RIGHT`, `SCORE_LEFT` et `PEDAL` sont
uniques et partagés : hauteurs, octaves, durées, silences et positions
rythmiques sont donc identiques par construction dans les deux fichiers. Ce qui
change vit dans `VOICINGS` : vélocités, équilibre des mains, pédale,
panoramique, couleur et réverbération.

  Inner Loop  - un peu plus lumineuse, main droite plus présente, attaque
                claire et petite brillance cristalline.
  Outer Loop  - un peu plus douce et aérienne, main gauche plus ronde, son
                moins frontal, résonance plus ample.

Dépendances :
  pip install numpy lameenc
  apt-get install fluidsynth fluid-soundfont-gm

FluidR3_GM est publié par Frank Wen sous licence MIT : le rendu peut être
redistribué librement. Seul l'audio rendu est versionné - pas la banque, qui
pèse cent quarante-huit mégaoctets. Voir docs/AUDIO_ORIGINALITY.md.

Usage :
  python scripts/piano-melody-gen.py               # grave les deux versions
  python scripts/piano-melody-gen.py --only inner
  python scripts/piano-melody-gen.py --keep-midi /tmp/x   # pour ouvrir dans un séquenceur

Après regravure : `node scripts/melody-manifest-gen.mjs` (le manifeste des
durées taille la fenêtre sonore de l'arrêt) puis `npm test`.
"""

import argparse
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

import lameenc
import numpy as np

# --- Format ----------------------------------------------------------------

SR = 48_000            # rendu de l'échantillonneur et master WAV
MP3_SR = 44_100        # comme les dix-sept autres clips de la bibliothèque
MP3_BITRATE_KBPS = 160
WAV_BITS = 24

BPM = 110.0
BEAT = 60.0 / BPM      # 0,545454... s
SCORE_BEATS = 16       # 4/4, quatre mesures -> 8,727 s de musique
TAIL_S = 1.72          # résonance libre après la dernière mesure
FADE_OUT_S = 0.55      # extinction douce, sous -30 dB : ne coupe pas la queue

# Crête visée sur le master (-0,72 dBFS). Un peu plus haut que la bibliothèque
# (ses MP3 redonnent 0,82 à 0,86 une fois décodés) et c'est VOULU : un piano a
# un facteur de crête bien plus grand qu'une cloche doublée d'une nappe. À crête
# égale, ces deux clips s'entendraient nettement plus bas que les dix-sept
# autres. On ferme l'écart par la crête plutôt que par un compresseur.
PEAK_TARGET = 0.92

# Arrondi de crête : PAS un compresseur - aucun détecteur de niveau, aucune
# constante de temps, aucun effet sur la dynamique musicale. Une courbe fixe qui
# n'arrondit que les échantillons au-delà du seuil (quelques dixièmes de pour
# cent du fichier, tous dans les premières millisecondes d'une attaque), d'un
# peu moins d'un décibel.
SOFT_KNEE = 0.55

# --- Échantillonneur -------------------------------------------------------

# GM programme 1 : Bright Acoustic Piano. C'est le timbre demandé - clair,
# légèrement métallique, adapté à une diffusion sur un quai.
GM_BRIGHT_ACOUSTIC_PIANO = 1
TPQ = 960              # divisions MIDI par noire ; tous les temps écrits (au
                       # quart de temps près) y tombent sur un tick entier

SOUNDFONTS = (
    "/usr/share/sounds/sf2/FluidR3_GM.sf2",
    "/usr/share/sounds/sf2/default-GM.sf2",
    "/usr/share/soundfonts/FluidR3_GM.sf2",
    "/opt/homebrew/share/fluid-soundfont-gm/FluidR3_GM.sf2",
)

# ---------------------------------------------------------------------------
# Notes
# ---------------------------------------------------------------------------

NOTE_OFFSETS = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
NOTE_RE = re.compile(r"([A-G])([#b]?)(-?\d)")


def midi_of(name: str) -> int:
    """Numéro MIDI d'une note en notation scientifique (do central = C4 = 60).

    Les altérations sont lues telles qu'écrites : `A#4` et `Bb4` donnent le même
    numéro (70), `Cb4` donne bien 59 (= B3). La partition ci-dessous garde
    l'orthographe d'origine ; c'est ici qu'elle redevient une hauteur.
    """
    m = NOTE_RE.fullmatch(name)
    if not m:
        raise ValueError(f"note invalide : {name}")
    letter, acc, octv = m.groups()
    semis = NOTE_OFFSETS[letter] + (1 if acc == "#" else -1 if acc == "b" else 0)
    return (int(octv) + 1) * 12 + semis


# Garde-fous d'orthographe : la partition écrit la MÊME hauteur de deux façons
# (mesure 1) et une bémol de do (mesure 3). Une faute de lecture donnerait deux
# hauteurs différentes là où il n'y en a qu'une.
assert midi_of("A#4") == midi_of("Bb4") == 70
assert midi_of("Cb4") == midi_of("B3") == 59

# ---------------------------------------------------------------------------
# Partition - unique, partagée par les deux interprétations
# ---------------------------------------------------------------------------
#
# (temps d'attaque, durée écrite en temps, note). Temps 0 = première note ;
# quatre mesures de 4 temps ; ♩ = 110. Aucune de ces valeurs ne dépend de
# l'interprétation : c'est le point du fichier.

SCORE_RIGHT = [
    # Mesure 1 : croche, double croche, note tenue 1,25 temps, silence de
    # double croche, puis sept doubles croches régulières.
    (0.00, 0.50, "D5"),
    (0.50, 0.25, "G4"),
    (0.75, 1.25, "Bb4"),
    # 2,00 -> 2,25 : silence.
    (2.25, 0.25, "D5"),
    (2.50, 0.25, "G4"),
    (2.75, 0.25, "A#4"),   # même hauteur que le Si♭4 tenu, orthographe d'origine
    (3.00, 0.25, "F5"),
    (3.25, 0.25, "D5"),
    (3.50, 0.25, "Bb4"),
    (3.75, 0.25, "G4"),
    # Mesure 2 : même dessin, transposé par la partition elle-même.
    (4.00, 0.50, "C5"),
    (4.50, 0.25, "F4"),
    (4.75, 1.25, "Ab4"),
    # 6,00 -> 6,25 : silence.
    (6.25, 0.25, "C5"),
    (6.50, 0.25, "F4"),
    (6.75, 0.25, "Ab4"),
    (7.00, 0.25, "Eb5"),
    (7.25, 0.25, "C5"),
    (7.50, 0.25, "Ab4"),
    (7.75, 0.25, "F4"),
    # Mesure 3 : quatre doubles croches, croche, silence de croche, quatre
    # doubles croches, noire.
    (8.00, 0.25, "D5"),
    (8.25, 0.25, "G4"),
    (8.50, 0.25, "Bb4"),
    (8.75, 0.25, "D5"),
    (9.00, 0.50, "E5"),
    # 9,50 -> 10,00 : silence.
    (10.00, 0.25, "F5"),
    (10.25, 0.25, "Ab4"),
    (10.50, 0.25, "C#5"),
    (10.75, 0.25, "F5"),
    (11.00, 1.00, "Ab5"),
    # Mesure 4 : accord final, une noire, puis trois temps de silence écrit
    # (la résonance, elle, continue).
    (12.00, 1.00, "C5"),
    (12.00, 1.00, "E5"),
    (12.00, 1.00, "G5"),
]

SCORE_LEFT = [
    # Mesure 1 : huit croches régulières.
    (0.00, 0.50, "Eb3"),
    (0.50, 0.50, "D4"),
    (1.00, 0.50, "Bb3"),
    (1.50, 0.50, "D4"),
    (2.00, 0.50, "Eb3"),
    (2.50, 0.50, "D4"),
    (3.00, 0.50, "Bb3"),
    (3.50, 0.50, "D4"),
    # Mesure 2.
    (4.00, 0.50, "C#3"),
    (4.50, 0.50, "C4"),
    (5.00, 0.50, "Ab3"),
    (5.50, 0.50, "C4"),
    (6.00, 0.50, "C#3"),
    (6.50, 0.50, "C4"),
    (7.00, 0.50, "Ab3"),
    (7.50, 0.50, "C4"),
    # Mesure 3. `Cb4` s'entend Si3 : l'orthographe reste celle de la partition.
    (8.00, 0.50, "C3"),
    (8.50, 0.50, "Cb4"),
    (9.00, 0.50, "G3"),
    (9.50, 0.50, "Cb4"),
    (10.00, 0.50, "Db3"),
    (10.50, 0.50, "Ab3"),
    (11.00, 0.50, "C4"),
    (11.50, 0.50, "Ab3"),
    # Mesure 4 : accord final.
    (12.00, 1.00, "C3"),
    (12.00, 1.00, "G3"),
    (12.00, 1.00, "B3"),
]

# Pédale forte : instants (en temps) où elle est RENOUVELÉE. Levée sur le temps,
# reprise juste après - le geste d'un pianiste, qui nettoie l'harmonie
# précédente sans couper la note qu'on vient de jouer.
#
# Début de chaque mesure, plus deux reprises en cours de mesure : au temps 10,
# juste avant Fa5 La♭4 Do♯5 Fa5 La♭5 comme l'indique la partition, et à l'entrée
# des guirlandes de doubles croches (temps 2,25 et 6,25). Ces deux dernières ne
# sont pas dans le texte mais dans son intention : « la pédale ne doit jamais
# rendre les doubles croches floues », et deux secondes de pédale tenue sur un
# vrai piano les empâtent. La dernière n'est jamais relevée : l'accord final
# résonne librement jusqu'à la fin du clip.
PEDAL = [0.0, 2.25, 4.0, 6.25, 8.0, 10.0, 12.0]
PEDAL_LIFT_S = 0.012    # levée juste avant le temps
PEDAL_PRESS_S = 0.045   # reprise juste après l'attaque

# ---------------------------------------------------------------------------
# Nuances - la seule chose que l'interprétation touche
# ---------------------------------------------------------------------------

# Accents écrits main droite : sommets de phrase et notes de charnière. Multi-
# plicateurs, pas des hauteurs : la partition ne bouge pas.
RIGHT_ACCENTS = {
    0.00: 1.06,   # attaque de la phrase
    0.75: 1.02,   # note tenue
    3.00: 1.05,   # Fa5, sommet de la mesure 1
    4.00: 1.05,
    4.75: 1.02,
    7.00: 1.05,   # Mi♭5, sommet de la mesure 2
    9.00: 1.06,   # Mi5
    10.75: 1.05,  # Fa5
    11.00: 1.10,  # La♭5, point d'arrivée
}

# Voix de l'accord final : un pianiste chante le dessus et allège les voix
# intérieures. Ce n'est ni une note ajoutée ni une note retirée.
CHORD_VOICING = {"C5": 0.88, "E5": 0.83, "G5": 0.97, "C3": 0.92, "G3": 0.80, "B3": 0.76}

VOICINGS = {
    "inner": dict(
        stem="01_jre-ikst-010-01_inner-main",
        title="Hikari no Wa (光の環) - Inner Loop",
        # Vélocités MIDI de référence, avant nuances. Sur un piano échantillonné
        # la vélocité ne change pas que le volume : elle change la couche
        # d'échantillons, donc le timbre. Une main droite plus forte est aussi
        # une main droite plus brillante - c'est exactement ce qu'on veut ici.
        right_vel=96,
        left_vel=62,        # main gauche stable, nettement sous la droite
        pan=0.30,           # ouverture du clavier, graves à gauche
        peak=1.00,          # référence de niveau de la paire
        reverb_mix=0.070,   # quai couvert, pas une salle
        reverb_decay=0.60,
        reverb_damp_hz=4600.0,
        # Égalisation : plateau d'aigu (éclat), bosse de présence (le « bright »
        # du piano), léger creux de bas médium (clarté). Rien au-delà de 2 dB.
        tilt=(("shelf", 3400.0, 1.70), ("bell", 2000.0, 1.10, 0.80), ("bell", 330.0, -0.80, 0.75)),
        seed=1001,
    ),
    "outer": dict(
        stem="02_jre-ikst-010-02_outer-main",
        title="Kaze no Wa (風の環) - Outer Loop",
        right_vel=86,       # toucher plus souple : moins fort, donc plus rond
        left_vel=66,        # écart des mains resserré, la gauche porte plus
        pan=0.40,           # un peu plus d'air
        peak=0.98,
        reverb_mix=0.105,   # résonance plus ample
        reverb_decay=0.80,
        reverb_damp_hz=3400.0,
        # Moins d'aigu, moins de présence, un peu plus de corps : le son recule.
        tilt=(("shelf", 3600.0, -0.70), ("bell", 1800.0, 0.40, 0.80), ("bell", 190.0, 1.00, 0.75)),
        seed=2002,
    ),
}


def right_velocity(beat: float, name: str) -> float:
    """Nuance écrite de la main droite : accents, groupes, crescendo de mesure 3."""
    v = RIGHT_ACCENTS.get(round(beat, 2), 1.0)
    # Les groupes de doubles croches respirent en s'allégeant vers leur fin :
    # c'est ce qui les empêche de sonner comme une machine.
    if beat >= 2.25:
        v *= 1.0 - 0.05 * (beat % 1.0)
    if 8.0 <= beat < 12.0:
        # Crescendo très discret sur toute la mesure 3, sans accélérer.
        v *= 1.0 + 0.07 * (beat - 8.0) / 4.0
    if beat >= 12.0:
        # « Lumineux, propre, apaisé et résolu » : l'accord final n'a aucune
        # raison d'être le point fort du morceau.
        v *= 0.82 * CHORD_VOICING.get(name, 1.0)
    return v


def left_velocity(beat: float, name: str) -> float:
    """Main gauche : régulière, la note grave du temps porte, la contrechant s'efface."""
    on_beat = abs(beat - round(beat)) < 1e-6
    v = 1.0 if on_beat else 0.86
    if abs(beat % 4.0) < 1e-6:
        v *= 1.05                       # premier temps de mesure
    if 8.0 <= beat < 12.0:
        v *= 1.0 + 0.06 * (beat - 8.0) / 4.0
    if beat >= 12.0:
        v *= 0.78 * CHORD_VOICING.get(name, 1.0)
    return v


# ---------------------------------------------------------------------------
# La partition en MIDI
# ---------------------------------------------------------------------------


def _vlq(n: int) -> bytes:
    """Entier en quantité de longueur variable, comme le veut le format MIDI."""
    out = [n & 0x7F]
    n >>= 7
    while n:
        out.append((n & 0x7F) | 0x80)
        n >>= 7
    return bytes(reversed(out))


def _ticks(beat: float) -> int:
    return int(round(beat * TPQ))


def build_midi(voicing: dict) -> bytes:
    """La partition et ses nuances, en un fichier MIDI d'une seule piste.

    Main droite sur le canal 0, main gauche sur le canal 1 : deux panoramiques,
    deux plages de vélocité, un seul instrument. La pédale (CC64) part sur les
    deux canaux - sur un vrai piano il n'y en a qu'une.
    """
    rng = np.random.default_rng(voicing["seed"])
    events: list[tuple[int, int, bytes]] = []   # (tick, priorité, message)

    for ch in (0, 1):
        events.append((0, 0, bytes([0xC0 | ch, GM_BRIGHT_ACOUSTIC_PIANO])))
        side = voicing["pan"] * (1.0 if ch == 0 else -1.0)
        events.append((0, 0, bytes([0xB0 | ch, 10, int(round(64 + 63 * side))])))
        events.append((0, 0, bytes([0xB0 | ch, 7, 100])))

    for ch, score, base, shaper in (
        (0, SCORE_RIGHT, voicing["right_vel"], right_velocity),
        (1, SCORE_LEFT, voicing["left_vel"], left_velocity),
    ):
        for beat, dur_b, name in score:
            # ± 2,5 % de vélocité, jamais de décalage rythmique : le toucher
            # respire, la mesure ne bouge pas d'un millième de temps.
            human = 1.0 + rng.uniform(-0.025, 0.025)
            vel = int(np.clip(round(base * shaper(beat, name) * human), 1, 127))
            note = midi_of(name)
            events.append((_ticks(beat), 2, bytes([0x90 | ch, note, vel])))
            events.append((_ticks(beat + dur_b), 1, bytes([0x80 | ch, note, 0])))

    lift = int(round(PEDAL_LIFT_S / BEAT * TPQ))
    press = int(round(PEDAL_PRESS_S / BEAT * TPQ))
    for beat in PEDAL:
        for ch in (0, 1):
            events.append((max(0, _ticks(beat) - lift), 0, bytes([0xB0 | ch, 64, 0])))
            events.append((_ticks(beat) + press, 3, bytes([0xB0 | ch, 64, 127])))

    # fluidsynth arrête d'écrire peu après le DERNIER ÉVÉNEMENT du fichier, pas
    # quand la dernière corde s'est tue : sans cette borne, la résonance de
    # l'accord final était tronquée net et le clip finissait sur du silence
    # numérique. Une reprise de pédale inaudible, posée après la fin voulue,
    # tient le rendu ouvert jusqu'au bout.
    events.append((_ticks(SCORE_BEATS + TAIL_S / BEAT + 0.25), 4, bytes([0xB0, 64, 127])))

    # À tick égal : contrôleurs, puis note-off, puis note-on, puis la pédale -
    # une note répétée doit s'éteindre avant d'être refrappée, et la pédale se
    # reprendre après l'attaque qu'elle doit tenir.
    events.sort(key=lambda e: (e[0], e[1]))

    track, last = b"", 0
    for tick, _, msg in events:
        track += _vlq(tick - last) + msg
        last = tick
    track += _vlq(0) + bytes([0xFF, 0x2F, 0x00])

    tempo = _vlq(0) + bytes([0xFF, 0x51, 0x03]) + int(60_000_000 / BPM).to_bytes(3, "big")
    body = tempo + track
    return (
        b"MThd" + struct.pack(">IHHH", 6, 0, 1, TPQ)
        + b"MTrk" + struct.pack(">I", len(body)) + body
    )


def find_soundfont(explicit: Path | None) -> Path:
    for candidate in ([explicit] if explicit else []) + [Path(p) for p in SOUNDFONTS]:
        if candidate and candidate.is_file():
            return candidate
    sys.exit(
        "banque d'échantillons introuvable.\n"
        "  apt-get install fluidsynth fluid-soundfont-gm\n"
        "  (ou --soundfont /chemin/vers/une.sf2)"
    )


def read_float_wav(path: Path) -> np.ndarray:
    """Lit un WAV en virgule flottante (n canaux) rendu par fluidsynth.

    Le module `wave` de la bibliothèque standard ne connaît que le PCM entier et
    refuse le format 3 (IEEE float). Parcourir les blocs RIFF à la main coûte
    quinze lignes et évite de rendre en entier, donc d'écrêter avant même la
    normalisation.
    """
    data = path.read_bytes()
    if data[:4] != b"RIFF" or data[8:12] != b"WAVE":
        raise ValueError(f"{path} n'est pas un WAV")
    pos, channels, fmt, bits, pcm = 12, 2, 3, 32, b""
    while pos + 8 <= len(data):
        name = data[pos:pos + 4]
        size = struct.unpack("<I", data[pos + 4:pos + 8])[0]
        chunk = data[pos + 8:pos + 8 + size]
        if name == b"fmt ":
            fmt, channels = struct.unpack("<HH", chunk[:4])
            bits = struct.unpack("<H", chunk[14:16])[0]
        elif name == b"data":
            pcm = chunk
        pos += 8 + size + (size & 1)
    if fmt != 3 or bits != 32:
        raise ValueError(f"{path} : attendu du flottant 32 bits, reçu format {fmt}/{bits} bits")
    return np.frombuffer(pcm, dtype="<f4").astype(np.float64).reshape(-1, channels)


def play(midi: bytes, soundfont: Path, keep_midi: Path | None) -> np.ndarray:
    """Fait jouer la partition par l'échantillonneur, et rend le stéréo brut.

    Réverbération et chorus de fluidsynth coupés : l'espace est ajouté plus bas,
    où il est réglé par version et mesurable. Sortie en flottant - le rendu ne
    peut donc pas écrêter avant la normalisation.
    """
    if not shutil.which("fluidsynth"):
        sys.exit("fluidsynth introuvable : apt-get install fluidsynth fluid-soundfont-gm")

    with tempfile.TemporaryDirectory() as tmp:
        mid = Path(tmp) / "score.mid"
        raw = Path(tmp) / "render.wav"
        mid.write_bytes(midi)
        if keep_midi:
            keep_midi.parent.mkdir(parents=True, exist_ok=True)
            keep_midi.write_bytes(midi)
        subprocess.run(
            ["fluidsynth", "-ni", "-R", "0", "-C", "0", "-g", "0.8",
             "-r", str(SR), "-O", "float", "-F", str(raw), str(soundfont), str(mid)],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        buf = read_float_wav(raw)

    if buf.shape[1] == 1:
        buf = np.repeat(buf, 2, axis=1)

    # Longueur exacte : la musique, puis la résonance libre. fluidsynth s'arrête
    # quand la dernière voix s'est tue, ce qui ne tombe pas au bon endroit.
    want = int((SCORE_BEATS * BEAT + TAIL_S) * SR)
    if buf.shape[0] < want:
        buf = np.vstack([buf, np.zeros((want - buf.shape[0], 2))])
    return buf[:want]


# ---------------------------------------------------------------------------
# Finition
# ---------------------------------------------------------------------------


def reverb_ir(decay_s: float, damp_hz: float, seed: int) -> np.ndarray:
    """Petite salle : bruit dense qui décroît, sans aucune réflexion isolée.

    Pas de peigne, pas de tap discret : on cherche l'air d'un quai couvert
    autour du piano, pas un écho. Le pré-délai reste très court - à dix
    millisecondes, mélangée au son direct, une salle peigne le spectre tous les
    cent hertz, et cette suite régulière de creux s'entend comme un tunnel.
    """
    n = int(decay_s * SR)
    t = np.arange(n) / SR
    rng = np.random.default_rng(seed)
    ir = rng.standard_normal((n, 2))
    ir *= (np.exp(-t / (decay_s / 5.2)) * (1.0 - np.exp(-t / 0.018)))[:, None]

    spec = np.fft.rfft(ir, axis=0)
    f = np.fft.rfftfreq(n, 1.0 / SR)[:, None]
    spec *= 1.0 / (1.0 + (f / damp_hz) ** 2)     # les murs mangent l'aigu
    ir = np.fft.irfft(spec, n=n, axis=0)

    pre = int(0.0035 * SR)
    ir = np.vstack([np.zeros((pre, 2)), ir])
    return ir / (np.sqrt((ir**2).sum(axis=0)).max() or 1.0)


def convolve(x: np.ndarray, h: np.ndarray) -> np.ndarray:
    n = x.shape[0] + h.shape[0] - 1
    nf = 1 << int(np.ceil(np.log2(n)))
    y = np.fft.irfft(
        np.fft.rfft(x, nf, axis=0) * np.fft.rfft(h, nf, axis=0), n=nf, axis=0
    )
    return y[: x.shape[0]]


def soften(buf: np.ndarray) -> np.ndarray:
    """Arrondit les seules pointes isolées (voir SOFT_KNEE). Entrée normalisée à 1."""
    a = np.abs(buf)
    over = a > SOFT_KNEE
    out = buf.copy()
    excess = (a[over] - SOFT_KNEE) / (1.0 - SOFT_KNEE)
    out[over] = np.sign(buf[over]) * (SOFT_KNEE + (1.0 - SOFT_KNEE) * np.tanh(excess))
    return out


def shape(buf: np.ndarray, tilt: tuple) -> np.ndarray:
    """Égalisation douce, à phase nulle : couleur du piano, pas un effet.

    Aucun réglage ne dépasse ±2 dB, et rien n'est dynamique. S'y ajoutent deux
    garde-fous communs aux deux versions : un coupe-bas sous 32 Hz - la pédale
    entasse là des infra-graves inaudibles mais coûteux en crête - et une pente
    au-delà de 17 kHz, qui évite de payer en débit MP3 un aigu que personne
    n'entendra sur un haut-parleur de quai.
    """
    n = buf.shape[0]
    f = np.maximum(np.fft.rfftfreq(n, 1.0 / SR), 1.0)

    g = f**2 / (f**2 + 32.0**2)
    g *= 1.0 / (1.0 + (f / 17_000.0) ** 4)
    for band in tilt:
        if band[0] == "shelf":
            _, hz, db = band
            g *= 10.0 ** ((db / 20.0) * 0.5 * (1.0 + np.tanh(np.log(f / hz) / 0.85)))
        else:
            _, hz, db, width = band
            g *= 10.0 ** ((db / 20.0) * np.exp(-((np.log(f / hz) / width) ** 2)))

    return np.fft.irfft(np.fft.rfft(buf, axis=0) * g[:, None], n=n, axis=0)


def master(buf: np.ndarray, voicing: dict) -> np.ndarray:
    wet = convolve(
        buf, reverb_ir(voicing["reverb_decay"], voicing["reverb_damp_hz"], voicing["seed"])
    )
    mix = voicing["reverb_mix"]
    buf = (1.0 - mix) * buf + mix * wet
    buf = shape(buf, voicing["tilt"])

    peak = float(np.abs(buf).max())
    if peak > 0:
        buf /= peak
    buf = soften(buf)
    buf *= PEAK_TARGET * voicing["peak"] / (np.abs(buf).max() or 1.0)

    # Extinction : le clip s'arrête sur une queue déjà très basse, et la rampe
    # en cosinus finit de l'effacer sans qu'on entende la coupure.
    fade = int(FADE_OUT_S * SR)
    buf[-fade:] *= (0.5 + 0.5 * np.cos(np.linspace(0.0, np.pi, fade)))[:, None]
    return buf


# ---------------------------------------------------------------------------
# Sorties
# ---------------------------------------------------------------------------


def write_wav24(buf: np.ndarray, path: Path) -> None:
    pcm = np.clip(buf, -1.0, 1.0)
    ints = np.round(pcm * (2**23 - 1)).astype("<i4")
    raw = ints.reshape(-1).view(np.uint8).reshape(-1, 4)[:, :3].tobytes()
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(WAV_BITS // 8)
        w.setframerate(SR)
        w.writeframes(raw)


def resample(x: np.ndarray, sr_in: int, sr_out: int) -> np.ndarray:
    """Rééchantillonnage par le spectre (sinus cardinal exact).

    Le signal part de zéro et finit sur une extinction : l'hypothèse circulaire
    de la FFT ne coûte rien ici, et on garde le MP3 dérivé du master WAV plutôt
    que d'un second rendu.
    """
    if sr_in == sr_out:
        return x
    n_in = x.shape[0]
    n_out = int(round(n_in * sr_out / sr_in))
    spec = np.fft.rfft(x, axis=0)
    bins = n_out // 2 + 1
    out = np.zeros((bins, x.shape[1]), dtype=complex)
    k = min(spec.shape[0], bins)
    out[:k] = spec[:k]
    return np.fft.irfft(out, n=n_out, axis=0) * (n_out / n_in)


def write_mp3(buf: np.ndarray, path: Path) -> None:
    pcm = resample(buf, SR, MP3_SR)
    ceiling = float(np.abs(buf).max())
    peak = float(np.abs(pcm).max())
    if peak > ceiling:               # le rééchantillonnage peut dépasser d'un cheveu
        pcm *= ceiling / peak
    pcm16 = (np.clip(pcm, -1.0, 1.0) * 32767.0).astype("<i2")
    enc = lameenc.Encoder()
    enc.set_bit_rate(MP3_BITRATE_KBPS)
    enc.set_in_sample_rate(MP3_SR)
    enc.set_channels(2)
    enc.set_quality(2)
    data = enc.encode(pcm16.tobytes())
    data += enc.flush()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(bytes(data))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", choices=sorted(VOICINGS), help="une seule des deux versions")
    parser.add_argument("--wav-dir", type=Path, default=Path("assets/melodies"))
    parser.add_argument("--mp3-dir", type=Path, default=Path("public/audio/melodies"))
    parser.add_argument("--soundfont", type=Path, help="banque .sf2 à utiliser")
    parser.add_argument("--keep-midi", type=Path, help="dossier où déposer aussi les .mid")
    args = parser.parse_args()

    soundfont = find_soundfont(args.soundfont)
    names = [args.only] if args.only else list(VOICINGS)
    print(f"発車メロディ piano - ♩={BPM:.0f}, 4/4, {SCORE_BEATS} temps "
          f"({SCORE_BEATS * BEAT:.3f} s) + {TAIL_S:.2f} s de résonance")
    print(f"  échantillons : {soundfont}")
    for name in names:
        voicing = VOICINGS[name]
        midi = build_midi(voicing)
        keep = (args.keep_midi / f"{voicing['stem']}.mid") if args.keep_midi else None
        buf = master(play(midi, soundfont, keep), voicing)
        wav = args.wav_dir / f"{voicing['stem']}.wav"
        mp3 = args.mp3_dir / f"{voicing['stem']}.mp3"
        write_wav24(buf, wav)
        write_mp3(buf, mp3)
        rms = float(np.sqrt((buf**2).mean()))
        print(
            f"  {name:5s} {buf.shape[0] / SR:6.3f} s  crête {np.abs(buf).max():.3f}  "
            f"RMS {20 * np.log10(rms):6.2f} dB  - {voicing['title']}"
        )

    print("\nEnsuite : node scripts/melody-manifest-gen.mjs && npm test")


if __name__ == "__main__":
    main()

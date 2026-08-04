#!/usr/bin/env python3
"""Génère les 発車メロディ ORIGINALES du jeu (compositions maison, libres de droits).

Chaque quai câblé dans src/data/melodies.ts reçoit une mélodie composée pour ce
projet, inspirée du CARACTÈRE de la mélodie réelle du quai (gamme, tempo,
timbre, ambiance) sans en reprendre les notes : aucune œuvre protégée n'est
reproduite. Les fichiers gardent les noms attendus par le câblage existant
(public/audio/melodies/<nn>_<slug>.mp3).

Synthèse : additive (cloches FM-like, boîte à musique, koto, trémolo mandoline,
marimba, nappes), écho ping-pong léger, normalisation crête. Sortie MP3 stéréo
44,1 kHz via lameenc.

Dépendances : pip install numpy lameenc
Usage :
  python scripts/melodies-gen.py [public/audio/melodies]

Le script imprime la durée de chaque clip : reporter ces valeurs dans les
constantes *_SECS de src/systems/stationCycle.ts si les mélodies changent.
"""

import argparse
import re
from pathlib import Path

import lameenc
import numpy as np

SR = 44100
BITRATE_KBPS = 160
PEAK_TARGET = 0.88

# ---------------------------------------------------------------------------
# Notes
# ---------------------------------------------------------------------------

NOTE_OFFSETS = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
NOTE_RE = re.compile(r"([A-G])([#b]?)(-?\d)")


def freq_of(name: str) -> float:
    m = NOTE_RE.fullmatch(name)
    if not m:
        raise ValueError(f"note invalide : {name}")
    letter, acc, octv = m.groups()
    semis = NOTE_OFFSETS[letter] + (1 if acc == "#" else -1 if acc == "b" else 0)
    midi = (int(octv) + 1) * 12 + semis
    return 440.0 * 2.0 ** ((midi - 69) / 12.0)


# ---------------------------------------------------------------------------
# Instruments (synthèse additive + enveloppes)
# ---------------------------------------------------------------------------

INSTRUMENTS = {
    # Cloche synthétique glassy - la voix classique des 発車メロディ JR.
    "synthbell": {
        "partials": [(1.0, 1.0), (2.756, 0.40), (5.404, 0.20), (8.933, 0.07)],
        "tau": 0.9,
        "ring": 1.5,
    },
    # Boîte à musique : brillante, décroissance rapide.
    "musicbox": {
        "partials": [(1.0, 1.0), (3.9, 0.30), (9.2, 0.10)],
        "tau": 0.55,
        "ring": 1.1,
    },
    # Koto / corde pincée : harmoniques serrées + bruit d'attaque.
    "koto": {
        "partials": [(1.0, 1.0), (2.0, 0.55), (3.0, 0.35), (4.0, 0.22), (5.0, 0.12), (6.0, 0.07)],
        "tau": 0.55,
        "ring": 1.2,
        "attack_noise": 0.25,
    },
    # Corde pincée claire (cithare) pour la valse d'Ebisu.
    "pluck": {
        "partials": [(1.0, 1.0), (2.0, 0.50), (3.0, 0.30), (4.0, 0.15)],
        "tau": 0.40,
        "ring": 0.9,
        "attack_noise": 0.15,
    },
    # Marimba : sec et rond, pour les marches staccato.
    "marimba": {
        "partials": [(1.0, 1.0), (3.93, 0.35), (9.17, 0.12)],
        "tau": 0.26,
        "ring": 0.6,
    },
    # Mandoline en trémolo (Uguisudani) : tenu, modulation d'amplitude.
    "trem": {
        "partials": [(1.0, 1.0), (2.0, 0.35), (3.0, 0.12)],
        "sustain": True,
        "attack": 0.03,
        "release": 0.30,
        "trem_rate": 8.5,
        "trem_depth": 0.6,
    },
    # Nappe discrète pour les accords de fond.
    "pad": {
        "partials": [(0.9985, 0.5), (1.0015, 0.5), (2.0, 0.12)],
        "sustain": True,
        "attack": 0.18,
        "release": 0.7,
    },
}


def render_note(inst: str, freq: float, dur: float, vel: float) -> np.ndarray:
    spec = INSTRUMENTS[inst]
    sustain = spec.get("sustain", False)
    length = dur + (spec.get("release", 0.4) if sustain else spec.get("ring", 1.0))
    n = int(length * SR)
    t = np.arange(n) / SR

    y = np.zeros(n)
    for mult, amp in spec["partials"]:
        f = freq * mult
        if f > SR * 0.45:
            continue
        y += amp * np.sin(2.0 * np.pi * f * t)

    if sustain:
        env = np.ones(n)
        a = int(spec.get("attack", 0.02) * SR)
        if a > 0:
            env[:a] = np.linspace(0.0, 1.0, a)
        rel_start = int(dur * SR)
        if rel_start < n:
            env[rel_start:] *= np.exp(-(t[rel_start:] - t[rel_start]) / (spec.get("release", 0.4) / 4.0))
        rate = spec.get("trem_rate")
        if rate:
            depth = spec.get("trem_depth", 0.5)
            env *= (1.0 - depth / 2.0) + (depth / 2.0) * np.sin(2.0 * np.pi * rate * t)
    else:
        # Percussif : attaque courte puis décroissance exponentielle ; les notes
        # longues sonnent plus longtemps (tau suit la durée écrite).
        tau = max(spec["tau"], min(dur * 0.85, 1.6))
        env = np.exp(-t / tau)
        a = max(1, int(0.003 * SR))
        env[:a] *= np.linspace(0.0, 1.0, a)
        noise_amt = spec.get("attack_noise", 0.0)
        if noise_amt:
            nn = int(0.015 * SR)
            rng = np.random.default_rng(int(freq * 1000) % 2**31)
            burst = rng.standard_normal(nn) * np.linspace(1.0, 0.0, nn)
            y[:nn] += noise_amt * burst

    # Anti-clic en toute fin de rendu.
    tail = max(1, int(0.02 * SR))
    env[-tail:] *= np.linspace(1.0, 0.0, tail)
    return (y * env * vel).astype(np.float64)


# ---------------------------------------------------------------------------
# Séquenceur + effets
# ---------------------------------------------------------------------------


def place(buf: np.ndarray, mono: np.ndarray, start_s: float, pan: float) -> None:
    """Ajoute un rendu mono dans le buffer stéréo, panoramique constant-power."""
    i0 = int(start_s * SR)
    i1 = min(buf.shape[0], i0 + mono.shape[0])
    if i1 <= i0:
        return
    seg = mono[: i1 - i0]
    theta = (pan + 1.0) * np.pi / 4.0  # -1..1 → 0..π/2
    buf[i0:i1, 0] += seg * np.cos(theta)
    buf[i0:i1, 1] += seg * np.sin(theta)


def ping_pong(buf: np.ndarray, time_s: float = 0.27, fb: float = 0.32, mix: float = 0.18) -> np.ndarray:
    out = buf.copy()
    d = int(time_s * SR)
    echo = buf
    gain = mix
    for k in range(4):
        echo = echo[:, ::-1]  # alterne gauche / droite
        shifted = np.zeros_like(buf)
        if d * (k + 1) < buf.shape[0]:
            shifted[d * (k + 1):] = echo[: buf.shape[0] - d * (k + 1)]
        out += gain * shifted
        gain *= fb
    return out


def master(buf: np.ndarray) -> np.ndarray:
    peak = np.max(np.abs(buf))
    if peak > 0:
        buf = buf * (PEAK_TARGET / peak)
    fade_in = int(0.01 * SR)
    buf[:fade_in] *= np.linspace(0.0, 1.0, fade_in)[:, None]
    fade_out = int(0.25 * SR)
    buf[-fade_out:] *= np.linspace(1.0, 0.0, fade_out)[:, None]
    return buf


def render_melody(m: dict) -> np.ndarray:
    beat = 60.0 / m["bpm"]
    end_beats = 0.0
    voices = []

    for entry in m["notes"]:
        b, dur_b, note = entry[0], entry[1], entry[2]
        vel = entry[3] if len(entry) > 3 else 1.0
        inst = entry[4] if len(entry) > 4 else m["inst"]
        voices.append((b, dur_b, note, vel, inst, 0.0))
        end_beats = max(end_beats, b + dur_b)

    for b, dur_b, chord in m.get("pads", []):
        for j, note in enumerate(chord):
            pan = (-0.35, 0.35, 0.0, -0.2, 0.2)[j % 5]
            voices.append((b, dur_b, note, 0.16, "pad", pan))
        end_beats = max(end_beats, b + dur_b)

    total_s = end_beats * beat + m.get("tail", 1.6)
    buf = np.zeros((int(total_s * SR), 2))
    for b, dur_b, note, vel, inst, pan in voices:
        mono = render_note(inst, freq_of(note), dur_b * beat, vel)
        place(buf, mono, b * beat, pan)

    return master(ping_pong(buf))


def encode_mp3(buf: np.ndarray, path: Path) -> None:
    pcm = np.clip(buf, -1.0, 1.0)
    pcm16 = (pcm * 32767.0).astype("<i2")
    enc = lameenc.Encoder()
    enc.set_bit_rate(BITRATE_KBPS)
    enc.set_in_sample_rate(SR)
    enc.set_channels(2)
    enc.set_quality(2)
    data = enc.encode(pcm16.tobytes())
    data += enc.flush()
    path.write_bytes(bytes(data))


# ---------------------------------------------------------------------------
# Compositions originales (une par branchement de src/data/melodies.ts)
# ---------------------------------------------------------------------------

MELODIES = [
    # Les deux branchements PRINCIPAUX (01 inner-main, 02 outer-main) ne sont
    # plus gravés ici : ce sont désormais deux interprétations d'une même
    # partition pour piano acoustique brillant, produites par
    # scripts/piano-melody-gen.py. Elles demandaient des cordes inharmoniques,
    # une pédale et deux mains d'équilibre distinct - hors du modèle de cloche
    # additive de ce script. Leurs entrées ont donc été retirées de cette liste
    # pour qu'un seul générateur possède chaque fichier de sortie : un
    # `--only 01_… --force` lancé ici ne peut plus écraser le piano par erreur.
    # Ōsaki Inner voie 2 - variante mineure recueillie du motif intérieur.
    dict(
        file="03_jre-ikst-010-03_inner-secondary-osaki.mp3",
        title="Meguri no Yube (めぐりの夕べ)",
        bpm=120,
        inst="musicbox",
        notes=[
            (0, 0.5, "E5"), (0.5, 0.5, "G5"), (1, 0.5, "B5"), (1.5, 1, "E6"),
            (2.5, 0.5, "D6"), (3, 0.5, "B5"), (3.5, 0.5, "A5"), (4, 1, "G5"),
            (5, 0.5, "A5"), (5.5, 0.5, "B5"), (6, 0.5, "G5"), (6.5, 0.5, "E5"),
            (7, 1, "F#5"), (8, 2, "G5"),
            (10, 0.5, "B5"), (10.5, 0.5, "A5"), (11, 0.5, "G5"), (11.5, 0.5, "B5"),
            (12, 2.5, "E6"),
        ],
        pads=[
            (0, 4, ("E3", "B3", "G4")), (4, 3, ("C4", "G4", "E5")),
            (7, 3, ("G3", "D4", "B4")), (10, 4.5, ("E3", "B3", "G4")),
        ],
    ),
    # Ōsaki Outer voie 4 - do majeur allant, réponse claire à la voie 3.
    dict(
        file="04_jre-ikst-010-05_outer-secondary-osaki.mp3",
        title="Asa no Hikari (朝の光)",
        bpm=126,
        inst="synthbell",
        notes=[
            (0, 0.5, "G5"), (0.5, 0.5, "E5"), (1, 0.5, "C5"), (1.5, 0.5, "D5"),
            (2, 0.5, "E5"), (2.5, 0.5, "G5"), (3, 1, "A5"),
            (4, 0.5, "G5"), (4.5, 0.5, "E5"), (5, 0.5, "F5"), (5.5, 0.5, "D5"),
            (6, 1.5, "C5"),
            (8, 0.5, "E5"), (8.5, 0.5, "G5"), (9, 1, "C6"),
            (10, 0.5, "B5"), (10.5, 0.5, "G5"), (11, 0.5, "A5"), (11.5, 0.5, "B5"),
            (12, 2, "C6"),
        ],
        pads=[
            (0, 4, ("C4", "G4", "E5")), (4, 2, ("F3", "C4", "A4")),
            (6, 2, ("C4", "G4", "E5")), (8, 2, ("A3", "E4", "C5")),
            (10, 4, ("C4", "G4", "E5")),
        ],
    ),
    # Komagome Outer voie 1 - printemps au koto, gamme miyako-bushi (la si do
    # mi fa) : évoque les cerisiers sans citer « Sakura Sakura ».
    dict(
        file="05_sakura-sakura-a.mp3",
        title="Harugasumi (春霞)",
        bpm=96,
        inst="koto",
        notes=[
            (0, 1, "A4"), (1, 1, "B4"), (2, 1.5, "C5"), (3.5, 0.5, "E5"),
            (4, 1, "F5"), (5, 1, "E5"), (6, 1.5, "C5"), (7.5, 0.5, "B4"),
            (8, 2, "A4"),
            (10, 1, "E5"), (11, 1, "F5"), (12, 1.5, "A5"), (13.5, 0.5, "E5"),
            (14, 1, "C5"), (15, 1, "B4"), (16, 2.5, "A4"),
        ],
        tail=2.0,
    ),
    # Komagome Inner voie 2 - même gamme une octave plus haut, contour inversé.
    dict(
        file="06_sakura-sakura-b.mp3",
        title="Hanafubuki (花吹雪)",
        bpm=100,
        inst="koto",
        notes=[
            (0, 1, "E5"), (1, 1, "F5"), (2, 1.5, "A5"), (3.5, 0.5, "B5"),
            (4, 1, "C6"), (5, 1, "B5"), (6, 1.5, "A5"), (7.5, 0.5, "F5"),
            (8, 2, "E5"),
            (10, 1, "C6"), (11, 1, "B5"), (12, 1, "A5"), (13, 1, "F5"),
            (14, 1, "E5"), (15, 1, "C5"), (16, 0.5, "B4"), (16.5, 2.5, "A4"),
        ],
        tail=2.0,
    ),
    # Uguisudani Inner voie 2 - mandoline en trémolo, pastorale de printemps
    # (l'uguisu chante) ; même timbre que l'original, mélodie neuve.
    dict(
        file="08_haru-tremolo.mp3",
        title="Haru no Saezuri (春のさえずり)",
        bpm=116,
        inst="trem",
        notes=[
            (0, 1.5, "E5"), (1.5, 0.5, "G5"), (2, 2, "C6"),
            (4, 1, "B5"), (5, 1, "A5"), (6, 2, "G5"),
            (8, 0.5, "A5"), (8.5, 0.5, "G5"), (9, 1, "E5"),
            (10, 1, "F5"), (11, 1, "D5"), (12, 3, "C5"),
        ],
        pads=[
            (0, 4, ("C4", "G4", "E5")), (4, 4, ("F3", "C4", "A4")),
            (8, 2, ("A3", "E4", "C5")), (10, 5, ("C4", "G4", "E5")),
        ],
    ),
    # Six quais Outer « Seseragi » - ruisseau : ostinato de doubles croches
    # pincées sous une mélodie flottante. Fa majeur.
    dict(
        file="09_seseragi.mp3",
        title="Ogawa (小川)",
        bpm=104,
        inst="synthbell",
        notes=[
            (0, 1, "A5", 0.9), (1, 0.5, "G5", 0.9), (1.5, 0.5, "F5", 0.9),
            (2, 1, "G5", 0.9), (3, 1, "C6", 0.9), (4, 1.5, "A5", 0.9),
            (5.5, 0.5, "F5", 0.9), (6, 2, "G5", 0.9), (8, 3, "F5", 0.9),
            # Ostinato ruisseau (pincé, discret).
            *[
                (b + i * 0.25, 0.25, n, 0.30, "pluck")
                for b, chord in [
                    (0, ("F4", "A4", "C5", "A4")), (1, ("F4", "A4", "C5", "A4")),
                    (2, ("C4", "G4", "E5", "G4")), (3, ("C4", "G4", "E5", "G4")),
                    (4, ("D4", "F4", "A4", "F4")), (5, ("D4", "F4", "A4", "F4")),
                    (6, ("Bb3", "F4", "D5", "F4")), (7, ("Bb3", "F4", "D5", "F4")),
                    (8, ("F4", "A4", "C5", "A4")), (9, ("F4", "A4", "C5", "A4")),
                    (10, ("F4", "A4", "C5", "A4")),
                ]
                for i, n in enumerate(chord)
            ],
        ],
        tail=1.8,
    ),
    # Takadanobaba Outer voie 1 - petite marche futuriste staccato (clin d'œil
    # à l'esprit robot du quai, sans citer Astro Boy).
    dict(
        file="10_tetsuwan-atom-a.mp3",
        title="Mirai March ver.A (未来マーチ ver.A)",
        bpm=138,
        inst="marimba",
        notes=[
            (0, 0.5, "C5"), (0.5, 0.5, "E5"), (1, 0.5, "G5"), (1.5, 1, "C6"),
            (2.5, 0.5, "G5"), (3, 0.5, "A5"), (3.5, 0.5, "B5"), (4, 1.5, "C6"),
            (5.5, 0.5, "A5"), (6, 0.5, "G5"), (6.5, 0.5, "E5"),
            (7, 0.5, "F5"), (7.5, 0.5, "D5"), (8, 1, "C5"),
            (9, 0.5, "G5"), (9.5, 0.5, "E5"), (10, 2, "C6", 1.0, "synthbell"),
        ],
        pads=[
            (0, 4, ("C4", "G4", "E5")), (4, 2, ("F3", "C4", "A4")),
            (6, 2, ("G3", "D4", "B4")), (8, 4, ("C4", "G4", "E5")),
        ],
    ),
    # Takadanobaba Inner voie 2 - la même marche vue depuis sol majeur.
    dict(
        file="11_tetsuwan-atom-b.mp3",
        title="Mirai March ver.B (未来マーチ ver.B)",
        bpm=138,
        inst="marimba",
        notes=[
            (0, 0.5, "G5"), (0.5, 0.5, "B5"), (1, 0.5, "D6"), (1.5, 1, "E6"),
            (2.5, 0.5, "D6"), (3, 0.5, "C6"), (3.5, 0.5, "B5"), (4, 1, "A5"),
            (5, 0.5, "B5"), (5.5, 0.5, "C6"), (6, 1, "D6"),
            (7, 0.5, "B5"), (7.5, 0.5, "G5"), (8, 0.5, "A5"), (8.5, 0.5, "F#5"),
            (9, 2, "G5", 1.0, "synthbell"),
        ],
        pads=[
            (0, 4, ("G3", "D4", "B4")), (4, 2, ("A3", "E4", "C5")),
            (6, 2, ("D4", "A4", "F#5")), (8, 3, ("G3", "D4", "B4")),
        ],
    ),
    # Ebisu Inner voie 2 - valse à la cithare (l'original est une valse de
    # cithare) : trois temps pincés, mélodie neuve en ré majeur.
    dict(
        file="13_the-third-man-f.mp3",
        title="Yugure Waltz (夕暮れワルツ)",
        bpm=150,
        inst="pluck",
        notes=[
            (0, 1, "D5"), (1, 1, "F#5"), (2, 1, "A5"), (3, 2, "B5"),
            (5, 1, "A5"), (6, 1, "G5"), (7, 1, "E5"), (8, 1, "C#5"),
            (9, 2, "D5"),
            (12, 1, "F#5"), (13, 1, "A5"), (14, 1, "D6"), (15, 2, "C#6"),
            (17, 1, "A5"), (18, 1, "B5"), (19, 1, "G5"), (20, 1, "E5"),
            (21, 3, "D5"),
        ],
        pads=[
            (0, 6, ("D4", "A4", "F#5")), (6, 3, ("G3", "D4", "B4")),
            (9, 3, ("D4", "A4", "F#5")), (12, 5, ("D4", "A4", "F#5")),
            (17, 3, ("A3", "E4", "C#5")), (20, 4, ("D4", "A4", "F#5")),
        ],
    ),
    # Takanawa Gateway Inner voie 1 - cloches aériennes, la majeur add9,
    # moderne comme la gare.
    dict(
        file="14_glorious-gateway-a.mp3",
        title="Aurora Gate ver.A",
        bpm=112,
        inst="synthbell",
        notes=[
            (0, 1, "E5"), (1, 1, "A5"), (2, 1, "B5"), (3, 2, "C#6"),
            (5, 1, "B5"), (6, 1, "A5"), (7, 2, "F#5"),
            (9, 1, "A5"), (10, 2, "E6"), (12, 1, "C#6"), (13, 1, "B5"),
            (14, 3, "A5"),
        ],
        pads=[
            (0, 5, ("A3", "E4", "C#5", "B4")), (5, 4, ("D4", "A4", "F#5")),
            (9, 4, ("E4", "B4", "G#4")), (13, 4, ("A3", "E4", "C#5", "B4")),
        ],
    ),
    # Takanawa Gateway Outer voie 2 - miroir descendant de la version A.
    dict(
        file="15_glorious-gateway-b.mp3",
        title="Aurora Gate ver.B",
        bpm=112,
        inst="synthbell",
        notes=[
            (0, 1, "E6"), (1, 1, "C#6"), (2, 1, "B5"), (3, 2, "A5"),
            (5, 1, "B5"), (6, 1, "C#6"), (7, 2, "F#5"),
            (9, 1, "A5"), (10, 1, "B5"), (11, 2, "E5"),
            (13, 3, "A5"),
        ],
        pads=[
            (0, 5, ("A3", "E4", "C#5", "B4")), (5, 4, ("D4", "A4", "F#5")),
            (9, 4, ("E4", "B4", "G#4")), (13, 3, ("A3", "E4", "C#5", "B4")),
        ],
    ),
    # Kanda Outer voie 2 - jingle publicitaire guilleret (l'esprit CM song),
    # fa majeur rebondi.
    dict(
        file="16_mondamin-cm-song-a.mp3",
        title="Asa no Jingle ver.A (朝のジングル ver.A)",
        bpm=126,
        inst="musicbox",
        notes=[
            (0, 0.5, "F5"), (0.5, 0.5, "G5"), (1, 1, "A5"),
            (2, 0.5, "F5"), (2.5, 0.5, "A5"), (3, 1.5, "C6"),
            (4.5, 0.5, "Bb5"), (5, 0.5, "A5"), (5.5, 0.5, "G5"),
            (6, 0.5, "A5"), (6.5, 1, "F5"),
            (8, 0.5, "G5"), (8.5, 0.5, "A5"), (9, 1, "Bb5"),
            (10, 1, "G5"), (11, 2.5, "F5"),
        ],
        pads=[
            (0, 4, ("F3", "C4", "A4")), (4, 2, ("Bb3", "F4", "D5")),
            (6, 2, ("F3", "C4", "A4")), (8, 2, ("C4", "G4", "E5")),
            (10, 3.5, ("F3", "C4", "A4")),
        ],
    ),
    # Kanda Inner voie 3 - même jingle, phrase répondue en descente.
    dict(
        file="17_mondamin-cm-song-b.mp3",
        title="Asa no Jingle ver.B (朝のジングル ver.B)",
        bpm=126,
        inst="musicbox",
        notes=[
            (0, 0.5, "C6"), (0.5, 0.5, "A5"), (1, 1, "F5"),
            (2, 0.5, "G5"), (2.5, 0.5, "A5"), (3, 1, "G5"),
            (4, 0.5, "Bb5"), (4.5, 0.5, "A5"), (5, 0.5, "G5"), (5.5, 0.5, "F5"),
            (6, 1, "E5"),
            (7, 0.5, "F5"), (7.5, 0.5, "G5"), (8, 1, "A5"),
            (9, 1, "G5"), (10, 2.5, "F5"),
        ],
        pads=[
            (0, 4, ("F3", "C4", "A4")), (4, 2, ("Bb3", "F4", "D5")),
            (6, 2, ("C4", "G4", "E5")), (8, 4.5, ("F3", "C4", "A4")),
        ],
    ),
    # Ikebukuro Inner voie 5 - pop électrique syncopée, sol majeur brillant.
    dict(
        file="18_bic-camera-theme-a.mp3",
        title="Denki Pop ver.A (電気ポップ ver.A)",
        bpm=132,
        inst="synthbell",
        notes=[
            (0, 0.5, "D5"), (0.5, 0.5, "G5"), (1, 0.75, "B5"), (1.75, 0.25, "A5"),
            (2, 0.5, "B5"), (2.5, 1, "D6"),
            (3.5, 0.5, "B5"), (4, 0.5, "C6"), (4.5, 0.5, "A5"), (5, 1, "G5"),
            (6, 0.5, "E5"), (6.5, 0.5, "F#5"), (7, 0.5, "G5"), (7.5, 0.5, "A5"),
            (8, 0.5, "B5"), (8.5, 0.5, "G5"), (9, 1.5, "D6"),
            (10.5, 0.5, "C6"), (11, 0.5, "B5"), (11.5, 0.5, "A5"),
            (12, 2, "G5"),
        ],
        pads=[
            (0, 3.5, ("G3", "D4", "B4")), (3.5, 2.5, ("C4", "G4", "E5")),
            (6, 3, ("E3", "B3", "G4")), (9, 2, ("D4", "A4", "F#5")),
            (11, 3, ("G3", "D4", "B4")),
        ],
    ),
    # Ikebukuro Inner voie 6 - même pop, réponse dans l'aigu.
    dict(
        file="19_bic-camera-theme-b.mp3",
        title="Denki Pop ver.B (電気ポップ ver.B)",
        bpm=132,
        inst="synthbell",
        notes=[
            (0, 0.5, "B5"), (0.5, 0.5, "D6"), (1, 0.75, "G6"), (1.75, 0.25, "F#6"),
            (2, 0.5, "E6"), (2.5, 1, "D6"),
            (3.5, 0.5, "E6"), (4, 0.5, "C6"), (4.5, 0.5, "B5"), (5, 1, "A5"),
            (6, 0.5, "B5"), (6.5, 0.5, "C6"), (7, 0.5, "D6"), (7.5, 0.5, "E6"),
            (8, 0.5, "D6"), (8.5, 0.5, "B5"), (9, 1, "A5"),
            (10, 2.5, "G5"),
        ],
        pads=[
            (0, 3.5, ("G3", "D4", "B4")), (3.5, 2.5, ("C4", "G4", "E5")),
            (6, 3, ("D4", "A4", "F#5")), (9, 3.5, ("G3", "D4", "B4")),
        ],
    ),
    # Inner Loop principal ver.B - seconde version du même branchement, pour que
    # les vingt quais Inner ne sonnent pas tous pareil. Se rapproche du CARACTÈRE
    # du 010-01 réel : la bémol majeur (quatre bémols), ♩=110, guirlandes de
    # doubles croches, notes de passage chromatiques et basse en croches
    # continues sous la cloche. Mélodie neuve : rien n'est transcrit.
    dict(
        file="20_jre-ikst-010-01_inner-main-v2.mp3",
        title="Meguri no Asa ver.B (めぐりの朝 ver.B)",
        bpm=110,
        inst="synthbell",
        notes=[
            (0, 0.5, "Eb5"), (0.5, 0.5, "Ab5"),
            (1, 0.25, "C6"), (1.25, 0.25, "Bb5"), (1.5, 0.5, "C6"),
            (2, 1, "Eb6"),
            (3, 0.25, "Db6"), (3.25, 0.25, "C6"), (3.5, 0.5, "Bb5"),
            (4, 1.5, "Ab5"), (5.5, 0.5, "G5"),
            (6, 0.25, "Ab5"), (6.25, 0.25, "Bb5"), (6.5, 0.5, "C6"),
            (7, 1, "Eb6"),
            (8, 0.5, "F6"), (8.5, 0.5, "Eb6"), (9, 0.5, "C6"), (9.5, 0.5, "Bb5"),
            (10, 0.75, "Ab5"), (10.75, 0.25, "G5"), (11, 1, "Ab5"),
            (12, 0.25, "Bb5"), (12.25, 0.25, "C6"), (12.5, 0.5, "Db6"),
            (13, 0.5, "C6"), (13.5, 0.5, "Bb5"),
            (14, 2, "Ab5"),
            # Basse en croches continues (main gauche du modèle), discrète.
            *[
                (b + i * 0.5, 0.5, n, 0.28, "pluck")
                for b, chord in [
                    (0, ("Ab2", "Eb3", "Ab3", "Eb3")),
                    (2, ("Ab2", "Eb3", "C4", "Eb3")),
                    (4, ("F2", "C3", "F3", "C3")),
                    (6, ("Eb2", "Bb2", "Eb3", "G3")),
                    (8, ("Db2", "Ab2", "Db3", "F3")),
                    (10, ("C3", "Eb3", "Ab3", "Eb3")),
                    (12, ("Bb2", "F3")),
                    (13, ("Eb2", "Bb2")),
                    (14, ("Ab2", "Eb3", "Ab3", "Eb3")),
                ]
                for i, n in enumerate(chord)
            ],
        ],
        pads=[
            (0, 4, ("Ab3", "Eb4", "C5")), (4, 2, ("F3", "C4", "Ab4")),
            (6, 2, ("Eb3", "Bb3", "G4")), (8, 2, ("Db4", "Ab4", "F5")),
            (10, 2, ("Ab3", "Eb4", "C5")), (12, 1, ("Bb3", "F4", "Db5")),
            (13, 1, ("Eb3", "Bb3", "G4")), (14, 2, ("Ab3", "Eb4", "C5")),
        ],
    ),
    # Outer Loop principal ver.B - pendant de la précédente pour les dix-huit
    # quais Outer : même la bémol majeur et même ♩=110, mais départ syncopé
    # (après le temps), contour retombant et cadence V–I sous la tonique tenue.
    dict(
        file="21_jre-ikst-010-02_outer-main-v2.mp3",
        title="Sotomawari no Kaze ver.B (外回りの風 ver.B)",
        bpm=110,
        inst="synthbell",
        notes=[
            (0.25, 0.25, "Eb6"), (0.5, 0.5, "C6"),
            (1, 0.25, "Bb5"), (1.25, 0.25, "C6"), (1.5, 0.5, "Db6"),
            (2, 1, "C6"),
            (3, 0.5, "Ab5"), (3.5, 0.5, "Bb5"),
            (4, 1.5, "C6"), (5.5, 0.25, "Bb5"), (5.75, 0.25, "Ab5"),
            (6, 0.5, "G5"), (6.5, 0.5, "Ab5"),
            (7, 1, "Eb5"),
            (8, 0.5, "F5"), (8.5, 0.5, "Ab5"),
            (9, 0.25, "C6"), (9.25, 0.25, "Db6"), (9.5, 0.5, "Eb6"),
            (10, 1, "F6"),
            (11, 0.5, "Eb6"), (11.5, 0.5, "C6"),
            (12, 0.75, "Bb5"), (12.75, 0.25, "A5"),
            (13, 0.5, "Ab5"), (13.5, 0.5, "C6"),
            (14, 2, "Ab5"),
            *[
                (b + i * 0.5, 0.5, n, 0.28, "pluck")
                for b, chord in [
                    (0, ("Ab2", "Eb3", "Ab3", "C4")),
                    (2, ("F2", "C3", "F3", "Ab3")),
                    (4, ("Db2", "Ab2", "Db3", "F3")),
                    (6, ("Eb2", "Bb2", "Eb3", "G3")),
                    (8, ("Ab2", "Eb3", "Ab3", "C4")),
                    (10, ("Db2", "Ab2", "Db3", "F3")),
                    (12, ("Bb2", "F3", "Bb3", "Db4")),
                    (14, ("Eb2", "Bb2")),
                    (15, ("Ab2", "Eb3")),
                ]
                for i, n in enumerate(chord)
            ],
        ],
        pads=[
            (0, 2, ("Ab3", "Eb4", "C5")), (2, 2, ("F3", "C4", "Ab4")),
            (4, 2, ("Db4", "Ab4", "F5")), (6, 2, ("Eb3", "Bb3", "G4")),
            (8, 2, ("Ab3", "Eb4", "C5")), (10, 2, ("Db4", "Ab4", "F5")),
            (12, 2, ("Bb3", "F4", "Db5")), (14, 1, ("Eb3", "Bb3", "G4")),
            (15, 1, ("Ab3", "Eb4", "C5")),
        ],
    ),
]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    selection = parser.add_mutually_exclusive_group()
    selection.add_argument("--only", help="file name or stem of one composition")
    selection.add_argument("--missing", action="store_true", help="generate only absent assets")
    parser.add_argument("--output", type=Path, default=Path("public/audio/melodies"))
    parser.add_argument("--force", action="store_true", help="replace an explicitly selected asset")
    args = parser.parse_args()
    if args.force and not args.only:
        parser.error("--force is only allowed with --only")
    out_dir = args.output
    out_dir.mkdir(parents=True, exist_ok=True)

    selected = MELODIES
    if args.only:
        needle = args.only.removesuffix(".mp3")
        selected = [m for m in MELODIES if Path(m["file"]).stem == needle or m["file"] == args.only]
        if not selected:
            parser.error(f"unknown composition: {args.only}")
    elif not args.missing:
        parser.error("refusing to overwrite the library: use --missing or --only")

    print("Génération des 発車メロディ originales :")
    generated = 0
    for m in selected:
        path = out_dir / m["file"]
        if path.exists() and not args.force:
            print(f"  skip {m['file']} (already exists)")
            continue
        buf = render_melody(m)
        encode_mp3(buf, path)
        generated += 1
        dur = buf.shape[0] / SR
        print(f"  {m['file']:44s} {dur:5.1f} s  - {m['title']}")

    print(f"\n{generated} asset(s) generated; existing files were preserved.")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Grave la 発車メロディ PIANO des deux branchements principaux (Inner / Outer).

Pourquoi un second générateur à côté de scripts/melodies-gen.py : celui-là
synthétise des cloches additives (partiels fixes, écho ping-pong, une seule
voix). Un piano acoustique demande autre chose - cordes inharmoniques, double
décroissance, étouffoirs, pédale, deux mains d'équilibre différent - et ces
notions n'ont pas de sens pour les autres timbres de la bibliothèque. Les deux
scripts restent donc séparés ; seul le format de sortie est commun (MP3 stéréo
44,1 kHz, 160 kb/s, crête ~0,84) pour que les vingt clips sonnent au même
niveau sur le quai.

UNE partition, DEUX interprétations. `SCORE_RIGHT`, `SCORE_LEFT` et `PEDAL`
sont uniques et partagés : hauteurs, octaves, durées, silences et positions
rythmiques sont donc identiques par construction dans les deux fichiers. Ce qui
change d'une version à l'autre vit dans `VOICINGS` : vélocités, équilibre des
mains, attaque, brillance, largeur stéréo, pédale et réverbération.

  Inner Loop  - un peu plus lumineuse, main droite plus présente, attaque
                claire et petite brillance cristalline.
  Outer Loop  - un peu plus douce et aérienne, main gauche plus ronde, son
                moins frontal, résonance plus ample.

Sorties :
  assets/melodies/<nom>.wav          master WAV stéréo 48 kHz / 24 bits
  public/audio/melodies/<nom>.mp3    clip joué par le jeu (44,1 kHz, 160 kb/s)

Les WAV vivent hors de public/ à dessein : Vite recopie public/ tel quel dans
le build, et six mégaoctets de master n'ont rien à faire dans le site.

Dépendances : pip install numpy lameenc
Usage :
  python scripts/piano-melody-gen.py               # grave les deux versions
  python scripts/piano-melody-gen.py --only inner
  python scripts/piano-melody-gen.py --wav-dir /tmp/x --mp3-dir /tmp/x

Après regravure : `node scripts/melody-manifest-gen.mjs` (le manifeste des
durées taille la fenêtre sonore de l'arrêt) puis `npm test`.
"""

import argparse
import re
import wave
from pathlib import Path

import lameenc
import numpy as np

# --- Format ----------------------------------------------------------------

SR = 48_000            # rendu et master WAV
MP3_SR = 44_100        # comme les dix-sept autres clips de la bibliothèque
MP3_BITRATE_KBPS = 160
WAV_BITS = 24

BPM = 110.0
BEAT = 60.0 / BPM      # 0,545454... s
SCORE_BEATS = 16       # 4/4, quatre mesures -> 8,727 s de musique
TAIL_S = 1.72          # résonance libre après la dernière mesure
FADE_OUT_S = 0.55      # extinction douce, sous -25 dB : ne coupe pas la queue

# Crête visée sur le master (-0,54 dBFS). Un peu plus haut que la bibliothèque
# (ses MP3 redonnent 0,82 à 0,86 une fois décodés) et c'est VOULU : un piano a
# un facteur de crête bien plus grand qu'une cloche doublée d'une nappe. À crête
# égale, ces deux clips s'entendraient nettement plus bas que les dix-sept
# autres. On ferme l'écart par la crête plutôt que par un compresseur ; il reste
# environ un décibel de marge après encodage, et aucun échantillon n'écrête.
PEAK_TARGET = 0.92

# Arrondi de crête. Un piano a un facteur de crête bien plus élevé qu'une
# cloche : normalisées à la même crête, ces mélodies s'entendaient 3 dB plus
# bas que les dix-sept autres clips du quai. Ceci n'est PAS un compresseur -
# aucun détecteur de niveau, aucune constante de temps, aucun effet sur la
# dynamique musicale : c'est une courbe fixe qui n'arrondit que les échantillons
# au-delà de SOFT_KNEE (0,3 % du fichier, tous dans les premières millisecondes
# d'une attaque), d'un peu moins d'un décibel. Le reste du signal est rendu
# intact, et la dynamique entre les nuances est conservée.
SOFT_KNEE = 0.55

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


def freq_of(name: str) -> float:
    return 440.0 * 2.0 ** ((midi_of(name) - 69) / 12.0)


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

# Pédale : (début, fin) en temps. Renouvelée au premier temps de chaque mesure,
# plus un demi-renouvellement au temps 10, juste avant Fa5 La♭4 Do♯5 Fa5 La♭5.
# `None` en fin = pédale gardée jusqu'au bout : l'accord final résonne libre.
PEDAL = [(0.0, 4.0), (4.0, 8.0), (8.0, 10.0), (10.0, 12.0), (12.0, None)]

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
        right_gain=0.86,     # main droite nettement en avant
        left_gain=0.57,
        peak=1.00,           # référence de niveau de la paire
        brightness=1.00,     # pente des partiels : plus haut = plus cristallin
        attack_ms=2.0,       # attaque claire
        hammer=0.045,        # bruit de marteau : la brillance de l'attaque
        width=0.48,          # panoramique par registre, assez tenu
        reverb_mix=0.10,
        reverb_decay=0.70,
        reverb_damp_hz=4200.0,
        pedal_tau_right=1.60,   # doubles croches nettes : la pédale ne les lie pas
        pedal_tau_left=1.05,    # graves écourtés : pas d'accumulation
        # Égalisation : plateau d'aigu (éclat), bosse de présence (le « bright »
        # d'un piano brillant), léger creux de bas médium (clarté).
        tilt=(("shelf", 3200.0, 2.00), ("bell", 1900.0, 1.40, 0.80), ("bell", 330.0, -0.90, 0.75)),
        seed=1001,
    ),
    "outer": dict(
        stem="02_jre-ikst-010-02_outer-main",
        title="Kaze no Wa (風の環) - Outer Loop",
        right_gain=0.79,     # écart des mains resserré : la gauche porte plus
        left_gain=0.62,
        peak=0.96,           # -0,35 dB : la version Outer est un rien plus douce
        brightness=0.90,     # moins frontal
        attack_ms=4.2,       # toucher plus souple
        hammer=0.028,
        width=0.60,          # un peu plus d'air
        reverb_mix=0.155,
        reverb_decay=0.95,   # résonance plus ample
        reverb_damp_hz=3200.0,
        pedal_tau_right=2.30,
        pedal_tau_left=1.35,
        # Moins d'aigu, moins de présence, un peu plus de corps : le son recule.
        tilt=(("shelf", 3600.0, -0.60), ("bell", 1800.0, 0.60, 0.80), ("bell", 190.0, 1.15, 0.75)),
        seed=2002,
    ),
}

# ---------------------------------------------------------------------------
# Une corde de piano
# ---------------------------------------------------------------------------

DAMPER_TAU = 0.075          # chute de l'étouffoir, aigus
DAMPER_TAU_BASS = 0.115     # les grosses cordes s'arrêtent moins net
SLOW_LEVEL = 0.23           # part de la décroissance lente (« aftersound »)
HAMMER_POS = 0.125          # marteau au huitième de la corde -> creux du peigne


def string_params(f0: float) -> tuple[float, float, int]:
    """Décroissance, inharmonicité et nombre de partiels d'une corde."""
    # Les cordes graves tiennent plus longtemps, sans exagérer : le clip ne
    # dure que dix secondes et la queue doit s'éteindre d'elle-même.
    tau = float(np.clip(3.6 * (261.63 / f0) ** 0.45, 1.10, 4.60))
    # Raideur : quasi nulle dans le médium grave, sensible dans l'aigu - c'est
    # elle qui donne le petit éclat métallique d'un piano brillant.
    stiff = float(np.clip(8.0e-5 * (f0 / 261.63) ** 1.2, 3.0e-5, 1.2e-3))
    partials = int(np.clip(0.44 * SR / f0, 4, 26))
    return tau, stiff, partials


def render_note(
    name: str,
    dur_s: float,
    vel: float,
    off_s: float,
    lift_s: float | None,
    pedal_tau: float | None,
    voicing: dict,
    seed: int,
    max_s: float,
) -> np.ndarray:
    """Une note de piano, de l'attaque à l'extinction de l'étouffoir.

    `off_s` : instant où la touche est relâchée (fin écrite de la note).
    `lift_s` : instant où la pédale est relâchée (`None` = gardée jusqu'au bout).
    `pedal_tau` : décroissance ajoutée entre les deux - c'est le « demi-pédale »
    qui laisse chanter la phrase sans noyer les doubles croches.
    """
    midi = midi_of(name)
    f0 = freq_of(name)
    tau, stiff, n_partials = string_params(f0)

    # Longueur à rendre : la note plus ce qu'il reste à entendre après
    # l'étouffoir. Inutile de calculer une queue que l'étouffoir a mangée.
    damp_at = max(off_s, lift_s if lift_s is not None else off_s)
    natural = dur_s + 6.5 * tau
    length = min(natural, damp_at + 0.55) if lift_s is not None else natural
    n = int(min(length, max_s) * SR)   # rien à calculer au-delà de la fin du clip
    if n <= 0:
        return np.zeros(0)
    t = np.arange(n) / SR

    rng = np.random.default_rng(seed)
    y = np.zeros(n)

    # Peigne du marteau : le point de frappe annule les partiels multiples de 8.
    # Plus on frappe fort, plus les partiels hauts sortent (la corde s'ouvre).
    tilt = (1.30 - 0.42 * vel) / voicing["brightness"]
    amps, freqs, taus = [], [], []
    for k in range(1, n_partials + 1):
        f = f0 * k * np.sqrt(1.0 + stiff * k * k)
        if f > 0.46 * SR:
            break
        a = abs(np.sin(np.pi * k * HAMMER_POS)) / k**tilt
        amps.append(a)
        freqs.append(f)
        # Les partiels hauts s'éteignent les premiers : c'est ça, le « son qui
        # s'assombrit » d'un piano, et ce qui empêche la queue de siffler.
        taus.append(max(0.12, tau / (1.0 + 0.22 * (k - 1) ** 1.15)))

    norm = sum(amps) or 1.0

    # Phases de Schroeder. La phase de départ d'un partiel n'a rien d'absolu -
    # elle dépend du marteau, du point de frappe, de l'instant. Leur RÉPARTITION,
    # elle, décide du facteur de crête de la somme : en phase, vingt partiels
    # empilent une pointe qui ne s'entend pas mais mange toute la marge de
    # normalisation. Une répartition quadratique étale la même énergie sur la
    # période. Spectre inchangé (donc timbre inchangé), plusieurs décibels de
    # crête en moins - c'est ce qui permet à ce piano de s'entendre au même
    # niveau que les cloches de la bibliothèque sans rien écraser.
    power = np.array(amps) ** 2
    power /= power.sum() or 1.0
    phases = np.concatenate([[0.0], -2.0 * np.pi * np.cumsum(np.cumsum(power))[:-1]])

    for a, f, tk, phase in zip(amps, freqs, taus, phases):
        # Double décroissance : chute rapide, puis longue traîne. Sans elle un
        # piano de synthèse sonne comme une cloche.
        env = (1.0 - SLOW_LEVEL) * np.exp(-t / (0.28 * tk)) + SLOW_LEVEL * np.exp(-t / tk)
        # Battement des cordes à l'unisson (deux ou trois par note) : très lent,
        # mais c'est lui qui fait « vivre » la tenue.
        beat_hz = min(6.5, 0.55 + 0.9 * (f / f0) * rng.uniform(0.8, 1.2))
        env *= 1.0 - 0.06 + 0.06 * np.cos(2.0 * np.pi * beat_hz * t + rng.uniform(0.0, 6.28))
        y += (a / norm) * env * np.sin(2.0 * np.pi * f * t + phase)

    # Attaque : quelques millisecondes en cosinus surélevé, jamais un front raide
    # (qui claquerait) ni une rampe longue (qui ferait cloche).
    atk = max(2, int(voicing["attack_ms"] * 1e-3 * SR))
    y[:atk] *= 0.5 - 0.5 * np.cos(np.linspace(0.0, np.pi, atk))

    # Bruit de marteau : le grain de bois-feutre de l'attaque. Passe-haut grossier
    # (différence première) pour qu'il reste dans l'aigu et ne salisse pas les graves.
    hammer = voicing["hammer"] * vel
    if hammer > 0:
        nh = int(0.012 * SR)
        burst = rng.standard_normal(nh)
        burst = np.diff(burst, prepend=0.0)
        burst *= np.exp(-np.linspace(0.0, 7.0, nh)) * (f0 / 440.0) ** 0.25
        y[:nh] += hammer * burst / (np.abs(burst).max() or 1.0)

    # Étouffoir et pédale.
    damper_tau = DAMPER_TAU_BASS if midi < 55 else DAMPER_TAU
    g = np.ones(n)
    i_off = min(n, max(0, int(off_s * SR)))
    i_lift = n if lift_s is None else min(n, max(0, int(lift_s * SR)))
    i_lift = max(i_lift, i_off)
    if pedal_tau is not None and i_lift > i_off:
        g[i_off:i_lift] = np.exp(-(t[i_off:i_lift] - t[i_off]) / pedal_tau)
    if i_lift < n:
        g[i_lift:] = g[i_lift - 1] * np.exp(-(t[i_lift:] - t[i_lift]) / damper_tau)
    y *= g

    # Compensation de registre : à amplitude égale une basse s'entend moins.
    reg = float(np.clip((261.63 / f0) ** 0.18, 0.82, 1.30))
    return y * vel * reg


# ---------------------------------------------------------------------------
# Mixage, espace, égalisation
# ---------------------------------------------------------------------------


def place(buf: np.ndarray, mono: np.ndarray, start_s: float, pan: float) -> None:
    """Ajoute un rendu mono dans le buffer stéréo (panoramique à puissance constante)."""
    i0 = int(start_s * SR)
    i1 = min(buf.shape[0], i0 + mono.shape[0])
    if i1 <= i0:
        return
    seg = mono[: i1 - i0]
    theta = (np.clip(pan, -1.0, 1.0) + 1.0) * np.pi / 4.0
    buf[i0:i1, 0] += seg * np.cos(theta)
    buf[i0:i1, 1] += seg * np.sin(theta)


def reverb_ir(decay_s: float, damp_hz: float, seed: int) -> np.ndarray:
    """Petite salle : bruit dense qui décroît, sans aucune réflexion isolée.

    Pas de peigne, pas de tap discret : on cherche l'air d'un quai couvert
    autour du piano, pas un écho. Le pré-délai reste sous 12 ms pour que la
    réverbération se colle au son de l'instrument.
    """
    n = int(decay_s * SR)
    t = np.arange(n) / SR
    rng = np.random.default_rng(seed)
    ir = rng.standard_normal((n, 2))
    ir *= (np.exp(-t / (decay_s / 5.2)) * (1.0 - np.exp(-t / 0.018)))[:, None]

    # Amortissement de l'aigu (les murs mangent les hautes fréquences).
    spec = np.fft.rfft(ir, axis=0)
    f = np.fft.rfftfreq(n, 1.0 / SR)[:, None]
    spec *= 1.0 / (1.0 + (f / damp_hz) ** 2)
    ir = np.fft.irfft(spec, n=n, axis=0)

    pre = int(0.010 * SR)
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

    Aucun réglage ne dépasse ±2 dB, et rien n'est dynamique : on choisit la
    couleur de l'instrument (plus cristalline, ou plus en retrait), pas un
    traitement. S'y ajoutent deux garde-fous qui valent pour les deux versions :
    un coupe-bas sous 32 Hz - la pédale entasse là des infra-graves inaudibles
    mais coûteux en crête - et une pente au-delà de 17 kHz, qui évite de payer
    en débit MP3 un aigu que personne n'entendra sur un haut-parleur de quai.
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


# ---------------------------------------------------------------------------
# Séquenceur
# ---------------------------------------------------------------------------


def pedal_for(beat: float) -> tuple[float | None, bool]:
    """Fin (en temps) du segment de pédale qui couvre ce temps, et s'il est ouvert."""
    for start, end in PEDAL:
        if end is None:
            if beat >= start:
                return None, True
        elif start <= beat < end:
            return end, False
    return None, True


def right_velocity(beat: float, name: str, index: int) -> float:
    """Nuance écrite de la main droite : accents, groupes, crescendo de mesure 3."""
    v = RIGHT_ACCENTS.get(round(beat, 2), 1.0)
    # Les groupes de doubles croches respirent en s'allégeant vers leur fin :
    # c'est ce qui les empêche de sonner comme une machine.
    if beat >= 2.25:
        pos = (beat % 1.0) / 1.0
        v *= 1.0 - 0.05 * pos
    if 8.0 <= beat < 12.0:
        # Crescendo très discret sur toute la mesure 3, sans accélérer.
        v *= 1.0 + 0.07 * (beat - 8.0) / 4.0
    if beat >= 12.0:
        v *= 0.92 * CHORD_VOICING.get(name, 1.0)
    return v


def left_velocity(beat: float, name: str, index: int) -> float:
    """Main gauche : régulière, la note grave du temps porte, la contrechant s'efface."""
    on_beat = abs(beat - round(beat)) < 1e-6
    v = 1.0 if on_beat else 0.86
    if abs(beat % 4.0) < 1e-6:
        v *= 1.05                       # premier temps de mesure
    if 8.0 <= beat < 12.0:
        v *= 1.0 + 0.06 * (beat - 8.0) / 4.0
    if beat >= 12.0:
        v *= 0.85 * CHORD_VOICING.get(name, 1.0)
    return v


def render(voicing: dict) -> np.ndarray:
    total_s = SCORE_BEATS * BEAT + TAIL_S
    buf = np.zeros((int(total_s * SR), 2))
    rng = np.random.default_rng(voicing["seed"])

    parts = (
        ("right", SCORE_RIGHT, voicing["right_gain"], right_velocity, voicing["pedal_tau_right"]),
        ("left", SCORE_LEFT, voicing["left_gain"], left_velocity, voicing["pedal_tau_left"]),
    )

    for hand, score, gain, shaper, ped_tau in parts:
        for index, (beat, dur_b, name) in enumerate(score):
            lift_b, open_pedal = pedal_for(beat)
            # ± 2,5 % de vélocité, jamais de décalage rythmique : le toucher
            # respire, la mesure ne bouge pas d'un millième de temps.
            human = 1.0 + rng.uniform(-0.025, 0.025)
            vel = float(np.clip(gain * shaper(beat, name, index) * human, 0.05, 1.0))
            mono = render_note(
                name,
                dur_b * BEAT,
                vel,
                off_s=dur_b * BEAT,
                lift_s=None if open_pedal else (lift_b - beat) * BEAT,
                pedal_tau=None if open_pedal else ped_tau,
                voicing=voicing,
                seed=int(voicing["seed"] + 97 * index + (0 if hand == "right" else 7919)),
                max_s=total_s - beat * BEAT,
            )
            # Le clavier s'étale sous les doigts : graves à gauche, aigus à
            # droite, comme un piano vu du tabouret.
            pan = float(np.clip((midi_of(name) - 60) / 30.0, -1.0, 1.0)) * voicing["width"]
            place(buf, mono, beat * BEAT, pan)

    wet = convolve(buf, reverb_ir(voicing["reverb_decay"], voicing["reverb_damp_hz"], voicing["seed"]))
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
    peak = float(np.abs(pcm).max())
    ceiling = float(np.abs(buf).max())
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
    args = parser.parse_args()

    names = [args.only] if args.only else list(VOICINGS)
    print(f"発車メロディ piano - ♩={BPM:.0f}, 4/4, {SCORE_BEATS} temps "
          f"({SCORE_BEATS * BEAT:.3f} s) + {TAIL_S:.2f} s de résonance")
    for name in names:
        voicing = VOICINGS[name]
        buf = render(voicing)
        wav = args.wav_dir / f"{voicing['stem']}.wav"
        mp3 = args.mp3_dir / f"{voicing['stem']}.mp3"
        write_wav24(buf, wav)
        write_mp3(buf, mp3)
        rms = float(np.sqrt((buf**2).mean()))
        print(
            f"  {name:5s} {buf.shape[0] / SR:6.3f} s  crête {np.abs(buf).max():.3f}  "
            f"RMS {20 * np.log10(rms):6.2f} dB  - {voicing['title']}"
        )
        print(f"        {wav}\n        {mp3}")

    print("\nEnsuite : node scripts/melody-manifest-gen.mjs && npm test")


if __name__ == "__main__":
    main()

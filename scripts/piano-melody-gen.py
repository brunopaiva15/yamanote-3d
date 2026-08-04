#!/usr/bin/env python3
"""Grave la 発車メロディ PIANO des deux branchements principaux (Inner / Outer).

Pourquoi un second générateur à côté de scripts/melodies-gen.py : celui-là
synthétise des cloches additives (partiels fixes, écho ping-pong, une seule
voix). Un piano acoustique demande autre chose - cordes à l'unisson,
inharmonicité, étouffoirs, pédale, résonance sympathique, deux mains
d'équilibre différent - et ces notions n'ont pas de sens pour les autres
timbres de la bibliothèque. Les deux scripts restent donc séparés ; seul le
format de sortie est commun (MP3 stéréo 44,1 kHz, 160 kb/s) pour que les vingt
clips sonnent au même niveau sur le quai.

UNE partition, DEUX interprétations. `SCORE_RIGHT`, `SCORE_LEFT` et `PEDAL`
sont uniques et partagés : hauteurs, octaves, durées, silences et positions
rythmiques sont donc identiques par construction dans les deux fichiers. Ce qui
change d'une version à l'autre vit dans `VOICINGS` : vélocités, équilibre des
mains, attaque, brillance, largeur stéréo, pédale et réverbération.

  Inner Loop  - un peu plus lumineuse, main droite plus présente, attaque
                claire et petite brillance cristalline.
  Outer Loop  - un peu plus douce et aérienne, main gauche plus ronde, son
                moins frontal, résonance plus ample.

Trois choses portent le caractère « féérique » attendu d'une 発車メロディ, et
aucune n'ajoute une seule note à la partition :

  - les cordes à l'unisson (`unison`), deux ou trois par touche, désaccordées
    d'un cheveu. C'est ce qui remplace l'ancienne modulation d'amplitude et ce
    qui faisait sonner la version précédente comme un piano de synthèse ;
  - la résonance sympathique (`sympathetic_ir`) : pédale baissée, les cordes
    libres reprennent en sourdine ce qui tombe sur leurs fréquences. C'est le
    halo d'un vrai piano, et ce que nulle réverbération ne sait imiter ;
  - une doublure cristalline (`score_double`) : la main droite reprise à
    l'octave par une voix de type célesta, vingt décibels dessous. Mêmes notes,
    mêmes temps, calculées depuis `SCORE_RIGHT` - c'est le scintillement, pas
    un second instrument.

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
        peak=0.97,           # référence de niveau de la paire
        brightness=1.00,     # pente des partiels : plus haut = plus cristallin
        attack_ms=2.0,       # attaque claire
        hammer=0.045,        # bruit de marteau : la brillance de l'attaque
        width=0.48,          # panoramique par registre, assez tenu
        double_gain=0.125,   # -18 dB sous la main droite : un scintillement
        double_width=0.66,   # la doublure s'ouvre un peu plus que le piano
        sympathetic_mix=0.28,
        sympathetic_decay=1.30,
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
        peak=1.00,           # crête plus haute, mais timbre plus doux : au bout du
                             # compte la version Outer reste ~0,9 dB sous l'Inner
        brightness=0.90,     # moins frontal
        attack_ms=4.2,       # toucher plus souple
        hammer=0.028,
        width=0.60,          # un peu plus d'air
        double_gain=0.105,   # doublure plus lointaine que sur la version Inner
        double_width=0.78,
        sympathetic_mix=0.34,  # halo plus large : c'est la version contemplative
        sympathetic_decay=1.70,
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

# Corps de l'instrument : (fréquence, dB, largeur). Communes aux deux versions -
# c'est le même piano qu'on entend deux fois, pas deux instruments.
BODY = ((118.0, 1.2, 0.28), (232.0, -1.0, 0.26), (455.0, 1.0, 0.30), (1250.0, 0.8, 0.35))

DAMPER_TAU = 0.075          # chute de l'étouffoir, aigus
DAMPER_TAU_BASS = 0.115     # les grosses cordes s'arrêtent moins net
SLOW_LEVEL = 0.16           # part de la décroissance lente (« aftersound »)
HAMMER_POS = 0.125          # marteau au huitième de la corde -> creux du peigne
ATTACK_BLOOM = 0.055        # durée du transitoire brillant de l'attaque (s)


def string_params(f0: float) -> tuple[float, float, int]:
    """Décroissance, inharmonicité et nombre de partiels d'une corde."""
    # Les cordes graves tiennent plus longtemps, sans exagérer : le clip ne
    # dure que dix secondes et la queue doit s'éteindre d'elle-même.
    tau = float(np.clip(3.6 * (261.63 / f0) ** 0.45, 1.10, 4.60))
    # Raideur : sensible dès le médium et franche dans l'aigu. C'est elle qui
    # étire les partiels vers le haut et donne au piano brillant son petit éclat
    # de verre - la même physique que les cloches du reste de la bibliothèque.
    stiff = float(np.clip(1.4e-4 * (f0 / 261.63) ** 1.3, 4.0e-5, 2.2e-3))
    partials = int(np.clip(0.44 * SR / f0, 4, 26))
    return tau, stiff, partials


def unison(midi: int, rng: np.random.Generator) -> tuple[tuple[float, float, float], ...]:
    """Les cordes à l'unisson d'une note : (désaccord en cents, gain, facteur de durée).

    Une touche de piano frappe deux ou trois cordes accordées « ensemble » à un
    cheveu près. Ce presque-unisson est TOUT : c'est lui qui fait le battement
    lent d'une tenue, et c'est lui qui produit la double décroissance
    caractéristique - les cordes s'échangent leur énergie par le chevalet, la
    chute est d'abord rapide puis s'installe en longue traîne. La version
    précédente imitait ça par une modulation d'amplitude ; ça s'entendait, et
    c'est très exactement ce qui sonnait « synthétique ».
    """
    if midi < 44:
        return ((0.0, 1.0, 1.0),)
    if midi < 52:
        return ((0.0, 1.0, 1.0), (rng.uniform(0.6, 1.3), 0.95, 0.93))
    return (
        (0.0, 1.0, 1.0),
        (rng.uniform(0.5, 1.1), 0.95, 0.92),
        (-rng.uniform(0.5, 1.1), 0.93, 1.07),
    )


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

    strings = unison(midi, rng)
    norm *= sum(g for _, g, _ in strings)
    for a, f, tk, phase in zip(amps, freqs, taus, phases):
        # Transitoire d'attaque : les premières dizaines de millisecondes d'un
        # piano sont bien plus brillantes que sa tenue. Sans ce petit surcroît,
        # l'attaque est molle et le son « démarre » comme une nappe.
        bloom = 1.0 + 2.2 * min(1.0, (f / f0) / 4.0) * np.exp(-t / ATTACK_BLOOM)
        for cents, gain, tscale in strings:
            fs = f * 2.0 ** (cents / 1200.0)
            ts = tk * tscale
            # Décroissance : chute rapide puis traîne. Les trois cordes ayant des
            # durées légèrement différentes, leur somme produit d'elle-même le
            # profil en deux temps d'un vrai piano - on n'en garde ici qu'un
            # reste, pour la part qui vient de la table d'harmonie.
            env = (1.0 - SLOW_LEVEL) * np.exp(-t / (0.30 * ts)) + SLOW_LEVEL * np.exp(-t / ts)
            y += (a * gain / norm) * env * bloom * np.sin(2.0 * np.pi * fs * t + phase)

    # Attaque : quelques millisecondes en cosinus surélevé, jamais un front raide
    # (qui claquerait) ni une rampe longue (qui ferait cloche).
    atk = max(2, int(voicing["attack_ms"] * 1e-3 * SR))
    y[:atk] *= 0.5 - 0.5 * np.cos(np.linspace(0.0, np.pi, atk))

    # Bruit de marteau : le choc du feutre sur la corde. Un bruit blanc brut
    # sonnait « chuintement de synthé » ; ce qu'on entend d'un vrai marteau est
    # une bande étroite, autour de six à huit fois la fondamentale, qui meurt en
    # une dizaine de millisecondes.
    hammer = voicing["hammer"] * vel
    if hammer > 0:
        nh = int(0.014 * SR)
        th = np.arange(nh) / SR
        knock = np.zeros(nh)
        for mult in (5.5, 7.0, 9.5, 12.0):
            fk = min(f0 * mult, 0.42 * SR)
            knock += rng.uniform(0.7, 1.0) * np.sin(
                2.0 * np.pi * fk * th + rng.uniform(0.0, 6.28)
            ) * np.exp(-th / 0.0035)
        knock += 0.35 * rng.standard_normal(nh) * np.exp(-th / 0.0015)
        y[:nh] += hammer * knock / (np.abs(knock).max() or 1.0)

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
# Doublure cristalline
# ---------------------------------------------------------------------------
#
# La main droite est doublée à l'octave supérieure par une voix de type célesta.
# AUCUNE note n'est ajoutée : `SCORE_DOUBLE` est calculé depuis `SCORE_RIGHT`,
# mêmes temps, mêmes durées, +12 demi-tons exactement. La doublure vit vingt
# décibels sous la main droite - on ne l'entend pas comme un second instrument,
# elle donne du scintillement à l'attaque du piano, comme la lumière sur les
# barres d'un célesta. C'est ce qui rend à la mélodie le grain un peu féérique
# des autres 発車メロディ du jeu.

DOUBLE_OCTAVE = 12
DOUBLE_PARTIALS = ((1.0, 1.0), (4.02, 0.40), (8.20, 0.15), (13.4, 0.045))


def score_double() -> list[tuple[float, float, int]]:
    """La main droite, note pour note, une octave plus haut (en numéros MIDI)."""
    return [(beat, dur, midi_of(name) + DOUBLE_OCTAVE) for beat, dur, name in SCORE_RIGHT]


def render_double(midi: int, vel: float, seed: int, max_s: float) -> np.ndarray:
    """Une barre de célesta : peu de partiels, très inharmoniques, chute nette."""
    f0 = 440.0 * 2.0 ** ((midi - 69) / 12.0)
    tau = float(np.clip(1.35 * (523.25 / f0) ** 0.30, 0.55, 1.60))
    n = int(min(dur := tau * 5.0, max_s) * SR)
    if n <= 0:
        return np.zeros(0)
    del dur
    t = np.arange(n) / SR
    rng = np.random.default_rng(seed)

    y = np.zeros(n)
    for i, (mult, amp) in enumerate(DOUBLE_PARTIALS):
        f = f0 * mult
        if f > 0.44 * SR:
            break
        y += amp * np.exp(-t / (tau / (1.0 + 0.9 * i))) * np.sin(
            2.0 * np.pi * f * t + rng.uniform(0.0, 6.28)
        )
    atk = max(2, int(0.0025 * SR))
    y[:atk] *= 0.5 - 0.5 * np.cos(np.linspace(0.0, np.pi, atk))
    return y * vel / sum(a for _, a in DOUBLE_PARTIALS)


# ---------------------------------------------------------------------------
# Résonance sympathique
# ---------------------------------------------------------------------------


def sympathetic_ir(decay_s: float, seed: int) -> np.ndarray:
    """Le halo des cordes libres : ce qui manquait le plus au son précédent.

    Pédale baissée, TOUTES les cordes du piano sont libres : chacune reprend en
    sourdine ce qui, dans le son joué, tombe sur l'une de ses fréquences. C'est
    de là que vient l'impression d'espace d'un piano pédale enfoncée - et un
    piano de synthèse sans ça sonne à plat, quelle que soit la réverbération
    qu'on lui ajoute.

    Le banc est accordé sur les hauteurs de la partition (ce sont celles que
    l'harmonie fait vibrer le plus) : le halo est donc consonant par
    construction, jamais un bourdonnement.
    """
    n = int(decay_s * SR)
    t = np.arange(n) / SR
    rng = np.random.default_rng(seed)
    ir = np.zeros((n, 2))

    pitches = sorted({midi_of(nm) for _, _, nm in SCORE_RIGHT + SCORE_LEFT})
    for midi in pitches:
        f0 = 440.0 * 2.0 ** ((midi - 69) / 12.0)
        tau, stiff, count = string_params(f0)
        pan = float(np.clip((midi - 60) / 30.0, -1.0, 1.0)) * 0.5
        theta = (pan + 1.0) * np.pi / 4.0
        for k in range(1, min(7, count) + 1):
            f = f0 * k * np.sqrt(1.0 + stiff * k * k)
            if f > 0.42 * SR:
                break
            ring = min(decay_s / 3.2, tau / (1.0 + 0.35 * (k - 1)))
            wave = (np.exp(-t / ring) / k**1.5) * np.sin(
                2.0 * np.pi * f * t + rng.uniform(0.0, 6.28)
            )
            ir[:, 0] += wave * np.cos(theta)
            ir[:, 1] += wave * np.sin(theta)

    ir *= (1.0 - np.exp(-t / 0.006))[:, None]   # pas de clic au premier échantillon
    return ir / (np.sqrt((ir**2).sum(axis=0)).max() or 1.0)


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

    S'y ajoute le CORPS : quelques bosses étroites que la caisse et la table
    d'harmonie impriment à toutes les notes, quelle que soit la hauteur jouée.
    Un son parfaitement lisse n'a pas de bois dedans, et c'est une des choses
    qui trahissaient la synthèse.
    """
    n = buf.shape[0]
    f = np.maximum(np.fft.rfftfreq(n, 1.0 / SR), 1.0)

    g = f**2 / (f**2 + 32.0**2)
    g *= 1.0 / (1.0 + (f / 17_000.0) ** 4)
    for hz, db, width in BODY:
        g *= 10.0 ** ((db / 20.0) * np.exp(-((np.log(f / hz) / width) ** 2)))
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

    # Halo des cordes libres, pris sur le piano seul et avant la salle : c'est
    # l'instrument qui résonne, pas le lieu.
    halo = voicing["sympathetic_mix"]
    if halo > 0:
        buf += halo * convolve(
            buf, sympathetic_ir(voicing["sympathetic_decay"], voicing["seed"] + 31)
        )

    # Doublure cristalline de la main droite, à l'octave (voir score_double).
    for index, (beat, dur_b, midi) in enumerate(score_double()):
        name = SCORE_RIGHT[index][2]
        human = 1.0 + rng.uniform(-0.02, 0.02)
        vel = float(np.clip(
            voicing["right_gain"] * voicing["double_gain"]
            * right_velocity(beat, name, index) * human, 0.005, 1.0))
        mono = render_double(
            midi, vel, seed=int(voicing["seed"] + 613 * index + 4441),
            max_s=total_s - beat * BEAT,
        )
        pan = float(np.clip((midi - 60) / 30.0, -1.0, 1.0)) * voicing["double_width"]
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

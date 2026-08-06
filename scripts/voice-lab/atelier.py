#!/usr/bin/env python3
"""Atelier de réglage des voix : recettes, transposition, cadence des silences.

Ce module ne grave rien dans `public/audio` : il fabrique des variantes à
comparer. Une fois la variante choisie à l'oreille (voir banc.py), ses
paramètres se reportent dans scripts/announcements-export.ts et
scripts/announcements-gen.py, qui restent les seuls à produire les clips du jeu.

TROIS LEVIERS, et pas un de plus.

1. LA VOIX. Kokoro n'a que cinq voix japonaises (jf_alpha, jf_gongitsune,
   jf_nezumi, jf_tebukuro, jm_kumo) : le choix est vite fait, mais il pèse lourd
   parce que la hauteur ET l'étendue d'intonation en dépendent. Un mélange
   « a:0.6+b:0.4 » est accepté ; attention, il n'est PAS linéaire en hauteur -
   moitié jf_alpha (300 Hz) moitié jf_tebukuro (220 Hz) ressort à 289 Hz, plus
   haut que les deux. Le mélange sert le timbre, pas le registre.

2. LA TRANSPOSITION. Descendre une voix se fait par rééchantillonnage suivi
   d'un recalage WSOLA, PAS en jouant sur la vitesse de Kokoro : au-delà de
   ~1,2 le modèle aplatit son intonation (l'étendue tombe de 12 à 6 demi-tons)
   et on perdrait en mélodie ce qu'on gagne en registre. Le rééchantillonnage
   déplace aussi les formants, ce qui est recherché : il donne une voix plus
   pleine, moins juvénile, là où un vocodeur préservant les formants garderait
   le timbre d'origine à une autre hauteur.

3. LA CADENCE. Les silences internes de l'enregistrement réel sont NETTEMENT
   bimodaux - un mode à 0,32 s, un autre à 1,06 s, presque rien entre les deux -
   alors que le générateur pose un 0,62 s uniforme, c'est-à-dire pile dans le
   creux. Une recette porte donc DEUX durées, et le découpage du texte dit
   laquelle s'applique après chaque morceau.

Dépendances : pip install kokoro-onnx "misaki[en]" lameenc numpy scipy
Modèle : kokoro-v1.0.onnx + voices-v1.0.bin
  (https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0)
"""

import re
from dataclasses import dataclass
from fractions import Fraction

import numpy as np
from scipy import signal

SR = 24000


@dataclass
class Recipe:
    """Un réglage complet, tel qu'il serait posé dans le générateur.

    `voice` : nom de voix Kokoro, ou mélange « a:0.6+b:0.4 ».
    `speed` : vitesse Kokoro. La transposition ne passe PAS par elle.
    `semitones` : transposition appliquée APRÈS synthèse, durée conservée.
    `smile` : dilatation des formants SEULE (1.0 = rien). Voir timbre.py -
        c'est la couleur « souriante », qui n'existe pas dans la hauteur.
    `name_lift` : demi-tons ajoutés SUR LE SEUL NOM DE GARE, formants
        conservés.
    `name_smile` : sourire appliqué au SEUL nom de gare. C'est le vrai écart
        relevé sur une prise étiquetée : dans 「次は。渋谷。渋谷。」 le nom
        n'est pas plus HAUT que la phrase qui l'introduit (236 Hz contre 256),
        il est plus BRILLANT - centroïde 1200 contre 839. Ce que l'oreille
        prend pour de l'aigu est un déplacement de formants.
    `short_gap` / `long_gap` : les deux silences de la cadence, en secondes.
    """

    name: str
    voice: str
    speed: float
    semitones: float = 0.0
    smile: float = 1.0
    name_lift: float = 0.0
    name_smile: float = 1.0
    short_gap: float = 0.32
    long_gap: float = 1.06
    label: str = ""
    notes: str = ""


def blend(kokoro, spec):
    """« jf_alpha » ou « jf_alpha:0.7+jm_kumo:0.3 » → nom ou vecteur de style."""
    if "+" not in spec and ":" not in spec:
        return spec
    total = None
    for part in spec.split("+"):
        name, _, w = part.partition(":")
        v = kokoro.get_voice_style(name) * (float(w) if w else 1.0)
        total = v if total is None else total + v
    return total


def trim(x, thr=0.003):
    """Retire les bords silencieux : les pauses doivent avoir la durée voulue,
    pas celle-là plus ce que Kokoro a laissé autour de sa prise."""
    loud = np.flatnonzero(np.abs(x) > thr)
    return x[loud[0] : loud[-1] + 1] if loud.size else x


def resample_semitones(x, st):
    """Transpose par simple rééchantillonnage. La DURÉE change."""
    if abs(st) < 1e-6:
        return x
    # Rapport RATIONNEL de petit dénominateur : resample_poly construit un
    # filtre polyphasé proportionnel à `up`, et un 10000/8909 littéral en
    # fabrique un inutilisable - le signal en ressort méconnaissable.
    f = Fraction(2 ** (st / 12)).limit_denominator(160)
    return signal.resample_poly(x, f.denominator, f.numerator).astype(np.float32)


def wsola(x, rate, sr=SR):
    """Change la durée d'un facteur 1/rate sans toucher à la hauteur.

    Recouvrement-addition avec recalage sur la meilleure corrélation : la
    couture tombe sur une période du signal, donc pas de bourdonnement de
    vocodeur de phase. Employé ici pour de petits facteurs (±20 %), là où le
    procédé s'entend à peine.

    LA QUEUE EST RECOLLÉE TELLE QUELLE. La boucle s'arrête dès qu'il ne reste
    plus de quoi lire une fenêtre entière avec sa marge de recalage : jusqu'à
    win+seek, soit 48 ms, n'étaient jamais lus, et l'ancien dernier échantillon
    restait à pleine amplitude. Sur une voix, ces 48 ms sont la décroissance de
    la voyelle finale - la jeter, c'est couper le mot net. On rend donc ce
    reste sans l'étirer : il est court, c'est une queue, et la continuité y
    vaut mieux qu'une durée exacte au millième.
    """
    if abs(rate - 1.0) < 1e-6:
        return x
    win = int(sr * 0.040)
    hop_out = win // 2
    hop_in = int(round(hop_out * rate))
    seek = int(sr * 0.008)
    w = np.hanning(win).astype(np.float32)
    n_out = int(len(x) / rate) + win
    out = np.zeros(n_out, np.float32)
    norm = np.zeros(n_out, np.float32)
    prev_tail = None
    pos_in = pos_out = best = 0
    ecrit = False
    while pos_in + win + seek < len(x) and pos_out + win < n_out:
        if prev_tail is None:
            best = pos_in
        else:
            lo = max(0, pos_in - seek)
            hi = min(len(x) - win, pos_in + seek)
            if hi < lo:
                break
            idx = np.arange(win)[None, :] + np.arange(hi - lo + 1)[:, None]
            sub = x[idx + lo]
            num = sub @ prev_tail
            den = np.linalg.norm(sub, axis=1) * (np.linalg.norm(prev_tail) + 1e-9) + 1e-9
            best = lo + int(np.argmax(num / den))
        out[pos_out : pos_out + win] += x[best : best + win] * w
        norm[pos_out : pos_out + win] += w
        ecrit = True
        prev_tail = x[best + hop_out : best + hop_out + win]
        if len(prev_tail) < win:
            break
        pos_out += hop_out
        pos_in += hop_in
    if not ecrit:
        # Trop court pour une seule fenêtre : sans ce garde-fou on renvoyait
        # `win` échantillons de silence, la division ne trouvant aucun poids.
        return x
    # On coupe le recouvrement-addition à pos_out+hop_out, où DEUX fenêtres se
    # superposent encore et où `norm` vaut 1 : au-delà il ne reste que le flanc
    # descendant de la dernière, et la division par un poids qui tend vers zéro
    # y est mal conditionnée. L'échantillon de sortie pos_out+k venant de
    # l'entrée best+k, la queue reprend exactement à best+hop_out.
    m = min(hop_out, len(x) - best)
    out, norm = out[: pos_out + m], norm[: pos_out + m]
    y = (out / np.maximum(norm, 1e-4)).astype(np.float32)
    return np.concatenate([y, x[best + m :]]).astype(np.float32)


def pitch_shift(x, st, sr=SR):
    """Transposition à DURÉE CONSTANTE : rééchantillonnage puis recalage.

    Les formants suivent la fondamentale. Vers le BAS c'est recherché (voix
    plus pleine) ; vers le HAUT c'est l'effet « chipmunk », et il faut alors
    passer par pitch_shift_fc.
    """
    if abs(st) < 1e-6:
        return x
    y = resample_semitones(x, st)
    return wsola(y, len(y) / max(len(x), 1), sr)


def pitch_shift_fc(x, st, sr=SR):
    """Transposition à FORMANTS CONSERVÉS : la hauteur monte, pas la voix.

    C'est ce qu'il faut pour lever le seul nom de gare : un locuteur qui monte
    d'un ton ne rétrécit pas son conduit vocal. Sans cette correction, le nom
    de gare ressortait en dessin animé.
    """
    if abs(st) < 1e-6:
        return x
    from timbre import formant_shift

    return formant_shift(pitch_shift(x, st, sr), 2 ** (-st / 12), sr)


def split_ja(text):
    """Découpe actuelle du générateur : un morceau par ponctuation.

    Renvoie des couples (morceau, silence long ?). Le 。 termine une phrase et
    appelle le silence long, le 、 est une respiration et appelle le court. Les
    textes de bord n'écrivant plus que des 。, cette découpe pose aujourd'hui le
    silence long PARTOUT - c'est exactement ce que la mesure reproche à la
    version actuelle (voir docs/VOIX_ANALYSE.md).
    """
    return [(p, p.endswith("。")) for p in re.findall(r"[^、。]+[、。]?", text)]


def synth(kokoro, ja_g2p, en_g2p, recipe, text, lang, segments=None):
    """Synthétise `text` selon `recipe`, morceau par morceau.

    `segments` est une liste de (morceau, silence long ?, est-ce le nom de
    gare ?) ; sans lui, split_ja donne le découpage du générateur actuel. Le
    dernier drapeau sert au `name_lift` : seul le nom de gare monte.

    L'anglais passe par le même chemin - la ponctuation y suffisait tant qu'on
    ne cherchait ni pause mesurée ni nom de gare détaché, mais c'est justement
    ce qu'on cherche maintenant.
    """
    from timbre import formant_shift

    voice = blend(kokoro, recipe.voice)
    g2p = ja_g2p if lang == "ja-JP" else en_g2p
    segs = [(p, long, False) for p, long in split_ja(text)] if segments is None else segments
    segs = [(s + (False,))[:3] if len(s) < 3 else s for s in segs]

    parts = []
    for i, (piece, is_long, is_name) in enumerate(segs):
        ph, _ = g2p(piece)
        if not ph:
            continue
        a, _ = kokoro.create(ph, voice=voice, speed=recipe.speed, is_phonemes=True)
        y = trim(np.asarray(a, dtype=np.float32))
        # Registre global : vers le bas, les formants suivent - c'est voulu.
        y = pitch_shift(y, recipe.semitones)
        # Le nom de gare monte SANS emmener les formants avec lui.
        if is_name and recipe.name_lift:
            y = pitch_shift_fc(y, recipe.name_lift)
        smile = recipe.smile * (recipe.name_smile if is_name else 1.0)
        if abs(smile - 1.0) > 1e-3:
            y = formant_shift(y, smile)
        parts.append(y)
        if i < len(segs) - 1:
            # Les silences gardent EXACTEMENT la durée demandée par la recette.
            gap = recipe.long_gap if is_long else recipe.short_gap
            parts.append(np.zeros(int(SR * gap), np.float32))
    return np.concatenate(parts) if parts else np.zeros(1, np.float32)


def load_engine(model, voices):
    from kokoro_onnx import Kokoro

    return Kokoro(str(model), str(voices))


def load_g2p():
    from misaki import en, ja

    fallback = None
    try:
        from misaki import espeak

        fallback = espeak.EspeakFallback(british=False)
    except Exception as exc:  # noqa: BLE001 - espeak est un confort, pas un requis
        print(f"  (espeak indisponible, repli lexique seul : {exc})")
    return ja.JAG2P(), en.G2P(trf=False, british=False, fallback=fallback)


def encode_mp3(x, sr=SR, kbps=64, peak=0.89):
    import lameenc

    p = float(np.max(np.abs(x))) or 1.0
    pcm = np.clip(x * (peak / p), -1, 1)
    e = lameenc.Encoder()
    e.set_bit_rate(kbps)
    e.set_in_sample_rate(sr)
    e.set_channels(1)
    e.set_quality(2)
    return bytes(e.encode((pcm * 32767).astype(np.int16).tobytes())) + bytes(e.flush())

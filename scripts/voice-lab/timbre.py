#!/usr/bin/env python3
"""Deux traitements qui manquaient : le sourire, et la sono de la rame.

LE SOURIRE. Transposer une voix vers le haut la rend « chipmunk » parce que le
rééchantillonnage monte la fondamentale ET les formants ensemble. Or ce qui
s'entend dans une voix qui sourit, c'est le déplacement des FORMANTS SEULS :
les lèvres s'écartent, le conduit vocal raccourcit, F2 et F3 montent - la
hauteur, elle, ne bouge pas. On sépare donc les deux : l'enveloppe spectrale
est extraite par lissage cepstral, dilatée le long de l'axe des fréquences, et
réappliquée en gain. Les harmoniques restent où elles sont (donc la hauteur
aussi), seule la couleur change.

LA SONO. Un clip du jeu n'est jamais entendu sec : audioEngine le fait passer
par le timbre d'un diffuseur de plafond (coupe-bas 300 Hz, bosse de présence à
1900 Hz, coupe-haut 5000 Hz, compression serrée) puis par une petite
réverbération de cabine. Comparer un clip SEC à un enregistrement pris DANS la
rame, c'est comparer deux choses qui ne pourront jamais se ressembler. Cette
chaîne reproduit celle du moteur audio pour que l'écoute soit honnête.
"""

import numpy as np
from scipy import signal

SR = 24000


def formant_shift(x, factor, sr=SR):
    """Dilate l'enveloppe spectrale d'un facteur `factor`, hauteur inchangée.

    factor > 1 : formants vers le haut - voix plus « souriante », plus petite
    bouche perçue. factor < 1 : voix plus ronde, plus posée.
    """
    if abs(factor - 1.0) < 1e-4:
        return x
    n_fft, hop = 1024, 256
    win = np.hanning(n_fft).astype(np.float32)
    f, t, Z = signal.stft(x, sr, window=win, nperseg=n_fft, noverlap=n_fft - hop)
    mag = np.abs(Z)
    n_bins = mag.shape[0]

    # Enveloppe par lissage cepstral : on garde les premiers quéfrences, qui
    # décrivent la forme du conduit vocal, et on jette la structure fine, qui
    # décrit la vibration des cordes.
    logmag = np.log(mag + 1e-8)
    cep = np.fft.irfft(logmag, axis=0, n=2 * (n_bins - 1))
    lifter = np.zeros(cep.shape[0])
    lifter[:34] = 1.0
    lifter[-33:] = 1.0
    env = np.exp(np.fft.rfft(cep * lifter[:, None], axis=0).real)

    src = np.arange(n_bins) / factor
    warped = np.empty_like(env)
    for i in range(env.shape[1]):
        warped[:, i] = np.interp(src, np.arange(n_bins), env[:, i])
    gain = np.clip(warped / np.maximum(env, 1e-8), 0.15, 6.0)

    _, y = signal.istft(Z * gain, sr, window=win, nperseg=n_fft, noverlap=n_fft - hop)
    return np.asarray(y[: len(x)], dtype=np.float32)


def _biquad_peak(sr, f0, q, gain_db):
    a = 10 ** (gain_db / 40)
    w = 2 * np.pi * f0 / sr
    alpha = np.sin(w) / (2 * q)
    b = [1 + alpha * a, -2 * np.cos(w), 1 - alpha * a]
    ax = [1 + alpha / a, -2 * np.cos(w), 1 - alpha / a]
    return np.array(b) / ax[0], np.array(ax) / ax[0]


def compress(x, sr=SR, thresh_db=-22.0, ratio=3.2, attack=0.004, release=0.14, block=64):
    """Compresseur à détection d'enveloppe, réglé comme celui d'audioEngine.

    Le suiveur d'enveloppe est intrinsèquement séquentiel (l'attaque et le
    retour n'ont pas la même constante de temps), mais il n'a pas besoin de la
    résolution de l'échantillon : on le calcule sur des blocs de 64, soit
    2,7 ms, bien au-dessous de l'attaque de 4 ms. Le gain est ensuite étiré à
    la longueur du signal. Soixante fois plus rapide, et rien ne s'entend.
    """
    eps = 1e-9
    n = (len(x) // block) * block or block
    pad = np.pad(np.abs(x), (0, n - len(x) if n > len(x) else 0))[:n]
    peaks = pad.reshape(-1, block).max(axis=1)
    ca = np.exp(-block / (attack * sr))
    cr = np.exp(-block / (release * sr))
    e = np.empty_like(peaks)
    prev = 0.0
    for i, v in enumerate(peaks):
        c = ca if v > prev else cr
        prev = c * prev + (1 - c) * v
        e[i] = prev
    over = np.maximum(20 * np.log10(e + eps) - thresh_db, 0.0)
    gain = 10 ** (-over * (1 - 1 / ratio) / 20)
    gain = np.interp(np.arange(len(x)), np.arange(len(gain)) * block + block / 2, gain)
    return (x * gain).astype(np.float32)


def cabin_pa(x, sr=SR, verb=0.13):
    """La chaîne d'audioEngine : diffuseur de plafond + réverbération de cabine."""
    y = x.astype(np.float32)
    sos_hp = signal.butter(4, 300 / (sr / 2), btype="high", output="sos")
    sos_lp = signal.butter(4, 5000 / (sr / 2), btype="low", output="sos")
    y = signal.sosfilt(sos_hp, y)
    b, a = _biquad_peak(sr, 1900, 0.9, 4.5)
    y = signal.lfilter(b, a, y)
    y = signal.sosfilt(sos_lp, y)
    y = compress(y, sr)

    # Réverbération courte : bruit décroissant, 0,85 s, pré-délai 12 ms.
    n = int(sr * 0.85)
    rng = np.random.default_rng(7)
    ir = rng.standard_normal(n).astype(np.float32) * np.exp(-np.arange(n) / (sr * 0.16))
    ir = signal.sosfilt(signal.butter(2, 3500 / (sr / 2), btype="low", output="sos"), ir)
    ir /= np.sqrt((ir ** 2).sum())
    wet = signal.fftconvolve(y, ir)[: len(y)]
    pre = int(sr * 0.012)
    wet = np.concatenate([np.zeros(pre, np.float32), wet[:-pre]]) if pre else wet
    # Le facteur 3 qui traînait ici mouillait la voix trois fois trop : le
    # facteur de crête tombait de 7,2 à 5,6 et TOUTES les variantes du test
    # d'écoute sortaient empâtées. audioEngine envoie la réverbération à 0,16
    # à côté d'un bus direct à pleine échelle - c'est ce rapport-là qu'il faut.
    out = y + verb * wet
    return (out / (np.max(np.abs(out)) or 1.0) * 0.89).astype(np.float32)

#!/usr/bin/env python3
"""Mesures acoustiques communes à l'enregistrement de référence et aux clips.

Les deux côtés DOIVENT passer par ce module et par lui seul : comparer une
hauteur mesurée d'un côté avec un détecteur et de l'autre avec un autre ne dit
rien. C'est aussi pour ça que la correction d'octave et le compteur de
syllabes vivent ici plutôt que dans les scripts appelants.

Dépendances : pip install numpy scipy soundfile
"""
import numpy as np
import soundfile as sf
from scipy import signal

SR = 22050


def load(path, sr=SR):
    x, fs = sf.read(path, dtype="float32", always_2d=True)
    x = x.mean(axis=1)
    if fs != sr:
        g = np.gcd(int(fs), int(sr))
        x = signal.resample_poly(x, sr // g, fs // g)
    return x, sr


def frame_rms(x, sr, hop=0.010, win=0.025):
    h, w = int(sr * hop), int(sr * win)
    n = 1 + (len(x) - w) // h
    idx = np.arange(w)[None, :] + h * np.arange(n)[:, None]
    fr = x[idx]
    return np.sqrt((fr ** 2).mean(axis=1) + 1e-12), h, w


def segments(rms, hop_s, thr, min_dur=0.25, min_gap=0.25):
    on = rms > thr
    # combler les trous courts
    out = []
    i = 0
    while i < len(on):
        if on[i]:
            j = i
            while j < len(on):
                if on[j]:
                    j += 1
                    continue
                k = j
                while k < len(on) and not on[k]:
                    k += 1
                if (k - j) * hop_s < min_gap and k < len(on):
                    j = k
                else:
                    break
            if (j - i) * hop_s >= min_dur:
                out.append((i * hop_s, j * hop_s))
            i = j
        else:
            i += 1
    return out


def clean_f0(f0, prior=None):
    """Rattrape les trames fausses d'une octave, et rien d'autre.

    YIN se trompe d'octave sur quelques trames isolées - surtout en fin de
    phrase, quand la voix se dévoise. Non corrigées, ces trames doublent
    l'étendue mesurée et rendraient incomparables deux voix pourtant proches.
    La correction est VOLONTAIREMENT timide : elle ne touche qu'une trame déjà
    à plus d'une demi-octave de la médiane de la piste, et ne la ramène que si
    le repli tombe à moins d'un quart d'octave. Une correction plus large
    déplacerait la piste entière quand la médiane elle-même est douteuse.
    """
    f = f0.copy()
    v = f > 0
    if v.sum() < 8:
        return f
    ref = np.log2(np.median(f[v]))
    for i in np.flatnonzero(v):
        d0 = abs(np.log2(f[i]) - ref)
        if d0 <= 0.5:
            continue
        for k in (0.5, 2.0):
            if abs(np.log2(f[i] * k) - ref) < 0.25:
                f[i] = f[i] * k
                break
    # lissage médian sur 3 trames, en ne touchant qu'aux trames voisées
    g = f.copy()
    for i in range(1, len(f) - 1):
        if f[i] > 0 and f[i - 1] > 0 and f[i + 1] > 0:
            g[i] = float(np.median([f[i - 1], f[i], f[i + 1]]))
    return g


def yin_f0(x, sr, fmin=70, fmax=400, hop=0.010, win=0.045, thr=0.15):
    """YIN simplifié -> (temps, f0 en Hz, 0 si non voisé)."""
    h, w = int(sr * hop), int(sr * win)
    tmin, tmax = int(sr / fmax), int(sr / fmin)
    n = max(0, 1 + (len(x) - w - tmax) // h)
    f0 = np.zeros(n)
    nfft = 1 << int(np.ceil(np.log2(w + tmax + 1)))
    for i in range(n):
        fr = x[i * h : i * h + w + tmax]
        base = fr[:w]
        if np.sqrt((base ** 2).mean()) < 1e-4:
            continue
        # d(tau) = ||base||^2 + ||fr[tau:tau+w]||^2 - 2*corr(tau)
        cs = np.concatenate([[0.0], np.cumsum(fr ** 2)])
        pw = cs[w : w + tmax + 1] - cs[0 : tmax + 1]
        corr = np.fft.irfft(
            np.fft.rfft(fr, nfft) * np.conj(np.fft.rfft(base, nfft)), nfft
        )[: tmax + 1]
        d = pw[0] + pw - 2 * corr
        d[:tmin] = d[tmin]
        cum = np.cumsum(d[tmin:]) / np.arange(1, tmax - tmin + 2)
        dp = d[tmin:] / np.maximum(cum, 1e-12)
        cand = np.flatnonzero(dp < thr)
        ti = int(cand[0]) if cand.size else int(np.argmin(dp))
        tau = ti + tmin
        val = dp[ti]
        if tmin < tau < tmax:  # interpolation parabolique, décalage borné
            a, b, c = d[tau - 1], d[tau], d[tau + 1]
            denom = a - 2 * b + c
            if denom > 0:
                tau += float(np.clip(0.5 * (a - c) / denom, -1.0, 1.0))
        f0[i] = sr / tau if val < 0.5 else 0.0
    return np.arange(n) * hop, clean_f0(f0)


def spectral(x, sr):
    f, p = signal.welch(x, sr, nperseg=1024)
    p = p / (p.sum() + 1e-20)
    centroid = float((f * p).sum())
    cs = np.cumsum(p)
    rolloff = float(f[np.searchsorted(cs, 0.85)])
    # tilt : pente log-log 300-6000 Hz
    m = (f > 300) & (f < 6000)
    tilt = float(np.polyfit(np.log10(f[m]), 10 * np.log10(p[m] + 1e-20), 1)[0])
    return centroid, rolloff, tilt


def describe(x, sr, label=""):
    _, f0 = yin_f0(x, sr)
    v = f0[f0 > 0]
    c, r, t = spectral(x, sr)
    if v.size < 5:
        return dict(label=label, dur=len(x) / sr, voiced=0.0)
    # Une poignée de trames restent fausses d'une octave malgré clean_f0 - assez
    # pour faire passer une étendue de 9 à 20 demi-tons alors que l'écart
    # interquartile, lui, n'a pas bougé. On les écarte avant de mesurer.
    med0 = np.median(v)
    v = v[(v > med0 / 2) & (v < med0 * 2)]
    if v.size < 5:
        return dict(label=label, dur=len(x) / sr, voiced=0.0)
    return dict(
        label=label,
        dur=len(x) / sr,
        voiced=float(v.size / max(len(f0), 1)),
        f0_med=float(np.median(v)),
        f0_p10=float(np.percentile(v, 10)),
        f0_p90=float(np.percentile(v, 90)),
        f0_iqr_st=float(12 * np.log2(np.percentile(v, 75) / np.percentile(v, 25))),
        f0_range_st=float(12 * np.log2(np.percentile(v, 95) / np.percentile(v, 5))),
        centroid=c,
        rolloff=r,
        tilt=t,
    )


# --- Débit syllabique -----------------------------------------------------
# Compter les pics de l'enveloppe d'amplitude revient à compter les noyaux
# syllabiques - les mores en japonais. La valeur absolue est approximative ;
# c'est sa COMPARAISON entre deux enregistrements qui a un sens, et elle est
# valide parce que les deux passent par la même fonction.

MOD_SR = 200.0


def syllable_env(x, sr):
    b, a = signal.butter(4, [300 / (sr / 2), min(3500, sr / 2 - 100) / (sr / 2)], btype="band")
    y = signal.lfilter(b, a, x)
    e = np.abs(signal.hilbert(y))
    e = signal.resample_poly(e, int(MOD_SR), sr)
    b2, a2 = signal.butter(3, 10 / (MOD_SR / 2), btype="low")
    return signal.filtfilt(b2, a2, e)


def syllable_rate(x, sr):
    """Pics/s de l'enveloppe, sur la partie SONORE seulement."""
    e = syllable_env(x, sr)
    if len(e) < 40:
        return None
    thr = np.percentile(e, 35)
    peaks, _ = signal.find_peaks(
        e, height=np.percentile(e, 55), distance=int(MOD_SR * 0.085), prominence=e.max() * 0.06
    )
    voiced_t = float((e > thr).sum() / MOD_SR)
    if voiced_t < 0.2:
        return None
    return len(peaks) / voiced_t, voiced_t


def mod_peak(x, sr):
    e = syllable_env(x, sr)
    e = e - e.mean()
    if len(e) < 128:
        return None
    f, p = signal.welch(e, MOD_SR, nperseg=min(512, len(e)))
    m = (f >= 2) & (f <= 12)
    return float(f[m][np.argmax(p[m])])

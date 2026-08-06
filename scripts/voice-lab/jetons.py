#!/usr/bin/env python3
"""Extrait les annonces japonaises en RECONNAISSANT les jetons enregistrés.

POURQUOI CETTE MÉTHODE PLUTÔT QUE LE TIMBRE. Séparer les deux voix par
ressemblance de timbre échoue : les deux locutrices sont trop proches, et le
résultat laissait beaucoup d'anglais. Mais le système d'annonces réel est
CONCATÉNATIF - il rejoue les mêmes fichiers enregistrés à chaque gare. Le
「次は」 d'une prise étiquetée se retrouve donc quasi à l'identique partout
ailleurs, et se cherche par corrélation au lieu de se deviner.

La mesure le confirme : sur les MFCC, 「次は」 ressort à 0,96-0,99 à une
vingtaine d'instants précis, noyé dans une masse de faux voisins à 0,62-0,69.
Le seuil se lit dans cet écart, il n'est pas choisi.

D'où le découpage : une annonce japonaise de bord commence par 「次は」 (ou
「まもなく」) et finit par 「お出口は…側です」. Bornée entre DEUX jetons
japonais reconnus, elle ne peut pas contenir d'anglais - là où un classement
statistique n'offrait aucune garantie de ce genre.

Ce qui échappe forcément à la méthode : tout ce dont on n'a pas le jeton. Les
annonces de correspondance, les messages de courtoisie, les annonces de quai.
Le script le dit en fin de course plutôt que de laisser croire à l'exhaustivité.

Usage :
  python scripts/voice-lab/jetons.py enregistrement.mp3 /tmp/sortie \\
      "次は=580.98:581.49" "お出口=583.90:585.47"
"""

import sys
from pathlib import Path

import numpy as np
from scipy import signal
from scipy.fftpack import dct

sys.path.insert(0, str(Path(__file__).parent))
from atelier import encode_mp3  # noqa: E402
from mesures import load  # noqa: E402

SR = 16000
HOP_MS = 10
GAP = 0.5  # silence entre deux annonces recollées

# Seuils lus dans la distribution des scores, pas choisis : le vrai jeton
# ressort au-dessus de 0,90 quand le bruit de fond des faux voisins plafonne à
# 0,70. Le jeton de sortie est plus tolérant parce qu'il en existe deux
# variantes - 「右側」 et 「左側」 - qui ne diffèrent que d'une more.
SEUIL_DEBUT = 0.90
SEUIL_FIN = 0.72
FENETRE_FIN = 9.0  # secondes : au-delà, la fin ne va pas avec ce début


def mfcc(y, sr=SR):
    nfft, hop, n = 512, int(sr * HOP_MS / 1000), 26
    _, _, Z = signal.stft(y, sr, nperseg=nfft, noverlap=nfft - hop, padded=True)
    hz2mel = lambda f: 2595 * np.log10(1 + f / 700)
    mel2hz = lambda m: 700 * (10 ** (m / 2595) - 1)
    pts = mel2hz(np.linspace(hz2mel(80), hz2mel(7000), n + 2))
    b = np.floor((nfft + 1) * pts / sr).astype(int)
    fb = np.zeros((n, nfft // 2 + 1))
    for i in range(n):
        lo, mid, hi = b[i], b[i + 1], b[i + 2]
        if mid > lo:
            fb[i, lo:mid] = (np.arange(lo, mid) - lo) / (mid - lo)
        if hi > mid:
            fb[i, mid:hi] = (hi - np.arange(mid, hi)) / (hi - mid)
    e = np.log(fb @ (np.abs(Z) ** 2) + 1e-10)
    m = dct(e, axis=0, norm="ortho")[1:14].T
    # Trames normalisées : le score devient un cosinus, insensible au niveau.
    return m / (np.linalg.norm(m, axis=1, keepdims=True) + 1e-9)


def matches(M, template, seuil):
    """Instants (en secondes) où `template` se retrouve dans M."""
    n = len(template)
    sc = np.array([float((M[i : i + n] * template).sum() / n)
                   for i in range(len(M) - n)])
    pk, _ = signal.find_peaks(sc, height=seuil, distance=150)
    return [(p * HOP_MS / 1000, float(sc[p]), n * HOP_MS / 1000) for p in pk], sc


def main():
    rec_path, out_dir = sys.argv[1:3]
    specs = sys.argv[3:]
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    x, sr = load(rec_path, sr=SR)
    M = mfcc(x, sr)

    tpl = {}
    for spec in specs:
        name, _, rng = spec.partition("=")
        a, _, b = rng.partition(":")
        tpl[name] = M[int(float(a) * 100) : int(float(b) * 100)]

    starts, sc_start = matches(M, tpl["次は"], SEUIL_DEBUT)
    ends, sc_end = matches(M, tpl["お出口"], SEUIL_FIN)
    print(f"{len(starts)} débuts 「次は」 (score {min(s for _, s, _ in starts):.2f}"
          f"-{max(s for _, s, _ in starts):.2f}), {len(ends)} fins 「お出口…」")
    print(f"  bruit de fond : médiane {np.median(sc_start):.2f}, "
          f"99e centile {np.percentile(sc_start, 99):.2f}")

    spans, orphelins = [], 0
    for t0, s0, _ in starts:
        suite = [(t1, s1, d1) for t1, s1, d1 in ends if t0 < t1 < t0 + FENETRE_FIN]
        if not suite:
            orphelins += 1
            continue
        t1, s1, d1 = max(suite, key=lambda e: e[1])
        spans.append((t0, t1 + d1, s0, s1))
    print(f"{len(spans)} annonces complètes, {orphelins} débuts sans fin repérée")

    parts = []
    for t0, t1, s0, s1 in spans:
        parts.append(x[int(t0 * sr) : int(t1 * sr)])
        parts.append(np.zeros(int(sr * GAP), np.float32))
        print(f"  {t0:7.2f} → {t1:7.2f} ({t1 - t0:4.1f}s)  début {s0:.2f} · fin {s1:.2f}")
    y = np.concatenate(parts) if parts else np.zeros(1, np.float32)
    (out / "japonais-jetons.mp3").write_bytes(encode_mp3(y, sr, kbps=96))
    print(f"\n→ {out / 'japonais-jetons.mp3'}  {len(y) / sr:.1f} s")
    print("Ne contient QUE des annonces bornées par deux jetons japonais reconnus.\n"
          "N'y figurent donc pas : correspondances, messages de courtoisie,\n"
          "annonces de quai, et toute annonce dont on n'a pas le jeton.")


if __name__ == "__main__":
    main()

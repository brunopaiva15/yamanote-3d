#!/usr/bin/env python3
"""Sépare les annonces JAPONAISES des anglaises dans un enregistrement de bord.

CE QUI AVAIT ÉCHOUÉ, ET POURQUOI ÇA MARCHE MAINTENANT. Trois tentatives de
séparation à l'aveugle - regroupement par timbre, rythme de Ramus, spectre de
modulation - avaient toutes raté : elles cherchaient deux groupes sans savoir à
quoi l'un des deux devait ressembler, et les deux locutrices sont trop proches
en registre pour qu'un partitionnement non supervisé les distingue.

Une prise ÉTIQUETÉE de six secondes suffit à changer le problème. On ne cherche
plus deux groupes quelconques : on cherche qui ressemble à CETTE voix-là. Le
regroupement part d'un centre connu au lieu d'un centre tiré au hasard, et
l'ambiguïté disparaît.

La prise doit venir du MÊME enregistrement (ici t=580,02 s, corrélation 0,974) :
le timbre mesuré dépend autant du micro et du lieu que du locuteur, et une
référence prise ailleurs comparerait deux canaux plutôt que deux voix.

Sortie : un MP3 par groupe, plus le détail segment par segment. Les deux
fichiers sont à ÉCOUTER - c'est la seule vérification possible, et le script
imprime de quoi juger la fiabilité de la séparation avant même cette écoute.

Usage :
  python scripts/voice-lab/separer.py enregistrement.mp3 prise_japonaise.mp3 /tmp/sortie
"""

import sys
from pathlib import Path

import numpy as np
from scipy import signal
from scipy.fftpack import dct

sys.path.insert(0, str(Path(__file__).parent))
from atelier import encode_mp3  # noqa: E402
from mesures import describe, frame_rms, load, segments  # noqa: E402

SR = 22050
GAP = 0.45  # silence à laisser entre deux extraits recollés


def is_speech(d):
    """Écarte carillons, mélodies et avertisseurs : trop voisés, trop stables
    en hauteur, trop pauvres en attaques pour être de la parole."""
    return (d["dur"] > 0.6 and 0.45 < d.get("voiced", 0) < 0.95
            and d.get("f0_range_st", 0) > 6.5 and d.get("f0_med", 0) > 120)


def mel_fb(sr, nfft, n=26, fmin=80, fmax=7000):
    hz2mel = lambda f: 2595 * np.log10(1 + f / 700)
    mel2hz = lambda m: 700 * (10 ** (m / 2595) - 1)
    pts = mel2hz(np.linspace(hz2mel(fmin), hz2mel(fmax), n + 2))
    bins = np.floor((nfft + 1) * pts / sr).astype(int)
    fb = np.zeros((n, nfft // 2 + 1))
    for i in range(n):
        a, b, c = bins[i], bins[i + 1], bins[i + 2]
        if b > a:
            fb[i, a:b] = (np.arange(a, b) - a) / (b - a)
        if c > b:
            fb[i, b:c] = (c - np.arange(b, c)) / (c - b)
    return fb


def embedding(x, sr=SR):
    """Signature de timbre d'un extrait : moyenne et écart-type des MFCC.

    Les coefficients d'ordre 1 et 2 portent surtout l'intensité et la pente
    générale du spectre - donc le niveau et la distance au micro. On les écarte
    pour comparer des VOIX et non des placements de micro.
    """
    nfft, hop = 1024, 256
    fb = mel_fb(sr, nfft)
    _, _, Z = signal.stft(x, sr, nperseg=nfft, noverlap=nfft - hop, padded=True)
    e = np.log(fb @ (np.abs(Z) ** 2) + 1e-10)
    m = dct(e, axis=0, norm="ortho")[2:14].T
    if len(m) < 4:
        return None
    return np.concatenate([m.mean(0), m.std(0)])


def speech_segments(x, sr=SR):
    """Découpe un signal en segments de parole et renvoie (début, fin, mesures)."""
    rms, h, _ = frame_rms(x, sr)
    thr = max(np.percentile(rms, 20) * 4, np.percentile(rms, 60) * 0.25)
    out = []
    for a, b in segments(rms, h / sr, thr):
        seg = x[int(a * sr) : int(b * sr)]
        d = describe(seg, sr)
        d["start"], d["end"], d["dur"] = a, b, b - a
        if is_speech(d):
            out.append(d)
    return out


def reference_embedding(take, sr=SR):
    """Signature de la voix connue, mesurée sur SA PAROLE SEULE.

    La calculer sur les six secondes entières incluait presque deux secondes de
    silence, ce qui déplace assez la moyenne des MFCC pour que la référence ne
    se reconnaisse plus elle-même - vérifié : ses propres segments tombaient
    alors dans le mauvais groupe.
    """
    vs = []
    for d in speech_segments(take, sr) or []:
        v = embedding(take[int(d["start"] * sr) : int(d["end"] * sr)], sr)
        if v is not None:
            vs.append(v)
    if not vs:  # prise trop courte pour être segmentée : on la prend entière
        return embedding(take, sr)
    return np.mean(vs, axis=0)


def main():
    rec_path, take_path, out_dir = sys.argv[1:4]
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    x, sr = load(rec_path, sr=SR)
    take, _ = load(take_path, sr=SR)

    rows = []
    for d in speech_segments(x, sr):
        v = embedding(x[int(d["start"] * sr) : int(d["end"] * sr)], sr)
        if v is not None:
            d["emb"] = v
            rows.append(d)
    print(f"{len(rows)} segments de parole")

    E = np.array([r["emb"] for r in rows])
    mu, sd = E.mean(0), E.std(0) + 1e-9
    E = (E - mu) / sd
    ref = (reference_embedding(take, sr) - mu) / sd

    # Deux centres : la voix CONNUE, et le segment qui lui ressemble le moins.
    # Partir d'un centre connu est toute la différence avec un partitionnement
    # à l'aveugle - c'est ce qui avait échoué trois fois.
    c_ja = ref.copy()
    c_other = E[int(np.argmax(((E - c_ja) ** 2).sum(1)))].copy()
    for _ in range(40):
        d_ja = ((E - c_ja) ** 2).sum(1)
        d_ot = ((E - c_other) ** 2).sum(1)
        lab = (d_ot < d_ja).astype(int)  # 1 = « pas la voix japonaise »
        if (lab == 0).any():
            # Le centre japonais reste ancré à la référence : on le laisse
            # dériver à demi seulement, sinon il finit par absorber l'autre voix.
            c_ja = 0.5 * ref + 0.5 * E[lab == 0].mean(0)
        if (lab == 1).any():
            c_other = E[lab == 1].mean(0)

    d_ja = np.sqrt(((E - c_ja) ** 2).sum(1))
    d_ot = np.sqrt(((E - c_other) ** 2).sum(1))
    # Marge : positive = ressemble à la voix japonaise. Sa distribution dit si
    # la séparation est nette ou si l'on a coupé au milieu d'un seul nuage.
    margin = d_ot - d_ja
    ja = margin > 0
    sep = float(np.abs(margin).mean() / (np.std(margin) + 1e-9))
    print(f"{ja.sum()} segments proches de la voix de la prise, {(~ja).sum()} autres")
    print(f"marge médiane {np.median(np.abs(margin)):.2f} · indice de netteté {sep:.2f} "
          f"(au-dessus de 0,8 la séparation est franche)")
    f0 = np.array([r["f0_med"] for r in rows])
    cen = np.array([r["centroid"] for r in rows])
    for name, m in (("groupe A (voix de la prise)", ja), ("groupe B", ~ja)):
        print(f"  {name:28} F0 méd {np.median(f0[m]):3.0f} Hz · "
              f"centroïde {np.median(cen[m]):4.0f} Hz · "
              f"durée totale {sum(r['dur'] for r, k in zip(rows, m) if k):5.1f} s")

    # CONTRÔLE : la prise est extraite du même enregistrement, on sait donc où
    # elle se trouve. Ses propres segments DOIVENT tomber dans le groupe A ;
    # sinon la séparation ne vaut rien, et mieux vaut le dire que livrer deux
    # fichiers faux.
    if len(sys.argv) > 4:
        t0 = float(sys.argv[4])
        t1 = t0 + len(take) / sr
        own = [(r, k) for r, k in zip(rows, ja) if r["start"] >= t0 - 0.5 and r["end"] <= t1 + 0.5]
        if own:
            good = sum(1 for _, k in own if k)
            print(f"contrôle : {good}/{len(own)} segments de la prise elle-même "
                  f"classés dans le groupe A"
                  + ("" if good == len(own) else "  ⚠ SÉPARATION NON FIABLE"))

    for name, m in (("japonais", ja), ("autre", ~ja)):
        parts = []
        for r, keep in zip(rows, m):
            if not keep:
                continue
            parts.append(x[int(r["start"] * sr) : int(r["end"] * sr)])
            parts.append(np.zeros(int(sr * GAP), np.float32))
        y = np.concatenate(parts) if parts else np.zeros(1, np.float32)
        (out / f"{name}.mp3").write_bytes(encode_mp3(y, sr, kbps=96))
        print(f"→ {out / f'{name}.mp3'}  {len(y) / sr:.1f} s")

    with open(out / "segments.txt", "w", encoding="utf-8") as fh:
        for r, k, mg in zip(rows, ja, margin):
            fh.write(f"{r['start']:8.2f} {r['end']:8.2f} "
                     f"{'JA' if k else '--'} marge {mg:+6.2f} "
                     f"F0 {r['f0_med']:3.0f}\n")
    print(f"→ {out / 'segments.txt'}")


if __name__ == "__main__":
    main()

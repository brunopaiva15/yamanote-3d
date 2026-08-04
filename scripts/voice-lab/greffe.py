#!/usr/bin/env python3
"""Greffe la PROSODIE d'une prise réelle sur une voix de synthèse.

Deux tours d'écoute notée ont montré que régler Kokoro ne mène nulle part :
tout ce qu'on peut lui demander agit sur le timbre, alors que ce qui manque est
la MÉLODIE et le RYTHME. Kokoro n'accepte aucune consigne de prosodie, mais
rien n'oblige à garder celle qu'il produit.

Le principe : on analyse la prise réelle et la synthèse avec le vocodeur WORLD,
on les met en correspondance temporelle, puis on resynthétise avec
l'ENVELOPPE SPECTRALE DE LA SYNTHÈSE et la COURBE DE HAUTEUR ET LA DURÉE DE LA
PRISE. Le résultat parle avec la voix de Kokoro, mais sur la mélodie et la
cadence de l'annonce réelle - y compris la descente de fin de phrase et la
tenue du nom de gare, que rien ne permettait d'obtenir autrement.

CE QU'ON NE GREFFE PAS : l'enveloppe spectrale, c'est-à-dire l'identité vocale.
Elle appartient à la personne qui a enregistré l'annonce. On copie une manière
de dire - une intonation d'annonce ferroviaire, un patron fonctionnel - pas une
voix. C'est aussi pour ça que le résultat garde le timbre de Kokoro.

Ça n'est utilisable que là où l'on DISPOSE d'une prise du texte visé. Les
phrases porteuses des annonces de bord (次は / まもなく / お出口は…) sont fixes
d'une gare à l'autre, donc greffables une fois pour toutes ; les noms de gare
demanderaient soit une prise par gare, soit un patron de contour normalisé.

Usage :
  python scripts/voice-lab/greffe.py prise.mp3 kokoro-v1.0.onnx voices-v1.0.bin /tmp/greffe

Dépendances : pip install pyworld (+ celles de l'atelier)
"""

import sys
from pathlib import Path

import numpy as np
import pyworld
from scipy import signal
from scipy.fftpack import dct

sys.path.insert(0, str(Path(__file__).parent))
from atelier import encode_mp3, load_engine, load_g2p, trim  # noqa: E402
from mesures import describe, load  # noqa: E402

SR = 24000
FRAME_MS = 5.0

# Découpage de la prise étiquetée : (texte, début, fin, silence après).
TAKE = [
    ("次は。", 0.96, 1.47, 0.34),
    ("渋谷。", 1.81, 2.47, 0.43),
    ("渋谷。", 2.90, 3.57, 0.31),
    ("お出口は右側です。", 3.88, 5.45, 0.0),
]


def mel_fb(sr, nfft, n=24, fmin=80, fmax=7000):
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


def mfcc(x, sr=SR, n=13):
    """MFCC au pas de WORLD (5 ms), pour aligner sur la même grille."""
    nfft, hop = 1024, int(sr * FRAME_MS / 1000)
    fb = mel_fb(sr, nfft)
    _, _, Z = signal.stft(x, sr, nperseg=nfft, noverlap=nfft - hop, padded=True)
    p = np.abs(Z) ** 2
    e = np.log(fb @ p + 1e-10)
    return dct(e, axis=0, norm="ortho")[:n].T


def dtw_path(A, B):
    """Chemin d'alignement entre deux suites de vecteurs (distance cosinus).

    Renvoie, pour CHAQUE trame de B (la référence), l'indice de la trame de A
    (la synthèse) qui lui correspond : c'est exactement ce qu'il faut pour
    rééchantillonner la synthèse sur la grille temporelle de la référence.
    """
    An = A / (np.linalg.norm(A, axis=1, keepdims=True) + 1e-9)
    Bn = B / (np.linalg.norm(B, axis=1, keepdims=True) + 1e-9)
    D = 1 - An @ Bn.T
    n, m = D.shape
    acc = np.full((n + 1, m + 1), np.inf)
    acc[0, 0] = 0.0
    for i in range(1, n + 1):
        # Trois transitions classiques : diagonale, horizontale, verticale.
        prev = acc[i - 1]
        row = acc[i]
        for j in range(1, m + 1):
            row[j] = D[i - 1, j - 1] + min(prev[j - 1], prev[j], row[j - 1])
    i, j = n, m
    out = np.zeros(m, dtype=int)
    while i > 0 and j > 0:
        out[j - 1] = i - 1
        step = min(acc[i - 1, j - 1], acc[i - 1, j], acc[i, j - 1])
        if step == acc[i - 1, j - 1]:
            i, j = i - 1, j - 1
        elif step == acc[i - 1, j]:
            i -= 1
        else:
            j -= 1
    return out


def world(x, sr=SR):
    x = np.ascontiguousarray(x, dtype=np.float64)
    f0, t = pyworld.harvest(x, sr, frame_period=FRAME_MS, f0_floor=70, f0_ceil=500)
    f0 = pyworld.stonemask(x, f0, t, sr)
    sp = pyworld.cheaptrick(x, f0, t, sr)
    ap = pyworld.d4c(x, f0, t, sr)
    return f0, sp, ap


def graft(synth_x, ref_x, keep_pitch=False, sr=SR):
    """Synthèse rejouée sur la durée et la hauteur de la référence.

    `keep_pitch` ne greffe QUE le rythme : utile pour savoir laquelle des deux
    moitiés - la mélodie ou la cadence - fait la différence à l'oreille.
    """
    f0_s, sp_s, ap_s = world(synth_x, sr)
    f0_r, _, _ = world(ref_x, sr)
    idx = dtw_path(mfcc(synth_x, sr), mfcc(ref_x, sr))
    idx = np.clip(idx, 0, len(f0_s) - 1)
    n = min(len(idx), len(f0_r))
    idx, f0_r = idx[:n], f0_r[:n]

    sp = np.ascontiguousarray(sp_s[idx], dtype=np.float64)
    ap = np.ascontiguousarray(ap_s[idx], dtype=np.float64)
    if keep_pitch:
        f0 = f0_s[idx].copy()
    else:
        f0 = f0_r.copy()
        # Une trame que la référence dit voisée et la synthèse non (ou
        # l'inverse) produirait un souffle ou un clic : on garde le voisement
        # de la synthèse, et on n'emprunte que la VALEUR de la hauteur.
        f0[f0_s[idx] <= 0] = 0.0
        miss = (f0 <= 0) & (f0_s[idx] > 0)
        if miss.any() and (f0 > 0).any():
            f0[miss] = np.interp(np.flatnonzero(miss), np.flatnonzero(f0 > 0), f0[f0 > 0])
    y = pyworld.synthesize(np.ascontiguousarray(f0, dtype=np.float64), sp, ap, sr, FRAME_MS)
    return np.asarray(y, dtype=np.float32)


def main():
    take_path, model, voices, out_dir = sys.argv[1:5]
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    ref, _ = load(take_path, sr=SR)

    kokoro = load_engine(model, voices)
    jg, _ = load_g2p()

    # Quatre modes, dont deux TÉMOINS. Sans eux on ne saurait pas départager
    # « la greffe n'apporte rien » de « le vocodeur abîme tout » : `vocodeur`
    # fait passer la synthèse par l'analyse-resynthèse WORLD sans rien changer,
    # et mesure donc à lui seul le prix du procédé.
    MODES = [
        ("brut", "la synthèse telle quelle"),
        ("vocodeur", "témoin : passée par WORLD, sans rien changer"),
        ("rythme", "durées de la prise, hauteur de la synthèse"),
        ("greffe", "durées ET mélodie de la prise"),
    ]
    items, n = [], 0
    for voice, speed in (("jf_alpha", 1.01), ("af_sarah", 1.01), ("jf_tebukuro", 1.19)):
        for mode, note in MODES:
            parts = []
            for text, a, b, gap in TAKE:
                seg_ref = ref[int(a * SR) : int(b * SR)]
                ph, _ = jg(text)
                raw, _ = kokoro.create(ph, voice=voice, speed=speed, is_phonemes=True)
                seg = trim(np.asarray(raw, dtype=np.float32))
                if mode == "brut":
                    y = seg
                elif mode == "vocodeur":
                    f0, sp, ap = world(seg)
                    y = np.asarray(pyworld.synthesize(f0, sp, ap, SR, FRAME_MS), dtype=np.float32)
                else:
                    y = graft(seg, seg_ref, keep_pitch=(mode == "rythme"))
                parts.append(y / (np.max(np.abs(y)) or 1.0) * 0.8)
                if gap:
                    parts.append(np.zeros(int(SR * gap), np.float32))
            y = np.concatenate(parts)
            n += 1
            rid = f"G{n:02d}"
            (out / f"{rid}.mp3").write_bytes(encode_mp3(y))
            (out / f"{rid}-sec.mp3").write_bytes(encode_mp3(y))
            d = describe(y, SR)
            items.append(dict(id=rid, lang="ja-JP", axis=mode, voice=voice, speed=speed,
                              st=0.0, smile=1.0, lift=0.0, gaps=[0.32, 0.43],
                              f0=round(d["f0_med"]), rng=round(d["f0_range_st"], 1),
                              dur=round(d["dur"], 2),
                              setting=f"{voice} · {mode} — {note}"))
            print(f"  {rid} {voice:12} {mode:9} F0 {d['f0_med']:3.0f}  "
                  f"étendue {d['f0_range_st']:4.1f} st  durée {d['dur']:.2f} s")

    dref = describe(ref[int(0.9 * SR) : int(5.5 * SR)], SR)
    print(f"      {'RÉFÉRENCE':12}           F0 {dref['f0_med']:3.0f}  "
          f"étendue {dref['f0_range_st']:4.1f} st")

    (out / "ref.mp3").write_bytes(encode_mp3(ref, SR, kbps=80))
    import base64
    import json

    clips = {p.stem: "data:audio/mpeg;base64," + base64.b64encode(p.read_bytes()).decode()
             for p in sorted(out.glob("*.mp3"))}
    tmpl = (Path(__file__).parent / "notes.tmpl.html").read_text(encoding="utf-8")
    page = out / "notes.html"
    page.write_text(tmpl.replace("/*__DATA__*/", json.dumps(
        dict(refs=[dict(id="ref", label="la prise réelle")], items=items, clips=clips),
        ensure_ascii=False)), encoding="utf-8")
    print(f"\n→ {page}  ({page.stat().st_size / 1e6:.1f} Mo)")


if __name__ == "__main__":
    main()

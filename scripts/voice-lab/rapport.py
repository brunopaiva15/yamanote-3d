#!/usr/bin/env python3
"""Compare un enregistrement réel aux clips gravés, mesure par mesure.

Usage :
  python scripts/voice-lab/rapport.py enregistrement.mp3 \
      textes.json public/audio/announcements [--json sortie.json]

`textes.json` est celui que produit scripts/announcements-export.ts : il donne
la voix et le rôle de chaque clip, donc les groupes du tableau.

Ce que le tableau compare, et pourquoi :

- F0 médiane : le REGISTRE. Comparée à la plage p10-p90 des segments de
  l'enregistrement, pas à une valeur unique - il y a plusieurs locuteurs dedans.
- Étendue p5-p95 : la MÉLODIE. Une annonce automatique n'est pas monocorde ;
  une voix trop plate s'entend tout de suite comme une synthèse.
- Durée de segment : le HACHAGE. C'est la durée d'un morceau de parole entre
  deux silences. Elle ne dépend pas de la voix mais de la découpe du texte et
  des pauses insérées, et c'est l'écart le plus audible des trois.
- Débit : les noyaux syllabiques par seconde DE PAROLE, silences exclus. Cette
  distinction compte : mesuré sur le clip entier, un japonais correctement
  articulé mais généreusement ponctué paraît 25 % trop lent.
"""

import json
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from mesures import describe, frame_rms, load, segments, syllable_rate  # noqa: E402


def is_speech(r):
    """Écarte carillons, bips et mélodies d'un relevé de segments.

    Un signal musical est trop voisé, trop stable en hauteur et trop pauvre en
    attaques pour être de la parole - et l'enregistrement d'une rame en contient
    beaucoup (carillon de porte, mélodie de départ, avertisseurs).
    """
    return (
        r["dur"] > 0.6
        and 0.45 < r.get("voiced", 0) < 0.95
        and r.get("f0_range_st", 0) > 6.5
        and r.get("f0_med", 0) > 120
    )


def scan(path):
    """Segments de parole d'un enregistrement, avec leurs mesures."""
    x, sr = load(path)
    rms, h, _ = frame_rms(x, sr)
    thr = max(np.percentile(rms, 20) * 4, np.percentile(rms, 60) * 0.25)
    out = []
    for a, b in segments(rms, h / sr, thr):
        seg = x[int(a * sr) : int(b * sr)]
        d = describe(seg, sr)
        d["start"], d["end"], d["dur"] = round(a, 2), round(b, 2), round(b - a, 2)
        if is_speech(d):
            v = syllable_rate(seg, sr)
            d["rate"] = v[0] if v else None
            out.append(d)
    return out, x, sr


def reference(path):
    rows, _, _ = scan(path)
    f0 = np.array([r["f0_med"] for r in rows])
    rates = [r["rate"] for r in rows if r["rate"]]
    gaps = np.array([
        rows[i]["start"] - rows[i - 1]["end"]
        for i in range(1, len(rows))
        if 0.15 < rows[i]["start"] - rows[i - 1]["end"] < 1.7
    ])
    counts, edges = np.histogram(f0, bins=np.arange(180, 320, 8))
    return dict(
        n=len(rows),
        f0={k: round(float(np.percentile(f0, p)))
            for k, p in (("p10", 10), ("p25", 25), ("med", 50), ("p75", 75), ("p90", 90))},
        hist=[[int(b), int(c)] for b, c in zip(edges, counts)],
        floor=round(float(np.median([r["f0_p10"] for r in rows]))),
        ceil=round(float(np.median([r["f0_p90"] for r in rows]))),
        rng=round(float(np.median([r["f0_range_st"] for r in rows])), 1),
        iqr=round(float(np.median([r["f0_iqr_st"] for r in rows])), 1),
        seg=round(float(np.median([r["dur"] for r in rows])), 2),
        rate=round(float(np.median(rates)), 2),
        gap_short=round(float(np.median(gaps[gaps < 0.6])), 2),
        gap_long=round(float(np.median(gaps[gaps >= 0.6])), 2),
        n_short=int((gaps < 0.6).sum()),
        n_long=int((gaps >= 0.6).sum()),
    )


def clips(texts_path, clip_dir, limit=30):
    items = json.load(open(texts_path, encoding="utf-8"))["items"]
    d = Path(clip_dir)
    groups = defaultdict(list)
    for it in items:
        p = d / f"{it['key']}.mp3"
        if p.exists():
            groups[(it["lang"], it["voice"], it.get("role", "cabin"))].append(p)
    out = {}
    for k, ps in sorted(groups.items()):
        F, D, R, S = [], [], [], []
        for p in sorted(ps)[:limit]:
            y, sr = load(str(p))
            rms, h, _ = frame_rms(y, sr)
            thr = max(np.percentile(rms, 20) * 4, np.percentile(rms, 60) * 0.25)
            segs = segments(rms, h / sr, thr, min_dur=0.5, min_gap=0.15)
            spoken = sum(b - a for a, b in segs)
            S.append(1 - spoken / (len(y) / sr))
            for a, b in segs:
                seg = y[int(a * sr) : int(b * sr)]
                dd = describe(seg, sr)
                if dd.get("f0_med"):
                    F.append(dd)
                    D.append(b - a)
                v = syllable_rate(seg, sr)
                if v:
                    R.append(v[0])
        if F:
            out["·".join(k)] = dict(
                lang=k[0], voice=k[1], role=k[2],
                f0=round(float(np.median([f["f0_med"] for f in F]))),
                p10=round(float(np.median([f["f0_p10"] for f in F]))),
                p90=round(float(np.median([f["f0_p90"] for f in F]))),
                rng=round(float(np.median([f["f0_range_st"] for f in F])), 1),
                seg=round(float(np.median(D)), 2),
                rate=round(float(np.median(R)), 2),
                silence=round(100 * float(np.mean(S)), 1),
            )
    return out


def main():
    rec, texts, clip_dir = sys.argv[1:4]
    ref = reference(rec)
    print(f"=== ENREGISTREMENT ({ref['n']} segments de parole) ===")
    print("F0 par segment : p10 {p10}  p25 {p25}  méd {med}  p75 {p75}  p90 {p90} Hz"
          .format(**ref["f0"]))
    print(f"plancher {ref['floor']} Hz · sommet {ref['ceil']} Hz · "
          f"étendue {ref['rng']} st · IQR {ref['iqr']} st")
    print(f"segment {ref['seg']} s · débit {ref['rate']} pics/s")
    print(f"silences internes : {ref['n_short']} courts ({ref['gap_short']} s) / "
          f"{ref['n_long']} longs ({ref['gap_long']} s)")

    ch = clips(texts, clip_dir)
    print("\n=== CLIPS ===")
    print(f"{'canal':30} {'F0':>5} {'étendue':>8} {'segment':>8} {'débit':>6} {'silence':>8}")
    for name, v in ch.items():
        print(f"{name:30} {v['f0']:5} {v['rng']:7.1f}st {v['seg']:7.2f}s "
              f"{v['rate']:6.2f} {v['silence']:7.1f}%")

    if "--json" in sys.argv:
        dest = sys.argv[sys.argv.index("--json") + 1]
        json.dump({"ref": ref, "clips": ch}, open(dest, "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)
        print(f"\n→ {dest}")


if __name__ == "__main__":
    main()

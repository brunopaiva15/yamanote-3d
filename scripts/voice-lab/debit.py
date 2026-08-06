#!/usr/bin/env python3
"""Compare le débit des fragments gravés à celui de la prise réelle.

POURQUOI EN MORES ET PAS EN SECONDES. Un fragment plus long qu'un autre n'est
pas plus lent : il a plus de syllabes. Le japonais étant mesuré par les MORES -
une more, une unité de durée, c'est le principe même de sa métrique -, le
rapport mores/seconde est la seule grandeur qui se compare d'un fragment à
l'autre, et surtout entre une prise réelle et une synthèse qui ne disent pas
les mêmes mots.

DEUX MESURES INDÉPENDANTES, et c'est voulu : un seul chiffre ne dirait pas s'il
mesure la voix ou la méthode.

1. Mores par seconde, sur la prise étiquetée dont on connaît le texte ET les
   bornes au centième. C'est la mesure exacte, mais sur quatre segments.
2. Pics d'enveloppe par seconde (mesures.syllable_rate), sur les 111 s de
   japonais isolé d'un côté et sur tous les fragments de l'autre. Approximative
   en valeur absolue, mais elle porte sur tout le corpus, et les deux côtés
   passent par la même fonction.

Si les deux donnent le même rapport, la correction est fondée. Sinon le script
le dit plutôt que d'en moyenner deux qui se contredisent.

Usage :
  python scripts/voice-lab/debit.py <prise_etiquetee.mp3> <japonais_isole.mp3>
"""

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from graver import FRAG_DIR, mores, trimmed  # noqa: E402
from mesures import load, syllable_rate  # noqa: E402

# Bornes relevées sur la prise étiquetée 「次は。渋谷。渋谷。お出口は右側です。」
# (voir greffe.py), avec la lecture de chaque segment.
PRISE = [
    ("ツギワ", 0.96, 1.47),
    ("シブヤ", 1.81, 2.47),
    ("シブヤ", 2.90, 3.57),
    ("オデグチワミギガワデス", 3.88, 5.45),
]

def main():
    prise_path, isole_path = sys.argv[1], sys.argv[2]

    # --- 1. Mores par seconde, sur la prise étiquetée ---------------------
    x, sr = load(prise_path)
    print("prise réelle, segment par segment :")
    n_tot = d_tot = 0.0
    for kana, a, b in PRISE:
        n, d = mores(kana), b - a
        n_tot += n
        d_tot += d
        print(f"  {kana:14} {n:2} mores en {d:.2f}s → {n / d:4.1f} mores/s")
    reel_mps = n_tot / d_tot
    print(f"  {'ensemble':14} {n_tot:2.0f} mores en {d_tot:.2f}s → {reel_mps:4.1f} mores/s\n")

    # --- 2. Mores par seconde, sur les fragments gravés -------------------
    index = json.loads((FRAG_DIR / "index.json").read_text(encoding="utf-8"))
    n_syn = d_syn = 0.0
    par_frag = []
    for fid, v in index.items():
        q = FRAG_DIR / f"{fid}.mp3"
        if v["lang"] != "ja-JP" or not q.exists():
            continue
        n = mores(v["text"], v["source"])
        d = len(trimmed(q)) / 24000
        if n < 2 or d < 0.15:
            continue
        n_syn += n
        d_syn += d
        par_frag.append((n / d, v["text"], n, d))
    synth_mps = n_syn / d_syn
    print(f"fragments gravés : {len(par_frag)} fragments, {n_syn:.0f} mores en "
          f"{d_syn:.1f}s → {synth_mps:4.1f} mores/s")
    par_frag.sort()
    print("  les plus lents :")
    for r, t, n, d in par_frag[:4]:
        print(f"    {r:4.1f} mores/s  {t[:34]:36} ({n} mores, {d:.2f}s)")
    print("  les plus rapides :")
    for r, t, n, d in par_frag[-2:]:
        print(f"    {r:4.1f} mores/s  {t[:34]:36} ({n} mores, {d:.2f}s)")

    # --- 3. Contre-mesure : pics d'enveloppe, tout le corpus --------------
    y, _ = load(isole_path)
    r_reel = syllable_rate(y, sr)[0]
    parts = [trimmed(FRAG_DIR / f"{fid}.mp3") for fid, v in index.items()
             if v["lang"] == "ja-JP" and (FRAG_DIR / f"{fid}.mp3").exists()]
    r_syn = syllable_rate(np.concatenate(parts), 24000)[0]

    print(f"\ncontre-mesure (pics d'enveloppe) : réel {r_reel:.2f}/s, "
          f"synthèse {r_syn:.2f}/s")

    k_mores = synth_mps / reel_mps
    k_pics = r_syn / r_reel
    print(f"\nrapport synthèse/réel : {k_mores:.2f} en mores, {k_pics:.2f} en pics")
    if abs(k_mores - k_pics) > 0.12:
        print("Les deux mesures se contredisent : ne rien corriger sur cette base.")
        return

    # LA MOYENNE NE DIT RIEN, et c'est le résultat de ce script. À 1,06 du réel
    # le corpus paraît juste, alors que les fragments courts traînent et que les
    # longs s'emballent : les deux écarts se compensent. Un facteur unique posé
    # sur le rôle déplacerait tout le monde sans en corriger un seul.
    ecarts = np.array([1.0 / (r / reel_mps) for r, _, _, _ in par_frag])
    print(f"dispersion par fragment : de ×{ecarts.min():.2f} à ×{ecarts.max():.2f}, "
          f"écart type {ecarts.std():.2f}")
    print("Un facteur global ne corrigerait rien : la correction se fait fragment\n"
          "par fragment, sur la durée que la vraie locutrice aurait mise pour le\n"
          "même nombre de mores. C'est ce que graver.cadence applique au montage.")


if __name__ == "__main__":
    main()

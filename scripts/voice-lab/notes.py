#!/usr/bin/env python3
"""Test d'écoute noté : beaucoup de variantes courtes, une note par variante.

Usage :
  python scripts/voice-lab/notes.py enregistrement.mp3 \
      kokoro-v1.0.onnx voices-v1.0.bin /tmp/notes [--ref "étiquette=fichier.mp3"]

`--ref` ajoute un extrait de référence déjà découpé - typiquement la prise
étiquetée dont on connaît le texte, qui est le meilleur étalon possible
puisqu'elle dit exactement la phrase témoin.

L'A/B à six variantes commentées demandait de lire avant d'écouter. Ici c'est
l'inverse : des extraits de deux à trois secondes, aucun réglage affiché, une
note de 1 à 5. Les réglages ne se révèlent qu'après coup - une variante
étiquetée « voix descendue de 4 demi-tons » n'est plus jugée par l'oreille
seule.

Le plan n'est pas une liste d'essais au hasard : chaque RÉGLAGE est présent à
plusieurs valeurs, sur plusieurs voix, de sorte que les notes permettent de
remonter à ce qui plaît - la voix, le registre, le sourire, la levée du nom de
gare, la cadence - et pas seulement à quelle prise a gagné.

TOUT est rendu par défaut À TRAVERS LA SONO DE LA RAME (timbre.cabin_pa), la
même que celle d'audioEngine. Comparer un clip sec à un enregistrement pris
dans une rame, c'est comparer deux choses qui ne se ressembleront jamais.
"""

import base64
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from atelier import Recipe, encode_mp3, load_engine, load_g2p, synth  # noqa: E402
from mesures import describe, load  # noqa: E402
from timbre import cabin_pa  # noqa: E402

# Extraits de l'enregistrement : courts, pour pouvoir y revenir sans attendre.
EXCERPTS = [("réf 1", 170.6, 176.3), ("réf 2", 196.4, 202.6), ("réf 3", 719.4, 726.0)]

# Le texte témoin est CELUI de la prise étiquetée, mot pour mot, pour qu'on
# puisse alterner l'un et l'autre sans compenser mentalement une différence de
# contenu. Les silences relevés dessus : 0,34 s après 次は, 0,43 s entre les
# deux 渋谷, 0,31 s avant お出口 - court partout, aucune pause longue à
# l'intérieur d'une annonce. Le drapeau du milieu choisit entre short_gap et
# long_gap, le dernier dit si le morceau est le NOM DE GARE.
JA_SEGS = [("次は。", False, False), ("渋谷。", True, True),
           ("渋谷。", False, True), ("お出口は右側です。", False, False)]
EN_SEGS = [("The next station is.", True, False),
           ("[Shibuya](/ʃibˈujɑ/).", False, True),
           ("The doors on the right side will open.", False, False)]

# --- Le plan d'essais ------------------------------------------------------
# `axe` sert au dépouillement : il dit ce que la variante fait varier.
#
# La VITESSE de chaque voix est celle qui reproduit les durées de la prise
# étiquetée (次は 0,51 s · 渋谷 0,67 s · お出口は右側です 1,57 s) - elle diffère
# beaucoup d'une voix à l'autre, et la comparer à réglage égal n'aurait donc
# rien comparé du tout.
#
# Le SOURIRE va jusqu'à ×1,30 parce que la prise réelle est BEAUCOUP plus
# brillante que toutes les voix japonaises de Kokoro : centroïde 981 Hz contre
# 570-660 pour jf_nezumi ou jf_tebukuro, une fois les deux passés par la même
# sono. C'est probablement ça, « la voix radio qui sourit ».

# (voix, vitesse, transposition, sourire, sourire du nom, silences, axe)
JA = [
    # Chaque voix à sa vitesse calée, rien d'autre.
    ("jf_alpha", 1.01, 0, 1.00, 1.00, (0.32, 0.43), "voix"),
    ("jf_tebukuro", 1.19, 0, 1.00, 1.00, (0.32, 0.43), "voix"),
    ("jf_gongitsune", 1.33, 0, 1.00, 1.00, (0.32, 0.43), "voix"),
    ("jf_nezumi", 1.11, 0, 1.00, 1.00, (0.32, 0.43), "voix"),
    # Voix anglaises sur phonèmes japonais : bien plus claires. Pari sur la
    # prononciation - c'est justement ce qu'on met à l'épreuve.
    ("af_sarah", 1.01, 0, 1.00, 1.00, (0.32, 0.43), "voix"),
    ("af_heart", 1.10, 0, 1.00, 1.00, (0.32, 0.43), "voix"),
    ("af_jessica", 1.05, 0, 1.00, 1.00, (0.32, 0.43), "voix"),
    ("bf_isabella", 1.05, 0, 1.00, 1.00, (0.32, 0.43), "voix"),
    # Les quatre meilleurs calages sur le spectre de la prise étiquetée.
    ("af_heart", 1.10, -2, 1.30, 1.00, (0.32, 0.43), "calage"),
    ("af_sarah", 1.01, -4, 1.30, 1.00, (0.32, 0.43), "calage"),
    ("jf_alpha", 1.01, -4, 1.10, 1.00, (0.32, 0.43), "calage"),
    ("bf_isabella", 1.05, 0, 1.30, 1.00, (0.32, 0.43), "calage"),
    # Le sourire seul, à voix et registre constants.
    ("jf_alpha", 1.01, -4, 1.00, 1.00, (0.32, 0.43), "sourire"),
    ("jf_alpha", 1.01, -4, 1.20, 1.00, (0.32, 0.43), "sourire"),
    ("jf_alpha", 1.01, -4, 1.35, 1.00, (0.32, 0.43), "sourire"),
    # Le registre seul.
    ("af_heart", 1.10, 0, 1.30, 1.00, (0.32, 0.43), "registre"),
    ("af_heart", 1.10, -4, 1.30, 1.00, (0.32, 0.43), "registre"),
    # Le nom de gare plus brillant que la phrase qui l'introduit.
    ("jf_alpha", 1.01, -4, 1.10, 1.20, (0.32, 0.43), "nom"),
    ("af_heart", 1.10, -2, 1.20, 1.25, (0.32, 0.43), "nom"),
    # La cadence : celle d'aujourd'hui, et une plus serrée.
    ("af_heart", 1.10, -2, 1.30, 1.00, (0.62, 0.62), "cadence"),
    ("af_heart", 1.10, -2, 1.30, 1.00, (0.22, 0.30), "cadence"),
    # Le débit autour de la vitesse calée.
    ("af_heart", 0.98, -2, 1.30, 1.00, (0.32, 0.43), "débit"),
    ("af_heart", 1.24, -2, 1.30, 1.00, (0.32, 0.43), "débit"),
    # Un dernier pari : la plus brillante de toutes, nom compris.
    ("af_sarah", 1.01, -4, 1.30, 1.20, (0.32, 0.43), "ensemble"),
]

EN = [
    ("af_heart", 0.93, 0, 1.00, 1.00, (0.32, 0.43), "voix"),
    ("af_bella", 0.90, 0, 1.00, 1.00, (0.32, 0.43), "voix"),
    ("af_sarah", 0.90, 0, 1.00, 1.00, (0.32, 0.43), "voix"),
    ("af_jessica", 0.90, 0, 1.00, 1.00, (0.32, 0.43), "voix"),
    ("bf_isabella", 0.90, 0, 1.00, 1.00, (0.32, 0.43), "voix"),
    ("af_nicole", 0.90, 0, 1.00, 1.00, (0.32, 0.43), "voix"),
    ("af_kore", 0.90, 0, 1.00, 1.00, (0.32, 0.43), "voix"),
    ("af_heart", 0.85, 0, 1.20, 1.00, (0.32, 0.43), "sourire"),
    ("af_heart", 0.85, 0, 1.30, 1.00, (0.32, 0.43), "sourire"),
    ("af_sarah", 0.90, 0, 1.25, 1.00, (0.32, 0.43), "sourire"),
    ("af_heart", 0.85, 2, 1.20, 1.00, (0.32, 0.43), "registre"),
    ("af_heart", 0.85, 0, 1.20, 1.25, (0.32, 0.43), "nom"),
    ("af_sarah", 0.90, 0, 1.25, 1.25, (0.32, 0.43), "nom"),
    ("af_heart", 0.78, 0, 1.20, 1.00, (0.32, 0.43), "débit"),
    ("af_heart", 0.85, 0, 1.20, 1.20, (0.28, 0.36), "ensemble"),
]


def recipes(plan, prefix):
    out = []
    for i, (voice, speed, st, smile, name_smile, gaps, axis) in enumerate(plan, 1):
        out.append((
            Recipe(f"{prefix}{i:02d}", voice, speed, st, smile,
                   0.0, name_smile, gaps[0], gaps[1]),
            axis,
        ))
    return out


def main():
    rec_path, model, voices, out_dir = sys.argv[1:5]
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    refs = []
    for i, arg in enumerate(sys.argv):
        if arg == "--ref" and i + 1 < len(sys.argv):
            label, _, path = sys.argv[i + 1].partition("=")
            y, ysr = load(path, sr=24000)
            rid = f"extra{len(refs)}"
            (out / f"{rid}.mp3").write_bytes(encode_mp3(y, ysr, kbps=80))
            refs.append(dict(id=rid, label=label))
            print(f"  {label}  ({len(y) / ysr:.1f} s)")

    x, sr = load(rec_path, sr=24000)
    for name, a, b in EXCERPTS:
        seg = x[int(a * sr) : int(b * sr)]
        rid = name.replace(" ", "")
        (out / f"{rid}.mp3").write_bytes(encode_mp3(seg, sr, kbps=80))
        refs.append(dict(id=rid, label=name))
        print(f"  {name}  {a:.1f}–{b:.1f} s")

    kokoro = load_engine(model, voices)
    jg, eg = load_g2p()

    items = []
    for plan, prefix, lang, segs in ((JA, "J", "ja-JP", JA_SEGS), (EN, "E", "en-US", EN_SEGS)):
        for r, axis in recipes(plan, prefix):
            y = synth(kokoro, jg, eg, r, "", lang, segments=segs)
            (out / f"{r.name}-sec.mp3").write_bytes(encode_mp3(y))
            (out / f"{r.name}.mp3").write_bytes(encode_mp3(cabin_pa(y)))
            d = describe(y, 24000)
            items.append(dict(
                id=r.name, lang=lang, axis=axis, voice=r.voice, speed=r.speed,
                st=r.semitones, smile=r.smile, lift=r.name_lift,
                gaps=[r.short_gap, r.long_gap],
                f0=round(d["f0_med"]), rng=round(d["f0_range_st"], 1),
                dur=round(d["dur"], 2),
                setting=f"{r.voice} · {r.speed:.2f}"
                        + (f" · {r.semitones:+g} st" if r.semitones else "")
                        + (f" · sourire ×{r.smile:.2f}" if r.smile != 1 else "")
                        + (f" · nom ×{r.name_smile:.2f}" if r.name_smile != 1 else "")
                        + f" · {r.short_gap:g}/{r.long_gap:g} s",
            ))
            print(f"  {r.name} {items[-1]['setting']}")

    clips = {p.stem: "data:audio/mpeg;base64," + base64.b64encode(p.read_bytes()).decode()
             for p in sorted(out.glob("*.mp3"))}
    payload = dict(refs=refs, items=items, clips=clips)
    tmpl = (Path(__file__).parent / "notes.tmpl.html").read_text(encoding="utf-8")
    page = out / "notes.html"
    page.write_text(tmpl.replace("/*__DATA__*/", json.dumps(payload, ensure_ascii=False)),
                    encoding="utf-8")
    print(f"\n→ {page}  ({page.stat().st_size / 1e6:.1f} Mo)")


if __name__ == "__main__":
    main()

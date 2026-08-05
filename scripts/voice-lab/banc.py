#!/usr/bin/env python3
"""Fabrique le banc d'écoute A/B : extraits de l'enregistrement + variantes.

Usage :
  python scripts/voice-lab/rapport.py enregistrement.mp3 textes.json \
      public/audio/announcements --json /tmp/mesures.json
  python scripts/voice-lab/banc.py enregistrement.mp3 /tmp/mesures.json \
      kokoro-v1.0.onnx voices-v1.0.bin /tmp/banc

Sort une page HTML autonome (tous les MP3 en data: URI) : l'étalon en haut,
les variantes en dessous, et chaque variante ne change QU'UNE chose par rapport
à la précédente - sans quoi on entend une différence sans savoir laquelle des
deux corrections l'a produite.

Les extraits de référence sont repérés par leur seconde de début : ce sont des
blocs entiers de l'enregistrement fourni, à réajuster si l'on change de prise.
"""

import base64
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from atelier import Recipe, encode_mp3, load_engine, load_g2p, synth  # noqa: E402
from mesures import describe, frame_rms, load, segments, syllable_rate  # noqa: E402

# Extraits de l'enregistrement, en secondes : des blocs entiers, avec un peu d'air.
EXCERPTS = [
    ("ref-1", 63.9, 74.1, "Approche + reprise, 1:04"),
    ("ref-2", 170.6, 178.9, "Séquence de gare, 2:51"),
    ("ref-3", 196.4, 207.7, "Départ, 3:16"),
    ("ref-4", 326.9, 344.0, "Séquence longue, 5:27"),
    ("ref-5", 719.4, 740.0, "Séquence longue, 12:00"),
]

# --- Textes témoins -------------------------------------------------------
# Les mêmes qu'en jeu, à ceci près que l'anglais porte déjà l'annotation de
# prononciation que pose scripts/en-readings.ts.
JA_TEXT = "次は。渋谷。渋谷。お出口は。右側です。"
JA_TEXT2 = "まもなく。渋谷。渋谷。お出口は。右側です。"
EN_TEXT = ("The next station is. [Shibuya](/ɕˈibuja/). J Y. 20. "
           "The doors on the right side will open.")
EN_TEXT2 = ("We will soon make a brief stop at. [Shibuya](/ɕˈibuja/). J Y. 20. "
            "The doors on the right side will open.")

# Découpe ACTUELLE : un morceau par 。, tous suivis du même silence.
CHUNKS_NOW = {
    "next": [(p, True) for p in ("次は。", "渋谷。", "渋谷。", "お出口は。", "右側です。")],
    "soon": [(p, True) for p in ("まもなく。", "渋谷。", "渋谷。", "お出口は。", "右側です。")],
}
# Découpe PROPOSÉE : le nom de gare reste collé à ce qui l'annonce et à sa
# répétition (silence court) ; seule la vraie frontière de phrase reçoit le
# silence long. C'est la forme de l'annonce réelle - 「次は、渋谷ー、渋谷ー。」
# d'un trait, une respiration, puis 「お出口は右側です。」
CHUNKS_GROUPED = {
    "next": [("次は。", False), ("渋谷。", False), ("渋谷。", True), ("お出口は右側です。", True)],
    "soon": [("まもなく。", False), ("渋谷。", False), ("渋谷。", True), ("お出口は右側です。", True)],
}

JA_RECIPES = [
    Recipe("ja-A", "jf_alpha", 1.15, 0.0, 0.62, 0.62, "A — actuel",
           "jf_alpha, vitesse 1,15, un silence unique de 0,62 s à chaque 。"),
    Recipe("ja-B", "jf_alpha", 1.15, 0.0, 0.32, 1.06, "B — cadence seule",
           "même voix ; groupes de phrase + silences 0,32 / 1,06 s"),
    Recipe("ja-C", "jf_alpha", 1.15, -4.0, 0.62, 0.62, "C — registre seul",
           "cadence actuelle ; jf_alpha descendue de 4 demi-tons (283 → ~225 Hz)"),
    Recipe("ja-D", "jf_alpha", 1.15, -4.0, 0.32, 1.06, "D — cadence + registre",
           "les deux corrections ensemble, même voix qu'aujourd'hui"),
    Recipe("ja-E", "jf_tebukuro", 1.15, 0.0, 0.32, 1.06, "E — autre voix",
           "jf_tebukuro : 220 Hz et 11,2 st d'étendue en natif - les deux cibles - + cadence"),
    Recipe("ja-F", "jf_tebukuro", 1.15, 2.5, 0.32, 1.06, "F — autre voix, second registre",
           "jf_tebukuro remontée sur le second mode de l'enregistrement (≈ 254 Hz)"),
]

EN_RECIPES = [
    Recipe("en-A", "af_heart", 0.93, 0.0, label="A — actuel",
           notes="af_heart, vitesse 0,93, ponctuation laissée à Kokoro"),
    Recipe("en-B", "af_heart", 0.83, 0.0, label="B — débit",
           notes="même voix, ralentie : 6,90 → ~6,15 pics/s, le débit de l'enregistrement"),
    Recipe("en-C", "af_heart", 0.83, 2.0, label="C — débit + registre",
           notes="ralentie et remontée de 2 demi-tons (201 → ~227 Hz)"),
    Recipe("en-D", "af_bella", 0.90, 0.0, label="D — autre voix",
           notes="af_bella : timbre plus rond, articulation plus posée"),
    Recipe("en-E", "af_bella", 0.90, 1.5, label="E — autre voix, registre haut",
           notes="af_bella remontée de 1,5 demi-ton (≈ 226 Hz)"),
]

JA_PHRASES = [("next", JA_TEXT), ("soon", JA_TEXT2)]
EN_PHRASES = [("next", EN_TEXT), ("soon", EN_TEXT2)]


def stats(x, sr=24000):
    d = describe(x, sr)
    rms, h, _ = frame_rms(x, sr)
    thr = max(np.percentile(rms, 20) * 4, np.percentile(rms, 60) * 0.25)
    segs = segments(rms, h / sr, thr, min_dur=0.10, min_gap=0.12)
    spoken = sum(b - a for a, b in segs) or 1e-9
    d["silence_pct"] = 100 * (1 - spoken / (len(x) / sr))
    r = syllable_rate(x, sr)
    d["rate"] = round(r[0], 2) if r else None
    return d


def main():
    rec_path, mesures_path, model, voices, out_dir = sys.argv[1:6]
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    mesures = json.load(open(mesures_path, encoding="utf-8"))

    print("Extraits de l'enregistrement…")
    x, sr = load(rec_path, sr=24000)
    refs = []
    for name, a, b, label in EXCERPTS:
        seg = x[int(a * sr) : int(b * sr)]
        (out / f"{name}.mp3").write_bytes(encode_mp3(seg, sr, kbps=80))
        d = stats(seg, sr)
        refs.append(dict(id=name, label=label, f0=round(d["f0_med"]),
                         dur=round(len(seg) / sr, 2)))
        print(f"  {name}  {a:.1f}–{b:.1f} s  F0 {d['f0_med']:.0f} Hz")

    kokoro = load_engine(model, voices)
    jg, eg = load_g2p()

    def run(recipes, phrases, lang, chunked):
        rows = []
        for r in recipes:
            for tag, text in phrases:
                segs = None
                if chunked:
                    segs = (CHUNKS_NOW if r.short_gap == r.long_gap else CHUNKS_GROUPED)[tag]
                y = synth(kokoro, jg, eg, r, text, lang, segments=segs)
                (out / f"{r.name}-{tag}.mp3").write_bytes(encode_mp3(y))
                if tag == phrases[0][0]:
                    d = stats(y)
                    rows.append(dict(id=r.name, label=r.label, notes=r.notes,
                                     voice=r.voice, speed=r.speed, semitones=r.semitones,
                                     gaps=[r.short_gap, r.long_gap],
                                     dur=round(d["dur"], 2), f0=round(d["f0_med"]),
                                     rng=round(d["f0_range_st"], 1), rate=d["rate"]))
                    print(f"  {r.name} {r.label:30} F0 {d['f0_med']:5.0f} Hz  "
                          f"étendue {d['f0_range_st']:4.1f} st  durée {d['dur']:.2f} s")
        return rows

    print("\nJaponais…")
    ja = run(JA_RECIPES, JA_PHRASES, "ja-JP", True)
    print("\nAnglais…")
    en = run(EN_RECIPES, EN_PHRASES, "en-US", False)

    clips = {p.stem: "data:audio/mpeg;base64," + base64.b64encode(p.read_bytes()).decode()
             for p in sorted(out.glob("*.mp3"))}
    payload = dict(ref=mesures["ref"], now=mesures["clips"], refClips=refs,
                   ja=ja, en=en,
                   jaPhrases=[[t, s] for t, s in JA_PHRASES],
                   enPhrases=[[t, s] for t, s in EN_PHRASES],
                   clips=clips)
    tmpl = (Path(__file__).parent / "banc.tmpl.html").read_text(encoding="utf-8")
    page = out / "banc.html"
    page.write_text(tmpl.replace("/*__DATA__*/", json.dumps(payload, ensure_ascii=False)),
                    encoding="utf-8")
    print(f"\n→ {page}  ({page.stat().st_size / 1e6:.1f} Mo)")


if __name__ == "__main__":
    main()

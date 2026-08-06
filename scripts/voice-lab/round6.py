#!/usr/bin/env python3
"""Sixième tour : court, et avec un CONTRÔLE DE COHÉRENCE.

Le tour précédent a révélé un défaut de protocole autant qu'un défaut d'audio :
un extrait noté 4 au cinquième tour a été noté 1 au sixième alors qu'il
s'agissait du MÊME FICHIER, au bit près. Aucune conclusion ne tient sur une
note qui ne se reproduit pas.

Deux réponses. D'abord la voix elle-même est réparée - l'alignement dynamique
figeait jusqu'à 125 ms de spectre immobile et les décisions de voisement
étaient empruntées à la référence, ce qui transformait en bruit des trames que
la synthèse prononçait. Ensuite ce tour est court, et il contient DEUX PAIRES
DE DOUBLONS : quatre extraits qui n'en sont que deux. Si les notes des doublons
divergent, c'est l'échelle qu'il faut changer, pas la voix.
"""
import base64
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, "/home/user/yamanote-3d/scripts/voice-lab")
import pyworld  # noqa: E402

from atelier import encode_mp3, load_engine, load_g2p, trim  # noqa: E402
from greffe import FRAME_MS, SR, TAKE, graft, world  # noqa: E402
from mesures import describe, load  # noqa: E402
from voicevox import calibrate, engine, say  # noqa: E402

BASE = Path("/tmp/claude-0/-home-user-yamanote-3d/eb76dbfa-6c35-52d3-8f17-60a42ba17a91/scratchpad")
REF = ("/root/.claude/uploads/eb76dbfa-6c35-52d3-8f17-60a42ba17a91/7b53f860-______________"
       "_____________________Train_Announcement_JR_Yamanote_Line_with_Takanawa_Gateway_sta."
       "_580_586.mp3")
OUT = BASE / "round6"


def assemble(segments):
    parts = []
    for i, y in enumerate(segments):
        parts.append(y / (np.max(np.abs(y)) or 1.0) * 0.8)
        gap = TAKE[i][3]
        if gap:
            parts.append(np.zeros(int(SR * gap), np.float32))
    return np.concatenate(parts)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    ref, _ = load(REF, sr=SR)
    refseg = [ref[int(a * SR) : int(b * SR)] for _, a, b, _ in TAKE]

    kokoro = load_engine(str(BASE / "tts/kokoro-v1.0.onnx"), str(BASE / "tts/voices-v1.0.bin"))
    jg, _ = load_g2p()
    syn, names = engine(BASE / "vv")

    def kok(voice, speed, mode):
        segs = []
        for i, (text, _, _, _) in enumerate(TAKE):
            raw, _ = kokoro.create(jg(text)[0], voice=voice, speed=speed, is_phonemes=True)
            x = trim(np.asarray(raw, np.float32))
            if mode == "brut":
                segs.append(x)
            elif mode == "vocodeur":
                f0, sp, ap = world(x)
                segs.append(np.asarray(pyworld.synthesize(f0, sp, ap, SR, FRAME_MS), np.float32))
            else:
                segs.append(graft(x, refseg[i]))
        return assemble(segs)

    def vv(style):
        speed, st = calibrate(syn, style)
        segs = []
        for i, (text, _, _, _) in enumerate(TAKE):
            x, _ = say(syn, text, style, speed=speed, semitones=st)
            segs.append(graft(np.asarray(x, np.float32), refseg[i]))
        return assemble(segs)

    # L'ordre mélange les familles ; les doublons sont volontairement éloignés.
    plan = [
        ("greffe corrigée · voix A", lambda: kok("jf_tebukuro", 1.19, "greffe")),
        ("sans greffe · voix A", lambda: kok("jf_tebukuro", 1.19, "brut")),
        ("greffe corrigée · voix B", lambda: vv(27)),
        ("vocodeur seul · voix A", lambda: kok("jf_tebukuro", 1.19, "vocodeur")),
        ("greffe corrigée · voix C", lambda: vv(9)),
        ("DOUBLON de X01", lambda: kok("jf_tebukuro", 1.19, "greffe")),
        ("DOUBLON de X03", lambda: vv(27)),
    ]
    items = []
    for n, (label, make) in enumerate(plan, 1):
        y = make()
        rid = f"X{n:02d}"
        (OUT / f"{rid}.mp3").write_bytes(encode_mp3(y))
        (OUT / f"{rid}-sec.mp3").write_bytes(encode_mp3(y))
        d = describe(y, SR)
        items.append(dict(id=rid, lang="ja-JP", axis="tour6", voice=label, speed=0.0,
                          st=0.0, smile=1.0, lift=0.0, gaps=[0.32, 0.43],
                          f0=round(d["f0_med"]), rng=round(d["f0_range_st"], 1),
                          dur=round(d["dur"], 2), setting=label))
        print(f"  {rid} {label:28} F0 {d['f0_med']:3.0f}  étendue {d['f0_range_st']:4.1f} st  "
              f"centroïde {d['centroid']:4.0f}")

    (OUT / "ref.mp3").write_bytes(encode_mp3(ref, SR, kbps=80))
    clips = {p.stem: "data:audio/mpeg;base64," + base64.b64encode(p.read_bytes()).decode()
             for p in sorted(OUT.glob("*.mp3"))}
    tmpl = Path("/home/user/yamanote-3d/scripts/voice-lab/notes.tmpl.html").read_text(
        encoding="utf-8")
    (OUT / "notes.html").write_text(
        tmpl.replace("/*__DATA__*/", json.dumps(dict(
            refs=[dict(id="ref", label="la prise réelle")], items=items, clips=clips),
            ensure_ascii=False))
        .replace("yamanote-notes-v2", "yamanote-r6")
        .replace("<h2>Japonais — 次は。渋谷。渋谷。お出口は右側です。</h2>",
                 "<h2>次は。渋谷。渋谷。お出口は右側です。</h2>")
        .replace("""      La première référence dit exactement la même phrase que les extraits.
      Écoute-la, puis chaque extrait, et note de 1 à 5. Les réglages sont
      cachés — juge à l'oreille. À la fin, copie les notes.""",
                 """      Sept extraits, dont deux paires de doublons — le même fichier proposé
      deux fois, à des places différentes. Note simplement à l'oreille : l'écart
      entre les doublons me dira si l'échelle tient."""),
        encoding="utf-8")
    print(f"\n→ {OUT / 'notes.html'}")


if __name__ == "__main__":
    main()

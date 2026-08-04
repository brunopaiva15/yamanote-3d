#!/usr/bin/env python3
"""Cinquième tour : la greffe POSÉE SUR VOICEVOX.

Où l'on en est : Kokoro réglé plafonne à 2, VOICEVOX calé plafonne à 3, et
Kokoro + greffe de mélodie atteint 4. La greffe est donc le levier, et la
question restante est sur QUELLE voix la poser.

VOICEVOX est un meilleur point de départ que Kokoro pour une raison mesurable :
ses voix sont déjà calées au registre de la prise (236 Hz) sans
rééchantillonnage, or c'est exactement la condition qui séparait jf_tebukuro
(224 Hz natif, greffé → 4) de jf_alpha (296 Hz, greffé → 1).
"""
import base64
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, "/home/user/yamanote-3d/scripts/voice-lab")
from atelier import encode_mp3, load_engine, load_g2p, trim  # noqa: E402
from greffe import SR, TAKE, graft  # noqa: E402
from mesures import describe, load  # noqa: E402
from timbre import cabin_pa  # noqa: E402
from voicevox import calibrate, engine, say  # noqa: E402

BASE = Path("/tmp/claude-0/-home-user-yamanote-3d/eb76dbfa-6c35-52d3-8f17-60a42ba17a91/scratchpad")
REF = ("/root/.claude/uploads/eb76dbfa-6c35-52d3-8f17-60a42ba17a91/7b53f860-______________"
       "_____________________Train_Announcement_JR_Yamanote_Line_with_Takanawa_Gateway_sta."
       "_580_586.mp3")
OUT = BASE / "round5"

# Les voix VOICEVOX qui ont plu (3 et 2 sur 5), plus le style « annonce ».
VV = [(27, "後鬼 / 人間ver."), (9, "波音リツ"), (30, "No.7 / アナウンス"), (29, "No.7")]
# Le meilleur résultat obtenu jusqu'ici, comme repère dans la même page.
KOKORO = ("jf_tebukuro", 1.19)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    ref, _ = load(REF, sr=SR)
    syn, names = engine(BASE / "vv")
    items, n = [], 0

    def add(y, label, axis):
        nonlocal n
        n += 1
        rid = f"W{n:02d}"
        (OUT / f"{rid}.mp3").write_bytes(encode_mp3(y))
        (OUT / f"{rid}-sec.mp3").write_bytes(encode_mp3(y))
        d = describe(y, SR)
        items.append(dict(id=rid, lang="ja-JP", axis=axis, voice=label, speed=0.0,
                          st=0.0, smile=1.0, lift=0.0, gaps=[0.32, 0.43],
                          f0=round(d["f0_med"]), rng=round(d["f0_range_st"], 1),
                          dur=round(d["dur"], 2), setting=label))
        print(f"  {rid} {label:46} F0 {d['f0_med']:3.0f}  étendue {d['f0_range_st']:4.1f} st")

    for style, name in VV:
        speed, st = calibrate(syn, style)
        for force, tag in ((1.0, "greffe"), (0.75, "greffe 0,75")):
            parts = []
            for text, a, b, gap in TAKE:
                x, _ = say(syn, text, style, speed=speed, semitones=st)
                y = graft(np.asarray(x, np.float32), ref[int(a * SR) : int(b * SR)],
                          strength=force)
                parts.append(y / (np.max(np.abs(y)) or 1.0) * 0.8)
                if gap:
                    parts.append(np.zeros(int(SR * gap), np.float32))
            y = np.concatenate(parts)
            add(y, f"{name} · {tag}", "voicevox+greffe")
            if force == 1.0:
                add(cabin_pa(y), f"{name} · greffe · sono de la rame", "sono")

    # Repère : le 4/5 déjà obtenu, refait à l'identique.
    kokoro = load_engine(str(BASE / "tts/kokoro-v1.0.onnx"), str(BASE / "tts/voices-v1.0.bin"))
    jg, _ = load_g2p()
    parts = []
    for text, a, b, gap in TAKE:
        raw, _ = kokoro.create(jg(text)[0], voice=KOKORO[0], speed=KOKORO[1], is_phonemes=True)
        y = graft(trim(np.asarray(raw, np.float32)), ref[int(a * SR) : int(b * SR)])
        parts.append(y / (np.max(np.abs(y)) or 1.0) * 0.8)
        if gap:
            parts.append(np.zeros(int(SR * gap), np.float32))
    add(np.concatenate(parts), "jf_tebukuro (Kokoro) · greffe — le 4/5 précédent", "repère")

    (OUT / "ref.mp3").write_bytes(encode_mp3(ref, SR, kbps=80))
    clips = {p.stem: "data:audio/mpeg;base64," + base64.b64encode(p.read_bytes()).decode()
             for p in sorted(OUT.glob("*.mp3"))}
    tmpl = Path("/home/user/yamanote-3d/scripts/voice-lab/notes.tmpl.html").read_text(
        encoding="utf-8")
    (OUT / "notes.html").write_text(
        tmpl.replace("/*__DATA__*/", json.dumps(dict(
            refs=[dict(id="ref", label="la prise réelle")], items=items, clips=clips),
            ensure_ascii=False))
        .replace("yamanote-notes-v2", "yamanote-r5")
        .replace("<h2>Japonais — 次は。渋谷。渋谷。お出口は右側です。</h2>",
                 "<h2>次は。渋谷。渋谷。お出口は右側です。</h2>")
        .replace("""      La première référence dit exactement la même phrase que les extraits.
      Écoute-la, puis chaque extrait, et note de 1 à 5. Les réglages sont
      cachés — juge à l'oreille. À la fin, copie les notes.""",
                 """      La greffe de mélodie, posée cette fois sur les voix du nouveau moteur.
      Le dernier extrait est le 4/5 déjà obtenu — c'est le repère à battre."""),
        encoding="utf-8")
    print(f"\n→ {OUT / 'notes.html'}")


if __name__ == "__main__":
    main()

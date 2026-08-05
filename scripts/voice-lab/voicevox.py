#!/usr/bin/env python3
"""VOICEVOX : le moteur qui accepte enfin des consignes de prosodie.

POURQUOI. Kokoro rend un fichier audio à partir de phonèmes et rien d'autre :
la mélodie qu'il produit est celle qu'il veut, et deux tours d'écoute notée ont
montré qu'aucune retouche postérieure ne rattrape ça (plafond à 2/5). Greffer
la mélodie d'une prise réelle marche - 4/5 - mais demande une prise du texte
visé, donc ne passe pas à l'échelle des 476 clips du jeu.

VOICEVOX, lui, expose une `AudioQuery` : la phrase décrite MORE PAR MORE, avec
pour chacune sa durée de consonne, sa durée de voyelle et sa hauteur, toutes
modifiables AVANT synthèse. On y pose donc directement ce que la prise
étiquetée a montré, sur n'importe quel texte :

- la hauteur médiane relevée (236 Hz), par addition sur les hauteurs de mores.
  C'est un décalage dans le domaine logarithmique, pas un rééchantillonnage :
  les formants ne bougent pas, et l'effet « dessin animé » ne peut pas
  apparaître ;
- les durées relevées (次は 0,51 s · 渋谷 0,67 s · お出口は右側です 1,57 s), via
  une vitesse calée voix par voix ;
- les silences relevés (0,34 / 0,43 / 0,31 s), posés par nous entre des
  segments synthétisés sans rembourrage.

INSTALLATION. Le téléchargeur officiel de VOICEVOX interroge l'API GitHub et
échoue derrière un accès restreint ; les assets de RELEASE, eux, se récupèrent
directement. Il faut trois choses, et le dictionnaire arrive avec pyopenjtalk :

    V=0.16.0
    curl -L -O https://github.com/VOICEVOX/voicevox_core/releases/download/$V/voicevox_core-$V-cp310-abi3-manylinux_2_34_x86_64.whl
    curl -L -o ort.tgz https://github.com/VOICEVOX/onnxruntime-builder/releases/download/voicevox_onnxruntime-1.17.3/voicevox_onnxruntime-linux-x64-1.17.3.tgz
    mkdir -p ort models && tar xzf ort.tgz -C ort
    for i in $(seq 0 7); do curl -L -o models/$i.vvm \
        https://github.com/VOICEVOX/voicevox_vvm/releases/download/$V/$i.vvm; done
    pip install ./voicevox_core-$V-cp310-abi3-manylinux_2_34_x86_64.whl pyopenjtalk

LICENCE. VOICEVOX est gratuit, usage commercial compris, mais CHAQUE
personnage vocal impose son crédit - « VOICEVOX:<nom du personnage> ». Le
crédit devra figurer dans about.html, et il dépend de la voix retenue.

Usage :
    python scripts/voice-lab/voicevox.py RACINE --list
    python scripts/voice-lab/voicevox.py RACINE --bench /tmp/vv --styles 30,8,10,14
"""

import argparse
import base64
import glob
import io
import json
import os
import sys
import wave
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from atelier import encode_mp3  # noqa: E402
from mesures import describe  # noqa: E402

SR = 24000
# Relevés sur la prise étiquetée 「次は。渋谷。渋谷。お出口は右側です。」
TARGET_F0 = 236.0
TARGET_DUR = {"次は。": 0.51, "渋谷。": 0.67, "お出口は右側です。": 1.57}
SEGMENTS = [("次は。", 0.34), ("渋谷。", 0.43), ("渋谷。", 0.31), ("お出口は右側です。", 0.0)]


def engine(root):
    """Charge le moteur et tous les modèles trouvés sous `root`."""
    from voicevox_core.blocking import Onnxruntime, OpenJtalk, Synthesizer, VoiceModelFile

    root = Path(root)
    libs = sorted(glob.glob(str(root / "ort" / "*" / "lib" / "libvoicevox_onnxruntime.so.*")))
    if not libs:
        raise SystemExit(f"ONNX Runtime introuvable sous {root}/ort - voir l'en-tête.")
    ort = Onnxruntime.load_once(filename=os.path.abspath(libs[0]))

    import pyopenjtalk

    dic = Path(pyopenjtalk.OPEN_JTALK_DICT_DIR.decode()
               if isinstance(pyopenjtalk.OPEN_JTALK_DICT_DIR, bytes)
               else pyopenjtalk.OPEN_JTALK_DICT_DIR)
    syn = Synthesizer(ort, OpenJtalk(str(dic)))
    names = {}
    for p in sorted(glob.glob(str(root / "models" / "*.vvm"))):
        with VoiceModelFile.open(p) as m:
            syn.load_voice_model(m)
            for sp in m.metas:
                for st in sp.styles:
                    names[st.id] = f"{sp.name} / {st.name}"
    if not names:
        raise SystemExit(f"Aucun modèle .vvm sous {root}/models - voir l'en-tête.")
    return syn, names


def wav_to_float(data):
    with wave.open(io.BytesIO(data)) as w:
        pcm = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float32) / 32768
        if w.getnchannels() == 2:
            pcm = pcm.reshape(-1, 2).mean(axis=1)
        return pcm, w.getframerate()


def moras(q):
    return [m for ap in q.accent_phrases for m in ap.moras]


def say(syn, text, style, speed=1.0, semitones=0.0, intonation=1.0):
    """Un segment, sans rembourrage : les silences sont posés par l'appelant."""
    q = syn.create_audio_query(text, style)
    q.speed_scale = speed
    q.intonation_scale = intonation
    q.pre_phoneme_length = 0.0
    q.post_phoneme_length = 0.0
    q.output_sampling_rate = SR
    q.output_stereo = False
    if semitones:
        # `pitch` est un logarithme népérien de hertz : un demi-ton s'y ajoute,
        # il ne s'y multiplie pas. Aucun rééchantillonnage, donc aucun formant
        # déplacé - c'est ce qui manquait à Kokoro.
        d = semitones * np.log(2) / 12
        for m in moras(q):
            if m.pitch:
                m.pitch += d
    return wav_to_float(syn.synthesis(q, style))


def calibrate(syn, style, rounds=2):
    """(vitesse, transposition) qui rendent les durées et le registre relevés.

    Le registre se cale sur la SORTIE MESURÉE, pas sur les hauteurs de la
    requête : celles-ci ne prédisent pas exactement ce que le vocodeur rend, et
    un calage en boucle ouverte laissait 10 à 25 Hz d'écart. Deux tours de
    correction suffisent à tomber au hertz près.
    """
    ratios = []
    for text, want in TARGET_DUR.items():
        x, sr = say(syn, text, style)
        ratios.append(len(x) / sr / want)
    speed = round(float(np.median(ratios)), 2)

    st = 0.0
    for _ in range(rounds):
        y = phrase(syn, style, speed, st)
        got = describe(y, SR).get("f0_med", 0)
        if not got:
            break
        st = round(st + float(12 * np.log2(TARGET_F0 / got)), 1)
    return speed, st


def phrase(syn, style, speed, semitones, name_intonation=1.0):
    parts = []
    for i, (text, gap) in enumerate(SEGMENTS):
        x, sr = say(syn, text, style, speed=speed, semitones=semitones,
                    intonation=name_intonation if i in (1, 2) else 1.0)
        parts.append(x)
        if gap:
            parts.append(np.zeros(int(sr * gap), np.float32))
    return np.concatenate(parts)


def build(syn, names, out_dir, styles, intonations=(1.0,)):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    items, n = [], 0
    for style in styles:
        speed, st = calibrate(syn, style)
        for into in intonations:
            n += 1
            y = phrase(syn, style, speed, st, name_intonation=into)
            rid = f"V{n:02d}"
            (out / f"{rid}.mp3").write_bytes(encode_mp3(y))
            (out / f"{rid}-sec.mp3").write_bytes(encode_mp3(y))
            d = describe(y, SR)
            label = (f"{names.get(style, style)} · {speed:.2f} · {st:+g} st"
                     + (f" · nom ×{into:g}" if into != 1.0 else ""))
            items.append(dict(id=rid, lang="ja-JP", axis="voix", voice=names.get(style, str(style)),
                              speed=speed, st=st, smile=1.0, lift=0.0, gaps=[0.32, 0.43],
                              f0=round(d["f0_med"]), rng=round(d["f0_range_st"], 1),
                              dur=round(d["dur"], 2), setting=label))
            print(f"  {rid} {label:52} F0 {d['f0_med']:3.0f}  étendue {d['f0_range_st']:4.1f} st  "
                  f"durée {d['dur']:.2f} s")
    return out, items


def write_page(out, items, extra_refs=()):
    for rid, path in extra_refs:
        from mesures import load

        x, sr = load(path, sr=SR)
        (out / f"{rid}.mp3").write_bytes(encode_mp3(x, sr, kbps=80))
    clips = {p.stem: "data:audio/mpeg;base64," + base64.b64encode(p.read_bytes()).decode()
             for p in sorted(out.glob("*.mp3"))}
    tmpl = (Path(__file__).parent / "notes.tmpl.html").read_text(encoding="utf-8")
    page = out / "notes.html"
    page.write_text(tmpl.replace("/*__DATA__*/", json.dumps(dict(
        refs=[dict(id=rid, label="la prise réelle") for rid, _ in extra_refs],
        items=items, clips=clips), ensure_ascii=False)), encoding="utf-8")
    print(f"\n→ {page}  ({page.stat().st_size / 1e6:.1f} Mo)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("root", help="dossier contenant ort/ et models/")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--bench", metavar="DOSSIER")
    ap.add_argument("--styles", default="")
    ap.add_argument("--ref", default="", help="prise réelle à joindre comme étalon")
    a = ap.parse_args()

    syn, names = engine(a.root)
    if a.list:
        for sid, name in sorted(names.items()):
            print(f"{sid:5}  {name}")
        return
    if a.bench:
        ids = [int(s) for s in a.styles.split(",") if s.strip()] or sorted(names)[:10]
        out, items = build(syn, names, a.bench, ids)
        write_page(out, items, [("ref", a.ref)] if a.ref else [])
        return
    ap.print_help()


if __name__ == "__main__":
    main()

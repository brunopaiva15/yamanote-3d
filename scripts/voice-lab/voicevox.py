#!/usr/bin/env python3
"""Pont vers VOICEVOX : le moteur qui donne enfin prise sur la prosodie.

⚠ CE SCRIPT N'A PAS PU ÊTRE EXÉCUTÉ dans la session qui l'a écrit : VOICEVOX
n'y était pas atteignable (huggingface.co bloqué par la politique de sortie,
accès GitHub limité au seul dépôt du jeu). Il est écrit d'après l'API publique
du moteur et il est à vérifier au premier lancement.

POURQUOI CHANGER DE MOTEUR. Deux tours d'écoute notée, soixante variantes,
plafond à 2-3 sur 5 - et la meilleure note va systématiquement à une voix
BRUTE : chaque traitement appliqué après coup (transposition, sourire,
brillance du nom) fait redescendre. Kokoro n'a que quatre voix japonaises,
aucune n'approche la brillance de l'annonce réelle (centroïde 570-660 Hz
contre 981), et surtout il n'accepte AUCUNE consigne de prosodie : on ne peut
agir qu'après la synthèse, c'est-à-dire trop tard.

CE QUE VOICEVOX APPORTE. Sa requête `audio_query` est un objet modifiable
AVANT synthèse, décrivant la phrase mora par mora : chacune porte sa durée de
consonne, sa durée de voyelle et sa hauteur. On peut donc poser exactement ce
que la prise étiquetée a montré :

- les silences relevés (0,34 / 0,43 / 0,31 s) au centième, au lieu du 0,62 s
  uniforme que le générateur actuel pose partout ;
- le registre (médiane 236 Hz) en décalant les hauteurs, sans rééchantillonner
  quoi que ce soit ni déplacer les formants ;
- la couleur du NOM DE GARE - la prise le dit plus brillant que la phrase qui
  l'introduit, et `intonationScale` sur ce seul segment agit là où le
  traitement d'après-coup abîmait tout.

Licence : VOICEVOX est gratuit, y compris pour un usage commercial, mais
CHAQUE personnage vocal impose de le créditer. Le crédit exact dépend du
personnage retenu ; il devra figurer dans about.html et docs/.

Prérequis - le moteur tourne en local et expose son API sur le port 50021 :

    docker run --rm -p 50021:50021 voicevox/voicevox_engine:cpu-latest

Usage :
    python scripts/voice-lab/voicevox.py --list
    python scripts/voice-lab/voicevox.py --bench /tmp/vv --speakers 2,3,8,14
"""

import argparse
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from atelier import encode_mp3  # noqa: E402
from mesures import describe  # noqa: E402

BASE = "http://127.0.0.1:50021"

# Relevés sur la prise étiquetée 「次は。渋谷。渋谷。お出口は右側です。」
TARGET_F0 = 236.0
SEGMENTS = [("次は。", 0.34, False), ("渋谷。", 0.43, True),
            ("渋谷。", 0.31, True), ("お出口は右側です。", 0.0, False)]
TARGET_DUR = {"次は。": 0.51, "渋谷。": 0.67, "お出口は右側です。": 1.57}
# Le nom de gare, plus marqué que la phrase qui l'introduit.
NAME_INTONATION = 1.15


def api(path, query=None, body=None, raw=False):
    url = BASE + path + ("?" + urllib.parse.urlencode(query) if query else "")
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url, data=data, method="POST" if data is not None or body == {} else "GET",
        headers={"Content-Type": "application/json"} if data is not None else {},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read() if raw else json.loads(r.read())


def speakers():
    out = []
    for sp in api("/speakers"):
        for st in sp["styles"]:
            out.append((st["id"], f"{sp['name']} / {st['name']}"))
    return out


def wav_to_float(data):
    """WAV PCM 16 bits mono → tableau flottant, sans dépendance supplémentaire."""
    import io
    import wave

    with wave.open(io.BytesIO(data)) as w:
        n, sr = w.getnframes(), w.getframerate()
        pcm = np.frombuffer(w.readframes(n), dtype="<i2").astype(np.float32) / 32768
        if w.getnchannels() == 2:
            pcm = pcm.reshape(-1, 2).mean(axis=1)
    return pcm, sr


def query(text, speaker):
    return api("/audio_query", query={"text": text, "speaker": speaker}, body=None)


def shift_pitch(q, semitones):
    """Décale toutes les mores voisées. `pitch` est un log népérien de hertz,
    donc un demi-ton vaut ln(2)/12 - une addition, pas un rééchantillonnage,
    et les formants ne bougent pas."""
    d = semitones * np.log(2) / 12
    for ap in q["accent_phrases"]:
        for m in ap["moras"]:
            if m.get("pitch"):
                m["pitch"] += d
    return q


def median_f0(q):
    p = [m["pitch"] for ap in q["accent_phrases"] for m in ap["moras"] if m.get("pitch")]
    return float(np.exp(np.median(p))) if p else 0.0


def synth(text, speaker, speed=1.0, semitones=0.0, intonation=1.0):
    q = query(text, speaker)
    q["speedScale"] = speed
    q["intonationScale"] = intonation
    # Aucun rembourrage : les silences sont posés par NOUS, à la durée relevée.
    q["prePhonemeLength"] = 0.0
    q["postPhonemeLength"] = 0.0
    q["outputSamplingRate"] = 24000
    q["outputStereo"] = False
    if semitones:
        shift_pitch(q, semitones)
    return wav_to_float(api("/synthesis", query={"speaker": speaker}, body=q, raw=True))


def calibrate(speaker):
    """(vitesse, transposition) qui rendent les durées et le registre relevés."""
    ratios = []
    for text, want in TARGET_DUR.items():
        x, sr = synth(text, speaker)
        ratios.append(len(x) / sr / want)
    speed = round(float(np.median(ratios)), 2)
    f0 = median_f0(query(SEGMENTS[0][0], speaker))
    st = round(12 * np.log2(TARGET_F0 / f0), 1) if f0 else 0.0
    return speed, st


def build(out_dir, ids):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    names = dict(speakers())
    items = []
    for n, sid in enumerate(ids, 1):
        speed, st = calibrate(sid)
        parts = []
        for text, gap, is_name in SEGMENTS:
            x, sr = synth(text, sid, speed=speed, semitones=st,
                          intonation=NAME_INTONATION if is_name else 1.0)
            parts.append(x)
            if gap:
                parts.append(np.zeros(int(sr * gap), np.float32))
        y = np.concatenate(parts)
        rid = f"V{n:02d}"
        (out / f"{rid}-sec.mp3").write_bytes(encode_mp3(y))
        (out / f"{rid}.mp3").write_bytes(encode_mp3(y))
        d = describe(y, 24000)
        items.append(dict(
            id=rid, lang="ja-JP", axis="voix", voice=names.get(sid, str(sid)),
            speed=speed, st=st, smile=1.0, lift=0.0, gaps=[0.32, 0.43],
            f0=round(d["f0_med"]), rng=round(d["f0_range_st"], 1),
            dur=round(d["dur"], 2),
            setting=f"{names.get(sid, sid)} · {speed:.2f} · {st:+g} st"))
        print(f"  {rid} {items[-1]['setting']}  F0 {d['f0_med']:.0f}")

    import base64

    clips = {p.stem: "data:audio/mpeg;base64," + base64.b64encode(p.read_bytes()).decode()
             for p in sorted(out.glob("*.mp3"))}
    tmpl = (Path(__file__).parent / "notes.tmpl.html").read_text(encoding="utf-8")
    page = out / "notes.html"
    page.write_text(
        tmpl.replace("/*__DATA__*/",
                     json.dumps(dict(refs=[], items=items, clips=clips), ensure_ascii=False)),
        encoding="utf-8")
    print(f"\n→ {page}")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--list", action="store_true", help="liste les voix du moteur")
    ap.add_argument("--bench", metavar="DOSSIER", help="fabrique la page d'écoute notée")
    ap.add_argument("--speakers", default="", help="identifiants séparés par des virgules")
    a = ap.parse_args()
    try:
        if a.list:
            for sid, name in speakers():
                print(f"{sid:5}  {name}")
            return
        if a.bench:
            ids = [int(s) for s in a.speakers.split(",") if s.strip()]
            if not ids:
                ids = [sid for sid, _ in speakers()[:12]]
            build(a.bench, ids)
            return
    except OSError as exc:
        print(f"Moteur injoignable sur {BASE} : {exc}\n"
              "Lancez-le avec :\n"
              "  docker run --rm -p 50021:50021 voicevox/voicevox_engine:cpu-latest")
        raise SystemExit(1)
    ap.print_help()


if __name__ == "__main__":
    main()

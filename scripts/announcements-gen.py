#!/usr/bin/env python3
"""Génère les clips d'annonces avec Kokoro TTS (ONNX).

Entrée : le JSON produit par scripts/announcements-export.ts (textes + vitesses
+ lectures kana des gares). Sortie : un MP3 mono 24 kHz par annonce dans
public/audio/announcements/<clé>.mp3, et le manifeste src/data/pa-manifest.ts
(clé → durée en secondes) consommé par le runtime.

Voix : ja-JP → jf_alpha (G2P misaki/pyopenjtalk), en-US → af_heart (G2P misaki
anglais, repli espeak). Les identifiants de gare sont vérifiés : si open_jtalk
lit un nom de gare autrement que sa transcription kana (stations.ts), le kana
remplace le kanji dans le texte synthétisé.

Dépendances : pip install kokoro-onnx "misaki[en,ja]" lameenc
Modèle : kokoro-v1.0.onnx + voices-v1.0.bin
  (https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0)

Usage :
  python scripts/announcements-gen.py textes.json kokoro-v1.0.onnx \
      voices-v1.0.bin public/audio/announcements src/data/pa-manifest.ts
"""

import json
import sys
from pathlib import Path

import lameenc
import numpy as np
import pyopenjtalk
from kokoro_onnx import Kokoro
from misaki import ja

VOICE = {"ja-JP": "jf_alpha", "en-US": "af_heart"}
BITRATE_KBPS = 48
HEAD_PAD_S = 0.06
TAIL_PAD_S = 0.22
TRIM_THRESHOLD = 0.003  # amplitude sous laquelle un bord est du silence
PEAK_TARGET = 0.89


def build_en_g2p():
    from misaki import en

    fallback = None
    try:
        from misaki import espeak

        fallback = espeak.EspeakFallback(british=False)
    except Exception as exc:  # noqa: BLE001 — espeak est un confort, pas un requis
        print(f"  (espeak indisponible, repli lexique seul : {exc})")
    return en.G2P(trf=False, british=False, fallback=fallback)


def normalize_phones(g2p_output: str) -> list[str]:
    """Rend comparables la lecture du kanji et celle du kana épelé.

    open_jtalk marque les voyelles dévoisées en majuscule (ts U) et lit les
    longues correctement depuis le kanji (ちょう → ch o o), alors que le kana
    épelé hors dictionnaire ressort en « o u » : on replie la casse et fusionne
    o+u pour ne signaler que les vraies erreurs de lecture (ex. やまて au lieu
    de やまのて), pas ces variantes phonétiquement identiques.
    """
    tokens = g2p_output.lower().split()
    out: list[str] = []
    for t in tokens:
        if t == "u" and out and out[-1] == "o":
            out.append("o")
        else:
            out.append(t)
    return out


def station_replacements(stations):
    """Couples (kanji → kana) pour les gares que open_jtalk lit de travers."""
    out = []
    for st in stations:
        if normalize_phones(pyopenjtalk.g2p(st["kanji"])) != normalize_phones(
            pyopenjtalk.g2p(st["kana"])
        ):
            out.append((st["kanji"], st["kana"]))
            print(f"  Lecture corrigée : {st['kanji']} → {st['kana']}")
    # Les plus longs d'abord : 西日暮里 avant 日暮里.
    out.sort(key=lambda p: -len(p[0]))
    return out


def trim_and_pad(samples: np.ndarray, sr: int) -> np.ndarray:
    loud = np.flatnonzero(np.abs(samples) > TRIM_THRESHOLD)
    if loud.size:
        samples = samples[loud[0] : loud[-1] + 1]
    head = np.zeros(int(sr * HEAD_PAD_S), dtype=samples.dtype)
    tail = np.zeros(int(sr * TAIL_PAD_S), dtype=samples.dtype)
    return np.concatenate([head, samples, tail])


def encode_mp3(samples: np.ndarray, sr: int) -> bytes:
    peak = float(np.max(np.abs(samples))) or 1.0
    pcm = np.clip(samples * (PEAK_TARGET / peak), -1.0, 1.0)
    pcm16 = (pcm * 32767.0).astype(np.int16)
    enc = lameenc.Encoder()
    enc.set_bit_rate(BITRATE_KBPS)
    enc.set_in_sample_rate(sr)
    enc.set_channels(1)
    enc.set_quality(2)
    return bytes(enc.encode(pcm16.tobytes())) + bytes(enc.flush())


def main() -> None:
    texts_path, model_path, voices_path, out_dir, manifest_path = sys.argv[1:6]
    data = json.loads(Path(texts_path).read_text(encoding="utf-8"))
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    print("Vérification des lectures de gares…")
    replacements = station_replacements(data["stations"])

    kokoro = Kokoro(model_path, voices_path)
    ja_g2p = ja.JAG2P()
    en_g2p = build_en_g2p()

    manifest: dict[str, float] = {}
    total_bytes = 0
    for i, item in enumerate(data["items"], 1):
        text = item["tts"]
        if item["lang"] == "ja-JP":
            for kanji, kana in replacements:
                text = text.replace(kanji, kana)
            phonemes, _ = ja_g2p(text)
        else:
            phonemes, _ = en_g2p(text)
        samples, sr = kokoro.create(
            phonemes, voice=VOICE[item["lang"]], speed=item["speed"], is_phonemes=True
        )
        samples = trim_and_pad(np.asarray(samples, dtype=np.float32), sr)
        mp3 = encode_mp3(samples, sr)
        (out / f"{item['key']}.mp3").write_bytes(mp3)
        manifest[item["key"]] = round(len(samples) / sr, 2)
        total_bytes += len(mp3)
        print(f"[{i}/{len(data['items'])}] {item['key']} {item['lang']} "
              f"{manifest[item['key']]:.1f}s — {item['text'][:48]}")

    entries = "\n".join(
        f"  {json.dumps(k)}: {v}," for k, v in sorted(manifest.items())
    )
    Path(manifest_path).write_text(
        "// GÉNÉRÉ par scripts/announcements-gen.py — ne pas éditer à la main.\n"
        "// Clé = clipKey(lang, texte) ; valeur = durée du MP3 en secondes.\n\n"
        "export const PA_CLIPS: Record<string, number> = {\n"
        f"{entries}\n"
        "};\n",
        encoding="utf-8",
    )
    print(f"{len(manifest)} clips, {total_bytes / 1e6:.1f} Mo → {out}")
    print(f"Manifeste → {manifest_path}")


if __name__ == "__main__":
    main()

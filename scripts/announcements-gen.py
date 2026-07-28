#!/usr/bin/env python3
"""Génère les clips d'annonces avec Kokoro TTS (ONNX).

Entrée : le JSON produit par scripts/announcements-export.ts (textes + vitesses
+ lectures kana des gares). Sortie : un MP3 mono 24 kHz par annonce dans
public/audio/announcements/<clé>.mp3, et le manifeste src/data/pa-manifest.ts
(clé → durée en secondes) consommé par le runtime.

Voix : portée par chaque item (champ « voice »), toutes féminines — la sono de
la rame et celle du quai ne doivent pas parler de la même bouche. Un item sans
voix retombe sur la voix par défaut de sa langue. G2P : misaki/pyopenjtalk en
japonais, misaki anglais (repli espeak) en anglais. Les identifiants de gare
sont vérifiés : si open_jtalk lit un nom de gare autrement que sa transcription
kana (stations.ts), le kana remplace le kanji dans le texte synthétisé.

Cadence japonaise : Kokoro ignore presque la ponctuation quand on lui passe la
phrase en un bloc (「まもなく、渋谷、渋谷。」sort d'une traite). Le japonais est
donc synthétisé segment par segment (découpe aux 、 et 。) et les segments sont
raccordés avec de vraies plages de silence — la respiration des annonces
automatiques JR East. L'anglais, correctement rythmé d'un bloc, reste entier.

Dépendances : pip install kokoro-onnx "misaki[en,ja]" lameenc
Modèle : kokoro-v1.0.onnx + voices-v1.0.bin
  (https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0)

Usage :
  python scripts/announcements-gen.py textes.json kokoro-v1.0.onnx \
      voices-v1.0.bin public/audio/announcements src/data/pa-manifest.ts [--reuse]

--reuse : ne synthétise que les clips ABSENTS et reprend la durée des autres
dans le manifeste existant. Un texte inchangé garde alors exactement le fichier
qu'il avait — une version de kokoro-onnx ou de misaki plus récente ne fait pas
dériver, en douce, les 200 annonces déjà en place. Sans le drapeau, tout est
regravé.

Le dossier de sortie appartient au script : un MP3 dont plus aucun texte ne
réclame la clé est supprimé. Corriger un mot d'annonce change son hachage, donc
son fichier ; sans ce balayage l'ancien resterait là, muet et lourd.
"""

import json
import re
import sys
from pathlib import Path

import lameenc
import numpy as np
import pyopenjtalk
from kokoro_onnx import Kokoro
from misaki import ja

DEFAULT_VOICE = {"ja-JP": "jf_alpha", "en-US": "af_heart"}
BITRATE_KBPS = 48
HEAD_PAD_S = 0.06
TAIL_PAD_S = 0.22
TRIM_THRESHOLD = 0.003  # amplitude sous laquelle un bord est du silence
PEAK_TARGET = 0.89
# Silences insérés entre les segments japonais : une respiration nette à
# chaque virgule (まもなく、渋谷、渋谷。), plus longue entre deux phrases.
JA_COMMA_GAP_S = 0.38
JA_SENTENCE_GAP_S = 0.62


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


def trim_edges(samples: np.ndarray) -> np.ndarray:
    loud = np.flatnonzero(np.abs(samples) > TRIM_THRESHOLD)
    if loud.size:
        samples = samples[loud[0] : loud[-1] + 1]
    return samples


def trim_and_pad(samples: np.ndarray, sr: int) -> np.ndarray:
    samples = trim_edges(samples)
    head = np.zeros(int(sr * HEAD_PAD_S), dtype=samples.dtype)
    tail = np.zeros(int(sr * TAIL_PAD_S), dtype=samples.dtype)
    return np.concatenate([head, samples, tail])


def split_ja_segments(text: str) -> list[str]:
    """Segments d'une annonce japonaise, ponctuation de fin incluse.

    「まもなく、渋谷、渋谷。お出口は…」→ ['まもなく、', '渋谷、', '渋谷。', …]
    (le ・ des énumérations reste à l'intérieur de son segment).
    """
    return re.findall(r"[^、。]+[、。]?", text)


def synth_ja(
    kokoro: Kokoro, ja_g2p, text: str, voice: str, speed: float
) -> tuple[np.ndarray, int]:
    """Synthèse japonaise segment par segment, silences insérés aux 、 et 。.

    Chaque segment est débarrassé de ses bords silencieux avant raccord : les
    pauses ont ainsi une durée exacte, indépendante de ce que Kokoro laisse
    autour de chaque prise.
    """
    parts: list[np.ndarray] = []
    sr = 24000
    segments = split_ja_segments(text)
    for i, seg in enumerate(segments):
        phonemes, _ = ja_g2p(seg)
        if not phonemes:
            continue
        samples, sr = kokoro.create(phonemes, voice=voice, speed=speed, is_phonemes=True)
        parts.append(trim_edges(np.asarray(samples, dtype=np.float32)))
        if i < len(segments) - 1:
            gap = JA_SENTENCE_GAP_S if seg.endswith("。") else JA_COMMA_GAP_S
            parts.append(np.zeros(int(sr * gap), dtype=np.float32))
    if not parts:
        return np.zeros(1, dtype=np.float32), sr
    return np.concatenate(parts), sr


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


def read_manifest(path: Path) -> dict[str, float]:
    """Durées du manifeste TypeScript déjà en place (clé → secondes)."""
    if not path.exists():
        return {}
    text = path.read_text(encoding="utf-8")
    return {k: float(v) for k, v in re.findall(r'"([0-9a-f]{8})":\s*([\d.]+)', text)}


def main() -> None:
    texts_path, model_path, voices_path, out_dir, manifest_path = sys.argv[1:6]
    reuse = "--reuse" in sys.argv[6:]
    data = json.loads(Path(texts_path).read_text(encoding="utf-8"))
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    known = read_manifest(Path(manifest_path)) if reuse else {}
    todo = [
        item
        for item in data["items"]
        if not (item["key"] in known and (out / f"{item['key']}.mp3").exists())
    ]
    if reuse:
        print(f"{len(data['items']) - len(todo)} clips déjà gravés, {len(todo)} à faire.")
    if not todo:
        print("Rien à synthétiser.")

    print("Vérification des lectures de gares…")
    replacements = station_replacements(data["stations"])

    kokoro = Kokoro(model_path, voices_path)
    ja_g2p = ja.JAG2P()
    en_g2p = build_en_g2p()

    # Le manifeste final ne décrit QUE les textes du jeu : une clé disparue du
    # code disparaît d'ici, même si son MP3 traîne encore sur le disque.
    manifest: dict[str, float] = {
        item["key"]: known[item["key"]] for item in data["items"] if item["key"] in known
    }
    total_bytes = 0
    for i, item in enumerate(todo, 1):
        text = item["tts"]
        voice = item.get("voice") or DEFAULT_VOICE[item["lang"]]
        if item["lang"] == "ja-JP":
            for kanji, kana in replacements:
                text = text.replace(kanji, kana)
            samples, sr = synth_ja(kokoro, ja_g2p, text, voice, item["speed"])
        else:
            phonemes, _ = en_g2p(text)
            samples, sr = kokoro.create(
                phonemes, voice=voice, speed=item["speed"], is_phonemes=True
            )
        samples = trim_and_pad(np.asarray(samples, dtype=np.float32), sr)
        mp3 = encode_mp3(samples, sr)
        (out / f"{item['key']}.mp3").write_bytes(mp3)
        manifest[item["key"]] = round(len(samples) / sr, 2)
        total_bytes += len(mp3)
        print(f"[{i}/{len(todo)}] {item['key']} {voice} "
              f"{manifest[item['key']]:.1f}s — {item['text'][:48]}")

    orphans = [p for p in out.glob("*.mp3") if p.stem not in manifest]
    for p in orphans:
        p.unlink()
    if orphans:
        print(f"{len(orphans)} clips orphelins supprimés (textes disparus du code).")

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
    print(f"{len(manifest)} clips ({total_bytes / 1e6:.1f} Mo regravés) → {out}")
    print(f"Manifeste → {manifest_path}")


if __name__ == "__main__":
    main()

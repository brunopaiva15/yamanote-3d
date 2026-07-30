#!/usr/bin/env python3
"""Génère les clips d'annonces avec Kokoro TTS (ONNX).

Entrée : le JSON produit par scripts/announcements-export.ts (textes + vitesses
+ lectures kana des gares). Sortie : un MP3 mono 24 kHz par annonce dans
public/audio/announcements/<clé>.mp3, et le manifeste src/data/pa-manifest.ts
(clé → durée en secondes) consommé par le runtime.

Voix : portée par chaque item (champ « voice ») - la sono de la rame et celle du
quai ne doivent pas parler de la même bouche, et le quai a DEUX automates, une
femme sur le 内回り et un homme sur le 外回り (deux quais qui annoncent le même
script à quelques secondes d'écart doivent rester séparables à l'oreille). Deux
items peuvent donc porter le même texte et deux voix différentes : leurs clés
diffèrent, parce que la clé des annonces de quai inclut le rôle vocal (voir
src/data/clipKey.ts). Un item sans voix retombe sur la voix par défaut de sa
langue. G2P : misaki en japonais
comme en anglais (repli espeak). Les noms de gare sont vérifiés avec ce même
misaki : s'il lit un nom autrement que sa transcription kana (stations.ts), le
katakana remplace le kanji dans le texte synthétisé - c'est ce qui rattrape
御徒町, que l'analyseur lit « gotochō » en tête de phrase.

Cadence japonaise : Kokoro ignore presque la ponctuation quand on lui passe la
phrase en un bloc (「まもなく、渋谷、渋谷。」sort d'une traite). Le japonais est
donc synthétisé segment par segment (découpe aux 、 et 。) et les segments sont
raccordés avec de vraies plages de silence - la respiration des annonces
automatiques JR East. L'anglais, correctement rythmé d'un bloc, reste entier.

Dépendances : pip install kokoro-onnx "misaki[en,ja]" lameenc
Modèle : kokoro-v1.0.onnx + voices-v1.0.bin
  (https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0)

Usage :
  python scripts/announcements-gen.py textes.json kokoro-v1.0.onnx \
      voices-v1.0.bin public/audio/announcements src/data/pa-manifest.ts \
      [--reuse] [--force-role atos-inner]

--reuse : ne synthétise que les clips ABSENTS et reprend la durée des autres
dans le manifeste existant. Un texte inchangé garde alors exactement le fichier
qu'il avait - une version de kokoro-onnx ou de misaki plus récente ne fait pas
dériver, en douce, les 200 annonces déjà en place. Sans le drapeau, tout est
regravé.

--force-role RÔLE : avec --reuse, regrave tout de même les clips de ce rôle
vocal (par exemple ``atos-inner`` après un changement de voix) et conserve les
autres. L'option est répétable.

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
    except Exception as exc:  # noqa: BLE001 - espeak est un confort, pas un requis
        print(f"  (espeak indisponible, repli lexique seul : {exc})")
    return en.G2P(trf=False, british=False, fallback=fallback)


def katakana(kana: str) -> str:
    """Hiragana → katakana. L'analyseur garde un mot en katakana d'un bloc
    (オカチマチ → « okachimachi ») là où il redécoupe l'hiragana en syllabes
    détachées (おかちまち → « o kachi machi »)."""
    return "".join(
        chr(ord(c) + 0x60) if "ぁ" <= c <= "ゖ" else c for c in kana
    )


def normalize_phones(g2p_output: str) -> str:
    """Rend comparables la lecture du kanji et celle du kana épelé.

    Les deux disent la même chose de plusieurs façons : le kana hors
    dictionnaire ressort découpé mot à mot, l'allongement s'écrit tantôt « oː »
    tantôt « oo » ou « oɯ » (ちょう), 「えい」 tantôt « eː » tantôt « ei », et le
    ん s'assimile en « m » devant b (しんばし). On replie tout ça pour ne
    signaler que les vraies erreurs de lecture - ごとちょう au lieu de
    おかちまち - et pas ces variantes phonétiquement identiques.
    """
    out: list[str] = []
    for c in g2p_output:
        if c == " ":
            continue
        out.append(out[-1] if c == "ː" and out else c)
    s = "".join(out).replace("oɯ", "oo").replace("ei", "ee")
    return s.replace("mb", "ɴb").replace("mp", "ɴp")


def station_replacements(g2p, stations):
    """Couples (kanji → katakana) pour les gares que l'analyseur lit de travers.

    La vérification interroge le MÊME g2p que la synthèse : un analyseur qui lit
    bien 御徒町 ne dit rien de ce qu'entendra le joueur si ce n'est pas lui qui
    fabrique les phonèmes envoyés à Kokoro.
    """
    out = []
    for st in stations:
        kana = katakana(st["kana"])
        if normalize_phones(g2p(st["kanji"])[0]) != normalize_phones(g2p(kana)[0]):
            out.append((st["kanji"], kana))
            print(f"  Lecture corrigée : {st['kanji']} → {kana}")
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
    force_roles = {
        sys.argv[i + 1]
        for i, arg in enumerate(sys.argv[6:], start=6)
        if arg == "--force-role" and i + 1 < len(sys.argv)
    }
    data = json.loads(Path(texts_path).read_text(encoding="utf-8"))
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    known = read_manifest(Path(manifest_path)) if reuse else {}
    todo = [
        item
        for item in data["items"]
        if item.get("role") in force_roles
        or not (item["key"] in known and (out / f"{item['key']}.mp3").exists())
    ]
    if reuse:
        print(f"{len(data['items']) - len(todo)} clips déjà gravés, {len(todo)} à faire.")
    if not todo:
        print("Rien à synthétiser.")

    kokoro = Kokoro(model_path, voices_path)
    ja_g2p = ja.JAG2P()
    en_g2p = build_en_g2p()

    print("Vérification des lectures de gares…")
    replacements = station_replacements(ja_g2p, data["stations"])

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
              f"{manifest[item['key']]:.1f}s - {item['text'][:48]}")

    orphans = [p for p in out.glob("*.mp3") if p.stem not in manifest]
    for p in orphans:
        p.unlink()
    if orphans:
        print(f"{len(orphans)} clips orphelins supprimés (textes disparus du code).")

    entries = "\n".join(
        f"  {json.dumps(k)}: {v}," for k, v in sorted(manifest.items())
    )
    Path(manifest_path).write_text(
        "// GÉNÉRÉ par scripts/announcements-gen.py - ne pas éditer à la main.\n"
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

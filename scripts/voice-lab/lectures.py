#!/usr/bin/env python3
"""Précalcule les lectures en kana de tous les fragments japonais.

POURQUOI UNE TABLE PLUTÔT QU'UNE CONVERSION À LA GRAVURE. La conversion venait
d'open_jtalk, via pyopenjtalk, qui se compile depuis les sources sous Windows -
et surtout qui aurait fait dépendre la PRONONCIATION de la machine qui grave.
Deux postes, deux versions du moteur, deux lectures : exactement la dérive que
le cache de fragments cherche à empêcher.

Une table figée règle les trois problèmes d'un coup : elle donne la même
lecture partout, elle se relit - donc les erreurs se voient avant d'être
gravées - et elle SE CORRIGE À LA MAIN. Quand le modèle bute sur un mot, on
retouche une ligne de JSON au lieu de se battre avec un moteur de G2P.

Ce script est le seul endroit qui a besoin d'open_jtalk, et il ne tourne qu'à
la main, quand les textes d'annonce changent. La gravure, elle, n'a plus aucune
dépendance japonaise.

CONTRÔLE. Les trente gares sont déclarées avec leur kana dans le corpus. Le
script vérifie que ses propres lectures s'y accordent - une vérité de référence
indépendante, donc un vrai contrôle. Il refuse d'écrire la table en cas
d'écart, plutôt que de livrer une prononciation fausse à graver.

Usage :
  node --experimental-strip-types scripts/announcements-export.ts audio-src/annonces.json
  python scripts/voice-lab/lectures.py audio-src/annonces.json audio-src/lectures.json
"""

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from graver import VOWEL, same_reading, split_fragments, to_katakana  # noqa: E402


def to_hiragana(s):
    """Katakana → hiragana, en dépliant les 「ー」.

    Le hiragana n'utilise pas la marque d'allongement : トーキョー s'y écrit
    とおきょお, pas とーきょー, qu'aucun texte japonais ne présente ainsi.
    """
    plain = []
    for c in s:
        v = VOWEL.get(plain[-1]) if plain else None
        plain.append(v if c == "ー" and v else c)
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in plain)


def readings(text):
    """(katakana, hiragana) d'un fragment."""
    import pyopenjtalk

    kata = pyopenjtalk.g2p(text, kana=True)
    # Les mots RÉELLEMENT étrangers - ドア, コック, ゲートウェイ - s'écrivent en
    # katakana et doivent y rester même en mode hiragana : どあ et こっく sont
    # une graphie que personne n'écrit, et on ferait buter le modèle sur ce
    # qu'on cherchait à lui rendre facile. On ne convertit que le reste.
    hira = []
    for chunk in re.findall(r"[ァ-ヶー・]+|[^ァ-ヶー・]+", text):
        hira.append(chunk if re.fullmatch(r"[ァ-ヶー・]+", chunk)
                    else to_hiragana(pyopenjtalk.g2p(chunk, kana=True)))
    return kata, "".join(hira)


def main():
    src, dest = sys.argv[1], sys.argv[2]
    corpus = json.loads(Path(src).read_text(encoding="utf-8"))

    # Tous les corps japonais du corpus, tous rôles confondus : la table doit
    # survivre au jour où les cinq autres voix seront choisies.
    bodies = {}
    for it in corpus["items"]:
        if it["lang"] != "ja-JP":
            continue
        for body, _, _ in split_fragments(it["tts"], it["lang"]):
            bodies.setdefault(body, None)
    # Les noms de gare comptent aussi seuls : c'est sur eux que porte le
    # contrôle, et ils ne sont pas tous un fragment à eux seuls.
    for s in corpus["stations"]:
        bodies.setdefault(s["kanji"], None)

    table = {b: list(readings(b)) for b in bodies}

    bad = [(s["kanji"], table[s["kanji"]][0], s["kana"]) for s in corpus["stations"]
           if not same_reading(table[s["kanji"]][0], s["kana"])]
    for k, got, want in bad:
        print(f"  {k} lu «{got}», attendu «{want}»")
    if bad:
        raise SystemExit(f"{len(bad)} gares mal lues - table NON écrite.")

    restants = [b for b in table if any("一" <= c <= "鿿" for c in table[b][0])]
    for b in restants:
        print(f"  ⚠ kanji non converti : {b[:50]} → {table[b][0][:50]}")

    Path(dest).write_text(
        json.dumps({
            "_": "GÉNÉRÉ par scripts/voice-lab/lectures.py. Corrections à la main "
                 "possibles : [katakana, hiragana] par fragment.",
            "lectures": dict(sorted(table.items())),
        }, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{len(table)} lectures → {dest}")
    print(f"contrôle : {len(corpus['stations'])}/{len(corpus['stations'])} gares "
          "lues comme le corpus les déclare")


if __name__ == "__main__":
    main()

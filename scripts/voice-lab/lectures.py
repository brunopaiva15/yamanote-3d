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
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from graver import same_reading, split_fragments  # noqa: E402


def reading(text):
    """(katakana, hiragana) d'un fragment, jeton par jeton.

    open_jtalk expose DEUX lectures et le choix compte : `pron` est phonétique
    et note les voyelles longues par 「ー」 - トーキョー - tandis que `read`
    donne l'orthographe : トウキョウ. Envoyer 「ー」 à un modèle multilingue
    revenait à lui demander de tenir une voyelle sans lui dire laquelle, et il
    la rendait à l'européenne : « Tokio ». On prend donc `read`.

    Une exception, les PARTICULES : は s'écrit ハ et se dit ワ, を s'écrit ヲ et
    se dit オ. `read` les rendrait littéralement. Elles passent par `pron`.
    """
    import pyopenjtalk

    kata, hira = [], []
    for x in pyopenjtalk.run_frontend(text):
        r = x["pron"].replace("’", "") if x["pos"] == "助詞" else x["read"]
        r = r.replace("ヲ", "オ")
        kata.append(r)
        # Un mot RÉELLEMENT étranger - ドア, ゲートウェイ, メトロ - s'écrit en
        # katakana et doit y rester même en mode hiragana : どあ et げえとうぇい
        # sont la graphie de personne, et on ferait buter le modèle sur ce qu'on
        # cherchait à lui rendre facile.
        etranger = bool(x["string"]) and all("ァ" <= c <= "ヶ" or c == "ー"
                                             for c in x["string"])
        hira.append(r if etranger else
                    "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in r))
    return "".join(kata), "".join(hira)


def main():
    src, dest = sys.argv[1], sys.argv[2]
    corpus = json.loads(Path(src).read_text(encoding="utf-8"))

    # Tous les corps japonais du corpus, tous rôles confondus : la table doit
    # survivre au jour où les cinq autres voix seront choisies.
    bodies = {}
    for it in corpus["items"]:
        if it["lang"] != "ja-JP":
            continue
        for body, *_ in split_fragments(it["tts"], it["lang"]):
            bodies.setdefault(body, None)
    # Les noms de gare comptent aussi seuls : c'est sur eux que porte le
    # contrôle, et ils ne sont pas tous un fragment à eux seuls.
    for s in corpus["stations"]:
        bodies.setdefault(s["kanji"], None)

    table = {b: list(reading(b)) for b in bodies}

    # Corrections à la main, dans un fichier SÉPARÉ : les écrire dans la table
    # serait les perdre à la prochaine régénération, qui la réécrit en entier.
    # Elles servent quand le modèle bute sur un mot qu'open_jtalk lit pourtant
    # juste - une graphie se dit parfois mieux qu'une autre, et cela ne se
    # découvre qu'à l'oreille.
    corr_path = Path(dest).with_name("lectures-corrections.json")
    if corr_path.exists():
        corr = json.loads(corr_path.read_text(encoding="utf-8"))
        applied = {k: v for k, v in corr.items() if not k.startswith("_")}
        inconnues = [k for k in applied if k not in table]
        for k in inconnues:
            print(f"  ⚠ correction pour « {k} », absente du corpus - texte changé ?")
        table.update({k: v for k, v in applied.items() if k in table})
        print(f"{len(applied) - len(inconnues)} corrections manuelles appliquées")

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

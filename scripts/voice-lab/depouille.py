#!/usr/bin/env python3
"""Dépouille les notes d'un test d'écoute : moyenne par LEVIER, pas par prise.

Usage :
  python scripts/voice-lab/depouille.py /tmp/notes/notes.html "J01:1 J05:3 …"

Une note ne dit rien toute seule. Ce qui a un sens, c'est de regrouper les
notes par valeur de réglage : toutes les variantes descendues de 4 demi-tons
contre toutes celles qui ne le sont pas, tous les sourires à ×1,30 contre tous
ceux à ×1,00. C'est ce regroupement qui distingue « cette prise a plu » de
« ce réglage plaît », et c'est pour ça que le plan d'essais fait varier chaque
levier sur plusieurs voix.

L'écart entre le meilleur et le pire d'un levier est à lire avec la taille des
groupes : deux prises contre deux prises ne prouvent rien, et le script le dit
plutôt que de laisser croire à une conclusion.
"""

import json
import re
import sys
from collections import defaultdict

import numpy as np


def load_items(page_path):
    src = open(page_path, encoding="utf-8").read()
    start = src.index("const DATA = ") + len("const DATA = ")
    end = src.index(";\n", start)
    return json.loads(src[start:end])["items"]


def levels(item):
    """Valeur de chaque levier pour cette variante."""
    return {
        "voix": item["voice"],
        "vitesse": f"{item['speed']:.2f}",
        "transposition": f"{item['st']:+g} st",
        "sourire": f"×{item['smile']:.2f}",
        "silences": f"{item['gaps'][0]:g}/{item['gaps'][1]:g} s",
    }


def main():
    page, raw = sys.argv[1], sys.argv[2]
    marks = {m.group(1): int(m.group(2)) for m in re.finditer(r"([JER]\d+)\s*:\s*(\d)", raw)}
    items = {i["id"]: i for i in load_items(page)}
    scored = [(i, marks[k]) for k, i in items.items() if k in marks]
    if not scored:
        print("Aucune note reconnue.")
        return

    by_lang = defaultdict(list)
    for it, n in scored:
        by_lang[it["lang"]].append((it, n))

    for lang, rows in by_lang.items():
        notes = np.array([n for _, n in rows])
        print(f"\n=== {lang} — {len(rows)} notes, moyenne {notes.mean():.2f}, "
              f"max {notes.max()} ===")
        best = sorted(rows, key=lambda r: -r[1])[:5]
        for it, n in best:
            print(f"  {n}/5  {it['id']}  {it['setting']}")

        agg = defaultdict(lambda: defaultdict(list))
        for it, n in rows:
            for axis, val in levels(it).items():
                agg[axis][val].append(n)
        for axis, vals in agg.items():
            if len(vals) < 2:
                continue
            ranked = sorted(vals.items(), key=lambda kv: -np.mean(kv[1]))
            spread = np.mean(ranked[0][1]) - np.mean(ranked[-1][1])
            small = min(len(v) for v in vals.values()) < 2
            flag = "  (groupes trop petits pour conclure)" if small or spread < 0.5 else ""
            print(f"\n  {axis} — écart {spread:+.2f}{flag}")
            for val, ns in ranked:
                print(f"    {val:>16}  {np.mean(ns):.2f}  (n={len(ns)})")


if __name__ == "__main__":
    main()

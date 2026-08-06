#!/usr/bin/env python3
"""Fabrique le cahier d'enregistrement : quoi faire dire, et comment.

Six tours d'écoute notée ont établi un résultat négatif solide : aucune des
synthèses atteignables - Kokoro brut ou réglé, greffé sur la prosodie d'une
prise réelle, VOICEVOX calé, VOICEVOX greffé - ne sort de la plage 1-2 sur 5.
Le contrôle de doublons du dernier tour montre en outre que l'écart de notation
(±1) couvre tout l'écart entre les variantes : elles ne sont pas départageables
parce qu'elles sont au même endroit.

Ce qui manque n'est ni un réglage ni un moteur : c'est une VOIX ENREGISTRÉE. Ce
script produit de quoi la commander - la liste exacte des phrases que le jeu
prononce, groupées par rôle, avec la consigne de prosodie tirée de la prise
étiquetée. Le même document sert de brief à une comédienne de doublage ou
d'entrée à un service de synthèse commercial (Azure, Google), dont les voix
japonaises acceptent ces consignes en SSML.

Les cibles chiffrées ne sont pas des préférences : elles sont mesurées sur
l'annonce réelle, et rapport.py sait vérifier que la prise livrée les respecte.

Usage :
  npx esbuild scripts/announcements-export.ts --bundle --format=esm \\
      --platform=node --outfile=/tmp/export.mjs
  node /tmp/export.mjs /tmp/textes.json
  python scripts/voice-lab/cahier.py /tmp/textes.json > docs/CAHIER_VOIX.md
"""

import json
import sys
from collections import OrderedDict, defaultdict

ROLES = OrderedDict([
    ("ja-JP/cabin", "Japonais · sonorisation de la rame"),
    ("en-US/cabin", "Anglais · sonorisation de la rame"),
    ("ja-JP/atos-inner", "Japonais · quai, sens intérieur (内回り)"),
    ("ja-JP/atos-outer", "Japonais · quai, sens extérieur (外回り)"),
    ("ja-JP/agent", "Japonais · agent de quai au micro"),
    ("en-US/atos-en", "Anglais · quai"),
])

SPEC = """\
## Consignes de diction

Toutes les valeurs ci-dessous sont MESURÉES sur un enregistrement de l'annonce
réelle (「次は。渋谷。渋谷。お出口は右側です。」, sonorisation de la rame), pas
choisies. `scripts/voice-lab/rapport.py` vérifie qu'une prise livrée les
respecte.

| Ce qu'il faut | Valeur relevée |
| --- | --- |
| Hauteur médiane | **236 Hz** (plancher 173, sommet 284) |
| Étendue d'intonation | 10,6 demi-tons sur la phrase |
| Durée de 「次は」 | 0,51 s |
| Durée d'un nom de gare | 0,67 s |
| Durée de 「お出口は右側です」 | 1,57 s — **d'un seul trait, sans pause interne** |
| Silence avant le nom de gare | 0,34 s |
| Silence entre les deux répétitions du nom | 0,43 s |
| Silence avant la phrase de sortie | 0,31 s |

Trois points qui comptent plus que les chiffres :

1. **Le nom de gare est dit DEUX FOIS**, séparé par un silence court, et il est
   plus BRILLANT que la phrase qui l'introduit sans être plus aigu : 236 Hz
   contre 256 pour 「次は」, mais un centroïde spectral de 1200 Hz contre 839.
   C'est un sourire, pas une montée.
2. **Aucune pause longue à l'intérieur d'une annonce.** Les silences internes
   font tous entre 0,30 et 0,45 s. Les pauses d'une seconde entendues sur un
   enregistrement long séparent deux annonces, pas deux morceaux d'une même.
3. **Ton d'annonce automatique** : posé, régulier, chaleureux. Pas de
   sur-articulation, pas d'emphase expressive.

## Prise de son

Mono, 48 kHz, 24 bits, sans traitement (ni compression, ni réverbération, ni
égalisation) : le jeu applique lui-même le timbre du diffuseur de plafond et la
réverbération de cabine (`src/systems/audioEngine.ts`). Un fichier par ligne
ci-dessous, silence de tête et de queue coupé.
"""


def main():
    data = json.load(open(sys.argv[1], encoding="utf-8"))
    items = data["items"]
    groups = defaultdict(list)
    for it in items:
        groups[f"{it['lang']}/{it.get('role', 'cabin')}"].append(it["text"])

    total = sum(len(set(v)) for v in groups.values())
    print("# Cahier d'enregistrement des annonces\n")
    print(f"{total} lignes uniques, réparties en {len(groups)} rôles vocaux. "
          "Chaque rôle est une voix distincte.\n")
    print(SPEC)
    print("\n## Les lignes\n")
    for key, title in ROLES.items():
        lines = sorted(set(groups.get(key, [])))
        if not lines:
            continue
        print(f"### {title} — {len(lines)} lignes\n")
        for i, line in enumerate(lines, 1):
            print(f"{i}. {line}")
        print()
    for key in sorted(set(groups) - set(ROLES)):
        lines = sorted(set(groups[key]))
        print(f"### {key} — {len(lines)} lignes\n")
        for i, line in enumerate(lines, 1):
            print(f"{i}. {line}")
        print()


if __name__ == "__main__":
    main()

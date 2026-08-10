#!/usr/bin/env python3
"""Classe les fragments gravés par ONDULATION de leur mélodie.

POURQUOI UNE MESURE DE PLUS. `verdict.py` mesure l'ÉTENDUE d'intonation (p5-p95
en demi-tons) : elle dit de combien la voix monte et descend, pas COMBIEN DE
FOIS. Or les deux ne s'entendent pas pareil. Un fragment qui monte une fois puis
retombe a la mélodie d'une annonce automatique, même si son étendue est large ;
un fragment qui ondule - haut, bas, haut, bas - s'entend comme enjoué, et son
étendue peut être la même. Une plainte du genre « celle-là est trop enjouée »
porte sur le second cas, et aucune mesure du banc ne le voyait.

CE QUE LE SCRIPT COMPTE. Le contour f0 de chaque fragment, ramené à DIX
tranches de durée égale et exprimé en demi-tons autour de la médiane du
fragment. Trois nombres en sortent :

- le TRAJET : somme des écarts d'une tranche à la suivante. C'est la distance
  parcourue par la mélodie. Le découpage étant en dixièmes et non en secondes,
  un fragment long n'en accumule pas mécaniquement plus qu'un court ;
- les RENVERSEMENTS : changements de sens d'au moins 2 demi-tons - en deçà,
  c'est le détecteur de hauteur qui bouge, pas la voix ;
- l'AMPLITUDE : sommet moins plancher du contour, pour situer le fragment par
  rapport à l'étendue que mesure `verdict.py`.

LA RÉFÉRENCE EST LE CORPUS LUI-MÊME, et c'est assumé : l'enregistrement réel
n'est pas dans le dépôt, et de toute façon la question posée est « celui-là
détonne-t-il parmi les autres ? ». Les 171 fragments japonais de bord sont
gravés par la même voix, avec les mêmes réglages, à la même place dans la
phrase : ils forment une population homogène où un écart veut dire quelque
chose. Un fragment au-dessus du neuvième décile du trajet est un fragment que
le modèle a chanté plus que les autres.

CE QUE LE SCRIPT NE DIT PAS. Il ne dit pas qu'un fragment est mauvais : les
annonces longues ondulent légitimement plus que 「次は」, et une more portant
l'accent lexical fait un pic qui n'est pas de l'enjouement. Il désigne des
candidats à l'écoute, dans l'ordre où les écouter.

Usage :
  python scripts/voice-lab/sinuosite.py                    # le classement
  python scripts/voice-lab/sinuosite.py 東京メトロ南北線は     # + le détail d'un fragment
  python scripts/voice-lab/sinuosite.py --lang en-US --role cabin
"""

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from graver import FRAG_DIR  # noqa: E402
from mesures import load, yin_f0  # noqa: E402

TRANCHES = 10
# Un mouvement de moins de 2 demi-tons ne se compte pas comme un changement de
# sens : c'est l'ordre de grandeur de ce que le détecteur de hauteur fait bouger
# tout seul d'une trame à l'autre sur une voyelle tenue.
SEUIL_SENS = 2.0
# En deçà, le contour n'est pas mesurable : il faut de la parole voisée sur
# assez de trames pour que dix tranches aient chacune de quoi être médiane.
MIN_TRAMES = 12


def contour(path, n=TRANCHES):
    """Contour f0 en demi-tons autour de la médiane, sur `n` tranches égales.

    Les trames à plus d'une octave de la médiane sont écartées avant tout
    calcul, comme le fait `mesures.describe` : YIN se trompe d'octave sur
    quelques trames isolées, et une seule d'entre elles doublerait le trajet.
    """
    x, sr = load(path)
    t, f0 = yin_f0(x, sr)
    v = f0 > 0
    if v.sum() < MIN_TRAMES:
        return None
    med = np.median(f0[v])
    ok = v & (f0 > med / 2) & (f0 < med * 2)
    if ok.sum() < MIN_TRAMES:
        return None
    tv, fv = t[ok], f0[ok]
    st = 12 * np.log2(fv / np.median(fv))
    bornes = np.linspace(tv[0], tv[-1], n + 1)
    prof = np.full(n, np.nan)
    for i, (a, b) in enumerate(zip(bornes[:-1], bornes[1:])):
        m = (tv >= a) & (tv <= b)
        if m.any():
            prof[i] = np.median(st[m])
    creux = np.isnan(prof)
    if creux.all():
        return None
    # Une tranche sans trame voisée - une occlusive qui tombe pile là - est
    # comblée par interpolation plutôt que sautée : sautée, elle raccourcirait
    # le contour et ferait paraître le fragment plus sage qu'il n'est.
    if creux.any():
        i = np.arange(n)
        prof[creux] = np.interp(i[creux], i[~creux], prof[~creux])
    return prof


def renversements(prof, seuil=SEUIL_SENS):
    """Changements de sens d'au moins `seuil` demi-tons dans le contour."""
    sens, n, ancre = 0, 0, prof[0]
    for p in prof[1:]:
        d = p - ancre
        if abs(d) < seuil:
            continue
        s = 1 if d > 0 else -1
        if sens and s != sens:
            n += 1
        sens, ancre = s, p
    return n


def mesurer(lang, role):
    index = json.loads((FRAG_DIR / "index.json").read_text(encoding="utf-8"))
    rows = []
    for fid, v in index.items():
        q = FRAG_DIR / f"{fid}.mp3"
        if v.get("lang") != lang or v.get("role") != role or not q.exists():
            continue
        prof = contour(q)
        if prof is None:
            continue
        rows.append({"source": v["source"], "id": fid, "prof": prof,
                     "trajet": float(np.abs(np.diff(prof)).sum()),
                     "renv": renversements(prof),
                     "ampl": float(prof.max() - prof.min())})
    rows.sort(key=lambda r: -r["trajet"])
    return rows


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    lang = sys.argv[sys.argv.index("--lang") + 1] if "--lang" in sys.argv else "ja-JP"
    role = sys.argv[sys.argv.index("--role") + 1] if "--role" in sys.argv else "cabin"
    rows = mesurer(lang, role)
    if not rows:
        raise SystemExit(f"Aucun fragment mesurable pour {lang} / {role}.")

    trajets = np.array([r["trajet"] for r in rows])
    p90 = float(np.percentile(trajets, 90))

    print(f"{len(rows)} fragments [{lang} {role}]   "
          f"trajet médian {np.median(trajets):.1f} st, p90 {p90:.1f} st\n")
    print(f"{'source':26}{'id':14}{'trajet':>9}{'renv.':>7}{'ampl.':>8}")
    for r in rows:
        if r["trajet"] < p90:
            break
        print(f"{r['source'][:24]:26}{r['id']:14}{r['trajet']:9.1f}"
              f"{r['renv']:7d}{r['ampl']:8.1f}")
    print("\nAu-dessus du neuvième décile : à écouter dans cet ordre. Le levier est\n"
          "`stability` dans REGLAGES (graver.py), fragment par fragment - la grille\n"
          "`--variantes <n> --stab` la fait entendre à 0,55 / 0,85 / 1,00.")

    for cible in args:
        r = next((w for w in rows if w["source"] == cible), None)
        if r is None:
            print(f"\n« {cible} » : aucun fragment de ce texte en [{lang} {role}].")
            continue
        rang = rows.index(r) + 1
        print(f"\n« {r['source']} »  {r['id']}\n"
              f"  trajet {r['trajet']:.1f} st ({rang}e/{len(rows)}), "
              f"{r['renv']} renversements, amplitude {r['ampl']:.1f} st\n"
              "  contour, par dixièmes de durée (demi-tons autour de sa médiane) :\n"
              "   " + "".join(f"{p:+6.1f}" for p in r["prof"]))


if __name__ == "__main__":
    main()

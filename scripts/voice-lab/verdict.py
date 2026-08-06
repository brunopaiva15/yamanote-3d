#!/usr/bin/env python3
"""Compare une voix candidate à la voix réelle, et dit QUOI corriger.

POURQUOI CE SCRIPT EXISTE. Personne dans la boucle ne peut à la fois écouter
et mesurer : celui qui écoute n'a pas les chiffres, celui qui mesure n'a pas
d'oreilles. Cinq tours de notes ont montré que « ça ne ressemble pas » ne
suffit pas à corriger quoi que ce soit - il faut savoir SUR QUEL AXE ça
s'écarte. Ce script transforme un extrait exporté en une liste de retouches.

LES DEUX CÔTÉS PASSENT PAR LE MÊME CHEMIN, et c'est tout l'intérêt : même
découpage en segments de parole, même détecteur de hauteur, même définition du
débit. Les valeurs de référence en tête de fichier ont été produites par CE
script sur la voix japonaise isolée (100 segments, 111 s) - elles ne sont donc
comparables qu'à des candidats mesurés pareil, pas à des chiffres lus ailleurs.

CE QUE LE SCRIPT NE DIT PAS. Il ne dit pas si la voix « ressemble ». La
ressemblance perçue tient largement à l'enveloppe spectrale fine, que ces sept
nombres ne résument pas. Un candidat conforme sur tous les axes peut rester
reconnaissablement quelqu'un d'autre - c'est la limite de Voice Design, pas
celle de la mesure.

LE CANDIDAT PASSE PAR LA SONORISATION AVANT D'ÊTRE MESURÉ, et c'est
indispensable. La référence a été captée dans la rame : elle a traversé un
haut-parleur de plafond qui coupe sous 300 Hz. Comparer une prise de studio
sèche à ce signal-là fait apparaître un écart de timbre énorme qui n'est que la
différence des deux chemins - mesuré une fois : 327 Hz de centroïde contre 904,
ramenés à 739 contre 904 une fois la sonorisation appliquée. Les deux tiers de
l'écart n'existaient pas. C'est aussi la comparaison honnête pour le jeu,
puisque `audioEngine` applique ce même traitement à la lecture.

Usage :
  python scripts/voice-lab/verdict.py essai.mp3
  python scripts/voice-lab/verdict.py essai.mp3 --brut   # sans la sonorisation
  python scripts/voice-lab/verdict.py essai.mp3 --ref japonais-jetons.mp3
"""

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from mesures import describe, frame_rms, load, segments, syllable_rate  # noqa: E402
from timbre import cabin_pa  # noqa: E402

# Relevé sur la voix japonaise isolée par jetons.py. Médianes SEGMENT PAR
# SEGMENT : la médiane des p10 de chaque phrase n'est pas le p10 de toutes les
# trames mises bout à bout, et mélanger les deux fausserait la comparaison.
REF = {
    "f0_med": 237.3,
    "f0_p10": 181.3,
    "f0_p90": 305.1,
    "f0_range_st": 10.1,
    "f0_iqr_st": 6.5,
    "centroid": 904.0,
    "tilt": -23.6,
    "rate": 5.05,
}

# Tolérances : en deçà, l'écart ne s'entend pas et ne justifie pas de toucher
# à la description. Elles valent à peu près la dispersion d'un enregistrement
# à l'autre de la MÊME voix, donc corriger en dessous serait poursuivre du
# bruit de mesure.
TOL = {"f0_med": 12.0, "f0_range_st": 2.0, "centroid": 90.0, "tilt": 3.0, "rate": 0.7}

# Retouches de description. Une par axe et par sens - jamais deux à la fois :
# changer deux mots ensemble empêche de savoir lequel a agi.
FIXES = {
    ("f0_med", "-"): "trop grave → remplacer « medium-high pitch » par « high pitch », "
                     "ou baisser la tranche d'âge (30-40)",
    ("f0_med", "+"): "trop aigu → « medium pitch », ou monter la tranche d'âge (40-50)",
    ("f0_range_st", "-"): "trop monocorde → ajouter « with clear melodic movement across "
                          "the phrase », retirer « controlled »",
    ("f0_range_st", "+"): "trop expressif → ajouter « restrained, understated intonation », "
                          "monter stability",
    ("centroid", "-"): "trop sourd, c'est CE QUI TUE le sourire → « very bright, forward, "
                       "crisp », retirer tout « warm » et tout « soft »",
    ("centroid", "+"): "trop clinquant → retirer « bright », garder « clear », ajouter « warm »",
    ("tilt", "-"): "spectre trop pentu, voix feutrée → « crisp articulation, well-projected »",
    ("tilt", "+"): "spectre trop plat, voix dure → « smooth, even timbre »",
    ("rate", "-"): "trop lent → « brisk, efficient pace »",
    ("rate", "+"): "trop rapide → « unhurried, deliberate pace »",
}


def profile(path, pa=False):
    """Découpe en segments de parole et renvoie la médiane de chaque mesure."""
    x, sr = load(path)
    if pa:
        x = cabin_pa(x, sr)
    rms, h, _ = frame_rms(x, sr)
    thr = max(np.percentile(rms, 20) * 4, np.percentile(rms, 60) * 0.25)
    ds = [describe(x[int(a * sr):int(b * sr)], sr) for a, b in segments(rms, h / sr, thr)]
    ds = [d for d in ds if d.get("voiced", 0) > 0.3]
    if not ds:
        raise SystemExit(f"{path} : aucun segment de parole exploitable.")
    out = {k: float(np.median([d[k] for d in ds]))
           for k in ("f0_med", "f0_p10", "f0_p90", "f0_range_st", "f0_iqr_st",
                     "centroid", "tilt")}
    r = syllable_rate(x, sr)
    out["rate"] = float(r[0]) if r else float("nan")
    out["n"] = len(ds)
    return out


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    pa = "--brut" not in sys.argv
    cand = profile(sys.argv[1], pa=pa)
    ref = dict(REF)
    if "--ref" in sys.argv:
        # La référence est déjà passée par la vraie sonorisation : on ne la lui
        # applique pas une seconde fois.
        ref = profile(sys.argv[sys.argv.index("--ref") + 1])

    print(f"{sys.argv[1]}  ({cand['n']} segments de parole)")
    print("sonorisation de cabine appliquée au candidat" if pa else
          "candidat mesuré BRUT — écart de timbre à lire avec prudence")
    print()
    print(f"{'':16}{'candidat':>10}{'réel':>10}{'écart':>10}")
    units = {"f0_med": "Hz", "f0_range_st": "st", "centroid": "Hz",
             "tilt": "dB/déc", "rate": "pics/s"}
    todo = []
    for k in ("f0_med", "f0_range_st", "centroid", "tilt", "rate"):
        d = cand[k] - ref[k]
        flag = "  ✓" if abs(d) <= TOL[k] else "  ← à corriger"
        print(f"{k:16}{cand[k]:10.1f}{ref[k]:10.1f}{d:+10.1f}{flag}   {units[k]}")
        if abs(d) > TOL[k]:
            todo.append((abs(d) / TOL[k], FIXES[(k, "+" if d > 0 else "-")]))

    print()
    if not todo:
        print("Tous les axes mesurés sont dans la tolérance.\n"
              "Si ça ne ressemble toujours pas, ce n'est plus la description qui\n"
              "peut le corriger : c'est l'identité vocale, que Voice Design ne\n"
              "reproduit pas. Passer par une voix clonée à partir de sa propre\n"
              "prise, ou retenir cette voix telle quelle.")
        return
    print("Retouches, la plus grosse dérive d'abord — UNE SEULE à la fois,\n"
          "sinon on ne saura pas laquelle a agi :")
    for i, (_, fix) in enumerate(sorted(todo, reverse=True), 1):
        print(f"  {i}. {fix}")


if __name__ == "__main__":
    main()

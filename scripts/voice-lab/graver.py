#!/usr/bin/env python3
"""Grave les annonces PAR FRAGMENTS, comme le fait le vrai système.

⚠ NON EXÉCUTÉ CONTRE ELEVENLABS dans la session qui l'a écrit : leur hôte est
refusé par la politique de sortie réseau (403 au CONNECT). Tout ce qui ne
dépend pas du réseau - découpage, cache, assemblage, manifeste - a été vérifié
sur des fragments factices. Commencer par `--essai 12`, écouter, puis le lot.

POURQUOI DES FRAGMENTS ET PAS DES PHRASES ENTIÈRES. Le système d'annonces de la
Yamanote est concaténatif : il ne dit pas 「次は渋谷」, il rejoue un 「次は」
gravé une fois pour toutes, puis un 「渋谷」, puis un 「お出口は右側です」. C'est
mesurable - jetons.py a retrouvé le même 「次は」 à trente endroits de
l'enregistrement avec une corrélation de 0,96 à 0,99. Synthétiser fragment par
fragment n'est donc pas une économie qui dégraderait le rendu : c'est la
construction d'origine, et elle explique la diction en blocs qu'on entend.

CE QUE ÇA CHANGE CONCRÈTEMENT :

- 476 annonces = 622 fragments, réemployés 3,3 fois en moyenne, soit 57 % de
  caractères en moins à synthétiser ;
- 「次は」 devient RIGOUREUSEMENT le même son partout - même octets - au lieu de
  476 interprétations indépendantes qui dérivent chacune un peu ;
- ajouter une gare ou retoucher une consigne ne resynthétise que ce qui est
  nouveau : le reste sort du cache, inchangé, donc aucune dérive entre deux
  gravures ;
- les silences ne sont plus demandés au modèle mais POSÉS au montage, aux
  durées relevées sur l'enregistrement réel.

LE CACHE EST VERSIONNÉ, et c'est le point important. Un cache local seulement
ne servirait à rien : le jour où l'on regrave depuis un dépôt frais, tout
serait resynthétisé et tout dériverait. Il coûte de la place (~12 Mo à côté des
21 Mo de clips assemblés) et c'est le prix de la stabilité.

CE QUE LE DÉCOUPAGE NE SAIT PAS FAIRE. Un fragment synthétisé seul perd la
mélodie de la phrase qui le portait. On compense par la POSITION : un fragment
suivi d'autre chose est envoyé avec une virgule, ce qui le laisse en suspens ;
un fragment final est envoyé avec un point, ce qui le fait retomber. Deux
variantes d'un même texte coexistent donc si les deux positions existent. C'est
une approximation - la vraie mélodie dépend de toute la phrase - mais elle
tient parce que les annonces sont justement dites en blocs détachés.

Usage :
  export ELEVENLABS_API_KEY=...
  python scripts/voice-lab/graver.py --list
  node --experimental-strip-types scripts/announcements-export.ts /tmp/textes.json
  python scripts/voice-lab/graver.py /tmp/textes.json \\
      public/audio/announcements src/data/pa-manifest.ts \\
      [--essai N] [--plan] [--hiragana] [--sans en-US]
  python scripts/voice-lab/graver.py --verifier   # débusque les prises muettes
  python scripts/voice-lab/graver.py --variantes 12 [--stab] [--debit]
"""

import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from atelier import encode_mp3, wsola  # noqa: E402
from mesures import frame_rms, load  # noqa: E402

BASE = "https://api.elevenlabs.io/v1"
MODEL = "eleven_multilingual_v2"
OUTPUT_FORMAT = "mp3_44100_128"
SR = 24000  # fréquence de travail au montage, celle du reste du banc

FRAG_DIR = Path("audio-src/fragments")
ESSAI_DIR = Path("audio-src/essai")

# Une voix par rôle. Le quai garde deux automates de sexe différent : sur un
# îlot central les deux quais annoncent le même script à quelques secondes
# d'écart, et la voix est la seule chose qui dise lequel vient de parler.
VOICES = {
    # Retenue après mesure sur trois candidates : étendue d'intonation 10,1
    # demi-tons contre 10,1 relevés, centroïde 875 contre 904. C'est la seule
    # des trois à avoir la brillance de la voix réelle - les deux autres
    # plafonnaient à 711 et 731 Hz, et c'est ce qui leur ôtait le « sourire ».
    ("ja-JP", "cabin"): "mN6r4VCXacoTliYLh0A2",  # Wine Lover
    ("ja-JP", "atos-inner"): "",
    ("ja-JP", "atos-outer"): "",
    ("ja-JP", "agent"): "",
    ("en-US", "cabin"): "Nhs7eitvQWFTQBsf0yiT",
    ("en-US", "atos-en"): "",
}

# `stability` haut = diction régulière, ce que fait un automate. L'agent au
# micro est une PERSONNE : on lui laisse de la variation.
SETTINGS = {
    # `stability` monté de 0,75 à 0,85 : la diction sortait trop enjouée sur
    # les annonces de gare. C'est le seul levier d'expressivité qu'ElevenLabs
    # expose une fois `style` à zéro, et il se paie - il rabote aussi l'étendue
    # d'intonation, mesurée à 10,1 demi-tons sur la voix réelle. Passer un clip
    # à verdict.py après gravure dira si elle est retombée trop bas.
    "cabin": {"stability": 0.85, "similarity_boost": 0.75, "style": 0.0},
    "atos-inner": {"stability": 0.80, "similarity_boost": 0.75, "style": 0.0},
    "atos-outer": {"stability": 0.80, "similarity_boost": 0.75, "style": 0.0},
    "agent": {"stability": 0.45, "similarity_boost": 0.75, "style": 0.15},
    "atos-en": {"stability": 0.80, "similarity_boost": 0.75, "style": 0.0},
}

# Réglages propres à UN fragment, par-dessus ceux de son rôle. Un fragment
# synthétisé seul perd la mélodie de la phrase qui le portait, et tous ne le
# perdent pas de la même façon : les plus courts s'étirent et se chargent
# d'intention. `--variantes` sert à trouver la valeur à l'oreille.
#
# La clé est le TEXTE SOURCE, pas la lecture : elle reste lisible et survit à
# un changement de graphie. Ces réglages entrent dans l'identité du fragment,
# donc en changer un ne regrave que celui-là.
REGLAGES = {}

# Silences relevés sur la prise étiquetée 「次は。渋谷。渋谷。お出口は右側です。」
GAP_SENTENCE = 0.35
GAP_COMMA = 0.25
GAP_REPEAT = 0.43  # entre les deux occurrences du nom de gare : le seul plus long
GAP_JOINT = 0.0  # à l'intérieur d'un mot : les deux morceaux se recollent

# Sous-découpe : ce qui devient un fragment À PART sans silence de séparation.
#
# VIDE, ET C'EST UN RÉSULTAT. 「線」 avait été détaché pour qu'il sonne pareil
# dans les quinze noms de lignes, comme 「次は」. À l'écoute, la couture se
# tenait mais le morceau détaché - 「センワ」, 線 plus la particule - se disait
# comme un mot à lui seul : « Keihin-Tôhoku SENWA ». Un fragment n'a de sens
# que s'il forme un groupe qui se dit seul, et 線 n'en est pas un : il se
# suffit d'autant moins qu'il porte l'accent du nom qui le précède.
#
# Le mécanisme reste parce qu'il est juste ; c'est le candidat qui ne l'était
# pas. La régularité du 線 se joue ailleurs : chaque nom de ligne est un
# fragment gravé UNE FOIS, donc 「ケイヒントウホクセン」 est identique partout où
# cette ligne s'annonce. Ce qui varie encore, c'est d'une ligne à l'autre - et
# ça varie aussi chez une locutrice humaine.
SOUS_DECOUPE = []

# Durée du fondu à un raccord interne. Assez court pour ne pas manger de more,
# assez long pour qu'aucun clic ne passe.
FONDU = 0.015

# Débit d'un fragment, quand le modèle le traîne. Le montage le resserre au
# vocodeur - hauteur inchangée, seule la durée bouge - plutôt que d'espérer un
# réglage d'ElevenLabs : le procédé s'entend à peine sous ±20 %, et surtout il
# se règle ici, à l'oreille, sans regraver.
#
# La clé est le TEXTE SOURCE, pas la lecture : elle reste lisible et survit à
# un changement de graphie. La valeur est un FACTEUR DE DURÉE : 0,85 rend le
# fragment 15 % plus court.
#
# ⚠ `wsola` prend l'inverse - un rate de 0,85 y ALLONGE de 18 %. Les trois
# premières valeurs posées ici l'ont été sans cette inversion, donc à l'envers :
# 「お乗換です」 était rallongé à chaque tour, ce qui explique qu'il ait traîné
# davantage après chaque « resserrage ». Le montage convertit désormais.
# Débit propre à un RÔLE, quand la voix entière est à reprendre. Le japonais
# n'en a pas besoin : sa cadence est calée fragment par fragment sur la prise
# réelle. L'anglais n'a aucune référence mesurée - la recherche de motif répété
# n'a rien donné sur l'enregistrement - donc son débit se règle à l'oreille, et
# c'est le seul endroit où un facteur global soit légitime.
#
# Comme DEBIT, c'est un facteur de DURÉE, appliqué au montage : le changer ne
# regrave rien.
DEBIT_ROLE = {
    ("en-US", "cabin"): 0.94,  # « à peine plus vite » sur la grille de variantes
}

DEBIT = {
    # 8 % plus court : « à peine trop lent » une fois le point posé. Premier
    # réglage de débit qui agisse dans le bon sens, l'inversion étant corrigée.
    "お乗換です": 0.92,
    # Note : 「お乗換です」 était sorti d'ici : à 0,85 puis 0,75 il traînait toujours,
    # donc la durée n'était pas la cause. C'est la GRAPHIE qui a été changée
    # (voir lectures-corrections.json). Si la nouvelle traîne à son tour, c'est
    # ici qu'on la resserrera - mais une cause à la fois.
}

# Ponctuation posée à la fin d'un fragment, selon sa place dans l'annonce.
# C'est le SEUL levier de mélodie qu'on ait : le modèle ne prend pas de
# consigne d'intonation, il déduit tout de la ponctuation.
#
# 「。」 en fin d'annonce faisait tomber le です beaucoup trop bas - une chute
# de phrase déclarative, là où une annonce de gare se termine à plat ou
# remonte légèrement. Sans ponctuation du tout, la chute reste, mais discrète.
# Si elle gêne encore, mettre 「、」 ici : le fragment se dira alors en suspens,
# au prix de devenir identique à sa variante médiane.
PONCTUATION_MID = "、"
PONCTUATION_FIN = ""

# Ponctuation imposée à UN fragment, par-dessus la règle de position. Tous les
# fragments finaux ne veulent pas la même cadence : 「お乗り換えです」 clôt bien
# une annonce sans ponctuation, 「左側です」 y tombait encore. La virgule le
# laisse en suspens, ce qui est la cadence des annonces de gare - elles se
# terminent à plat ou remontent, jamais sur une chute de phrase déclarative.
#
# Ce réglage entre dans l'identité du fragment, mais SEULEMENT pour les
# fragments qui y figurent : les autres gardent l'identité qu'ils avaient,
# donc leur son exact. Le modèle n'étant pas déterministe, regraver un
# fragment qui convient, c'est relancer les dés pour rien.
PONCTUATION = {
    # Retenu sur la grille des neuf : var-03, katakana et point. La virgule le
    # faisait monter ; l'absence de ponctuation ne suffisait pas à le poser. Le
    # point, réservé jusque-là aux fragments finaux, lui donne la cadence
    # descendante et fermée de l'annonce - alors même que 「次は」 est un
    # fragment MÉDIAN. C'est le contre-exemple qui achève de disqualifier la
    # règle de position : la mélodie voulue ne se déduit pas de la place.
    "次は": "。",
    # Retenu sur la grille : var-06, le point. Il est FINAL, donc il partait
    # sans ponctuation depuis qu'on avait retenu la chute du です - et c'est
    # justement ce vide qui le laissait flotter. Troisième fragment, troisième
    # ponctuation : la règle de position n'en prédit décidément aucune.
    "お乗換です": "。",
    "左側です": "、",
    "右側です": "、",  # même construction : si l'une tombe, l'autre tombe
}

# Pause gardée à l'intérieur d'un fragment. Deux valeurs, parce que ce ne sont
# pas les mêmes pauses : 80 ms pour le creux relevé après 「お出口は」, qui n'est
# qu'une respiration de groupe, et les 250 ms de la vraie virgule pour un
# séparateur de liste - 「上野・池袋」 - où la locutrice marque réellement.
#
# Le modèle, lui, rend près d'une SECONDE sur une virgule, quelle qu'elle soit.
# Le montage ramène donc à la valeur mesurée plutôt que de la subir.
PAUSE_INTERNE = 0.08
# En deçà, ce n'est pas une pause mais une occlusive : le creux d'un /k/ ou
# d'un /t/ dure quatre à six centièmes et fait partie du mot.
PAUSE_MIN = 0.09


def resserrer_silences(y, cible=PAUSE_INTERNE):
    """(signal aux pauses internes ramenées à `cible`, total gardé).

    Sans cela, la pause du modèle entrait dans la durée que la cadence essaie
    de tenir : elle compressait la PAROLE pour compenser un SILENCE. Mesuré sur
    「オデグチワ、ミギガワデス」 - 990 ms de silence dans une prise de 2,25 s, une
    correction ramenée au plancher de 0,80, et la parole poussée à 10,9 mores/s
    quand la vraie annonce plafonne à 7,0.
    """
    rms, h, _ = frame_rms(y, SR)
    if len(rms) < 4:
        return y, 0.0
    creux = rms < rms.max() * 0.02
    out, garde, i = [], 0.0, 0
    n = len(rms)
    while i < n:
        if creux[i]:
            j = i
            while j < n and creux[j]:
                j += 1
            duree = (j - i) * h / SR
            a, b = i * h, min(len(y), j * h)
            if duree >= PAUSE_MIN and i > 0 and j < n:
                out.append(np.zeros(int(SR * cible), np.float32))
                garde += cible
            else:
                out.append(y[a:b])
            i = j
        else:
            j = i
            while j < n and not creux[j]:
                j += 1
            out.append(y[i * h:min(len(y), j * h)])
            i = j
    return np.concatenate(out).astype(np.float32) if out else y, garde


# --- Cadence -------------------------------------------------------------
# Un fragment synthétisé seul ne tient pas le débit : les courts s'étirent, les
# longs s'emballent. Mesuré sur les 172 fragments gravés contre la prise réelle
# (scripts/voice-lab/debit.py) : 「次は」 sort à 3,8 mores/s quand la vraie
# annonce en fait 5,9, et 「マナーモードニセッテイノウエ」 à 10,3 quand la vraie
# n'atteint 7,0 que sur sa phrase la plus rapide. La moyenne, elle, ne dit rien
# - elle est à 1,06 du réel : les deux écarts se compensent et le corpus paraît
# juste alors qu'aucun fragment ne l'est.
#
# La correction est donc PAR FRAGMENT, sur la durée que la vraie locutrice
# aurait mise pour le même nombre de mores. Le modèle est ajusté sur la prise
# étiquetée, dont on connaît texte et bornes au centième :
#
#     durée = 0,255 + 0,1196 × mores      (4 segments, de 3 à 11 mores)
#
# La constante n'est pas du remplissage : c'est l'attaque et la chute, qui ne
# dépendent pas de la longueur. Sans elle, un fragment de trois mores serait
# ramené à 0,36 s au lieu de 0,61.
# Débit visé, en mores par seconde. UN SEUL chiffre, et c'est un choix : la
# voix doit parler partout à la vitesse de ses meilleurs fragments.
#
# Le modèle précédent était affine - durée = 0,255 + 0,1196 × mores - ajusté sur
# la prise réelle. Il la reproduisait fidèlement, y compris son défaut vu d'ici :
# sa constante d'attaque écrasait les fragments courts. 「次は」 tombait à 4,9
# mores/s et les noms de gares avec lui, quand 「お出口は右側です」 tenait 7,0 et
# 「この電車は」 6,2. Les noms de lignes, entre les deux, sortaient à 5,9-6,2 -
# c'est là que la lenteur s'entendait le plus.
#
# 7,0 est le débit de 「お出口は◯側です」, celui que l'oreille a retenu comme
# référence. On assume ce qu'il coûte : les fragments courts deviennent PLUS
# RAPIDES que la vraie annonce, qui met 0,51 s pour les trois mores de 「次は」
# là où ce débit en demande 0,43. C'est un écart voulu, pas une dérive.
CADENCE_RATE = 7.0
CADENCE_GLOBAL = 1.0
CADENCE_MIN, CADENCE_MAX = 0.80, 1.20
SUSPECT_MIN, SUSPECT_MAX = 0.75, 1.30

# Petits kana : ils ne comptent pas pour une more, ils modifient la précédente.
# 「っ」 et 「ー」 en revanche en sont une pleine - toute la différence entre
# 「にっぽり」, quatre mores, et 「にぽり」, trois.
PETITS_KANA = set("ゃゅょぁぃぅぇぉャュョァィゥェォ")


def mores(text, source=None):
    """Mores d'un fragment, comptées sur sa LECTURE.

    Le texte envoyé au modèle n'est pas toujours du kana : une correction
    manuelle y remet parfois des kanji, et 「京浜東北線」 ferait alors cinq
    mores au lieu de neuf. La table garde pour ces entrées leur lecture
    d'origine, et c'est elle qu'on compte.
    """
    kana_txt = text
    if source is not None and any("一" <= c <= "鿿" for c in text):
        kana(text if False else source)  # amorce le chargement de la table
        kana_txt = _kana_brut.get(source, text)
    return sum(1 for c in kana_txt if c not in PETITS_KANA and c not in "、。・,. ")


def cadence_brute(text, duree, source=None, silence=0.0):
    """Rapport durée réelle attendue / durée obtenue, sans borne.

    `silence` est le temps de pause INTERNE gardé dans le fragment : il
    s'ajoute à la cible au lieu d'être compressé, le modèle de durée ne
    décrivant que de la parole.
    """
    n = mores(text, source)
    if n < 2 or duree < 0.15:
        return 1.0
    # Le silence interne est MESURÉ sur la prise et passé en argument : un terme
    # forfaitaire par virgule ferait double emploi, et se tromperait de valeur
    # dès que la pause diffère de celle prévue.
    return float((n / CADENCE_RATE + silence) / duree)


def cadence(text, duree, source=None, silence=0.0):
    """Facteur de durée qui ramène un fragment au débit de la vraie annonce."""
    k = cadence_brute(text, duree, source, silence)
    return float(min(CADENCE_MAX, max(CADENCE_MIN, k))) * CADENCE_GLOBAL


# Marge laissée autour de la parole en rognant un fragment. À zéro les attaques
# de consonnes sourdes se font manger ; au-delà de ~30 ms on réintroduit le
# silence que le montage est censé contrôler.
TRIM_PAD = 0.02


# --- Lecture en kana ------------------------------------------------------
# Un modèle multilingue qui reçoit 渋谷 doit DEVINER la langue avant de lire, et
# il se trompe : on entend du chinois. Les kana ne laissent pas ce choix - une
# more, un son. On envoie donc la PRONONCIATION plutôt que l'orthographe.
#
# LES LECTURES SONT PRÉCALCULÉES ET VERSIONNÉES (audio-src/lectures.json), pas
# produites à la gravure. Elles venaient d'open_jtalk, dont le paquet Python se
# compile depuis les sources sous Windows - un chantier, et surtout une
# dépendance qui aurait fait dépendre la prononciation de la machine qui grave.
# Une table figée donne la même lecture partout, se relit, et se corrige à la
# main quand le modèle bute sur un mot. Elle se régénère avec lectures.py,
# depuis une machine où open_jtalk tourne.

LECTURES = Path("audio-src/lectures.json")
_readings = None
_corriges = set()
_kana_brut = {}
_en = {}

VOWEL = {}
for _v, _row in {"ア": "アカサタナハマヤラワガザダバパャヮ", "イ": "イキシチニヒミリギジヂビピ",
                 "ウ": "ウクスツヌフムユルグズヅブプュ", "エ": "エケセテネヘメレゲゼデベペ",
                 "オ": "オコソトノホモヨロヲゴゾドボポョ"}.items():
    for _c in _row:
        VOWEL[_c] = _v


def to_katakana(s):
    return "".join(chr(ord(c) + 0x60) if "ぁ" <= c <= "ゖ" else c for c in s)


def same_reading(a, b):
    """Deux écritures d'une même prononciation.

    「ー」 note la voyelle précédente, et les voyelles longues s'écrivent おう /
    えい là où elles se disent おお / ええ : オオツカ et オーツカ sont le même mot,
    トウキョウ et トーキョー aussi. Comparer les chaînes telles quelles
    signalerait trente fautes qui n'en sont pas.
    """
    def norm(s):
        # La ponctuation n'est pas une lecture : une virgule d'appui posée en
        # tête ne doit pas faire échouer le contrôle des trente gares.
        s = "".join(c for c in to_katakana(s) if c not in "、。・,. ")
        out = []
        for c in s:
            v = VOWEL.get(out[-1]) if out else None
            if v:
                if c == "ー":
                    c = v
                elif c == "ウ" and v == "オ":
                    c = "オ"
                elif c == "イ" and v == "エ":
                    c = "エ"
            out.append(c)
        return "".join(out).replace("ヲ", "オ")
    return norm(a) == norm(b)


# Le katakana est l'usage des moteurs japonais, mais il signale aussi les mots
# étrangers, et rien ne dit qu'un modèle multilingue ne prendra pas tout un
# texte en katakana pour du vocabulaire emprunté - à dire avec l'accent qui va
# avec. La table porte donc les DEUX graphies, et --hiragana bascule.
HIRAGANA = False


def _lecture(text):
    """Les deux graphies d'un fragment, telles que la table les porte."""
    kana(text)  # amorce le chargement
    r = _readings.get(text)
    return (r[0], r[1]) if r else (text, text)


def kana(text):
    """Lecture d'un fragment, lue dans la table."""
    global _readings, _corriges, _kana_brut, _en
    if _readings is None:
        if not LECTURES.exists():
            raise SystemExit(f"{LECTURES} absent - le régénérer avec lectures.py.")
        table = json.loads(LECTURES.read_text(encoding="utf-8"))
        _readings = table["lectures"]
        _corriges = set(table.get("corrections", []))
        _kana_brut = table.get("kana", {})
        _en = table.get("en", {})
    if text == "":
        return ""
    r = _readings.get(text)
    if r is None:
        raise SystemExit(
            f"Aucune lecture pour « {text} ».\n"
            "Un texte d'annonce a changé depuis la dernière table : relancer\n"
            "scripts/voice-lab/lectures.py depuis une machine avec open_jtalk.")
    return r[1] if HIRAGANA else r[0]


def lecture_en(text):
    """Texte anglais, noms japonais réécrits comme une voix anglaise doit les dire.

    Le G2P anglais lit 「Ueno」 et 「Ikebukuro」 comme des mots anglais : accent
    là où l'anglais l'attend, voyelles inaccentuées réduites en schwa, 「u」
    initial en /juː/. On obtient « you-ENN-oh », « ick-uh-BYOO-kuh-roh » - des
    mots anglais qui ressemblent à des noms de gares.

    La voix de JR East, elle, parle anglais mais garde les voyelles japonaises.
    C'est ce que scripts/en-readings.ts décrit depuis toujours, more par more et
    avec l'accent placé à la main ; seuls ses phonèmes visaient Kokoro. On
    réutilise donc son jugement et on n'en change que la graphie.

    La substitution est faite MOT À MOT parce que la table l'est : 「Keihin-
    Tohoku」 n'y figure pas, ses deux moitiés si.
    """
    kana("")  # amorce le chargement de la table
    if not _en:
        return text
    return re.sub(r"[A-Za-z]+(?:-[A-Za-z]+)*",
                  lambda m: "-".join(_en.get(w, w) for w in m.group(0).split("-")),
                  text)


def check_readings(stations):
    """Arrête la gravure si la table ne lit pas une gare comme le corpus.

    Le corpus déclare le kana des trente gares : c'est une vérité de référence
    indépendante de la table, donc un vrai contrôle et pas une tautologie.
    """
    bad = [(s["kanji"], kana(s["kanji"]), s["kana"]) for s in stations
           if not same_reading(kana(s["kanji"]), s["kana"])]
    if bad:
        for k, got, want in bad:
            print(f"  {k} lu «{got}», attendu «{want}»")
        raise SystemExit(f"{len(bad)} gares mal lues - corriger {LECTURES}.")
    print(f"lectures vérifiées : {len(stations)}/{len(stations)} gares")


def split_fragments(text, lang):
    """Découpe un texte d'annonce en (corps, séparateur, position).

    La ponctuation du jeu N'EST PAS décorative : l'en-tête de data/annonces le
    dit, le point y note une pause de sonorisation, pas une fin de phrase
    grammaticale. C'est donc déjà le découpage voulu, il n'y a rien à deviner.
    """
    if lang == "ja-JP":
        parts = [p for p in re.split(r"(?<=[。、])", text) if p.strip()]
    else:
        parts = [p for p in re.split(r"(?<=[.,])\s+", text) if p.strip()]
    out = []
    for i, p in enumerate(parts):
        p = p.strip()
        sep = p[-1] if p and p[-1] in "。、.," else ""
        body = p.rstrip("。、., ")
        if not body:
            continue
        morceaux = [body]
        if lang == "ja-JP":
            for rx in SOUS_DECOUPE:
                m = rx.match(body)
                if m:
                    morceaux = list(m.groups())
                    break
        for j, mo in enumerate(morceaux):
            dernier = j == len(morceaux) - 1
            out.append((mo, sep if dernier else "",
                        "end" if dernier and i == len(parts) - 1 else "mid",
                        None if dernier else GAP_JOINT))
    return out


def reglages(role, source):
    return {**SETTINGS[role], **REGLAGES.get(source, {})}


def frag_id(role, lang, body, pos, source=None):
    """Identifiant stable d'un fragment.

    Le modèle et les réglages entrent dedans : changer `stability` change le
    son, et un cache qui l'ignorerait resservirait l'ancien rendu sans rien
    dire. La voix aussi, évidemment.
    """
    parts = [VOICES[(lang, role)], MODEL,
             json.dumps(reglages(role, source or body), sort_keys=True),
             role, lang, pos, body]
    # Ajouté SEULEMENT s'il existe : sans quoi tous les fragments changeraient
    # d'identité et seraient regravés, alors que le modèle n'est pas
    # déterministe et qu'on perdrait des prises qui conviennent.
    force = PONCTUATION.get(source or body)
    if force is not None:
        parts.append(f"ponct={force}")
    return hashlib.sha1("\x1f".join(parts).encode("utf-8")).hexdigest()[:12]


def spoken(body, sep, pos, lang="ja-JP", source=None):
    """Le texte envoyé au modèle, ponctué selon la position.

    Un fragment isolé serait dit comme une phrase complète, avec sa chute
    finale - 「次は」 sonnerait conclusif. La virgule le laisse en suspens.

    L'anglais garde son point final : la plainte portait sur le です japonais,
    et rien ne dit qu'une annonce anglaise souffre du même excès de chute.
    """
    force = PONCTUATION.get(source)
    if force is not None:
        return body + force
    if lang != "ja-JP":
        return body + ("." if pos == "end" else ",")
    return body + (PONCTUATION_FIN if pos == "end" else PONCTUATION_MID)


def gap_after(cur, nxt, sep):
    """Silence à poser APRÈS un fragment, en secondes."""
    if nxt is not None and nxt == cur:
        return GAP_REPEAT  # le nom de gare répété
    return GAP_COMMA if sep in "、," else GAP_SENTENCE


def call(path, key, body=None, raw=False, query=""):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE}{path}{query}", data=data, headers={
        "xi-api-key": key,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg" if raw else "application/json",
    })
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read() if raw else json.loads(r.read())
        except urllib.error.HTTPError as exc:
            if exc.code in (429, 500, 502, 503) and attempt < 3:
                time.sleep(2 ** attempt)
                continue
            raise SystemExit(
                f"ElevenLabs a répondu {exc.code} : "
                f"{exc.read()[:300].decode('utf-8', 'replace')}\n"
                "401 → clé invalide ; 422 → identifiant de voix inconnu ; "
                "429 persistant → quota de caractères épuisé.")
    raise SystemExit("ElevenLabs injoignable après plusieurs tentatives.")


def trimmed(path):
    """Fragment décodé, silences de tête et de queue ôtés.

    Sans ce rognage on empilerait le silence que le modèle laisse autour de
    chaque prise ET celui qu'on pose au montage : les pauses mesurées ne
    seraient plus celles qu'on entend.
    """
    x, sr = load(path, sr=SR)
    rms, h, _ = frame_rms(x, sr)
    thr = max(rms.max() * 0.02, np.percentile(rms, 10) * 3)
    on = np.flatnonzero(rms > thr)
    if on.size == 0:
        return x
    pad = int(TRIM_PAD * sr)
    a = max(0, int(on[0] * h) - pad)
    b = min(len(x), int(on[-1] * h) + pad)
    return x[a:b]


def fondu(a, b):
    """Recolle deux morceaux d'un même mot par un fondu croisé.

    Bout à bout, la couture s'entend : chaque morceau a été rogné sur un seuil
    d'énergie, donc leurs bords ne sont ni au même niveau ni en phase. Le fondu
    est court - il doit lisser la jointure, pas manger une more.
    """
    n = min(int(SR * FONDU), len(a), len(b))
    if n < 8:
        return np.concatenate([a, b])
    r = np.linspace(0.0, 1.0, n, dtype=np.float32)
    milieu = a[len(a) - n:] * (1 - r) + b[:n] * r
    return np.concatenate([a[:len(a) - n], milieu, b[n:]])


# Un fragment est jugé muet en deçà de ceci. Les seuils sont larges à dessein :
# le plus court fragment du corpus - 「次は」, deux mores - dure déjà trois
# dixièmes de seconde, et une prise correcte crête bien au-dessus de 0,05.
MIN_PAROLE = 0.10
MIN_CRETE = 0.05


def muet(path):
    """(vrai si le fragment ne contient pas de parole, durée utile).

    Le modèle rend parfois une prise vide. Assemblée, elle ne casse rien : le
    montage se déroule, le manifeste se remplit, la durée est plausible - et
    l'annonce saute un mot sans que rien ne le signale. C'est le seul défaut de
    la chaîne qui ne s'attrape qu'à l'écoute, donc le seul qui mérite un
    contrôle automatique.
    """
    try:
        y = trimmed(path)
    except Exception:
        return True, 0.0
    # `trimmed` rend le signal entier quand il n'y trouve aucune parole : la
    # durée annoncée serait alors celle du silence, ce qui se lit à l'envers
    # dans le rapport. Une prise sans crête n'a pas de parole, donc 0 s.
    if float(np.abs(y).max()) < MIN_CRETE:
        return True, 0.0
    d = len(y) / SR
    return d < MIN_PAROLE, d


# Une attaque intacte part du silence. Au-dessus de ce niveau dès la première
# trame, le début du mot manque - mesuré sur le corpus : médiane à -67 dB, et
# les seuls fragments au-dessus de -12 dB commençaient tous par ウ, la voyelle
# la plus faible du japonais, que le modèle escamotait.
ATTAQUE_DB = -12.0


def attaque_coupee(path):
    """(vrai si le fragment commence déjà en pleine voix, niveau de la 1re trame)."""
    x, sr = load(path, sr=SR)
    rms, _, _ = frame_rms(x, sr)
    if len(rms) < 2 or rms.max() <= 0:
        return False, -99.0
    d = float(20 * np.log10(rms[0] / rms.max() + 1e-9))
    return d > ATTAQUE_DB, d


def read_manifest(path):
    if not Path(path).exists():
        return {}
    return {k: float(v) for k, v in
            re.findall(r'"([0-9a-f]{8})":\s*([\d.]+)',
                       Path(path).read_text(encoding="utf-8"))}


def build_plan(items):
    """(plan par annonce, inventaire des fragments, rôles laissés de côté).

    Les rôles dont la voix n'est pas encore choisie sont ÉCARTÉS plutôt que de
    faire échouer la gravure : les six voix ne se retiennent pas le même jour,
    et rien ne justifie d'attendre la dernière pour graver la première. Les
    annonces écartées gardent leurs clips et leurs entrées de manifeste.
    """
    plan, inventory, deferred = [], {}, {}
    for it in items:
        role = it.get("role", "cabin")
        if not VOICES.get((it["lang"], role)):
            deferred[(it["lang"], role)] = deferred.get((it["lang"], role), 0) + 1
            continue
        # Japonais : `tts` porte les réécritures en katakana (山手線 → ヤマノテ線).
        # Anglais : `tts` porte des phonèmes propres à Kokoro, incompris ici.
        src = it["tts"] if it["lang"] == "ja-JP" else it["text"]
        frs = split_fragments(src, it["lang"])
        sources = [b for b, _, _, _ in frs]  # avant conversion : clé de DEBIT
        # La conversion en kana a lieu ICI, avant que le fragment ne prenne son
        # identité : le cache doit être indexé sur ce qui est RÉELLEMENT envoyé
        # au modèle, sinon corriger une lecture resservirait l'ancien son.
        frs = [((kana(b) if it["lang"] == "ja-JP" else lecture_en(b)), sep, pos, forced)
               for b, sep, pos, forced in frs]
        bodies = [b for b, _, _, _ in frs]
        seq = []
        for i, (body, sep, pos, forced) in enumerate(frs):
            fid = frag_id(role, it["lang"], body, pos, sources[i])
            inventory[fid] = {"role": role, "lang": it["lang"], "pos": pos, "text": body,
                              "source": sources[i], "debit": DEBIT.get(sources[i], 1.0)}
            nxt = bodies[i + 1] if i + 1 < len(bodies) else None
            gap = 0.0 if i == len(frs) - 1 else gap_after(body, nxt, sep)
            seq.append((fid, forced if forced is not None else gap))
        plan.append({"key": it["key"], "text": it["text"], "seq": seq,
                     "lang": it["lang"], "role": role})
    return plan, inventory, deferred


# Grille d'essai d'un fragment. Les deux dimensions sont celles qui ont
# RÉELLEMENT changé quelque chose jusqu'ici : la graphie - passer 「お乗換です」
# en écriture mixte l'a débloqué là où trois resserrages successifs avaient
# échoué - et la ponctuation, seul levier de mélodie du modèle. `stability`
# vient en troisième dimension, à la demande, parce qu'elle agit sur toute la
# prise et non sur son contour.
GRAPHIES = ("katakana", "hiragana", "source")
PONCTUATIONS = (("sans", ""), ("virgule", ","), ("point", "."))
PONCTUATIONS_JA = (("sans", ""), ("virgule", "、"), ("point", "。"))
GRILLE_STAB = (0.55, 0.85, 1.00)
# Resserrages proposés. Au-delà de -30 % le vocodeur commence à s'entendre sur
# des voyelles tenues, et c'est pour ça que la grille s'arrête à 0,70.
GRILLE_DEBIT = (1.00, 0.92, 0.85, 0.78, 0.70)


def catalogue(texts_path):
    """Tous les fragments gravables, avec leur langue, leur rôle et leur place.

    Bâti sur le CORPUS et non sur la table des lectures : celle-ci est
    japonaise, et l'anglais n'y figure pas. Le corpus, lui, sait aussi d'où
    vient chaque fragment - donc `--fin` n'a plus à être deviné.
    """
    corpus = json.loads(Path(texts_path).read_text(encoding="utf-8"))
    _, inv, _ = build_plan(corpus["items"])
    par_source = {}
    for v in inv.values():
        par_source.setdefault((v["lang"], v["source"]), v)
    return [par_source[k] for k in sorted(par_source, key=lambda k: (k[0], k[1]))]


def variantes_debit(key, v):
    """Une seule prise, déclinée à plusieurs vitesses.

    Un fragment trop lent ne se compare pas à d'autres graphies : il se compare
    à LUI-MÊME plus court. Une seule gravure, donc, puis des resserrages au
    vocodeur - la hauteur ne bouge pas, seule la durée. Ça coûte un appel au
    lieu de cinq, et surtout ça isole le débit : d'une piste à l'autre, rien
    d'autre n'a changé.
    """
    ESSAI_DIR.mkdir(parents=True, exist_ok=True)
    envoye = spoken(v["text"], "", v["pos"], v["lang"], v["source"])
    mp3 = call(f"/text-to-speech/{VOICES[(v['lang'], v['role'])]}", key, raw=True,
               query=f"?output_format={OUTPUT_FORMAT}",
               body={"text": envoye, "model_id": MODEL,
                     "voice_settings": reglages(v["role"], v["source"])})
    brut = ESSAI_DIR / "debit-prise.mp3"
    brut.write_bytes(mp3)
    if muet(brut)[0]:
        raise SystemExit("Prise muette - relancer.")
    base = trimmed(brut)
    print(f"« {v['source']} » → envoyé « {envoye} »   [{v['role']} {v['pos']}]\n")
    for deb in GRILLE_DEBIT:
        y = base if deb == 1.0 else wsola(base, 1.0 / deb, SR).astype(np.float32)
        out = ESSAI_DIR / f"debit-{int(deb * 100):03d}.mp3"
        out.write_bytes(encode_mp3(y.astype(np.float32), SR, kbps=96))
        print(f"  {out.name}  {len(y) / SR:.2f}s"
              + ("   (tel quel)" if deb == 1.0 else f"   -{100 - deb * 100:.0f} %"))
    brut.unlink()
    print(f"\n→ {ESSAI_DIR}\n"
          "Toutes viennent de LA MÊME prise : seule la vitesse change.\n"
          f'Reporter la retenue dans graver.py :  DEBIT["{v["source"]}"] = 0.xx\n'
          "Le resserrage s'applique au montage, donc rien n'est regravé.")


def variantes(key, v, stab=False):
    """Grave un même fragment sous plusieurs graphies et ponctuations.

    Les axes ne sont pas les mêmes selon la langue, et c'est le corpus qui le
    dit : le japonais a une GRAPHIE à choisir - kana ou écriture d'origine, ce
    qui a débloqué 「お乗り換えです」 - là où l'anglais n'en a qu'une. Pour lui, le
    second axe utile est la TENUE de voix, donc la grille bascule d'elle-même.
    """
    ESSAI_DIR.mkdir(parents=True, exist_ok=True)
    ja = v["lang"] == "ja-JP"
    kata, hira = (_lecture(v["source"]) if ja else (v["text"], v["text"]))
    formes = ({"katakana": kata, "hiragana": hira, "source": v["source"]} if ja
              else {"prononce": v["text"], "brut": v["source"]}
              if v["text"] != v["source"] else {"telquel": v["text"]})
    poncts = PONCTUATIONS_JA if ja else PONCTUATIONS
    stabs = GRILLE_STAB if (stab or not ja) else (SETTINGS[v["role"]]["stability"],)

    print(f"« {v['source']} »   [{v['lang']} {v['role']} {v['pos']}]")
    for nom, f in formes.items():
        print(f"  {nom:9} {f}")
    print()
    n = 0
    for gnom, forme in formes.items():
        for pnom, ponct in poncts:
            for st in stabs:
                n += 1
                reg = {**reglages(v["role"], v["source"]), "stability": st}
                mp3 = call(f"/text-to-speech/{VOICES[(v['lang'], v['role'])]}", key,
                           raw=True, query=f"?output_format={OUTPUT_FORMAT}",
                           body={"text": forme + ponct, "model_id": MODEL,
                                 "voice_settings": reg})
                suff = f"-stab{int(st * 100):03d}" if len(stabs) > 1 else ""
                out = ESSAI_DIR / f"var-{n:02d}-{gnom.replace(' ', '')}-{pnom}{suff}.mp3"
                out.write_bytes(mp3)
                print(f"  {out.name:40} « {forme + ponct} »")

    print(f"\n{n} prises → {ESSAI_DIR}\n"
          "Retenir la meilleure et me donner son nom, ou reporter soi-même dans\n"
          "graver.py :\n"
          f'  PONCTUATION["{v["source"]}"] = "…"        pour le contour\n'
          f'  REGLAGES["{v["source"]}"] = {{"stability": …}}   pour la tenue\n'
          "et, pour une autre graphie, une ligne dans lectures-corrections.json.\n"
          "Seul ce fragment sera regravé.")


def main():
    key = os.environ.get("ELEVENLABS_API_KEY")
    if "--list" in sys.argv:
        if not key:
            raise SystemExit("Renseigner ELEVENLABS_API_KEY.")
        for v in call("/voices", key)["voices"]:
            lab = v.get("labels") or {}
            print(f"{v['voice_id']}  {v['name']:24} "
                  + " ".join(f"{k}={x}" for k, x in lab.items()
                             if k in ("gender", "age", "accent", "use_case")))
        print("\nReporter les identifiants voulus dans VOICES, en tête du script.")
        return

    global FRAG_DIR, HIRAGANA
    HIRAGANA = "--hiragana" in sys.argv
    if "--verifier" in sys.argv:
        # Les prises muettes déjà en cache ne se voient pas autrement : elles
        # ont une taille de fichier normale et s'assemblent sans broncher.
        argv0 = sys.argv[sys.argv.index("--verifier") + 1:]
        if argv0 and not argv0[0].startswith("--"):
            FRAG_DIR = Path(argv0[0])
        mauvais = []
        for q in sorted(FRAG_DIR.glob("*.mp3")):
            vide, duree = muet(q)
            if vide:
                mauvais.append((q, duree))
        print(f"{len(list(FRAG_DIR.glob('*.mp3')))} fragments vérifiés, "
              f"{len(mauvais)} muets")
        for q, duree in mauvais:
            print(f"  {q.name}  {duree:.2f}s de parole - supprimé")
            q.unlink()
        if mauvais:
            print("\nRelancer la gravure : les fragments supprimés seront regravés,\n"
                  "les autres sortiront du cache inchangés.")
        return

    if "--variantes" in sys.argv:
        # Le fragment se désigne par son TEXTE ou par son NUMÉRO. Le numéro
        # existe parce que taper du japonais dans une invite Windows n'est pas
        # acquis : selon la page de codes, l'argument arrive tronqué ou
        # remplacé par des points d'interrogation, et l'erreur ressemble alors
        # à un fragment inconnu plutôt qu'à un problème de terminal.
        reste = [a for a in sys.argv[sys.argv.index("--variantes") + 1:]
                 if not a.startswith("--")]
        corpus = next((a for a in reste if a.endswith(".json")), "audio-src/annonces.json")
        choix = next((a for a in reste if not a.endswith(".json")), None)
        cat = catalogue(corpus)
        if choix is None:
            print("Indiquer le fragment, par son texte ou son numéro :\n")
            for i, v in enumerate(cat, 1):
                print(f"  {i:3}  [{v['lang']} {v['role']:11} {v['pos']:4}] {v['source']}")
            print("\n  npm run voix:variantes -- 12")
            return
        if choix.isdigit():
            i = int(choix)
            if not 1 <= i <= len(cat):
                raise SystemExit(f"Numéro hors liste : 1 à {len(cat)}.")
            v = cat[i - 1]
        else:
            v = next((w for w in cat if w["source"] == choix), None)
            if v is None:
                raise SystemExit(
                    f"« {choix} » n'est pas un fragment connu.\n"
                    "Lancer `npm run voix:variantes` sans rien pour voir la liste "
                    "numérotée, puis rappeler avec le numéro.")
        if not key:
            raise SystemExit("Renseigner ELEVENLABS_API_KEY.")
        if not VOICES.get((v["lang"], v["role"])):
            raise SystemExit(f"Aucune voix pour {v['lang']} {v['role']}.")
        if "--debit" in sys.argv:
            variantes_debit(key, v)
        else:
            variantes(key, v, stab="--stab" in sys.argv)
        return
    texts_path, out_dir, manifest_path = sys.argv[1:4]
    argv = sys.argv[4:]
    # Le nombre est FACULTATIF après --essai : ça permet à npm de le passer en
    # bout de ligne (`npm run voix:essai -- 14`) sans que le script ait à le
    # figer, tout en gardant une valeur par défaut utile.
    essai = None
    if "--essai" in argv:
        suite = argv[argv.index("--essai") + 1:]
        essai = (int(suite[0]) if suite and suite[0].isdigit() else 12)
    dry = "--plan" in argv
    if "--frags" in argv:
        FRAG_DIR = Path(argv[argv.index("--frags") + 1])

    # `--sans ja-JP` ou `--sans en-US:cabin` met un rôle de côté le temps d'une
    # gravure, sans toucher au fichier. C'est le mécanisme des rôles en attente
    # de voix qui sert : leurs annonces gardent clips et entrées de manifeste,
    # donc on peut remonter une langue sans dépenser le quota de l'autre.
    for i, a in enumerate(argv):
        if a == "--sans" and i + 1 < len(argv):
            motif = argv[i + 1]
            for cle in list(VOICES):
                if motif in (cle[0], f"{cle[0]}:{cle[1]}"):
                    VOICES[cle] = ""

    corpus = json.loads(Path(texts_path).read_text(encoding="utf-8"))
    items = corpus["items"]
    check_readings(corpus["stations"])
    plan, inventory, deferred = build_plan(items)
    if not plan:
        raise SystemExit("Aucun rôle n'a de voix - lancer d'abord --list.")

    if essai:
        # Un essai se juge sur des annonces ENTIÈRES : c'est le montage - les
        # silences, l'enchaînement des blocs - qu'on veut entendre, et un
        # fragment isolé n'en dit rien. On les prend étalées sur le corpus
        # plutôt qu'en tête, sinon les douze premières sont douze 「次は」 de
        # gares voisines et l'essai ne montre qu'une seule tournure.
        #
        # Étalées PAR RÔLE, et c'est nécessaire : le corpus alterne japonais et
        # anglais gare par gare, si bien qu'un pas pair sur la liste entière ne
        # ramenait qu'une seule langue - vérifié, --essai 14 ne sortait que du
        # japonais. On répartit donc la quantité demandée entre les rôles ayant
        # une voix, au prorata.
        groupes = {}
        for q in plan:
            groupes.setdefault((q["lang"], q["role"]), []).append(q)
        choix, reste = [], essai
        for i, (cle, lot) in enumerate(sorted(groupes.items())):
            part = round(essai * len(lot) / len(plan)) if i < len(groupes) - 1 else reste
            part = max(1, min(part, reste, len(lot)))
            pas = max(1, len(lot) // part)
            choix.extend(lot[::pas][:part])
            reste -= part
        plan = choix
        inventory = {f: v for f, v in inventory.items()
                     if any(f == g for p in plan for g, _ in p["seq"])}

    FRAG_DIR.mkdir(parents=True, exist_ok=True)
    todo = [f for f in inventory if not (FRAG_DIR / f"{f}.mp3").exists()]
    chars = sum(len(inventory[f]["text"]) + 1 for f in todo)
    print(f"{len(plan)}/{len(items)} annonces · {len(inventory)} fragments "
          f"({len(inventory) - len(todo)} en cache, {len(todo)} à graver, "
          f"{chars} caractères)")
    # Un kanji restant serait un mot qu'open_jtalk n'a pas su lire, et c'est
    # exactement là que le modèle repart en chinois. On le signale plutôt que
    # de le laisser passer.
    # Une correction manuelle qui réintroduit des kanji est DÉLIBÉRÉE - c'est
    # même sa raison d'être quand une graphie mixte se dit mieux que les kana.
    restants = [v for v in inventory.values() if v["lang"] == "ja-JP"
                and v["source"] not in _corriges
                and any("一" <= c <= "鿿" for c in v["text"])]
    for v in restants:
        print(f"  ⚠ kanji non converti : {v['text'][:50]}")

    for (lang, role), n in sorted(deferred.items()):
        print(f"  en attente d'une voix : {lang} {role:12} {n:4} annonces "
              f"- clips actuels conservés")
    if dry:
        for f in todo[:40]:
            v = inventory[f]
            print(f"  {f} [{v['role']:11} {v['pos']}] {v['text'][:50]}")
        if len(todo) > 40:
            print(f"  … et {len(todo) - 40} autres")
        return

    for n, fid in enumerate(todo, 1):
        v = inventory[fid]
        if not key:
            raise SystemExit("Renseigner ELEVENLABS_API_KEY.")
        body = spoken(v["text"], "", v["pos"], v["lang"], v["source"])
        mp3 = call(f"/text-to-speech/{VOICES[(v['lang'], v['role'])]}", key, raw=True,
                   query=f"?output_format={OUTPUT_FORMAT}",
                   body={"text": body, "model_id": MODEL,
                         "voice_settings": reglages(v["role"], v["source"])})
        # Les octets de l'API sont stockés TELS QUELS : le fragment n'est
        # réencodé qu'une fois, au montage de l'annonce.
        chemin = FRAG_DIR / f"{fid}.mp3"
        chemin.write_bytes(mp3)
        vide, duree = muet(chemin)
        # Surtout PAS `essai` : ce nom porte déjà le drapeau --essai, et le
        # compteur l'écrasait. La gravure complète repartait alors dans la
        # branche d'essai - clips dans audio-src/essai, ni public/ ni manifeste
        # touchés - en annonçant tranquillement « annonces d'essai ».
        tentative = 1
        while vide and tentative <= 3:
            print(f"      prise muette ({duree:.2f}s), on regrave ({tentative}/3)")
            mp3 = call(f"/text-to-speech/{VOICES[(v['lang'], v['role'])]}", key, raw=True,
                       query=f"?output_format={OUTPUT_FORMAT}",
                       body={"text": body, "model_id": MODEL,
                             "voice_settings": reglages(v["role"], v["source"])})
            chemin.write_bytes(mp3)
            vide, duree = muet(chemin)
            tentative += 1
        if vide:
            chemin.unlink(missing_ok=True)
            raise SystemExit(
                f"« {v['source']} » revient muet après quatre tentatives.\n"
                "Le texte envoyé est peut-être en cause : essayer une autre "
                "graphie dans lectures-corrections.json.")
        print(f"[{n}/{len(todo)}] {fid} [{v['role']} {v['pos']}] "
              f"{v['text'][:40]} {duree:.2f}s")

    if not essai:
        # L'index décrit le cache COMPLET : un essai n'en voit qu'une poignée
        # et l'écraserait avec une vue partielle.
        (FRAG_DIR / "index.json").write_text(
            json.dumps(inventory, ensure_ascii=False, indent=1, sort_keys=True) + "\n",
            encoding="utf-8")

    # Un essai s'assemble à l'écart : ni dans public/, ni dans le manifeste.
    # Rien de ce qu'il produit n'atteint le jeu, donc rien à défaire s'il ne
    # convainc pas - et les fragments gravés, eux, restent acquis au cache.
    out = ESSAI_DIR if essai else Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    # Une gravure partielle - le cas normal tant que les six voix ne sont pas
    # toutes retenues - PART DU MANIFESTE EXISTANT. Le reconstruire de zéro
    # effacerait les entrées des rôles pas encore regravés, et leurs annonces
    # deviendraient muettes alors que leurs clips sont toujours là.
    # Une gravure partielle repart du manifeste existant pour ne pas rendre
    # muets les rôles en attente - mais en ÉLAGUANT ce que plus aucun texte ne
    # réclame, sinon un texte retouché y laisse une entrée sans fichier.
    vivants_keys = {it["key"] for it in items}
    manifest = ({k: v for k, v in read_manifest(manifest_path).items()
                 if k in vivants_keys} if deferred and not essai else {})
    for p in plan:
        # À ce stade tout fragment manquant vient d'être gravé ou était en
        # cache. S'il en manque encore, c'est une gravure interrompue : mieux
        # vaut s'arrêter que publier un manifeste amputé, qui rendrait muettes
        # des annonces sans que rien ne le signale.
        absent = [f for f, _ in p["seq"] if not (FRAG_DIR / f"{f}.mp3").exists()]
        if absent:
            raise SystemExit(f"Fragment {absent[0]} manquant pour « {p['text'][:40]} » "
                             "- relancer la gravure.")
        y = np.zeros(0, np.float32)
        for k, (fid, gap) in enumerate(p["seq"]):
            bloc = trimmed(FRAG_DIR / f"{fid}.mp3")
            # Les pauses internes d'abord, la cadence ensuite : l'ordre compte,
            # une pause laissée entière fausserait le facteur de débit.
            garde = 0.0
            v_lang_ja = inventory[fid]["lang"] == "ja-JP"
            if v_lang_ja:
                src = inventory[fid]["source"]
                cible = GAP_COMMA if ("、" in src or "・" in src) else PAUSE_INTERNE
                bloc, garde = resserrer_silences(bloc, cible)
            # La cadence mesurée pose le débit ; DEBIT reste un ajustement
            # RELATIF par-dessus, pour ce que l'oreille corrige encore.
            v = inventory[fid]
            debit = (v["debit"]
                     * DEBIT_ROLE.get((v["lang"], v["role"]), 1.0)
                     * (cadence(v["text"], len(bloc) / SR, v["source"], garde)
                        if v_lang_ja else 1.0))
            if abs(debit - 1.0) > 0.01:
                # 1/debit : wsola raisonne en vitesse de lecture, DEBIT en durée.
                bloc = wsola(bloc, 1.0 / debit, SR).astype(np.float32)
            if k and p["seq"][k - 1][1] == GAP_JOINT:
                y = fondu(y, bloc)  # raccord interne : on recolle le mot
            else:
                y = np.concatenate([y, bloc])
            # Chaque fragment rogné garde TRIM_PAD de quasi-silence de chaque
            # côté : sans cette soustraction, le silence entendu vaudrait
            # gap + 2·TRIM_PAD et plus les durées relevées sur la prise réelle.
            sil = gap - 2 * TRIM_PAD
            if sil > 0:
                y = np.concatenate([y, np.zeros(int(SR * sil), np.float32)])
        y = y.astype(np.float32)
        (out / f"{p['key']}.mp3").write_bytes(encode_mp3(y, SR, kbps=64))
        manifest[p["key"]] = round(len(y) / SR, 2)

    if essai:
        for p in plan:
            print(f"  {out / (p['key'] + '.mp3')}  {manifest[p['key']]:4.1f}s  {p['text'][:52]}")
        print(f"\n{len(plan)} annonces d'essai → {out}\n"
              "Ni le jeu ni le manifeste n'ont bougé. Écouter, puis relancer "
              "sans --essai pour graver le lot ; les fragments déjà gravés\n"
              "sont acquis et ne repasseront pas par le modèle.")
        return

    # Le ménage n'a lieu qu'une fois le corpus complet : tant qu'un rôle attend
    # sa voix, un clip absent du manifeste peut être un clip encore valide.
    suspects = []
    for fid, v in inventory.items():
        q = FRAG_DIR / f"{fid}.mp3"
        if v["lang"] != "ja-JP" or not q.exists():
            continue
        k = cadence_brute(v["text"], len(trimmed(q)) / SR, v["source"])
        if k < SUSPECT_MIN or k > SUSPECT_MAX:
            suspects.append((k, v["text"], fid))
    coupees = []
    for fid, v in inventory.items():
        q = FRAG_DIR / f"{fid}.mp3"
        if not q.exists():
            continue
        mauvais, db = attaque_coupee(q)
        if mauvais:
            coupees.append((db, v["text"], fid))
    if coupees:
        print(f"\n{len(coupees)} prises à l'attaque escamotée - le début du mot "
              "manque :")
        for db, t, fid in sorted(coupees, reverse=True):
            print(f"  {db:+.0f} dB dès la 1re trame  {fid}  {t[:36]}")
        print("Leur donner un appui : une virgule EN TÊTE dans "
              "lectures-corrections.json.\n")

    if suspects:
        print(f"\n{len(suspects)} prises hors cadence de plus de "
              f"{100 * (SUSPECT_MAX - 1):.0f} % - à regraver plutôt qu'à étirer :")
        for k, t, fid in sorted(suspects):
            print(f"  ×{k:.2f}  {fid}  {t[:40]}")
        print("Supprimer leur fichier dans audio-src/fragments et relancer.\n")

    orphans = [] if deferred else [q for q in out.glob("*.mp3") if q.stem not in manifest]
    for q in orphans:
        q.unlink()
    entries = "\n".join(f"  {json.dumps(k)}: {v}," for k, v in sorted(manifest.items()))
    Path(manifest_path).write_text(
        "// GÉNÉRÉ par scripts/voice-lab/graver.py - ne pas éditer à la main.\n"
        "// Clé = clipKey(lang, texte) ; valeur = durée du MP3 en secondes.\n\n"
        "export const PA_CLIPS: Record<string, number> = {\n"
        f"{entries}\n"
        "};\n", encoding="utf-8")
    print(f"{len(plan)} annonces assemblées → {out}"
          + (f" ({len(manifest) - len(plan)} conservées des rôles en attente)"
             if deferred else "")
          + (f", {len(orphans)} clips orphelins supprimés" if orphans else ""))
    print(f"Manifeste → {manifest_path}")


if __name__ == "__main__":
    main()

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
      [--essai N] [--plan] [--hiragana]
  python scripts/voice-lab/graver.py --variantes 次は [--fin] [--stab]
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
    ("en-US", "cabin"): "",
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
# un changement de graphie. Une valeur inférieure à 1 raccourcit.
DEBIT = {
    # À peine resserré : la graphie mixte a réglé l'essentiel, il ne reste
    # qu'un cheveu. 5 % est sous le seuil où le vocodeur laisse une trace.
    "お乗換です": 0.95,
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
    # La virgule fait MONTER, et 「次は」 ne monte pas : en japonais il annonce
    # ce qui suit sans le questionner. Sans ponctuation, le fragment garde une
    # cadence plate. C'est l'exact inverse du besoin de 「左側です」 - preuve
    # qu'aucune règle de position ne pouvait convenir aux deux.
    "次は": "",
    "左側です": "、",
    "右側です": "、",  # même construction : si l'une tombe, l'autre tombe
}

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
        s, out = to_katakana(s), []
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
    global _readings, _corriges
    if _readings is None:
        if not LECTURES.exists():
            raise SystemExit(f"{LECTURES} absent - le régénérer avec lectures.py.")
        table = json.loads(LECTURES.read_text(encoding="utf-8"))
        _readings = table["lectures"]
        _corriges = set(table.get("corrections", []))
    r = _readings.get(text)
    if r is None:
        raise SystemExit(
            f"Aucune lecture pour « {text} ».\n"
            "Un texte d'annonce a changé depuis la dernière table : relancer\n"
            "scripts/voice-lab/lectures.py depuis une machine avec open_jtalk.")
    return r[1] if HIRAGANA else r[0]


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
        if it["lang"] == "ja-JP":
            frs = [(kana(b), sep, pos, forced) for b, sep, pos, forced in frs]
        bodies = [b for b, _, _, _ in frs]
        seq = []
        for i, (body, sep, pos, forced) in enumerate(frs):
            fid = frag_id(role, it["lang"], body, pos, sources[i])
            inventory[fid] = {"role": role, "lang": it["lang"], "pos": pos, "text": body,
                              "source": sources[i], "debit": DEBIT.get(sources[i], 1.0)}
            nxt = bodies[i + 1] if i + 1 < len(bodies) else None
            gap = 0.0 if i == len(frs) - 1 else gap_after(body, nxt, sep)
            seq.append((fid, forced if forced is not None else gap))
        plan.append({"key": it["key"], "text": it["text"], "seq": seq})
    return plan, inventory, deferred


# Grille d'essai d'un fragment. Les deux dimensions sont celles qui ont
# RÉELLEMENT changé quelque chose jusqu'ici : la graphie - passer 「お乗換です」
# en écriture mixte l'a débloqué là où trois resserrages successifs avaient
# échoué - et la ponctuation, seul levier de mélodie du modèle. `stability`
# vient en troisième dimension, à la demande, parce qu'elle agit sur toute la
# prise et non sur son contour.
GRAPHIES = ("katakana", "hiragana", "source")
PONCTUATIONS = (("sans", ""), ("virgule", "、"), ("point", "。"))
GRILLE_STAB = (0.55, 0.85, 1.00)


def variantes(key, source, role="cabin", lang="ja-JP", pos="mid", stab=False):
    """Grave un même fragment sous toutes les graphies et ponctuations.

    Décrire ce qu'on veut ne marche pas : le modèle ne prend aucune consigne
    d'intonation, il déduit tout de ce qu'on écrit. Et je ne peux rien
    entendre. Tourner autour du pot revient donc à deviner - autant graver la
    grille d'un coup et laisser l'oreille désigner la case.
    """
    ESSAI_DIR.mkdir(parents=True, exist_ok=True)
    kata, hira = (_lecture(source) if lang == "ja-JP" else (source, source))
    formes = {"katakana": kata, "hiragana": hira, "source": source}
    stabs = GRILLE_STAB if stab else (SETTINGS[role]["stability"],)

    print(f"« {source} »   [{role} {pos}]")
    for g in GRAPHIES:
        print(f"  {g:9} {formes[g]}")
    print()
    n = 0
    for g in GRAPHIES:
        for nom, ponct in PONCTUATIONS:
            for st in stabs:
                n += 1
                reg = {**SETTINGS[role], "stability": st}
                mp3 = call(f"/text-to-speech/{VOICES[(lang, role)]}", key, raw=True,
                           query=f"?output_format={OUTPUT_FORMAT}",
                           body={"text": formes[g] + ponct, "model_id": MODEL,
                                 "voice_settings": reg})
                suffixe = f"-stab{int(st * 100):03d}" if stab else ""
                out = ESSAI_DIR / f"var-{n:02d}-{g}-{nom}{suffixe}.mp3"
                out.write_bytes(mp3)
                print(f"  {out.name:38} « {formes[g] + ponct} »")

    print(f"\n{n} prises → {ESSAI_DIR}\n"
          "Retenir la meilleure et me donner son nom, ou reporter soi-même dans\n"
          "graver.py :\n"
          f'  PONCTUATION["{source}"] = "…"        pour le contour\n'
          f'  REGLAGES["{source}"] = {{"stability": …}}   pour la tenue\n'
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
    if "--variantes" in sys.argv:
        if not key:
            raise SystemExit("Renseigner ELEVENLABS_API_KEY.")
        src = sys.argv[sys.argv.index("--variantes") + 1]
        variantes(key, src, pos="end" if "--fin" in sys.argv else "mid",
                  stab="--stab" in sys.argv)
        return
    texts_path, out_dir, manifest_path = sys.argv[1:4]
    argv = sys.argv[4:]
    essai = int(argv[argv.index("--essai") + 1]) if "--essai" in argv else None
    dry = "--plan" in argv
    if "--frags" in argv:
        FRAG_DIR = Path(argv[argv.index("--frags") + 1])

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
        step = max(1, len(plan) // essai)
        plan = plan[::step][:essai]
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
        (FRAG_DIR / f"{fid}.mp3").write_bytes(mp3)
        print(f"[{n}/{len(todo)}] {fid} [{v['role']} {v['pos']}] {v['text'][:44]}")

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
    manifest = read_manifest(manifest_path) if deferred and not essai else {}
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
            debit = inventory[fid]["debit"]
            if debit != 1.0:
                bloc = wsola(bloc, debit, SR).astype(np.float32)
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

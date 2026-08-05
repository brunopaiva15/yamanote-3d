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
from atelier import encode_mp3  # noqa: E402
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

# Silences relevés sur la prise étiquetée 「次は。渋谷。渋谷。お出口は右側です。」
GAP_SENTENCE = 0.35
GAP_COMMA = 0.25
GAP_REPEAT = 0.43  # entre les deux occurrences du nom de gare : le seul plus long

# Marge laissée autour de la parole en rognant un fragment. À zéro les attaques
# de consonnes sourdes se font manger ; au-delà de ~30 ms on réintroduit le
# silence que le montage est censé contrôler.
TRIM_PAD = 0.02


# --- Lecture en kana ------------------------------------------------------
# Un modèle multilingue qui reçoit 渋谷 doit DEVINER la langue avant de lire, et
# il se trompe : on entend du chinois. Les kana ne laissent pas ce choix - une
# more, un son. On envoie donc la PRONONCIATION plutôt que l'orthographe.
#
# open_jtalk fournit ces lectures, et le corpus permet de le contrôler : les
# trente gares y sont déclarées avec leur kana, ce qui donne une vérité de
# référence. Le contrôle tourne à chaque gravure - une lecture qui dérive
# arrête la gravure au lieu de se retrouver gravée.

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


# open_jtalk rend ses lectures en katakana. C'est l'usage des moteurs japonais,
# mais le katakana signale aussi les mots étrangers, et rien ne dit qu'un modèle
# multilingue ne prendra pas tout un texte en katakana pour du vocabulaire
# emprunté - à dire avec l'accent qui va avec. Je n'ai pas pu l'essayer d'ici.
# D'où le repli en hiragana, un seul drapeau à basculer : si l'essai sonne
# « mot étranger », relancer avec --hiragana. Les 172 fragments se regravent
# pour 2000 caractères, l'aller-retour ne coûte rien.
HIRAGANA = False


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


def kana(text):
    import pyopenjtalk
    if not HIRAGANA:
        return pyopenjtalk.g2p(text, kana=True)
    # Les mots RÉELLEMENT étrangers - ドア, コック, ゲートウェイ - s'écrivent en
    # katakana et doivent y rester : les passer en hiragana (どあ, こっく) est
    # une graphie qu'aucun japonais n'écrit, et on ferait buter le modèle sur
    # ce qu'on cherchait justement à lui rendre facile. On ne convertit donc
    # que ce qui n'était pas déjà du katakana, morceau par morceau.
    out = []
    for chunk in re.findall(r"[ァ-ヶー・]+|[^ァ-ヶー・]+", text):
        if re.fullmatch(r"[ァ-ヶー・]+", chunk):
            out.append(chunk)
        else:
            out.append(to_hiragana(pyopenjtalk.g2p(chunk, kana=True)))
    return "".join(out)


def check_readings(stations):
    """Arrête la gravure si open_jtalk ne lit pas une gare comme le corpus."""
    bad = [(s["kanji"], kana(s["kanji"]), s["kana"]) for s in stations
           if not same_reading(kana(s["kanji"]), s["kana"])]
    if bad:
        for k, got, want in bad:
            print(f"  {k} lu «{got}», attendu «{want}»")
        raise SystemExit(f"{len(bad)} gares mal lues - corriger avant de graver.")
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
        # La conversion se fait ICI, avant que le fragment ne prenne son
        # identité : le cache doit être indexé sur ce qui est RÉELLEMENT envoyé
        # au modèle, sinon changer de lecture resservirait l'ancien son.
        out.append((kana(body) if lang == "ja-JP" else body, sep,
                    "end" if i == len(parts) - 1 else "mid"))
    return out


def frag_id(role, lang, body, pos):
    """Identifiant stable d'un fragment.

    Le modèle et les réglages entrent dedans : changer `stability` change le
    son, et un cache qui l'ignorerait resservirait l'ancien rendu sans rien
    dire. La voix aussi, évidemment.
    """
    h = hashlib.sha1(
        "\x1f".join([VOICES[(lang, role)], MODEL, json.dumps(SETTINGS[role], sort_keys=True),
                     role, lang, pos, body]).encode("utf-8")
    )
    return h.hexdigest()[:12]


def spoken(body, sep, pos):
    """Le texte envoyé au modèle, ponctué selon la position.

    Un fragment isolé serait dit comme une phrase complète, avec sa chute
    finale - 「次は」 sonnerait conclusif. La virgule le laisse en suspens.
    """
    if pos == "end":
        return body + ("." if sep in ".," or not sep else "。")
    return body + ("," if sep in ".," else "、")


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
        bodies = [b for b, _, _ in frs]
        seq = []
        for i, (body, sep, pos) in enumerate(frs):
            fid = frag_id(role, it["lang"], body, pos)
            inventory[fid] = {"role": role, "lang": it["lang"], "pos": pos, "text": body}
            nxt = bodies[i + 1] if i + 1 < len(bodies) else None
            seq.append((fid, 0.0 if i == len(frs) - 1 else gap_after(body, nxt, sep)))
        plan.append({"key": it["key"], "text": it["text"], "seq": seq})
    return plan, inventory, deferred


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
    restants = [v for v in inventory.values() if v["lang"] == "ja-JP"
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
        body = spoken(v["text"], "。" if v["lang"] == "ja-JP" else ".", v["pos"])
        mp3 = call(f"/text-to-speech/{VOICES[(v['lang'], v['role'])]}", key, raw=True,
                   query=f"?output_format={OUTPUT_FORMAT}",
                   body={"text": body, "model_id": MODEL,
                         "voice_settings": SETTINGS[v["role"]]})
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
        parts = []
        for fid, gap in p["seq"]:
            parts.append(trimmed(FRAG_DIR / f"{fid}.mp3"))
            # Chaque fragment rogné garde TRIM_PAD de quasi-silence de chaque
            # côté : sans cette soustraction, le silence entendu vaudrait
            # gap + 2·TRIM_PAD et plus les durées relevées sur la prise réelle.
            sil = gap - 2 * TRIM_PAD
            if sil > 0:
                parts.append(np.zeros(int(SR * sil), np.float32))
        y = np.concatenate(parts).astype(np.float32)
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

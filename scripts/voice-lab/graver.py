#!/usr/bin/env python3
"""Grave les annonces PAR FRAGMENTS, comme le fait le vrai système.

⚠ NON EXÉCUTÉ CONTRE ELEVENLABS dans la session qui l'a écrit : leur hôte est
refusé par la politique de sortie réseau (403 au CONNECT). Tout ce qui ne
dépend pas du réseau - découpage, cache, assemblage, manifeste - a été vérifié
sur des fragments factices. Commencer par `--only 3`, écouter, puis le lot.

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
      public/audio/announcements src/data/pa-manifest.ts [--only N] [--plan]
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

# Une voix par rôle. Le quai garde deux automates de sexe différent : sur un
# îlot central les deux quais annoncent le même script à quelques secondes
# d'écart, et la voix est la seule chose qui dise lequel vient de parler.
VOICES = {
    ("ja-JP", "cabin"): "",
    ("ja-JP", "atos-inner"): "",
    ("ja-JP", "atos-outer"): "",
    ("ja-JP", "agent"): "",
    ("en-US", "cabin"): "",
    ("en-US", "atos-en"): "",
}

# `stability` haut = diction régulière, ce que fait un automate. L'agent au
# micro est une PERSONNE : on lui laisse de la variation.
SETTINGS = {
    "cabin": {"stability": 0.75, "similarity_boost": 0.75, "style": 0.0},
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
        out.append((body, sep, "end" if i == len(parts) - 1 else "mid"))
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
    """(plan par annonce, inventaire des fragments à graver)."""
    plan, inventory = [], {}
    for it in items:
        role = it.get("role", "cabin")
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
    return plan, inventory


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

    global FRAG_DIR
    texts_path, out_dir, manifest_path = sys.argv[1:4]
    argv = sys.argv[4:]
    only = int(argv[argv.index("--only") + 1]) if "--only" in argv else None
    dry = "--plan" in argv
    if "--frags" in argv:
        FRAG_DIR = Path(argv[argv.index("--frags") + 1])

    items = json.loads(Path(texts_path).read_text(encoding="utf-8"))["items"]
    plan, inventory = build_plan(items)

    FRAG_DIR.mkdir(parents=True, exist_ok=True)
    todo = [f for f in inventory if not (FRAG_DIR / f"{f}.mp3").exists()]
    chars = sum(len(inventory[f]["text"]) + 1 for f in todo)
    print(f"{len(items)} annonces · {len(inventory)} fragments "
          f"({len(inventory) - len(todo)} en cache, {len(todo)} à graver, "
          f"{chars} caractères)")
    if dry:
        for f in todo[:40]:
            v = inventory[f]
            print(f"  {f} [{v['role']:11} {v['pos']}] {v['text'][:50]}")
        if len(todo) > 40:
            print(f"  … et {len(todo) - 40} autres")
        return

    missing_voice = {inventory[f]["lang"] for f in todo
                     if not VOICES.get((inventory[f]["lang"], inventory[f]["role"]))}
    if todo and missing_voice:
        raise SystemExit("VOICES incomplet - lancer d'abord --list.")

    if only:
        todo = todo[:only]
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

    (FRAG_DIR / "index.json").write_text(
        json.dumps(inventory, ensure_ascii=False, indent=1, sort_keys=True) + "\n",
        encoding="utf-8")

    if only:
        print("Lot partiel : ni assemblage ni manifeste. Écouter, puis relancer sans --only.")
        return

    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    manifest = {}
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

    orphans = [q for q in out.glob("*.mp3") if q.stem not in manifest]
    for q in orphans:
        q.unlink()
    entries = "\n".join(f"  {json.dumps(k)}: {v}," for k, v in sorted(manifest.items()))
    Path(manifest_path).write_text(
        "// GÉNÉRÉ par scripts/voice-lab/graver.py - ne pas éditer à la main.\n"
        "// Clé = clipKey(lang, texte) ; valeur = durée du MP3 en secondes.\n\n"
        "export const PA_CLIPS: Record<string, number> = {\n"
        f"{entries}\n"
        "};\n", encoding="utf-8")
    print(f"{len(manifest)} annonces assemblées → {out}"
          + (f", {len(orphans)} clips orphelins supprimés" if orphans else ""))
    print(f"Manifeste → {manifest_path}")


if __name__ == "__main__":
    main()

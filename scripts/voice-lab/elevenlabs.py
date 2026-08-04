#!/usr/bin/env python3
"""Grave les annonces avec ElevenLabs. Remplace announcements-gen.py.

⚠ CE SCRIPT N'A PAS PU ÊTRE EXÉCUTÉ dans la session qui l'a écrit : l'hôte
d'ElevenLabs est refusé par la politique de sortie réseau (403 au niveau
CONNECT), comme celui d'Azure. Il est écrit d'après l'API REST publique et
demande une vérification au premier lancement - commencer par `--only 3`,
écouter, puis lancer le lot complet.

POURQUOI. Six tours d'écoute notée sur 104 extraits ont montré que toutes les
synthèses libres atteignables plafonnent à 2 ou 3 sur 5. ElevenLabs est d'une
autre catégorie sur le japonais, et son modèle multilingue respecte les
balises de pause - donc les silences relevés sur la prise réelle peuvent être
posés au centième plutôt que subis.

CE QUE LE SCRIPT POSE, ET QUI VIENT DE LA MESURE :

- les silences relevés sur la prise étiquetée 「次は。渋谷。渋谷。お出口は右側
  です。」 : 0,35 s en fin de phrase, 0,25 s après une virgule, et 0,43 s entre
  les DEUX répétitions du nom de gare, qui est le seul écart plus long ;
- une voix par rôle, le quai gardant ses deux automates de sexe différent.

CE QU'IL NE PEUT PAS POSER : la hauteur et le débit. ElevenLabs ne les expose
pas. C'est un vrai renoncement par rapport à Azure, où `<prosody rate>` cadrait
le débit - ici la vitesse dépend de la voix choisie, et c'est `stability` qui
la stabilise indirectement. `rapport.py` dira de combien la prise livrée
s'écarte des 236 Hz et des durées relevées ; si l'écart gêne, il se corrige
après coup avec atelier.pitch_shift, sans rééchantillonner les formants.

LICENCE. Les plans payants d'ElevenLabs accordent l'usage commercial de l'audio
produit ; le plan gratuit ne l'accorde pas et impose une attribution. Le jeu
étant public, VÉRIFIER son propre plan avant de graver - c'est une question de
contrat, pas de technique.

Usage :
  export ELEVENLABS_API_KEY=...
  python scripts/voice-lab/elevenlabs.py --list          # voix du compte
  npx esbuild scripts/announcements-export.ts --bundle --format=esm \\
      --platform=node --outfile=/tmp/export.mjs
  node /tmp/export.mjs /tmp/textes.json
  python scripts/voice-lab/elevenlabs.py /tmp/textes.json \\
      public/audio/announcements src/data/pa-manifest.ts [--only N] [--reuse]
"""

import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE = "https://api.elevenlabs.io/v1"
MODEL = "eleven_multilingual_v2"
OUTPUT_FORMAT = "mp3_44100_128"  # débit CONSTANT : la durée se déduit de la taille

# Identifiants de voix, à remplir après `--list`. Six rôles, six voix : sur un
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

# Réglages de voix. `stability` haut = diction régulière, ce que fait un
# automate ; `style` bas pour la même raison. L'agent au micro est une
# PERSONNE : on lui laisse un peu de variation.
SETTINGS = {
    "cabin": {"stability": 0.75, "similarity_boost": 0.75, "style": 0.0},
    "atos-inner": {"stability": 0.80, "similarity_boost": 0.75, "style": 0.0},
    "atos-outer": {"stability": 0.80, "similarity_boost": 0.75, "style": 0.0},
    "agent": {"stability": 0.45, "similarity_boost": 0.75, "style": 0.15},
    "atos-en": {"stability": 0.80, "similarity_boost": 0.75, "style": 0.0},
}

# Silences mesurés, en secondes.
BREAK_SENTENCE = 0.35
BREAK_COMMA = 0.25
BREAK_REPEAT = 0.43  # entre deux segments identiques : le nom de gare répété


def marked(text):
    """Le texte du jeu, ponctuation remplacée par des balises de pause.

    On retire la ponctuation d'origine : la laisser ferait s'ajouter la pause
    que le modèle place de lui-même à celle qu'on demande, et les silences ne
    seraient plus ceux qu'on a mesurés.
    """
    parts = [p for p in re.findall(r"[^、。.]+[、。.]?", text) if p.strip()]
    out = []
    for i, part in enumerate(parts):
        raw = part.rstrip("、。. ")
        out.append(raw)
        if i < len(parts) - 1:
            nxt = parts[i + 1].rstrip("、。. ")
            if raw and raw == nxt:
                s = BREAK_REPEAT
            elif part.rstrip().endswith("、"):
                s = BREAK_COMMA
            else:
                s = BREAK_SENTENCE
            out.append(f'<break time="{s}s" />')
    return "".join(out)


def call(path, key, body=None, raw=False, query=""):
    url = f"{BASE}{path}{query}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers={
        "xi-api-key": key,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg" if raw else "application/json",
    })
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read() if raw else json.loads(r.read())
        except urllib.error.HTTPError as exc:
            # 429 = limite de débit du compte, 5xx = incident : on réessaie.
            if exc.code in (429, 500, 502, 503) and attempt < 3:
                time.sleep(2 ** attempt)
                continue
            raise SystemExit(
                f"ElevenLabs a répondu {exc.code} : "
                f"{exc.read()[:300].decode('utf-8', 'replace')}\n"
                "401 → clé invalide ; 422 → identifiant de voix inconnu ; "
                "429 persistant → quota de caractères épuisé.")
    raise SystemExit("ElevenLabs injoignable après plusieurs tentatives.")


def list_voices(key):
    for v in call("/voices", key)["voices"]:
        labels = v.get("labels") or {}
        tags = " ".join(f"{k}={x}" for k, x in labels.items() if k in
                        ("gender", "age", "accent", "use_case"))
        print(f"{v['voice_id']}  {v['name']:24} {tags}")
    print("\nReporter les identifiants voulus dans VOICES, en tête du script.")


def read_manifest(path):
    if not Path(path).exists():
        return {}
    return {k: float(v) for k, v in
            re.findall(r'"([0-9a-f]{8})":\s*([\d.]+)',
                       Path(path).read_text(encoding="utf-8"))}


def main():
    key = os.environ.get("ELEVENLABS_API_KEY")
    if not key:
        raise SystemExit("Renseigner ELEVENLABS_API_KEY.")
    if "--list" in sys.argv:
        list_voices(key)
        return

    texts_path, out_dir, manifest_path = sys.argv[1:4]
    argv = sys.argv[4:]
    only = int(argv[argv.index("--only") + 1]) if "--only" in argv else None
    reuse = "--reuse" in argv

    missing = [k for k, v in VOICES.items() if not v]
    if missing:
        raise SystemExit(f"VOICES incomplet pour {missing} - lancer d'abord --list.")

    items = json.loads(Path(texts_path).read_text(encoding="utf-8"))["items"]
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    known = read_manifest(manifest_path) if reuse else {}
    todo = [it for it in items
            if not (reuse and it["key"] in known and (out / f"{it['key']}.mp3").exists())]
    if only:
        todo = todo[:only]
    manifest = {k: v for k, v in known.items() if k in {i["key"] for i in items}}

    for n, it in enumerate(todo, 1):
        role = it.get("role", "cabin")
        voice_id = VOICES[(it["lang"], role)]
        # Japonais : le champ `tts` porte les réécritures en katakana (山手線 →
        # ヤマノテ線). Anglais : `tts` porte des phonèmes propres à Kokoro, que
        # ce moteur ne comprend pas - on envoie le texte du jeu.
        text = it["tts"] if it["lang"] == "ja-JP" else it["text"]
        mp3 = call(f"/text-to-speech/{voice_id}", key, raw=True,
                   query=f"?output_format={OUTPUT_FORMAT}",
                   body={"text": marked(text), "model_id": MODEL,
                         "voice_settings": SETTINGS[role]})
        (out / f"{it['key']}.mp3").write_bytes(mp3)
        manifest[it["key"]] = round(len(mp3) * 8 / 128000, 2)
        print(f"[{n}/{len(todo)}] {it['key']} {manifest[it['key']]:.1f}s "
              f"- {it['text'][:48]}")

    if not only:
        orphans = [p for p in out.glob("*.mp3") if p.stem not in manifest]
        for p in orphans:
            p.unlink()
        if orphans:
            print(f"{len(orphans)} clips orphelins supprimés.")
        entries = "\n".join(f"  {json.dumps(k)}: {v}," for k, v in sorted(manifest.items()))
        Path(manifest_path).write_text(
            "// GÉNÉRÉ par scripts/voice-lab/elevenlabs.py - ne pas éditer à la main.\n"
            "// Clé = clipKey(lang, texte) ; valeur = durée du MP3 en secondes.\n\n"
            "export const PA_CLIPS: Record<string, number> = {\n"
            f"{entries}\n"
            "};\n", encoding="utf-8")
        print(f"{len(manifest)} clips → {out}\nManifeste → {manifest_path}")


if __name__ == "__main__":
    main()

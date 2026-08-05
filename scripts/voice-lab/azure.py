#!/usr/bin/env python3
"""Grave les annonces avec les voix neuronales d'Azure. Remplace announcements-gen.py.

⚠ CE SCRIPT N'A PAS PU ÊTRE EXÉCUTÉ dans la session qui l'a écrit : l'hôte
d'Azure est refusé par la politique de sortie réseau (403 au niveau CONNECT).
Il est écrit d'après l'API REST publique et demande une vérification au premier
lancement - commencer par `--only 3`, écouter, puis lancer le lot complet.

POURQUOI AZURE. Six tours d'écoute notée sur 104 extraits ont montré que toutes
les synthèses libres atteignables - Kokoro réglé, Kokoro greffé sur la prosodie
d'une prise réelle, VOICEVOX calé - occupent la même plage basse. Les voix
neuronales japonaises d'Azure sont d'une autre génération, et surtout elles
acceptent en SSML exactement les consignes que la prise étiquetée a livrées :
des silences au milliseconde près, un débit et une hauteur relatifs.

COÛT. Les 476 clips du jeu font 27 486 caractères, soit 5,5 % du palier gratuit
mensuel d'Azure (500 000 caractères). La gravure complète est donc gratuite, et
peut être relancée plusieurs fois dans le mois.

CE QUI RESTE À VÉRIFIER À LA PREMIÈRE ÉCOUTE :

- les NOMS DE GARE en anglais. Le générateur Kokoro leur injectait une lecture
  phonétique maison (« [Ueno](/ˌuˈɛnO/) », voir scripts/en-readings.ts) que
  Azure ne comprend pas. On envoie donc le texte du jeu tel quel, en pariant
  sur le lexique d'Azure. Si un nom sort déformé, l'ajouter à --lexicon sous la
  forme d'une prononciation IPA ;
- 山手線, que certains analyseurs lisent « yamate-sen ». Le champ `tts` du JSON
  porte déjà la réécriture en katakana ; on l'utilise pour le japonais.

Usage :
  export AZURE_SPEECH_KEY=...  AZURE_SPEECH_REGION=francecentral
  npx esbuild scripts/announcements-export.ts --bundle --format=esm \\
      --platform=node --outfile=/tmp/export.mjs
  node /tmp/export.mjs /tmp/textes.json
  python scripts/voice-lab/azure.py /tmp/textes.json public/audio/announcements \\
      src/data/pa-manifest.ts [--only N] [--reuse] [--lexicon lex.json]
"""

import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from xml.sax.saxutils import escape

# Une voix par rôle. Le quai garde deux automates de sexe différent : sur un
# îlot central, les deux quais annoncent le même script à quelques secondes
# d'écart, et la voix est la seule chose qui dise lequel vient de parler.
VOICES = {
    ("ja-JP", "cabin"): "ja-JP-NanamiNeural",
    ("ja-JP", "atos-inner"): "ja-JP-AoiNeural",
    ("ja-JP", "atos-outer"): "ja-JP-DaichiNeural",
    ("ja-JP", "agent"): "ja-JP-MayuNeural",
    ("en-US", "cabin"): "en-US-JennyNeural",
    ("en-US", "atos-en"): "en-US-GuyNeural",
}

# Débit relatif par rôle. Le zéro d'Azure est déjà proche des durées relevées
# (次は 0,51 s · 渋谷 0,67 s · お出口は右側です 1,57 s) ; on ne corrige qu'à la
# marge, et le quai reste un cran plus lent - dehors, sous une verrière, une
# annonce trop rapide ne s'attrape pas.
RATES = {"cabin": "-4%", "atos-inner": "-8%", "atos-outer": "-8%",
         "agent": "0%", "atos-en": "-10%"}

# Silences, en millisecondes. Mesurés sur la prise étiquetée : 0,34 s après
# 次は, 0,43 s entre les deux répétitions du nom de gare, 0,31 s avant la
# phrase de sortie. Aucune pause longue à l'intérieur d'une annonce - le 0,62 s
# uniforme du générateur Kokoro était trop long partout.
BREAK_SENTENCE = 350
BREAK_COMMA = 250
BREAK_REPEAT = 430  # entre deux segments identiques : le nom de gare répété

FORMAT = "audio-24khz-48kbitrate-mono-mp3"


def ssml(text, voice, lang, rate, lexicon):
    """Le texte du jeu en SSML : la ponctuation devient des silences mesurés."""
    parts = [p for p in re.findall(r"[^、。.]+[、。.]?", text) if p.strip()]
    body = []
    for i, part in enumerate(parts):
        raw = part.rstrip("、。. ")
        for word, ipa in lexicon.items():
            raw = raw.replace(
                word, f'</prosody><phoneme alphabet="ipa" ph="{escape(ipa)}">'
                       f'{escape(word)}</phoneme><prosody rate="{rate}">')
        body.append(escape(raw) if raw == part.rstrip("、。. ") else raw)
        if i < len(parts) - 1:
            # Le nom de gare est dit deux fois de suite : le silence qui sépare
            # les deux répétitions est plus long que les autres.
            nxt = parts[i + 1].rstrip("、。. ")
            if raw and raw == nxt:
                ms = BREAK_REPEAT
            elif part.rstrip().endswith(("、",)):
                ms = BREAK_COMMA
            else:
                ms = BREAK_SENTENCE
            body.append(f'<break time="{ms}ms"/>')
    inner = "".join(body)
    return (f'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" '
            f'xml:lang="{lang}"><voice name="{voice}">'
            f'<prosody rate="{rate}">{inner}</prosody></voice></speak>')


def synth(key, region, body, retries=4):
    url = f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1"
    req = urllib.request.Request(url, data=body.encode("utf-8"), method="POST", headers={
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": FORMAT,
        "User-Agent": "yamanote-3d",
    })
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except urllib.error.HTTPError as exc:
            # 429 = quota momentané, 5xx = incident : on réessaie. 401/403 est
            # une clé ou une région fausse, et réessayer n'y changerait rien.
            if exc.code in (429, 500, 502, 503) and attempt < retries - 1:
                time.sleep(2 ** attempt)
                continue
            raise SystemExit(
                f"Azure a répondu {exc.code} : {exc.read()[:300].decode('utf-8', 'replace')}\n"
                "401/403 → clé ou région incorrecte ; 400 → SSML refusé "
                "(souvent un nom de voix inconnu dans la région choisie).")
    raise SystemExit("Azure injoignable après plusieurs tentatives.")


def read_manifest(path):
    if not Path(path).exists():
        return {}
    txt = Path(path).read_text(encoding="utf-8")
    return {k: float(v) for k, v in re.findall(r'"([0-9a-f]{8})":\s*([\d.]+)', txt)}


def duration(mp3_bytes):
    """Durée du MP3, déduite de sa taille : FORMAT impose un débit CONSTANT de
    48 kbit/s, donc la taille suffit et il n'y a pas de trame à décoder."""
    return round(len(mp3_bytes) * 8 / 48000, 2)


def main():
    texts_path, out_dir, manifest_path = sys.argv[1:4]
    argv = sys.argv[4:]
    key = os.environ.get("AZURE_SPEECH_KEY")
    region = os.environ.get("AZURE_SPEECH_REGION")
    if not key or not region:
        raise SystemExit("Renseigner AZURE_SPEECH_KEY et AZURE_SPEECH_REGION.")

    lexicon = {}
    if "--lexicon" in argv:
        lexicon = json.loads(Path(argv[argv.index("--lexicon") + 1]).read_text("utf-8"))
    only = int(argv[argv.index("--only") + 1]) if "--only" in argv else None
    reuse = "--reuse" in argv

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
        voice = VOICES.get((it["lang"], role))
        if not voice:
            raise SystemExit(f"Pas de voix Azure pour {it['lang']}/{role}.")
        # Japonais : le champ `tts` porte les réécritures en katakana (山手線 →
        # ヤマノテ線). Anglais : `tts` porte des phonèmes propres à Kokoro, que
        # Azure ne comprend pas - on envoie le texte du jeu.
        text = it["tts"] if it["lang"] == "ja-JP" else it["text"]
        body = ssml(text, voice, it["lang"], RATES.get(role, "0%"), lexicon)
        mp3 = synth(key, region, body)
        (out / f"{it['key']}.mp3").write_bytes(mp3)
        manifest[it["key"]] = duration(mp3)
        print(f"[{n}/{len(todo)}] {it['key']} {voice} {manifest[it['key']]:.1f}s "
              f"- {it['text'][:48]}")

    if not only:
        orphans = [p for p in out.glob("*.mp3") if p.stem not in manifest]
        for p in orphans:
            p.unlink()
        if orphans:
            print(f"{len(orphans)} clips orphelins supprimés.")

        entries = "\n".join(f"  {json.dumps(k)}: {v}," for k, v in sorted(manifest.items()))
        Path(manifest_path).write_text(
            "// GÉNÉRÉ par scripts/voice-lab/azure.py - ne pas éditer à la main.\n"
            "// Clé = clipKey(lang, texte) ; valeur = durée du MP3 en secondes.\n\n"
            "export const PA_CLIPS: Record<string, number> = {\n"
            f"{entries}\n"
            "};\n", encoding="utf-8")
        print(f"{len(manifest)} clips → {out}\nManifeste → {manifest_path}")


if __name__ == "__main__":
    main()

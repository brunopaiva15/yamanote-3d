# Graver les annonces avec Azure, de A à Z

Six tours d'écoute notée (104 extraits) ont montré que les synthèses libres
plafonnent toutes au même niveau — voir `docs/VOIX_ANALYSE.md`. Les voix
neuronales japonaises d'Azure sont d'une autre génération, et surtout elles
acceptent en SSML les consignes que la prise réelle a livrées : des silences au
milliseconde près.

**Coût : zéro.** Les 476 clips font 27 486 caractères, soit 5,5 % du palier
gratuit mensuel d'Azure (500 000 caractères/mois sur les voix neuronales). Une
carte bancaire est demandée à l'inscription mais n'est pas débitée tant qu'on
reste sous le palier — et on peut relancer la gravure complète dix-huit fois
dans le mois avant de l'atteindre.

## 1. Créer la ressource (10 minutes, une seule fois)

1. Aller sur <https://portal.azure.com> et se connecter (compte Microsoft
   ordinaire ; en créer un si besoin).
2. S'il s'agit du premier usage d'Azure, cliquer **Démarrer gratuitement** et
   suivre l'inscription. Carte demandée, vérification à 0 €, **pas de débit
   automatique** : le compte gratuit ne bascule pas en payant sans accord
   explicite.
3. Dans la barre de recherche du portail, taper **Speech** et choisir
   *Services Azure AI → Speech*. Puis **Créer**.
4. Remplir :
   - *Abonnement* : celui qui vient d'être créé ;
   - *Groupe de ressources* : **Créer** → `yamanote` ;
   - *Région* : **France Central** (ou *West Europe*). Retenir ce nom, il sert
     à la variable d'environnement ;
   - *Nom* : `yamanote-voix` ;
   - *Tarification* : **Free F0**. C'est le palier gratuit — s'il est grisé,
     c'est qu'une ressource Speech gratuite existe déjà sur l'abonnement ;
     prendre alors *Standard S0*, la facture restera de quelques centimes.
5. **Vérifier + créer**, puis **Créer**. Une minute d'attente.
6. Une fois déployée : **Accéder à la ressource** → menu de gauche,
   **Clés et point de terminaison**. Copier **CLÉ 1** et noter
   l'**Emplacement/Région** (par exemple `francecentral`, en minuscules sans
   espace).

## 2. Préparer sa machine

```bash
git checkout claude/voice-tuning-ja-en-sqccp7
npm install                     # pour esbuild
```

Python 3 suffit : le script n'utilise que la bibliothèque standard.

## 3. Exporter les textes

Exactement comme pour le générateur actuel — c'est la même source de vérité.

```bash
npx esbuild scripts/announcements-export.ts --bundle --format=esm \
    --platform=node --outfile=/tmp/export.mjs
node /tmp/export.mjs /tmp/textes.json
```

## 4. Graver trois clips d'essai, et ÉCOUTER

Ne jamais lancer les 476 sans avoir écouté trois.

```bash
export AZURE_SPEECH_KEY=<la clé 1 copiée>
export AZURE_SPEECH_REGION=francecentral

python scripts/voice-lab/azure.py /tmp/textes.json /tmp/essai /tmp/manifest.ts --only 3
```

Trois MP3 apparaissent dans `/tmp/essai`. Les écouter.

- **401 ou 403** → la clé ou la région est fausse. La région s'écrit sans
  majuscule ni espace : `francecentral`, pas `France Central`.
- **400** → SSML refusé, presque toujours une voix indisponible dans la région
  choisie. Changer la région, ou le nom de voix dans `VOICES`.
- **429** → quota momentané ; le script réessaie tout seul.

## 5. Vérifier que ça tombe sur les cibles

```bash
python scripts/voice-lab/rapport.py <ton enregistrement.mp3> \
    /tmp/textes.json /tmp/essai
```

Le tableau compare la prise réelle et les clips gravés sur les mêmes mesures.
Les cibles relevées : **236 Hz** de hauteur médiane, segments de **1,63 s**,
débit **6,16 pics/s**.

## 6. Graver les 476 et brancher

```bash
python scripts/voice-lab/azure.py /tmp/textes.json \
    public/audio/announcements src/data/pa-manifest.ts
npm run dev
```

Le script écrit les MP3 **et** `src/data/pa-manifest.ts` au format attendu par
le runtime, supprime les clips orphelins, et se comporte comme
`announcements-gen.py` pour le reste. `--reuse` ne grave que les manquants.

Pour revenir en arrière : `git checkout -- public/audio/announcements
src/data/pa-manifest.ts`.

## 7. Ce qu'il faudra sans doute retoucher

**Les noms de gare en anglais.** Le générateur Kokoro leur injectait une lecture
phonétique maison (`[Ueno](/ˌuˈɛnO/)`, voir `scripts/en-readings.ts`) qu'Azure
ne comprend pas ; on lui envoie donc le texte du jeu et on parie sur son
lexique. Si un nom sort déformé, l'ajouter à un fichier de prononciations :

```json
{ "Shibuya": "ɕibɯja", "Ueno": "ɯeno", "Ikebukuro": "ikebɯkɯɾo" }
```

```bash
python scripts/voice-lab/azure.py ... --lexicon lexique.json
```

**Les voix.** `VOICES`, en tête du script, associe une voix Azure à chacun des
six rôles. Les autres voix japonaises disponibles : `ja-JP-ShioriNeural`,
`ja-JP-KeitaNeural`, `ja-JP-NaokiNeural`. La liste complète se consulte avec :

```bash
curl -H "Ocp-Apim-Subscription-Key: $AZURE_SPEECH_KEY" \
  "https://$AZURE_SPEECH_REGION.tts.speech.microsoft.com/cognitiveservices/voices/list"
```

**Les silences.** `BREAK_SENTENCE` (350 ms), `BREAK_COMMA` (250 ms) et
`BREAK_REPEAT` (430 ms, entre les deux répétitions du nom de gare) sont les
valeurs mesurées sur la prise réelle. Ce sont trois constantes en tête du
script.

## Ce qui n'a pas pu être vérifié ici

`scripts/voice-lab/azure.py` **n'a jamais été exécuté contre Azure** : l'hôte
est refusé par la politique de sortie réseau de la session qui l'a écrit (403
au niveau CONNECT). Ce qui **a** été vérifié : les 952 documents SSML que le
script produit pour les 476 clips — avec et sans lexique — sont tous bien
formés, et chaque rôle a bien une voix. Ce qui reste à voir au premier
lancement, c'est la réponse d'Azure elle-même. D'où l'étape 4.

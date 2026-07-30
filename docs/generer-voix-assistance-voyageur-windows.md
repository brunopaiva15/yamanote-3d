# Générer les voix de l'assistance voyageur sous Windows

Ce guide part d'un PC Windows sans environnement Kokoro configuré et va
jusqu'à la validation et au commit des six nouveaux clips. Il tient compte des
problèmes rencontrés sous Windows : module d'export absent, dictionnaire MeCab
introuvable et dépendance `click` manquante dans spaCy.

L'incident contient trois annonces en japonais et en anglais, soit six MP3.
Elles sont déjà enregistrées dans l'exporteur du projet : **aucune modification
de code n'est nécessaire**. Les annonces de rame utilisent `jf_alpha` en
japonais et `af_heart` en anglais.

## 1. Installer les prérequis

Installer :

- [Git for Windows](https://git-scm.com/download/win) ;
- [Node.js LTS](https://nodejs.org/) ;
- [Python 3.11 64 bits](https://www.python.org/downloads/) en cochant
  **Add Python to PATH**.

Ouvrir PowerShell puis vérifier :

```powershell
git --version
node --version
npm --version
py -3.11 --version
```

## 2. Préparer le dépôt

Pour une première installation :

```powershell
cd C:\Temp\GitHub
git clone https://github.com/brunopaiva15/yamanote-3d.git
cd .\yamanote-3d
npm install
```

Avec un dépôt existant :

```powershell
cd C:\Temp\GitHub\yamanote-3d
git pull
npm install
```

Vérifier que l'exporteur contient bien l'incident :

```powershell
Select-String -Path .\scripts\announcements-export.ts -Pattern "passengerAssistance"
```

La commande doit afficher les trois imports et les trois appels d'export. Si
elle ne retourne rien, la branche locale n'inclut pas encore la fonctionnalité.

## 3. Créer l'environnement Python

Créer un environnement virtuel séparé du dépôt :

```powershell
py -3.11 -m venv "$HOME\venvs\yamanote-kokoro"
& "$HOME\venvs\yamanote-kokoro\Scripts\Activate.ps1"
```

Le prompt doit commencer par `(yamanote-kokoro)`.

Si PowerShell interdit l'activation :

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Rouvrir PowerShell, revenir dans le dépôt, puis réactiver l'environnement.

## 4. Installer toutes les dépendances Python

Les extras de Misaki ne suffisent pas toujours sous Windows : installer
explicitement UniDic Lite pour Fugashi et `click` pour spaCy évite les deux
erreurs rencontrées pendant la génération.

```powershell
python -m pip install --upgrade pip setuptools wheel
python -m pip install --upgrade kokoro-onnx "misaki[en,ja]" lameenc
python -m pip install --upgrade unidic-lite "fugashi[unidic-lite]"
python -m pip install --upgrade "click>=8.1,<9" spacy
python -m pip check
```

La dernière commande doit afficher :

```text
No broken requirements found.
```

### Vérifier le japonais

```powershell
$dic = python -c "import unidic_lite; print(unidic_lite.DICDIR)"
Write-Host "Dictionnaire : $dic"
Test-Path $dic
Remove-Item Env:MECABRC -ErrorAction SilentlyContinue
python -c "from fugashi import Tagger; print(Tagger()('お客様の救護を行っております。'))"
python -c "from misaki import ja; print(ja.JAG2P()('お客様の救護を行っております。'))"
```

`Test-Path` doit retourner `True` et les deux commandes Python doivent afficher
une analyse, sans référence à `C:\mecab\mecabrc`.

### Vérifier l'anglais

```powershell
python -c "import click, spacy; print('click et spaCy OK', spacy.__version__)"
python -c "from misaki import en; g2p = en.G2P(trf=False, british=False); print(g2p('We are currently assisting a passenger.'))"
```

Ces tests isolés évitent d'attendre le chargement du modèle ONNX pour découvrir
une dépendance manquante.

## 5. Télécharger les modèles Kokoro

Télécharger depuis la release `model-files-v1.0` de `thewh1teagle/kokoro-onnx` :

- `kokoro-v1.0.onnx` ;
- `voices-v1.0.bin`.

Page : <https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0>

Les placer hors du dépôt, par exemple :

```text
C:\Temp\kokoro-v1.0\kokoro-v1.0.onnx
C:\Temp\kokoro-v1.0\voices-v1.0.bin
```

Vérifier les chemins :

```powershell
Test-Path "C:\Temp\kokoro-v1.0\kokoro-v1.0.onnx"
Test-Path "C:\Temp\kokoro-v1.0\voices-v1.0.bin"
```

Les deux résultats doivent être `True`. Ne pas ajouter ces modèles à Git.

## 6. Compiler l'exporteur d'annonces

Revenir à la racine du dépôt puis créer le dossier temporaire :

```powershell
cd C:\Temp\GitHub\yamanote-3d
New-Item -ItemType Directory -Force ".\.tmp\announcements"
```

Compiler l'exporteur sur **une seule ligne** :

```powershell
npx --yes esbuild ".\scripts\announcements-export.ts" --bundle --format=esm --platform=node --outfile=".\.tmp\announcements\announcements-export.mjs"
```

Vérifier le résultat avant d'appeler Node :

```powershell
Test-Path ".\.tmp\announcements\announcements-export.mjs"
```

Le résultat doit être `True`. Sinon, ne pas lancer l'étape suivante : l'erreur
`Cannot find module ... announcements-export.mjs` signifie précisément que
cette compilation n'a pas créé le fichier.

Si `npx` ne trouve pas esbuild :

```powershell
npm install --no-save esbuild
npx esbuild ".\scripts\announcements-export.ts" --bundle --format=esm --platform=node --outfile=".\.tmp\announcements\announcements-export.mjs"
```

## 7. Exporter les textes vers JSON

```powershell
node ".\.tmp\announcements\announcements-export.mjs" ".\.tmp\announcements\announcements-texts.json"
Test-Path ".\.tmp\announcements\announcements-texts.json"
```

Le test doit retourner `True`.

Vérifier que les six annonces sont présentes et utilisent les bonnes voix :

```powershell
$data = Get-Content ".\.tmp\announcements\announcements-texts.json" -Raw -Encoding UTF8 | ConvertFrom-Json
$assistance = $data.items | Where-Object {
  $_.text -match "お客様の救護|assisting a passenger|still assisting a passenger|Assistance has been completed"
}
$assistance | Select-Object key, lang, voice, speed, text | Format-Table -Wrap
if ($assistance.Count -ne 6) {
  throw "Annonces trouvées : $($assistance.Count), attendu : 6"
}
```

Le tableau doit contenir trois `jf_alpha` et trois `af_heart`.

## 8. Sauvegarder les annonces existantes

Cette étape est facultative mais prudente :

```powershell
Copy-Item .\public\audio\announcements .\.tmp\announcements\audio-backup -Recurse
Copy-Item .\src\data\pa-manifest.ts .\.tmp\announcements\pa-manifest.backup.ts
```

## 9. Générer uniquement les six nouveaux MP3

Vérifier que `(yamanote-kokoro)` est toujours affiché. Sinon :

```powershell
& "$HOME\venvs\yamanote-kokoro\Scripts\Activate.ps1"
```

Lancer la génération sur une seule ligne :

```powershell
python ".\scripts\announcements-gen.py" ".\.tmp\announcements\announcements-texts.json" "C:\Temp\kokoro-v1.0\kokoro-v1.0.onnx" "C:\Temp\kokoro-v1.0\voices-v1.0.bin" ".\public\audio\announcements" ".\src\data\pa-manifest.ts" --reuse
```

La sortie attendue commence par :

```text
470 clips déjà gravés, 6 à faire.
Vérification des lectures de gares…
```

Puis elle affiche six lignes `[1/6]` à `[6/6]`. `--reuse` est indispensable :
il conserve les anciens fichiers et ne synthétise que les clips absents.

### Regraver une voix existante

Quand le texte ne change pas mais que la voix ou son débit change, les clés des
clips restent identiques. `--reuse` les conserverait donc par erreur. Ajouter
`--force-role` permet de ne regraver que le rôle concerné, sans refaire toutes
les annonces du jeu. Pour la voix féminine du quai intérieur :

```powershell
python ".\scripts\announcements-gen.py" ".\.tmp\announcements\announcements-texts.json" "C:\Temp\kokoro-v1.0\kokoro-v1.0.onnx" "C:\Temp\kokoro-v1.0\voices-v1.0.bin" ".\public\audio\announcements" ".\src\data\pa-manifest.ts" --reuse --force-role atos-inner
```

Cette commande remplace les MP3 `atos-inner`, recalcule leurs durées dans le
manifeste et laisse tous les autres clips intacts.

#### Procédure complète pour la nouvelle voix `jf_alpha` du quai intérieur

Voici toutes les commandes à exécuter, dans l'ordre, à partir de l'activation
de l'environnement. Elles supposent que le dépôt est dans
`C:\Temp\GitHub\yamanote-3d` et les deux fichiers Kokoro dans
`C:\Temp\kokoro-v1.0`. Ne sauter ni le nouvel export JSON ni sa vérification :
un ancien JSON regraverait encore `jf_tebukuro`.

```powershell
& "$HOME\venvs\yamanote-kokoro\Scripts\Activate.ps1"
cd "C:\Temp\GitHub\yamanote-3d"

python -m pip check
python -c "import kokoro_onnx, lameenc, click, spacy, unidic_lite; print('Imports Python OK')"
if (-not (Test-Path "C:\Temp\kokoro-v1.0\kokoro-v1.0.onnx")) { throw "Modèle ONNX absent" }
if (-not (Test-Path "C:\Temp\kokoro-v1.0\voices-v1.0.bin")) { throw "Fichier de voix absent" }

npm install
New-Item -ItemType Directory -Force ".\.tmp\announcements" | Out-Null
npx esbuild ".\scripts\announcements-export.ts" --bundle --format=esm --platform=node --outfile=".\.tmp\announcements\announcements-export.mjs"
if (-not (Test-Path ".\.tmp\announcements\announcements-export.mjs")) { throw "Exporteur non compilé" }

node ".\.tmp\announcements\announcements-export.mjs" ".\.tmp\announcements\announcements-texts.json"
if (-not (Test-Path ".\.tmp\announcements\announcements-texts.json")) { throw "JSON non généré" }

$data = Get-Content ".\.tmp\announcements\announcements-texts.json" -Raw -Encoding UTF8 | ConvertFrom-Json
$inner = @($data.items | Where-Object { $_.role -eq "atos-inner" })
$inner | Group-Object voice, speed | Select-Object Count, Name | Format-Table
if ($inner.Count -eq 0) { throw "Aucun clip atos-inner dans le JSON" }
if (@($inner | Where-Object { $_.voice -ne "jf_alpha" }).Count -ne 0) { throw "La voix atos-inner n'est pas jf_alpha" }
if (@($inner | Where-Object { [double]$_.speed -ne 1.10 }).Count -ne 0) { throw "Le débit atos-inner n'est pas 1.10" }

Copy-Item ".\public\audio\announcements" ".\.tmp\announcements\audio-backup-atos-inner" -Recurse -Force
Copy-Item ".\src\data\pa-manifest.ts" ".\.tmp\announcements\pa-manifest.before-atos-inner.ts" -Force
$beforeHashes = @{}
$inner | ForEach-Object {
  $path = ".\public\audio\announcements\$($_.key).mp3"
  if (-not (Test-Path $path)) { throw "MP3 existant absent : $path" }
  $beforeHashes[$_.key] = (Get-FileHash $path -Algorithm SHA256).Hash
}

$batchSize = 10
$batchCount = [math]::Ceiling($inner.Count / $batchSize)

1..$batchCount | ForEach-Object {
  $batchNumber = $_
  Write-Host "`n=== Lot $batchNumber sur $batchCount ===" -ForegroundColor Cyan
  python ".\scripts\announcements-gen.py" ".\.tmp\announcements\announcements-texts.json" "C:\Temp\kokoro-v1.0\kokoro-v1.0.onnx" "C:\Temp\kokoro-v1.0\voices-v1.0.bin" ".\public\audio\announcements" ".\src\data\pa-manifest.ts" --reuse --force-role atos-inner --batch-size $batchSize --batch-number $batchNumber --jobs $batchSize
  if ($LASTEXITCODE -ne 0) { throw "La génération Kokoro a échoué au lot $batchNumber" }
  if ($batchNumber -lt $batchCount) { Read-Host "Lot terminé. Entrée pour lancer le suivant" }
}

$changed = @()
$inner | ForEach-Object {
  $path = ".\public\audio\announcements\$($_.key).mp3"
  if (-not (Test-Path $path)) { throw "MP3 généré absent : $path" }
  if ((Get-FileHash $path -Algorithm SHA256).Hash -ne $beforeHashes[$_.key]) {
    $changed += $_
  }
}
Write-Host "$($changed.Count) MP3 atos-inner modifiés sur $($inner.Count)"
if ($changed.Count -ne $inner.Count) { throw "Certains MP3 atos-inner n'ont pas été remplacés" }

$sample = $inner | Where-Object { $_.text -like "2番線、ドアが閉まります*" } | Select-Object -First 1
if ($null -eq $sample) { throw "Échantillon de fermeture des portes introuvable" }
Start-Process (Resolve-Path ".\public\audio\announcements\$($sample.key).mp3")
```

Écouter entièrement l'échantillon avant de continuer. Il doit employer le même
timbre que la rame, avec un débit très légèrement plus posé, et ne doit plus
avoir la voix aiguë `jf_tebukuro`. Puis valider et préparer le commit :

```powershell
npm test
npx tsc -b --pretty false
npm run lint
npm run build
git diff --check

# Ces deux fichiers temporaires sont suivis historiquement mais ne font pas
# partie de la regravure : revenir à leur version du commit.
git restore ".\.tmp\announcements\announcements-export.mjs" ".\.tmp\announcements\announcements-texts.json"

git status --short
git add ".\src\data\pa-manifest.ts" ".\public\audio\announcements"
git diff --cached --stat
git commit -m "Regenerate inner platform announcements with cabin voice"
git push
```

Avant `git commit`, le diff indexé doit contenir `src/data/pa-manifest.ts` et
les MP3 de `public/audio/announcements`, mais aucun fichier `.tmp`, modèle
ONNX, fichier `voices-v1.0.bin` ou environnement virtuel.

## 10. Vérifier et écouter les fichiers

La variable `$assistance` contient les six clés. Vérifier les fichiers :

```powershell
$assistance | ForEach-Object {
  $path = ".\public\audio\announcements\$($_.key).mp3"
  [PSCustomObject]@{
    Language = $_.lang
    Voice = $_.voice
    Key = $_.key
    Exists = Test-Path $path
    Bytes = if (Test-Path $path) { (Get-Item $path).Length } else { 0 }
    Path = $path
  }
} | Format-Table
```

Les six lignes doivent avoir `Exists = True` et une taille supérieure à zéro.

Écouter les six clips :

```powershell
$assistance | ForEach-Object {
  $path = Resolve-Path ".\public\audio\announcements\$($_.key).mp3"
  Write-Host "`n$($_.lang) / $($_.voice) / $($_.text)"
  Start-Process $path
  Read-Host "Entrée pour passer au clip suivant"
}
```

Contrôler les pauses japonaises, la prononciation de `救護`, l'absence de mots
coupés et la cohérence de volume avec les annonces existantes.

## 11. Valider le projet

```powershell
npm test
npx tsc -b --pretty false
npm run lint
npm run build
git diff --check
```

Tous les tests doivent passer. En particulier, la couverture audio vérifie le
manifeste, la présence des MP3, l'absence de fichiers orphelins et les durées.

## 12. Contrôler puis committer les résultats

```powershell
git status --short
```

Les changements attendus sont :

- six nouveaux fichiers dans `public/audio/announcements/` ;
- `src/data/pa-manifest.ts` modifié.

Ne pas committer `.tmp`, l'environnement Python ou les deux modèles Kokoro.

```powershell
git add .\src\data\pa-manifest.ts .\public\audio\announcements
git diff --cached --stat
git commit -m "Generate passenger assistance announcement voices"
git push
```

## Dépannage

### `Cannot find module ... announcements-export.mjs`

Le module compilé n'existe pas. Refaire l'étape 6 et exiger que :

```powershell
Test-Path ".\.tmp\announcements\announcements-export.mjs"
```

retourne `True` avant d'appeler Node.

### `no such file or directory: c:\mecab\mecabrc`

Le dictionnaire japonais manque ou une ancienne variable `MECABRC` force MeCab :

```powershell
python -m pip install --upgrade unidic-lite "fugashi[unidic-lite]"
Remove-Item Env:MECABRC -ErrorAction SilentlyContinue
python -c "from fugashi import Tagger; print(Tagger()('日本語'))"
```

### `ModuleNotFoundError: No module named 'click'`

spaCy est installé sans une de ses dépendances :

```powershell
python -m pip install --upgrade "click>=8.1,<9" spacy
python -c "import click, spacy; print('OK', spacy.__version__)"
python -m pip check
```

### Le générateur affiche toujours `6 à faire` après une erreur

C'est normal si l'erreur arrive pendant l'initialisation de Misaki : la boucle
d'écriture des MP3 n'a pas encore commencé. Corriger la dépendance puis relancer
la même commande avec `--reuse`.

### Le générateur affiche `Rien à synthétiser`

Les six clips existent déjà, ou le JSON n'a pas été produit depuis l'exporteur
à jour. Refaire les étapes 6 et 7 puis vérifier `$assistance.Count`.

## Bloc de diagnostic rapide

```powershell
& "$HOME\venvs\yamanote-kokoro\Scripts\Activate.ps1"
python -m pip check
python -c "import kokoro_onnx, lameenc, click, spacy, unidic_lite; print('Imports OK')"
python -c "from fugashi import Tagger; print(Tagger()('日本語'))"
python -c "from misaki import ja; print(ja.JAG2P()('お客様の救護を行っております。'))"
python -c "from misaki import en; g2p = en.G2P(trf=False, british=False); print(g2p('We are currently assisting a passenger.'))"
Test-Path ".\.tmp\announcements\announcements-export.mjs"
Test-Path ".\.tmp\announcements\announcements-texts.json"
Test-Path "C:\Temp\kokoro-v1.0\kokoro-v1.0.onnx"
Test-Path "C:\Temp\kokoro-v1.0\voices-v1.0.bin"
```

Si toutes ces commandes réussissent, la commande de génération de l'étape 9
dispose de tout ce dont elle a besoin.

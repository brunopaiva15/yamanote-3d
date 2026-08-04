# Réglage des voix d'après un enregistrement réel

Mesures d'un enregistrement fait à bord d'une rame de la Yamanote (17 min,
44,1 kHz, peu de monde) comparées aux clips gravés dans
`public/audio/announcements`. Objectif : savoir *quoi* corriger avant de
toucher aux réglages de `scripts/announcements-export.ts`.

Outils : `scripts/voice-lab/` (voir plus bas). Les deux côtés passent par le
même module de mesure — comparer une hauteur relevée d'un côté avec un
détecteur et de l'autre avec un autre ne dirait rien.

## Ce que dit l'enregistrement

292 segments de parole retenus (les carillons, mélodies et avertisseurs sont
écartés : trop voisés, trop stables en hauteur, trop pauvres en attaques).

| Mesure | Relevé |
| --- | --- |
| F0 médiane par segment | p10 196 · p25 214 · **méd 227** · p75 253 · p90 265 Hz |
| Modes de la distribution | **224 Hz** et **256 Hz**, rien au-dessous de 180 |
| Plancher / sommet intra-segment | 165 Hz / 298 Hz |
| Étendue d'intonation (p5–p95) | **11,1 demi-tons** (IQR 5,4) |
| Durée d'un segment de parole | **1,63 s** (p25 0,89 · p75 2,41) |
| Débit | **6,16 pics d'enveloppe / s** de parole |
| Silences internes | **bimodaux : 0,32 s (n=95) et 1,06 s (n=103)** |

Le point le plus net est le dernier. Les silences ne sont pas répartis
continûment : il y a un mode court autour de 0,32 s, un mode long autour de
1,06 s, et presque rien entre 0,55 et 0,90 s.

## Ce que disent les clips

| Canal | Voix | F0 | Étendue | Segment | Débit |
| --- | --- | --- | --- | --- | --- |
| *Enregistrement (cible)* | — | *214–253* | *11,1 st* | *1,63 s* | *6,16* |
| Japonais · sono de la rame | jf_alpha | **283** | **8,4 st** | **0,90 s** | 6,02 |
| Japonais · quai 内回り | jf_alpha | **290** | **8,0 st** | **0,96 s** | 6,86 |
| Japonais · quai 外回り | jm_kumo | **92** | 10,9 st | **1,00 s** | **7,57** |
| Japonais · agent au micro | jf_nezumi | 243 | **6,3 st** | **0,88 s** | **7,30** |
| Anglais · sono de la rame | af_heart | 201 | 8,1 st | **1,19 s** | **6,90** |
| Anglais · quai | am_michael | **119** | 10,7 st | 1,89 s | 5,77 |

En gras : hors de la plage relevée dans l'enregistrement.

## Les quatre écarts

1. **Registre.** La voix japonaise de bord sort à 283 Hz, soit **4,0 demi-tons
   au-dessus du mode principal** (224 Hz) et 2,2 au-dessus du second (256 Hz).
   Le constat ne dépend pas de savoir lequel des deux modes est le japonais :
   283 Hz est au-dessus des deux.
2. **Étendue d'intonation.** 8,4 demi-tons contre 11,1 : la voix module moins
   que l'original. jf_alpha est, des cinq voix japonaises de Kokoro, l'une des
   plus plates (5,8 st sur la phrase témoin, contre 11,2 pour jf_tebukuro).
3. **Découpe.** Un morceau de parole dure 0,90 s dans les clips contre 1,63 s
   dans l'enregistrement : l'annonce est hachée près de deux fois trop souvent.
   C'est une conséquence directe du texte, qui n'écrit plus que des 。 — le
   générateur coupe donc à chaque groupe et insère un silence partout.
4. **Cadence.** Le générateur pose un silence unique de 0,62 s, c'est-à-dire
   pile dans le creux entre les deux modes réels. Ni la respiration courte ni
   la vraie pause de phrase.

Et une chose qui va déjà : **le débit intra-phrase du japonais** (6,02 contre
6,16). Il ne faut pas toucher à `speed` de ce côté — l'impression de lenteur
vient des silences, pas de l'articulation. L'anglais, lui, parle 12 % trop vite
(6,90 contre 6,16) ; c'est son écart principal, son registre n'étant qu'à
1,9 demi-ton du mode bas.

## Ce que l'analyse ne dit pas

**Les voix de quai ne sont pas jugeables sur cet enregistrement.** Il est pris
*dans la rame* : la sonorisation du quai n'y entre que par les portes ouvertes,
filtrée et lointaine. Les 92 Hz de `jm_kumo` et les 119 Hz d'`am_michael` sont
très au-dessous de tout ce qu'on entend ici (plancher mesuré : 165 Hz), mais
il faudrait une prise faite *sur le quai* pour en conclure quoi que ce soit.

**Le japonais et l'anglais n'ont pas pu être séparés automatiquement.** La
séparation propre demandait un modèle de reconnaissance vocale, dont l'hôte
était bloqué par la politique de sortie réseau de la session. Trois approches
sans transcription ont été essayées et ont échoué à départager les deux voix de
bord — regroupement par timbre (MFCC), rythme de Ramus (%V / ΔC), spectre de
modulation de l'enveloppe : aucune ne produit des blocs qui alternent
régulièrement d'une langue à l'autre, ce qu'on attendrait puisque chaque
annonce est dite en japonais puis en anglais. Les deux modes (224 et 256 Hz)
sont donc deux **registres constatés**, sans étiquette de langue. C'est à
l'écoute des extraits que se décide lequel viser pour quelle langue — d'où le
banc A/B.

## Les leviers, et ce qu'ils font vraiment

Les cinq voix japonaises de Kokoro, sur la phrase témoin
「次は。渋谷。渋谷。お出口は。右側です。」 à vitesse 1,15 :

| Voix | F0 | Étendue |
| --- | --- | --- |
| jf_alpha *(actuelle)* | 300 Hz | 5,8 st |
| jf_gongitsune | 289 Hz | 9,1 st |
| jf_nezumi | 242 Hz | 5,1 st |
| **jf_tebukuro** | **220 Hz** | **11,2 st** |
| jm_kumo | 101 Hz | 11,1 st |

`jf_tebukuro` tombe sur les deux cibles à la fois (224 Hz de mode, 11,1 st
d'étendue) sans aucune retouche. Le commentaire de `announcements-export.ts`
l'écarte pour son « registre très aigu » ; la mesure dit l'inverse — c'est la
plus grave des quatre voix féminines, de 6 demi-tons sous jf_alpha. À vérifier
à l'oreille : un timbre peut sonner aigu par son spectre sans l'être par sa
fondamentale.

**Mélanger deux voix ne sert pas à régler la hauteur.** Le mélange n'est pas
linéaire : moitié jf_alpha (300 Hz) moitié jf_tebukuro (220 Hz) ressort à
289 Hz, plus haut que les deux. Le mélange sert le timbre, pas le registre.

**Transposer se fait après synthèse, jamais par la vitesse.** Rattraper la
durée en accélérant Kokoro paraît élégant — synthétiser 19 % plus vite puis
rééchantillonner vers le bas rend exactement la durée d'origine — mais au-delà
de ~1,2 Kokoro aplatit son intonation : l'étendue tombe de 12 à 6 demi-tons.
On perdrait en mélodie ce qu'on gagne en registre. `atelier.pitch_shift` fait
donc rééchantillonnage puis recalage WSOLA, à vitesse Kokoro inchangée. Effet
de bord assumé : les formants descendent avec la fondamentale, ce qui donne une
voix plus pleine et moins juvénile — plutôt souhaitable ici.

## Ce qui reste à décider

Le banc d'écoute (`scripts/voice-lab/banc.py`) grave six variantes japonaises
et cinq anglaises de la même annonce, chacune ne changeant qu'une chose par
rapport à la précédente. Rien n'est appliqué au jeu tant que le choix n'est pas
fait : les paramètres retenus se reportent ensuite dans `CABIN_VOICE` /
`STATION_VOICE` (`scripts/announcements-export.ts`) et, pour la cadence, dans
`JA_COMMA_GAP_S` / `JA_SENTENCE_GAP_S` et `split_ja_segments`
(`scripts/announcements-gen.py`).

La correction de cadence demande en plus une décision de **texte** : pour que
deux silences différents existent, il faut que le texte les distingue. Les
annonces de bord n'écrivent plus que des 。 (choix documenté dans le README) ;
rétablir le 、 pour la respiration courte, ou faire porter la distinction au
générateur, est le point à trancher.

## Utilisation

```bash
pip install numpy scipy soundfile lameenc kokoro-onnx "misaki[en]" \
    cutlet fugashi mojimoji jaconv unidic-lite pyopenjtalk

# 1. Les textes réellement joués (comme pour la gravure)
npx esbuild scripts/announcements-export.ts --bundle --format=esm \
    --platform=node --outfile=/tmp/export.mjs
node /tmp/export.mjs /tmp/textes.json

# 2. Le tableau comparatif
python scripts/voice-lab/rapport.py enregistrement.mp3 /tmp/textes.json \
    public/audio/announcements --json /tmp/mesures.json

# 3. Le banc d'écoute (page HTML autonome, MP3 inclus)
python scripts/voice-lab/banc.py enregistrement.mp3 /tmp/mesures.json \
    kokoro-v1.0.onnx voices-v1.0.bin /tmp/banc
```

| Fichier | Rôle |
| --- | --- |
| `scripts/voice-lab/mesures.py` | segmentation, F0 (YIN + correction d'octave), spectre, débit |
| `scripts/voice-lab/atelier.py` | recettes de voix, mélange, transposition WSOLA, synthèse |
| `scripts/voice-lab/rapport.py` | le tableau enregistrement / clips |
| `scripts/voice-lab/banc.py` | génère les variantes et la page A/B |
| `scripts/voice-lab/banc.tmpl.html` | gabarit de la page |

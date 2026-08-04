# Recréer la voix par description (ElevenLabs Voice Design)

Les descriptions ci-dessous sont dérivées des mesures faites sur
l'enregistrement réel — pas d'une impression d'écoute. Chaque adjectif est
justifié par un chiffre, ce qui permet de le corriger si le rendu s'écarte.

**On décrit un caractère de voix, on ne clone personne.** L'annonce réelle est
enregistrée par une comédienne identifiable ; sa voix lui appartient, et
l'enregistrement appartient à JR East. Voice Design part d'une description en
mots et fabrique une voix nouvelle : c'est la voie légitime, et elle donne le
même *type* de voix sans reprendre l'identité de qui que ce soit.

## Ce que disent les mesures

Relevé sur 111 secondes de voix japonaise isolée (30 annonces extraites par
reconnaissance de jetons, voir `scripts/voice-lab/jetons.py`).

| Mesure | Relevé | Traduction en description |
| --- | --- | --- |
| F0 médiane | 237 Hz (p10 209 · p90 258) | femme adulte, registre *medium-high* |
| Étendue d'intonation | 10,6 demi-tons | contrôlée : ni monocorde, ni expressive |
| Centroïde spectral | 912 Hz | **bright, clear, forward** |
| Pente spectrale | −23,5 dB/décade | timbre net, pas sourd ni feutré |
| Débit | 6,86 pics/s | régulier, soutenu, jamais traînant |
| Durées de phrase | 0,51 / 0,67 / 1,57 s | groupes dits d'un seul trait |
| Silences internes | 0,32 à 0,43 s | brefs — aucune pause longue |

Une mesure a été écartée : le rapport harmonique/bruit (6,6 dB) ne décrit pas
la voix mais le bruit de roulement de la rame, la prise étant faite à bord. En
déduire une voix « soufflée » serait une erreur.

## Précautions propres à Voice Design

- **Ne jamais décrire la sonorisation.** Les mots « PA », « speaker »,
  « reverb », « echo », « phone », « announcement system » dégradent le rendu
  d'après le guide d'ElevenLabs — et ils sont ici inutiles : `audioEngine`
  applique lui-même le timbre du diffuseur de plafond et la réverbération de
  cabine. Ce qu'il faut demander est une voix **studio, propre et sèche**.
- **Ne pas écrire « accent » pour parler d'intonation.** Le mot déclenche une
  dérive de dialecte. On dit *intonation*, *emphasis*, *delivery*.
- **Préciser la langue et la variante dès la première phrase**, sinon la voix
  dérive.

## La voix principale — japonais de bord

```
Native Japanese, standard Tokyo Japanese (標準語), no regional dialect.
Female, 35-45. Studio quality.
Persona: professional railway announcer. Emotion: calm, warm, composed.
Bright, clear, forward-placed timbre with a medium-high pitch and a faint smile
in the voice; crisp articulation, no breathiness, no huskiness. Delivers at a
steady, even pace with gentle controlled intonation that rises slightly on
place names and settles at the end of each phrase, never dramatic and never
flat.
```

**Texte de prévisualisation** — un texte long et cohérent avec la description
donne un rendu plus stable qu'une phrase courte :

```
本日も、山手線をご利用くださいまして、ありがとうございます。
この電車は、山手線内回り、上野・池袋方面行きです。
次は、渋谷、渋谷。お出口は、右側です。
```

**Guidance Scale : 45–55 %.** Le guide recommande une valeur haute quand la
justesse du timbre prime sur la liberté du modèle, ce qui est exactement le cas
ici. Si le rendu devient métallique, redescendre vers 35 %.

## Les cinq autres rôles

Même préambule de langue et même consigne de qualité ; seules changent la
persona, l'émotion et la phrase de timbre.

**Quai, sens intérieur (内回り)** — un cran plus posé que la rame : dehors, sous
une verrière, une annonce trop rapide ne s'attrape pas.

```
Native Japanese, standard Tokyo Japanese (標準語), no regional dialect.
Female, 35-45. Studio quality.
Persona: station platform announcer. Emotion: calm, clear, impersonal.
Bright and precise timbre, medium-high pitch, with very even delivery and
deliberate pacing, slightly slower than conversational, each phrase separated
cleanly and articulated with careful precision.
```

**Quai, sens extérieur (外回り)** — une voix d'homme, et c'est délibéré : sur un
îlot central, les deux quais annoncent le même script à quelques secondes
d'écart, et la voix est la seule chose qui dise lequel vient de parler.

```
Native Japanese, standard Tokyo Japanese (標準語), no regional dialect.
Male, 40-50. Studio quality.
Persona: station platform announcer. Emotion: calm, steady, impersonal.
Clear baritone with a smooth, even timbre and no gravel, medium-low pitch,
delivering at a deliberate measured pace with flat controlled intonation and
crisp consonants.
```

**Agent de quai au micro** — c'est une PERSONNE qui parle en direct, pas un
automate : on lui laisse la variation qu'on refuse aux autres.

```
Native Japanese, standard Tokyo Japanese (標準語), no regional dialect.
Female, 30-40. Good quality.
Persona: station staff speaking live. Emotion: brisk, helpful, natural.
Natural conversational timbre, medium pitch, speaking at a quick working pace
with looser, more varied intonation than a recorded announcement, as if
improvising into a handheld microphone rather than reading a script.
```

**Anglais de bord** — l'anglais des annonces JR est américain, dit lentement et
très détaché, avec les noms de gare prononcés à la japonaise.

```
Native American English, neutral General American. Female, 35-45.
Studio quality.
Persona: professional railway announcer. Emotion: calm, warm, welcoming.
Bright, clear timbre with a medium pitch, speaking slowly and very distinctly
with generous separation between phrases; Japanese place names pronounced with
Japanese vowels rather than anglicised.
```

**Anglais de quai**

```
Native American English, neutral General American. Male, 40-50.
Studio quality.
Persona: station platform announcer. Emotion: calm, measured, impersonal.
Even, clear timbre with a medium-low pitch, delivering slowly and deliberately
with flat controlled intonation and very clear enunciation.
```

## Corriger : exporter, mesurer, retoucher UN mot

« Ça ne ressemble pas » ne se corrige pas — il faut savoir sur quel axe ça
s'écarte. D'où la boucle : exporter l'aperçu de la voix candidate en MP3, puis

```bash
python scripts/voice-lab/verdict.py essai.mp3
```

qui compare aux relevés de la voix réelle et sort la liste des retouches,
la plus grosse dérive d'abord. **Une seule à la fois** : deux mots changés
ensemble, et on ne sait plus lequel a agi.

Le script mesure le candidat par le même chemin que la référence — même
découpage en segments, même détecteur de hauteur, même définition du débit.
Comparer à des chiffres relevés ailleurs, avec d'autres outils, ne dirait rien.

## La limite de l'exercice

Voice Design **fabrique une voix, il n'en retrouve pas une**. Un candidat
conforme sur les cinq axes peut rester reconnaissablement quelqu'un d'autre :
la ressemblance perçue tient surtout à l'enveloppe spectrale fine, que cinq
nombres ne résument pas. `verdict.py` le dit lui-même quand tout est dans la
tolérance, plutôt que de laisser chercher un meilleur adjectif qui n'existe pas.

À ce stade il ne reste que deux issues honnêtes : retenir la voix obtenue pour
ce qu'elle est, ou passer par une voix clonée depuis sa propre prise — avec la
réserve déjà posée, l'identité vocale de la comédienne ne nous appartenant pas.

Deux réglages échappent de toute façon à la description : ElevenLabs n'expose
ni la hauteur ni la vitesse. Les silences, eux, ne dépendent pas de la voix
choisie — `scripts/voice-lab/elevenlabs.py` les pose en balises `<break>` aux
durées mesurées.

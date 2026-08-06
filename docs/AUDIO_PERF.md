# Le son ne doit jamais craquer

Ce document décrit ce qui a été fait pour qu'une machine modeste entende la
ligne Yamanote **sans un seul craquement**, et pourquoi chaque pièce est là.

## Le défaut

Le son de ce jeu est synthétisé, presque entièrement. Le graphe Web Audio
compte une trentaine de générateurs, une vingtaine de filtres, **dix-neuf
sources spatialisées** et **deux réverbérations à convolution**. Tout cela vit
dans le fil de rendu audio du navigateur : un fil temps réel qui doit remplir
son tampon toutes les deux ou trois millisecondes, et qui n'a pas le droit
d'être en retard une seule fois.

Quand il l'est, on ne perd pas « un peu de qualité » : le tampon sort vide. Cela
s'entend comme un craquement, un hoquet, un grésillement - et c'est le pire
défaut qu'un jeu sonore puisse avoir, parce que ce bruit-là ne ressemble à rien
de ce que le monde représenté pourrait produire. Une annonce déformée reste une
annonce ; un craquement, lui, dit seulement que la machine peine.

Deux causes, distinctes, et il fallait traiter les deux.

1. **Le fil audio n'a pas le temps.** Il calcule en permanence des choses que
   personne n'écoute.
2. **Le fil principal programme en retard.** Les sons sont posés sur l'horloge
   audio depuis la boucle d'images ; sur une machine lente, l'instant demandé
   est déjà passé quand le navigateur le reçoit, et l'attaque tombe où elle
   peut. Ce n'est plus du grésillement, c'est du bégaiement.

## Ce qui a été fait

### 1. Ne calculer que ce qui s'entend (`systems/audioGate`)

C'est le gros du gain, et il ne change **rien** à ce qu'on entend.

Un graphe Web Audio ne coûte pas ce qu'on en entend, il coûte ce qui y est
branché. Un bruit rose passé dans un gain à zéro est calculé échantillon par
échantillon ; un panoramique HRTF convolue deux réponses d'oreille même quand sa
source est muette ; une réverbération à queue de 2,6 s fait sa transformée sur du
silence sans se plaindre. Or la plupart de ces machines ne servent que par
intermittence :

| Ligne | Ce qui pend derrière | Quand elle sert vraiment |
| --- | --- | --- |
| sono du wagon | 8 panoramiques, compression, souffle de ligne | deux annonces et deux carillons par arrêt |
| sono du quai | 6 panoramiques | à quai seulement |
| avertisseurs des baies | 4 panoramiques, deux réflexions | ~8 s par arrêt |
| réverbération du lieu | une convolution de 2,6 s | quand il y a un lieu |
| train qui traverse | 2 bruits, 1 panoramique | quelques secondes par tronçon |
| pluie | 2 bruits | les jours de pluie |
| glissières | 2 bruits | 3 s par arrêt |
| onduleur, freins, convertisseur | 3 générateurs | en marche, en freinage, aux coupures |

La règle de Web Audio qui rend le remède simple : **un nœud qui n'a plus de
chemin vers la sortie n'est pas rendu**. Débrancher une arête éteint donc tout
ce qui est derrière, sans rien détruire ni reconstruire.

Trois précautions rendent la chose sûre - un robinet fermé au mauvais moment ne
fait pas un craquement, il fait une **annonce muette**, et ce serait pire :

- on ouvre **avant** de jouer : chaque déclencheur réveille sa ligne au moment
  où il programme son premier son ;
- une lecture en cours tient sa ligne par un **jeton** (`acquire` / `release`) :
  un clip de vingt-cinq secondes la tient vingt-cinq secondes, sans que
  personne ait à deviner sa durée ;
- on ne ferme qu'après la **queue** : le temps que la dernière rampe retombe et
  que la réverbération finisse de mourir.

Deux pièges rencontrés en chemin, tous deux invisibles à la relecture et
trouvés à l'oreille (voir plus bas) :

- **un générateur débranché meurt.** Le navigateur finit par clore un
  générateur de bruit qu'il ne rend plus, et le rebrancher ne le ressuscite
  pas : le nœud est là, son gain est bon, son arête est branchée, et il ne sort
  rien. La pluie, l'ambiance de gare et le train qui traverse s'étaient éteints
  pour de bon après un premier passage. Les générateurs sont donc **arrêtés
  avec leur ligne et relancés avec elle** ;
- **on coupe une réverbération par sa sortie, jamais par son entrée.** Un nœud
  est rendu tant qu'il lui reste un chemin vers la sortie du graphe : une
  convolution privée d'entrée continue de convoluer du silence, au même prix.

### 2. Ne pas réécrire ce qui n'a pas changé

Poser la position de l'auditeur n'est pas une affectation : chacune des
dix-neuf sources spatialisées doit recalculer son azimut, son élévation, son
atténuation - et, en HRTF, la paire de réponses d'oreille à convoluer. Neuf
écritures par image, ce sont dix-neuf recalculs par image, y compris quand le
joueur est **assis et immobile**, ce qui est l'essentiel du temps de ce jeu-ci.

La pose de l'auditeur et les dix positions de diffuseurs ne sont donc réécrites
que lorsqu'elles bougent (un millimètre pour la tête, un centimètre pour un
diffuseur). Cela s'ajoute aux mémoires de publication déjà en place pour les
niveaux de la rame, les portes, l'ambiance et la météo.

### 3. Programmer assez à l'avance (`lookAhead`)

`Tone.now()` est en avance sur l'horloge du contexte. Si une image dure deux
cents millisecondes et que l'avance n'en couvre que cent, tout ce que l'image
programme arrive en retard. L'avance suit donc le palier (0,1 → 0,2 → 0,3 s), et
la boucle de l'avertisseur de fermeture des baies prend en plus **la durée
d'image mesurée** comme avance minimale : sur une machine rapide elle ne change
rien, sur une machine lente elle empêche l'avertisseur de boiter.

### 4. Un tampon de sortie à la taille de la machine (`systems/audioLoad`)

C'est le réglage le plus efficace du lot. Un tampon « interactive » fait cent
vingt-huit échantillons : moins de trois millisecondes pour tout calculer, et le
moindre à-coup fait rater l'échéance. Un tampon « playback » en fait dix à vingt
fois plus.

Ce qu'on paie, c'est le délai entre un geste et le son qu'il produit. Ici,
presque rien n'est joué par le joueur (un bouton de distributeur, un portillon)
et tout le reste est du monde qui tourne tout seul : vingt millisecondes de plus
sur un ピッ de portillon ne s'entendent pas.

**Ce réglage ne se reprend pas** : il est coulé dans le contexte à sa création.
D'où le pari d'ouverture, pris sur ce que la machine annonce (cœurs, mémoire,
téléphone), et la mémorisation du palier atteint - une machine qui a grésillé
une fois ouvrira son prochain contexte avec le grand tampon, sans avoir à
regrésiller pour le mériter.

### 5. Trois paliers, et une mesure qui décide

| | `full` | `reduced` | `minimal` |
| --- | --- | --- | --- |
| panoramique | HRTF | puissance constante | puissance constante |
| réverbérations | les deux | les deux | aucune |
| tampon de sortie | interactive | playback | playback |
| avance de programmation | 0,1 s | 0,2 s | 0,3 s |
| bruitages de foule | sans limite | 14/s | 7/s |
| PCM gardé en mémoire | 24 Mo | 14 Mo | 8 Mo |

**Ce qui ne change à aucun palier** : la partition, les niveaux, les durées, les
voix, ce qui est dit et quand, et la **direction** de chaque son. Un palier bas
n'est pas une version pauvre de la ligne, c'est la même ligne dans une pièce
moins réverbérante.

La descente est décidée par une mesure, pas par une intuition. Chrome sait dire
combien de temps son fil audio a passé à calculer et combien de fois il a raté
son tampon (`AudioContext.renderCapacity`) : on ne devine plus le grésillement,
on le **lit**, et on descend d'un cran dès qu'il apparaît - immédiatement s'il
est franc, au deuxième relevé sinon (un hoquet isolé est un chargement de
texture, pas une machine lente). Là où cette mesure n'existe pas (Firefox,
Safari), la cadence d'images sert de témoin.

On ne remonte jamais tout seul en cours de partie : un moteur qui oscillerait
entre deux paliers ferait entendre ses hésitations.

Le joueur peut trancher lui-même depuis l'écran de démarrage (« Qualité
sonore »). Un choix explicite n'est jamais contredit par la mesure : qui demande
la spatialisation complète la garde.

## Vérifier

```bash
npm test                       # la logique : robinets, paliers, mesure
node scripts/audio-probe.mjs   # le son réel, dans un vrai navigateur
```

Le second est le seul qui prouve quelque chose sur les robinets. Aucune
relecture de code ne démontre qu'une ligne débranchée se rebranche : il faut un
vrai contexte audio et une mesure de ce qui **sort**. Pour chaque ligne du
graphe, `/audio-probe.html` laisse le moteur au repos jusqu'à ce que le robinet
se ferme, vérifie qu'il s'est bien fermé, déclenche ce que la ligne porte, et
mesure le niveau en sortie de mixage. La tournée est faite deux fois, la seconde
au palier le plus sûr - le panoramique et les réverbérations changent alors sur
un graphe vivant, et rien ne doit se taire.

C'est ce banc d'essai qui a trouvé les deux pièges cités plus haut, tous deux
silencieux et invisibles autrement.

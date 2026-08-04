# Références visuelles — dalle LCD au-dessus des portes

Dossier de travail pour la refonte de l'écran **gauche** des doubles écrans
E235 (la トレインチャンネル de JR East). Rien de ce qui est déposé ici n'est
embarqué dans le jeu : ce sont des pièces de référence qu'on regarde pour caler
une grammaire, exactement comme les photos de l'afficheur réel ont servi à
`lcd-probe.html` pour l'écran de droite.

Ce que le rendu procédural en tire, ce sont des **règles** — proportions,
rythme, hiérarchie, habillage — jamais un décalque. Aucun logo, aucune marque,
aucun visuel d'annonceur ne sera reproduit ; `src/data/ads.ts` continue de ne
contenir que des slogans inventés.

## Pourquoi ce dossier existe

`drawAdInto` (`src/textures/procedural.ts`) sert aujourd'hui les cinq supports
avec une seule grammaire, celle de l'imprimé : accroche, titre cerné, corps,
chiffre, période, mentions ※, bandeau de marque. Elle est juste pour le
nakazuri et le caisson de quai. Elle est fausse pour la dalle LCD, qui n'est
pas une affiche mais une diffusion : muette, plein cadre, sous-titrée, et
surtout **temporelle** — un spot, c'est plusieurs plans qui s'enchaînent, là où
un seed ne produit aujourd'hui qu'une image fixe.

Les clichés ci-dessous sont ce qui manque pour trancher chaque point.

## Ce dont j'ai besoin, par ordre d'utilité

### 1. `lcd-cadre-*.jpg` — la dalle entière, de face

Un plan frontal net de l'écran gauche en pleine diffusion, cadré sur la dalle
seule.

*Tranche :* les proportions réelles de l'image, la présence ou non d'un bandeau
permanent, l'épaisseur des marges internes, la couleur du noir de la dalle.

### 2. `lcd-suite-*.jpg` — le même spot à plusieurs instants

Trois ou quatre captures **du même spot**, prises à quelques secondes
d'intervalle. C'est la pièce la plus importante du lot : c'est la seule qui
dise comment un contenu se déroule.

*Tranche :* le nombre de plans, leur durée, ce qui bouge entre deux, la façon
dont le sous-titre se renouvelle, le type de transition.

### 3. `lcd-soustitre-*.jpg` — un cartouche de sous-titre lisible

Un gros plan où l'on distingue les caractères.

*Tranche :* la fonte et sa graisse, la couleur, le fond du cartouche (aplat,
voile, contour), la position dans le cadre, la taille relative.

### 4. `lcd-rubrique-*.jpg` — un contenu qui n'est pas une publicité

Manchette d'actualité, météo, quiz, 豆知識 — n'importe quelle rubrique de la
boucle.

*Tranche :* l'habillage de rubrique, le bandeau de titre, le code couleur qui
sépare les rubriques entre elles. C'est ce qui empêchera la boucle de n'être
qu'une enfilade de réclames.

### 5. `lcd-transition-*.jpg` — l'instant du changement

Une capture prise pendant le passage d'un contenu au suivant.

*Tranche :* fondu au noir, fondu enchaîné, volet, coupe franche.

### 6. `lcd-eteint-*.jpg` — la dalle hors service

À la coupure d'alimentation, ou au démarrage.

*Tranche :* ce que `LCD_CUTOFF` doit peindre, aujourd'hui traité au jugé.

### 7. `lcd-contexte-*.jpg` — les deux écrans ensemble

Un plan large montrant l'écran gauche et l'écran de ligne côte à côte
au-dessus d'une porte.

*Tranche :* l'échelle relative des deux dalles et l'écart entre elles, qu'on
n'a jamais vérifié autrement qu'au jugé.

## Conventions

- **Nommage :** `lcd-<sujet>-<numéro>.jpg`, en suivant les préfixes ci-dessus.
  Pour une suite, numéroter dans l'ordre chronologique : `lcd-suite-1.jpg`,
  `lcd-suite-2.jpg`…
- **Format :** JPEG ou PNG. Inutile de dépasser ~2000 px de large ; en dessous
  de 800 px, le sous-titrage devient illisible et la pièce ne tranche plus
  rien.
- **Cadrage :** de face autant que possible. Une photo très oblique fausse les
  proportions, qui sont précisément ce qu'on cherche à relever.
- **Quantité :** une bonne photo par rubrique vaut mieux que dix floues. Si
  tu n'as que les points 1 à 3, c'est déjà de quoi commencer.

## Ce qui se passe ensuite

Dès que les fichiers sont là, je :

1. sors la dalle LCD de `drawAdInto` vers son propre moteur, avec un modèle de
   séquence — un spot devient une liste de plans, pas une image ;
2. ajoute la vue LCD à `ad-probe.html` et une capture d'échantillon à
   `scripts/ad-shots.mjs`, pour qu'on juge sur planche à chaque itération ;
3. cale l'habillage sur les références, point par point.

La grammaire d'imprimé des quatre supports papier reste en place ; elle sera
affinée au passage, pas réécrite.

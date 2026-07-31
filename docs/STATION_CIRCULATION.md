# Circulation hors quai

## Audit et risques

Le repère historique `platform` est le repère fixe de la gare; `car` suit la
rame. `platformIndex` désigne la gare encore physiquement présente pendant que
`index` peut déjà désigner l'arrêt suivant. `platformSlide` déplace la gare
quand le joueur est dans la rame, tandis que `trainZ` déplace la rame lorsque
le joueur est resté dans la gare. Le quai est construit vers `+x`, puis le
groupe complet est retourné de π selon le profil de voie actif.

Les risques identifiés avant migration étaient : deux côtés de porte utilisés
pendant un départ, duplication des cotes de trémie, raccords visuels sans sol
praticable, et rectangles de hall recouvrant le seuil de rame. Le dernier cas
est couvert par un test de non-régression des portes fermées.

## Sources de vérité

* `stationLayouts.ts` conserve la typologie, l'élévation, la couverture et
  l'ambiance du quai.
* `platforms.ts` conserve voie, sens, côté d'ouverture, PSD et alternatives.
* `stationCirculation.ts` ne décrit que les niveaux hors quai, surfaces,
  raccords, obstacles, portillons, sorties et services.

## Statut des données

La matrice de voies et de côtés fournie pour 2026 est traitée comme confirmée.
Les dimensions et positions fines des halls sont **estimées** : ce sont des
simplifications de gameplay crédibles, pas des relevés architecturaux. Les
gares signature gardent une famille de base et un `specialOverride`; celui-ci
n'affirme pas reproduire un plan réel au centimètre.

## Modèle jouable

Chaque gare possède une surface de quai, au moins une surface de hall, un
raccord continu, un ascenseur accessible, une ligne de portillons bloquante et
une porte de sortie constituant une limite visuelle. Ueno possède simultanément
un raccord descendant et un raccord montant. Mejiro utilise un niveau `bridge`
et Yurakucho un `lowerConcourse`. La zone joueur (`car`, `platform`, `access`,
`concourse`) est indépendante de son repère (`car`, `platform`).

## Limites connues

Les ascenseurs sont reliés aux deux surfaces dans les données et rendus comme
accès, mais leur interaction cabine reste une itération ultérieure. Les halls
génériques emploient une géométrie procédurale légère; les correspondances et
rues complètes restent volontairement derrière les limites visuelles.

// Les gares réellement branchées sur leur relevé.
//
// Ce fichier ne contient rien, et c'est tout son intérêt.
//
// `data/stationConcourseBuild` sait compiler un profil en réseau de pièces, et
// `systems/stationPlacement` lit ce réseau pour tout le monde. Il reste à dire
// QUELLES gares y passent — et la réponse est : aucune, pour l'instant. Un
// profil compilé n'a encore ni mobilier, ni archétype de rendu, ni
// signalétique : l'échanger contre le hall meublé serait un recul. Les phases
// 20 à 24 les ajouteront une par une, quand il y aura de quoi les habiller.
//
// POURQUOI UN FICHIER À PART, ET PAS UN `Set` DANS LE COMPILATEUR : parce que
// citer `data/stationConcourseProfiles` fait entrer les cent trente kio du
// dossier dans le paquet du jeu. Tant que la liste est vide, ce module
// n'importe rien, l'élagage fait son travail, et le joueur ne télécharge pas un
// relevé que personne ne lit. Le jour où la première gare est branchée, le
// dossier arrive — et il arrive parce qu'il SERT, ce qui est la seule bonne
// raison.
//
// Pour brancher une gare, il suffira de deux lignes :
//
//   import { profileFor } from './stationConcourseProfiles.ts';
//   const WIRED = new Map([[25, profileFor(25)]]);   // JY26 Takanawa Gateway

import { profileFor } from './stationConcourseProfiles.ts';
import type { StationConcourseProfile } from './stationConcourseTypes.ts';

/**
 * LES PETITES GARES D'ABORD (phase 20).
 *
 * Huit gares dont le relevé tient en un ou deux halls, et dont le hall
 * générique était déjà proche : c'est là qu'on valide le système avec le moins
 * à perdre. Elles apportent pourtant chacune quelque chose qu'aucun hall
 * générique ne produirait — deux halls indépendants à cent mètres l'un de
 * l'autre à Uguisudani, un dessous de viaduc à Kanda, une tranchée à Sugamo.
 */
const SMALL = [1, 5, 7, 9, 10, 13, 15, 17];

/**
 * LES GARES MOYENNES (phase 21).
 *
 * Quatorze gares que le hall générique décrivait mal sans qu'on puisse dire
 * qu'il les trahissait : deux ou trois contrôles, un demi-niveau, une galerie
 * qui donne l'échelle, un chantier. Elles ne demandent pas de vocabulaire
 * nouveau — c'est ce qui les distingue des six signatures — mais elles
 * demandent que tout ce qui précède tienne à la fois.
 */
const MEDIUM = [2, 8, 11, 14, 20, 21, 22, 23, 26, 27, 28, 29];

/**
 * UUCUNE GARE N'ATTEND PLUS.
 *
 * Okachimachi a été la dernière, et pour une raison qui valait d'être écrite :
 * on cherchait à RACCOURCIR la première volée, alors qu'il fallait déplacer le
 * demi-niveau. Sa mezzanine était posée « à mi-hauteur », soit −1,84 m —
 * au-dessus du palier de mi-étage où la volée de quai s'arrête — et aucune
 * trémie n'y menait. Or aucun plan de gare japonais ne cote une altitude : ce
 * « à mi-hauteur » était une composition, pas un relevé.
 *
 * Le palier existe déjà, à −2,63 m : quinze contremarches sous le quai, six
 * au-dessus du 1F, c'est-à-dire exactement la seconde volée ordinaire. Le M2F
 * d'Okachimachi est ce palier-là élargi en plancher, et l'escalier qui en
 * repart est celui que les trente gares ont déjà. Il n'y avait pas d'ouvrage à
 * inventer — il y avait une cote composée à remettre là où l'ouvrage tombe.
 */
const DEFERRED: number[] = [];

/**
 * LES TROIS PREMIÈRES SIGNATURES (phase 22).
 *
 * Trois gares dont le hall EST le sujet : le pont-concourse de Nippori qui
 * enjambe trois exploitants, le passage traversant de Shinagawa avec son
 * 三角時計, et la grande toiture pliée de Takanawa Gateway.
 */
const SIGNATURES = [6, 24, 25];

/**
 * LES CINQ GRANDES (phases 23 et 24).
 *
 * Elles attendaient un OUVRAGE, pas un relevé : leur premier hall est sous les
 * voies, à −6,40 m, et une volée de quai n'avait qu'une profondeur. Depuis que
 * la seconde volée se règle sur ce qu'elle dessert
 * (`data/stationGeometry.lowerFlightTo`), elles se branchent comme les autres.
 *
 * Ueno n'en avait pas besoin — son hall est au-dessus — et attendait ses deux
 * voisines de phase pour qu'on les compare entre elles.
 */
const BIG = [0, 4, 12, 16, 18, 19];

/**
 * LA DERNIÈRE (phase 29) : Okachimachi, et son demi-niveau.
 *
 * Elle a attendu cinq phases pour une cote composée qui tombait à côté de
 * l'ouvrage — voir plus haut. Trente sur trente.
 */
const LAST = [3];

const WIRED: ReadonlyMap<number, StationConcourseProfile> = new Map(
  [...SMALL, ...MEDIUM, ...SIGNATURES, ...BIG, ...LAST]
    .filter((i) => !DEFERRED.includes(i))
    .sort((a, b) => a - b)
    .map((i) => [i, profileFor(i)] as const),
);

/** Les gares dont le relevé attend un ouvrage que le moteur ne sait pas encore. */
export function deferredIndices(): readonly number[] {
  return DEFERRED;
}

/** Le relevé d'une gare, si elle est branchée dessus. */
export function wiredProfile(index: number): StationConcourseProfile | null {
  return WIRED.get(index) ?? null;
}

/** Combien de gares passent par leur relevé. */
export function wiredCount(): number {
  return WIRED.size;
}

/** Lesquelles, dans l'ordre de la boucle. Les tests s'en servent pour trier. */
export function wiredIndices(): readonly number[] {
  return [...WIRED.keys()].sort((a, b) => a - b);
}

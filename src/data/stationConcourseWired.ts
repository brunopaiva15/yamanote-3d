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
 * DEUX GARES ATTENDENT, et pour une raison de géométrie, pas de relevé.
 *
 * Une volée de quai a une hauteur FIXE : 3,675 m vers le bas, 5,075 m vers le
 * haut (`data/stationGeometry`). Or le relevé d'Okachimachi fait déboucher sa
 * trémie sur une MEZZANINE à mi-hauteur (−1,84 m), et celui d'Harajuku sur le
 * souterrain de Takeshita, qui passe SOUS les voies (−6,40 m). Dans les deux
 * cas la volée ne rejoint pas le sol qu'elle dessert : il y aurait une marche
 * d'un mètre quatre-vingt au pied de l'escalier.
 *
 * Rendre la volée réglable touche l'ouvrage lui-même — sa géométrie, son rendu
 * et la marche — et c'est le sujet des phases de signature, où Shinjuku et
 * Shibuya le demanderont de toute façon. Les brancher avant serait poser une
 * gare juste sur un escalier faux.
 */
const DEFERRED = [3, 18];

/**
 * LES TROIS PREMIÈRES SIGNATURES (phase 22).
 *
 * Trois gares dont le hall EST le sujet : le pont-concourse de Nippori qui
 * enjambe trois exploitants, le passage traversant de Shinagawa avec son
 * 三角時計, et la grande toiture pliée de Takanawa Gateway.
 */
const SIGNATURES = [6, 24, 25];

const WIRED: ReadonlyMap<number, StationConcourseProfile> = new Map(
  [...SMALL, ...MEDIUM, ...SIGNATURES]
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

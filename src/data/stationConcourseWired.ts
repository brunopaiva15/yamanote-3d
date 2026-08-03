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
const WIRED: ReadonlyMap<number, StationConcourseProfile> = new Map(
  [1, 5, 7, 9, 10, 13, 15, 17].map((i) => [i, profileFor(i)] as const),
);

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

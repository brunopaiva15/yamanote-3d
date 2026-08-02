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

import type { StationConcourseProfile } from './stationConcourseTypes.ts';

const WIRED: ReadonlyMap<number, StationConcourseProfile> = new Map();

/** Le relevé d'une gare, si elle est branchée dessus. */
export function wiredProfile(index: number): StationConcourseProfile | null {
  return WIRED.get(index) ?? null;
}

/** Combien de gares passent par leur relevé. Zéro aujourd'hui. */
export function wiredCount(): number {
  return WIRED.size;
}

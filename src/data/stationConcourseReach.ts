// Jusqu'où le décor doit s'écarter pour qu'une gare tienne.
//
// `data/stationConcourseProfiles` dit ce qu'une gare occupe. Ce fichier répond
// à la seule question que le décor lui pose : **où dois-je me pousser ?**
//
// ─────────────────────────────────────────────────────────────────────────
// POURQUOI UNE TABLE, ET NON UN CALCUL
//
// La portée SE DÉDUIT du profil - `deriveReach` est juste dessous, et c'est la
// seule définition qui fasse foi. Mais le décor n'a pas besoin du dossier pour
// se pousser de quatre mètres : il lui faut quatre nombres par gare, là où les
// trente profils pèsent cent trente kio de relevé, de questions ouvertes et de
// notes de repère. Les embarquer dans le paquet du jeu pour en tirer cent vingt
// nombres serait payer le dossier au prix du bundle, une phase avant que le
// compilateur (phase 7) n'en ait réellement besoin.
//
// D'où `stationConcourseReachTable`, GÉNÉRÉE (`npm run data:reach`) et
// vérifiée : un test recalcule les trente portées depuis les profils et exige
// qu'elles soient identiques. C'est la même discipline que le carnet de relevé
// - une donnée dérivée qui ne peut pas diverger de sa source, parce que la
// suite tombe si elle dérive.
// ─────────────────────────────────────────────────────────────────────────
//
// POURQUOI DEUX PORTÉES, ET PAS UNE
//
// Un profil déclare des halls qu'on parcourt ET des perspectives qu'on regarde
// (`Depiction`). Les deux occupent de la place sur le plan ; ils n'ont pas du
// tout le même rapport au décor.
//
//   · ce qui est BÂTI a un sol, des parois, un plafond. Un mur de soutènement
//     de quatre cents mètres qui passe au travers se voit immédiatement, et le
//     décor doit lui céder la place ;
//   · ce qui est MONTRÉ - une vue lointaine, un fond simplifié - est du décor
//     lui-même, à la même profondeur. Lui réserver de l'emprise reviendrait à
//     pousser les murs de la ville à quatre-vingts mètres pour ménager une
//     perspective qui, justement, est faite de ces murs-là.
//
// D'où `built`, qui commande, et `shown`, qui informe.
//
// ET LE BALLAST NE BOUGE PAS. La nappe de rue se dérobe autant qu'on veut - la
// gare couvre ce qu'on découvre - mais la plate-forme de la voie porte un
// train. Un niveau qui vit à son altitude ne peut donc pas la franchir :
// `validateProfile` le refuse (`acrossBallast`), et les six gares dont un hall
// traverse réellement le faisceau passent SOUS la voie. La conséquence tient en
// une ligne, et c'est celle qui rend la phase 6 possible : **à l'altitude des
// nappes de sol, les trente gares tiennent dans la bande du quai.** Le décor au
// ras du sol n'a donc rien de nouveau à faire, et ce qui déborde déborde plus
// haut ou plus bas, là où rien ne court.

import {
  atGroundSheet,
  type ConcourseRect,
  type Depiction,
  type StationConcourseProfile,
} from './stationConcourseTypes.ts';
import { CONCOURSE_REACH } from './stationConcourseReachTable.ts';
import { PSD_X } from './stationGeometry.ts';
import { layoutFor } from './stationLayouts.ts';

/**
 * Ce qui a un sol et des parois, donc ce à quoi le décor doit céder la place.
 *
 * Liste fermée, et volontairement plus courte que `Depiction` : une vue
 * (`vista`), un fond (`backdrop`), une porte close (`closed`) et un simple
 * panneau (`signOnly`) ne réservent pas d'emprise.
 */
const BUILT: ReadonlySet<Depiction> = new Set<Depiction>([
  'walkable',
  'shortBranch',
  'blindCorner',
  'stairhead',
  'doorway',
]);

export interface ConcourseReach {
  /** Abscisse la plus lointaine atteinte par ce que la gare BÂTIT. */
  built: number;
  /**
   * Abscisse la plus PROCHE atteinte par ce que la gare BÂTIT.
   *
   * Le décor de tronçon ne s'écarte que du côté du quai (`bothSides`) : sur un
   * îlot, tout ce que la gare occupait était de ce côté-là. Ce n'est plus vrai
   * depuis que des halls passent SOUS la voie et ressortent au-delà — et de ce
   * côté-là, ce qui ne s'écarte pas, c'est la JOUE DE TABLIER du viaduc, qui
   * pend de sept mètres sous la chaussée. Elle ne gêne personne tant que
   * personne n'est dessous ; elle occupait le milieu de la zone payante de
   * Tokyo dès qu'on y descendait.
   *
   * ET À TOUTE ALTITUDE. On avait d'abord restreint la mesure à ce qui passe
   * SOUS la rue, pour ne pas faire reculer le décor de dix-huit gares afin d'en
   * réparer six. C'était compter sans les PLATEAUX : le passage libre de
   * Shinagawa fait cent onze mètres de large, huit mètres au-dessus des voies,
   * et il contient un pâté d'immeubles. Un décor qui ne s'écarte pas parce que
   * la gare le survole n'est pas moins faux qu'un décor qui la traverse.
   *
   * Elle ne dépasse jamais `PSD_X` : le quai lui-même borne le près.
   */
  builtNear: number;
  /** Abscisse la plus lointaine de tout ce que le profil déclare. */
  shown: number;
  /**
   * Bornes de ce qui vit à l'altitude des nappes de sol. Quand la gare n'a rien
   * à cette hauteur - c'est le cas de onze d'entre elles, dont tout hall est
   * au-dessus du quai - elles valent la bande du quai, qui est ce que le décor
   * dégage déjà.
   */
  groundNear: number;
  groundFar: number;
}

/**
 * LA DÉFINITION. Tout le reste - la table, le script qui l'écrit, le test qui
 * la tient - n'existe que pour éviter d'appeler ceci dans le navigateur.
 */
export function deriveReach(p: StationConcourseProfile): ConcourseReach {
  const levels = new Map(p.levels.map((l) => [l.id, l]));
  const back = PSD_X + layoutFor(p.stationIndex).depth;

  const built: ConcourseRect[] = [];
  const all: ConcourseRect[] = [];
  const ground: ConcourseRect[] = [];

  for (const n of p.concourses) {
    all.push(n.rect);
    if (BUILT.has(n.depiction)) built.push(n.rect);
    const l = levels.get(n.levelId);
    if (l && atGroundSheet(l)) ground.push(n.rect);
  }
  for (const c of p.corridors) {
    all.push(c.rect);
    if (BUILT.has(c.depiction)) built.push(c.rect);
  }
  for (const g of p.gateGroups) {
    all.push(g.rect);
    if (BUILT.has(g.depiction)) built.push(g.rect);
  }

  return {
    // Le quai lui-même est un plancher : la portée ne descend jamais sous ce
    // que le décor dégage déjà, sans quoi une petite gare le ferait rentrer.
    built: Math.max(back, ...built.map((r) => r.x1)),
    builtNear: Math.min(PSD_X, ...built.map((r) => r.x0)),
    shown: Math.max(back, ...all.map((r) => r.x1)),
    groundNear: Math.min(PSD_X, ...ground.map((r) => r.x0)),
    groundFar: Math.max(back, ...ground.map((r) => r.x1)),
  };
}

/** Ce que le décor doit dégager pour cette gare. L'index se replie. */
export function reachFor(index: number): ConcourseReach {
  return CONCOURSE_REACH[((index % 30) + 30) % 30];
}

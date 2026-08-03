// CE QUI SE PASSE ENTRE DEUX ÉCRANS : le fondu d'une page à la suivante, et le
// remplissage du ruban de la vue rapprochée.
//
// Jusqu'ici l'afficheur du jeu CHANGEAIT DE PAGE : une image, puis l'autre, au
// battement suivant. La rame, elle, ne coupe pas. Sur une capture de la vraie
// dalle (Yamanote, 日暮里 → 神田, plan de boucle anglais puis vue rapprochée
// japonaise), deux choses se voient que le code ne faisait pas :
//
//   • les deux pages se FONDENT l'une dans l'autre, bandeau compris, en une
//     poignée d'images - à 20 im/s la capture en compte deux mêlées, soit un
//     peu plus d'un dixième de seconde ;
//   • la vue rapprochée arrive AVEC SA BANDE ÉTEINTE, ardoise sur toute sa
//     longueur, et le vert la remonte depuis le repère de position jusqu'au
//     bout lointain. Il part environ trois dixièmes de seconde après la page et
//     met un peu plus d'une seconde à la parcourir.
//
// Ce module ne connaît ni canevas, ni horloge, ni magasin : on lui donne la
// page à l'antenne et le temps écoulé, il rend deux nombres. Les DEUX lecteurs
// de l'afficheur - les dalles de la rame (`three/Screens`) et l'écran de la
// version sonore (`ui/audio/LineScreen`) - s'en servent tels quels, et il se
// teste sous `node --test` comme `lineScreenStates`.

import type { LineScreenState } from './lineScreenStates.ts';

/**
 * Durée du fondu enchaîné d'une page à la suivante.
 *
 * Court, et il doit l'être : ce n'est pas une transition de diaporama, c'est le
 * temps que met un contrôleur d'affichage à substituer une image à une autre.
 * Plus long, l'écran se met à « respirer » et on lit deux pages à la fois.
 *
 * RELEVÉ SUR LA CAPTURE : 0,12 s (deux images mêlées à 20 im/s). La valeur
 * rendue est un peu plus longue, et c'est délibéré - voir la note de
 * BAND_FILL_TIME, qui vaut pour les deux.
 */
export const PAGE_FADE = 0.14;

/**
 * Pas de temps des deux animations, quand il y en a une en cours.
 *
 * Le battement ordinaire de l'afficheur reste celui de la rame - une demi-
 * seconde, `ANIM_PERIOD` -, et c'est lui qui rythme le clignotant et les
 * vantaux. Il est beaucoup trop lâche pour un fondu qui dure `PAGE_FADE` : on
 * n'en verrait qu'une image sur deux, c'est-à-dire une coupure. Les battements
 * fins ne servent QUE pendant le fondu et le remplissage, soit
 * `BAND_FILL_DELAY + BAND_FILL_TIME` par page - le reste du temps, l'écran dort
 * toujours entre deux demi-secondes.
 *
 * Les seules durées de ce dépôt sont celles écrites ICI, dans les trois
 * constantes voisines. Les modules qui s'en servent en parlent en mots et non
 * en chiffres : deux réglages de suite ont déjà laissé des « un dixième de
 * seconde » périmés dans quatre fichiers, et un commentaire faux coûte plus
 * cher qu'un commentaire vague.
 */
export const MOTION_STEP = 1 / 30;

/** Temps mort entre l'apparition de la vue rapprochée et le départ du vert. */
export const BAND_FILL_DELAY = 0.3;

/**
 * Durée du parcours, du repère de position au bout lointain de la bande.
 *
 * RELEVÉ SUR LA CAPTURE : le vert atteint le neuvième dixième de l'arc 22
 * images après son départ, soit 1,1 s, et le bout à 1,2 s environ.
 *
 * CE QUI EST RENDU : 1,35 s, et l'écart s'assume. Deux raisons, et aucune n'est
 * un arrondi de mesure. La première tient à la mesure elle-même : la capture est
 * une caméra à 20 im/s devant une dalle, chaque image y traîne la précédente, et
 * une arête qui remonte l'arc s'y lit plus loin qu'elle n'est - le relevé est un
 * minorant. La seconde tient au REGARD : sur la capture l'écran occupe le cadre
 * entier, alors qu'ici c'est une dalle de soixante centimètres à trois mètres
 * au-dessus d'une porte, qu'on prend de biais et en passant. À cette taille-là,
 * une seconde de remontée ne se voit pas commencer - elle est déjà finie quand
 * l'œil y arrive. Ce qu'on cherche n'est pas le chronomètre de la dalle, c'est
 * ce que le voyageur voit d'elle.
 *
 * L'écart ne se creuse pas pour autant à volonté : à 1,6 s la remontée se
 * regardait avancer, ce qui n'est plus un afficheur qui s'allume mais une barre
 * de progression. La valeur tenue est celle qui se laisse voir sans se laisser
 * attendre.
 */
export const BAND_FILL_TIME = 1.35;

/**
 * Les écrans dont la bande se remplit en arrivant.
 *
 * La vue rapprochée, et elle seule. Le plan de boucle est GÉOGRAPHIQUE : son
 * anneau vert est la ligne entière, pas la voie qu'on a devant soi, et la
 * capture le montre plein d'un bout à l'autre du passage. Lui faire remonter un
 * vert serait inventer une animation pour l'assortir à l'autre.
 */
export function bandFills(state: LineScreenState): boolean {
  return state === 'zoomJP' || state === 'zoomEN';
}

/** Avancement du vert sur la bande, `t` secondes après l'arrivée de la page. */
export function bandFill(t: number): number {
  const x = (t - BAND_FILL_DELAY) / BAND_FILL_TIME;
  return x <= 0 ? 0 : x >= 1 ? 1 : x;
}

/** Ce que l'afficheur retient d'un battement à l'autre. */
export interface ScreenAnim {
  /** Identité de la page à l'antenne. Vide tant que rien n'a été peint. */
  page: string;
  /** Secondes écoulées depuis que cette page est apparue. */
  t: number;
  /** Part de la page nouvelle DÉJÀ incorporée à l'image affichée, 0..1. */
  faded: number;
}

export function newScreenAnim(): ScreenAnim {
  return { page: '', t: 0, faded: 1 };
}

/**
 * Remet l'afficheur à neuf : la prochaine page s'affichera SANS fondu.
 *
 * C'est ce qu'il faut au retour d'une coupure de caténaire. La dalle a été
 * peinte en noir, elle ne montre plus une page précédente mais rien du tout -
 * fondre depuis ce noir donnerait un allumage en douceur qu'aucun contrôleur
 * d'affichage ne fait : l'image revient d'un coup quand elle revient.
 */
export function resetScreenAnim(a: ScreenAnim): void {
  a.page = '';
  a.t = 0;
  a.faded = 1;
}

export interface ScreenAnimStep {
  /**
   * Part de l'image nouvelle à incorporer À CE BATTEMENT (1 = pas de fondu,
   * on remplace).
   *
   * Ce n'est pas l'avancement du fondu mais son INCRÉMENT, et c'est ce qui
   * permet de fondre sans garder de copie de l'image d'avant : la dalle porte
   * déjà le mélange des battements précédents, on ne fait qu'y verser la part
   * suivante. Le calcul (`(cible - déjà) / (1 - déjà)`) est exactement celui
   * qui fait que ce qui reste de l'ancienne image vaut `1 - cible`.
   */
  blend: number;
  /** Avancement du vert sur la bande de la vue rapprochée, 0..1. */
  fill: number;
  /** Vrai tant que quelque chose bouge : il faudra repeindre au battement suivant. */
  busy: boolean;
}

/**
 * Avance l'horloge de l'afficheur et dit ce qu'il faut peindre.
 *
 * `page` est l'identité de la page à l'antenne - PAS la clé de redessin. Les
 * deux ne se confondent pas : le repère de position clignote et l'horloge
 * tourne à l'intérieur d'une même page, et déclencher un fondu à chaque
 * battement du clignotant rendrait l'écran flou en permanence.
 */
export function stepScreenAnim(
  a: ScreenAnim,
  page: string,
  fills: boolean,
  dt: number,
): ScreenAnimStep {
  // Le changement de page se DÉCOUVRE au réveil ordinaire de l'afficheur, une
  // demi-seconde après le précédent - quatre fois la durée du fondu. Compter
  // cette demi-seconde-là comme du temps écoulé donnerait un fondu déjà fini
  // avant sa première image, c'est-à-dire exactement la coupure qu'on remplace.
  // Le premier pas d'une page ne vaut donc qu'un pas fin : c'est ICI que le
  // fondu commence, pas quelque part entre les deux réveils.
  let elapsed = dt;
  if (page !== a.page) {
    // La toute première page ne se fond pas : il n'y a rien sous elle.
    a.faded = a.page === '' ? 1 : 0;
    a.page = page;
    a.t = 0;
    elapsed = Math.min(dt, MOTION_STEP);
  }
  // Le temps du pas compte AUSSI au battement du changement, sans quoi la
  // première image ne verserait rien et l'écran garderait celle d'avant.
  a.t += elapsed;

  let blend = 1;
  if (a.faded < 1) {
    const target = a.t >= PAGE_FADE ? 1 : a.t / PAGE_FADE;
    blend = (target - a.faded) / (1 - a.faded);
    a.faded = target;
  }

  const fill = fills ? bandFill(a.t) : 1;
  return {
    blend,
    fill,
    busy: a.faded < 1 || (fills && a.t < BAND_FILL_DELAY + BAND_FILL_TIME),
  };
}

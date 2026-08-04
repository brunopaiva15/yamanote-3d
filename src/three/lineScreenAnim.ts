// LE CALENDRIER DE TOUT CE QUI BOUGE SUR L'AFFICHEUR : le battement de la rame,
// le fondu d'une page à la suivante, le remplissage du ruban de la vue
// rapprochée, et le va-et-vient des vantaux du pictogramme de portes.
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
// S'y est ajouté depuis le geste du pictogramme de portes, plus bas : même
// affaire, une animation que le code épelait image par image au lieu de la
// jouer.
//
// Ce module ne connaît ni canevas, ni horloge, ni magasin : on lui donne la
// page à l'antenne et le temps écoulé, il rend des nombres entre 0 et 1. Les
// DEUX lecteurs de l'afficheur - les dalles de la rame (`three/Screens`) et
// l'écran de la version sonore (`ui/audio/LineScreen`) - s'en servent tels
// quels, et il se teste sous `node --test` comme `lineScreenStates`.

import type { LineScreenFrame, LineScreenState } from './lineScreenStates.ts';

/**
 * Cadence d'animation des écrans : quatre phases d'une demi-seconde.
 *
 * Une seule horloge pour tout ce qui bouge - les vantaux du plan de quai, le
 * triangle qui désigne la voiture, et le clignotement des repères de position
 * des deux plans de ligne. Sur la rame ces trois choses battent ensemble ;
 * leur donner chacune sa cadence les ferait dériver, et l'écran se mettrait à
 * scintiller au lieu de respirer.
 *
 * Le nombre de phases qu'on passe aux peintures - `anim` partout ailleurs - est
 * un nombre CONTINU depuis que les vantaux coulissent : 2,5 est le milieu de la
 * troisième phase. Ce qui claque n'en est pas dérangé pour autant, et c'est
 * voulu : l'horloge passe d'un entier au suivant à l'instant EXACT du
 * battement, si bien que le clignotant bascule où il basculait et que la clé de
 * redessin, qui n'en garde que la partie entière, ne change pas plus souvent
 * qu'avant. Seul ce qui coulisse regarde la fraction.
 */
export const ANIM_PHASES = 4;
export const ANIM_PERIOD = 0.5;

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

// --- LE PICTOGRAMME DE PORTES : UN GESTE, PAS QUATRE PHOTOGRAPHIES ----------
//
// Il n'y avait ici que quatre images - vantaux à 2, 12, 31 puis 12 pixels de
// l'axe - posées l'une après l'autre au battement de la rame. Quatre images en
// deux secondes, l'œil y voit les sauts avant d'y voir le geste : ça ne s'ouvre
// pas, ça se déplace d'un cran. Les trois positions relevées sur la séquence
// restent vraies, mais elles ne sont pas l'animation - elles en sont trois
// instantanés, et il fallait les relier au lieu de les épeler.
//
// Ce que la boucle rend maintenant, c'est le CYCLE ENTIER : les vantaux
// s'écartent, tiennent ouverts le temps que le triangle rouge sorte du seuil,
// se referment, et la dalle marque un temps avant de recommencer. Deux
// secondes, celles du battement de la rame : le pictogramme ne dérive donc
// jamais du clignotant qui l'entoure. Les deux images extrêmes du relevé - les
// vantaux joints, la porte grande ouverte avec son triangle sorti - restent
// peintes au pixel comme avant ; ce qui a changé, c'est tout ce qui les sépare,
// qui n'existait pas.
//
// Deux nombres en sortent, et rien d'autre : l'écartement des vantaux et la
// sortie du triangle. Les pixels, eux, sont affaire de peinture (`lineScreen`).

/** Durée d'un cycle complet du pictogramme : le battement de la rame. */
export const DOOR_CYCLE = ANIM_PHASES * ANIM_PERIOD;

/**
 * Fin de l'écartement, de la tenue ouverte, puis de la refermeture.
 *
 * La tenue est LONGUE - plus longue que chacun des deux gestes -, et ce n'est
 * pas de la générosité : c'est elle qui donne au triangle le temps de sortir et
 * de rentrer sans se presser. Un triangle qui jaillit et disparaît en cinq
 * images redevient le clignotement qu'on remplace, animation continue ou pas.
 */
const DOOR_OPEN_END = 0.55;
const DOOR_HOLD_END = 1.42;
const DOOR_SHUT_END = 1.85;

/**
 * La sortie du triangle rouge, aux quatre instants qui la bornent.
 *
 * Elle tient TOUT ENTIÈRE dans la tenue ouverte : le triangle ne commence à
 * sortir qu'une fois les vantaux arrêtés, et il est rentré quand ils repartent.
 * Un triangle qui sortirait pendant l'écartement dirait « descendez » d'une
 * porte encore en train de s'ouvrir, et un triangle pincé par les vantaux qui
 * se referment dirait le contraire de ce que l'écran annonce.
 *
 * Les bornes tombent de part et d'autre du battement du milieu (1,0 s), et ce
 * n'est pas un hasard : le plan des correspondances porte le même triangle
 * au-dessus de la case du voyageur, et lui ne se repeint qu'au battement. Il le
 * trouve donc sorti à un battement sur quatre - exactement le clignotement
 * d'avant, à ceci près qu'il coulisse là où on le repeint assez souvent.
 */
const MARKER_OUT = 0.6;
const MARKER_UP = 0.98;
const MARKER_DOWN = 1.05;
const MARKER_IN = 1.42;

/**
 * Rampe adoucie de 0 à 1, plate aux deux bouts.
 *
 * C'est ce « plate aux deux bouts » qui fait tout : une rampe droite part et
 * s'arrête d'un coup, et une porte qui s'arrête d'un coup se voit claquer même
 * quand elle met une demi-seconde à traverser l'écran.
 */
const smooth = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/** La même rampe, entre deux instants du cycle. */
const ramp = (t: number, from: number, to: number): number => smooth((t - from) / (to - from));

/**
 * Où en est le cycle, en secondes, pour une horloge d'animation de `anim`
 * phases. Les phases négatives se replient : l'horloge tourne, elle ne se
 * remet pas à zéro à chaque tour chez tous ses lecteurs.
 */
const cycleTime = (anim: number): number =>
  (((anim % ANIM_PHASES) + ANIM_PHASES) % ANIM_PHASES) * ANIM_PERIOD;

/**
 * Écartement des vantaux : 0 joints, 1 grande ouverte.
 *
 * L'ouverture ACCÉLÈRE - c'est ce que disent les trois positions relevées (2 →
 * 12 → 31 : le second intervalle vaut le double du premier), et c'est ce que
 * fait une porte pneumatique, qui pousse avant d'être lancée. D'où la rampe
 * élevée à une puissance : elle garde ses deux bouts plats - donc ni départ ni
 * arrêt brutal - mais passe son milieu plus bas, ce qui est exactement ce
 * qu'on entend par « ça part doucement puis ça file ».
 *
 * La refermeture, elle, est symétrique et un peu plus courte. Le relevé ne dit
 * rien de son allure - il n'en a qu'une image, à mi-chemin -, mais une porte
 * qu'on referme ne se surveille pas comme une porte qui s'ouvre, et rendre les
 * deux gestes rigoureusement identiques donnait un va-et-vient de métronome.
 */
export function doorAperture(anim: number): number {
  const t = cycleTime(anim);
  if (t < DOOR_OPEN_END) return ramp(t, 0, DOOR_OPEN_END) ** 1.35;
  if (t < DOOR_HOLD_END) return 1;
  if (t < DOOR_SHUT_END) return 1 - ramp(t, DOOR_HOLD_END, DOOR_SHUT_END);
  return 0;
}

/** Sortie du triangle rouge hors du seuil : 0 rentré, 1 sorti. */
export function doorMarker(anim: number): number {
  const t = cycleTime(anim);
  if (t <= MARKER_OUT || t >= MARKER_IN) return 0;
  if (t < MARKER_UP) return ramp(t, MARKER_OUT, MARKER_UP);
  if (t <= MARKER_DOWN) return 1;
  return 1 - ramp(t, MARKER_DOWN, MARKER_IN);
}

/**
 * Les écrans dont l'image ne s'arrête JAMAIS de bouger.
 *
 * Le plan des sorties à l'approche, et lui seul : son pictogramme de portes
 * coulisse en boucle tant que l'écran est à l'antenne. Tous les autres finissent
 * par se poser - le fondu s'achève, le vert atteint le bout de sa bande - et la
 * dalle retrouve son battement d'une demi-seconde ; celui-ci demande des images
 * fines de bout en bout, faute de quoi ses vantaux sauteraient de nouveau de
 * cran en cran.
 *
 * Ça coûte, et le coût est borné : cet écran n'existe que pendant le freinage
 * d'approche, une poignée de secondes par gare, et c'est précisément le moment
 * où le voyageur le regarde.
 */
export function screenLoops(f: LineScreenFrame): boolean {
  return f.state === 'stationLayout' && f.mode === 'doors';
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

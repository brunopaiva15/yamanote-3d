// Rendre quelqu'un d'autre là où il était il y a un dixième de seconde.
//
// Les poses arrivent à huit par seconde, par paquets irréguliers, parfois dans
// le désordre, parfois pas du tout. Les afficher telles quelles donnerait un
// avatar qui saute de huit positions par seconde - exactement ce qu'on voit
// dans les jeux mal faits. On garde donc les derniers échantillons et l'on
// affiche un INSTANT PASSÉ, choisi assez en arrière pour qu'il y ait toujours
// deux échantillons de part et d'autre.
//
// Cent trente millisecondes : une période de pose (125 ms) plus une marge de
// gigue. En régime normal on n'extrapole donc JAMAIS - on interpole entre deux
// positions réellement reçues, et l'avatar glisse. Le prix est un dixième de
// seconde de retard sur la vérité, ce qui ne se voit pas et ne se joue pas :
// personne ne se tire dessus dans cette rame.
//
// Module pur, sans le moindre import : il se teste sous `node --test`.

import type { Pose, PoseFrame, PoseLevel } from './protocol';

/** Retard de rendu (ms) : on affiche l'instant `maintenant - INTERP_DELAY_MS`. */
export const INTERP_DELAY_MS = 130;

/**
 * Extrapolation maximale (ms) au-delà du dernier échantillon.
 *
 * Quand le réseau décroche, on prolonge le dernier mouvement un cinquième de
 * seconde - assez pour absorber un paquet perdu sans qu'on le voie -, puis on
 * GÈLE. Un avatar figé qui s'estompe se comprend ; un avatar qui continue tout
 * droit indéfiniment traverse les murs et finit à deux kilomètres.
 */
export const EXTRAPOLATE_MAX_MS = 200;

/**
 * Silence au-delà duquel un pair est considéré perdu (ms). Son avatar s'efface
 * en fondu plutôt que de rester planté là comme un mannequin.
 *
 * DEUX FOIS la trame de vie, et pas une de moins. Ce seuil valait une seconde,
 * c'est-à-dire exactement `POSE_KEEPALIVE_MS` : un voyageur ASSIS - le cas
 * normal dans une rame, tout de même - n'émet que sa trame de vie, à une par
 * seconde, plus la quantification d'envoi (125 ms) et le temps de transit. Son
 * dernier échantillon devenait donc « vieux » quelques dixièmes de seconde avant
 * que le suivant n'arrive, à chaque seconde : son avatar plongeait dans le fondu
 * puis réapparaissait, indéfiniment. Sur une liaison lente, il disparaissait
 * complètement une fois par seconde.
 *
 * Un seuil de disparition ne doit jamais frôler la cadence d'émission qu'il
 * surveille : il faut qu'un pair ait manqué DEUX rendez-vous pour qu'on le
 * déclare parti. Deux secondes et demie laissent la marge sans faire traîner à
 * l'écran quelqu'un qui a vraiment fermé son onglet - et le départ propre, lui,
 * passe par la présence, qui est immédiate. L'invariant est éprouvé dans
 * tests/netPoseBuffer.
 */
export const POSE_STALE_MS = 2_500;

/** Taille de l'anneau : une seconde de poses à 8 Hz, et la marge du désordre. */
export const POSE_BUFFER_SIZE = 12;

export interface PoseSample extends Pose {
  t: number;
}

/**
 * Range un échantillon dans l'anneau, en gardant l'ordre chronologique.
 *
 * L'insertion est triée et non pas simplement ajoutée en queue : les messages
 * d'un canal temps réel n'arrivent pas forcément dans l'ordre où ils ont été
 * émis, et un échantillon en retard inséré en queue ferait reculer le temps du
 * tampon - donc sauter l'avatar en arrière à la lecture suivante.
 *
 * Un échantillon plus vieux que le plus vieux du tampon plein est jeté : il
 * n'apprend plus rien, on est déjà passé devant.
 */
export function pushSample(buf: PoseSample[], s: PoseSample): void {
  // Doublon exact (retransmission) : on garde le premier arrivé.
  for (const existing of buf) {
    if (existing.t === s.t) return;
  }
  let i = buf.length;
  while (i > 0 && buf[i - 1].t > s.t) i--;
  if (i === 0 && buf.length >= POSE_BUFFER_SIZE) return;
  buf.splice(i, 0, s);
  while (buf.length > POSE_BUFFER_SIZE) buf.shift();
}

/**
 * Différence d'angles par le chemin le plus court, dans (-π, π].
 *
 * Sans ça, quelqu'un dont le lacet passe de +3,0 à -3,0 rad - un dixième de
 * tour, en franchissant ±π - ferait chez les autres un tour complet sur
 * lui-même à chaque fois qu'il regarde derrière lui.
 */
function shortestAngleDelta(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function lerpAngle(a: number, b: number, k: number): number {
  return a + shortestAngleDelta(a, b) * k;
}

/**
 * La pose à afficher à l'instant `t`, ou `null` si le tampon ne sait rien.
 *
 * Trois régimes, dans l'ordre :
 *
 *  1. `t` tombe entre deux échantillons : interpolation linéaire. C'est le cas
 *     normal, et le seul qui compte.
 *  2. `t` est avant le premier échantillon connu : on rend le premier tel quel.
 *     Cela n'arrive qu'à l'arrivée d'un pair, le temps que le tampon se
 *     remplisse - une fraction de seconde.
 *  3. `t` est après le dernier : on prolonge la dernière vitesse, mais pas
 *     au-delà de `EXTRAPOLATE_MAX_MS`, puis on gèle.
 *
 * Les champs DISCRETS ne s'interpolent pas. « À moitié assis » n'existe pas, et
 * un repère à moitié wagon et à moitié quai n'existe pas davantage : ils
 * prennent la valeur de l'échantillon ANTÉRIEUR, donc basculent net au bon
 * instant. C'est le genre de détail qui, s'il est raté, se voit tout de suite
 * et ne se diagnostique jamais.
 */
export function sampleAt(buf: readonly PoseSample[], t: number): PoseSample | null {
  if (buf.length === 0) return null;
  const first = buf[0];
  if (t <= first.t) return first;

  const last = buf[buf.length - 1];
  if (t >= last.t) {
    const ahead = t - last.t;
    if (buf.length < 2 || ahead <= 0) return last;
    const prev = buf[buf.length - 2];
    const span = last.t - prev.t;
    if (span <= 0) return last;
    // On prolonge, mais on n'invente pas au-delà de la limite : au-delà, le
    // facteur est plafonné et l'avatar s'arrête net plutôt que de filer.
    const k = Math.min(ahead, EXTRAPOLATE_MAX_MS) / span;
    return {
      ...last,
      t,
      x: last.x + (last.x - prev.x) * k,
      y: last.y + (last.y - prev.y) * k,
      z: last.z + (last.z - prev.z) * k,
      yaw: last.yaw + shortestAngleDelta(prev.yaw, last.yaw) * k,
      pitch: last.pitch + (last.pitch - prev.pitch) * k,
    };
  }

  for (let i = 1; i < buf.length; i++) {
    const b = buf[i];
    if (b.t < t) continue;
    const a = buf[i - 1];
    const span = b.t - a.t;
    const k = span > 0 ? (t - a.t) / span : 0;
    return {
      t,
      x: a.x + (b.x - a.x) * k,
      y: a.y + (b.y - a.y) * k,
      z: a.z + (b.z - a.z) * k,
      yaw: lerpAngle(a.yaw, b.yaw, k),
      pitch: a.pitch + (b.pitch - a.pitch) * k,
      // Les discrets viennent de `a` : ils basculent quand on ATTEINT `b`.
      frame: a.frame as PoseFrame,
      level: a.level as PoseLevel,
      station: a.station,
      seated: a.seated,
      moving: a.moving,
      // Une bouteille à moitié tenue n'existe pas davantage qu'un demi-assis :
      // l'objet apparaît quand on ATTEINT l'échantillon qui le porte.
      held: a.held,
    };
  }
  return last;
}

/** Ce pair s'est-il tu depuis assez longtemps pour qu'on l'efface ? */
export function isStale(buf: readonly PoseSample[], now: number): boolean {
  if (buf.length === 0) return true;
  return now - buf[buf.length - 1].t > POSE_STALE_MS;
}

// --- Émission : la bande morte ---------------------------------------------
//
// Ce n'est pas une micro-optimisation, c'est le quota. Le palier gratuit de
// Supabase donne deux millions de messages par mois ; un salon de huit
// personnes pendant une demi-heure à huit poses par seconde en consomme cent
// quinze mille. Un joueur assis qui regarde par la fenêtre n'a aucune raison
// d'en dépenser une seule.
//
// On n'émet donc que si quelque chose a bougé - ou si la dernière trame de vie
// commence à dater, pour que les autres sachent qu'on est toujours là.

/** Déplacement en deçà duquel on ne réémet pas (m). */
export const POSE_DEAD_ZONE_M = 0.02;
/** Rotation en deçà de laquelle on ne réémet pas (rad). */
export const POSE_DEAD_ZONE_RAD = 0.02;
/** Trame de vie forcée : on parle au moins une fois par seconde (ms). */
export const POSE_KEEPALIVE_MS = 1_000;

/**
 * Faut-il envoyer cette pose ?
 *
 * `last` est la dernière pose RÉELLEMENT émise, pas la dernière calculée : la
 * bande morte se mesure par rapport à ce que les autres croient savoir, pas par
 * rapport à l'image précédente. Sinon un déplacement lent, en dessous du seuil à
 * chaque image, ne serait jamais émis - et l'avatar traverserait le wagon sans
 * que personne ne le voie partir.
 */
export function shouldSendPose(last: Pose | null, next: Pose, now: number): boolean {
  if (last === null) return true;
  if (now - last.t >= POSE_KEEPALIVE_MS) return true;
  if (last.seated !== next.seated) return true;
  if (last.moving !== next.moving) return true;
  if (last.frame !== next.frame) return true;
  if (last.level !== next.level) return true;
  if (last.station !== next.station) return true;
  // On vient d'acheter, ou de finir : ça se voit, donc ça part tout de suite.
  // Sans cette ligne, quelqu'un d'assis et immobile - le cas normal dans une
  // rame - aurait attendu sa trame de vie pour montrer sa bouteille.
  if (last.held !== next.held) return true;
  const dx = next.x - last.x;
  const dy = next.y - last.y;
  const dz = next.z - last.z;
  if (dx * dx + dy * dy + dz * dz >= POSE_DEAD_ZONE_M * POSE_DEAD_ZONE_M) return true;
  if (Math.abs(shortestAngleDelta(last.yaw, next.yaw)) >= POSE_DEAD_ZONE_RAD) return true;
  if (Math.abs(next.pitch - last.pitch) >= POSE_DEAD_ZONE_RAD) return true;
  return false;
}

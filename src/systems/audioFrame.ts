// Ce que la boucle d'images doit dire au moteur audio, une fois par image.
//
// Deux boucles appellent ce module, et c'est toute sa raison d'être : celle de
// la toile (three/Engine, cadencée par react-three-fiber) et celle de la
// version sonore (systems/audioLoop, cadencée par requestAnimationFrame). Le
// MIXAGE - ce que les portes laissent passer, quelle ambiance de gare, ce qui
// arrive du dehors - ne peut pas exister en deux exemplaires : deux versions du
// jeu qui divergeraient sur le niveau d'une annonce ne seraient plus le même
// jeu, et le réglage se ferait deux fois.
//
// Ce module ne fait donc que PUBLIER l'état courant. Il n'intègre pas de temps
// et ne décide de rien : les machines à états (stationCycle, doorMotion,
// weather) ont déjà tourné quand il parle.

import { layoutFor, roomTone } from '../data/stationLayouts';
import { useStore } from '../store';
import { onPlatformDeck, runtime } from './runtime';
import { doorObstructionOpening } from './doorObstruction';
import {
  playThunder,
  setPlatformDoors,
  setStationAmbience,
  setWeatherSound,
  updateAmbience,
  updateAudio,
} from './audioEngine';
import { V_MAX } from '../data/config';
import { updatePlatformSpeakers } from './stationPa';
import { setSubtitleClock } from './subtitles';
import { weather } from './weather';

/**
 * Plafond du dt cycle : borne les trous que l'API Visibility ne signale pas
 * (mise en veille machine, page restée « visible »). Une frame lente mais
 * visible avance le cycle de tout son temps écoulé - le seuil ne sert qu'à
 * éviter de téléporter le train de plusieurs gares d'un coup.
 */
export const CYCLE_DT_CAP = 5;

/**
 * Pas d'intégration de la physique (portes, PNJ, audio) : 0,05 s au plus, pour
 * que le profil trapézoïdal d'un vantail reste stable.
 *
 * Ce n'est PAS un plafond par image. Ç'en était un, et c'était le bug : la
 * frame consommait 0,05 s de mouvement de porte quel que soit le temps
 * réellement écoulé, pendant que le cycle station avançait, lui, en temps réel.
 * Sous vingt images par seconde les deux horloges divergeaient sans borne - la
 * rame partait à 90 km/h vantaux à demi ouverts, la porte sautait d'un coup à
 * l'ordre de fermeture, et l'ouverture ne franchissait jamais le seuil de 0,55
 * qui autorise à descendre : sur une machine lente, on ne pouvait plus sortir
 * de la rame. Le temps écoulé est donc PARCOURU en autant de sous-pas qu'il
 * faut, au lieu d'être tronqué.
 */
export const PHYS_STEP = 0.05;

/**
 * Temps de physique simulé au plus par image (s).
 *
 * Le sous-pas rend la borne inoffensive tant qu'on tient une image par seconde
 * - vingt sous-pas -, et il faut bien une borne : une frame de rattrapage de
 * cinq secondes ferait tourner quatre-vingts fois la mise à jour de tous les
 * PNJ et n'arrangerait rien.
 */
export const PHYS_SPAN_CAP = 1.0;

/**
 * Ce qui reste de l'ambiance du quai quand on est descendu au niveau de
 * correspondance.
 *
 * Une dalle de quarante-quatre centimètres de béton, et pour seul passage la
 * trémie : le fond sonore de la gare y arrive, mais loin. Un cinquième, ce qui
 * est aussi ce que laisse passer une rame portes closes - même situation, un
 * volume fermé qui communique par un trou.
 */
const CONCOURSE_MUFFLE = 0.2;

// Chrono du dernier coup de tonnerre, tel que le modèle le voit : il repasse à
// zéro quand un éclair part, et c'est ce FRONT qu'on guette.
let lastThunderT = 0;

/**
 * Part de l'ouverture réellement dégagée entre la rame et le quai (0..1).
 *
 * Il faut la porte de la rame ET la porte palière en face - là où il y en a
 * une. À Shinjuku et Shibuya, la porte de la rame donne directement sur le
 * quai. Une porte arrêtée sur quelqu'un juste à côté de vous est une ouverture
 * comme une autre - la seule qui reste, en l'occurrence, et c'est par elle
 * qu'on entend l'agent de quai s'adresser à celui qui bloque.
 */
export function doorOpenings(): number {
  return Math.max(
    runtime.doorOpen * (runtime.psdPresent ? runtime.psdOpen : 1),
    doorObstructionOpening(),
  );
}

/**
 * Pousse au moteur audio tout ce qui dépend de l'état du monde à cet instant :
 * les niveaux de la rame (roulement, onduleur, climatisation, freins), les
 * événements d'ambiance, ce que les portes laissent passer, où sont les
 * diffuseurs du quai, quelle ambiance de gare, ce qui entre du dehors, et le
 * tonnerre s'il vient de partir.
 *
 * À appeler UNE FOIS par image, après les machines à états, avec le temps que
 * la physique vient de parcourir (`physSpan`).
 *
 * UNE FOIS, et c'est tout le sujet. `updateAudio` était appelé depuis la
 * boucle de sous-pas, donc jusqu'à vingt fois par image : douze paramètres de
 * Tone reprogrammés à chaque passage, soit deux cent quarante insertions dans
 * autant de lignes de temps triées, là où douze suffisent. Sur une machine
 * modeste, cela représentait quarante pour cent du temps processeur - dans un
 * mode qui ne dessine rien, et pour un résultat rigoureusement identique :
 * l'oreille n'entend pas les valeurs intermédiaires d'une image, elle entend
 * la dernière. Le fil audio, lui, entendait très bien qu'on lui prenait son
 * processeur : c'était le grésillement.
 *
 * Rien de ce qui est ici n'INTÈGRE de temps hors de ses propres compteurs
 * (l'inertie des turbines et le chrono d'ambiance sont linéaires en `dt`) :
 * les parcourir d'un seul pas donne le même résultat qu'en vingt.
 */
export function publishAudioEnvironment(physSpan: number): void {
  // Les niveaux de la rame. Sur le quai, la phase du store reste 'dwell' : le
  // freinage réel se lit sur l'accélération (rame qui arrive), sinon le
  // crissement ne part jamais.
  const phase = useStore.getState().phase;
  updateAudio(
    physSpan,
    runtime.speed / V_MAX,
    phase === 'brake' || runtime.accel < -0.05,
    runtime.carPower,
  );
  updateAmbience(physSpan);
  // L'heure du monde, pour le journal des sous-titres. Poussée d'ici plutôt que
  // lue là-bas : systems/subtitles est appelé par le moteur audio et par la
  // file de parole, et un import de runtime dans ce sens refermerait le graphe.
  setSubtitleClock(runtime.clockMin);
  const openings = doorOpenings();
  setPlatformDoors(openings);
  // Et sur QUELS diffuseurs elle sort. La sono du quai est une ligne, pas
  // un point : les prises du moteur audio suivent la tête pour qu'on
  // entende l'annonce aussi bien au bout du quai que devant sa porte.
  // Après updatePlatformPresence, qui vient de poser le glissement du quai.
  updatePlatformSpeakers();
  // L'ambiance du lieu suit les mêmes ouvertures : sur le quai on est dedans,
  // dans la rame portes fermées on ne l'entend presque plus. Elle ne vit
  // qu'aussi longtemps que la gare est là.
  // La gare qu'on entend est celle dont le quai est là (platformIndex) : au
  // départ, index désigne déjà la suivante alors que celle-ci défile encore le
  // long des vitres, et son ambiance s'éloigne avec elle.
  const stationIndex = useStore.getState().platformIndex;
  // Le hall n'est pas le quai : il est SOUS lui, et l'ambiance du quai ne s'y
  // entend que par la trémie. On lui applique donc l'atténuation des
  // ouvertures, comme à l'intérieur d'une rame portes closes - c'est la même
  // situation acoustique, un volume fermé qui communique par un trou.
  const onDeck = onPlatformDeck();
  setStationAmbience(
    layoutFor(stationIndex).ambience,
    runtime.platformFade * (onDeck ? 1 : CONCOURSE_MUFFLE),
    roomTone(stationIndex),
  );
  // La météo, à l'oreille : le pavillon d'un côté, le dehors de l'autre.
  // Elle suit les mêmes ouvertures que l'ambiance de gare - c'est par là,
  // et par là seulement, que le dehors entre.
  setWeatherSound(weather.rain, weather.snow, weather.snowCover, weather.wet, openings, onDeck);
  // Le tonnerre part quand le modèle vient d'allumer un éclair : le son, lui,
  // met trois secondes par kilomètre, et c'est playThunder qui pose ce
  // retard-là.
  if (weather.thunderT < lastThunderT) playThunder(weather.thunderFar);
  lastThunderT = weather.thunderT;
}

/**
 * Remet à zéro le front du tonnerre.
 *
 * Utile quand on repart d'un monde neuf (tests, changement de version en cours
 * de session) : sans cela, le premier éclair du nouveau monde pourrait être
 * comparé au chrono de l'ancien et passer inaperçu.
 */
export function resetAudioFrame(): void {
  lastThunderT = 0;
}

// Dire aux autres où l'on se tient, et lire où ils se tiennent.
//
// --- Le repère, qui est tout le sujet ---------------------------------------
//
// On ne transmet JAMAIS de coordonnées monde. Le monde vaut « repère wagon +
// runtime.trainZ », et `trainZ` ne vaut pas la même chose selon qu'on est à
// bord ou sur le quai : il est nul pour qui roule dans la rame, et il glisse
// pour qui la regarde partir. Envoyer du monde reviendrait à envoyer une
// position déjà fausse pour la moitié des destinataires.
//
// Ce qu'on transmet, c'est le repère LOCAL de l'émetteur - celui du wagon, ou
// celui du quai - et rien d'autre. `publishPlayerPose` (systems/playerFrame) le
// publie déjà gratuitement dans les trois repères à chaque image : il n'y a
// donc rien à calculer, seulement à choisir.
//
// Et les cas croisés tombent juste tout seuls, sans un `if` de plus - ce qui
// est le signe que le découpage est le bon :
//
//   · lui dans le wagon, moi sur le quai → `carToWorldZ` ajoute `trainZ`, donc
//     il défile avec la rame quand elle part, vu à travers les vitres ;
//   · lui sur le quai, moi dans le wagon → `platformToWorld` applique le
//     retournement du quai et son glissement, donc il reste collé au béton
//     pendant que le quai s'éloigne ;
//   · lui sur un AUTRE quai → on ne le rend pas du tout ;
//   · lui au niveau du hall → rendu trois mètres cinquante plus bas, parce que
//     `PlayerLevel` est un étage et non un repère.

import { useStore } from '../../store';
import { runtime } from '../runtime';
import { carToWorldZ, platformFlip, platformToWorld } from '../playerFrame';
import { peers, receivePose, syncRoster } from './peers';
import { INTERP_DELAY_MS, sampleAt, shouldSendPose } from './poseBuffer';
import { decodePose, encodePose, validPose, type Pose, type PosePayload } from './protocol';
import { onRoomMessage, roomSend, useRoom } from './room';
import { netRole } from './worldDecisions';

/** Cadence maximale d'émission (Hz). La bande morte fait le reste. */
const SEND_HZ = 8;
const SEND_PERIOD_S = 1 / SEND_HZ;

let depuisDernierEnvoi = 0;
/** La dernière pose RÉELLEMENT émise : c'est elle que mesure la bande morte. */
let derniereEmise: Pose | null = null;
let detacher: (() => void) | null = null;

/**
 * Notre pose, dans notre repère.
 *
 * `seated` vient du store et non d'une heuristique sur la hauteur de l'œil : on
 * peut être assis et regarder le plafond.
 */
function poseLocale(now: number): Pose {
  const s = useStore.getState();
  const surQuai = runtime.playerFrame === 'platform';
  return {
    t: now,
    frame: surQuai ? 1 : 0,
    level: runtime.playerLevel === 'concourse' ? 1 : 0,
    station: s.platformIndex,
    x: surQuai ? runtime.playerPlatX : runtime.playerCarX,
    // La hauteur voyage telle quelle : c'est celle de l'ŒIL, et le rendu en
    // déduit les pieds. L'inverse - transmettre les pieds - obligerait chaque
    // récepteur à connaître la taille de l'émetteur, qui dépend de son
    // apparence, qui dépend de sa graine. Un aller-retour pour rien.
    y: surQuai ? runtime.playerPlatY : runtime.playerCarY,
    z: surQuai ? runtime.playerPlatZ : runtime.playerCarZ,
    // Le lacet voyage DANS LE MÊME REPÈRE que la position, et c'est un piège :
    // `runtime.lookX/lookZ` est un vecteur MONDE. Sur un quai qui s'ouvre côté
    // -x, le repère du quai est retourné d'un demi-tour, et transmettre le
    // lacet monde tel quel ferait regarder le joueur exactement à l'opposé -
    // dans une gare sur deux, et seulement dans une gare sur deux, ce qui est
    // la meilleure façon de ne jamais comprendre d'où vient le défaut.
    yaw: toFrameYaw(Math.atan2(-runtime.lookX, -runtime.lookZ), surQuai),
    pitch: Math.asin(Math.max(-1, Math.min(1, runtime.lookY))),
    seated: s.seated,
    // « En marche » se déduit du déplacement de l'appui entre deux envois, et
    // non d'une touche : au doigt comme au clavier, ce qui compte est que les
    // jambes bougent.
    moving: bouge(),
  };
}

/**
 * Un lacet monde vers le repère demandé, et retour.
 *
 * Le repère du quai est celui dans lequel `Platform.tsx` construit sa
 * géométrie, côté +x, AVANT la rotation d'un demi-tour appliquée quand la gare
 * s'ouvre de l'autre côté. Une DIRECTION s'y ramène par ce seul facteur - c'est
 * ce que dit `platformFlip` dans systems/playerFrame, et c'est pour ça qu'il
 * est exporté.
 *
 * Les deux conversions sont la même opération : ajouter π est son propre
 * inverse, à un tour près. On les écrit quand même séparément, parce que lire
 * `toWorldYaw` à la réception dit ce qui se passe bien mieux qu'un second appel
 * à `toFrameYaw`.
 */
function toFrameYaw(worldYaw: number, surQuai: boolean): number {
  if (!surQuai || platformFlip() === 1) return worldYaw;
  return worldYaw + Math.PI;
}

function toWorldYaw(frameYaw: number, surQuai: boolean): number {
  if (!surQuai || platformFlip() === 1) return frameYaw;
  return frameYaw + Math.PI;
}

let appuiX = 0;
let appuiZ = 0;

function bouge(): boolean {
  const dx = runtime.stanceX - appuiX;
  const dz = runtime.stanceZ - appuiZ;
  appuiX = runtime.stanceX;
  appuiZ = runtime.stanceZ;
  // Deux centimètres entre deux images : c'est un pas, pas un balancement de
  // caisse (qui vaut moins d'un centimètre à pleine vitesse).
  return dx * dx + dz * dz > 0.0004;
}

/**
 * Émet notre pose si elle a changé. Appelée une fois par image.
 *
 * La bande morte n'est pas une coquetterie : c'est le quota MENSUEL de
 * Supabase. Deux millions de messages, et un salon de huit personnes pendant
 * une demi-heure à huit poses par seconde en consomme cent quinze mille. Un
 * joueur assis qui regarde par la fenêtre n'a aucune raison d'en dépenser une
 * seule - il en dépense une par seconde, juste pour dire qu'il est là.
 */
export function sendPose(dt: number, now: number): void {
  if (netRole() === 'solo') return;
  depuisDernierEnvoi += dt;
  if (depuisDernierEnvoi < SEND_PERIOD_S) return;
  depuisDernierEnvoi = 0;

  const pose = poseLocale(now);
  if (!shouldSendPose(derniereEmise, pose, now)) return;
  derniereEmise = pose;
  roomSend(
    'pose',
    encodePose(useRoom.getState().selfId, pose) as unknown as Record<string, unknown>,
  );
}

// --- Lecture : du repère de l'émetteur au monde -----------------------------

const tmp = { x: 0, z: 0 };

export interface PeerWorldPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  seated: boolean;
  moving: boolean;
  /** 0..1 : un pair qui se tait s'efface au lieu de rester planté là. */
  fade: number;
}

/**
 * Où dessiner un pair, en coordonnées monde, ou `null` s'il ne se voit pas
 * d'ici.
 *
 * Le retard de rendu est appliqué ICI et une seule fois : on affiche l'instant
 * `now - INTERP_DELAY_MS`, ce qui garantit qu'on interpole entre deux positions
 * réellement reçues au lieu d'en inventer une (voir poseBuffer).
 */
export function peerWorldPose(id: string, now: number): PeerWorldPose | null {
  const pair = peers.get(id);
  if (!pair || pair.fade <= 0.001) return null;
  const p = sampleAt(pair.poses, now - INTERP_DELAY_MS);
  if (!p) return null;

  // Sur un quai qui n'est pas celui qu'on longe : il est bien quelque part, mais
  // pas ici. On ne le dessine pas - le fondu de `peers` s'occupe de le faire
  // disparaître proprement plutôt que de le faire clignoter.
  const s = useStore.getState();
  if (p.frame === 1 && p.station !== s.platformIndex) return null;

  let x: number;
  let z: number;
  if (p.frame === 0) {
    x = p.x;
    z = carToWorldZ(p.z);
  } else {
    platformToWorld(p.x, p.z, tmp);
    x = tmp.x;
    z = tmp.z;
  }

  return {
    x,
    // Le hall de correspondance est un ÉTAGE, pas un repère : il vit dans les
    // mêmes coordonnées de quai, trois mètres cinquante plus bas. La hauteur
    // reçue le porte déjà, il n'y a rien à corriger.
    y: p.y,
    z,
    // Retour au monde par le même demi-tour, s'il y a lieu.
    yaw: toWorldYaw(p.yaw, p.frame === 1),
    pitch: p.pitch,
    seated: p.seated,
    moving: p.moving,
    fade: pair.fade,
  };
}

// --- Branchement ------------------------------------------------------------

export function startPoseStream(): void {
  if (detacher) return;
  derniereEmise = null;
  depuisDernierEnvoi = 0;
  detacher = onRoomMessage((event, payload) => {
    if (event !== 'pose' || !validPose(payload)) return;
    const m = payload as PosePayload;
    receivePose(m.from, decodePose(m), Date.now());
  });
}

// Outil de mise au point : fabriquer un voisin et le faire marcher, sans avoir
// de second onglet ni de serveur. C'est ce qui permet de vérifier la conversion
// de repère - le vrai risque de ce module - dans un navigateur réel.
if (typeof window !== 'undefined') {
  const w = window as unknown as Record<string, unknown>;
  w.__fakePeer = (id = 'voisin', avatar = 12_345) => {
    syncRoster(
      [{ id, name: 'Voisin', avatar, mode: 'full', attached: true, joinedAt: 1 }],
      useRoom.getState().selfId,
      Date.now(),
    );
  };
  w.__fakePose = (over: Partial<Pose> = {}, id = 'voisin') => {
    const now = Date.now();
    receivePose(
      id,
      {
        t: now,
        frame: 0,
        level: 0,
        station: useStore.getState().platformIndex,
        x: 0,
        y: 1.55,
        z: 0,
        yaw: 0,
        pitch: 0,
        seated: false,
        moving: false,
        ...over,
      },
      now,
    );
  };
  w.__peerPose = (id = 'voisin') => peerWorldPose(id, Date.now());
  w.__peers = peers;
}

export function stopPoseStream(): void {
  detacher?.();
  detacher = null;
  derniereEmise = null;
}

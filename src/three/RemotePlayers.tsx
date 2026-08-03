// Les autres voyageurs du salon, en chair et en os.
//
// --- Pourquoi un pool à part ------------------------------------------------
//
// J'avais d'abord prévu de réserver des places dans les pools de PNJ existants,
// sur le modèle de `staff: boolean` qui réserve depuis toujours une place à
// l'agent de quai. Ça ne coûte aucun code de rendu, et c'est tentant.
//
// C'est pourtant le mauvais choix : ça fait entrer des entrées pilotées par le
// RÉSEAU dans deux machines à états de mille quatre cents et deux mille lignes,
// qui réservent des sièges, apparient des conversations, résolvent des
// collisions et distribuent des poignées de tsurikawa. Le rapport entre le
// risque et l'économie est mauvais. Un pool de huit, isolé, ne peut rien casser.
//
// Ce qu'on ne duplique pas, en revanche, c'est le CORPS : `buildPerson` a été
// sorti de la foule du quai vers `characters/proceduralBody` et sert aux deux.
// Écrire un troisième constructeur de silhouette après celui du wagon et celui
// du quai aurait été la vraie faute.
//
// --- Ce que ce composant ne calcule pas -------------------------------------
//
// Rien. Il LIT. La position d'un pair est calculée par `systems/net/pose`
// (conversion de repère, interpolation, fondu) et le composant se contente de
// poser des groupes. C'est la discipline de `paxList` : la logique dans les
// systèmes, le rendu dans three, et jamais l'inverse.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { makeAppearance } from '../systems/appearance';
import { peers } from '../systems/net/peers';
import { peerWorldPose } from '../systems/net/pose';
import { ROOM_CAPACITY } from '../systems/net/protocol';
import { buildPerson } from './characters/proceduralBody';
import { disposeOwned } from './characters/library';

/**
 * Hauteur de l'œil au-dessus des pieds, dans le squelette local.
 *
 * Le réseau transmet la position de l'ŒIL - c'est ce que le joueur contrôle -
 * et le corps se pose dessous. La conversion demande la taille du personnage,
 * qui vient de son apparence : d'où le facteur d'échelle appliqué ici et non à
 * l'émission (l'émetteur ne connaît pas la taille que les autres lui donnent).
 */
const EYE_IN_SKELETON = CONFIG.eyeHeight;

/** Assis, l'œil descend à la hauteur d'assise. */
const SEATED_EYE = CONFIG.sitHeight;

interface Slot {
  group: THREE.Group;
  /** Identifiant du pair occupant cette place, ou `null`. */
  id: string | null;
  /** Graine d'apparence rendue : un changement force une reconstruction. */
  seed: number;
  /** Corps courant, détenu par cette place et libéré avec elle. */
  body: THREE.Group | null;
  /** Phase du balancement de marche, propre à chacun. */
  bob: number;
}

export function RemotePlayers() {
  const groupe = useRef<THREE.Group>(null);
  const places = useMemo<Slot[]>(
    () =>
      Array.from({ length: ROOM_CAPACITY }, () => ({
        group: new THREE.Group(),
        id: null,
        seed: -1,
        body: null,
        bob: 0,
      })),
    [],
  );

  useFrame((_, rawDt) => {
    const racine = groupe.current;
    if (!racine) return;
    const dt = Math.min(rawDt, 0.05);
    const now = Date.now();

    // Les places se distribuent dans l'ordre stable du roster : sans quoi deux
    // pairs échangeraient leurs corps à chaque changement d'effectif, ce qui se
    // verrait comme deux personnes qui se transforment l'une en l'autre.
    const liste = [...peers.values()].sort((a, b) =>
      a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : 1),
    );

    for (let i = 0; i < places.length; i++) {
      const place = places[i];
      const pair = liste[i];

      if (!pair) {
        place.group.visible = false;
        place.id = null;
        continue;
      }

      // Nouveau venu, ou apparence changée : on reconstruit. `disposeOwned`
      // libère les matériaux et géométries que le corps précédent possédait -
      // sans lui, chaque arrivée fuirait quelques mégaoctets de textures de
      // visage. C'est le même motif que la foule du quai.
      if (place.id !== pair.id || place.seed !== pair.avatar) {
        if (place.body) {
          place.group.remove(place.body);
          disposeOwned(place.body);
        }
        const corps = buildPerson(makeAppearance(pair.avatar), pair.avatar);
        place.group.add(corps);
        place.body = corps;
        place.id = pair.id;
        place.seed = pair.avatar;
        place.bob = (pair.avatar % 628) / 100;
        if (!racine.children.includes(place.group)) racine.add(place.group);
      }

      const pose = peerWorldPose(pair.id, now);
      if (!pose) {
        place.group.visible = false;
        continue;
      }

      const echelle = makeAppearance(pair.avatar).build.scale;
      // Des pieds, à partir d'un œil : c'est la seule conversion que le rendu
      // fait sur une pose reçue.
      const oeil = pose.seated ? SEATED_EYE : EYE_IN_SKELETON;
      place.group.visible = true;
      place.group.position.set(pose.x, pose.y - oeil, pose.z);
      place.group.rotation.y = pose.yaw;
      place.group.scale.setScalar(echelle);

      // Le balancement de marche : le seul mouvement qu'on invente, et il est
      // inventé plutôt que transmis parce qu'un booléen coûte un bit là où une
      // phase coûterait un octet à huit hertz, pour un résultat que personne ne
      // saurait distinguer.
      if (pose.moving && !pose.seated) {
        place.bob += dt * 7.5;
        place.group.position.y += Math.sin(place.bob * 2) * 0.016;
      }

      // Le fondu : un pair qui décroche s'estompe au lieu de rester planté là.
      // On l'applique sur l'échelle plutôt que sur l'opacité - rendre
      // transparents une trentaine de matériaux partagés par toutes les places
      // les rendrait transparents pour tout le monde.
      if (pose.fade < 1) place.group.scale.multiplyScalar(pose.fade);
      if (pose.fade <= 0.02) place.group.visible = false;
    }
  });

  return <group ref={groupe} />;
}

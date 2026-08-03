// Foule du quai en rendu procédural (repli si les GLB manquent). Voyageurs
// debout avec apparence complète - plus de capsules grises.
//
// La construction du corps est sortie dans `characters/proceduralBody` : elle
// sert désormais aussi aux joueurs distants d'un salon, qui ont besoin
// exactement de la même silhouette. Ce fichier ne garde que ce qui relève de la
// FOULE : le pool, le repère du quai, et la synchronisation par image sur
// systems/platformCrowd.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { crowdList, initPlatformCrowd } from '../systems/platformCrowd';
import { runtime } from '../systems/runtime';
import { useStore } from '../store';
import { DOOR_SIDE } from '../data/stations';
import { usesHeldPose } from './characters/props';
import { applyBodyPivot } from './characters/pose';
import { disposeOwned } from './characters/library';
import { PLATFORM_Y, buildPerson, crowdArmTarget } from './characters/proceduralBody';

export function ProceduralPlatformCrowd() {
  initPlatformCrowd();
  // Le côté de la foule est celui du quai présent (platformIndex), pas
  // store.doorSide : celui-ci bascule vers la gare suivante en début de
  // croisière, alors que ce quai - et sa foule - défilent encore.
  const platformIndex = useStore((s) => s.platformIndex);
  const doorSide = DOOR_SIDE[platformIndex];
  const wrap = useRef<THREE.Group>(null);

  // Un support stable par slot : le corps y est greffé, et remplacé quand le
  // slot change d'identité (relais des portes, cf. systems/platformCrowd).
  const holders = useMemo(() => crowdList.map(() => new THREE.Group()), []);
  const bodies = useRef<THREE.Group[]>([]);
  const identities = useRef<number[]>([]);
  if (bodies.current.length === 0) {
    bodies.current = crowdList.map((p, i) => {
      const g = buildPerson(p.appearance, p.identity);
      g.visible = false;
      holders[i].add(g);
      return g;
    });
    identities.current = crowdList.map((p) => p.identity);
  }

  useFrame(() => {
    if (wrap.current) {
      wrap.current.visible = runtime.platformFade > 0.02;
      wrap.current.position.z = runtime.platformSlide;
      wrap.current.rotation.y = doorSide === 1 ? 0 : Math.PI;
    }
    for (let i = 0; i < crowdList.length; i++) {
      const p = crowdList[i];
      if (identities.current[i] !== p.identity) {
        disposeOwned(bodies.current[i]);
        bodies.current[i].removeFromParent();
        const rebuilt = buildPerson(p.appearance, p.identity);
        rebuilt.visible = false;
        holders[i].add(rebuilt);
        bodies.current[i] = rebuilt;
        identities.current[i] = p.identity;
      }
      const g = bodies.current[i];
      if (!g) continue;
      if (p.state === 'hidden' || runtime.platformFade < 0.04) {
        g.visible = false;
        continue;
      }
      g.visible = true;
      // p.y : négatif dans une trémie d'escalier, où l'on descend vraiment.
      g.position.set(p.pos.x, PLATFORM_Y + p.y + p.bob, p.pos.z);
      // YXZ : cap, puis buste dans le repère du personnage (cf. LibraryPassengers).
      g.rotation.set(p.bodyLean, p.yaw, p.bodyRoll, 'YXZ');
      applyBodyPivot(g, p.bodyPivot, p.height);
      const head = g.getObjectByName('crowd-head');
      if (head) {
        head.rotation.x = p.headPitch;
        head.rotation.y = p.lookYaw * 0.5;
        head.rotation.z = p.headRoll;
      }
      // Le bras du quai suit les mêmes familles de gestes que la rame (le
      // corps de secours n'a qu'un bras articulé : c'est le droit qui joue).
      const act = p.action === 'shift' ? 'none' : p.action;
      // Une HALTE dans le hall vaut une attente sur le quai : celui qui s'est
      // arrêté devant un rayon fait le geste (voir LibraryPlatformCrowd).
      const posed = p.state === 'waiting' || p.delay > 0;
      const onPhone = usesHeldPose(act) && posed;
      const arm = posed ? crowdArmTarget(act, p.actionT) : null;
      const armR = g.getObjectByName('crowd-arm-r');
      if (armR) {
        armR.rotation.x = arm ? arm[0] : 0;
        armR.rotation.z = arm ? arm[1] : 0.12;
      }
      const phone = g.getObjectByName('crowd-phone');
      if (phone) phone.visible = onPhone;
    }
  });

  return (
    <group ref={wrap} visible={false}>
      {holders.map((g, i) => (
        <primitive key={crowdList[i].id} object={g} />
      ))}
    </group>
  );
}

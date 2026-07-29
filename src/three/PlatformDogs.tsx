// Chiens du quai : un clone par race installée (characters/animals), piloté
// par systems/dogWalkers, plus la laisse qui relie la main du maître au
// collier. Le groupe reprend EXACTEMENT la transformation de la foule
// (glissement du quai, côté des portes) : le repère local y est donc celui de
// `CrowdPax.pos`, ce qui permet à la main publiée par LibraryPlatformCrowd et
// au collier calculé ici de se retrouver dans le même espace.

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { DOOR_SIDE } from '../data/stations';
import { dogWalks, setDogBreedCount, LEASH_LENGTH } from '../systems/dogWalkers';
import { runtime } from '../systems/runtime';
import { useStore } from '../store';
import {
  ANIMALS_BASE,
  buildAnimalTemplates,
  cloneAnimal,
  type AnimalClip,
  type AnimalClone,
  type AnimalManifest,
} from './characters/animals';
import { makeLeash, setLeashColor, updateLeash, type Leash } from './characters/leash';

const FADE = 0.2;

interface Slot {
  clone: AnimalClone;
  leash: Leash;
  current: AnimalClip | '';
}

const vCollar = new THREE.Vector3();
const vHand = new THREE.Vector3();

export function PlatformDogs({ manifest }: { manifest: AnimalManifest }) {
  const platformIndex = useStore((s) => s.platformIndex);
  const doorSide = DOOR_SIDE[platformIndex];
  const wrap = useRef<THREE.Group>(null);
  const urls = useMemo(() => manifest.variants.map((v) => ANIMALS_BASE + v.file), [manifest]);
  const gltfs = useGLTF(urls);
  const templates = useMemo(() => buildAnimalTemplates(manifest, gltfs), [manifest, gltfs]);

  const slots = useMemo<Slot[]>(
    () =>
      templates.map((t) => ({
        clone: cloneAnimal(t),
        leash: makeLeash('#3a3632', LEASH_LENGTH),
        current: '' as AnimalClip | '',
      })),
    [templates],
  );

  // Le nombre de races EST l'interrupteur du système : tant qu'aucun pack
  // animalier n'est installé, dogWalkers ne simule rien.
  useEffect(() => {
    setDogBreedCount(templates.length);
    return () => setDogBreedCount(0);
  }, [templates]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    if (wrap.current) {
      wrap.current.visible = runtime.platformFade > 0.02;
      wrap.current.position.z = runtime.platformSlide;
      wrap.current.rotation.y = doorSide === 1 ? 0 : Math.PI;
    }
    const shown = runtime.platformFade >= 0.04;
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      const dog = dogWalks[i];
      const body = s.clone.wrap;
      if (!dog || (dog.owner < 0 && dog.orphanT <= 0) || !shown) {
        body.visible = false;
        s.leash.mesh.visible = false;
        s.current = '';
        continue;
      }
      body.visible = true;
      body.position.set(dog.pos.x, dog.y, dog.pos.z);
      body.rotation.y = dog.yaw;

      // Allure. Pour un chien en mouvement, le cycle se choisit en comparant
      // sa vitesse aux vitesses d'AUTEUR des deux clips : on bascule à leur
      // moyenne géométrique, c'est-à-dire là où les deux s'écartent autant du
      // réel. Un seuil fixe ne pouvait pas convenir — le « Walk » d'un shiba
      // vaut 0,24 m/s, celui d'un loup le double.
      const { actions, template } = s.clone;
      let moveKey: AnimalClip = 'walk';
      if (dog.gait === 'move') {
        const cross = Math.sqrt(template.walkSpeed * template.runSpeed);
        // Bande morte autour du seuil : sans elle, un chien qui suit à la
        // vitesse pivot alterne marche et trot d'une image à l'autre.
        const wasRun = s.current === 'run';
        moveKey = dog.speed > cross * (wasRun ? 0.85 : 1.15) ? 'run' : 'walk';
      }
      let key: AnimalClip | '' = '';
      const wanted: AnimalClip[] =
        dog.gait === 'move'
          ? moveKey === 'run'
            ? ['run', 'walk', 'idle']
            : ['walk', 'run', 'idle']
          : dog.gait === 'sniff'
            ? ['sniff', 'idle']
            : dog.gait === 'sit'
              ? ['sit', 'idle']
              : ['idle', 'walk'];
      for (const k of wanted) {
        if (actions[k]) {
          key = k;
          break;
        }
      }
      if (key !== s.current) {
        const prev = s.current ? actions[s.current] : undefined;
        const next = key ? actions[key] : undefined;
        if (prev) prev.fadeOut(FADE);
        if (next) next.reset().fadeIn(FADE).play();
        s.current = key;
      }
      // Cycle calé sur la vitesse réelle : sinon les pattes patinent, et un
      // chien qui patine se voit de plus loin qu'un humain qui patine. Le
      // plafond est haut parce que les foulées des packs sont courtes : un
      // petit chien qui tient l'allure d'un marcheur trottine vite, et c'est
      // exactement ce qu'on voit dans la rue.
      if (key === 'walk' || key === 'run') {
        const authored = key === 'run' ? template.runSpeed : template.walkSpeed;
        const action = actions[key];
        if (action) action.timeScale = THREE.MathUtils.clamp(dog.speed / authored, 0.4, 3);
      }
      s.clone.mixer.update(dt);

      // Laisse : main du maître (publiée par la foule) → collier.
      const hasHand = dog.owner >= 0;
      s.leash.mesh.visible = hasHand;
      if (hasHand) {
        setLeashColor(s.leash, dog.leashColor);
        if (s.clone.collar && wrap.current) {
          s.clone.collar.updateWorldMatrix(true, false);
          vCollar.setFromMatrixPosition(s.clone.collar.matrixWorld);
          wrap.current.worldToLocal(vCollar);
        } else {
          // Rig sans cou ni tête : point mesuré à l'avant du gabarit, ramené
          // dans le repère du quai par la matrice FRAÎCHE du chien.
          body.updateMatrix();
          vCollar.copy(s.clone.template.collarLocal).applyMatrix4(body.matrix);
        }
        vHand.copy(dog.hand);
        updateLeash(s.leash, vHand, vCollar);
      }
    }
  });

  return (
    <group ref={wrap} visible={false}>
      {slots.map((s, i) => (
        <group key={i}>
          <primitive object={s.clone.wrap} />
          <primitive object={s.leash.mesh} />
        </group>
      ))}
    </group>
  );
}

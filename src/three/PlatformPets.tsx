// Chiens en caisse de transport : une caisse modelée (characters/carrier) qui
// pend au bout du bras de son porteur, avec le chien du pack animalier à
// l'intérieur, visible par les barreaux de la porte.
//
// Le groupe reprend EXACTEMENT la transformation de la foule (glissement du
// quai, côté des portes) : le repère local y est donc celui de `CrowdPax.pos`,
// ce qui permet à la main publiée par LibraryPlatformCrowd de s'y retrouver.
//
// La caisse ne suit PAS l'orientation du poignet - un bagage porté à la main
// reste d'aplomb, quoi que fasse la main qui le tient. Elle prend donc la
// position de la main et le CAP DU CORPS, ce qui la garde de niveau et alignée
// sur la marche.

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { activePlatformFlip } from '../systems/playerFrame';
import { crowdList } from '../systems/platformCrowd';
import { petCarriers, setPetBreedCount } from '../systems/petCarriers';
import { runtime } from '../systems/runtime';
import { useStore } from '../store';
import {
  ANIMALS_BASE,
  buildAnimalTemplates,
  cloneAnimal,
  type AnimalClone,
  type AnimalManifest,
} from './characters/animals';
import { CARRIER_H, CARRIER_INNER_H, makeCarrier, type Carrier } from './characters/carrier';

/** Écart latéral de la caisse par rapport à la main : elle ne frotte pas la cuisse. */
const OUT = 0.06;

interface Slot {
  carrier: Carrier;
  clone: AnimalClone;
  playing: boolean;
}

export function PlatformPets({ manifest }: { manifest: AnimalManifest }) {
  useStore((s) => s.platformIndex);
  const doorSide = activePlatformFlip();
  const wrap = useRef<THREE.Group>(null);
  const urls = useMemo(() => manifest.variants.map((v) => ANIMALS_BASE + v.file), [manifest]);
  const gltfs = useGLTF(urls);
  const templates = useMemo(() => buildAnimalTemplates(manifest, gltfs), [manifest, gltfs]);

  const slots = useMemo<Slot[]>(
    () =>
      templates.map((t) => {
        const carrier = makeCarrier('#8a9a86');
        const clone = cloneAnimal(t);
        // Le chien est ramené au gabarit de la caisse. Ce n'est pas de la
        // triche : la limite des 10 kg de JR East exclut de toute façon tout
        // ce qui ne tiendrait pas là-dedans, et le manifeste garde, lui, la
        // taille RÉELLE de la race.
        const fit = Math.min(1, (CARRIER_INNER_H - 0.02) / t.variant.height);
        clone.wrap.scale.setScalar(fit);
        clone.wrap.visible = true;
        carrier.petAnchor.add(clone.wrap);
        // Idle : un chien enfermé bouge la tête et les oreilles, rien de plus.
        const idle = clone.actions.idle ?? clone.actions.walk;
        if (idle) idle.play();
        return { carrier, clone, playing: idle !== undefined };
      }),
    [templates],
  );

  // Le nombre de races EST l'interrupteur du système : tant qu'aucun pack
  // animalier n'est installé, petCarriers n'assigne rien.
  useEffect(() => {
    setPetBreedCount(templates.length);
    return () => setPetBreedCount(0);
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
      const c = petCarriers[i];
      const owner = c && c.owner >= 0 ? crowdList[c.owner] : null;
      if (!c || !owner || !c.handSet || !shown) {
        s.carrier.group.visible = false;
        continue;
      }
      s.carrier.group.visible = true;
      // La poignée arrive à la main : l'origine de la caisse est son PLANCHER,
      // d'où la descente d'une hauteur de caisse.
      const yaw = owner.yaw;
      s.carrier.group.position.set(
        c.handPos.x + Math.cos(yaw) * OUT * c.handSide,
        c.handPos.y - CARRIER_H,
        c.handPos.z - Math.sin(yaw) * OUT * c.handSide,
      );
      s.carrier.group.rotation.y = yaw;
      if (s.playing) s.clone.mixer.update(dt);
    }
  });

  return (
    <group ref={wrap} visible={false}>
      {slots.map((s, i) => (
        <primitive key={i} object={s.carrier.group} />
      ))}
    </group>
  );
}

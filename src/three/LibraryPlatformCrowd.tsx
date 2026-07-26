// Foule du quai avec les mêmes modèles GLB que les PNJ de la rame.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import type * as THREE from 'three';
import { crowdList, initPlatformCrowd } from '../systems/platformCrowd';
import type { Appearance } from '../systems/appearance';
import { runtime } from '../systems/runtime';
import { useStore } from '../store';
import { rng } from '../textures/procedural';
import { CONFIG } from '../data/config';
import { MODELS_BASE, type CharacterManifest, type LogicalClip } from './characters/manifest';
import { buildTemplates, cloneVariant, type CharacterClone, type CharacterTemplate } from './characters/library';

const PLATFORM_Y = -0.06;
const FADE = 0.22;

interface Slot {
  clone: CharacterClone;
  currentKey: LogicalClip | '';
}

function pickTemplate(templates: CharacterTemplate[], app: Appearance, id: number): CharacterTemplate {
  const r = rng(12000 + id * 2654435761);
  const fem = app.feminine;
  let pool = templates.filter((t) => t.variant.archetypes.includes(app.archetype) && (t.variant.feminine ?? false) === fem);
  if (pool.length === 0) pool = templates.filter((t) => (t.variant.feminine ?? false) === fem);
  if (pool.length === 0) pool = templates;
  return pool[Math.floor(r() * pool.length)];
}

export function LibraryPlatformCrowd({ manifest }: { manifest: CharacterManifest }) {
  initPlatformCrowd();
  const doorSide = useStore((s) => s.doorSide);
  const wrap = useRef<THREE.Group>(null);
  const urls = useMemo(() => manifest.variants.map((v) => MODELS_BASE + v.file), [manifest]);
  const gltfs = useGLTF(urls);
  const templates = useMemo(() => buildTemplates(manifest, gltfs), [manifest, gltfs]);

  const slots = useMemo<Slot[]>(
    () =>
      crowdList.map((p) => {
        const template = pickTemplate(templates, p.appearance, p.id);
        const clone = cloneVariant(template, p.appearance);
        return { clone, currentKey: '' as LogicalClip | '' };
      }),
    [templates],
  );

  const walkClipSpeed = manifest.walkClipSpeed ?? CONFIG.walkSpeed;

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    if (wrap.current) {
      wrap.current.visible = runtime.platformFade > 0.02;
      wrap.current.position.z = runtime.platformSlide;
      wrap.current.rotation.y = doorSide === 1 ? 0 : Math.PI;
    }
    for (let i = 0; i < crowdList.length; i++) {
      const p = crowdList[i];
      const s = slots[i];
      if (!s) continue;
      const { wrap: body, mixer, actions, bones } = s.clone;
      if (p.state === 'hidden' || runtime.platformFade < 0.04) {
        body.visible = false;
        s.currentKey = '';
        continue;
      }
      body.visible = true;

      const walking = p.state === 'ambling' || p.state === 'patrolling';
      let key: LogicalClip | '' = '';
      if (walking) key = actions.walk ? 'walk' : actions.standIdle ? 'standIdle' : '';
      else key = actions.standIdle ? 'standIdle' : '';

      if (key !== s.currentKey) {
        const prev = s.currentKey ? actions[s.currentKey] : undefined;
        const next = key ? actions[key] : undefined;
        if (prev) prev.fadeOut(FADE);
        if (next) {
          next.reset().fadeIn(FADE).play();
          next.time = (p.bobPhase % 1) * (next.getClip().duration || 1);
        }
        s.currentKey = key;
      }
      if (key === 'walk' && actions.walk) {
        actions.walk.timeScale = (CONFIG.walkSpeed * 0.92) / walkClipSpeed;
      }

      body.position.set(p.pos.x, PLATFORM_Y + p.bob, p.pos.z);
      body.rotation.set(0, p.yaw, 0);
      body.scale.setScalar(p.height);

      if (s.clone.restHead && bones.head) bones.head.quaternion.copy(s.clone.restHead);
      mixer.update(dt);
      if (bones.head) {
        bones.head.rotation.x += p.headPitch * 0.9;
        bones.head.rotation.y += p.lookYaw * 0.45;
      }
    }
  });

  return (
    <group ref={wrap} visible={false}>
      {slots.map((s, i) => (
        <primitive key={crowdList[i].id} object={s.clone.wrap} />
      ))}
    </group>
  );
}

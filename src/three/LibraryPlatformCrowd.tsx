// Foule du quai avec les mêmes modèles GLB que les PNJ de la rame.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import type * as THREE from 'three';
import { crowdList, initPlatformCrowd } from '../systems/platformCrowd';
import type { Appearance } from '../systems/appearance';
import { runtime } from '../systems/runtime';
import { useStore } from '../store';
import { DOOR_SIDE } from '../data/stations';
import { rng } from '../textures/procedural';
import { CONFIG } from '../data/config';
import { MODELS_BASE, type CharacterManifest, type LogicalClip } from './characters/manifest';
import { buildTemplates, cloneVariant, type CharacterClone, type CharacterTemplate } from './characters/library';
import { applyArmGesture, applyBodyPivot, makePoseState, type PoseState } from './characters/pose';
import { fallClipFor, fallCue, fallYawOffset } from './characters/fall';
import { attachProps, updatePropRig, handPropFor, type PropRig } from './characters/props';

const PLATFORM_Y = -0.06;
const FADE = 0.22;

interface Slot {
  clone: CharacterClone;
  pose: PoseState;
  props: PropRig;
  currentKey: LogicalClip | '';
  /** Part de la pose tenue par le clip de chute (0..1) — voir characters/fall.ts. */
  fallW: number;
  /** Fondu de sortie de la glissade en cours, mémorisé pour le retour à l'idle. */
  fallOut: number;
  /** Écart de cap de la glissade, lissé à part : le corps se vrille en partant. */
  fallYaw: number;
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
  // Même côté que le quai présent (platformIndex) — voir ProceduralPlatformCrowd.
  const platformIndex = useStore((s) => s.platformIndex);
  const doorSide = DOOR_SIDE[platformIndex];
  const wrap = useRef<THREE.Group>(null);
  const urls = useMemo(() => manifest.variants.map((v) => MODELS_BASE + v.file), [manifest]);
  const gltfs = useGLTF(urls);
  const templates = useMemo(() => buildTemplates(manifest, gltfs), [manifest, gltfs]);

  const slots = useMemo<Slot[]>(
    () =>
      crowdList.map((p) => {
        const template = pickTemplate(templates, p.appearance, p.id);
        const clone = cloneVariant(template, p.appearance);
        const props = attachProps(clone.wrap, p.appearance, template.variant.bagProp !== false);
        return { clone, pose: makePoseState(), props, currentKey: '' as LogicalClip | '', fallW: 0, fallOut: FADE, fallYaw: 0 };
      }),
    [templates],
  );

  const walkClipSpeed = manifest.walkClipSpeed ?? CONFIG.walkSpeed;

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const k = Math.min(1, dt * 6);
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

      const transit = p.state === 'arriving' || p.state === 'leaving' || p.state === 'boarding';
      const walking = p.state === 'ambling' || p.state === 'patrolling' || (transit && p.delay <= 0);

      // « shift » (report de poids) n'existe que côté quai : pas d'occupation
      // du catalogue derrière, donc pas de geste ni de chute.
      const act = p.action === 'shift' ? 'none' : p.action;

      // Glissade : le vrai clip de chute du pack, monté par characters/fall.ts.
      const cue = walking ? null : fallCue(act, p.actionT);
      const fallKey = cue && actions[cue.clip] ? cue.clip : '';
      if (cue && fallKey) s.fallOut = cue.fadeOut;

      let key: LogicalClip | '' = fallKey;
      if (key === '') {
        if (walking) key = actions.walk ? 'walk' : actions.standIdle ? 'standIdle' : '';
        else key = actions.standIdle ? 'standIdle' : '';
      }

      if (key !== s.currentKey) {
        const prev = s.currentKey ? actions[s.currentKey] : undefined;
        const next = key ? actions[key] : undefined;
        const fade = fallKey && cue ? cue.fadeIn : s.fallOut;
        if (prev) prev.fadeOut(fade);
        if (next) {
          next.reset().fadeIn(fade).play();
          next.time = (p.bobPhase % 1) * (next.getClip().duration || 1);
        }
        s.currentKey = key;
      }
      if (key === 'walk' && actions.walk) {
        actions.walk.timeScale = (CONFIG.walkSpeed * 0.92) / walkClipSpeed;
      }
      const fallAction = fallKey ? actions[fallKey] : undefined;
      if (fallAction && cue) {
        fallAction.paused = true;
        fallAction.time = cue.u * (fallAction.getClip().duration || 1);
      }
      const ramp = dt / Math.max(0.03, fallKey && cue ? cue.fadeIn : s.fallOut);
      s.fallW = Math.max(0, Math.min(1, s.fallW + (fallKey ? ramp : -ramp)));
      const rigid = 1 - s.fallW; // part laissée à la bascule de groupe
      s.fallYaw += ((fallKey ? 1 : 0) - s.fallYaw) * Math.min(1, dt * 3.5);

      // p.y : négatif dans une trémie d'escalier, où l'on descend vraiment.
      body.position.set(p.pos.x, PLATFORM_Y + p.y + p.bob * rigid, p.pos.z);
      // YXZ : le voyageur du quai fait face à la voie — en XYZ, son « penché
      // en avant » l'inclinait sur le côté (cf. LibraryPassengers).
      body.rotation.set(p.bodyLean * rigid, p.yaw + fallYawOffset(p.lookYaw, s.fallYaw), p.bodyRoll * rigid, 'YXZ');
      body.scale.setScalar(p.height);
      applyBodyPivot(body, p.bodyPivot * rigid, p.height);

      if (s.clone.restHead && bones.head) bones.head.quaternion.copy(s.clone.restHead);
      mixer.update(dt);
      if (bones.head) {
        bones.head.rotation.x += p.headPitch * 0.9;
        bones.head.rotation.y += p.lookYaw * 0.45;
        bones.head.rotation.z += p.headRoll;
      }
      // Le quai a droit aux mêmes gestes que la rame : jusqu'ici seul le
      // téléphone était rigé, et les soixante autres occupations n'y bougeaient
      // que la tête.
      applyArmGesture(s.clone, s.pose, k, {
        action: act,
        actionT: p.actionT,
        seated: false,
        posed: p.state === 'waiting',
        strapSide: 0,
        chatRole: p.chatRole,
        clipFall: (() => {
          const c = fallClipFor(act);
          return c !== null && actions[c] !== undefined;
        })(),
      });
      const held = handPropFor(act);
      updatePropRig(s.props, bones, body, true, held !== null && s.pose.phoneW > 0.05 ? held : null, s.pose.phoneSide);
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

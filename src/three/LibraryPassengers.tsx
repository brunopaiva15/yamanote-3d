// Rendu des PNJ à partir de modèles 3D riggés/animés (packs « librairie »,
// voir public/models/manifest.json et scripts/models-import.mjs). Consomme le
// MÊME état que l'ancien rendu procédural (systems/passengers) : machine à
// états, waypoints, regards, poignées — seul le « corps » change. Chaque slot
// du pool reçoit un clone (SkeletonUtils) d'une variante choisie de façon
// déterministe selon l'archétype ; les clips Sit/Idle/Walk sont mixés en
// crossfade, puis les overrides d'os (regard, tsurikawa, téléphone) et les
// accessoires (lunettes, masque, sacs) sont superposés.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { paxList, initPassengers } from '../systems/passengers';
import type { Appearance } from '../systems/appearance';
import { runtime } from '../systems/runtime';
import { CONFIG } from '../data/config';
import { rng } from '../textures/procedural';
import { MODELS_BASE, type CharacterManifest } from './characters/manifest';
import { buildTemplates, cloneVariant, type CharacterClone, type CharacterTemplate } from './characters/library';
import { applyPoseOverrides, makePoseState, type PoseState } from './characters/pose';
import { attachProps, updatePropRig, type PropRig } from './characters/props';
import type { LogicalClip } from './characters/manifest';

// Haut utile du coussin (monde) — même repère que Seats.tsx / rendu procédural.
const SEAT_TOP_Y = 0.45;
const FADE = 0.25; // durée de crossfade entre clips (s)

interface Slot {
  clone: CharacterClone;
  pose: PoseState;
  props: PropRig;
  currentKey: LogicalClip | '';
  seatFix: number; // décalage vertical lissé pour poser le bassin sur le coussin
}

// Variante déterministe par passager : filtrée par archétype et genre, tirée
// avec un flux seedé indépendant (l'apparence procédurale n'est pas décalée).
function pickTemplate(templates: CharacterTemplate[], app: Appearance, id: number): CharacterTemplate {
  const r = rng(9700 + id * 2654435761);
  const fem = app.feminine;
  let pool = templates.filter((t) => t.variant.archetypes.includes(app.archetype) && (t.variant.feminine ?? false) === fem);
  if (pool.length === 0) pool = templates.filter((t) => (t.variant.feminine ?? false) === fem);
  if (pool.length === 0) pool = templates;
  return pool[Math.floor(r() * pool.length)];
}

export function LibraryPassengers({ manifest }: { manifest: CharacterManifest }) {
  initPassengers();
  const urls = useMemo(() => manifest.variants.map((v) => MODELS_BASE + v.file), [manifest]);
  const gltfs = useGLTF(urls);
  const templates = useMemo(() => buildTemplates(manifest, gltfs), [manifest, gltfs]);

  const slots = useMemo<Slot[]>(
    () =>
      paxList.map((p) => {
        const template = pickTemplate(templates, p.appearance, p.id);
        const clone = cloneVariant(template, p.appearance);
        const props = attachProps(clone.wrap, p.appearance, template.variant.bagProp !== false);
        return { clone, pose: makePoseState(), props, currentKey: '', seatFix: 0 };
      }),
    [templates],
  );
  const slotsRef = useRef(slots);
  slotsRef.current = slots;

  const walkClipSpeed = manifest.walkClipSpeed ?? CONFIG.walkSpeed;

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const k = Math.min(1, dt * 6);
    for (let i = 0; i < paxList.length; i++) {
      const p = paxList[i];
      const s = slotsRef.current[i];
      if (!s) continue;
      const { wrap, mixer, actions, bones, template } = s.clone;
      if (p.state === 'hidden') {
        wrap.visible = false;
        s.currentKey = '';
        continue;
      }
      wrap.visible = true;

      const seated = p.state === 'seated';
      const walking = p.state === 'boarding' || p.state === 'alighting';

      // --- Choix du clip (avec repli si le pack n'a pas tout). Sans clip
      // assis, standIdle reste joué en sous-couche : le mixer réécrit ainsi
      // TOUS les os chaque frame (sinon les overrides additifs s'accumulent)
      // et l'assise manuelle replie les jambes par-dessus. ---
      let key: LogicalClip | '' = '';
      if (seated) key = actions.sitIdle ? 'sitIdle' : actions.standIdle ? 'standIdle' : '';
      else if (walking) key = actions.walk ? 'walk' : actions.standIdle ? 'standIdle' : '';
      else key = actions.standIdle ? 'standIdle' : '';
      if (key !== s.currentKey) {
        const prev = s.currentKey ? actions[s.currentKey] : undefined;
        const next = key ? actions[key] : undefined;
        if (prev) prev.fadeOut(FADE);
        if (next) {
          next.reset().fadeIn(FADE).play();
          // Déphasage : la foule ne respire pas à l'unisson.
          next.time = (p.bobPhase % 1) * (next.getClip().duration || 1);
        }
        s.currentKey = key;
      }
      if (key === 'walk' && actions.walk) {
        actions.walk.timeScale = CONFIG.walkSpeed / walkClipSpeed;
      }

      // --- Transformation du groupe (identique à l'ancien rendu). ---
      const standingSway = p.state === 'standing' ? runtime.sway * 0.035 : 0;
      const seatedSway = seated ? runtime.sway * 0.012 : 0;
      // Assis : le bassin est calé sur le coussin. Avec clip assis, on aligne
      // la hauteur des hanches du clip ; sans clip (assise manuelle), les
      // hanches restent à leur hauteur debout → on descend d'autant.
      const manualSit = seated && !actions.sitIdle;
      const targetFix = seated
        ? template.sitHipY != null && actions.sitIdle
          ? SEAT_TOP_Y + 0.01 - template.sitHipY * p.height
          : SEAT_TOP_Y + 0.01 - template.standHipY * p.height
        : 0;
      s.seatFix += (targetFix - s.seatFix) * k;
      wrap.position.set(
        p.pos.x + (p.state === 'standing' ? runtime.sway * 0.02 : 0),
        p.pos.y + p.bob + s.seatFix,
        p.pos.z,
      );
      wrap.rotation.set(p.bodyLean, p.yaw, standingSway + seatedSway);
      wrap.scale.setScalar(p.height);

      // --- Animation puis overrides d'os (le mixer réécrit la pose). Les os
      // à rotations additives repartent de leur pose de repos : si le clip
      // actif ne les anime pas, rien ne s'accumule. ---
      if (s.clone.restHead && bones.head) bones.head.quaternion.copy(s.clone.restHead);
      if (s.clone.restSpine && bones.spine) bones.spine.quaternion.copy(s.clone.restSpine);
      mixer.update(dt);
      applyPoseOverrides(p, bones, s.pose, k, manualSit, s.clone.legGeom);
      updatePropRig(s.props, bones, wrap, !seated);
    }
  });

  return (
    <group>
      {slots.map((s, i) => (
        <primitive key={paxList[i].id} object={s.clone.wrap} />
      ))}
    </group>
  );
}

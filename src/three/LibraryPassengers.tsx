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
import * as THREE from 'three';
import { paxList, initPassengers, type Pax } from '../systems/passengers';
import { isPairAction } from '../data/paxActions';
import { runtime } from '../systems/runtime';
import { CONFIG } from '../data/config';
import { MODELS_BASE, type CharacterManifest } from './characters/manifest';
import {
  buildTemplates,
  cloneVariant,
  disposeClone,
  pickTemplate,
  type CharacterClone,
  type CharacterTemplate,
} from './characters/library';
import { applyBodyPivot, applyPoseOverrides, makePoseState, type PoseState } from './characters/pose';
import { fallClipFor, fallCue, fallYawOffset } from './characters/fall';
import { attachProps, updatePropRig, handPropFor, type PropRig } from './characters/props';
import type { LogicalClip } from './characters/manifest';

// Haut utile du coussin (monde) — même repère que Seats.tsx / rendu procédural.
const SEAT_TOP_Y = 0.45;
const FADE = 0.25; // durée de crossfade entre clips (s)

interface Slot {
  /** Support stable dans la scène : le clone y est greffé, et remplacé. */
  holder: THREE.Group;
  clone: CharacterClone;
  pose: PoseState;
  props: PropRig;
  /** Identité que ce modèle représente — comparée à celle du PNJ chaque frame. */
  identity: number;
  currentKey: LogicalClip | '';
  seatFix: number; // décalage vertical lissé pour poser le bassin sur le coussin
  /** Part de la pose tenue par le clip de chute (0..1) — voir characters/fall.ts. */
  fallW: number;
  /** Fondu de sortie de la chute en cours, mémorisé pour le retour à l'idle. */
  fallOut: number;
  /** Écart de cap de la chute, lissé à part : le corps se vrille en tombant. */
  fallYaw: number;
}

/**
 * Reconstructions de modèle tolérées par frame quand le PNJ est HORS DE VUE.
 *
 * Une identité qui change sur un slot visible (le montant qui paraît au seuil)
 * est rebâtie sur-le-champ : c'est le seul cas où attendre se verrait. Les
 * autres — le slot rendu au pool en échange — patientent, et le coût d'un
 * arrêt s'étale sur quelques frames au lieu de tomber d'un bloc.
 */
const HIDDEN_REBUILDS_PER_FRAME = 2;

function buildBody(templates: CharacterTemplate[], p: Pax): Pick<Slot, 'clone' | 'props' | 'identity'> {
  const template = pickTemplate(templates, p.appearance, p.identity);
  const clone = cloneVariant(template, p.appearance);
  const props = attachProps(clone.wrap, p.appearance, template.variant.bagProp !== false);
  return { clone, props, identity: p.identity };
}

/** Ce slot ne représente plus la même personne : on refait son corps. */
function rebuildSlot(s: Slot, templates: CharacterTemplate[], p: Pax): void {
  disposeClone(s.clone);
  const body = buildBody(templates, p);
  s.clone = body.clone;
  s.props = body.props;
  s.identity = body.identity;
  s.pose = makePoseState();
  s.currentKey = '';
  s.seatFix = 0;
  s.fallW = 0;
  s.fallOut = FADE;
  s.fallYaw = 0;
  s.holder.add(body.clone.wrap);
}

export function LibraryPassengers({ manifest }: { manifest: CharacterManifest }) {
  initPassengers();
  const urls = useMemo(() => manifest.variants.map((v) => MODELS_BASE + v.file), [manifest]);
  const gltfs = useGLTF(urls);
  const templates = useMemo(() => buildTemplates(manifest, gltfs), [manifest, gltfs]);

  const slots = useMemo<Slot[]>(
    () =>
      paxList.map((p) => {
        const body = buildBody(templates, p);
        const holder = new THREE.Group();
        holder.add(body.clone.wrap);
        return {
          holder,
          ...body,
          pose: makePoseState(),
          currentKey: '',
          seatFix: 0,
          fallW: 0,
          fallOut: FADE,
          fallYaw: 0,
        };
      }),
    [templates],
  );
  const slotsRef = useRef(slots);
  slotsRef.current = slots;

  const walkClipSpeed = manifest.walkClipSpeed ?? CONFIG.walkSpeed;

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const k = Math.min(1, dt * 6);
    let rebuildBudget = HIDDEN_REBUILDS_PER_FRAME;
    for (let i = 0; i < paxList.length; i++) {
      const p = paxList[i];
      const s = slotsRef.current[i];
      if (!s) continue;
      if (s.identity !== p.identity) {
        // Visible : tout de suite, sinon le seuil montrerait l'ancien corps.
        if (p.state !== 'hidden') rebuildSlot(s, templates, p);
        else if (rebuildBudget > 0) {
          rebuildBudget--;
          rebuildSlot(s, templates, p);
        }
      }
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
      // et l'assise manuelle replie les jambes par-dessus.
      //
      // La chute passe avant tout le reste : c'est un VRAI clip du pack, monté
      // et scrubbé image par image (characters/fall.ts). La bascule de groupe
      // plus bas s'efface d'autant — elle n'est plus qu'un repli pour les packs
      // qui n'auraient pas de clip de chute. ---
      const cue = walking ? null : fallCue(p.action, p.actionT);
      const fallKey = cue && actions[cue.clip] ? cue.clip : '';
      if (cue && fallKey) s.fallOut = cue.fadeOut;

      let key: LogicalClip | '' = fallKey;
      if (key === '') {
        if (seated) key = actions.sitIdle ? 'sitIdle' : actions.standIdle ? 'standIdle' : '';
        else if (walking) key = actions.walk ? 'walk' : actions.standIdle ? 'standIdle' : '';
        else key = actions.standIdle ? 'standIdle' : '';
      }
      if (key !== s.currentKey) {
        const prev = s.currentKey ? actions[s.currentKey] : undefined;
        const next = key ? actions[key] : undefined;
        const fade = fallKey && cue ? cue.fadeIn : s.fallOut;
        if (prev) prev.fadeOut(fade);
        if (next) {
          next.reset().fadeIn(fade).play();
          // Déphasage : la foule ne respire pas à l'unisson.
          next.time = (p.bobPhase % 1) * (next.getClip().duration || 1);
        }
        s.currentKey = key;
      }
      if (key === 'walk' && actions.walk) {
        actions.walk.timeScale = CONFIG.walkSpeed / walkClipSpeed;
      }
      // Le clip de chute n'avance pas tout seul : c'est la piste de clés qui
      // le positionne, image par image (temps au sol, relevé à l'envers).
      const fallAction = fallKey ? actions[fallKey] : undefined;
      if (fallAction && cue) {
        fallAction.paused = true;
        fallAction.time = cue.u * (fallAction.getClip().duration || 1);
      }
      // Rampe LINÉAIRE, calée sur les fondus du mixer : la bascule de repli
      // s'éteint exactement au rythme où le clip monte.
      const ramp = dt / Math.max(0.03, fallKey && cue ? cue.fadeIn : s.fallOut);
      s.fallW = Math.max(0, Math.min(1, s.fallW + (fallKey ? ramp : -ramp)));
      const rigid = 1 - s.fallW; // part laissée à la bascule de groupe
      // Le cap, lui, se vrille plus lentement que le clip ne monte : à la
      // vitesse du fondu (100 ms) le voyageur pivotait d'un bloc avant même
      // d'avoir commencé à tomber.
      s.fallYaw += ((fallKey ? 1 : 0) - s.fallYaw) * Math.min(1, dt * 3.5);

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
        // Le clip de chute descend le corps lui-même : le décalage vertical
        // du repli s'efface avec lui.
        p.pos.y + p.bob * rigid + s.seatFix,
        p.pos.z,
      );
      // Assis en discussion : lean/roll du wrap = 0 (sinon pieds qui glissent).
      const lean =
        (seated && isPairAction(p.action)
          ? 0
          : seated
            ? Math.min(p.bodyLean, 0.08)
            : p.bodyLean) * rigid;
      // YXZ : le cap d'abord, PUIS le buste dans le repère du personnage. En
      // XYZ (l'ordre par défaut), `bodyLean` bascule autour du X du MONDE : un
      // assis, tourné vers la vitre, penchait de côté au lieu de se pencher en
      // avant, et un debout sur deux tombait à la renverse.
      wrap.rotation.set(
        lean,
        p.yaw + fallYawOffset(p.lookYawTarget, s.fallYaw),
        standingSway + seatedSway + (seated ? 0 : p.bodyRoll * rigid),
        'YXZ',
      );
      wrap.scale.setScalar(p.height);
      applyBodyPivot(wrap, p.bodyPivot * rigid, p.height);

      // --- Animation puis overrides d'os (le mixer réécrit la pose). Les os
      // à rotations additives repartent de leur pose de repos : si le clip
      // actif ne les anime pas, rien ne s'accumule. ---
      if (s.clone.restHead && bones.head) bones.head.quaternion.copy(s.clone.restHead);
      if (s.clone.restSpine && bones.spine) bones.spine.quaternion.copy(s.clone.restSpine);
      mixer.update(dt);
      // Le pack sait-il jouer CETTE chute ? La réponse ne dépend pas de
      // l'instant : les bras suivent leur piste de clés du début à la fin de
      // l'action, y compris une fois le clip rendu à l'idle.
      const packFall = fallClipFor(p.action);
      applyPoseOverrides(p, s.clone, s.pose, k, manualSit, packFall !== null && actions[packFall] !== undefined);
      const held = (seated || p.state === 'standing') ? handPropFor(p.action) : null;
      const phoneVisible = held !== null && s.pose.phoneW > 0.05;
      updatePropRig(s.props, bones, wrap, !seated, phoneVisible ? held : null, s.pose.phoneSide);
    }
  });

  return (
    <group>
      {slots.map((s, i) => (
        <primitive key={paxList[i].id} object={s.holder} />
      ))}
    </group>
  );
}

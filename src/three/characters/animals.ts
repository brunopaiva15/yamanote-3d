// Animaux « librairie » : le pack animalier (Quaternius — Ultimate Animated
// Animals) chargé et préparé comme les personnages, mais avec trois
// différences qui comptent pour un quadrupède :
//
//   - la NORMALISATION se fait à une taille RÉELLE et par espèce. Un
//     personnage est toujours haut de SKELETON_TOP ; un chien, non — un corgi
//     fait 30 cm au sommet du crâne, un husky 62. La hauteur est donc une
//     donnée du manifeste, pas une constante.
//   - les CLIPS ne sont pas les mêmes (Idle / Walk / Run / Eating), et le
//     reniflage du sol — le geste qui fait un chien en promenade — se trouve
//     dans le clip de repas des packs.
//   - la VITESSE D'AUTEUR des cycles est MESURÉE, jamais déclarée : aucun pack
//     ne l'annonce et elle varie du simple au double d'une espèce à l'autre.
//     Deux façons de la lire, dans cet ordre : le déplacement de la racine
//     quand il y en a un, sinon la FOULÉE — le va-et-vient d'un pied posé, qui
//     mesure exactement la distance dont le sol défile. Les packs animaliers
//     testés animent tous sur place, c'est donc la seconde qui sert. Sans
//     elle, les pattes patinent.
//
// Le collier (attache de la laisse) suit l'os de cou du rig, résolu par la
// même correspondance floue que les personnages ; à défaut, un point mesuré à
// l'avant du gabarit.

import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { stripRootMotionXZ, type LoadedGltf } from './library';
import { MODELS_BASE } from './manifest';

/** Les animaux vivent dans leur propre dossier : pack, licence et manifeste séparés. */
export const ANIMALS_BASE = `${MODELS_BASE}animals/`;

// `sniff` : museau au sol, le geste de promenade. Les packs ne le livrent pas
// sous ce nom — c'est leur clip de repas (« Eating »), qui est exactement ça.
export type AnimalClip = 'idle' | 'walk' | 'run' | 'sniff' | 'sit';

export interface AnimalVariant {
  id: string;
  file: string; // GLB dans public/models/animals/
  /** Hauteur RÉELLE du modèle debout, en mètres (oreilles comprises). */
  height: number;
  /** Correction d'orientation si le modèle ne regarde pas +Z. */
  faceYaw?: number;
  /** Noms exacts des clips si la détection floue se trompe. */
  clips?: Partial<Record<AnimalClip, string>>;
  /** Vitesses (m/s) « auteur » des cycles — sinon mesurées sur la racine. */
  walkClipSpeed?: number;
  runClipSpeed?: number;
}

export interface AnimalManifest {
  version: 1;
  source?: string; // pack d'origine (traçabilité licence)
  license?: string;
  variants: AnimalVariant[];
}

function isValidManifest(data: unknown): data is AnimalManifest {
  if (typeof data !== 'object' || data === null) return false;
  const m = data as AnimalManifest;
  return (
    m.version === 1 &&
    Array.isArray(m.variants) &&
    m.variants.length > 0 &&
    m.variants.every((v) => typeof v.file === 'string' && typeof v.height === 'number' && v.height > 0)
  );
}

/**
 * undefined = vérification en cours, null = pas de pack animalier installé
 * (cas par défaut : le quai n'a alors simplement aucun chien).
 */
export function useAnimalManifest(): AnimalManifest | null | undefined {
  const [manifest, setManifest] = useState<AnimalManifest | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    fetch(`${ANIMALS_BASE}manifest.json`, { cache: 'no-cache' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (alive) setManifest(isValidManifest(data) ? data : null);
      })
      .catch(() => {
        if (alive) setManifest(null);
      });
    return () => {
      alive = false;
    };
  }, []);
  return manifest;
}

// --- Résolution des os d'un quadrupède ------------------------------------
//
// La résolution des personnages (library.ts) ne trouve rien ici : les rigs
// animaliers n'ont ni « Hips » ni « Neck », mais un « Body » à la racine et
// une chaîne « Neck1 / Neck2 / Neck3 ». On ne cherche que deux choses :
//
//   - la RACINE, seule cible possible d'un éventuel déplacement d'auteur (root
//     motion). On la prend par la STRUCTURE — l'os dont le parent n'est pas un
//     os — et non par son nom : c'est vrai de tous les rigs, quel que soit le
//     pack.
//   - le COLLIER, où s'accroche la laisse : le DERNIER maillon du cou (celui
//     qui porte la tête), sinon la tête elle-même.

export interface AnimalBones {
  root: THREE.Bone | null;
  collar: THREE.Bone | null;
}

function isBone(obj: THREE.Object3D | null): boolean {
  return obj !== null && (obj as THREE.Bone).isBone === true;
}

export function resolveAnimalBones(root: THREE.Object3D): AnimalBones {
  let rootBone: THREE.Bone | null = null;
  let head: THREE.Bone | null = null;
  let neck: THREE.Bone | null = null;
  let neckRank = -1;
  root.traverse((obj) => {
    if (!(obj as THREE.Bone).isBone) return;
    const bone = obj as THREE.Bone;
    if (!rootBone && !isBone(bone.parent)) rootBone = bone;
    const name = bone.name.toLowerCase().replace(/[\s._-]/g, '');
    if (!head && /^head/.test(name)) head = bone;
    // « neck3 » l'emporte sur « neck1 » : le collier est en haut du cou, pas
    // à sa naissance sur le poitrail.
    const m = /^neck(\d*)$/.exec(name);
    if (m) {
      const rank = m[1] === '' ? 0 : parseInt(m[1], 10);
      if (rank > neckRank) {
        neckRank = rank;
        neck = bone;
      }
    }
  });
  return { root: rootBone, collar: neck ?? head };
}

// --- Résolution floue des clips ------------------------------------------

function findClip(clips: THREE.AnimationClip[], include: RegExp, exclude: RegExp | null, prefer: RegExp | null): THREE.AnimationClip | null {
  let candidates = clips.filter((c) => include.test(c.name) && !(exclude && exclude.test(c.name)));
  if (candidates.length === 0) return null;
  if (prefer) {
    const preferred = candidates.filter((c) => prefer.test(c.name));
    if (preferred.length > 0) candidates = preferred;
  }
  candidates.sort((a, b) => a.name.length - b.name.length);
  return candidates[0];
}

function resolveAnimalClips(variant: AnimalVariant, clips: THREE.AnimationClip[]): Partial<Record<AnimalClip, THREE.AnimationClip>> {
  const byName = (name: string | undefined) => (name ? (clips.find((c) => c.name === name) ?? null) : null);
  const out: Partial<Record<AnimalClip, THREE.AnimationClip>> = {};
  const idle = byName(variant.clips?.idle) ?? findClip(clips, /idle/i, /(sit|sleep|lay|lie|attack|eat|swim|death|clicked)/i, /^idle$/i);
  const walk = byName(variant.clips?.walk) ?? findClip(clips, /walk/i, /(back|left|right|strafe|swim)/i, /^walk(ing)?$/i);
  // Trot et galop valent course : un chien qui rattrape son maître ne marche
  // plus, et aucun pack n'a de clip « petit trot en laisse ».
  const run = byName(variant.clips?.run) ?? findClip(clips, /(run|gallop|trot)/i, /(swim|attack)/i, /^run(ning)?$/i);
  // Museau au sol : c'est le clip de repas des packs, joué là où le chien
  // s'arrête renifler — la tête descend, le corps reste planté.
  const sniff = byName(variant.clips?.sniff) ?? findClip(clips, /(eat|graze|feed|sniff|smell|bite)/i, /(attack|death)/i, /^eating$/i);
  const sit = byName(variant.clips?.sit) ?? findClip(clips, /(sit|lay|lie|rest)/i, /(stand|up|down_to|attack)/i, /^sit(ting)?$/i);
  if (idle) out.idle = idle;
  if (walk) out.walk = walk;
  if (run) out.run = run;
  if (sniff) out.sniff = sniff;
  if (sit) out.sit = sit;
  return out;
}

/**
 * Vitesse d'auteur d'un cycle locomoteur, en mètres/seconde : distance
 * parcourue par la RACINE sur la durée du clip. Les packs animaliers déplacent
 * la racine (root motion) ; le jeu pilote lui-même la position et l'aplatit,
 * mais ce déplacement est la seule mesure fiable de la vitesse pour laquelle
 * le cycle a été animé. Renvoie null pour un clip sur place.
 */
// Le déplacement est APLATI juste après la mesure, et les clips sont partagés
// par le cache de useGLTF : une seconde construction des templates (StrictMode,
// changement d'identité du manifeste) ne mesurerait plus rien. La vitesse est
// donc mémorisée sur le clip lui-même.
const authoredSpeed = new WeakMap<THREE.AnimationClip, number>();

/** Déplacement d'auteur de la racine : exact, quand le clip en a un. */
function measureRootSpeed(clip: THREE.AnimationClip, rootName: string, normScale: number): number | null {
  const track = clip.tracks.find((t) => t.name === `${rootName}.position`);
  if (!track || !(track instanceof THREE.VectorKeyframeTrack)) return null;
  const v = track.values;
  const n = v.length / 3;
  if (n < 2 || clip.duration <= 1e-3) return null;
  const dx = v[(n - 1) * 3] - v[0];
  const dz = v[(n - 1) * 3 + 2] - v[2];
  const dist = Math.hypot(dx, dz) * normScale;
  return dist > 0.05 ? dist / clip.duration : null;
}

/**
 * Vitesse d'auteur d'un cycle animé SUR PLACE — c'est le cas de tous les packs
 * animaliers testés : rien ne bouge à la racine, il n'y a donc rien à y lire.
 *
 * On la relève alors sur la FOULÉE. Un pied posé ne glisse pas : sur un cycle,
 * son va-et-vient d'avant en arrière mesure exactement la distance dont le sol
 * défile. Les pieds sont trouvés par leur géométrie — les os qui restent près
 * du sol et qui voyagent le plus — et non par leur nom : ces rigs pilotent
 * leurs pattes par des cibles IK dont aucun pack ne nomme les os pareil.
 *
 * `probe` est un clone jetable : jouer un clip déforme le squelette, et le
 * template doit rester dans sa pose de repos pour les mesures de gabarit.
 */
function measureStrideSpeed(
  probe: THREE.Object3D,
  clip: THREE.AnimationClip,
  normScale: number,
  rawHeight: number,
): number | null {
  if (clip.duration <= 1e-3) return null;
  const feet: THREE.Bone[] = [];
  probe.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  probe.traverse((obj) => {
    if (!(obj as THREE.Bone).isBone) return;
    obj.getWorldPosition(v);
    // Au repos, un pied est dans le quart bas du gabarit.
    if (v.y < rawHeight * 0.25) feet.push(obj as THREE.Bone);
  });
  if (feet.length === 0) return null;

  const lo = new Float32Array(feet.length).fill(Infinity);
  const hi = new Float32Array(feet.length).fill(-Infinity);
  const mixer = new THREE.AnimationMixer(probe);
  const action = mixer.clipAction(clip);
  action.play();
  // 24 points suffisent : on ne cherche que les deux extrêmes d'une courbe
  // lisse, et la mesure se paie au chargement du pack.
  const N = 24;
  const dt = clip.duration / N;
  for (let i = 0; i < N; i++) {
    mixer.update(i === 0 ? 0 : dt);
    probe.updateMatrixWorld(true);
    for (let f = 0; f < feet.length; f++) {
      feet[f].getWorldPosition(v);
      if (v.z < lo[f]) lo[f] = v.z;
      if (v.z > hi[f]) hi[f] = v.z;
    }
  }
  action.stop();
  mixer.uncacheClip(clip);

  let stride = 0;
  for (let f = 0; f < feet.length; f++) stride = Math.max(stride, hi[f] - lo[f]);
  const dist = stride * normScale;
  // Sous quelques centimètres, ce n'est pas une foulée mais du bruit : le clip
  // ne décrit aucune locomotion (piétinement, reniflage sur place).
  return dist > 0.04 ? dist / clip.duration : null;
}

/** Vitesse d'auteur du cycle : racine si elle bouge, foulée sinon. */
function authoredSpeedOf(
  clip: THREE.AnimationClip,
  rootName: string | null,
  probe: THREE.Object3D,
  normScale: number,
  rawHeight: number,
): number | null {
  const known = authoredSpeed.get(clip);
  if (known !== undefined) return known > 0 ? known : null;
  const speed =
    (rootName ? measureRootSpeed(clip, rootName, normScale) : null) ??
    measureStrideSpeed(probe, clip, normScale, rawHeight) ??
    0;
  authoredSpeed.set(clip, speed);
  return speed > 0 ? speed : null;
}

// --- Préparation des templates -------------------------------------------

export interface AnimalTemplate {
  variant: AnimalVariant;
  scene: THREE.Object3D;
  clips: Partial<Record<AnimalClip, THREE.AnimationClip>>;
  normScale: number; // hauteur brute → variant.height mètres
  footOffset: number; // décalage amenant les pattes à y=0 (unités brutes)
  /** Longueur museau → croupe, en mètres. */
  length: number;
  /** Vitesses d'auteur retenues (manifeste, sinon mesure, sinon défaut). */
  walkSpeed: number;
  runSpeed: number;
  /** Attache de laisse de secours, dans le repère normalisé du modèle. */
  collarLocal: THREE.Vector3;
}

export function buildAnimalTemplates(manifest: AnimalManifest, gltfs: LoadedGltf[]): AnimalTemplate[] {
  return manifest.variants.map((variant, i) => {
    const gltf = gltfs[i];
    const scene = gltf.scene;
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    const rawHeight = Math.max(0.01, box.max.y - box.min.y);
    const normScale = variant.height / rawHeight;
    const footOffset = -box.min.y;
    const length = Math.max(box.max.z - box.min.z, box.max.x - box.min.x) * normScale;

    const clips = resolveAnimalClips(variant, gltf.animations);
    const bones = resolveAnimalBones(scene);
    let walkSpeed = variant.walkClipSpeed ?? 0;
    let runSpeed = variant.runClipSpeed ?? 0;
    if ((!walkSpeed && clips.walk) || (!runSpeed && clips.run)) {
      // Clone jetable : la mesure de foulée joue les clips, ce qui déforme le
      // squelette — le template, lui, doit rester dans sa pose de repos.
      const probe = cloneSkeleton(scene);
      const rootName = bones.root?.name ?? null;
      if (!walkSpeed && clips.walk) walkSpeed = authoredSpeedOf(clips.walk, rootName, probe, normScale, rawHeight) ?? 0;
      if (!runSpeed && clips.run) runSpeed = authoredSpeedOf(clips.run, rootName, probe, normScale, rawHeight) ?? 0;
    }
    // L'aplatissement vient APRÈS la mesure, sinon il n'y a plus rien à lire
    // sur la racine des packs qui, eux, la déplacent.
    if (bones.root) {
      for (const key of ['walk', 'run'] as const) {
        const clip = clips[key];
        if (clip) stripRootMotionXZ(clip, bones.root.name);
      }
    }

    return {
      variant,
      scene,
      clips,
      normScale,
      footOffset,
      length,
      // Repli si le clip ne décrit aucune locomotion mesurable (ni racine
      // déplacée, ni foulée) : ordre de grandeur d'un chien moyen.
      walkSpeed: walkSpeed || 0.5,
      runSpeed: runSpeed || 1.6,
      // Repli du collier : à l'avant du gabarit, aux trois quarts de la
      // hauteur — la base du cou d'un quadrupède, à quelques centimètres près.
      collarLocal: new THREE.Vector3(0, variant.height * 0.74, length * 0.36),
    };
  });
}

// --- Clonage --------------------------------------------------------------

export interface AnimalClone {
  wrap: THREE.Group; // groupe piloté par le rendu (pos / yaw)
  mixer: THREE.AnimationMixer;
  actions: Partial<Record<AnimalClip, THREE.AnimationAction>>;
  /** Os portant le collier (cou, sinon tête) : null → repli sur collarLocal. */
  collar: THREE.Bone | null;
  template: AnimalTemplate;
}

export function cloneAnimal(template: AnimalTemplate): AnimalClone {
  const model = cloneSkeleton(template.scene);
  model.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    // Comme les personnages : les bornes d'un SkinnedMesh ne suivent pas la
    // pose, on ne les laisse pas décider du culling (au plus deux chiens).
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
  });

  // Wrapper de normalisation : pattes à y=0, taille réelle, face +Z.
  const inner = new THREE.Group();
  inner.scale.setScalar(template.normScale);
  inner.position.y = template.footOffset * template.normScale;
  inner.rotation.y = template.variant.faceYaw ?? 0;
  inner.add(model);
  const wrap = new THREE.Group();
  wrap.add(inner);
  wrap.visible = false;

  const mixer = new THREE.AnimationMixer(model);
  const actions: Partial<Record<AnimalClip, THREE.AnimationAction>> = {};
  for (const [key, clip] of Object.entries(template.clips)) {
    actions[key as AnimalClip] = mixer.clipAction(clip);
  }

  return { wrap, mixer, actions, collar: resolveAnimalBones(model).collar, template };
}

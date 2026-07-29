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
//   - la VITESSE D'AUTEUR du cycle de marche est MESURÉE sur le déplacement de
//     la racine avant qu'on l'aplatisse : les packs animaliers ne l'annoncent
//     nulle part et elle varie d'une espèce à l'autre. Sans elle, les pattes
//     patinent.
//
// Le collier (attache de la laisse) suit l'os de cou du rig, résolu par la
// même correspondance floue que les personnages ; à défaut, un point mesuré à
// l'avant du gabarit.

import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { resolveBones, stripRootMotionXZ, type LoadedGltf } from './library';
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

function measureClipSpeed(clip: THREE.AnimationClip, hipsName: string, normScale: number): number | null {
  const known = authoredSpeed.get(clip);
  if (known !== undefined) return known > 0 ? known : null;
  const track = clip.tracks.find((t) => t.name === `${hipsName}.position`);
  if (!track || !(track instanceof THREE.VectorKeyframeTrack)) return null;
  const v = track.values;
  const n = v.length / 3;
  if (n < 2 || clip.duration <= 1e-3) return null;
  const dx = v[(n - 1) * 3] - v[0];
  const dz = v[(n - 1) * 3 + 2] - v[2];
  const dist = Math.hypot(dx, dz) * normScale;
  const speed = dist > 0.05 ? dist / clip.duration : 0;
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
    const bones = resolveBones(scene);
    let walkSpeed = variant.walkClipSpeed ?? 0;
    let runSpeed = variant.runClipSpeed ?? 0;
    if (bones.hips) {
      if (!walkSpeed && clips.walk) walkSpeed = measureClipSpeed(clips.walk, bones.hips.name, normScale) ?? 0;
      if (!runSpeed && clips.run) runSpeed = measureClipSpeed(clips.run, bones.hips.name, normScale) ?? 0;
      // L'aplatissement vient APRÈS la mesure, sinon il n'y a plus rien à mesurer.
      for (const key of ['walk', 'run'] as const) {
        const clip = clips[key];
        if (clip) stripRootMotionXZ(clip, bones.hips.name);
      }
    }

    return {
      variant,
      scene,
      clips,
      normScale,
      footOffset,
      length,
      // Défauts plausibles pour un chien de taille moyenne, si le pack anime
      // ses cycles sur place et que le manifeste ne dit rien.
      walkSpeed: walkSpeed || 1.1,
      runSpeed: runSpeed || 3.2,
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

  const bones = resolveBones(model);
  return { wrap, mixer, actions, collar: bones.neck ?? bones.head ?? null, template };
}

// Chargement et préparation des personnages « librairie » : normalisation des
// modèles au squelette local du jeu (pieds à y=0, crâne à SKELETON_TOP=1.445,
// voir systems/appearance), clonage par passager (SkeletonUtils), résolution
// FLOUE des os et des clips (conventions Quaternius / KayKit / Mixamo), teinte
// des matériaux nommés depuis l'apparence, et mesures d'assise (hauteur des
// hanches du clip assis) pour poser le bassin sur le coussin.

import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Appearance } from '../../systems/appearance';
import { SKELETON_TOP } from '../../systems/appearance';
import type { CharacterManifest, CharacterVariant, LogicalClip, TintRole } from './manifest';

export type LogicalBone =
  | 'hips'
  | 'spine'
  | 'neck'
  | 'head'
  | 'upperArmL'
  | 'upperArmR'
  | 'foreArmL'
  | 'foreArmR'
  | 'handL'
  | 'handR'
  | 'upLegL'
  | 'upLegR'
  | 'legL'
  | 'legR'
  | 'footL'
  | 'footR';

export type BoneMap = Partial<Record<LogicalBone, THREE.Bone>>;

// Forme minimale d'un glTF chargé (drei/three-stdlib et three/examples ont
// des types incompatibles entre eux ; seuls ces deux champs nous servent).
export interface LoadedGltf {
  scene: THREE.Object3D;
  animations: THREE.AnimationClip[];
}

export interface CharacterTemplate {
  variant: CharacterVariant;
  scene: THREE.Object3D;
  clips: Partial<Record<LogicalClip, THREE.AnimationClip>>;
  normScale: number; // rawHeight → SKELETON_TOP
  footOffset: number; // décalage pour amener les pieds à y=0 (unités brutes)
  sitHipY: number | null; // hanches du clip assis, unités normalisées (null : pas de clip)
  standHipY: number; // hanches au repos, unités normalisées (fallback assis manuel)
}

// Géométrie des jambes mesurée sur la bind pose, en unités normalisées —
// consommée par l'assise manuelle (pose.ts) pour poser les pieds au sol.
export interface LegGeom {
  shinLen: number; // distance genou → pivot du pied
  ankleH: number; // hauteur du pivot du pied quand il est posé au sol
  footDetached: boolean; // pieds non parentés aux tibias (cibles IK Quaternius)
}

// Os des bras dont l'orientation de bind pose est mémorisée : l'assise
// manuelle reconstruit les bras à partir de cette pose SYMÉTRIQUE (droite =
// miroir de gauche), et non de la pose du clip dont le roulis diffère par
// côté (mains inégales à l'arrivée).
export type ArmBoneKey = 'upperArmL' | 'upperArmR' | 'foreArmL' | 'foreArmR' | 'handL' | 'handR';
export const ARM_BONE_KEYS: readonly ArmBoneKey[] = ['upperArmL', 'upperArmR', 'foreArmL', 'foreArmR', 'handL', 'handR'];

export interface CharacterClone {
  wrap: THREE.Group; // groupe piloté par le rendu (pos / yaw / échelle)
  mixer: THREE.AnimationMixer;
  actions: Partial<Record<LogicalClip, THREE.AnimationAction>>;
  bones: BoneMap;
  legGeom: LegGeom | null;
  // Orientations de repos des os des bras, RELATIVES à la poitrine (chestRef)
  // — la vrille du buste, commune aux deux côtés, est ainsi factorisée.
  armRest: Partial<Record<ArmBoneKey, THREE.Quaternion>>;
  // Os de référence des repos des bras (parent des clavicules) ; wrap à défaut.
  chestRef: THREE.Object3D | null;
  // Clavicules (parents des bras) et leur rotation LOCALE de bind pose : le
  // clip idle les anime asymétriquement, l'assise les remet au neutre.
  clavicles: [THREE.Bone, THREE.Quaternion][];
  template: CharacterTemplate;
  // Pose de repos des os recevant des rotations ADDITIVES (tête, buste) :
  // restaurée avant mixer.update pour qu'aucun ajout ne s'accumule si un clip
  // n'anime pas ces os (le mixer ne les réécrirait alors jamais).
  restHead: THREE.Quaternion | null;
  restSpine: THREE.Quaternion | null;
}

// --- Résolution floue des os ---------------------------------------------

// Normalise un nom d'os : minuscules, préfixes d'armature retirés, séparateurs
// supprimés ("mixamorig:LeftUpLeg" → "leftupleg", "UpperArm.L" → "upperarml").
function normBoneName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^mixamorig[:_]?/, '')
    .replace(/^.*\|/, '')
    .replace(/[\s._-]/g, '');
}

// Détecte le côté puis renvoie le nom sans marqueur de côté.
function splitSide(n: string): { side: 'L' | 'R' | ''; base: string } {
  if (n.startsWith('left')) return { side: 'L', base: n.slice(4) };
  if (n.startsWith('right')) return { side: 'R', base: n.slice(5) };
  if (n.endsWith('left')) return { side: 'L', base: n.slice(0, -4) };
  if (n.endsWith('right')) return { side: 'R', base: n.slice(0, -5) };
  if (n.endsWith('l') && n.length > 1) return { side: 'L', base: n.slice(0, -1) };
  if (n.endsWith('r') && n.length > 1) return { side: 'R', base: n.slice(0, -1) };
  return { side: '', base: n };
}

// Alias acceptés par os logique (base sans côté), par ordre de priorité.
const CENTER_ALIASES: Record<'hips' | 'spine' | 'neck' | 'head', string[]> = {
  hips: ['hips', 'hip', 'pelvis'],
  spine: ['spine', 'spine0', 'spine1', 'torso', 'chest'],
  neck: ['neck'],
  head: ['head'],
};
const SIDE_ALIASES: Record<'upperArm' | 'foreArm' | 'hand' | 'upLeg' | 'leg' | 'foot', string[]> = {
  upperArm: ['upperarm', 'armupper', 'uparm', 'arm', 'shoulder'],
  foreArm: ['forearm', 'lowerarm', 'armlower', 'elbow'],
  hand: ['hand', 'wrist'],
  upLeg: ['upleg', 'upperleg', 'legupper', 'thigh'],
  leg: ['lowerleg', 'leglower', 'shin', 'calf', 'knee', 'leg'],
  foot: ['foot', 'ankle'],
};

export function resolveBones(root: THREE.Object3D): BoneMap {
  const map: BoneMap = {};
  const rank: Partial<Record<LogicalBone, number>> = {};
  root.traverse((obj) => {
    if (!(obj as THREE.Bone).isBone) return;
    const bone = obj as THREE.Bone;
    const { side, base } = splitSide(normBoneName(bone.name));
    const assign = (key: LogicalBone, score: number) => {
      if (rank[key] === undefined || score < rank[key]) {
        rank[key] = score;
        map[key] = bone;
      }
    };
    if (side === '') {
      for (const [key, aliases] of Object.entries(CENTER_ALIASES)) {
        const i = aliases.indexOf(base);
        if (i >= 0) assign(key as LogicalBone, i);
      }
    } else {
      for (const [key, aliases] of Object.entries(SIDE_ALIASES)) {
        const i = aliases.indexOf(base);
        if (i >= 0) assign(`${key}${side}` as LogicalBone, i);
      }
    }
  });
  return map;
}

// --- Résolution floue des clips ------------------------------------------

function findClip(clips: THREE.AnimationClip[], include: RegExp, exclude: RegExp | null, prefer: RegExp | null): THREE.AnimationClip | null {
  let candidates = clips.filter((c) => include.test(c.name) && !(exclude && exclude.test(c.name)));
  if (candidates.length === 0) return null;
  if (prefer) {
    const preferred = candidates.filter((c) => prefer.test(c.name));
    if (preferred.length > 0) candidates = preferred;
  }
  // Le nom le plus court est en général le clip « de base » (Idle vs Idle_Gun).
  candidates.sort((a, b) => a.name.length - b.name.length);
  return candidates[0];
}

export function resolveClips(variant: CharacterVariant, clips: THREE.AnimationClip[]): Partial<Record<LogicalClip, THREE.AnimationClip>> {
  const byName = (name: string | undefined) => (name ? (clips.find((c) => c.name === name) ?? null) : null);
  const sitIdle =
    byName(variant.clips?.sitIdle) ??
    findClip(clips, /sit/i, /(stand|down|up|exit|enter|floor|ground)/i, /(chair|idle|loop)/i);
  const standIdle =
    byName(variant.clips?.standIdle) ??
    findClip(clips, /idle/i, /(sit|gun|sword|crouch|jump|combat|melee|ranged|hold|carry|2h|1h)/i, /^idle$/i);
  const walk =
    byName(variant.clips?.walk) ??
    findClip(clips, /walk/i, /(back|left|right|strafe|crouch|jump|gun|sword|carry|melee|combat)/i, /^walk(ing)?$/i);
  const out: Partial<Record<LogicalClip, THREE.AnimationClip>> = {};
  if (sitIdle) out.sitIdle = sitIdle;
  if (standIdle) out.standIdle = standIdle;
  if (walk) out.walk = walk;
  return out;
}

// --- Préparation des templates -------------------------------------------

// Certains clips de marche déplacent les hanches en XZ (root motion) : le jeu
// pilote lui-même la position, on ne garde que la composante verticale.
function stripRootMotionXZ(clip: THREE.AnimationClip, hipsName: string): void {
  for (const track of clip.tracks) {
    if (track.name === `${hipsName}.position` && track instanceof THREE.VectorKeyframeTrack) {
      const values = track.values;
      const n = values.length / 3;
      const x0 = values[0];
      const z0 = values[2];
      for (let i = 0; i < n; i++) {
        values[i * 3] = x0;
        values[i * 3 + 2] = z0;
      }
    }
  }
}

// Hauteur monde (locale au modèle brut) des hanches après application d'un
// clip sur un clone sonde — sert à caler le bassin sur le coussin.
function measureHipY(template: { scene: THREE.Object3D }, clip: THREE.AnimationClip | null): number | null {
  const probe = cloneSkeleton(template.scene);
  const bones = resolveBones(probe);
  if (!bones.hips) return null;
  if (clip) {
    const mixer = new THREE.AnimationMixer(probe);
    const action = mixer.clipAction(clip);
    action.play();
    mixer.update(clip.duration * 0.25);
  }
  probe.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  bones.hips.getWorldPosition(v);
  return v.y;
}

export function buildTemplates(manifest: CharacterManifest, gltfs: LoadedGltf[]): CharacterTemplate[] {
  return manifest.variants.map((variant, i) => {
    const gltf = gltfs[i];
    const scene = gltf.scene;
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    const rawHeight = Math.max(0.01, box.max.y - box.min.y);
    const normScale = SKELETON_TOP / rawHeight;
    const footOffset = -box.min.y;

    const clips = resolveClips(variant, gltf.animations);
    if (clips.walk && clips.sitIdle !== clips.walk) {
      const bones = resolveBones(scene);
      if (bones.hips) stripRootMotionXZ(clips.walk, bones.hips.name);
    }

    const sitRaw = variant.sitHipY != null ? variant.sitHipY / normScale : measureHipY({ scene }, clips.sitIdle ?? null);
    const standRaw = measureHipY({ scene }, null) ?? rawHeight * 0.5;
    return {
      variant,
      scene,
      clips,
      normScale,
      footOffset,
      sitHipY: clips.sitIdle && sitRaw != null ? sitRaw * normScale : variant.sitHipY ?? null,
      standHipY: standRaw * normScale,
    };
  });
}

// --- Teinte des matériaux nommés -----------------------------------------

// Assombrit une couleur hex (mélange vers le noir) pour les rôles *Dark.
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * (1 - k));
  const g = Math.round(((n >> 8) & 255) * (1 - k));
  const b = Math.round((n & 255) * (1 - k));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// La couleur de chaque rôle vient du descripteur d'apparence du passager.
const ROLE_COLOR: Record<Exclude<TintRole, 'none'>, (app: Appearance) => string> = {
  skin: (a) => a.skin,
  hair: (a) => a.hair.color,
  top: (a) => a.top.color,
  topDark: (a) => shade(a.top.color, 0.28),
  bottom: (a) => a.bottom.color,
  bottomDark: (a) => shade(a.bottom.color, 0.28),
  shoes: (a) => a.shoes,
  bag: (a) => a.bagColor,
};

// Rôles devinés dans les noms de matériaux des packs quand la variante ne
// fournit pas de tintMap explicite. Les matériaux texturés ne sont pas altérés.
const TINT_GUESS: [RegExp, Exclude<TintRole, 'none'>][] = [
  [/skin|body|face|flesh/i, 'skin'],
  [/hair|beard|brow/i, 'hair'],
  [/top|shirt|torso|jacket|suit|cloth|outfit|upper/i, 'top'],
  [/bottom|pants|trouser|legs|lower|jeans/i, 'bottom'],
  [/shoe|feet|boot|sneaker/i, 'shoes'],
];

function tintMaterial(mat: THREE.Material, app: Appearance, tintMap?: Record<string, TintRole>): THREE.Material {
  const std = mat as THREE.MeshStandardMaterial;
  if (!('color' in std)) return mat;
  let role: TintRole | undefined = tintMap?.[mat.name];
  if (role === 'none') return mat;
  if (!role) role = TINT_GUESS.find(([re]) => re.test(mat.name))?.[1];
  const cloned = std.clone();
  if (role && !std.map) {
    cloned.color.set(ROLE_COLOR[role](app));
  }
  return cloned;
}

// --- Clonage par passager -------------------------------------------------

// Accessoires incongrus livrés avec certains packs (le costume Quaternius
// tient un pistolet) : masqués au clonage — rien de tout ça dans la Yamanote.
const HIDDEN_PROP_RE = /pistol|gun|revolver|rifle|weapon|knife|sword|blade/i;

export function cloneVariant(template: CharacterTemplate, app: Appearance): CharacterClone {
  const model = cloneSkeleton(template.scene);
  const doTint = template.variant.tint !== false;
  model.traverse((obj) => {
    if (HIDDEN_PROP_RE.test(obj.name)) obj.visible = false;
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    // Les bornes d'un SkinnedMesh ne suivent pas la pose → pas de culling
    // individuel (18 PNJ toujours dans la rame, coût négligeable).
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    if (doTint) {
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((m) => tintMaterial(m, app, template.variant.tintMap))
        : tintMaterial(mesh.material, app, template.variant.tintMap);
    }
  });

  // Wrapper de normalisation : pieds à y=0, crâne à SKELETON_TOP, face +Z.
  const inner = new THREE.Group();
  inner.scale.setScalar(template.normScale);
  inner.position.y = template.footOffset * template.normScale;
  inner.rotation.y = template.variant.faceYaw ?? 0;
  inner.add(model);
  const wrap = new THREE.Group();
  wrap.add(inner);
  wrap.visible = false;

  const mixer = new THREE.AnimationMixer(model);
  const actions: Partial<Record<LogicalClip, THREE.AnimationAction>> = {};
  for (const [key, clip] of Object.entries(template.clips)) {
    actions[key as LogicalClip] = mixer.clipAction(clip);
  }

  const bones = resolveBones(model);

  // Mesures sur la pose de repos des nœuds (avant toute animation), en
  // unités normalisées : le wrap est évalué seul, hors scène.
  //
  // ATTENTION : cette pose de repos n'est PAS symétrique dans ces packs
  // (frame posée : torse vrillé, bras non miroirs). Seul le côté GAUCHE sert
  // de référence — l'assise manuelle construit le bras gauche puis assigne au
  // droit le miroir sagittal exact du résultat (voir pose.ts).
  wrap.updateMatrixWorld(true);
  // Référence : le parent des clavicules (poitrine). Les repos sont pris
  // RELATIFS à lui — la vrille du buste (Y), posée ou animée, tourne les deux
  // bras dans le MÊME sens et casserait une référence prise en espace monde.
  const clavParentL = bones.upperArmL?.parent;
  const chestRef = clavParentL && (clavParentL as THREE.Bone).isBone ? clavParentL.parent : null;
  const qChestInv = new THREE.Quaternion();
  if (chestRef) chestRef.getWorldQuaternion(qChestInv).invert();
  const armRest: CharacterClone['armRest'] = {};
  for (const key of ['upperArmL', 'foreArmL', 'handL'] as const) {
    const b = bones[key];
    if (!b) continue;
    const q = b.getWorldQuaternion(new THREE.Quaternion());
    if (chestRef) q.premultiply(qChestInv);
    armRest[key] = q;
  }

  // Clavicules (leurs rotations locales de repos SONT des miroirs exacts
  // dans ces rigs) : l'assise les remet au neutre, le clip les anime
  // asymétriquement.
  const clavicles: CharacterClone['clavicles'] = [];
  for (const key of ['upperArmL', 'upperArmR'] as const) {
    const parent = bones[key]?.parent;
    if (parent && (parent as THREE.Bone).isBone && parent !== bones.spine && parent !== bones.neck) {
      clavicles.push([parent as THREE.Bone, parent.quaternion.clone()]);
    }
  }

  let legGeom: LegGeom | null = null;
  if (bones.legL && bones.footL) {
    const knee = bones.legL.getWorldPosition(new THREE.Vector3());
    const foot = bones.footL.getWorldPosition(new THREE.Vector3());
    // Détaché = le pied n'est PAS un descendant du tibia (cible IK à part,
    // convention Quaternius) : il ne suivra pas les rotations de la jambe.
    let detached = true;
    for (let a = bones.footL.parent; a; a = a.parent) {
      if (a === bones.legL) {
        detached = false;
        break;
      }
    }
    legGeom = {
      shinLen: knee.distanceTo(foot),
      ankleH: Math.max(0.01, foot.y),
      footDetached: detached,
    };
  }

  return {
    wrap,
    mixer,
    actions,
    bones,
    legGeom,
    armRest,
    chestRef,
    clavicles,
    template,
    restHead: bones.head ? bones.head.quaternion.clone() : null,
    restSpine: bones.spine ? bones.spine.quaternion.clone() : null,
  };
}

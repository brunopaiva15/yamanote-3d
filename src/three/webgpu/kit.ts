// Le contrat entre la scène et le moteur WebGPU, et RIEN d'autre.
//
// Ce module est volontairement sans dépendance lourde : il est importé par des
// composants qui vivent dans le paquet principal (le ciel, la pluie, les
// limites de zone, la ville), et il ne doit donc entraîner ni `three/webgpu`
// ni `three/tsl` dans le bundle que téléchargent les six autres qualités.
//
// L'implémentation, elle, est chargée à la demande par `loadGpuKit()` -
// uniquement quand le joueur choisit « Extraordinaire ». Une fois chargée,
// elle est déposée ici et devient lisible SYNCHRONEMENT par `gpuKit()`, ce qui
// permet aux `useMemo` des composants de choisir leur matériau sans devenir
// asynchrones.
//
// Les matériaux WebGPU exposent exactement le même dictionnaire d'uniformes
// que leurs jumeaux GLSL : les nœuds `uniform()` de TSL portent un `.value`,
// comme un `{ value }` de `ShaderMaterial`. Tout le code d'animation par frame
// est donc partagé mot pour mot entre les deux moteurs.

import type * as THREE from 'three';

/** Une case d'uniforme, qu'elle vienne d'un ShaderMaterial ou d'un nœud TSL. */
export interface Cell<T> {
  value: T;
}

// --- Ciel ----------------------------------------------------------------

export interface SkyUniforms {
  uDay: Cell<THREE.Texture>;
  uGolden: Cell<THREE.Texture>;
  uNight: Cell<THREE.Texture>;
  uSilA: Cell<THREE.Texture>;
  uSilB: Cell<THREE.Texture>;
  uWeights: Cell<THREE.Vector3>;
  uSilMix: Cell<number>;
  uSilOffset: Cell<number>;
  uSilRepeat: Cell<number>;
  uBand: Cell<THREE.Vector2>;
  uHaze: Cell<THREE.Color>;
  uHazeAmt: Cell<number>;
  uSilDark: Cell<number>;
  uGlow: Cell<THREE.Color>;
  uGlowAmt: Cell<number>;
  uSeasonTint: Cell<THREE.Color>;
  uSeasonAmt: Cell<number>;
  uCloud: Cell<THREE.Color>;
  uCloudAmt: Cell<number>;
}

export interface SkyTextures {
  day: THREE.Texture;
  golden: THREE.Texture;
  night: THREE.Texture;
  silA: THREE.Texture;
  silB: THREE.Texture;
  /** Bande occupée par la silhouette, en v du cylindre. */
  band: [number, number];
  repeat: number;
}

// --- Limites de zone -----------------------------------------------------

export interface BarrierPanelUniforms {
  uSize: Cell<THREE.Vector2>;
  uHit: Cell<THREE.Vector2>;
  uStrength: Cell<number>;
  uTime: Cell<number>;
  uColor: Cell<THREE.Color>;
}

export interface BarrierEdgeUniforms {
  uHit: Cell<THREE.Vector2>;
  uStrength: Cell<number>;
  uTime: Cell<number>;
  uColor: Cell<THREE.Color>;
  uY: Cell<THREE.Vector2>;
  uZ: Cell<THREE.Vector2>;
  uSpan: Cell<number>;
  uOpen: Cell<number>;
}

export interface BarrierGateUniforms {
  uHit: Cell<THREE.Vector2>;
  uStrength: Cell<number>;
  uTime: Cell<number>;
  uColor: Cell<THREE.Color>;
  uY: Cell<THREE.Vector2>;
  uGate: Cell<number>;
}

// --- Ville ---------------------------------------------------------------

export interface CityTextures {
  facade: THREE.Texture;
  /** Façade de logement collectif, à coursive extérieure : la マンション. */
  balcony: THREE.Texture;
  roof: THREE.Texture;
  socle: THREE.Texture;
  facadeTile: number;
  roofScale: number;
  socleTile: [number, number];
}

export interface CityUniforms {
  night: Cell<number>;
  wet: Cell<number>;
  snow: Cell<number>;
}

export interface GroveUniforms {
  canopy: Cell<number>;
  snow: Cell<number>;
}

// --- Précipitation -------------------------------------------------------

/**
 * Un champ de précipitation, quel que soit le moteur qui le porte.
 *
 * En WebGL, la position de chaque goutte est recalculée à chaque sommet à
 * partir d'une graine et d'une dérive globale. En WebGPU, elle est INTÉGRÉE
 * par un nuanceur de calcul dans un tampon de stockage : chaque goutte garde
 * sa propre trajectoire, ce qui permet le vent tourbillonnant et le rebond au
 * sol qu'un simple modulo ne sait pas faire.
 */
export interface PrecipitationField {
  mesh: THREE.Object3D;
  /** Nombre de traces effectivement dessinées (une averse tombe plus dru). */
  setCount(n: number): void;
  /** Avance le champ d'un pas de temps. */
  update(dt: number, p: PrecipitationParams): void;
  dispose(): void;
}

export interface PrecipitationParams {
  cam: THREE.Vector3;
  /** Vitesse relative de la goutte par rapport à l'œil (m/s). */
  vel: THREE.Vector3;
  /** Largeur et longueur de la trace (m). */
  size: THREE.Vector2;
  /** Flottement latéral du flocon (m). */
  swirl: number;
  color: THREE.Color;
  opacity: number;
  /** Demi-largeur, plafond, centre z, demi-longueur du wagon (0 = inactif). */
  car: THREE.Vector4;
  /** Abscisse intérieure, extérieure, plafond, côté × actif de l'auvent. */
  shelter: THREE.Vector4;
  shelterZ: THREE.Vector2;
}

// --- Pipeline de rendu ---------------------------------------------------

export interface PipelineOptions {
  /** Éclairage indirect en espace écran. */
  ssgi: boolean;
  /** Réflexions en espace écran. */
  ssr: boolean;
  /** Profondeur de champ à bokeh. */
  dof: boolean;
  /** Force du bloom (data/config.bloom). */
  bloom: number;
}

export interface RenderPipelineHandle {
  render(): void;
  setSize(width: number, height: number): void;
  /**
   * Distance de mise au point (m) et ouverture, publiées chaque frame par la
   * scène : l'œil accommode sur ce qu'il regarde, pas sur un plan fixe.
   */
  setFocus(distance: number, aperture: number): void;
  dispose(): void;
}

// --- Le sac entier -------------------------------------------------------

export interface GpuKit {
  makeSkyMaterial(tex: SkyTextures): { material: THREE.Material; uniforms: SkyUniforms };
  makeBarrierPanelMaterial(
    width: number,
    height: number,
  ): { material: THREE.Material; uniforms: BarrierPanelUniforms };
  makeBarrierEdgeMaterial(
    y0: number,
    y1: number,
    length: number,
    span: number,
  ): { material: THREE.Material; uniforms: BarrierEdgeUniforms };
  makeBarrierGateMaterial(
    y0: number,
    y1: number,
  ): { material: THREE.Material; uniforms: BarrierGateUniforms };
  makeCityMaterial(tex: CityTextures): { material: THREE.Material; uniforms: CityUniforms };
  makeGroveMaterial(trunkTone: THREE.Color): {
    material: THREE.Material;
    uniforms: GroveUniforms;
  };
  makePrecipitation(
    renderer: unknown,
    count: number,
    round: boolean,
    box: THREE.Vector3,
  ): PrecipitationField;
  makeEnvironment(renderer: unknown): { texture: THREE.Texture; dispose(): void };
  makePipeline(
    renderer: unknown,
    scene: THREE.Scene,
    camera: THREE.Camera,
    options: PipelineOptions,
  ): RenderPipelineHandle;
}

let active: GpuKit | null = null;
let loading: Promise<typeof import('./impl')> | null = null;

/**
 * L'implémentation WebGPU, si elle est chargée. `null` partout ailleurs -
 * c'est-à-dire dans les six qualités qui rendent en WebGL.
 */
export function gpuKit(): GpuKit | null {
  return active;
}

/**
 * Charge l'implémentation WebGPU et la rend visible à tous.
 *
 * Le MODULE n'est téléchargé qu'une fois, mais le sac est reposé à chaque
 * appel : un aller-retour par Ultra passe par `clearGpuKit()`, et une promesse
 * déjà tenue ne rejouerait pas son `then`. Le mode serait alors remonté avec un
 * renderer WebGPU et des matériaux GLSL - un état où plus rien ne compile.
 */
export function loadGpuKit(): Promise<GpuKit> {
  if (active) return Promise.resolve(active);
  if (!loading) {
    loading = import('./impl');
    // Un échec ne doit pas condamner une seconde tentative (réseau coupé le
    // temps d'un chargement, puis revenu).
    loading.catch(() => {
      loading = null;
    });
  }
  return loading.then((m) => {
    active ??= m.createGpuKit();
    return active;
  });
}

/** Repasse en WebGL : les matériaux redeviennent ceux du moteur historique. */
export function clearGpuKit(): void {
  active = null;
}

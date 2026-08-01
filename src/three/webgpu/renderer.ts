// Création du renderer WebGPU, à part du reste.
//
// Ce module est le seul du dossier `webgpu` qui soit importé DYNAMIQUEMENT par
// Game.tsx : il entraîne `three/webgpu` avec lui, et n'a donc rien à faire
// dans le paquet des six qualités WebGL.

import type * as THREE from 'three';

/** Ce que react-three-fiber passe à une fabrique de renderer. */
export interface RendererProps {
  canvas: HTMLCanvasElement | OffscreenCanvas;
}

/**
 * L'adaptateur WebGPU répond-il vraiment ?
 *
 * `navigator.gpu` peut exister et l'adaptateur être refusé : pilote sur liste
 * noire, machine virtuelle sans GPU, onglet sur un GPU basse consommation qui
 * ne supporte pas les fonctions demandées. Autant le savoir AVANT d'avoir
 * monté une toile qui resterait noire.
 */
export async function probeWebgpu(): Promise<boolean> {
  const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
  if (!gpu) return false;
  try {
    const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
    return adapter !== null;
  } catch {
    return false;
  }
}

/** Le minimum que react-three-fiber attend d'un renderer. */
export interface MinimalRenderer {
  render(scene: THREE.Scene, camera: THREE.Camera): unknown;
}

export async function createWebGPURenderer(props: RendererProps): Promise<MinimalRenderer> {
  const { WebGPURenderer } = await import('three/webgpu');
  const renderer = new WebGPURenderer({
    canvas: props.canvas as HTMLCanvasElement,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  // `init()` négocie l'adaptateur et compile les ressources de base. Sans
  // l'attendre, la première image part sur un backend qui n'existe pas encore.
  await renderer.init();
  return renderer as unknown as MinimalRenderer;
}

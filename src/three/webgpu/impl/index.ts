// Le sac WebGPU, assemblé.
//
// Tout ce que ce dossier importe - `three/webgpu`, `three/tsl`, les nœuds de
// post-traitement - ne descend chez le joueur QUE s'il choisit
// « Extraordinaire ». C'est la seule raison d'être de la frontière entre ce
// module et `../kit` : le paquet principal ne connaît que le contrat.

import type * as THREE from 'three';
import type { GpuKit, PipelineOptions } from '../kit';
import { makeSkyMaterial } from './sky';
import {
  makeBarrierEdgeMaterial,
  makeBarrierGateMaterial,
  makeBarrierPanelMaterial,
} from './barrier';
import { makeCityMaterial, makeGroveMaterial } from './city';
import { makePrecipitation } from './precipitation';
import { makeEnvironment } from './environment';
import { makePipeline } from './pipeline';

export function createGpuKit(): GpuKit {
  return {
    makeSkyMaterial,
    makeBarrierPanelMaterial,
    makeBarrierEdgeMaterial,
    makeBarrierGateMaterial,
    makeCityMaterial,
    makeGroveMaterial,
    makePrecipitation(renderer, count, round, box) {
      return makePrecipitation(
        renderer as { compute(node: unknown): void },
        count,
        round,
        box,
      );
    },
    makeEnvironment,
    makePipeline(renderer, scene, camera, options: PipelineOptions) {
      return makePipeline(
        renderer as { toneMapping: THREE.ToneMapping; outputColorSpace: string },
        scene,
        camera as THREE.PerspectiveCamera,
        options,
      );
    },
  };
}

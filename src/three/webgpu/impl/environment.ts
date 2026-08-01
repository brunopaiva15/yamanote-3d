// La sonde d'environnement, version WebGPU.
//
// `PMREMGenerator` existe dans les deux builds de three, mais ce ne sont PAS
// la même classe : celle de `three` filtre avec un WebGLRenderer et n'a rien à
// faire ici. Celle de `three/webgpu` fait le même travail avec le renderer du
// mode. Le contenu, lui, est identique au chemin WebGL - la même
// `RoomEnvironment`, le même flou de 0,04 - pour que l'inox des barres et le
// brillant du sol partent du même point dans les deux modes.

import * as THREE from 'three';
import { PMREMGenerator } from 'three/webgpu';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export function makeEnvironment(renderer: unknown): {
  texture: THREE.Texture;
  dispose(): void;
} {
  const pmrem = new PMREMGenerator(renderer as never);
  const room = new RoomEnvironment();
  const texture = pmrem.fromScene(room, 0.04).texture;
  return {
    texture,
    dispose() {
      texture.dispose();
      pmrem.dispose();
    },
  };
}

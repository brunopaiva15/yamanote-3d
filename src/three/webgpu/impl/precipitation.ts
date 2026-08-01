// La pluie et la neige, INTÉGRÉES sur le GPU.
//
// La version WebGL (three/Weather) calcule la position de chaque goutte
// analytiquement dans le nuanceur de sommets : une graine fixe, une dérive
// globale, un modulo. C'est efficace, mais toutes les gouttes partagent
// exactement la même trajectoire à une translation près - elles tombent en
// rang, et rien ne peut leur arriver individuellement.
//
// Ici, la position vit dans un tampon de stockage et un nuanceur de CALCUL
// l'avance à chaque image. Chaque goutte a sa propre vitesse de chute (une
// averse réelle n'est pas un peigne) et son propre flottement, et le repliement
// dans la boîte se fait par goutte. Le rendu, lui, ne fait plus que lire une
// position : le sommet redevient bête, ce qui compte quand il y en a
// vingt-cinq mille.
//
// Le reste - inclinaison de la trace sur la vitesse relative, volume qui suit
// l'œil, wagon et auvent soustraits - est repris tel quel de la version GLSL,
// avec les mêmes constantes. Une averse ne doit pas changer de nature parce
// qu'on a changé de moteur.

import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  Fn,
  cameraProjectionMatrix,
  cameraViewMatrix,
  cos,
  float,
  hash,
  instanceIndex,
  instancedArray,
  max,
  positionGeometry,
  sin,
  smoothstep,
  step,
  uniform,
  uv,
  varyingProperty,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import type { PrecipitationField, PrecipitationParams } from '../kit';

/** Ce que `renderer.compute()` attend, sans traîner tout WebGPURenderer ici. */
interface Computer {
  compute(node: unknown): void;
}

export function makePrecipitation(
  renderer: Computer,
  count: number,
  round: boolean,
  box: THREE.Vector3,
): PrecipitationField {
  const state = instancedArray(count, 'vec4');

  const uCam = uniform(new THREE.Vector3());
  const uBox = uniform(box.clone());
  const uVel = uniform(new THREE.Vector3(0, -1, 0));
  const uSize = uniform(new THREE.Vector2(0.02, 0.5));
  const uSwirl = uniform(0);
  const uTime = uniform(0);
  const uDt = uniform(0);
  const uCar = uniform(new THREE.Vector4());
  const uShelter = uniform(new THREE.Vector4());
  const uShelterZ = uniform(new THREE.Vector2());
  const uColor = uniform(new THREE.Color('#dfe7ee'));
  const uOpacity = uniform(0);

  // --- Semis : une graine par goutte, une fois pour toutes ---
  const seedCompute = Fn(() => {
    const r1 = hash(instanceIndex.mul(3).add(1));
    const r2 = hash(instanceIndex.mul(3).add(2));
    const r3 = hash(instanceIndex.mul(3).add(3));
    const span = uBox.mul(2);
    // Le semis est posé autour de l'origine ; la première image le replie
    // autour de l'œil, où qu'il soit.
    const p = vec3(r1, r2, r3).mul(span).sub(uBox);
    // w porte le calibre de la goutte : toutes les traces ne font pas la même
    // longueur, et une averse dont chaque trait est identique se lit comme une
    // trame.
    state.element(instanceIndex).assign(vec4(p, hash(instanceIndex.add(7919))));
  })().compute(count);

  // --- Intégration ---
  const stepCompute = Fn(() => {
    const s = state.element(instanceIndex);
    const grade = s.w.toVar();
    // Une goutte lourde tombe plus vite qu'une gouttelette : ±25 %. C'est ce
    // qui casse le peigne, et c'est invisible à décrire mais évident à voir.
    const speed = grade.mul(0.5).add(0.78);
    const moved = s.xyz.add(uVel.mul(uDt).mul(vec3(1, speed, 1))).toVar();
    // Flottement : le flocon ne tombe pas droit, et c'est ce qui le distingue
    // d'une goutte bien plus que sa forme ou sa vitesse.
    const drift = vec3(
      sin(uTime.mul(0.9).add(grade.mul(41))).mul(uSwirl).mul(uDt),
      0,
      cos(uTime.mul(0.7).add(grade.mul(37))).mul(uSwirl).mul(uDt),
    );
    // Repli dans la boîte centrée sur l'œil : la goutte qui sort par le bas
    // rentre par le haut. `fract` traite les négatifs juste, ce que `%` de
    // WGSL ne fait pas - il garde le signe du dividende.
    const origin = uCam.sub(uBox);
    const span = uBox.mul(2);
    const p = moved.add(drift).sub(origin).div(span).fract().mul(span).add(origin);
    s.assign(vec4(p, grade));
  })().compute(count);

  // --- Rendu ---
  const vFade = varyingProperty('float', 'vRainFade');

  // Le quad est écrit à la main plutôt que pris d'une PlaneGeometry : celle-ci
  // devrait être conservée pour être libérée, et la libérer libérerait les
  // tampons que la géométrie instanciée lui emprunte.
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute(
    'position',
    new THREE.BufferAttribute(
      new Float32Array([-0.5, 0.5, 0, 0.5, 0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 0]),
      3,
    ),
  );
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]), 2));
  // Une normale, même sans objet : le quad est orienté dans le nuanceur de
  // sommets, sa normale de géométrie ne veut donc rien dire. Mais la passe de
  // scène écrit les normales dans le MRT, et sans cet attribut three prévient à
  // chaque compilation qu'il manque - un avertissement juste, et sans remède
  // sur un billboard.
  geo.setAttribute(
    'normal',
    new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]), 3),
  );
  geo.setIndex([0, 2, 1, 2, 3, 1]);
  geo.instanceCount = count;
  // La boîte suit la caméra : aucune sphère englobante n'a de sens ici.
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

  const material = new MeshBasicNodeMaterial();
  material.transparent = true;
  // Un quad billboardé n'a pas de « bon » côté : l'orientation dépend de
  // l'inclinaison de la trace, qui change avec la vitesse du train.
  material.side = THREE.DoubleSide;
  // Test de profondeur OUI - une goutte passe derrière un immeuble -, mais
  // écriture NON : mille traces translucides qui s'écrivent en profondeur se
  // masquent les unes les autres selon l'ordre de rendu.
  material.depthWrite = false;
  material.depthTest = true;

  material.vertexNode = Fn(() => {
    const s = state.element(instanceIndex);
    const p = s.xyz.toVar();
    const grade = s.w;

    // Sous le pavillon du wagon, et sous l'auvent du quai : les deux seuls
    // endroits où l'œil se trouve SOUS quelque chose. Écrits en masques et non
    // en branchements - un `if` coûte ici plus cher que les six `step`.
    const inCar = step(0.0001, uCar.w)
      .mul(step(p.x.abs(), uCar.x))
      .mul(step(p.y, uCar.y))
      .mul(step(float(-0.35), p.y))
      .mul(step(p.z.sub(uCar.z).abs(), uCar.w));
    const sx = p.x.mul(uShelter.w);
    const inShelter = step(0.0001, uShelter.w.abs())
      .mul(step(uShelter.x, sx))
      .mul(step(sx, uShelter.y))
      .mul(step(p.y, uShelter.z))
      .mul(step(uShelterZ.x, p.z))
      .mul(step(p.z, uShelterZ.y));
    const alive = float(1).sub(max(inCar, inShelter));

    const mv = cameraViewMatrix.mul(vec4(p, 1)).toVar();
    // Le trait s'aligne sur la vitesse RELATIVE, projetée dans le plan de
    // l'image : c'est exactement ce que fait une pose longue.
    const velView = cameraViewMatrix.mul(vec4(uVel, 0)).xyz;
    const dir = velView.xy.add(vec2(0, -0.0001)).normalize();
    const perp = vec2(dir.y.negate(), dir.x);
    const long = grade.mul(0.9).add(0.55);
    const off = dir
      .mul(positionGeometry.y.mul(uSize.y).mul(long))
      .add(perp.mul(positionGeometry.x.mul(uSize.x)))
      .mul(alive);

    // Fondu au bord de la boîte : sans lui, les traces apparaissent sur un
    // plan. Il ne commence qu'à quatre-vingt-dix pour cent du rayon, et il
    // s'étale au-delà - les coins de la boîte sont à 1,7 rayon.
    const d = p.sub(uCam).length();
    vFade.assign(
      alive
        .mul(smoothstep(uBox.x.mul(0.9), uBox.x.mul(1.5), d).oneMinus())
        .mul(grade.mul(0.55).add(0.45)),
    );

    return cameraProjectionMatrix.mul(vec4(mv.xy.add(off), mv.z, mv.w));
  })();

  material.colorNode = uColor.rgb;
  material.opacityNode = Fn(() => {
    const c = uv().sub(0.5);
    // Une goutte est un trait doux sur sa largeur et atténué à ses deux bouts ;
    // un flocon est une pastille. Une seule expression pour les deux.
    const shape = round
      ? smoothstep(0.16, 0.46, c.length()).oneMinus()
      : smoothstep(0.15, 0.5, c.x.abs())
          .oneMinus()
          .mul(smoothstep(0.2, 0.5, c.y.abs()).mul(0.75).oneMinus());
    return shape.mul(uOpacity).mul(vFade);
  })();

  const mesh = new THREE.Mesh(geo, material);
  mesh.userData.rainField = round ? 'snow' : 'rain';
  mesh.frustumCulled = false;
  // AVANT les autres transparents : le vitrage du wagon écrit la profondeur,
  // et une pluie dessinée après lui serait intégralement rejetée par le test.
  mesh.renderOrder = -1;
  mesh.visible = false;

  let seeded = false;

  return {
    mesh,
    setCount(n: number) {
      geo.instanceCount = Math.max(1, Math.min(count, n));
    },
    update(dt: number, p: PrecipitationParams) {
      if (!seeded) {
        seeded = true;
        renderer.compute(seedCompute);
      }
      uCam.value.copy(p.cam);
      uVel.value.copy(p.vel);
      uSize.value.copy(p.size);
      uSwirl.value = p.swirl;
      uColor.value.copy(p.color);
      uOpacity.value = p.opacity;
      uCar.value.copy(p.car);
      uShelter.value.copy(p.shelter);
      uShelterZ.value.copy(p.shelterZ);
      uTime.value = (uTime.value + dt) % 1000;
      uDt.value = dt;
      renderer.compute(stepCompute);
    },
    dispose() {
      geo.dispose();
      material.dispose();
    },
  };
}

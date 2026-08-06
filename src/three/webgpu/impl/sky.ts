// Le ciel de Tokyo, écrit en nœuds (TSL) plutôt qu'en GLSL.
//
// C'est la transposition littérale du nuanceur de three/city/SkyDome : mêmes
// mélanges, mêmes bandes, mêmes constantes. Rien n'y est « amélioré » - un
// ciel qui ne serait pas le même d'un moteur à l'autre ferait de la bascule de
// qualité un changement de jeu. Ce qui change en WebGPU, c'est ce qui se passe
// APRÈS : le ciel entre dans le même pipeline HDR que le reste de la scène, il
// nourrit donc l'éclairage indirect et les réflexions au lieu d'être un fond.
//
// Une seule différence de fond avec la version GLSL : le ciel n'est plus
// exclu du tone mapping. En WebGL il était composé tel quel par-dessus une
// image déjà étalonnée ; ici toute la frame passe par le même transfert, et
// c'est ce qui permet aux vitres et au sol de renvoyer un ciel cohérent.

import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  Fn,
  float,
  mix,
  positionLocal,
  smoothstep,
  step,
  texture,
  uniform,
  vec2,
  vec3,
} from 'three/tsl';
import type { SkyTextures, SkyUniforms } from '../kit';

/**
 * Rayon et hauteur du cylindre de RÉFÉRENCE du ciel : les mêmes que dans
 * three/city/SkyDome, et pour la même raison - le ciel est une voûte, mais son
 * dégradé se lit comme un cylindre.
 */
const R = 100;
const HEIGHT = 82;

export function makeSkyMaterial(tex: SkyTextures): {
  material: THREE.Material;
  uniforms: SkyUniforms;
} {
  const uDay = texture(tex.day);
  const uGolden = texture(tex.golden);
  const uNight = texture(tex.night);
  const uSilA = texture(tex.silA);
  const uSilB = texture(tex.silB);

  const uWeights = uniform(new THREE.Vector3(1, 0, 0));
  const uSilMix = uniform(0);
  const uSilOffset = uniform(0);
  const uSilRepeat = uniform(tex.repeat);
  const uBand = uniform(new THREE.Vector2(tex.band[0], tex.band[1]));
  const uHaze = uniform(new THREE.Color('#d6e8f2'));
  const uHazeAmt = uniform(0.5);
  const uSilDark = uniform(1);
  const uGlow = uniform(new THREE.Color('#c4702f'));
  const uGlowAmt = uniform(0);
  const uSeasonTint = uniform(new THREE.Color('#f7edd6'));
  const uSeasonAmt = uniform(0);
  const uCloud = uniform(new THREE.Color('#a8adb2'));
  const uCloudAmt = uniform(0);

  const material = new MeshBasicNodeMaterial();
  material.side = THREE.BackSide;
  // Boîte à ciel : jamais testée ni écrite en profondeur, dessinée avant tout
  // le reste. C'est ce qui la met « à l'infini » sans la reculer.
  material.depthTest = false;
  material.depthWrite = false;
  material.transparent = false;
  material.fog = false;

  material.colorNode = Fn(() => {
    // Direction → coordonnées du ciel de référence : hauteur sur un cylindre de
    // rayon R, saturée, et enroulement identique à celui d'un CylinderGeometry
    // pour que le défilement de la silhouette garde son sens.
    const dir = positionLocal;
    const horiz = dir.xz.length().max(0.001);
    const yEq = dir.y.mul(float(R).div(horiz));
    const suv = vec2(
      // `atan` à deux arguments EST atan2, en TSL comme en GLSL.
      dir.x.atan(dir.z).mul(0.15915494),
      yEq.add(HEIGHT / 2).div(HEIGHT).clamp(0, 1),
    ).toVar();
    const col = vec3(
      uDay
        .sample(suv)
        .rgb.mul(uWeights.x)
        .add(uGolden.sample(suv).rgb.mul(uWeights.y))
        .add(uNight.sample(suv).rgb.mul(uWeights.z)),
    ).toVar();

    // La couverture nuageuse : une couche de stratus est PLUS SOMBRE AU
    // ZÉNITH, où on la voit par la tranche, et s'éclaircit vers l'horizon.
    const lowSky = smoothstep(uBand.y.add(0.3), uBand.y.sub(0.04), suv.y);
    col.assign(mix(col, mix(uCloud.rgb.mul(0.82), uCloud.rgb, lowSky), uCloudAmt));

    // Voile de saison : la vapeur d'août s'accumule dans les basses couches,
    // l'horizon vire au blanc laiteux pendant que le zénith reste bleu.
    const hazeBand = smoothstep(uBand.y.sub(0.05), uBand.y.add(0.42), suv.y).oneMinus();
    col.assign(mix(col, uSeasonTint.rgb, uSeasonAmt.mul(hazeBand)));

    // Lueur urbaine, BASSE : la pollution lumineuse se concentre sur l'horizon
    // et s'efface vite en montant, sinon toute la voûte vire à l'orange.
    col.addAssign(
      uGlow.rgb
        .mul(uGlowAmt)
        .mul(smoothstep(uBand.y.sub(0.02), uBand.y.add(0.13), suv.y).oneMinus()),
    );

    // Silhouette de l'horizon. Elle est échantillonnée SANS embranchement : en
    // WGSL, un `textureSample` sous condition non uniforme est interdit (les
    // dérivées ne sont plus définies). Le masque de bande fait le travail que
    // faisait le `if` du GLSL, et la texture est bornée en v (ClampToEdge).
    const bv = suv.y.sub(uBand.x).div(uBand.y.sub(uBand.x));
    const inBand = step(float(0), bv).mul(step(bv, float(1)));
    const sUv = vec2(suv.x.mul(uSilRepeat).add(uSilOffset), bv.clamp(0, 1));
    const sil = mix(uSilA.sample(sUv), uSilB.sample(sUv), uSilMix);
    // La silhouette n'est pas un objet mais une épaisseur d'atmosphère : elle
    // se noie dans la brume du moment, et s'assombrit la nuit.
    const tinted = mix(sil.rgb.mul(uSilDark), uHaze.rgb, uHazeAmt);
    col.assign(mix(col, tinted, sil.a.clamp(0, 1).mul(0.88).mul(inBand)));

    return col;
  })();

  return {
    material,
    uniforms: {
      uDay,
      uGolden,
      uNight,
      uSilA,
      uSilB,
      uWeights,
      uSilMix,
      uSilOffset,
      uSilRepeat,
      uBand,
      uHaze,
      uHazeAmt,
      uSilDark,
      uGlow,
      uGlowAmt,
      uSeasonTint,
      uSeasonAmt,
      uCloud,
      uCloudAmt,
    } as unknown as SkyUniforms,
  };
}

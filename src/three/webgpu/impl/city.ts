// Le ruban urbain et les bosquets, en nœuds.
//
// Les deux matériaux GLSL correspondants (three/city/cityMaterial et
// cityProps) ne sont pas écrits en nuanceur complet : ils GREFFENT quelques
// lignes sur MeshLambertMaterial par `onBeforeCompile`, un mécanisme qui
// n'existe pas côté nœuds. La greffe est donc refaite ici en dérivant
// `MeshLambertNodeMaterial` et en redéfinissant les deux crochets qui
// correspondent aux deux points d'injection du GLSL :
//
//   · `setupPosition`   ← `#include <begin_vertex>` : il s'exécute AVANT que
//     three n'applique la matrice d'instance, exactement comme en GLSL. C'est
//     ce qui permet de dépouiller un arbre sans rapetisser l'instance.
//   · `setupDiffuseColor` ← `<color_fragment>` + `<map_fragment>` : on appelle
//     d'abord la version de base (qui pose `diffuseColor` = couleur de
//     matériau × couleur d'instance, comme `color_fragment`), puis on la
//     retravaille. La couleur d'instance est donc prise en compte au même
//     endroit qu'en GLSL, ce qui compte : le bandeau d'enseigne REMPLACE la
//     teinte de façade au lieu de la multiplier.
//
// L'émissif, lui, passe par `emissiveNode` - le pendant exact de
// `totalEmissiveRadiance +=`.

import * as THREE from 'three';
import { MeshLambertNodeMaterial } from 'three/webgpu';
import type { Node } from 'three/webgpu';
import type NodeBuilder from 'three/src/nodes/core/NodeBuilder.js';
import {
  attribute,
  diffuseColor,
  exp,
  float,
  max,
  mix,
  normalGeometry,
  positionGeometry,
  positionLocal,
  select,
  smoothstep,
  step,
  texture,
  uniform,
  vec2,
  vec3,
} from 'three/tsl';
import type { V3 } from './nodes';
import type { CityTextures, CityUniforms, GroveUniforms } from '../kit';

/**
 * Un matériau de la ville : un Lambert dont on retravaille la couleur diffuse
 * après coup, avec la possibilité de toucher aussi la position AVANT que
 * l'instanciation ne s'applique.
 */
class GraftedLambertMaterial extends MeshLambertNodeMaterial {
  /**
   * `NodeMaterial.setupLighting` lit ce champ sur N'IMPORTE quel matériau à
   * nœuds - c'est le pendant exact de `totalEmissiveRadiance +=` - mais les
   * typages de three ne le déclarent que sur la variante Standard. On le
   * déclare donc ici, où il sert.
   */
  emissiveNode: Node | null = null;

  private shade: (base: V3) => V3;
  private displace: (() => void) | null;

  constructor(shade: (base: V3) => V3, displace: (() => void) | null = null) {
    super();
    this.shade = shade;
    this.displace = displace;
  }

  setupPosition(builder: NodeBuilder) {
    if (this.displace) this.displace();
    return super.setupPosition(builder);
  }

  setupDiffuseColor(builder: NodeBuilder): void {
    super.setupDiffuseColor(builder);
    diffuseColor.rgb.assign(this.shade(diffuseColor.rgb));
  }
}

export function makeCityMaterial(tex: CityTextures): {
  material: THREE.Material;
  uniforms: CityUniforms;
} {
  const night = uniform(0);
  const wet = uniform(0);
  const snow = uniform(0);
  // La neige de ville n'est jamais blanche : elle prend tout de suite le gris
  // du ciel qui l'éclaire et la suie qui s'y pose.
  const snowColor = uniform(new THREE.Color('#dfe4ea'));
  const winWarm = uniform(new THREE.Color('#ffdca8').multiplyScalar(1.35));
  const winCool = uniform(new THREE.Color('#d8e6ff').multiplyScalar(1.25));
  const shopColor = uniform(new THREE.Color('#ffc98a').multiplyScalar(1.15));
  // Rebond de rue : une ville de nuit est éclairée par le bas - lampadaires,
  // vitrines, phares.
  const streetGlow = uniform(new THREE.Color('#ffb877'));

  // --- Reconstitution des dimensions réelles de l'instance ---
  //
  // En GLSL, l'échelle était relue depuis `instanceMatrix` dans le sommet. Le
  // système de nœuds ne donne pas accès à cette matrice, et la reconstruire
  // reviendrait à réimplémenter l'instanciation de three. `aScale` porte donc
  // les mêmes trois nombres, écrits par three/city/CityRibbon au moment où il
  // compose la matrice - il les a sous la main, c'est même lui qui les fait.
  const iScale = attribute<'vec3'>('aScale', 'vec3');
  const jitter = attribute<'vec2'>('aJitter', 'vec2');
  const accent: V3 = attribute<'vec3'>('aAccent', 'vec3');
  const trim = attribute<'vec4'>('aTrim', 'vec4');
  // 1 = façade de logement collectif, à coursive extérieure.
  const facadeKind = attribute<'float'>('aFacade', 'float');

  // Le nuanceur choisit l'UV selon la face : le long de la voie sur les
  // pignons, en profondeur sur les faces qui regardent les rails, à plat sur
  // les toitures. Un étage fait donc trois mètres partout, sur une tour de
  // cinquante comme sur une échoppe de six.
  const local = positionGeometry.mul(iScale);
  const n = normalGeometry.abs();
  const cityUv = select(
    n.y.greaterThan(0.5),
    vec2(local.x, local.z),
    select(n.x.greaterThan(0.5), vec2(local.z, local.y), vec2(local.x, local.y)),
  );
  const up = local.y.add(iScale.y.mul(0.5));

  const facUv = cityUv.add(jitter).div(tex.facadeTile);
  const socUv = vec2(cityUv.x.add(jitter.x).div(tex.socleTile[0]), up.div(tex.socleTile[1]));

  // Deux familles de façade, MÉLANGÉES et non branchées : en WGSL, un
  // `textureSample` sous condition non uniforme est interdit - les dérivées, et
  // donc le niveau de mip, n'y sont plus définies.
  const fac = mix(
    texture(tex.facade).sample(facUv),
    texture(tex.balcony).sample(facUv),
    facadeKind,
  );
  const rof = texture(tex.roof).sample(facUv.mul(tex.roofScale));
  const soc = texture(tex.socle).sample(socUv);

  // Un volume nu se traite partout comme une couverture.
  const roofish = max(step(0.5, n.y), trim.z);
  // Devanture : les trois premiers mètres des faces verticales.
  const socle = roofish.oneMinus().mul(step(up, float(tex.socleTile[1]))).mul(trim.y);
  const tone = mix(mix(fac.rgb, rof.rgb, roofish), soc.rgb, socle);

  const shade = (base: V3): V3 => {
    // Les palettes de quartier sont claires et la scène est vivement éclairée
    // pour l'intérieur du wagon : sans ce coefficient, toute face au soleil
    // sature en blanc et la ville perd son relief.
    const c = base.mul(tone).mul(0.72).toVar();

    // Bandeau d'enseigne et store : teinte du quartier, pas de la façade.
    const accentMask = socle
      .mul(smoothstep(0.2, 0.3, soc.a))
      .mul(smoothstep(0.45, 0.56, soc.a).oneMinus());
    c.assign(mix(c, accent, accentMask.mul(0.62)));

    // Une ville de nuit n'est pas une ville de jour moins éclairée : les
    // façades y sont franchement sombres et ce sont les ouvertures qui portent
    // la lumière.
    c.mulAssign(mix(float(1), float(0.46), night));
    // Mouillé : une surface humide fonce, parce qu'une pellicule d'eau renvoie
    // en miroir au lieu de diffuser. Ça se voit d'abord sur ce qui regarde le
    // ciel, et à peine sur une façade verticale où l'eau ne stagne pas.
    c.mulAssign(float(1).sub(wet.mul(0.34).mul(mix(float(0.25), float(1), roofish))));
    // Neige : elle se pose sur ce qui regarde le ciel, JAMAIS sur un mur.
    c.assign(mix(c, snowColor.rgb, snow.mul(roofish).mul(0.92)));
    return c;
  };

  const material = new GraftedLambertMaterial(shade);
  material.fog = true;

  // --- Émissif : c'est la nuit que la ville existe ---
  // Fenêtres : chaque vitrage porte un tirage stable dans l'alpha de la
  // texture ; le seuil descend avec la nuit, les étages s'allument donc par
  // paquets au fil de la soirée plutôt que tous d'un coup.
  //
  // Le seuil est franc mais pas net, et c'est la DISTANCE qui l'exige : passé
  // deux cents mètres la trame de douze mètres tombe sous le pixel, l'alpha
  // filtré converge vers sa moyenne, et deux comparaisons strictes rendaient
  // alors un mur entièrement allumé ou entièrement éteint.
  const win = fac.a.mul(roofish.oneMinus()).mul(socle.oneMinus());
  const winLvl = float(1).sub(night.mul(0.8));
  const winOn = smoothstep(0.02, 0.05, win).mul(
    smoothstep(winLvl.sub(0.12), winLvl.add(0.12), win),
  );
  const glass = socle
    .mul(smoothstep(0.62, 0.7, soc.a))
    .mul(smoothstep(0.84, 0.93, soc.a).oneMinus());
  const neon = socle.mul(smoothstep(0.93, 1, soc.a));
  const winCol = mix(winCool.rgb, winWarm.rgb, trim.w);
  // Rebond de rue : décroissance rapide sur les trois ou quatre premiers
  // mètres, sur les seules faces verticales. Une chaussée mouillée RENVOIE :
  // sous la pluie, la nuit, le pied des façades reçoit deux fois plus de
  // lumière de la rue qu'à sec.
  const bounce = exp(up.mul(-0.34)).mul(roofish.oneMinus());

  material.emissiveNode = winCol
    .mul(winOn)
    .mul(night)
    .add(shopColor.rgb.mul(glass).mul(night.mul(0.85).add(0.1)).mul(trim.x))
    .add(accent.mul(neon).mul(night.mul(1.5).add(0.05)).mul(trim.x))
    .add(streetGlow.rgb.mul(bounce).mul(night).mul(wet.mul(0.3).add(0.26)));

  return {
    material,
    uniforms: { night, wet, snow } as unknown as CityUniforms,
  };
}

// --- Bosquets -------------------------------------------------------------

export function makeGroveMaterial(trunkTone: THREE.Color): {
  material: THREE.Material;
  uniforms: GroveUniforms;
} {
  const canopy = uniform(1);
  const snow = uniform(0);

  /**
   * DÉPOUILLER L'ARBRE. Ce qui dit l'hiver de loin, ce n'est pas la couleur,
   * c'est le VOLUME : une frondaison de juillet est une masse pleine, une
   * ramure de janvier est un dessin. Les sommets de couronne se rétractent
   * vers le centre de leur propre sujet.
   */
  const displace = () => {
    const hub = attribute<'vec3'>('aHub', 'vec3');
    positionLocal.assign(mix(hub, positionLocal, canopy));
  };

  const shade = (base: V3): V3 => {
    const trunk = attribute<'float'>('aTrunk', 'float');
    // Le bois reprend sa teinte : la couleur d'instance ne vaut que pour la
    // feuille. La neige se pose sur la frondaison, pas sur le tronc.
    const c = mix(base, vec3(trunkTone.r, trunkTone.g, trunkTone.b), trunk).toVar();
    c.assign(mix(c, vec3(0.86, 0.89, 0.94), snow.mul(trunk.oneMinus())));
    return c;
  };

  const material = new GraftedLambertMaterial(shade, displace);
  material.vertexColors = true;
  material.fog = true;
  return { material, uniforms: { canopy, snow } as unknown as GroveUniforms };
}

// Le pipeline de rendu du mode Extraordinaire.
//
// --- Ce qu'il y avait, et ce qu'il n'y avait pas ---
//
// En WebGL, la scène est rendue en une passe puis retouchée : occlusion
// ambiante en espace écran, bloom, étalonnage filmique, grain, vignetage. Tout
// ce qui est INDIRECT y est donc, au mieux, une soustraction : l'AO assombrit
// les angles, mais rien n'apporte de lumière. Un néon de wagon n'éclaire que
// ce que sa `pointLight` atteint ; la lumière qui devrait rebondir sur le sol
// et remonter sous les banquettes n'existe pas. De même, une vitre ou une
// barre d'inox ne renvoient que la sonde d'environnement - une pièce grise
// générique -, jamais la voiture où elles se trouvent.
//
// --- Ce que WebGPU permet ---
//
// La scène est rendue en MRT : la couleur, mais aussi les normales de vue et
// les paramètres de matière. Ces deux tampons supplémentaires sont ce qui
// débloque tout le reste :
//
//   · SSGI (`SSGINode`) : pour chaque pixel, on parcourt l'hémisphère en
//     espace écran et on collecte la lumière RÉELLEMENT présente à l'image.
//     La lueur orange d'une fenêtre au crépuscule se pose sur la cloison d'en
//     face, les néons du plafond remontent du sol vers le dessous des sièges,
//     et la ville de nuit passée à travers les vitres teinte l'intérieur.
//     Le même parcours donne l'occlusion ambiante - une seule passe pour les
//     deux, là où WebGL en dépensait une entière rien que pour l'AO.
//   · SSR (`SSRNode`) : réflexions tracées à l'écran, pilotées par la
//     rugosité et la métallicité de chaque pixel. Le sol vernis du wagon, les
//     vitres, les mains courantes en inox et la chaussée mouillée renvoient la
//     scène elle-même.
//   · Profondeur de champ à bokeh (`DepthOfFieldNode`), qui remplace
//     l'absence pure et simple de flou du chemin WebGL.
//
// --- L'ordre, et pourquoi ---
//
// SSGI puis SSR : une réflexion doit renvoyer une image DÉJÀ éclairée par
// l'indirect, sinon le sol renvoie une pièce plus sombre que celle où l'on se
// trouve. Puis la profondeur de champ, puis le bloom - un bokeh net qui
// déborderait ensuite en halo est la signature d'un pipeline monté à l'envers.
// L'étalonnage filmique vient après tout ça, et le grain et le vignetage après
// lui : ce sont des défauts d'OBJECTIF, ils n'ont rien à faire dans une image
// linéaire.

import * as THREE from 'three';
import { RenderPipeline } from 'three/webgpu';
import {
  float,
  frameId,
  hash,
  metalness,
  mrt,
  output,
  pass,
  renderOutput,
  roughness,
  screenCoordinate,
  screenUV,
  smoothstep,
  transformedNormalView,
  uint,
  uniform,
  vec2,
  vec4,
} from 'three/tsl';
import { ssgi } from 'three/addons/tsl/display/SSGINode.js';
import { ssr } from 'three/addons/tsl/display/SSRNode.js';
import { denoise } from 'three/addons/tsl/display/DenoiseNode.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js';
import type { V3, V4 } from './nodes';
import type { PipelineOptions, RenderPipelineHandle } from '../kit';

/**
 * Les nœuds de post-traitement de three sont typés d'après ce qu'ils SONT
 * (`SSRNode`, `DepthOfFieldNode`…) et non d'après ce qu'ils PRODUISENT, si
 * bien qu'on ne peut pas chaîner `.rgb` dessus sans le dire. Ces deux
 * conversions ne changent rien à l'exécution : elles rendent au graphe le type
 * que le nœud a déjà.
 */
const asV4 = (node: unknown): V4 => node as V4;
/**
 * SSGI, SSR et le débruiteur ÉCHANTILLONNENT la normale (`normalNode.sample`)
 * et attendent donc un nœud de texture, quand leurs signatures annoncent un
 * `Node<vec3>`. C'est bien la texture du MRT qu'il faut leur passer.
 */
const asNormal = (node: unknown): V3 => node as V3;

/** Ce dont ce module a besoin du renderer, sans en importer le type complet. */
interface PipelineRenderer {
  toneMapping: THREE.ToneMapping;
  outputColorSpace: string;
}

export function makePipeline(
  renderer: PipelineRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  options: PipelineOptions,
): RenderPipelineHandle {
  const scenePass = pass(scene, camera);
  // Trois attachements. Les normales sont indispensables au SSGI comme au SSR ;
  // métallicité et rugosité disent au SSR quelles surfaces réfléchissent et
  // avec quelle netteté - c'est ce qui sépare une vitre d'un siège en tissu.
  scenePass.setMRT(
    mrt({
      output,
      normal: transformedNormalView,
      material: vec4(metalness, roughness, 0, 1),
    }),
  );

  // Limite connue de la passe unique en MRT : un matériau TRANSPARENT écrit
  // lui aussi dans les attachements de normale et de matière, en fondu. Là où
  // une trace de pluie ou une limite de zone passe devant le décor, la normale
  // lue par le SSGI et le SSR est donc légèrement tirée vers celle du quad.
  // C'est supportable ici parce que ces surfaces n'écrivent PAS la profondeur :
  // les positions reconstruites restent celles du décor opaque derrière, et
  // seule l'orientation bouge, pondérée par une opacité qui dépasse rarement
  // quelques centièmes. Le jour où ça se verra, il faudra séparer la passe
  // opaque de la passe transparente.
  const beauty = scenePass.getTextureNode('output');
  const depth = scenePass.getTextureNode('depth');
  const normalTex = scenePass.getTextureNode('normal');
  const materialTex = scenePass.getTextureNode('material');

  let lit: V4 = asV4(beauty);

  if (options.ssgi) {
    const gi = ssgi(beauty, depth, normalTex, camera);
    // Sans filtrage temporel : la rame file à quatre-vingt-dix, le décor
    // traverse l'écran d'un bord à l'autre en deux secondes, et une
    // reprojection temporelle y laisse des traînées sur tout ce qui défile.
    // On paie donc l'échantillonnage comptant, et on débruite spatialement.
    gi.useTemporalFiltering = false;
    gi.sliceCount.value = 2;
    gi.stepCount.value = 8;
    // Six mètres : la largeur du wagon. Au-delà, l'indirect qu'on récolterait
    // vient de l'autre bout de la voiture et n'a plus de rapport physique
    // avec le point qu'on éclaire.
    gi.radius.value = 6;
    gi.giIntensity.value = 5.5;
    gi.aoIntensity.value = 1.1;
    gi.thickness.value = 0.5;

    const ao = gi.getAONode();
    const bounce = asV4(denoise(gi.getGINode(), depth, asNormal(normalTex), camera));
    lit = vec4(beauty.rgb.mul(ao.r).add(bounce.rgb), beauty.a);
  }

  if (options.ssr) {
    const refl = ssr(lit, depth, asNormal(normalTex), {
      camera,
      metalnessNode: materialTex.r,
      roughnessNode: materialTex.g,
      // Les surfaces qui comptent ici ne sont PAS métalliques : le sol vernis,
      // les vitres, la chaussée mouillée. Les couper reviendrait à ne garder
      // que les mains courantes.
      reflectNonMetals: true,
    });
    // Demi-résolution : une réflexion est floue par nature dès que la rugosité
    // dépasse quelques centièmes, et c'est le poste le plus cher du pipeline.
    refl.resolutionScale = 0.5;
    // Quatorze mètres : la longueur du wagon. Le sol renvoie la voiture
    // entière, pas la ville derrière la vitre.
    refl.maxDistance.value = 14;
    refl.thickness.value = 0.12;
    refl.quality.value = 0.5;
    refl.intensity.value = 0.85;
    lit = vec4(lit.rgb.add(asV4(refl).rgb), lit.a);
  }

  // --- Profondeur de champ ---
  // `focusDistance` est la distance du plan net, `focalLength` la distance
  // au-delà de laquelle un objet est complètement flou. Les deux sont pilotées
  // par la scène : l'œil accommode sur ce qu'il regarde.
  const uFocus = uniform(4.5);
  const uFocalLength = uniform(6);
  const uBokeh = uniform(2.4);

  if (options.dof) {
    lit = asV4(dof(lit, scenePass.getViewZNode(), uFocus, uFocalLength, uBokeh));
  }

  // Bloom au seuil haut : ce sont les néons, les enseignes et le soleil
  // rasant qui débordent, pas les murs clairs.
  const glow = asV4(bloom(lit, options.bloom, 0.6, 0.9));
  const composed = vec4(lit.rgb.add(glow.rgb), lit.a);

  // Étalonnage filmique et passage à l'espace de sortie. Il est fait ICI, à la
  // main, et non par le transfert automatique du pipeline : le grain et le
  // vignetage qui suivent sont des défauts d'objectif, ils se posent sur
  // l'image finie.
  const graded = asV4(renderOutput(composed));

  // Grain : un tirage par pixel et par image, prémultiplié par l'image comme
  // dans le chemin WebGL - un grain qui ne s'allume pas dans les noirs.
  const seed = uint(screenCoordinate.x)
    .add(uint(screenCoordinate.y).mul(4093))
    .add(uint(frameId).mul(9973));
  const grain = hash(seed).sub(0.5);

  // Vignetage : la même formule que l'effet du chemin WebGL (offset 0,32,
  // obscurité 0,42), pour que les deux modes cadrent pareil.
  const vignetteOffset = 0.32;
  const vignetteDarkness = 0.42;
  //
  // Les deux seuils sont pris dans l'ordre CROISSANT puis inversés, et non
  // passés à l'envers : `smoothstep` n'est défini, en WGSL comme en GLSL, que
  // pour un seuil bas inférieur au seuil haut. Le résultat est le même, il est
  // seulement écrit d'une façon dont la spécification répond.
  const d = screenUV.sub(vec2(0.5, 0.5)).length();
  const vignette = smoothstep(
    float(vignetteOffset * 0.799),
    float(0.8),
    d.mul(vignetteDarkness + vignetteOffset),
  ).oneMinus();

  const finalNode = vec4(
    graded.rgb.mul(float(1).add(grain.mul(0.05))).mul(vignette),
    graded.a,
  );

  const pipeline = new RenderPipeline(renderer as never, finalNode);
  // L'étalonnage est déjà dans le graphe : le pipeline ne doit pas le refaire.
  pipeline.outputColorTransform = false;

  return {
    render() {
      pipeline.render();
    },
    setSize() {
      // Les nœuds se redimensionnent d'eux-mêmes sur la taille du tampon de
      // dessin, à chaque image, dans leur `updateBefore`.
    },
    setFocus(distance: number, aperture: number) {
      uFocus.value = distance;
      // Une mise au point rapprochée a une profondeur de champ plus courte :
      // c'est de l'optique, pas un réglage d'humeur. À 1,5 m le plan net fait
      // une soixantaine de centimètres, à 20 m il en fait douze.
      uFocalLength.value = Math.max(0.9, distance * 0.62);
      uBokeh.value = aperture;
    },
    dispose() {
      pipeline.dispose();
    },
  };
}

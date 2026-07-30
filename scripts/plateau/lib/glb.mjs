// Construction d'un GLB de chunk avec @gltf-transform/core (déjà une
// dépendance du projet, utilisée par scripts/models-import.mjs).
//
// STRUCTURE D'UN CHUNK
//   scene
//     └── node « <chunkId> »            (à l'origine : le décalage est dans le
//         └── mesh                       manifeste, pas dans le GLB)
//             ├── primitive « near/facade »
//             ├── primitive « near/roof »
//             ├── primitive « medium/… »
//             └── primitive « far/… »
//
// Un primitive par couple (bande de distance, type de surface) : deux
// matériaux en tout et pour tout, et une granularité suffisante pour appliquer
// une simplification différente par bande à l'étape d'optimisation.
// La variété des façades passe par COLOR_0, pas par des matériaux distincts -
// mille matériaux, c'est mille changements d'état de rendu par image.

import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

export async function makeIO() {
  await MeshoptDecoder.ready;
  await MeshoptEncoder.ready;
  return new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
}

/** Bandes de distance, de la plus proche à la plus lointaine. */
export const BANDS = ['near', 'medium', 'far'];
/** Types de surface distingués par un matériau. */
export const SURFACES = ['facade', 'roof'];

// La couleur vit dans COLOR_0, pas dans le matériau : deux matériaux suffisent
// alors pour toute la ville, sans renoncer à la variété des façades.
const MATERIAL_SPECS = {
  facade: { baseColor: [1, 1, 1, 1], roughness: 0.9, metallic: 0 },
  roof: { baseColor: [1, 1, 1, 1], roughness: 0.85, metallic: 0 },
};

/**
 * @param {object} opts
 * @param {string} opts.id                identifiant du chunk (nom du nœud)
 * @param {Map<string, {positions:number[], normals:number[], colors:number[]}>} opts.groups
 *        clé « bande/surface »
 */
export function buildChunkDocument({ id, groups, metadata }) {
  const doc = new Document();
  doc.createBuffer();
  const scene = doc.createScene(id);
  const mesh = doc.createMesh(id);
  const node = doc.createNode(id).setMesh(mesh);
  scene.addChild(node);
  doc.getRoot().setDefaultScene(scene);
  if (metadata) doc.getRoot().setExtras(metadata);

  const materials = new Map();
  const materialFor = (surface) => {
    if (materials.has(surface)) return materials.get(surface);
    const spec = MATERIAL_SPECS[surface];
    const mat = doc
      .createMaterial(`plateau-${surface}`)
      .setBaseColorFactor(spec.baseColor)
      .setRoughnessFactor(spec.roughness)
      .setMetallicFactor(spec.metallic)
      // Aucune transparence : le tri par profondeur coûte cher et une façade
      // n'a aucune raison d'être translucide.
      .setAlphaMode('OPAQUE')
      .setDoubleSided(false);
    materials.set(surface, mat);
    return mat;
  };

  let triangles = 0;
  for (const [key, group] of groups) {
    if (group.positions.length === 0) continue;
    const [band, surface] = key.split('/');
    const count = group.positions.length / 3;
    const prim = doc
      .createPrimitive()
      .setName(key)
      // glTF ne stocke PAS le nom d'un primitive (mesh.primitives[] n'a pas de
      // champ `name`) : il disparaît au premier aller-retour. `extras`, lui,
      // est sérialisé - c'est donc là que vit la bande de distance, que
      // l'étape d'optimisation doit pouvoir relire.
      .setExtras({ band, surface })
      .setMaterial(materialFor(surface))
      .setAttribute(
        'POSITION',
        doc.createAccessor(`${key}/POSITION`).setType('VEC3').setArray(new Float32Array(group.positions)),
      )
      .setAttribute(
        'NORMAL',
        doc.createAccessor(`${key}/NORMAL`).setType('VEC3').setArray(new Float32Array(group.normals)),
      )
      .setAttribute(
        'COLOR_0',
        doc.createAccessor(`${key}/COLOR_0`).setType('VEC3').setArray(new Float32Array(group.colors)),
      )
      .setIndices(
        doc
          .createAccessor(`${key}/indices`)
          .setType('SCALAR')
          .setArray(count > 65535 ? new Uint32Array(count).map((_, i) => i) : new Uint16Array(count).map((_, i) => i)),
      );
    triangles += count / 3;
    mesh.addPrimitive(prim);
  }

  return { doc, triangles };
}

/** Statistiques d'un document, pour les rapports avant/après. */
export function describe(doc) {
  const root = doc.getRoot();
  let triangles = 0;
  let primitives = 0;
  let vertices = 0;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      primitives++;
      const idx = prim.getIndices();
      const pos = prim.getAttribute('POSITION');
      vertices += pos?.getCount() ?? 0;
      triangles += Math.round((idx ? idx.getCount() : (pos?.getCount() ?? 0)) / 3);
    }
  }
  let textureBytes = 0;
  for (const tex of root.listTextures()) textureBytes += tex.getImage()?.byteLength ?? 0;
  return {
    meshes: root.listMeshes().length,
    primitives,
    materials: root.listMaterials().length,
    textures: root.listTextures().length,
    vertices,
    triangles,
    textureBytes,
  };
}

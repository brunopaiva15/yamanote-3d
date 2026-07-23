// Inspection de GLB/glTF de personnages : squelette, clips, matériaux,
// hauteur, triangles — pour vérifier ce qu'un pack contient et comment la
// détection floue (os/clips) le comprend, avant import.
// Usage : node scripts/models-inspect.mjs <fichier.glb | dossier | pack.zip> [...]

import { makeIO, collectModelFiles, describeDocument } from './gltf-utils.mjs';

const inputs = process.argv.slice(2);
if (inputs.length === 0) {
  console.error('Usage : node scripts/models-inspect.mjs <fichier.glb | dossier | pack.zip> [...]');
  process.exit(1);
}

const io = await makeIO();
const files = collectModelFiles(inputs);
if (files.length === 0) {
  console.error('Aucun .glb/.gltf trouvé dans les entrées données.');
  process.exit(1);
}

for (const file of files) {
  console.log(`\n=== ${file} ===`);
  try {
    const doc = await io.read(file);
    const d = describeDocument(doc);
    console.log(`riggé : ${d.skinned}  |  hauteur brute : ${d.rawHeight.toFixed(3)}  |  minY : ${d.minY.toFixed(3)}  |  triangles : ${d.tris}`);
    console.log(`os logiques trouvés : ${Object.keys(d.bones).length ? Object.entries(d.bones).map(([k, v]) => `${k}→${v}`).join(', ') : 'AUCUN'}`);
    console.log(`clips (${d.clips.length}) : ${d.clips.join(', ') || '(aucun)'}`);
    console.log(`clips logiques : sitIdle=${d.logicalClips.sitIdle ?? '∅'}  standIdle=${d.logicalClips.standIdle ?? '∅'}  walk=${d.logicalClips.walk ?? '∅'}`);
    console.log(`matériaux : ${d.materials.join(', ') || '(aucun)'}`);
  } catch (err) {
    console.log(`illisible : ${err.message}`);
  }
}

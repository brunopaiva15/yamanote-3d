// Import de packs de personnages (Quaternius, KayKit, …) vers public/models/ :
// extraction (zip/dossier), filtrage des humanoïdes riggés, fusion optionnelle
// d'une librairie d'animations séparée (rigs identiques, ex. Universal Base
// Characters + Universal Animation Library), optimisation (dedup/prune/
// resample + compression meshopt, décodée nativement par drei), mesures, puis
// génération de public/models/manifest.json consommé par le jeu.
//
// Usage :
//   node scripts/models-import.mjs <pack.zip | dossier | fichier.glb> [...]
//        [--anims <pack.zip|dossier|fichier>]   animations à fusionner (répétable)
//        [--out <dossier>]                      défaut : public/models
//        [--max <n>]                            nb max de variantes (défaut 14)
//        [--source "<label>"] [--license "<label>"]
//        [--all]                                ne pas écarter zombies/robots/etc.
//
// Exemple (packs téléchargés depuis quaternius.com) :
//   npm run models:import -- ~/Téléchargements/UltimateModularMen.zip \
//     ~/Téléchargements/UltimateModularWomen.zip
// Puis vérifier/ajuster les archétypes dans public/models/manifest.json.

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { dedup, prune, resample, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { makeIO, collectModelFiles, describeDocument, variantIdFromPath } from './gltf-utils.mjs';

// --- Arguments ---
const args = process.argv.slice(2);
const inputs = [];
const animInputs = [];
let outDir = 'public/models';
let maxVariants = 14;
let sourceLabel = '';
let licenseLabel = 'CC0 1.0 (à vérifier selon le pack)';
let keepAll = false;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--anims') animInputs.push(args[++i]);
  else if (a === '--out') outDir = args[++i];
  else if (a === '--max') maxVariants = parseInt(args[++i], 10);
  else if (a === '--source') sourceLabel = args[++i];
  else if (a === '--license') licenseLabel = args[++i];
  else if (a === '--all') keepAll = true;
  else inputs.push(a);
}
if (inputs.length === 0) {
  console.error('Usage : node scripts/models-import.mjs <pack.zip|dossier|fichier> [...] [--anims <pack>] [--out public/models] [--max 14]');
  process.exit(1);
}

const io = await makeIO();

// --- Animations à fusionner (rigs identiques : ciblage par NOM d'os) ---
const animDocs = [];
for (const file of collectModelFiles(animInputs)) {
  try {
    animDocs.push(await io.read(file));
  } catch (err) {
    console.warn(`anims : ${file} illisible (${err.message})`);
  }
}

function mergeAnimations(charDoc, sources) {
  const root = charDoc.getRoot();
  const buffer = root.listBuffers()[0] ?? charDoc.createBuffer();
  const nodesByName = new Map();
  for (const n of root.listNodes()) if (!nodesByName.has(n.getName())) nodesByName.set(n.getName(), n);
  const existing = new Set(root.listAnimations().map((a) => a.getName()));
  let merged = 0;
  for (const src of sources) {
    for (const anim of src.getRoot().listAnimations()) {
      if (existing.has(anim.getName())) continue;
      const newAnim = charDoc.createAnimation(anim.getName());
      let channels = 0;
      for (const ch of anim.listChannels()) {
        const targetName = ch.getTargetNode()?.getName();
        const node = targetName ? nodesByName.get(targetName) : undefined;
        const sampler = ch.getSampler();
        if (!node || !sampler) continue;
        const input = sampler.getInput();
        const output = sampler.getOutput();
        if (!input || !output) continue;
        const newIn = charDoc.createAccessor().setType(input.getType()).setArray(input.getArray().slice()).setBuffer(buffer);
        const newOut = charDoc.createAccessor().setType(output.getType()).setArray(output.getArray().slice()).setBuffer(buffer);
        const newSampler = charDoc.createAnimationSampler().setInput(newIn).setOutput(newOut).setInterpolation(sampler.getInterpolation());
        const newChannel = charDoc.createAnimationChannel().setTargetNode(node).setTargetPath(ch.getTargetPath()).setSampler(newSampler);
        newAnim.addSampler(newSampler).addChannel(newChannel);
        channels++;
      }
      if (channels === 0) newAnim.dispose();
      else {
        existing.add(anim.getName());
        merged++;
      }
    }
  }
  return merged;
}

// --- Traits devinés depuis le nom de fichier (à ajuster dans manifest.json) ---
const EXCLUDE = /(zombie|skeleton|alien|robot|monster|goblin|orc|demon|ghost|animal|dog|cat|dragon|knight|barbarian|mage|rogue|soldier|astronaut|cowboy|ninja|pirate|viking|wizard)/i;

function guessTraits(id) {
  const n = id.toLowerCase();
  const feminine = /(women|woman|female|girl|lady)/.test(n) || /(^|_)f(_|$)/.test(n);
  let archetypes;
  if (/(suit|business|formal|office)/.test(n)) archetypes = feminine ? ['officeLady', 'senior'] : ['salaryman', 'senior'];
  else if (/(blouse|dress)/.test(n)) archetypes = ['officeLady', 'casual'];
  else if (/(hoodie|punk|teen|student|young)/.test(n)) archetypes = ['student', 'casual'];
  else if (/(old|senior|grand)/.test(n)) archetypes = ['senior'];
  else if (/(summer|beach|tourist)/.test(n)) archetypes = ['tourist', 'casual'];
  else archetypes = ['casual', 'tourist', 'student'];
  return { feminine, archetypes };
}

// --- Import ---
const files = collectModelFiles(inputs);
console.log(`${files.length} fichier(s) .glb/.gltf trouvé(s).`);
const entries = [];
const skipped = [];

for (const file of files) {
  if (entries.length >= maxVariants) break;
  const id = variantIdFromPath(file);
  if (!keepAll && EXCLUDE.test(id)) {
    skipped.push(`${id} (thème hors sujet — relancer avec --all pour l'inclure)`);
    continue;
  }
  let doc;
  try {
    doc = await io.read(file);
  } catch (err) {
    skipped.push(`${id} (illisible : ${err.message})`);
    continue;
  }
  let d = describeDocument(doc);
  if (!d.skinned || !d.bones.hips || !d.bones.head) {
    skipped.push(`${id} (pas un humanoïde riggé)`);
    continue;
  }
  if (d.rawHeight < 0.5 || d.rawHeight > 6) {
    skipped.push(`${id} (hauteur improbable : ${d.rawHeight.toFixed(2)})`);
    continue;
  }
  if (d.clips.length === 0 && animDocs.length > 0) {
    const merged = mergeAnimations(doc, animDocs);
    console.log(`${id} : ${merged} animation(s) fusionnée(s) depuis --anims`);
    d = describeDocument(doc);
  }
  if (!d.logicalClips.standIdle && !d.logicalClips.walk) {
    skipped.push(`${id} (aucun clip Idle/Walk exploitable — pack d'animations séparé ? utiliser --anims)`);
    continue;
  }

  await doc.transform(dedup(), prune(), resample());
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));

  const outName = `${id.toLowerCase()}.glb`;
  mkdirSync(outDir, { recursive: true });
  await io.write(join(outDir, outName), doc);

  const { feminine, archetypes } = guessTraits(id);
  const entry = { id, file: outName, archetypes, feminine };
  if (!d.logicalClips.sitIdle) entry.noSitClip = true; // informatif (assise manuelle)
  entries.push(entry);
  console.log(
    `✓ ${outName}  h=${d.rawHeight.toFixed(2)}  tris=${d.tris}  sit=${d.logicalClips.sitIdle ?? '∅ (assise manuelle)'}  idle=${d.logicalClips.standIdle ?? '∅'}  walk=${d.logicalClips.walk ?? '∅'}  →  ${archetypes.join('/')}${feminine ? ' (F)' : ''}`,
  );
}

if (entries.length === 0) {
  console.error('\nAucune variante importée.');
  for (const s of skipped) console.error(`  écarté : ${s}`);
  process.exit(1);
}

const manifest = {
  version: 1,
  source: sourceLabel || inputs.join(', '),
  license: licenseLabel,
  walkClipSpeed: 1.4,
  variants: entries,
};
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

const licensePath = join(outDir, 'LICENSE.md');
if (!existsSync(licensePath)) {
  writeFileSync(
    licensePath,
    `# Modèles de personnages\n\n- Source : ${manifest.source}\n- Licence : ${manifest.license}\n\nLes packs Quaternius (https://quaternius.com) et KayKit\n(https://kaylousberg.itch.io) sont publiés en CC0 1.0 : utilisation libre,\ny compris commerciale, sans attribution requise. Vérifier la licence si un\nautre pack est importé.\n`,
  );
}

console.log(`\n${entries.length} variante(s) → ${resolve(outDir)}/manifest.json`);
if (skipped.length > 0) {
  console.log(`écartés (${skipped.length}) :`);
  for (const s of skipped) console.log(`  - ${s}`);
}
console.log('\nÉtapes suivantes :');
console.log('  1. Vérifier/ajuster "archetypes" et "feminine" dans manifest.json');
console.log('  2. npm run dev → contrôler l\'assise, la marche, les poignées');
console.log('  3. Committer public/models/ (GLB + manifest.json + LICENSE.md)');

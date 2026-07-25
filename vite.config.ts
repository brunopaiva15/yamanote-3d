import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Les maquettes de référence (voir README) vivent dans public/models/raw/ pour
// que /car-probe.html les serve en dev sans configuration. Elles sont ignorées
// par git, mais Vite recopie tout public/ dans le build : sans ce nettoyage, un
// build lancé sur une machine où elles sont présentes embarquerait plusieurs
// mégaoctets de maquette dans le site déployé.
function dropReferenceModels(): Plugin {
  let outDir = 'dist';
  return {
    name: 'drop-reference-models',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      await rm(resolve(outDir, 'models/raw'), { recursive: true, force: true });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), dropReferenceModels()],
  // Chemins relatifs : le build fonctionne aussi bien à la racine d'un domaine
  // que sous un sous-chemin (GitHub Pages : /yamanote-3d/).
  base: './',
});

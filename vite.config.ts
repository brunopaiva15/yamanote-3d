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
  build: {
    rolldownOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        about: resolve(import.meta.dirname, 'about.html'),
      },
    // Le bundle partait en un seul fichier de 2,4 Mo, dont les trois quarts sont
    // three.js et React - du code qui ne change jamais. Séparés, ils restent en
    // cache d'une visite à l'autre et d'un déploiement au suivant : seul le
    // morceau du jeu est retéléchargé quand on touche au jeu.
      output: {
        codeSplitting: {
          groups: [
            // React et son moteur de rendu DOM d'abord, avant toute autre
            // règle. Sans cette ligne, ils étaient revendiqués par le morceau
            // « three » - @react-three/fiber les importe - et l'entrée, qui a
            // besoin de React pour afficher le menu, se retrouvait à dépendre
            // statiquement d'un morceau de six cent soixante kilo-octets : le
            // simple menu principal téléchargeait le rendu 3D qu'il est censé
            // charger à la demande.
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler|react-reconciler|use-sync-external-store)[\\/]/ },
            // zustand, pour la MÊME raison, et c'était la fuite la plus chère :
            // @react-three/fiber s'en sert, le morceau « three » le revendiquait
            // donc, et `store.ts` - que le menu importe pour savoir s'il a
            // démarré - suffisait à faire précharger tout le rendu 3D dès la
            // page d'accueil. Quatre cent soixante-dix kilo-octets pour un
            // magasin d'état de deux.
            { name: 'react', test: /node_modules[\\/]zustand[\\/]/ },
            // Le build WebGPU de three (et le système de nœuds qui va avec)
            // pèse à lui seul plus que tout le reste de three, et ne sert
            // qu'au mode « Extraordinaire ». Il est isolé AVANT la règle
            // générale pour qu'il reste dans le morceau chargé à la demande
            // par three/webgpu/kit : sans cette ligne, il retomberait dans le
            // morceau `three`, que tout le monde télécharge au démarrage.
            // Le tronc commun de three (`three.core.js`) est revendiqué EN
            // PREMIER par le morceau eager : il est importé par les deux
            // builds, et sans cette règle il suivait le build WebGPU, qui
            // redevenait alors une dépendance statique de tout le monde.
            {
              name: 'three',
              test: /node_modules[\\/]three[\\/]build[\\/]three\.(core|module)\.js/,
            },
            {
              name: 'three-webgpu',
              test: /node_modules[\\/]three[\\/](build[\\/]three\.(webgpu|tsl)\.js|examples[\\/]jsm[\\/]tsl[\\/])/,
            },
            { name: 'three', test: /node_modules[\\/](three|@react-three|postprocessing)[\\/]/ },
            { name: 'tone', test: /node_modules[\\/]tone[\\/]/ },
            // PAS de règle pour `@supabase`, et c'est un choix appris à mes
            // dépens.
            //
            // J'en avais ajouté une, pour « garantir » que le client réseau
            // reste dans son propre morceau. Elle a produit exactement
            // l'inverse : un morceau NOMMÉ entre dans les `modulepreload` de
            // `index.html`, et tout visiteur - salon ou pas - se mettait à
            // télécharger deux cent quatre kilo-octets de client temps réel dès
            // l'ouverture du menu. Le contrat « sans clés, supabase-js n'est
            // jamais téléchargé » était rompu par la règle censée le protéger.
            //
            // L'import dynamique de `systems/net/config` sépare le morceau tout
            // seul, sans le nommer, et le laisse hors des préchargements. C'est
            // ce que le build faisait déjà très bien, et c'est vérifié sur le
            // build de production, pas sur une intention.
          ],
        },
      },
    },
  },
});

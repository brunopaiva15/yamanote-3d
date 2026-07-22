import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Chemins relatifs : le build fonctionne aussi bien à la racine d'un domaine
  // que sous un sous-chemin (GitHub Pages : /yamanote-3d/).
  base: './',
});

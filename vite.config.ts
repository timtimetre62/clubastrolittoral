import { defineConfig } from 'vite';

// base relative : l'appli fonctionne sur GitHub Pages (/clubastrolittoral/) comme en local.
export default defineConfig({
  base: './',
  build: { target: 'es2020', chunkSizeWarningLimit: 800 },
});

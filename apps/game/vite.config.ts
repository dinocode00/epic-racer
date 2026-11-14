import { resolve } from 'node:path';
import { defineConfig } from 'vite';
export default defineConfig({
  base: './', // relative, so the build also runs from any static host
  assetsInclude: ['**/*.glb'], // Blender models, bundled into the script with ?inline
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        farm: resolve(__dirname, 'farm.html'),
        grandpa: resolve(__dirname, 'grandpa.html'),
        trackLook: resolve(__dirname, 'trackLook.html'),
      },
      output: {
        // Each Blender model in a file of its own, so no one script grows past what a
        // static host (or the shared preview) takes in a single file.
        manualChunks(id) {
          const m = /\/render\/models\/([\w-]+)\.glb/.exec(id);
          return m ? `model-${m[1]}` : undefined;
        },
      },
    },
  },
});

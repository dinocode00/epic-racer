import { resolve } from 'node:path';
import { defineConfig } from 'vite';
export default defineConfig({
  base: './', // relative, so the build also runs from any static host
  assetsInclude: ['**/*.glb'], // Blender models, bundled into the script with ?inline
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        farm: resolve(__dirname, 'farm.html'),
        grandpa: resolve(__dirname, 'grandpa.html'),
        trackLook: resolve(__dirname, 'trackLook.html'),
      },
    },
  },
});

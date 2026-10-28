import { resolve } from 'node:path';
import { defineConfig } from 'vite';
export default defineConfig({
  base: './', // relative, so the build also runs from any static host
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        farm: resolve(__dirname, 'farm.html'),
      },
    },
  },
});

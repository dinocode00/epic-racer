import { defineConfig } from 'vite';
export default defineConfig({
  base: './', // relative, so the build also runs from any static host
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 2000 },
});

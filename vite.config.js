import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
});

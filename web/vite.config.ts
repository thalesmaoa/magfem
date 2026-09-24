/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Publicada em thalesmaia.com/tools/magfem-web/ (copiada pelo workflow do portal).
  base: '/tools/magfem-web/',
  plugins: [react()],
  worker: { format: 'es' },
  test: { include: ['src/**/*.test.ts'] },
  server: {
    host: '0.0.0.0',
    port: 3002,
    watch: { usePolling: true }
  }
});

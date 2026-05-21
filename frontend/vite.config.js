import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';

// Tag de build visible en runtime para verificar deploys.
// Toma commit hash de Git o de la env de Vercel/Railway si está disponible.
function getBuildTag() {
  if (process.env.VITE_BUILD_TAG) return process.env.VITE_BUILD_TAG.slice(0, 7);
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7);
  if (process.env.RAILWAY_GIT_COMMIT_SHA) return process.env.RAILWAY_GIT_COMMIT_SHA.slice(0, 7);
  if (process.env.BUILD_COMMIT) return process.env.BUILD_COMMIT.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'dev';
  }
}

const BUILD_TAG = getBuildTag();
const BUILD_TIME = new Date().toISOString();

// Inyectamos como import.meta.env.VITE_* — API canónica de vite para
// variables expuestas al cliente. El `define` anterior con __APP_VERSION__
// no se sobrevivía a la minificación.
process.env.VITE_BUILD_TAG = BUILD_TAG;
process.env.VITE_BUILD_TIME = BUILD_TIME;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 7777,
    strictPort: true,
    host: '127.0.0.1',
    proxy: {
      '/api': { target: 'http://localhost:3002', changeOrigin: true },
    },
  },
});

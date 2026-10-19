import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
// @ts-expect-error -- plain JS build script shared with the api
import { releaseVersion } from '../../scripts/version.js';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  if (mode === 'production' && !env.VITE_API_URL) {
    throw new Error('VITE_API_URL is required to build the web app.');
  }
  return {
    plugins: [react()],
    define: {
      // The release only: what the responsible declaration identifies (README, Version).
      __APP_VERSION__: JSON.stringify(releaseVersion()),
    },
    server: {
      // Same-origin API in development too, so session cookies behave as in staging.
      proxy: {
        '/api': {
          target: env.VITE_DEV_API_TARGET || 'http://localhost:3000',
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
  };
});

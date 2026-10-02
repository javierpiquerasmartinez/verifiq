import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // SWC instead of esbuild so Nest gets decorator metadata.
  plugins: [swc.vite()],
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
});

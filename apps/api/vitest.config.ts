import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    exclude: ['src/live.test.ts', 'node_modules/**', 'dist/**'],
  },
});

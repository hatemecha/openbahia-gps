import { defineConfig } from 'vitest/config';

const liveGps = process.env.LIVE_GPS === '1';

export default defineConfig({
  test: {
    environment: 'node',
    exclude: liveGps ? ['node_modules/**', 'dist/**'] : ['src/live.test.ts', 'node_modules/**', 'dist/**'],
  },
});

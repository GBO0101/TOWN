import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.js'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.js'],
    environmentOptions: {
      runScripts: 'dangerously',
      resources: 'usable',
    },
  },
});

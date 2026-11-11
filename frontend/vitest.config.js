import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/tests/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: process.env.CI ? 2 : undefined
      }
    },
    testTimeout: 30000,
    hookTimeout: 30000
  }
});


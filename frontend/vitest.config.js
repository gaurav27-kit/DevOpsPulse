import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    pool: 'threads',
    fileParallelism: false,
    setupFiles: ['./src/tests/setup.js'],
    include: ['src/**/*.test.{js,jsx}']
  }
});


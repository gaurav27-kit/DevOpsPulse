import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';

// Configure React Testing Library async timeout for stable concurrent execution
configure({ asyncUtilTimeout: 4000 });

// Polyfill ResizeObserver for recharts in jsdom
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Polyfill window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
});


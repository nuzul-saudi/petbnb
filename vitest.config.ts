// Vitest config. Scope is pure libs only — payments-policy.ts,
// pricing.ts, availability.ts (rangesOverlap), vaccination.ts. No
// React / React Native / Expo integration in this round; those become
// the next milestone.
//
// The @/* path alias mirrors tsconfig so the test files can import
// the libs with their production paths.

import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});

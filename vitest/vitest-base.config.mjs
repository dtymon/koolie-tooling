/* Refer to https://vitest.dev/config for details */
import { defineConfig } from 'vitest/config';

// Detect a CI environment so that test artefacts (JUnit XML in particular) are
// only emitted when something is set up to consume them. GitHub Actions sets
// `CI=true` automatically; other CI providers do likewise. Local developer
// runs should not litter the working tree with reporter output.
const isCi = process.env.CI === 'true' || process.env.CI === '1';

const koolieBaseVitestConfig = defineConfig({
  test: {
    // Expose `describe`, `it`, `expect`, etc. as globals so existing specs do
    // not need to import them. The matching `types: ["vitest/globals"]` entry
    // in `tsconfig.spec.json` keeps the type-checker happy.
    globals: true,

    // Server-side code only — no jsdom needed.
    environment: 'node',

    // Mirror the previous Jest `testMatch` patterns so existing specs are
    // discovered without changes.
    include: [
      'src/**/*.spec.{js,ts}',
      'tests/**/*.spec.{js,ts}',
      'src/**/__tests__/**/*.{js,ts}',
    ],

    // Bump up the test timeout from the default 5s.
    testTimeout: 10000,

    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'html', 'cobertura'],
      reportsDirectory: 'coverage',
      exclude: ['node_modules/**', 'dist/**', '**/*.spec.{js,ts}'],
      thresholds: {
        lines: 80,
        branches: 80,
      },
    },

    // In CI, additionally emit a GitHub Actions reporter (annotates failures
    // inline on the PR) and a JUnit XML file that GHA can pick up as a test
    // artefact. Local runs stay quiet with the default reporter.
    reporters: isCi
      ? ['default', 'github-actions', ['junit', { outputFile: 'coverage/junit.xml' }]]
      : ['default'],
  },
});

export default koolieBaseVitestConfig;

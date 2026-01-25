import { defineConfig } from 'eslint/config';

import toolingDefaults from './eslint.config.defaults.mjs';

export default defineConfig([
  ...toolingDefaults,
  {
    languageOptions: {
      parserOptions: {
        project: 'tsconfig.spec.json',
      },
    },
  },
]);

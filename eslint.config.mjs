import { defineConfig, globalIgnores } from 'eslint/config';

import { defaultConfig } from './eslint.config.defaults.mjs';

export default defineConfig([
  globalIgnores(['**/node_modules/**', 'dist/**', 'src/*.spec.ts', 'src/**/*.spec.ts', 'src/**/*.d.ts', 'coverage/**']),

  {
    extends: [...defaultConfig],

    files: ['src/*.ts', 'src/**/*.ts'],

    languageOptions: {
      parserOptions: {
        project: 'tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
]);

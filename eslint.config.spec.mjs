import { defineConfig, globalIgnores } from 'eslint/config';

import { defaultConfig } from './eslint.config.defaults.mjs';

export default defineConfig([
  globalIgnores(['**/node_modules/**', 'dist/**', 'coverage/**']),

  {
    extends: [...defaultConfig],

    files: ['src/*.spec.ts', 'src/**/*.spec.ts'],

    languageOptions: {
      parserOptions: {
        project: 'tsconfig.spec.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },

    rules: {
      // Test code legitimately needs these relaxations
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-member-accessibility': 'off',

      // Mocks and fixtures often produce `any`-typed values
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',

      'tsdoc/syntax': 'off',
    },
  },
]);

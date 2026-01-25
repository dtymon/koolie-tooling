import { defineConfig } from 'eslint/config';
import eslint from '@eslint/js';

import tseslint from 'typescript-eslint';
import tsdoc from 'eslint-plugin-tsdoc';
import prettier from 'eslint-plugin-prettier';
import importPlugin from 'eslint-plugin-import';

export default defineConfig([
  // Base ESLint recommended
  eslint.configs.recommended,

  // import plugin flat config
  importPlugin.flatConfigs.recommended,

  // TypeScript-ESLint recommended configs
  ...tseslint.configs.recommended,

  // Main project rules
  {
    linterOptions: {
      reportUnusedDisableDirectives: false,
    },

    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: 'tsconfig.json',
        sourceType: 'module',
        ecmaVersion: 'latest',
      },
    },

    plugins: {
      '@typescript-eslint': tseslint.plugin,
      prettier,
      tsdoc,
    },

    rules: {
      eqeqeq: 'error',

      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'off',

      '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: true }],

      '@typescript-eslint/no-namespace': [
        'error',
        {
          allowDeclarations: true,
          allowDefinitionFiles: false,
        },
      ],

      '@typescript-eslint/no-parameter-properties': 'off',

      // Disable base rule — TS version is correct
      'no-unused-expressions': 'off',
      '@typescript-eslint/no-unused-expressions': 'error',

      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],

      '@typescript-eslint/no-use-before-define': 'off',

      'prettier/prettier': 'error',

      'import/named': 'off',
      'import/no-unresolved': 'off',
      'import/export': 'off',
      'import/no-duplicates': 'off',

      'tsdoc/syntax': 'warn',
    },

    settings: {
      'import/resolver': {
        typescript: {
          project: './tsconfig.json',
        },
      },
    },

    ignores: ['/dist/*'],
  },

  // Library files
  {
    files: ['src/lib/**/*.ts'],
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },

  // CLI / bin files
  {
    files: ['src/bin/**/*.ts'],
    rules: {
      'no-console': 'off',
      'no-undef': 'off',
      '@typescript-eslint/no-var-requires': 'off',
    },
  },
]);

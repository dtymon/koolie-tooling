import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';
import tsdocPlugin from 'eslint-plugin-tsdoc';

export const defaultConfig = defineConfig([
  {
    extends: [...tseslint.configs.recommendedTypeChecked, ...tseslint.configs.stylisticTypeChecked],

    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },

    plugins: {
      prettier: prettierPlugin,
      tsdoc: tsdocPlugin,
    },

    rules: {
      eqeqeq: 'error',

      // Class members must declare visibility explicitly
      '@typescript-eslint/explicit-member-accessibility': 'error',

      // Functions should declare their return type at API boundaries
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
        },
      ],

      // Async safety
      '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: true }],

      // Catch dead conditions implied by the type system
      '@typescript-eslint/no-unnecessary-condition': 'error',

      // Enforce exhaustive switches over unions and enums
      '@typescript-eslint/switch-exhaustiveness-check': 'error',

      // Allow `declare namespace ...` for module augmentation; not in code
      '@typescript-eslint/no-namespace': [
        'error',
        {
          allowDeclarations: true,
          allowDefinitionFiles: false,
        },
      ],

      // Defer to the typescript-aware variant
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

      // Mirror the tsconfig `useUnknownInCatchVariables` setting at the lint layer
      '@typescript-eslint/use-unknown-in-catch-callback-variable': 'error',

      'tsdoc/syntax': 'error',
      'prettier/prettier': 'error',
    },
  },

  // Disables stylistic rules that would conflict with prettier
  prettierConfig,
]);

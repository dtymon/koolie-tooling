import koolieDefaults from './.eslint.config.js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  ...koolieDefaults,
  {
    languageOptions: {
      parserOptions: {
        project: 'tsconfig.spec.json'
      }
    },
    rules: {
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-floating-promises': 'off'
    }
  }
);

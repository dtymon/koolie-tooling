import eslint from '@eslint/js';
import pluginImports from 'eslint-plugin-import';
import prettier from 'eslint-plugin-prettier';
import tsdoc from 'eslint-plugin-tsdoc';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        project: 'tsconfig.json',
        sourceType: 'module',
        ecmaVersion: 'latest'
      }
    },
    plugins: { prettier, pluginImports, tsdoc },
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': [
        'error',
        {
          ignoreVoid: true
        }
      ],
      '@typescript-eslint/no-namespace': [
        'error',
        {
          allowDeclarations: true,
          allowDefinitionFiles: false
        }
      ],
      '@typescript-eslint/no-parameter-properties': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_'
        }
      ],
      '@typescript-eslint/no-use-before-define': 'off',
      'prettier/prettier': 'error',
      'sort-imports': [
        'error',
        {
          ignoreCase: false,
          ignoreDeclarationSort: true,
          ignoreMemberSort: false,
          memberSyntaxSortOrder: ['none', 'all', 'multiple', 'single'],
          allowSeparatedGroups: true
        },
      ],
      'tsdoc/syntax': 'warn'
    },
    ignores: ['/dist/*']
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-console': [
        'error',
        {
          allow: ['warn', 'error']
        }
      ]
    }
  }
);

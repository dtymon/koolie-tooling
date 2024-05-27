module.exports = {
  tsconfig: '../tsconfig.json',
  entryPointStrategy: 'expand',
  exclude: ['**/*+(index|.spec).ts'],
  excludeInternal: true,
  excludePrivate: true,
  cleanOutputDir: true,
  plugin: ['typedoc-plugin-merge-modules'],
  mergeModulesMergeMode: 'module',
  darkHighlightTheme: 'github-dark',
  lightHighlightTheme: 'github-light'
};

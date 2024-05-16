/* Refer to https://jestjs.io/docs/configuration for details */
const koolieBaseJestConfig = {
  // Collect coverage information
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coveragePathIgnorePatterns: ['/node_modules/'],
  coverageProvider: 'v8',
  coverageReporters: ['text', 'html', 'cobertura'],
  coverageThreshold: {
    global: {
      branches: 80,
      lines: 80
    }
  },

  // All Typescript files should use ESM
  extensionsToTreatAsEsm: ['.ts'],

  // An array of file extensions to use when requring modules without an
  // explicit extension specified.
  moduleFileExtensions: ['js', 'jsx', 'ts', 'tsx', 'json'],

  // A map from regular expressions to module names or to arrays of module names
  // that allow to stub out resources, like images or styles with a single
  // module.
  moduleNameMapper: {
    '@src/(.+)\\.js$': '<rootDir>/src/$1',
    '(.+)\\.js$': '$1'
  },

  // Use ts-jest as the base config for jest
  preset: 'ts-jest',

  // Disable prettier for now since Jest does not support v3 yet
  prettierPath: null,

  // Include the GH actions reporter
  reporters: ['default', ['github-actions', { silent: false }]],

  // What tests to run
  testMatch: ['<rootDir>/(src|tests)/**/*.spec.[jt]s?(x)', '<rootDir>/src/**/__tests__/**/*.[jt]s?(x)'],

  // Bump up the test timeout from the default
  testTimeout: 10000,

  // Perform path transformation for ts and tsx files
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true }]
  },

  // Run verbosely when executing a single test
  verbose: true
};

export default koolieBaseJestConfig;

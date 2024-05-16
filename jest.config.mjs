import koolieBaseJestConfig from './node_modules/@koolie/tooling/jest/jest-base.config.mjs';

const koolieJestConfig = {
  ...koolieBaseJestConfig,
  testPathIgnorePatterns: ['<rootDir>/node_modules', '<rootDir>/dist']
};

export default koolieJestConfig;

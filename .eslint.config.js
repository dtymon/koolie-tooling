import tseslint from 'typescript-eslint';

import koolieBaseLintConfig from './node_modules/@koolie/tooling/.eslint.config.js';

export default tseslint.config(
  ...koolieBaseLintConfig
);

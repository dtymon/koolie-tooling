import { defineConfig, mergeConfig } from 'vitest/config';
import koolieBaseVitestConfig from './vitest/vitest-base.config.mjs';

// Project-level overrides on top of the shared Koolie base config.
//
// `server.deps.inline` forces vitest to route fixture sub-command modules
// (written under `node_modules/@koolie/*` by `discovery.spec.ts`) through
// the same transform pipeline as the rest of the source tree. Without this,
// vitest externalises anything under `node_modules` and the fixture's
// `SubCommand` import resolves to a different module instance than the one
// the spec uses, breaking the `instanceof` check in `discoverSubCommands`.
export default mergeConfig(
  koolieBaseVitestConfig,
  defineConfig({
    test: {
      server: {
        deps: {
          inline: [/node_modules\/@koolie\//],
        },
      },
    },
  })
);

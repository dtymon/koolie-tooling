import { defineConfig, mergeConfig } from 'vitest/config';
import koolieBaseVitestConfig from './vitest/vitest-base.config.mjs';

// Project-level overrides on top of the shared Koolie base config. Kept empty
// today — downstream packages can mirror this file and slot in their own
// project-specific options here.
export default mergeConfig(koolieBaseVitestConfig, defineConfig({}));

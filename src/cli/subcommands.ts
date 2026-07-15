import { command as addPackageCommand } from './koolie-SubCmdAddPackage.js';
import { command as buildDistCommand } from './koolie-SubCmdBuildDist.js';
import { command as removePackageCommand } from './koolie-SubCmdRemovePackage.js';

import type { SubCommand } from './SubCommand.js';

/**
 * Sub-commands contributed by `@koolie/tooling`. The CLI entry point reads
 * this list via the `koolie.subcommands` manifest field, which avoids any
 * dependency on `node_modules/.bin/` layout (and therefore works under
 * pnpm-isolated, Yarn PnP, or any other package manager linker).
 */
export const commands: SubCommand[] = [addPackageCommand, buildDistCommand, removePackageCommand];

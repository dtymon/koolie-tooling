import { createRequire } from 'node:module';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

import { SubCommand } from './SubCommand.js';
import { fileExists, readJsonFile } from './Utils.js';

/**
 * Shape of the parts of a `package.json` manifest the discovery walker reads.
 * Only `koolie.subcommands` is interpreted as a contribution; everything else
 * is ignored.
 */
interface DiscoveryManifest {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  koolie?: {
    subcommands?: string;
  };
}

/**
 * Shape that a dynamically-loaded sub-command module is expected to expose.
 * Properties are typed as `unknown` because there is no compile-time guarantee
 * about the loaded module — the `instanceof SubCommand` and `Array.isArray`
 * guards below provide the actual runtime defence.
 */
interface SubCommandModule {
  command?: unknown;
  commands?: unknown;
}

/**
 * Walk the cwd and the `\@koolie/*` subgraph of its dependencies, collecting
 * sub-commands declared via the `koolie.subcommands` manifest field.
 *
 * Resolution is anchored at the consumer's cwd so the active package
 * manager's rules (Yarn 1, npm hoisted, pnpm isolated, Yarn PnP) are
 * honoured.
 *
 * @param cwd - working directory to discover from
 * @returns the discovered sub-commands, in walk order
 */
export async function discoverSubCommands(cwd: string = process.cwd()): Promise<SubCommand[]> {
  const subCommands: SubCommand[] = [];
  const visited = new Set<string>();

  const anchor = pathToFileURL(path.join(cwd, 'package.json'));
  const requireFromCwd = createRequire(anchor);

  // Self-discovery: the consumer's own manifest may declare sub-commands.
  // This is the path used when developing a tooling package itself, where
  // it _is_ the cwd.
  const cwdManifestPath = path.join(cwd, 'package.json');
  if (await fileExists(cwdManifestPath)) {
    const cwdManifest = await readJsonFile<DiscoveryManifest>(cwdManifestPath);
    await loadFromManifest(cwd, cwdManifest, subCommands);
    await walkKoolieDependencies(cwdManifest, requireFromCwd, visited, subCommands);
  }

  return subCommands;
}

/**
 * Recursively walk the `\@koolie/*` subgraph of the given manifest,
 * collecting sub-commands contributed by any package that declares
 * `koolie.subcommands`.
 *
 * Only `\@koolie/*` packages are traversed because they are the only ones
 * expected to contribute CLI sub-commands; walking the full dep graph would
 * be unnecessary work.
 *
 * @param manifest - the manifest whose deps to walk
 * @param requireFromCwd - require anchored at the consumer's cwd
 * @param visited - set of already-visited package names (cycle guard)
 * @param subCommands - accumulator of discovered sub-commands
 */
async function walkKoolieDependencies(
  manifest: DiscoveryManifest,
  requireFromCwd: NodeJS.Require,
  visited: Set<string>,
  subCommands: SubCommand[]
): Promise<void> {
  const dependencyNames = [...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.devDependencies ?? {})];

  for (const name of dependencyNames) {
    if (!name.startsWith('@koolie/')) {
      continue;
    }
    if (visited.has(name)) {
      continue;
    }
    visited.add(name);

    let manifestPath: string;
    try {
      manifestPath = requireFromCwd.resolve(`${name}/package.json`);
    } catch {
      // Dependency declared but not installed — skip silently rather than
      // failing the whole CLI.
      continue;
    }

    const depManifest = await readJsonFile<DiscoveryManifest>(manifestPath);
    const depRoot = path.dirname(manifestPath);
    await loadFromManifest(depRoot, depManifest, subCommands);
    await walkKoolieDependencies(depManifest, requireFromCwd, visited, subCommands);
  }
}

/**
 * Import the sub-command module declared by a manifest's `koolie.subcommands`
 * field, if present, and append any contributed sub-commands to the
 * accumulator.
 *
 * @param packageRoot - absolute path of the package root
 * @param manifest - the parsed manifest
 * @param subCommands - accumulator of discovered sub-commands
 */
async function loadFromManifest(
  packageRoot: string,
  manifest: DiscoveryManifest,
  subCommands: SubCommand[]
): Promise<void> {
  const declared = manifest.koolie?.subcommands;
  if (declared === undefined) {
    return;
  }

  const moduleFile = path.resolve(packageRoot, declared);
  await importSubCommandSourceFile(moduleFile, subCommands);
}

/**
 * Import the JS source file that defines one or more sub-commands. The file
 * is expected to export a `command: SubCommand` and/or `commands: SubCommand[]`.
 *
 * @param filename - the JS source file to import (absolute path)
 * @param subCommands - the accumulated sub-commands
 */
async function importSubCommandSourceFile(filename: string, subCommands: SubCommand[]): Promise<void> {
  // Import via file URL to side-step exports-map quirks; the file path is
  // already absolute and the manifest is the source of truth.
  const moduleUrl = pathToFileURL(filename).href;
  const subCommandExports = (await import(moduleUrl)) as SubCommandModule;
  if (subCommandExports.command !== undefined) {
    if (subCommandExports.command instanceof SubCommand) {
      subCommands.push(subCommandExports.command);
    } else {
      throw new Error(`${filename}: Sub-command export "command" is expected to be an instance of SubCommand`);
    }
  }

  if (subCommandExports.commands !== undefined) {
    const commands = subCommandExports.commands;
    if (!Array.isArray(commands)) {
      throw new Error(`${filename}: Sub-command export "commands" is expected to be an array of SubCommand`);
    }

    for (const command of commands) {
      if (!(command instanceof SubCommand)) {
        throw new Error(`${filename}: All exported sub-commands are expected to be an instance of SubCommand`);
      }
      subCommands.push(command);
    }
  }
}

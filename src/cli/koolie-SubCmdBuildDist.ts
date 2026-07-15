import * as path from 'node:path';

import { copy } from 'fs-extra';
import { mkdirp } from 'mkdirp';
import type { Arguments, Argv } from 'yargs';

import { SubCommand } from './SubCommand.js';
import { dirExists, filterFile, pathExists } from './Utils.js';

const ALWAYS_COPY: string[] = ['README.md', 'CHANGELOG.md', 'LICENSE', 'yarn.lock'];

/** Parsed command-line options for the `build-dist` sub-command */
interface BuildDistOptions {
  root: string | null;
  dest: string;
  files?: string[];
}

export class SubCommandBuildDist extends SubCommand {
  /**
   * Get the name of this sub-command
   *
   * @returns the name of this sub-command
   */
  public name(): string {
    return 'build-dist';
  }

  /**
   * Get the description of this sub-command
   *
   * @returns the description of this sub-command
   */
  public description(): string {
    return 'Build the distribution';
  }

  /**
   * Called to create the options for this sub-command
   *
   * @returns a function that can add the sub-command options
   */
  public create(): (yargs: Argv) => Argv {
    return (yargs: Argv) =>
      yargs
        .option('root', {
          alias: 'r',
          description: 'Root directory containing source and auxiliary files',
          default: null,
        })
        .option('dest', {
          alias: 'd',
          description: 'Directory where to copy artefacts to',
          default: 'dist',
        })
        .option('files', {
          alias: 'f',
          description: 'Additional files to copy into the distribution',
          type: 'array',
        });
  }

  /**
   * Called to create the options for this sub-command
   *
   * @returns the exit status of the command
   */
  public async run(args: Arguments): Promise<number> {
    const opts = args as Arguments<BuildDistOptions>;
    const dstDir = opts.dest;
    const rootDir = opts.root;
    await mkdirp(dstDir);

    // Copy the specified files and those that are always copied into the
    // destination directory.
    const additionalFiles: string[] = opts.files ?? [];
    const filesToCopy: string[] = ALWAYS_COPY.concat(additionalFiles);
    for (const src of new Set(filesToCopy)) {
      if (await pathExists(src)) {
        const dst = path.normalize(path.join(dstDir, src));
        await copy(src, dst, {
          overwrite: true,
          preserveTimestamps: true,
        });
      }
    }

    // Copy auxiliary files into the distribution (if any)
    const etcSrcRoot = path.resolve(rootDir === null ? 'etc' : path.join(rootDir, 'etc'));
    const etcDstRoot = path.join(dstDir, 'etc');
    if (await dirExists(etcSrcRoot)) {
      await copy(etcSrcRoot, etcDstRoot, {
        overwrite: true,
        preserveTimestamps: true,
      });
    }

    // We also need package.json but with the /dist paths removed
    await filterFile('package.json', path.join(dstDir, 'package.json'), (contents: string): string => {
      return contents.replace(/dist\//gm, '');
    });

    return 0;
  }
}

export const command = new SubCommandBuildDist();

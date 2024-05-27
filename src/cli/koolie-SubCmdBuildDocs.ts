import { basename, dirname, join, parse, sep } from 'node:path';

import GlobToRegExp from 'glob-to-regexp';
import { Arguments, Argv } from 'yargs';

import { dirExists, executeCommand, fileExists, findFiles } from './Utils.js';
import { SubCommand } from './SubCommand.js';

/** Koolie sub-command to build documentation from source */
export class SubCommandBuildDocs extends SubCommand {
  /**
   * Get the name of this sub-command
   *
   * @returns the name of this sub-command
   */
  public name(): string {
    return 'build-docs';
  }

  /**
   * Get the format of the sub-command. This is required for sub-command that
   * have positional parameters so their positions can be defined.
   *
   * @returns the sub-command structure
   */
  public description(): string {
    return 'Build the documentation from source';
  }

  /**
   * Get the description of this sub-command
   *
   * @returns the description of this sub-command
   */
  public create(): (yargs: Argv) => Argv {
    return (yargs: Argv) =>
      yargs
        .option('entryPoint', {
          alias: 'e',
          description: 'The entry point(s) to be document',
          array: true,
          type: 'string',
        })
        .option('strategy', {
          description: 'Strategy to use when resolving dependencies',
          choices: ['resolve', 'expand', 'packages'],
          default: 'expand',
        })
        .option('src', {
          alias: 's',
          description: 'Source code directory',
          type: 'string',
        })
        .option('html', {
          description: 'Generate HTML documentation',
          type: 'boolean',
          default: true,
        })
        .option('markdown', {
          description: 'Generate Markdown documentation',
          type: 'boolean',
          default: true,
        })
        .option('preferIndex', {
          description: 'If true, an index.ts file will be used in preference to source files in the same directory',
          type: 'boolean',
          default: true,
        });
  }

  /**
   * Called to create the options for this sub-command
   *
   * @returns a function that can add the sub-command options
   */
  public async run(args: Arguments): Promise<number> {
    let entryPoints: string[] = (args.entryPoint as any) || [];
    if (entryPoints.length < 1) {
      try {
        entryPoints = await this.getDefaultEntryPoints(args);
      } catch (err: any) {
        console.error(err.message);
        return 1;
      }
    }

    const entryPointArgs: string[] = [];
    entryPoints.forEach((index) => entryPointArgs.push('--entryPoints', index));

    if (args.html) {
      const rc = await this.generateHtmlDocs(entryPointArgs, args);
      if (rc !== 0) {
        return rc;
      }
    }

    if (args.markdown) {
      const rc = await this.generateMarkdownDocs(entryPointArgs, args);
      if (rc !== 0) {
        return rc;
      }
    }

    return 0;
  }

  /**
   * Generate HTML documentation
   *
   * @param entryPoints - the source entry points
   * @param args - the command line arguments
   * @returns the exit status of the command
   */
  private async generateHtmlDocs(entryPoints: string[], _args: Arguments): Promise<number> {
    // Ignore if the configuration file does not exist
    const configFile = join('docs', 'html-config.cjs');
    if (!(await fileExists(configFile))) {
      // eslint-disable-next-line no-console
      console.log('Skipping HTML generation due to missing config file');
      return 0;
    }

    // eslint-disable-next-line no-console
    console.log('Generating HTML documentation');
    return executeCommand('typedoc', ['--options', configFile, ...entryPoints], { stdio: 'inherit' });
  }

  /**
   * Generate Markdown documentation
   *
   * @param entryPoints - the source entry points
   * @param args - the command line arguments
   * @returns the exit status of the command
   */
  private async generateMarkdownDocs(entryPoints: string[], _args: Arguments): Promise<number> {
    // Ignore if the configuration file does not exist
    const configFile = join('docs', 'markdown-config.cjs');
    if (!(await fileExists(configFile))) {
      // eslint-disable-next-line no-console
      console.log('Skipping Markdown generation due to missing config file');
      return 0;
    }

    // eslint-disable-next-line no-console
    console.log('Generating Markdown documentation');
    return executeCommand('typedoc', ['--options', configFile, ...entryPoints], { stdio: 'inherit' });
  }

  /**
   * Figure out a default entrypoint to use
   *
   * @param args - the command line arguments
   * @returns the default entry point(s)
   */
  private async getDefaultEntryPoints(args: Arguments): Promise<string[]> {
    let srcRoot: string | undefined = args.src as any;
    if (srcRoot === undefined) {
      if (await dirExists('src')) {
        srcRoot = 'src';
      } else {
        throw new Error(`Cannot workout the source root, specify with --src`);
      }
    }

    // Ignore test files
    let srcFiles = await this.getSourceFiles(srcRoot, ['**/*.ts'], ['**/*.spec.ts']);

    // When the index file is preferred, a directory that contains both an
    // index.ts file and source files will only use the index.ts file as an
    // entry point.
    const preferIndex = args.preferIndex;
    if (preferIndex) {
      // Workout what source directories include an index.ts file
      const dirHasIndex: Map<string, true> = new Map();
      srcFiles.forEach((srcFile) => {
        const srcName = basename(srcFile);
        if (srcName === 'index.ts') {
          dirHasIndex.set(dirname(srcFile), true);
        }
      });

      srcFiles = srcFiles.filter((srcFile) => {
        const srcName = basename(srcFile);
        const srcDir = dirname(srcFile);
        return srcName === 'index.ts' || !dirHasIndex.get(srcDir);
      });
    }

    return srcFiles;
  }

  /**
   * Find source files under the root directory sorted in the order that they
   * should be passed to `typedoc` to get the desired result.
   *
   * @param srcRoot - the source root directory
   * @param inclusions - list of files or globs to include relative to the root
   * @param exclusions - list of files or globs to exclude relative to the root
   * @returns the ordered relative paths to the matching source files
   */
  private async getSourceFiles(srcRoot: string, inclusions: string[], exclusions: string[]): Promise<string[]> {
    // This regex can strip off the leading directories from absolute paths
    const cwdRegExp = new RegExp(`^${process.cwd()}${sep}`);

    const inclusionsRegExp = inclusions.map((glob) => GlobToRegExp(glob));
    const exclusionsRegExp = exclusions.map((glob) => GlobToRegExp(glob));

    const fileList = await findFiles(srcRoot, (item) => {
      if (!item.stats.isFile()) {
        return false;
      }

      // See if the file is candidate for inclusion using the relative path
      const relPath = item.path.replace(cwdRegExp, '');
      if (inclusionsRegExp.find((regex) => regex.test(relPath))) {
        if (!exclusionsRegExp.find((regex) => regex.test(relPath))) {
          return true;
        }
      }

      return false;
    });

    const matches = fileList.map((filename) => {
      const components = parse(filename);
      const depth = components.dir.split(sep).length;
      const isIndex = components.base === 'index.ts';
      return { ...components, filename, depth, isIndex };
    });

    // Sort the matches such that indexes are always processed last and deeper
    // files are always processed before shallower ones.
    return matches
      .sort((a, b) => {
        return !a.isIndex && b.isIndex ? -1 : a.isIndex && !b.isIndex ? 1 : b.depth - a.depth;
      })
      .map((match) => match.filename.replace(cwdRegExp, ''));
  }
}

export default new SubCommandBuildDocs();

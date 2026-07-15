import * as path from 'node:path';
import { readFile } from 'node:fs/promises';

import type { Arguments, Argv } from 'yargs';

import { PackageManager } from './PackageManager.js';
import { SubCommand } from './SubCommand.js';
import { errorMessage, showError, findFiles, readJsonFile, writeJsonStringToFile } from './Utils.js';
import type { KoolieConfig } from './Utils.js';

/** Parsed command-line options for the `remove-package` sub-command */
interface RemovePackageOptions {
  packages?: string[];
}

export class SubCommandRemovePackage extends SubCommand {
  /**
   * Get the name of this sub-command
   *
   * @returns the name of this sub-command
   */
  public name(): string {
    return 'remove-package';
  }

  /**
   * Get the description of this sub-command
   *
   * @returns the description of this sub-command
   */
  public description(): string {
    return 'Remove a Koolie package and unwire its default config from the application';
  }

  /**
   * Called to create the options for this sub-command
   *
   * @returns a function that can add the sub-command options
   */
  public command(): string | undefined {
    return `${this.name()} [packages..]`;
  }

  /**
   * Called to create the options for the command
   *
   * @returns a function that can add the command options
   */
  public create(): (yargs: Argv) => Argv {
    return (yargs: Argv) =>
      yargs
        .usage(
          [
            'Usage: $0 remove-package <packages..>',
            '',
            'Remove one or more Koolie package dependencies and strip their `$extends`',
            "entries from this application's configuration files.",
          ].join('\n')
        )
        .positional('packages', {
          description: 'Names of Koolie packages to remove (e.g. "types" for @koolie/types)',
          choices: ['types'],
        })
        .example('$0 remove-package types', 'Remove @koolie/types and unwire its default config')
        .epilogue(
          [
            'This command edits config files under application/src/config/ that follow',
            'the koolie template (an opening object with `$extends` as the first key).',
            'For configs that diverge from this layout, edit `$extends` manually.',
          ].join('\n')
        );
  }

  /**
   * Called to create the options for this sub-command
   *
   * @returns the exit status of the command
   */
  public async run(args: Arguments): Promise<number> {
    try {
      const opts = args as Arguments<RemovePackageOptions>;
      const toBeRemoved = opts.packages ?? [];
      if (toBeRemoved.length < 1) {
        throw new Error('Specify at least one package to be removed');
      }

      const manifest = await readJsonFile<Record<string, unknown>>('package.json');
      const dependencies = (manifest.dependencies ?? {}) as Record<string, string>;
      for (const name of toBeRemoved) {
        await this.removeDependency(dependencies, name);
      }

      return 0;
    } catch (err) {
      showError(errorMessage(err));
      return 1;
    }
  }

  /**
   * Remove a dependency on the given package
   *
   * @param dependencies - the package dependencies
   * @param name - the dependency to remove
   */
  private async removeDependency(dependencies: Record<string, string>, name: string): Promise<void> {
    const pkgName = `@koolie/${name}`;
    const pkgVersion = dependencies[pkgName];
    if (pkgVersion === undefined) {
      console.error(`Warning: ${pkgName} is not a dependency ... skipping`);
    } else {
      // Defer to whichever package manager the consumer is using
      const pm = await PackageManager.detect();
      const rc = await pm.remove(pkgName);
      if (rc !== 0) {
        throw new Error(`Failed to remove the dependency ${pkgName}`);
      }
    }

    // Find all configuration files of this application
    const configRoot = path.join('application', 'src', 'config');
    const configFiles = await findFiles(configRoot, (item) => {
      if (item.stats.isFile()) {
        const parentDir = path.basename(path.dirname(item.path));
        if (parentDir === 'config' && path.extname(item.path).toLowerCase() === '.json') {
          return true;
        }
      }
      return false;
    });

    // Remove any extension references in these config files to config files
    // that were provided by the package that was removed.
    const oldConfigRoot = path.join('node_modules', '@koolie', name, 'config');
    for (const configFile of configFiles) {
      await this.removeConfigImports(configFile, oldConfigRoot);
    }
  }

  /**
   * Remove extensions based on config files located in the given config root
   *
   * @param configFile - the config file to update
   * @param oldConfigRoot - the old config file root directory
   */
  private async removeConfigImports(configFile: string, oldConfigRoot: string): Promise<void> {
    // Read the contents of the config file to see if we need to remove any
    // extensions. It needs to be parsed with JSON5 because it can contain
    // comments.
    const parsedConfig = await readJsonFile<KoolieConfig>(configFile);

    // If there's no extension block then we can leave now
    const extensions: string[] = parsedConfig.$extends ?? [];
    if (extensions.length < 1) {
      return;
    }

    // Remove any extensions that are located under this config root
    const updatedExtensions = extensions.filter((filename) => {
      const parent = path.dirname(filename);
      return parent !== oldConfigRoot;
    });

    // We can leave if nothing was removed
    if (extensions.length === updatedExtensions.length) {
      return;
    }

    // OK, we need to update the extensions for this config file. This is really
    // tricky because the config file we need to modify could have comments in
    // it and we don't want to lose those comments.
    //
    // So we can't just parse the JSON5 file, update the extension and then
    // write out the result because the comments would be lost. Instead we need
    // to do some regex magic. To do this, we need the raw unparsed contents.
    //
    // We don't need to worry too much about formatting because we will use
    // prettier to get the indentation etc correct.
    let unparsedConfig: string;
    try {
      unparsedConfig = await readFile(configFile, 'utf8');
    } catch (err) {
      showError(`Failed to read ${configFile}: ${errorMessage(err)}`);
      throw err;
    }

    // If there is an $extends block then remove it so we can add a new one. We
    // already know what the current extensions are since we parsed the JSON
    // above. If there's comments in the $extends block then too bad, they are
    // getting removed.
    let newContent = unparsedConfig;
    if (parsedConfig.$extends !== undefined) {
      // Define a regex snippet for multiline whitespace and then the full regex
      // to match the extends block
      const ws = '(?:\\s|\n|\r)*';
      const anyChar = '(?:.|\n|\r)';
      const extendsBlock = new RegExp(`"\\$extends"${ws}:${ws}\\[${anyChar}*?\\]${ws},?`, 'gm');

      // Match it and remove it from the content
      newContent = newContent.replace(extendsBlock, '');
    }

    // At this stage, the content should not have an extends block. If there are
    // still extensions, create the stringified version of the new extends
    // block.
    if (updatedExtensions.length > 0) {
      const newExtendsBlock = `"$extends": ${JSON.stringify(updatedExtensions)}`;

      // Add this new block right at the start of the content, just after the
      // opening brace and write out the new contents.
      newContent = newContent.replace(/^{/, `{${newExtendsBlock},`);
    }

    // And write the updated content to the file
    await writeJsonStringToFile(configFile, newContent);
  }
}

export const command = new SubCommandRemovePackage();

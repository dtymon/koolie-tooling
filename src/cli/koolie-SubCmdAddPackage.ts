import * as path from 'node:path';
import { readFile } from 'node:fs/promises';

import type { Arguments, Argv } from 'yargs';

import { SubCommand } from './SubCommand.js';
import {
  errorMessage,
  showError,
  executeCommand,
  fileExists,
  findFiles,
  readJsonFile,
  writeJsonFile,
  writeJsonStringToFile,
} from './Utils.js';
import type { KoolieConfig } from './Utils.js';

/** Parsed command-line options for the `add-package` sub-command */
interface AddPackageOptions {
  packages?: string[];
  ver?: string;
  tilde: boolean;
  caret: boolean;
  force: boolean;
}

export class SubCommandAddPackage extends SubCommand {
  /**
   * Get the name of this sub-command
   *
   * @returns the name of this sub-command
   */
  public name(): string {
    return 'add-package';
  }

  /**
   * Get the description of this sub-command
   *
   * @returns the description of this sub-command
   */
  public description(): string {
    return 'Add a dependency on a Koolie package';
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
        .positional('packages', {
          description: 'The packages to be added as dependencies',
          choices: ['types'],
        })
        .option('ver', {
          alias: 'v',
          description: 'Specify the version of the package to depend on',
        })
        .option('tilde', {
          alias: 't',
          description: 'Limit the dependency to use a version with the same minor number',
          type: 'boolean',
          default: true,
        })
        .option('caret', {
          alias: 'c',
          description: 'Limit the dependency to use a version with the same major number',
          type: 'boolean',
          default: false,
        })
        .option('force', {
          alias: 'f',
          description: 'Normally no action will be taken if the dependency already exists',
          type: 'boolean',
          default: false,
        });
  }

  /**
   * Called to create the options for this sub-command
   *
   * @returns the exit status of the command
   */
  public async run(args: Arguments): Promise<number> {
    try {
      const opts = args as Arguments<AddPackageOptions>;
      const toBeAdded = opts.packages ?? [];
      if (toBeAdded.length < 1) {
        throw new Error('Specify at least one package to be added');
      }

      const manifest = await readJsonFile<Record<string, unknown>>('package.json');

      // There must be an existing dependency on the Koolie tooling package to
      // be able to run this command. Get the version of that from the
      // manifest.
      let buildVersion: string | undefined;
      const devDeps = manifest.devDependencies;
      if (devDeps && typeof devDeps === 'object' && !Array.isArray(devDeps)) {
        buildVersion = (devDeps as Record<string, string>)['@koolie/tooling'];
      }
      if (buildVersion === undefined) {
        throw new Error('This package must include "@koolie/tooling" in its "devDependencies"');
      }

      const match = /^[^0-9]*(\d+\.\d+\.\d+)/.exec(buildVersion);
      if (match?.[1] !== undefined) {
        buildVersion = match[1];
      }

      // Show a warning if an explicit version was specified by the user that
      // does not match the version of the tooling.
      const versionToUse = opts.ver ?? buildVersion;
      if (versionToUse !== buildVersion) {
        console.error('Warning: Mixing different versions for Koolie packages is discouraged');
        console.error(`  Koolie tooling version: ${buildVersion}`);
        console.error(`       Requested version: ${versionToUse}`);
      }

      const dependencies = (manifest.dependencies ?? {}) as Record<string, string>;
      const fullVersion = opts.caret ? `^${versionToUse}` : `~${versionToUse}`;
      for (const name of toBeAdded) {
        await this.addDependency(opts, dependencies, name, fullVersion);
      }

      return 0;
    } catch (err) {
      showError(errorMessage(err));
      return 1;
    }
  }

  /**
   * Add a dependency on the given package at the given version
   *
   * @param opts - the parsed command-line options
   * @param dependencies - the package dependencies
   * @param name - the dependency to add
   * @param version - the version to add
   */
  private async addDependency(
    opts: Arguments<AddPackageOptions>,
    dependencies: Record<string, unknown>,
    name: string,
    version: string
  ): Promise<void> {
    const pkgName = `@koolie/${name}`;
    const pkgVersion = dependencies[pkgName];
    if (!opts.force && pkgVersion === version) {
      console.error(`Warning: ${pkgName}@${version} is already a dependency ... skipping`);
    } else {
      // Use `yarn` to add the dependency
      const rc = await executeCommand('yarn', ['add', `${pkgName}@${version}`], { stdio: 'inherit' });
      if (rc !== 0) {
        throw new Error(`Failed to add the dependency ${pkgName}@${version}`);
      }
    }

    // Now find all configuration files that the package has and make sure they
    // are imported by this application.
    const configRoot = path.join('node_modules', '@koolie', name, 'config');
    const configFiles = await findFiles(configRoot, (item) => {
      if (item.stats.isFile()) {
        const parentDir = path.basename(path.dirname(item.path));
        if (parentDir === 'config' && path.extname(item.path).toLowerCase() === '.json') {
          return true;
        }
      }
      return false;
    });

    const regex = new RegExp(`(${configRoot}.*\\.json)$`);
    for (const configFile of configFiles) {
      const match = regex.exec(configFile);
      if (match) {
        const relativePath = match[1]!;
        await this.addConfigImport(relativePath);
      }
    }
  }

  /**
   * Import the given config file into the current application's configuration
   *
   * @param configToExtendFrom - the config file to be imported
   */
  private async addConfigImport(configToExtendFrom: string): Promise<void> {
    const filename = path.basename(configToExtendFrom);

    // Does a config file exist with this name in the destination config dir?
    const destDir = path.join('application', 'src', 'config');
    const destFile = path.join(destDir, filename);
    const destExists = await fileExists(destFile);
    if (!destExists) {
      // We just need to create this config file and extend it from the one
      // provided by the package we now depend on.
      try {
        await writeJsonFile<KoolieConfig>(destFile, { $extends: [configToExtendFrom] });
      } catch (err) {
        showError(`Failed to create config file "${destFile}": ${errorMessage(err)}`);
        throw err;
      }

      return;
    }

    // The config file already exists. Read its contents to see if we need to
    // add this extension. It needs to be parsed with JSON5 because it can
    // contain comments.
    const parsedConfig = await readJsonFile<KoolieConfig>(destFile);
    const extensions: string[] = parsedConfig.$extends ?? [];
    if (extensions.includes(configToExtendFrom)) {
      return;
    }

    // OK, we need to add an entry to extend this config file. This is really
    // tricky because the config file we need to modify could have comments in
    // it and we don't want to lose those comments.
    //
    // So we can't just parse the JSON5 file, add the extension and then write
    // out the result because the comments would be lost. Instead we need to do
    // some regex magic. To do this, we need the raw unparsed contents.
    //
    // We don't need to worry too much about formatting because we will use
    // prettier to get the indentation etc correct.
    let unparsedConfig: string;
    try {
      unparsedConfig = await readFile(destFile, 'utf8');
    } catch (err) {
      showError(`Failed to read ${destFile}: ${errorMessage(err)}`);
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

    // At this stage, the content should not have an extends block. Add the
    // required base to the current list and stringify it to form the string
    // content for the new extends block.
    extensions.push(configToExtendFrom);
    const newExtendsBlock = `"$extends": ${JSON.stringify(extensions)}`;

    // Add this new block right at the start of the content, just after the
    // opening brace and write out the new contents.
    newContent = newContent.replace(/^{/, `{${newExtendsBlock},`);
    await writeJsonStringToFile(destFile, newContent);
  }
}

export const command = new SubCommandAddPackage();

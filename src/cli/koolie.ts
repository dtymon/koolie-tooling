#!/usr/bin/env node

import * as path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import yargs, { Arguments, Argv } from 'yargs';
import { hideBin } from 'yargs/helpers';

import { SubCommand } from './SubCommand.js';
import { fileExists } from './Utils.js';

// A sub-command runner is passed the command line arguments and is expected to
// return the exit code for the command.
type SubCommandRunner = (args: Arguments) => Promise<number>;

/** The Koolie command-line tool main entry point */
async function main(): Promise<void> {
  // Get the directory that contains this script
  let koolieBinDir = path.dirname(process.argv[1]);

  // All supported sub-commands are loaded at runtime so that more specialised
  // Koolie packages can add their own sub-commands to the CLI. The sub-commands
  // should be located in the same directory as this main file, that is, located
  // in node_modules/.bin. We need to workout where this directory is relative
  // to where we are now.
  //
  // When trying to support Windows, this all becomes much harder. Unlike
  // non-Windows hosts that use symlinks from node_modules/.bin to the actual
  // source file, for Windows they are wrapped in a cmd file. We need to workout
  // if we are running via a cmd file.
  const relativeBinDir = path.join(process.cwd(), 'node_modules', '.bin');
  const relativeMain = path.join(relativeBinDir, 'koolie');
  const relativeMainCmd = path.join(relativeBinDir, 'koolie.cmd');
  if ((await fileExists(relativeMain)) || (await fileExists(relativeMainCmd))) {
    koolieBinDir = relativeBinDir;
  }

  // Look for sub-command files located in the bin directory. They need to have
  // a fixed prefix.
  let subCommandFiles: string[] = [];
  try {
    subCommandFiles = (await readdir(koolieBinDir))
      .filter((name) => /^koolie-SubCmd[^.]*\.js$/.test(name))
      .map((name) => path.join(koolieBinDir, name));
  } catch (err) {
    console.error(`Error: Failed to file Koolie sub-command files in ${koolieBinDir}: ${err}`);
    process.exit(1);
  }

  // Each of these files will define one or more sub-commands when we import
  // them.
  const subCommands: SubCommand[] = [];
  for (let idx = 0; idx < subCommandFiles.length; ++idx) {
    await importSubCommand(subCommandFiles[idx], subCommands);
  }

  // Now with the commands loaded, we can flesh out yargs
  // prettier-ignore
  let argv: Argv = yargs(hideBin(process.argv))
    .showHelpOnFail(true)
    .demandCommand()
    .recommendCommands();

  // Keep a map of runners to the sub-command they can run
  const subCommandRunners: Map<string, SubCommandRunner> = new Map();
  argv = subCommands.reduce((argv: Argv, sc: SubCommand) => {
    subCommandRunners.set(sc.name(), (args: Arguments) => sc.run(args));
    return argv.command(sc.command() ?? sc.name(), sc.description(), sc.create());
  }, argv);

  // We should now be able to workout what sub-command to run
  try {
    const args = await argv.argv;
    const subCommand = args._.shift() as string;
    const runner = subCommandRunners.get(subCommand);
    if (runner === undefined) {
      console.error(`${subCommand}: Unsupported sub-command`);
      process.exit(1);
    } else {
      const code: number = await runner(args);
      process.exit(code);
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

/**
 * Import a sub-command source file
 *
 * @param filename - the file containing the sub-command source
 * @param subCommands - the accumulated sub-commands
 */
async function importSubCommand(filename: string, subCommands: SubCommand[]): Promise<void> {
  try {
    // This is all a bit yuck. When running on Windows, we have files with a
    // '.js' extension that are not actually JS files. Instead, they are a
    // wrapper that executs the JS source. We have to treat them different since
    // they cannot be imported.
    const windowsWrapper = `${filename}.js.cmd`;
    if (await fileExists(windowsWrapper)) {
      return importWindowsSubCommand(windowsWrapper, subCommands);
    } else {
      return importSubCommandSourceFile(filename, subCommands);
    }
  } catch (err) {
    console.error(`Failed to import sub-command source: ${filename}: ${err}`);
    process.exit(1);
  }
}

/**
 * Import a sub-command source file via Windows wrapper.
 *
 * @param wrapper - the Windows sub-command wrapper
 * @param subCommands - the accumulated sub-commands
 */
async function importWindowsSubCommand(wrapper: string, subCommands: SubCommand[]): Promise<void> {
  try {
    // The wrapper contains the location of the JS source that it executes. We
    // can extract that out of the wrapper and import that instead.
    const contents = await readFile(wrapper, 'utf8');

    // The contents is expected to look something like this:
    //   @"%~dp0\..\<path-to-module>\koolie-SubCmdFoo.js"   %*
    //
    // where <path-to-module> is relative to the node_modules directory
    const match = /\.\.\\(.*\.js)/g.exec(contents);
    if (match) {
      const jsSourceFile = path.join(process.cwd(), 'node_modules', match[1]);
      return importSubCommandSourceFile(jsSourceFile, subCommands);
    }
  } catch (err) {
    console.error(`Failed to import sub-command source via Windows wrapper: ${wrapper}: ${err}`);
    process.exit(1);
  }
}

/**
 * Import the JS source file that defines one or more sub-commands.
 *
 * @param filename - the JS soure file to import
 * @param subCommands - the accumulated sub-commands
 */
async function importSubCommandSourceFile(filename: string, subCommands: SubCommand[]): Promise<void> {
  try {
    // The JS source file is expected to have a default export which contains a
    // SubCommand instance or an array of instances.
    const subCommandExports: any = await import(filename);
    const defaultExport: SubCommand | SubCommand[] = subCommandExports.default;
    if (defaultExport !== undefined) {
      if (Array.isArray(defaultExport)) {
        subCommands.push(...defaultExport.filter((sc) => sc instanceof SubCommand));
      } else if (defaultExport instanceof SubCommand) {
        subCommands.push(defaultExport);
      }
    }
  } catch (err) {
    console.error(`Failed to import sub-command source: ${filename}: ${err}`);
    process.exit(1);
  }
}

try {
  await main();
  process.exit(0);
} catch (err: any) {
  console.error('Caught unexpected exception', err);
  process.exit(1);
}

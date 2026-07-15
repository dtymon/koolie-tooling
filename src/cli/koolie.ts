#!/usr/bin/env node

import yargs from 'yargs';
import type { Arguments, Argv } from 'yargs';
import { hideBin } from 'yargs/helpers';

import { discoverSubCommands } from './discovery.js';
import { SubCommand } from './SubCommand.js';

// A sub-command runner is passed the command line arguments and is expected to
// return the exit code for the command.
type SubCommandRunner = (args: Arguments) => Promise<number>;

/** The Koolie command-line tool main entry point */
async function main(): Promise<void> {
  const subCommands: SubCommand[] = await discoverSubCommands();

  // Now with the commands loaded, we can flesh out yargs
  // prettier-ignore
  let argv: Argv = yargs(hideBin(process.argv))
    .showHelpOnFail(true)
    .demandCommand()
    .recommendCommands();

  // Keep a map of runners to the sub-command they can run
  const subCommandRunners = new Map<string, SubCommandRunner>();
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

try {
  await main();
  process.exit(0);
} catch (err) {
  console.error('Caught unexpected exception', err);
  process.exit(1);
}

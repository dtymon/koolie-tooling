import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { discoverSubCommands } from './discovery.js';
import { SubCommand } from './SubCommand.js';

/**
 * Source for a self-contained sub-command module written into the fixture
 * tree. The fixture imports `SubCommand` from the same `.ts` source the spec
 * resolves to so the dynamic `import()` performed by `discoverSubCommands`
 * shares one module instance and the `instanceof SubCommand` check holds.
 */
const SUB_COMMAND_SOURCE = path.resolve(import.meta.dirname, 'SubCommand.ts');

function stubSubCommandModule(name: string, description: string): string {
  return `import { SubCommand } from '${SUB_COMMAND_SOURCE}';
class StubSubCommand extends SubCommand {
  name() { return '${name}'; }
  description() { return '${description}'; }
  create() { return (yargs) => yargs; }
  run(_args) { return Promise.resolve(0); }
}
export const command = new StubSubCommand();
`;
}

describe('discoverSubCommands', function () {
  let workDir: string;

  beforeEach(async function () {
    workDir = await mkdtemp(path.join(tmpdir(), 'koolie-discovery-test-'));
  });

  afterEach(async function () {
    await rm(workDir, { recursive: true, force: true });
  });

  it('returns no sub-commands when the cwd has no manifest', async function () {
    const found = await discoverSubCommands(workDir);
    expect(found).toEqual([]);
  });

  it('returns no sub-commands when the manifest does not declare koolie.subcommands', async function () {
    await writeFile(path.join(workDir, 'package.json'), JSON.stringify({ name: 'consumer' }));
    const found = await discoverSubCommands(workDir);
    expect(found).toEqual([]);
  });

  it('loads sub-commands declared by the cwd manifest itself', async function () {
    await writeFile(
      path.join(workDir, 'subcommands.mjs'),
      stubSubCommandModule('self', 'sub-command from the cwd manifest')
    );
    await writeFile(
      path.join(workDir, 'package.json'),
      JSON.stringify({
        name: 'consumer',
        koolie: { subcommands: './subcommands.mjs' },
      })
    );

    const found = await discoverSubCommands(workDir);
    expect(found.length).toBe(1);
    expect(found[0]).toBeInstanceOf(SubCommand);
    expect(found[0]?.name()).toBe('self');
  });

  it('walks @koolie/* deps and collects their sub-commands', async function () {
    // Lay out node_modules/@koolie/<dep> with its own manifest + subcommands
    // module. Anchor resolution at the cwd via a `package.json` so
    // `createRequire(<cwd>/package.json)` finds it.
    const depRoot = path.join(workDir, 'node_modules', '@koolie', 'depA');
    await mkdir(depRoot, { recursive: true });
    await writeFile(path.join(depRoot, 'subcommands.mjs'), stubSubCommandModule('from-depA', 'from depA'));
    await writeFile(
      path.join(depRoot, 'package.json'),
      JSON.stringify({
        name: '@koolie/depA',
        koolie: { subcommands: './subcommands.mjs' },
      })
    );

    await writeFile(
      path.join(workDir, 'package.json'),
      JSON.stringify({
        name: 'consumer',
        dependencies: { '@koolie/depA': '1.0.0' },
      })
    );

    const found = await discoverSubCommands(workDir);
    expect(found.length).toBe(1);
    expect(found[0]?.name()).toBe('from-depA');
  });

  it('ignores non-@koolie dependencies', async function () {
    await writeFile(
      path.join(workDir, 'package.json'),
      JSON.stringify({
        name: 'consumer',
        dependencies: { lodash: '4.0.0' },
      })
    );

    const found = await discoverSubCommands(workDir);
    expect(found).toEqual([]);
  });

  it('skips @koolie deps that are declared but not installed', async function () {
    await writeFile(
      path.join(workDir, 'package.json'),
      JSON.stringify({
        name: 'consumer',
        dependencies: { '@koolie/missing': '1.0.0' },
      })
    );

    const found = await discoverSubCommands(workDir);
    expect(found).toEqual([]);
  });

  it('rejects when the contributed `command` export is not a SubCommand', async function () {
    await writeFile(path.join(workDir, 'subcommands.mjs'), `export const command = { name: 'wrong-shape' };\n`);
    await writeFile(
      path.join(workDir, 'package.json'),
      JSON.stringify({ name: 'consumer', koolie: { subcommands: './subcommands.mjs' } })
    );
    await expect(discoverSubCommands(workDir)).rejects.toThrow(/expected to be an instance of SubCommand/);
  });

  it('rejects when the contributed `commands` export is not an array', async function () {
    await writeFile(path.join(workDir, 'subcommands.mjs'), `export const commands = { not: 'an-array' };\n`);
    await writeFile(
      path.join(workDir, 'package.json'),
      JSON.stringify({ name: 'consumer', koolie: { subcommands: './subcommands.mjs' } })
    );
    await expect(discoverSubCommands(workDir)).rejects.toThrow(/expected to be an array of SubCommand/);
  });

  it('rejects when an entry of `commands` is not a SubCommand', async function () {
    await writeFile(path.join(workDir, 'subcommands.mjs'), `export const commands = [{ name: 'wrong-shape' }];\n`);
    await writeFile(
      path.join(workDir, 'package.json'),
      JSON.stringify({ name: 'consumer', koolie: { subcommands: './subcommands.mjs' } })
    );
    await expect(discoverSubCommands(workDir)).rejects.toThrow(
      /All exported sub-commands are expected to be an instance of SubCommand/
    );
  });

  it('walks transitive @koolie/* deps once each', async function () {
    // depA declares a dep on depB. The cwd only depends on depA. depB's
    // sub-command must still be discovered (transitive walk), and a cycle
    // back to depA must not double-load it.
    const depARoot = path.join(workDir, 'node_modules', '@koolie', 'depA');
    const depBRoot = path.join(workDir, 'node_modules', '@koolie', 'depB');
    await mkdir(depARoot, { recursive: true });
    await mkdir(depBRoot, { recursive: true });

    await writeFile(path.join(depARoot, 'subcommands.mjs'), stubSubCommandModule('from-depA', 'from depA'));
    await writeFile(
      path.join(depARoot, 'package.json'),
      JSON.stringify({
        name: '@koolie/depA',
        dependencies: { '@koolie/depB': '1.0.0' },
        koolie: { subcommands: './subcommands.mjs' },
      })
    );

    await writeFile(path.join(depBRoot, 'subcommands.mjs'), stubSubCommandModule('from-depB', 'from depB'));
    await writeFile(
      path.join(depBRoot, 'package.json'),
      JSON.stringify({
        name: '@koolie/depB',
        dependencies: { '@koolie/depA': '1.0.0' },
        koolie: { subcommands: './subcommands.mjs' },
      })
    );

    await writeFile(
      path.join(workDir, 'package.json'),
      JSON.stringify({
        name: 'consumer',
        dependencies: { '@koolie/depA': '1.0.0' },
      })
    );

    const found = await discoverSubCommands(workDir);
    const names = found.map((sc) => sc.name()).sort();
    expect(names).toEqual(['from-depA', 'from-depB']);
  });
});

import type { Arguments, Argv } from 'yargs';

import { SubCommand } from './SubCommand.js';

/**
 * Minimal concrete subclass used to exercise `SubCommand`'s only non-abstract
 * method. The abstract methods are stubbed with the simplest implementations
 * that satisfy the contract.
 */
class StubSubCommand extends SubCommand {
  public name(): string {
    return 'stub';
  }

  public description(): string {
    return 'stub sub-command used for tests';
  }

  public create(): (yargs: Argv) => Argv {
    return (yargs: Argv) => yargs;
  }

  public run(_args: Arguments): Promise<number> {
    return Promise.resolve(0);
  }
}

describe('SubCommand', function () {
  it('exports an abstract class', function () {
    expect(SubCommand).toBeInstanceOf(Function);
  });

  describe('command()', function () {
    it('returns undefined by default so positional parameters are opt-in', function () {
      const stub = new StubSubCommand();
      expect(stub.command()).toBeUndefined();
    });
  });
});

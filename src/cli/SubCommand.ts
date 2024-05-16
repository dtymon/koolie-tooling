import { Arguments, Argv } from 'yargs';

/** Abstract base class for CLI sub-commands */
export abstract class SubCommand {
  /**
   * Get the name of this sub-command
   *
   * @returns the name of this sub-command
   */
  public abstract name(): string;

  /**
   * Get the format of the sub-command. This is required for sub-command that
   * have positional parameters so their positions can be defined.
   *
   * @returns the sub-command structure
   */
  public command(): string | undefined {
    return undefined;
  }

  /**
   * Get the description of this sub-command
   *
   * @returns the description of this sub-command
   */
  public abstract description(): string;

  /**
   * Called to create the options for this sub-command
   *
   * @returns a function that can add the sub-command options
   */
  public abstract create(): (yargs: Argv) => Argv;

  /**
   * Called to run the sub-command
   *
   * @param args - the sub-command arguments
   * @returns the exit status of the sub-command
   */
  public abstract run(args: Arguments): Promise<number>;
}

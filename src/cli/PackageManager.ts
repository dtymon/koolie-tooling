import * as path from 'node:path';

import { errorMessage, executeCommand, fileExists, readJsonFile } from './Utils.js';

/**
 * Identifier for the supported package managers. Treated as a closed set so
 * detection failures fail loud rather than picking a default.
 */
export enum PackageManagerKind {
  Yarn = 'yarn',
  Pnpm = 'pnpm',
  Npm = 'npm',
}

/** Shape of the parts of a `package.json` manifest this module reads. */
interface MinimalManifest {
  packageManager?: string;
}

/**
 * Abstraction over the three package managers the koolie CLI may invoke on a
 * consumer's behalf (`add` / `remove` operations). Detection is best-effort
 * but explicit: callers learn about an unknown PM via a thrown error rather
 * than a silent default.
 */
export abstract class PackageManager {
  /**
   * Detect the package manager active in the given working directory.
   *
   * Priority:
   *   1. `npm_config_user_agent` — the unambiguous signal when the koolie
   *      CLI is invoked via a script (`yarn koolie ...`, `pnpm koolie ...`,
   *      `npm run ...`). All three set this env var and prefix it with
   *      their name.
   *   2. The `packageManager` field of the cwd's `package.json` (Corepack
   *      convention). Authoritative when the consumer has declared their
   *      tool of choice.
   *   3. Lockfile presence in cwd: `yarn.lock` / `pnpm-lock.yaml` /
   *      `package-lock.json`.
   *   4. Throw — picking a default and shelling out would be worse than a
   *      clear error.
   *
   * @param cwd - working directory to inspect (defaults to `process.cwd()`)
   * @returns the detected package manager
   */
  public static async detect(cwd: string = process.cwd()): Promise<PackageManager> {
    const fromUserAgent = PackageManager.fromUserAgent(process.env.npm_config_user_agent);
    if (fromUserAgent !== undefined) {
      return PackageManager.forKind(fromUserAgent);
    }

    const fromManifest = await PackageManager.fromPackageManagerField(cwd);
    if (fromManifest !== undefined) {
      return PackageManager.forKind(fromManifest);
    }

    const fromLockfile = await PackageManager.fromLockfile(cwd);
    if (fromLockfile !== undefined) {
      return PackageManager.forKind(fromLockfile);
    }

    throw new Error(
      'Could not detect a package manager (no npm_config_user_agent, no packageManager ' +
        'field in package.json, no lockfile present). Run via your package manager (e.g. ' +
        '`yarn koolie ...`, `pnpm koolie ...`, `npm exec koolie ...`) or add a ' +
        '`packageManager` field to package.json.'
    );
  }

  /**
   * Construct the concrete package manager for a given kind.
   *
   * @param kind - the detected kind
   * @returns the matching `PackageManager` instance
   */
  public static forKind(kind: PackageManagerKind): PackageManager {
    switch (kind) {
      case PackageManagerKind.Yarn:
        return new YarnPackageManager();
      case PackageManagerKind.Pnpm:
        return new PnpmPackageManager();
      case PackageManagerKind.Npm:
        return new NpmPackageManager();
    }
  }

  /**
   * Parse `npm_config_user_agent` to a kind. The first whitespace-delimited
   * token has the form `<tool>/<version>`; we only care about the prefix.
   *
   * @param userAgent - raw env value
   * @returns the kind if recognised, else undefined
   */
  private static fromUserAgent(userAgent: string | undefined): PackageManagerKind | undefined {
    if (userAgent === undefined || userAgent.length < 1) {
      return undefined;
    }

    if (userAgent.startsWith('yarn/')) {
      return PackageManagerKind.Yarn;
    }
    if (userAgent.startsWith('pnpm/')) {
      return PackageManagerKind.Pnpm;
    }
    if (userAgent.startsWith('npm/')) {
      return PackageManagerKind.Npm;
    }
    return undefined;
  }

  /**
   * Read the `packageManager` field from the cwd's `package.json` and map it
   * to a kind. Field shape per Corepack: `<tool>@<version>`.
   *
   * @param cwd - working directory whose package.json to read
   * @returns the kind if declared and recognised, else undefined
   */
  private static async fromPackageManagerField(cwd: string): Promise<PackageManagerKind | undefined> {
    const manifestPath = path.join(cwd, 'package.json');
    if (!(await fileExists(manifestPath))) {
      return undefined;
    }

    let manifest: MinimalManifest;
    try {
      manifest = await readJsonFile<MinimalManifest>(manifestPath);
    } catch {
      return undefined;
    }

    const declared = manifest.packageManager;
    if (declared === undefined) {
      return undefined;
    }

    if (declared.startsWith('yarn@')) {
      return PackageManagerKind.Yarn;
    }
    if (declared.startsWith('pnpm@')) {
      return PackageManagerKind.Pnpm;
    }
    if (declared.startsWith('npm@')) {
      return PackageManagerKind.Npm;
    }
    return undefined;
  }

  /**
   * Look for a recognised lockfile in cwd. Order is incidental — at most one
   * is expected to exist in a sane project.
   *
   * @param cwd - working directory to inspect
   * @returns the kind matching the discovered lockfile, else undefined
   */
  private static async fromLockfile(cwd: string): Promise<PackageManagerKind | undefined> {
    if (await fileExists(path.join(cwd, 'yarn.lock'))) {
      return PackageManagerKind.Yarn;
    }
    if (await fileExists(path.join(cwd, 'pnpm-lock.yaml'))) {
      return PackageManagerKind.Pnpm;
    }
    if (await fileExists(path.join(cwd, 'package-lock.json'))) {
      return PackageManagerKind.Npm;
    }
    return undefined;
  }

  /**
   * Get the kind identifier for this package manager.
   *
   * @returns the kind
   */
  public abstract kind(): PackageManagerKind;

  /**
   * Get the name of the executable to invoke.
   *
   * @returns the executable name
   */
  public abstract executable(): string;

  /**
   * Get the argv for adding a dependency.
   *
   * @param packageSpec - dependency spec (e.g. `@koolie/types@~1.0.0`)
   * @returns argv following the executable
   */
  protected abstract addArgs(packageSpec: string): string[];

  /**
   * Get the argv for removing a dependency.
   *
   * @param packageName - dependency name
   * @returns argv following the executable
   */
  protected abstract removeArgs(packageName: string): string[];

  /**
   * Add a dependency by shelling out to the underlying package manager.
   *
   * @param packageSpec - dependency spec to add
   * @returns the child process exit code
   */
  public async add(packageSpec: string): Promise<number> {
    return this.invoke(this.addArgs(packageSpec));
  }

  /**
   * Remove a dependency by shelling out to the underlying package manager.
   *
   * @param packageName - dependency name to remove
   * @returns the child process exit code
   */
  public async remove(packageName: string): Promise<number> {
    return this.invoke(this.removeArgs(packageName));
  }

  /**
   * Run the package manager with the given arguments, inheriting stdio so
   * the user sees install progress.
   *
   * @param args - argv following the executable
   * @returns the child process exit code
   */
  private async invoke(args: string[]): Promise<number> {
    try {
      return await executeCommand(this.executable(), args, { stdio: 'inherit' });
    } catch (err) {
      throw new Error(`Failed to run ${this.executable()} ${args.join(' ')}: ${errorMessage(err)}`);
    }
  }
}

/** Yarn (Classic v1 and Berry both share this CLI surface for add/remove). */
export class YarnPackageManager extends PackageManager {
  public kind(): PackageManagerKind {
    return PackageManagerKind.Yarn;
  }

  public executable(): string {
    return 'yarn';
  }

  protected addArgs(packageSpec: string): string[] {
    return ['add', packageSpec];
  }

  protected removeArgs(packageName: string): string[] {
    return ['remove', packageName];
  }
}

/** pnpm. */
export class PnpmPackageManager extends PackageManager {
  public kind(): PackageManagerKind {
    return PackageManagerKind.Pnpm;
  }

  public executable(): string {
    return 'pnpm';
  }

  protected addArgs(packageSpec: string): string[] {
    return ['add', packageSpec];
  }

  protected removeArgs(packageName: string): string[] {
    return ['remove', packageName];
  }
}

/** npm. */
export class NpmPackageManager extends PackageManager {
  public kind(): PackageManagerKind {
    return PackageManagerKind.Npm;
  }

  public executable(): string {
    return 'npm';
  }

  protected addArgs(packageSpec: string): string[] {
    return ['install', packageSpec];
  }

  protected removeArgs(packageName: string): string[] {
    return ['uninstall', packageName];
  }
}

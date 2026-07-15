import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import {
  NpmPackageManager,
  PackageManager,
  PackageManagerKind,
  PnpmPackageManager,
  YarnPackageManager,
} from './PackageManager.js';

/**
 * `PackageManager.detect()` reads `process.env.npm_config_user_agent`. Tests
 * that exercise the lower-priority paths (manifest, lockfile, throw) need to
 * unset it for the duration of the assertion and restore it afterwards.
 */
async function withoutUserAgent<T>(fn: () => Promise<T>): Promise<T> {
  const previous = process.env.npm_config_user_agent;
  delete process.env.npm_config_user_agent;
  try {
    return await fn();
  } finally {
    if (previous !== undefined) {
      process.env.npm_config_user_agent = previous;
    }
  }
}

/**
 * Run `fn` with `npm_config_user_agent` pinned to the given value. Restores
 * the prior value on exit.
 */
async function withUserAgent<T>(value: string, fn: () => Promise<T>): Promise<T> {
  const previous = process.env.npm_config_user_agent;
  process.env.npm_config_user_agent = value;
  try {
    return await fn();
  } finally {
    if (previous === undefined) {
      delete process.env.npm_config_user_agent;
    } else {
      process.env.npm_config_user_agent = previous;
    }
  }
}

describe('PackageManager', function () {
  describe('forKind()', function () {
    it('returns a YarnPackageManager for the Yarn kind', function () {
      expect(PackageManager.forKind(PackageManagerKind.Yarn)).toBeInstanceOf(YarnPackageManager);
    });

    it('returns a PnpmPackageManager for the Pnpm kind', function () {
      expect(PackageManager.forKind(PackageManagerKind.Pnpm)).toBeInstanceOf(PnpmPackageManager);
    });

    it('returns an NpmPackageManager for the Npm kind', function () {
      expect(PackageManager.forKind(PackageManagerKind.Npm)).toBeInstanceOf(NpmPackageManager);
    });
  });

  describe('detect()', function () {
    let workDir: string;

    beforeEach(async function () {
      workDir = await mkdtemp(path.join(tmpdir(), 'koolie-pm-test-'));
    });

    afterEach(async function () {
      await rm(workDir, { recursive: true, force: true });
    });

    describe('via npm_config_user_agent', function () {
      it('detects yarn from a yarn user agent', async function () {
        await withUserAgent('yarn/1.22.22 npm/? node/v24.0.0 darwin x64', async () => {
          const pm = await PackageManager.detect(workDir);
          expect(pm).toBeInstanceOf(YarnPackageManager);
          expect(pm.kind()).toBe(PackageManagerKind.Yarn);
        });
      });

      it('detects pnpm from a pnpm user agent', async function () {
        await withUserAgent('pnpm/9.0.0 npm/? node/v24.0.0 darwin x64', async () => {
          const pm = await PackageManager.detect(workDir);
          expect(pm).toBeInstanceOf(PnpmPackageManager);
        });
      });

      it('detects npm from an npm user agent', async function () {
        await withUserAgent('npm/10.0.0 node/v24.0.0 darwin x64', async () => {
          const pm = await PackageManager.detect(workDir);
          expect(pm).toBeInstanceOf(NpmPackageManager);
        });
      });

      it('falls through to manifest when the user agent is unrecognised', async function () {
        await writeFile(path.join(workDir, 'package.json'), JSON.stringify({ packageManager: 'pnpm@9.0.0' }));
        await withUserAgent('weirdtool/1.0', async () => {
          const pm = await PackageManager.detect(workDir);
          expect(pm).toBeInstanceOf(PnpmPackageManager);
        });
      });
    });

    describe('via packageManager field', function () {
      it('detects yarn from a yarn@... declaration', async function () {
        await writeFile(path.join(workDir, 'package.json'), JSON.stringify({ packageManager: 'yarn@1.22.22' }));
        await withoutUserAgent(async () => {
          const pm = await PackageManager.detect(workDir);
          expect(pm).toBeInstanceOf(YarnPackageManager);
        });
      });

      it('detects pnpm from a pnpm@... declaration', async function () {
        await writeFile(path.join(workDir, 'package.json'), JSON.stringify({ packageManager: 'pnpm@9.0.0' }));
        await withoutUserAgent(async () => {
          const pm = await PackageManager.detect(workDir);
          expect(pm).toBeInstanceOf(PnpmPackageManager);
        });
      });

      it('detects npm from an npm@... declaration', async function () {
        await writeFile(path.join(workDir, 'package.json'), JSON.stringify({ packageManager: 'npm@10.0.0' }));
        await withoutUserAgent(async () => {
          const pm = await PackageManager.detect(workDir);
          expect(pm).toBeInstanceOf(NpmPackageManager);
        });
      });

      it('falls through to lockfile when the declaration is unrecognised', async function () {
        await writeFile(path.join(workDir, 'package.json'), JSON.stringify({ packageManager: 'bun@1.0.0' }));
        await writeFile(path.join(workDir, 'yarn.lock'), '');
        await withoutUserAgent(async () => {
          const pm = await PackageManager.detect(workDir);
          expect(pm).toBeInstanceOf(YarnPackageManager);
        });
      });
    });

    describe('via lockfile', function () {
      it('detects yarn from a yarn.lock file', async function () {
        await writeFile(path.join(workDir, 'yarn.lock'), '');
        await withoutUserAgent(async () => {
          const pm = await PackageManager.detect(workDir);
          expect(pm).toBeInstanceOf(YarnPackageManager);
        });
      });

      it('detects pnpm from a pnpm-lock.yaml file', async function () {
        await writeFile(path.join(workDir, 'pnpm-lock.yaml'), '');
        await withoutUserAgent(async () => {
          const pm = await PackageManager.detect(workDir);
          expect(pm).toBeInstanceOf(PnpmPackageManager);
        });
      });

      it('detects npm from a package-lock.json file', async function () {
        await writeFile(path.join(workDir, 'package-lock.json'), '{}');
        await withoutUserAgent(async () => {
          const pm = await PackageManager.detect(workDir);
          expect(pm).toBeInstanceOf(NpmPackageManager);
        });
      });
    });

    describe('error path', function () {
      it('throws when no signal is available', async function () {
        await withoutUserAgent(async () => {
          await expect(PackageManager.detect(workDir)).rejects.toThrow(/Could not detect a package manager/);
        });
      });
    });
  });

  describe('concrete subclasses', function () {
    /**
     * Test-only subclasses that surface the protected `addArgs` / `removeArgs`
     * methods so they can be asserted without actually shelling out.
     */
    class ExposedYarn extends YarnPackageManager {
      public publicAddArgs(spec: string): string[] {
        return this.addArgs(spec);
      }
      public publicRemoveArgs(name: string): string[] {
        return this.removeArgs(name);
      }
    }
    class ExposedPnpm extends PnpmPackageManager {
      public publicAddArgs(spec: string): string[] {
        return this.addArgs(spec);
      }
      public publicRemoveArgs(name: string): string[] {
        return this.removeArgs(name);
      }
    }
    class ExposedNpm extends NpmPackageManager {
      public publicAddArgs(spec: string): string[] {
        return this.addArgs(spec);
      }
      public publicRemoveArgs(name: string): string[] {
        return this.removeArgs(name);
      }
    }

    it('YarnPackageManager invokes yarn add/remove', function () {
      const pm = new ExposedYarn();
      expect(pm.kind()).toBe(PackageManagerKind.Yarn);
      expect(pm.executable()).toBe('yarn');
      expect(pm.publicAddArgs('@koolie/types@1.2.3')).toEqual(['add', '@koolie/types@1.2.3']);
      expect(pm.publicRemoveArgs('@koolie/types')).toEqual(['remove', '@koolie/types']);
    });

    it('PnpmPackageManager invokes pnpm add/remove', function () {
      const pm = new ExposedPnpm();
      expect(pm.kind()).toBe(PackageManagerKind.Pnpm);
      expect(pm.executable()).toBe('pnpm');
      expect(pm.publicAddArgs('@koolie/types@1.2.3')).toEqual(['add', '@koolie/types@1.2.3']);
      expect(pm.publicRemoveArgs('@koolie/types')).toEqual(['remove', '@koolie/types']);
    });

    it('NpmPackageManager invokes npm install/uninstall', function () {
      const pm = new ExposedNpm();
      expect(pm.kind()).toBe(PackageManagerKind.Npm);
      expect(pm.executable()).toBe('npm');
      expect(pm.publicAddArgs('@koolie/types@1.2.3')).toEqual(['install', '@koolie/types@1.2.3']);
      expect(pm.publicRemoveArgs('@koolie/types')).toEqual(['uninstall', '@koolie/types']);
    });
  });

  describe('manifest fallback edge cases', function () {
    let workDir: string;

    beforeEach(async function () {
      workDir = await mkdtemp(path.join(tmpdir(), 'koolie-pm-edge-'));
    });

    afterEach(async function () {
      await rm(workDir, { recursive: true, force: true });
    });

    it('falls through to lockfile when the manifest is unreadable', async function () {
      // Write a malformed manifest so JSON5 parsing fails — detect must
      // shrug, ignore the manifest, and pick up the lockfile signal.
      await writeFile(path.join(workDir, 'package.json'), '{ this is not valid json');
      await writeFile(path.join(workDir, 'pnpm-lock.yaml'), '');
      await withoutUserAgent(async () => {
        const pm = await PackageManager.detect(workDir);
        expect(pm).toBeInstanceOf(PnpmPackageManager);
      });
    });

    it('falls through to lockfile when the manifest omits packageManager', async function () {
      await writeFile(path.join(workDir, 'package.json'), JSON.stringify({ name: 'sample' }));
      await writeFile(path.join(workDir, 'package-lock.json'), '{}');
      await withoutUserAgent(async () => {
        const pm = await PackageManager.detect(workDir);
        expect(pm).toBeInstanceOf(NpmPackageManager);
      });
    });
  });
});

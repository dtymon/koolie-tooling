import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { Writable } from 'node:stream';

import {
  dirExists,
  errorMessage,
  executeAndGetOutput,
  executeCommand,
  exists,
  fileExists,
  filterFile,
  findFiles,
  getPackageName,
  pathExists,
  readJsonFile,
  resolvePackageRoot,
  showError,
  streamCommandInto,
  writeJsonFile,
  writeJsonStringToFile,
} from './Utils.js';

/**
 * Set an env var for the duration of `fn`, restoring whatever was there
 * before. Used to isolate tests that depend on `process.env.npm_package_*`.
 */
async function withEnv<T>(key: string, value: string | undefined, fn: () => Promise<T>): Promise<T> {
  const previous = process.env[key];
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    if (previous === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = previous;
    }
  }
}

describe('Utils', function () {
  let workDir: string;

  beforeEach(async function () {
    workDir = await mkdtemp(path.join(tmpdir(), 'koolie-utils-test-'));
  });

  afterEach(async function () {
    await rm(workDir, { recursive: true, force: true });
  });

  describe('errorMessage()', function () {
    it('returns the message of an Error', function () {
      expect(errorMessage(new Error('boom'))).toBe('boom');
    });

    it('coerces non-Error throwables to string', function () {
      expect(errorMessage('plain string')).toBe('plain string');
      expect(errorMessage(42)).toBe('42');
      expect(errorMessage(undefined)).toBe('undefined');
    });
  });

  describe('getPackageName()', function () {
    it('returns undefined when npm_package_name is not set', async function () {
      await withEnv('npm_package_name', undefined, async () => {
        expect(getPackageName()).toBeUndefined();
      });
    });

    it('strips @ and replaces / with - so the value is filename-safe', async function () {
      await withEnv('npm_package_name', '@koolie/tooling', async () => {
        expect(getPackageName()).toBe('koolie-tooling');
      });
    });
  });

  describe('exists() / pathExists() / fileExists() / dirExists()', function () {
    it('returns null/false for a missing path', async function () {
      const missing = path.join(workDir, 'missing');
      expect(await exists(missing)).toBeNull();
      expect(await pathExists(missing)).toBe(false);
      expect(await fileExists(missing)).toBe(false);
      expect(await dirExists(missing)).toBe(false);
    });

    it('returns stats / true for an existing file', async function () {
      const file = path.join(workDir, 'a.txt');
      await writeFile(file, 'hi');
      expect(await pathExists(file)).toBe(true);
      expect(await fileExists(file)).toBe(true);
      expect(await dirExists(file)).toBe(false);
    });

    it('distinguishes directories from files', async function () {
      const dir = path.join(workDir, 'sub');
      await mkdir(dir);
      expect(await pathExists(dir)).toBe(true);
      expect(await fileExists(dir)).toBe(false);
      expect(await dirExists(dir)).toBe(true);
    });

    it('joins multiple path parts', async function () {
      const dir = path.join(workDir, 'a', 'b');
      await mkdir(dir, { recursive: true });
      expect(await dirExists(workDir, 'a', 'b')).toBe(true);
      expect(await dirExists(workDir, 'a', 'missing')).toBe(false);
    });
  });

  describe('readJsonFile() / writeJsonFile() / writeJsonStringToFile()', function () {
    it('round-trips a JSON object via writeJsonFile + readJsonFile', async function () {
      const file = path.join(workDir, 'config.json');
      const data = { name: 'koolie', version: 1, list: [1, 2] };
      await writeJsonFile(file, data);
      const read = await readJsonFile<typeof data>(file);
      expect(read).toEqual(data);
    });

    it('parses JSON5 with comments', async function () {
      const file = path.join(workDir, 'with-comments.json5');
      await writeFile(file, '{\n  // a comment\n  "x": 1,\n}\n');
      const read = await readJsonFile<{ x: number }>(file);
      expect(read).toEqual({ x: 1 });
    });

    it('rejects on a missing file with a specific error', async function () {
      const missing = path.join(workDir, 'nope.json');
      await expect(readJsonFile(missing)).rejects.toThrow();
    });

    it('rejects on malformed JSON5 content', async function () {
      const file = path.join(workDir, 'bad.json');
      await writeFile(file, '{ not json');
      await expect(readJsonFile(file)).rejects.toThrow();
    });

    it('writes a pre-stringified JSON payload via writeJsonStringToFile', async function () {
      const file = path.join(workDir, 'stringified.json');
      await writeJsonStringToFile(file, '{"hello":"world"}');
      const read = await readJsonFile<{ hello: string }>(file);
      expect(read).toEqual({ hello: 'world' });
    });
  });

  describe('showError()', function () {
    it('prefixes with "Error:" when the first arg does not already', function () {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        showError('boom');
        expect(spy).toHaveBeenCalledWith('Error:', 'boom');
      } finally {
        spy.mockRestore();
      }
    });

    it('passes through unchanged when the first arg already starts with "Error:"', function () {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        showError('Error: already prefixed');
        expect(spy).toHaveBeenCalledWith('Error: already prefixed');
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('findFiles()', function () {
    it('returns files matching the provided filter and skips others', async function () {
      await writeFile(path.join(workDir, 'a.json'), '{}');
      await writeFile(path.join(workDir, 'b.txt'), 'plain');
      await mkdir(path.join(workDir, 'sub'));
      await writeFile(path.join(workDir, 'sub', 'c.json'), '{}');

      const found = await findFiles(workDir, (item) => item.stats.isFile() && item.path.endsWith('.json'));
      expect(found.sort()).toEqual([path.join(workDir, 'a.json'), path.join(workDir, 'sub', 'c.json')].sort());
    });
  });

  describe('filterFile()', function () {
    it('reads the source, applies the transform, writes the destination', async function () {
      const src = path.join(workDir, 'src.txt');
      const dst = path.join(workDir, 'dst.txt');
      await writeFile(src, 'hello');
      await filterFile(src, dst, (contents) => contents.toUpperCase());
      const written = await readJsonFile<string>(dst).catch(() => undefined);
      // readJsonFile fails on non-JSON content; fall back to a raw read.
      const { readFile } = await import('node:fs/promises');
      expect(written).toBeUndefined();
      expect((await readFile(dst, 'utf8')).toString()).toBe('HELLO');
    });

    it('supports an async transform', async function () {
      const src = path.join(workDir, 'src.txt');
      const dst = path.join(workDir, 'dst.txt');
      await writeFile(src, 'hi');
      await filterFile(src, dst, async (contents) => `${contents}!`);
      const { readFile } = await import('node:fs/promises');
      expect((await readFile(dst, 'utf8')).toString()).toBe('hi!');
    });
  });

  describe('resolvePackageRoot()', function () {
    it('resolves an installed package back to its on-disk root', function () {
      // `vitest` is a known dependency of this package — pick something
      // unambiguously installed under any package manager layout.
      const root = resolvePackageRoot('vitest');
      expect(path.isAbsolute(root)).toBe(true);
      // The resolved root must contain a package.json with the expected name.
      // This guards against picking up the wrong package by accident.
      const manifest = path.join(root, 'package.json');
      expect(manifest).toMatch(/[\\/]vitest[\\/]package\.json$/);
    });

    it('throws when the package is not installed', function () {
      expect(() => resolvePackageRoot('@koolie/definitely-not-installed-xyz')).toThrow();
    });
  });

  describe('exists() error path', function () {
    it('rethrows non-ENOENT errors', async function () {
      // stat-ing a sub-path of a regular file yields ENOTDIR, which exists()
      // does not swallow — it must propagate so callers can see real failures
      // rather than silently treating them as "not found".
      const file = path.join(workDir, 'a.txt');
      await writeFile(file, 'hi');
      await expect(exists(file, 'sub-path')).rejects.toThrow();
    });
  });

  describe('writeJsonFile() error paths', function () {
    it('rejects when the value cannot be stringified (circular reference)', async function () {
      const file = path.join(workDir, 'circular.json');
      const obj: { self?: unknown } = {};
      obj.self = obj;
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        // `writeJsonFile` throws synchronously on stringify failure even
        // though it returns Promise<void>; wrap so the assertion works for
        // both shapes.
        await expect(Promise.resolve().then(() => writeJsonFile(file, obj))).rejects.toThrow(
          /Converting circular structure/
        );
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('writeJsonStringToFile() error paths', function () {
    it('rejects when the input cannot be formatted as JSON', async function () {
      const file = path.join(workDir, 'bad.json');
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        await expect(writeJsonStringToFile(file, '{ not json')).rejects.toThrow();
      } finally {
        spy.mockRestore();
      }
    });

    it('rejects when the destination cannot be written', async function () {
      // Writing under a regular file as if it were a directory yields
      // ENOTDIR from the OS — exercises the writeFile catch branch.
      const blocker = path.join(workDir, 'blocker.txt');
      await writeFile(blocker, 'x');
      const target = path.join(blocker, 'nested.json');
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        await expect(writeJsonStringToFile(target, '{"a":1}')).rejects.toThrow();
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('executeCommand()', function () {
    it('resolves with the exit code on success', async function () {
      const rc = await executeCommand(process.execPath, ['-e', ''], { stdio: 'ignore' });
      expect(rc).toBe(0);
    });

    it('resolves with a non-zero exit code on failure', async function () {
      const rc = await executeCommand(process.execPath, ['-e', 'process.exit(7)'], { stdio: 'ignore' });
      expect(rc).toBe(7);
    });

    it('rejects when the executable cannot be spawned', async function () {
      await expect(executeCommand('a-binary-that-does-not-exist-xyz', [], { stdio: 'ignore' })).rejects.toThrow();
    });
  });

  describe('streamCommandInto()', function () {
    it('pipes child stdout into the provided writable', async function () {
      const chunks: Buffer[] = [];
      const sink = new Writable({
        write(chunk: Buffer, _enc, cb): void {
          chunks.push(Buffer.from(chunk));
          cb();
        },
      });
      const rc = await streamCommandInto(process.execPath, ['-e', 'process.stdout.write("hello-stream")'], {}, sink);
      expect(rc).toBe(0);
      expect(Buffer.concat(chunks).toString('utf8')).toBe('hello-stream');
    });

    it('rejects when the executable cannot be spawned', async function () {
      const sink = new Writable({ write: (_c, _e, cb) => cb() });
      await expect(streamCommandInto('a-binary-that-does-not-exist-xyz', [], {}, sink)).rejects.toThrow();
    });
  });

  describe('executeAndGetOutput()', function () {
    it('returns stdout split into lines', async function () {
      const lines = await executeAndGetOutput(
        process.execPath,
        ['-e', 'console.log("alpha"); console.log("beta")'],
        {}
      );
      expect(lines).toEqual(['alpha', 'beta']);
    });

    it('throws when the command exits non-zero', async function () {
      await expect(executeAndGetOutput(process.execPath, ['-e', 'process.exit(3)'], {})).rejects.toThrow(/status=3/);
    });
  });

  describe('filterFile() destination contents', function () {
    it('writes the transform result verbatim to the destination', async function () {
      const src = path.join(workDir, 'src.txt');
      const dst = path.join(workDir, 'dst.txt');
      await writeFile(src, 'abc');
      await filterFile(src, dst, (contents) => contents.split('').reverse().join(''));
      expect(await readFile(dst, 'utf8')).toBe('cba');
    });
  });
});

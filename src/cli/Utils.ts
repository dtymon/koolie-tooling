import { spawn, SpawnOptions } from 'node:child_process';
import { Stats } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { createInterface } from 'node:readline';
import { PassThrough } from 'node:stream';
import { promisify } from 'node:util';

import * as json5 from 'json5';
import * as klaw from 'klaw';
import { format, Options as PrettierOptions } from 'prettier';

/** Default options to use to format JSON content **/
const JsonFormatOptions: PrettierOptions = {
  parser: 'json',
  tabWidth: 2,
  trailingComma: 'none'
};

/**
 * Display an error message to stderr
 *
 * @param msgs - error message to display
 */
export function showError(...msgs: string[]): void {
  const prefix = 'Error:';
  if (msgs.length > 0 && msgs[0].startsWith(prefix)) {
    console.error(...msgs);
  } else {
    console.error(prefix, ...msgs);
  }
}

/**
 * Called to get the package name
 *
 * @returns the name of the package if set in the environment
 */
export function getPackageName(): string | undefined {
  return process.env.npm_package_name === undefined
    ? undefined
    : process.env.npm_package_name.replace(/@/g, '').replace(/\//g, '-');
}

/**
 * Fetch the fs stats of a path if it exists
 *
 * @param first - first part of path to test for
 * @param others - other parts of path to test for
 * @returns the stats of the element if it exists else null
 */
export async function exists(first: string, ...others: string[]): Promise<Stats | null> {
  const pathname = others.length > 0 ? path.join(first, ...others) : first;
  try {
    const stats = await stat(pathname);
    return stats;
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

/**
 * Determine if a given path exists
 *
 * @param first - first part of path to test for
 * @param others - other parts of path to test for
 * @returns true if the path exists else false
 */
export async function pathExists(first: string, ...others: string[]): Promise<boolean> {
  return (await exists(first, ...others)) !== null;
}

/**
 * Determine if a file exists
 *
 * @param first - first part of file path to test for
 * @param others - other parts of file path to test for
 * @returns true if the file exists else false
 */
export async function fileExists(first: string, ...others: string[]): Promise<boolean> {
  const stats = await exists(first, ...others);
  return stats === null ? false : stats.isFile();
}

/**
 * Determine if a directory exists
 *
 * @param first - first part of directory path to test for
 * @param others - other parts of directory path to test for
 * @returns true if the directory exists else false
 */
export async function dirExists(first: string, ...others: string[]): Promise<boolean> {
  const stats = await exists(first, ...others);
  return stats === null ? false : stats.isDirectory();
}

/**
 * Find files or directories that pass the given filter
 *
 * @param parent - starting directory
 * @param filter - a filter function that takes the stat entry
 * @returns the names of files found that pass the filter
 */
export async function findFiles(parent: string, filter: (item: klaw.Item) => boolean): Promise<string[]> {
  const matching: string[] = [];
  for await (const candidate of klaw.default(parent)) {
    if (filter(candidate)) {
      matching.push(candidate.path);
    }
  }

  return matching;
}

/**
 * Read the contents of the source file, pass it to the filter function and
 * write the result to the given output file.
 *
 * @param src - the source file
 * @param dst - the destination file
 * @param filter - the filter function
 * @returns when complete
 */
export async function filterFile(
  src: string,
  dst: string,
  filter: (contents: string) => string | Promise<string>
): Promise<void> {
  const contents = await filter(await readFile(src, 'utf8'));
  await writeFile(dst, contents, 'utf8');
}

/**
 * Read and parse a JSON5 file
 *
 * @param filename - file to read
 * @returns the parsed JSON5 contents
 */
export async function readJsonFile<T = Record<string, any>>(filename: string): Promise<T> {
  let contents: string;
  try {
    contents = await readFile(filename, 'utf8');
  } catch (err: any) {
    showError(`Failed to read JSON5 file ${filename}: ${err.toString()}`);
    throw err;
  }

  try {
    return json5.parse<T>(contents);
  } catch (err: any) {
    showError(`Failed to parse JSON5 file ${filename}: ${err.toString()}`);
    throw err;
  }
}

/**
 * Write a structure to a JSON file
 *
 * @param filename - file to create
 * @param contents - contents to write to the file
 */
export function writeJsonFile<T = Record<string, any>>(filename: string, contents: T): Promise<void> {
  let stringified: string;
  try {
    stringified = JSON.stringify(contents);
  } catch (err: any) {
    showError(`Failed to stringify JSON object: ${err.toString()}`);
    throw err;
  }

  return writeJsonStringToFile(filename, stringified);
}

/**
 * Write the given stringified JSON contents to a file
 *
 * @param filename - file to create
 * @param contents - stringified JSON to write to the file
 */
export async function writeJsonStringToFile(filename: string, contents: string): Promise<void> {
  let formatted: string;
  try {
    formatted = await format(contents, JsonFormatOptions);
  } catch (err: any) {
    showError(`Failed to format JSON object: ${err.toString()}`);
    throw err;
  }

  try {
    await writeFile(filename, formatted, 'utf8');
  } catch (err: any) {
    showError(`Error: Failed to write JSON file ${filename}: ${err.toString()}`);
    throw err;
  }
}

/**
 * Get a response from the user to a given question
 *
 * @param prompt - the prompt to show the user
 * @returns the user's response
 */
export async function ask(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = promisify(rl.question).bind(rl);

  const answer = (await ask(prompt)) as any as string;
  return answer;
}

/**
 * Run a child process
 *
 * @param cmd - command to execute
 * @param args - arguments for the command
 * @param opts - options for `spawn`
 * @returns the exit status of the command
 */
export function executeCommand(cmd: string, args: any[], opts: SpawnOptions): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const child = spawn(cmd, args, opts);
    if (child === null) {
      reject(new Error(`Failed to start command: ${cmd}`));
    } else {
      let fulfilled = 0;
      child.on('error', (err) => !fulfilled++ && reject(err));
      child.on('close', (code: number) => !fulfilled++ && resolve(code));
    }
  });
}

/**
 * Run a child process and pipe stdout into the given stream
 *
 * @param cmd - command to execute
 * @param args - arguments for the command
 * @param opts - options for `spawn`
 * @param stdout - where to send stdout to
 * @returns the exit status of the command
 */
export function streamCommandInto(
  cmd: string,
  args: any[],
  opts: SpawnOptions,
  stdout: NodeJS.WritableStream
): Promise<number> {
  return new Promise((resolve, reject) => {
    // Close stdin to this command and send stderr to the same place as the
    // parent process.
    opts.stdio = ['ignore', 'pipe', 'inherit'];
    const child = spawn(cmd, args, opts);
    if (child === null) {
      throw new Error(`Failed to start command: ${cmd}`);
    }

    let fulfilled = 0;
    (child.stdout as NodeJS.ReadableStream).pipe(stdout);
    child.on('error', (err) => !fulfilled++ && reject(err));
    child.on('close', (code: number) => !fulfilled++ && resolve(code));
  });
}

/**
 * Execute the given command and return the output as an array of lines
 *
 * @param cmd - command to execute
 * @param args - arguments for the command
 * @param opts - options for spawn
 * @returns the lines of output
 */
export async function executeAndGetOutput(cmd: string, args: any[], opts: SpawnOptions): Promise<string[]> {
  // Create a pass through stream and connect a readline instance to it
  const pt = new PassThrough();
  const rl = createInterface({ input: pt });

  const lines: string[] = [];
  rl.on('line', (line) => lines.push(line));

  const rc = await streamCommandInto(cmd, args, opts, pt);
  if (rc !== 0) {
    throw new Error(`Failed to execute command: "${cmd} ${args.join(' ')}": status=${rc}`);
  }

  return lines;
}

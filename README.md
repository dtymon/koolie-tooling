# @koolie/tooling

`@koolie` is a platform designed to reduce the time and effort required to build production-ready Typescript applications. While its primary focus is on the development of microservices and APIs, it can assist applications of any size and complexity.

`@koolie/tooling` is the dev-time entry point to that platform. Add it as a `devDependency` of any Koolie package or application to get:

- a `koolie` CLI for managing `@koolie/*` dependencies and building distributions
- shareable ESLint, Vitest and TypeScript configurations
- a contribution model that lets downstream `@koolie/*` packages register their own CLI sub-commands

The package itself is package-manager agnostic: Yarn, pnpm and npm are all detected at runtime and the appropriate executable is invoked when needed.

## Installation

```sh
# yarn
yarn add --dev @koolie/tooling

# pnpm
pnpm add -D @koolie/tooling

# npm
npm install --save-dev @koolie/tooling
```

Node.js 24 or later is required.

## The `koolie` CLI

A `koolie` binary is installed into `node_modules/.bin`. Run it via your package manager's script runner so the active package manager is unambiguously identified:

```sh
yarn koolie <sub-command>
pnpm koolie <sub-command>
npm exec koolie -- <sub-command>
```

Three sub-commands ship in this package; downstream `@koolie/*` packages may contribute more (see [Extending the CLI](#extending-the-cli)).

### `koolie add-package <names...>`

Adds one or more `@koolie/<name>` packages as dependencies and wires their default JSON config files into the application via `$extends` references.

```sh
yarn koolie add-package types
yarn koolie add-package types --ver 0.7.0
yarn koolie add-package types --caret      # ^x.y.z instead of the default ~x.y.z
```

What it does:

- Resolves the version from `--ver` if given, otherwise pins to whatever `@koolie/tooling` itself is at in `devDependencies`. Mixing versions across `@koolie/*` packages is discouraged and prints a warning.
- Installs the dependency via the detected package manager (`yarn add`, `pnpm add` or `npm install`).
- Walks the package's `config/` directory and, for every `<file>.json` it finds, ensures `application/src/config/<file>.json` extends it. If the destination file does not yet exist, it is created with a single-entry `$extends`. If it does exist, the new entry is appended to the existing `$extends` array.
- Comments outside the `$extends` block are preserved; comments **inside** that block are not — the block is rewritten in place.
- Configs that diverge from the `{ "$extends": [...], ... }` shape must be edited manually.

### `koolie remove-package <names...>`

The inverse of `add-package`. Uninstalls the dependency via the detected package manager and strips matching entries from every `application/src/config/*.json` file's `$extends` array.

```sh
yarn koolie remove-package types
```

### `koolie build-dist`

Stages a publishable distribution under `dist/` (configurable with `--dest`):

- Always copies `README.md`, `CHANGELOG.md`, `LICENSE`, `yarn.lock`, plus any extra files passed through `--files`.
- Copies an `etc/` directory if present at the project root (or under `--root`).
- Copies `package.json` with any `dist/` path prefixes stripped, so the published manifest references files at the package root.

```sh
yarn koolie build-dist -f tsconfig.json eslint.config.mjs vitest
```

This is the same mechanism `@koolie/tooling` uses for its own release pipeline; see the `release` script in `package.json`.

## Shared configurations

The package re-exports its lint, test and TypeScript configs so consumers can adopt them directly.

### ESLint

```js
// eslint.config.mjs
export { default } from '@koolie/tooling/eslint.config.mjs';

// eslint.config.spec.mjs
export { default } from '@koolie/tooling/eslint.config.spec.mjs';
```

`@koolie/tooling/eslint.config.defaults.mjs` is also exported for projects that want to compose on top of the defaults rather than inherit the full project config.

### Vitest

```js
// vitest.config.mjs
import { defineConfig, mergeConfig } from 'vitest/config';
import koolieBaseVitestConfig from '@koolie/tooling/vitest/vitest-base.config.mjs';

export default mergeConfig(
  koolieBaseVitestConfig,
  defineConfig({
    // project-level overrides
  })
);
```

The base config enables `globals: true`, sets `environment: 'node'`, configures v8 coverage with an 80% line/branch threshold, and switches to JUnit + GitHub Actions reporters when `CI=true`.

### TypeScript

```jsonc
// tsconfig.json
{ "extends": "@koolie/tooling/tsconfig.json" }

// tsconfig.spec.json
{ "extends": "@koolie/tooling/tsconfig.spec.json" }
```

## Extending the CLI

Any `@koolie/*` package depended on by the consumer (directly or transitively) can contribute sub-commands. On startup the CLI reads the consumer's manifest, walks `@koolie/*` dependencies using a `require` anchored at the consumer's `cwd`, and dynamic-imports each contributor's declared sub-command module. Resolution honours whatever the active package manager is doing — Yarn 1, npm, pnpm hoisted or isolated, Yarn PnP — without relying on `node_modules/.bin/` lookups.

To contribute, declare an entry point in your `package.json`:

```jsonc
{
  "name": "@koolie/example",
  "koolie": {
    "subcommands": "./dist/subcommands.js"
  }
}
```

The module must export at least one of:

- `command` — a single `SubCommand` instance.
- `commands` — an array of `SubCommand` instances.

```ts
import { SubCommand } from '@koolie/tooling/cli/SubCommand.js';
import type { Arguments, Argv } from 'yargs';

class Hello extends SubCommand {
  public name(): string {
    return 'hello';
  }

  public description(): string {
    return 'Say hello';
  }

  public create(): (yargs: Argv) => Argv {
    return (y) => y.option('to', { type: 'string', default: 'world' });
  }

  public async run(args: Arguments): Promise<number> {
    console.log(`Hello, ${String(args.to)}!`);
    return 0;
  }
}

export const command = new Hello();
```

Both shapes are validated at load time; an export that is not a `SubCommand` (or an array of them) causes the CLI to fail loudly rather than silently skip the contribution.

## Package-manager detection

When a sub-command needs to invoke a package manager — currently `add-package` and `remove-package` — the active manager is detected in this order:

1. `process.env.npm_config_user_agent`. Set by Yarn, pnpm and npm when the CLI is invoked through them. This is the unambiguous signal.
2. The `packageManager` field in the cwd's `package.json` (Corepack convention, e.g. `"yarn@1.22.22"`).
3. A lockfile in the cwd: `yarn.lock`, `pnpm-lock.yaml`, or `package-lock.json`.
4. None of the above — the CLI throws rather than pick a default and shell out blindly.

## Constraints and non-goals

- The `add-package` / `remove-package` config wiring assumes the application keeps its configuration under `application/src/config/` and follows the koolie template (`{ "$extends": [...], ... }`). Configs outside that shape are not touched.
- The `$extends` strings written into configs are literal `node_modules/@koolie/<name>/config/<file>` paths. That string format is a contract owned by the runtime config loader, not the CLI. Yarn PnP, which has no `node_modules`, is therefore not yet supported on the resolution side; migrating to bare specifiers is tracked separately.

## Repository scripts

```sh
yarn pre-commit       # build, test (with coverage threshold), lint, audit
yarn release          # produce releases/koolie-tooling-v<version>.tgz
yarn npm-publish      # publish the most recent tarball
```

## License

MIT — see [LICENSE](LICENSE).

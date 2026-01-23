# specli

Specli turns an OpenAPI 3.x spec (URL or file) into a CLI.

There are two ways to use it:

- `specli exec <spec> ...`: dynamic mode (loads a spec at runtime; works in Bun and Node)
- `specli compile <spec> ...`: produces a standalone Bun executable with the spec embedded

This file is guidance for agents working in this repo.

## Repo tour (where to look)

- `src/cli.ts`: the published `specli` CLI (commands: `exec`, `compile`)
- `bin/cli.sh`: package bin wrapper; prefers Bun, falls back to Node (but `compile` requires Bun)

- `src/cli/main.ts`: the "runtime CLI" used by compiled binaries
  - global flags live here (`--server`, `--server-var`, `--auth`, `--bearer-token`, ...)
  - built-in subcommands live here: `login`, `logout`, `whoami`, `__schema`

- `src/cli/exec.ts`: glue that turns `specli exec <spec> ...` into a call to `main()` with `--spec <spec>`
- `src/cli/compile.ts`: Bun-only compiler entry
  - default output is `./out/<name>` (gitignored; good for local testing)
  - generates a temporary entrypoint in the OS temp dir and runs `bun build --compile`
  - imports `dist/cli/main.js`, so local compile requires building `dist/` first

- `src/cli/spec/*`: spec loading + IDs
  - `src/cli/spec/loader.ts`: dereferences specs via `@apidevtools/swagger-parser` (JSON or YAML)
  - `src/cli/spec/id.ts`: stable spec ID derived from a fingerprint
  - `src/cli/spec/derive-name.ts`: derive a safe binary name from `info.title` or URL host

- `src/cli/parse/*`: OpenAPI -> normalized intermediate structures (operations, params, servers, auth)
- `src/cli/model/*`: naming, command planning, command model/schema output
- `src/cli/runtime/*`: execution layer
  - `src/cli/runtime/generated.ts`: turns the command model into Commander commands (and custom help)
  - `src/cli/runtime/request.ts`: URL + params + auth + body building (+ `--curl` generation)
  - `src/cli/runtime/execute.ts`: fetch + output formatting
  - `src/cli/runtime/validate/*`: Ajv schemas, coercion, error formatting
  - `src/cli/runtime/profile/*`: profiles file + Bun secrets integration
  - `src/cli/runtime/compat.ts`: Bun/Node compatibility helpers

- `src/index.ts`: programmatic API export (`specli()`)
- `src/client/index.ts`: programmatic client implementation
- `src/ai/tools.ts`: AI SDK tool wrapper around the programmatic client

## Local development

Install deps:

```sh
bun install
```

Run the CLI from source (recommended while iterating):

```sh
# Inspect a spec's generated command mapping
bun run ./src/cli.ts exec ./openapi.yaml __schema

# Preview an operation without executing
bun run ./src/cli.ts exec ./openapi.yaml users list --curl
```

Build TypeScript output (required before local `compile`):

```sh
bun run build

# Run the built (dist/) CLI like the published package
./bin/cli.sh exec ./openapi.yaml __schema
node ./dist/cli.js exec ./openapi.yaml __schema
```

Compile a standalone binary (Bun-only):

```sh
# Default: writes to ./out/<name>
bun run ./src/cli.ts compile ./openapi.yaml --name myapi

# Run the compiled binary (spec is embedded)
./out/myapi __schema
./out/myapi users list --curl

# You can embed defaults into the compiled binary
# (these become defaults at runtime, but can still be overridden by flags)
bun run ./src/cli.ts compile ./openapi.yaml --name myapi \
  --server https://api.example.com \
  --server-var region=us-east-1 \
  --auth BearerAuth
```

Compile into a temporary directory (nice for one-off tests):

```sh
tmpdir="$(mktemp -d)"
bun run ./src/cli.ts compile ./openapi.yaml --name myapi --outfile "$tmpdir/myapi"
"$tmpdir/myapi" __schema
```

Cross-compile (still Bun-only):

```sh
bun run ./src/cli.ts compile ./openapi.yaml --target bun-linux-x64 --outfile ./out/myapi-linux
```

Notes on build artifacts:

- `dist/`: `tsc` output used for publishing; not committed
- `out/`: local compiled binaries; not committed

## Testing, linting, typechecking

Always use Bun for tests:

```sh
bun test
```

Other useful checks:

```sh
bun run lint
bun run typecheck
```

Most tests live alongside code as `*.test.ts` in `src/cli/**`.

## Auth + profiles (dev notes)

- Profiles file: `~/.config/specli/profiles.json` (created on demand)
- Runtime currently assumes a single profile named `default`.
- Token storage:
  - Bun: uses `Bun.secrets` (native keychain) keyed by `service = specli:<specId>`
  - Node: token storage is not supported (you must pass `--bearer-token` each run)

When writing tests, avoid relying on a real HOME directory state or OS keychain.

## Debugging tips

- Use `__schema` to quickly see how a spec maps to `<resource> <action>` commands.
- Use `--curl` to verify URL/headers/body without sending a request.
- If something is "missing" at runtime, trace the pipeline:
  - `src/cli/spec/loader.ts` (load/deref) -> `src/cli/parse/*` (index) -> `src/cli/model/*` (plan/build) -> `src/cli/runtime/*` (execute)

# opencli

OpenCLI (work in progress) turns an OpenAPI spec into a CLI.

## Install

```bash
bun install
```

## Run (runtime mode)

Index operations from a spec:

```bash
bun run ./src/entry.ts __schema --spec ./fixtures/openapi.json
```

Machine-readable output:

```bash
bun run ./src/entry.ts __schema --json --spec ./fixtures/openapi.json
```

Pretty JSON (human-friendly):

```bash
bun run ./src/entry.ts __schema --json --pretty --spec ./fixtures/openapi.json
```

## Build a standalone executable (embedded spec)

This uses a Bun macro (`with { type: "macro" }`) to load and inline the OpenAPI spec at bundle-time.

Pick the spec at build-time via env:

```bash
OPENCLI_EMBED_SPEC=./path/to/openapi.yaml bun build --compile ./src/entry-bundle.ts --outfile dist/opencli
./dist/opencli __schema
```

Note: this env var is read at bundle-time (because it runs inside a Bun macro), not at runtime.

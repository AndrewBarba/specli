# specli

Specli is a utility for pre-compiling OpenAPI specs into single file executables; allowing agents to interact with API's in a much more token effecient manner.

## Developing

This repo uses Bun for package management, testing, and compiling single file executables.

You can always test your work locally by creating executables with:

```sh
bun run ./src/cli.ts <arguments>
```

This is similar to how users execute specli via npx:

```sh
npx specli compile https://example.com/openapi.json --name myapi
```

## Testing

Always use `bun test` when running tests.

# specli

specli turns an OpenAPI spec into a non-interactive, “curl replacement” CLI.

It has two modes:

- **exec**: run commands dynamically from a spec URL/path.
- **compile**: bundle the spec into a standalone executable.

The guiding constraints:

- Bun-first (no Node runtime needed).
- Suitable for automation/agents (stable commands, machine output via `--json`).
- Best-effort validation of inputs against the OpenAPI schema.

## Status / What Works Today

It works well for a large chunk of “typical” OpenAPI 3.x REST specs:

- Multiple servers + server variables.
- Path/query/header/cookie parameters.
- Request bodies via `--data` / `--file`.
- JSON request body parsing + schema validation.
- Expanded JSON body flags for simple object bodies (`--body-*`).
- Auth injection for common schemes (bearer/basic/apiKey).
- A deterministic `__schema` output for introspection.

It is not “universal OpenAPI support” yet. See “Limitations” for important gaps.

## Install

```bash
bun install
```

## Quickstart

Inspect what commands will be generated:

```bash
bunx specli exec ./fixtures/openapi.json __schema
```

Machine-readable schema output:

```bash
bunx specli exec ./fixtures/openapi.json __schema --json
```

Minimal schema output (best for large specs):

```bash
bunx specli exec ./fixtures/openapi.json __schema --json --min
```

Run a generated operation:

```bash
bunx specli exec ./fixtures/openapi.json contacts list --oc-curl
```

## Build a Standalone Executable

Use the `compile` command to create a standalone binary with the spec embedded:

```bash
# compile with auto-derived name (from spec title)
bunx specli compile ./path/to/openapi.yaml
# → ./dist/my-api (derived from info.title)

# compile with explicit name
bunx specli compile ./path/to/openapi.yaml --name myapi
# → ./dist/myapi

# cross-compile (example: linux x64)
bunx specli compile https://api.vercel.com/copper/_openapi.json --target bun-linux-x64 --outfile ./dist/copper-linux

# disable runtime config loading for deterministic behavior
bunx specli compile ./path/to/openapi.yaml --no-dotenv --no-bunfig

# bake in defaults (these become default flags; runtime flags override)
bunx specli compile https://api.vercel.com/copper/_openapi.json \
  --name copper \
  --server https://api.vercel.com \
  --auth VercelOidc
```

The compiled binary is a root CLI - no `specli` prefix needed:

```bash
./dist/copper contacts list
./dist/copper users get abc123 --json
```

Notes:

- The spec is embedded at compile-time using a Bun macro.
- If `--name` is not provided, it is derived from the OpenAPI `info.title` or URL hostname.
- Runtime flags (e.g., `--server`) override baked-in defaults.

## CLI Shape

specli generates commands of the form:

```
specli <resource> <action> [...positionals] [options]
```

- `resource` comes from `tags[0]`, `operationId` prefix, or the first path segment (heuristics).
- `action` is inferred from HTTP method + “has id in path”, or from `operationId` suffix.
- Name collisions are disambiguated deterministically by suffixing the action name.

Use `__schema` to see the planned mapping for your spec.

## Global Options

Available on the root command:

- `--spec <urlOrPath>`: OpenAPI URL or file path (only needed for compiled binaries to override embedded spec)
- `--server <url>`: override server/base URL
- `--server-var <name=value>`: server URL template variable (repeatable)
- `--profile <name>`: profile name (config under `~/.config/specli`)

Auth selection + credentials:

- `--auth <scheme>`: pick an auth scheme by key
- `--bearer-token <token>`: set `Authorization: Bearer <token>`
- `--oauth-token <token>`: alias of `--bearer-token`
- `--username <username>` / `--password <password>`: basic auth
- `--api-key <key>`: value for apiKey auth

Output mode:

- `--json`: machine-readable output (never prints stack traces)

## Per-Operation Common Options

Every generated operation command includes:

- `--header <header>` (repeatable): extra headers; accepts `Name: Value` or `Name=Value`
- `--accept <type>`: override `Accept` header
- `--timeout <ms>`: request timeout in milliseconds
- `--dry-run`: print the request that would be sent (no network call)
- `--curl`: print an equivalent `curl` command (no network call)

For operations with `requestBody`, it also includes:

- `--data <data>`: inline request body
- `--file <path>`: read request body from a file
- `--content-type <type>`: override `Content-Type` (defaults from OpenAPI)

## Parameter Mapping

### Path Parameters

OpenAPI parameters where `in: path` become positional arguments.

- Order is derived from the path template: `/users/{id}/keys/{key_id}` becomes `<id> <key-id>`.
- Values are URL-encoded when applied to the path.

### Query / Header / Cookie Parameters

OpenAPI parameters where `in: query|header|cookie` become flags.

Flag name rules:

- `--${kebabCase(parameter.name)}`
- Examples:
  - `limit` -> `--limit`
  - `X-Request-Id` -> `--x-request-id`

Required flags:

- If the spec says `required: true`, the CLI flag is marked required (Commander enforces this).

Type coercion:

- `string` -> string
- `integer` -> `parseInt`
- `number` -> `Number(...)`
- `boolean` -> flag presence (no value)
- `object` -> JSON object literal string, parsed via `JSON.parse`
- `array` -> see below

### Arrays (Improved UX)

Array parameters are treated as repeatable flags and appended to the query string.

All of these become `?tag=a&tag=b`:

```bash
specli ... --tag a --tag b
specli ... --tag a,b
specli ... --tag '["a","b"]'
```

Implementation notes:

- The query string is built with repeated keys (`URLSearchParams.append`).
- Array item types are derived from `schema.items.type` when present (e.g. integer arrays validate and coerce correctly).

## Request Bodies

### Selecting the Body Input

If an operation has a `requestBody`, you may provide a body via:

- `--data <string>`
- `--file <path>`
- Expanded `--body-*` flags (JSON-only; see below)

Rules:

- `--data` and `--file` are mutually exclusive.
- Expanded `--body-*` flags cannot be used with `--data` or `--file`.
- If `requestBody.required` is true and you provide none of the above, the command fails with:
  - `Missing request body. Provide --data, --file, or --body-* flags.`

### Content-Type

`Content-Type` is chosen as:

1. `--content-type` (explicit override)
2. The preferred content type derived from the OpenAPI requestBody (prefers `application/json` when present)

### JSON Parsing + Normalization

If the selected `Content-Type` includes `json`:

- `--data`/`--file` content is parsed as either JSON or YAML
- the request is sent as normalized JSON (`JSON.stringify(parsed)`)

If `Content-Type` does not include `json`:

- the body is treated as a raw string

### Schema Validation (Ajv)

specli uses Ajv (best-effort, `strict: false`) to validate:

- query/header/cookie params
- JSON request bodies when a requestBody schema is available

Validation errors are formatted into a readable multiline message. For `required` errors, the message is normalized to:

- `/<path> missing required property '<name>'`

### Expanded JSON Body Flags (`--body-*`)

When an operation has a `requestBody` and the preferred schema is a JSON object with scalar properties, specli generates convenience flags:

- For `string|number|integer`: `--body-<prop> <value>`
- For `boolean`: `--body-<prop>` (presence sets it to `true`)

Example (from `fixtures/openapi-body.json`):

```bash
bunx specli exec ./fixtures/openapi-body.json contacts create --body-name "Ada" --oc-curl
```

Produces a JSON body:

```json
{"name":"Ada"}
```

Notes / edge cases:

- Expanded flags are only supported for JSON bodies. If you try to use them without a JSON content type, specli errors.
- Required fields in the schema are checked in a “friendly” way for expanded flags:
  - `Missing required body field 'name'. Provide --body-name or use --data/--file.`
- Numeric coercion uses `Number(...)` / `parseInt(...)`. Today it does not explicitly reject `NaN` (this is an area to harden).

## Servers

specli resolves the request base URL in this order:

1. `--server <url>`
2. profile `server` (if `--profile` is set and the profile has a server)
3. the first `servers[0].url` in the OpenAPI spec

If the chosen server URL has template variables (e.g. `https://{region}.api.example.com`):

- Provide `--server-var region=us-east-1` (repeatable)
- If the spec defines a default for that variable, it is used automatically

## Authentication

### Supported Scheme Kinds

From `components.securitySchemes`, specli recognizes:

- HTTP bearer (`type: http`, `scheme: bearer`)
- HTTP basic (`type: http`, `scheme: basic`)
- API key (`type: apiKey`, `in: header|query|cookie`)
- OAuth2 (`type: oauth2`) (treated as bearer token injection)
- OpenID Connect (`type: openIdConnect`) (treated as bearer token injection)

### Selecting an Auth Scheme

Scheme selection happens in this order:

1. `--auth <scheme>` (explicit)
2. profile `authScheme` (only if that key exists in the current spec)
3. if the operation requires exactly one scheme, it is chosen
4. if the spec defines exactly one scheme total, it is chosen

This “only if present in current spec” behavior prevents accidental auth leakage between different specs.

### Providing Credentials

Bearer-like schemes (`http-bearer`, `oauth2`, `openIdConnect`):

- `--bearer-token <token>` or `--oauth-token <token>`
- or a profile token stored via `specli auth token ...`

Basic auth:

- `--username <username>` and `--password <password>`

API key:

- `--api-key <key>` (injected into the header/query/cookie location declared by the scheme)

## Profiles (Non-Interactive)

Profiles are for automation.

Config file:

- Read preference: `~/.config/specli/profiles.json`, else `~/.config/specli/profiles.yaml` if present
- Writes always go to: `~/.config/specli/profiles.json`

Secrets:

- Tokens are stored in Bun’s secrets store (`bun.secrets`) under a spec-scoped service name.

Commands:

```bash
specli profile list
specli profile set --name dev --server https://api.example.com --auth bearerAuth --default
specli profile use --name dev
specli profile rm --name dev

specli auth token --name dev --set "..."
specli auth token --name dev --get
specli auth token --name dev --delete
```

## Output Behavior

### Default (Human + Agent Readable)

- On success:
  - if response `content-type` includes `json`, prints pretty JSON
  - otherwise prints raw text
- On non-2xx HTTP:
  - prints `HTTP <status>` and response body
  - exits with code 1
- On CLI/validation errors:
  - prints `error: <message>`
  - exits with code 1

### `--json` (Machine Readable)

- On success:
  - if response is JSON, prints the parsed JSON
  - otherwise prints the raw string
- With `--status` and/or `--headers`, wraps output:

```json
{ "status": 200, "headers": { "content-type": "..." }, "body": ... }
```

- On non-2xx HTTP:

```json
{ "status": 404, "body": ..., "headers": { ... } }
```

- On CLI/validation errors:

```json
{ "error": "..." }
```

### `--curl`

Prints an equivalent curl invocation without sending the request.

### `--dry-run`

Prints the method, URL, headers, and body that would be sent without sending the request.

## `__schema`

`specli __schema` reports:

- OpenAPI title/version
- spec source + computed spec id + fingerprint
- servers/auth schemes counts
- list of normalized operations
- planned command mapping

Flags:

- `--json`: JSON output
- `--pretty`: pretty JSON
- `--min`: minimal schema payload (commands + metadata only)

## Recommended Public Specs to Test

A good “real world” smoke test matrix includes:

1. Vercel API (OpenAPI 3.x)
   - URL: `https://api.vercel.com/copper/_openapi.json`
   - Focus: real-world parameter naming collisions (e.g. `accept`), large-ish spec

2. GitHub REST API (OpenAPI 3.1, very large)
   - URL (huge): `https://raw.githubusercontent.com/github/rest-api-description/main/descriptions-next/api.github.com/api.github.com.json`
   - Focus: size, OAS 3.1, many endpoints, varied parameter shapes

3. DigitalOcean API (OpenAPI 3.0)
   - URL: `https://raw.githubusercontent.com/digitalocean/openapi/main/specification/DigitalOcean-public.v2.yaml`
   - Focus: big spec + deref cycles, request bodies, auth schemes

4. Stripe API (OpenAPI 3.x, very complex schemas)
   - URL: `https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.yaml`
   - Focus: very heavy schema usage (`anyOf`, large components)

Smoke harness:

- Run the built-in smoke script:

```bash
bun run smoke:specs
```

Or run ad-hoc smoke tests:

```bash
bunx specli exec <URL> __schema --json --min > /dev/null
bunx specli exec <URL> <some-resource> <some-action> --oc-curl
```

Note: Kubernetes publishes a Swagger 2.0 document (`swagger.json`) which is not OpenAPI 3.x. specli currently expects `openapi: "3.x"` and will reject Swagger 2.0 specs.

## Limitations (Important)

specli is intentionally v1-simple; common gaps for real-world specs:

- OpenAPI 3.x only (Swagger 2.0 not supported).
- Parameter serialization is simplified:
  - arrays are always encoded as repeated keys (`?tag=a&tag=b`)
  - does not implement OpenAPI `style` / `explode` / deepObject / etc.
- Array item types are not tracked yet (arrays treated as string arrays for coercion).
- Request body convenience flags only support “simple object with scalar properties”.
- Multipart, binary uploads, and file/form modeling are not implemented.
- `Content-Type`/`Accept` negotiation is basic (string includes checks for `json`).
- OAuth2 flows are not implemented (token acquisition is out of scope); oauth2 is treated as bearer token injection.

## Development

Scripts:

- `bun run lint` (Biome CI)
- `bun run typecheck` (tsgo)
- `bun test`

Repo entry points:

- `cli.ts`: main CLI entry with `exec` and `compile` subcommands
- `src/compiled.ts`: entry point for compiled binaries (embedded spec via Bun macro)

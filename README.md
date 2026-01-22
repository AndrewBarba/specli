# specli

Turn any OpenAPI spec into a CLI.

## Install

```bash
npm install -g specli
```

Or use directly with npx/bunx:

```bash
npx specli exec ./openapi.json __schema
bunx specli exec ./openapi.json __schema
```

## Commands

### exec

Run commands dynamically from any OpenAPI spec URL or file path. Works with both Node.js and Bun.

```bash
specli exec <spec> <resource> <action> [args...] [options]
```

**Examples:**

```bash
# Inspect available commands
specli exec ./openapi.json __schema

# Machine-readable schema output
specli exec ./openapi.json __schema --json

# Minimal schema (best for large specs)
specli exec ./openapi.json __schema --json --min

# Run an operation
specli exec ./openapi.json users list

# Run with path parameters
specli exec ./openapi.json users get abc123

# Preview the curl command without executing
specli exec ./openapi.json users list --curl

# Dry run (show request details without executing)
specli exec ./openapi.json users list --dry-run
```

### compile

Bundle an OpenAPI spec into a standalone executable. **Requires Bun.**

```bash
specli compile <spec> [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `--name <name>` | Binary name (default: derived from spec title) |
| `--outfile <path>` | Output path (default: `./dist/<name>`) |
| `--target <target>` | Cross-compile target (e.g. `bun-linux-x64`) |
| `--minify` | Enable minification |
| `--bytecode` | Enable bytecode compilation |
| `--no-dotenv` | Disable .env autoload |
| `--no-bunfig` | Disable bunfig.toml autoload |
| `--server <url>` | Bake in a default server URL |
| `--server-var <k=v>` | Bake in server variables (repeatable) |
| `--auth <scheme>` | Bake in default auth scheme |

**Examples:**

```bash
# Compile with auto-derived name
specli compile ./openapi.yaml
# Creates: ./dist/my-api

# Compile with explicit name
specli compile ./openapi.yaml --name myapi
# Creates: ./dist/myapi

# Cross-compile for Linux
specli compile ./openapi.json --target bun-linux-x64 --outfile ./dist/myapi-linux

# Bake in defaults
specli compile https://api.example.com/openapi.json \
  --name myapi \
  --server https://api.example.com \
  --auth BearerAuth
```

The compiled binary works standalone:

```bash
./dist/myapi users list
./dist/myapi users get abc123 --json
```

## CLI Shape

specli generates commands of the form:

```
<resource> <action> [...positionals] [options]
```

- **resource**: Derived from `tags[0]`, `operationId` prefix, or first path segment
- **action**: Inferred from HTTP method or `operationId` suffix
- Name collisions are disambiguated automatically

Use `__schema` to see the command mapping for any spec.

## Global Options

| Option | Description |
|--------|-------------|
| `--server <url>` | Override server/base URL |
| `--server-var <name=value>` | Server URL template variable (repeatable) |
| `--profile <name>` | Profile name |
| `--auth <scheme>` | Select auth scheme by key |
| `--bearer-token <token>` | Set `Authorization: Bearer <token>` |
| `--oauth-token <token>` | Alias for `--bearer-token` |
| `--username <user>` | Basic auth username |
| `--password <pass>` | Basic auth password |
| `--api-key <key>` | API key value |
| `--json` | Machine-readable output |

## Per-Operation Options

Every operation command includes:

| Option | Description |
|--------|-------------|
| `--header <header>` | Extra headers (repeatable, `Name: Value` or `Name=Value`) |
| `--accept <type>` | Override `Accept` header |
| `--timeout <ms>` | Request timeout in milliseconds |
| `--dry-run` | Print request details without sending |
| `--curl` | Print equivalent curl command without sending |

For operations with request bodies:

| Option | Description |
|--------|-------------|
| `--data <data>` | Inline request body |
| `--file <path>` | Read request body from file |
| `--content-type <type>` | Override `Content-Type` |

## Parameters

### Path Parameters

Path parameters become positional arguments in order:

```
/users/{id}/keys/{key_id}  →  <id> <key-id>
```

### Query/Header/Cookie Parameters

These become kebab-case flags:

```
limit        → --limit
X-Request-Id → --x-request-id
```

Required parameters are enforced by the CLI.

### Arrays

Array parameters are repeatable:

```bash
# All produce ?tag=a&tag=b
specli ... --tag a --tag b
specli ... --tag a,b
specli ... --tag '["a","b"]'
```

## Request Bodies

### Body Field Flags

For JSON request bodies, specli generates convenience flags matching schema properties:

```bash
specli exec ./openapi.json contacts create --name "Ada" --email "ada@example.com"
```

Produces:

```json
{"name":"Ada","email":"ada@example.com"}
```

### Nested Objects

Use dot notation for nested properties:

```bash
mycli contacts create --name "Ada" --address.city "NYC" --address.zip "10001"
```

Produces:

```json
{"name":"Ada","address":{"city":"NYC","zip":"10001"}}
```

## Servers

Server URL resolution order:

1. `--server <url>` flag
2. Profile `server` setting
3. First `servers[0].url` in the spec

For templated URLs (e.g. `https://{region}.api.example.com`):

```bash
specli ... --server-var region=us-east-1
```

## Authentication

### Supported Schemes

- HTTP Bearer (`type: http`, `scheme: bearer`)
- HTTP Basic (`type: http`, `scheme: basic`)
- API Key (`type: apiKey`, `in: header|query|cookie`)
- OAuth2 (`type: oauth2`) - treated as bearer token
- OpenID Connect (`type: openIdConnect`) - treated as bearer token

### Scheme Selection

1. `--auth <scheme>` flag (explicit)
2. Profile `authScheme` setting
3. If operation requires exactly one scheme, use it
4. If spec defines exactly one scheme, use it

### Providing Credentials

```bash
# Bearer/OAuth2/OIDC
specli ... --bearer-token <token>

# Basic auth
specli ... --username <user> --password <pass>

# API key
specli ... --api-key <key>
```

## Profiles

Store configuration for automation:

```bash
# List profiles
specli profile list

# Create/update profile
specli profile set --name dev --server https://api.example.com --auth bearerAuth --default

# Switch default profile
specli profile use --name dev

# Delete profile
specli profile rm --name dev

# Manage tokens
specli auth token --name dev --set "..."
specli auth token --name dev --get
specli auth token --name dev --delete
```

Config location: `~/.config/specli/profiles.json`

## Output Modes

### Default (Human Readable)

- Success: Pretty JSON for JSON responses, raw text otherwise
- HTTP errors: `HTTP <status>` + response body, exit code 1
- CLI errors: `error: <message>`, exit code 1

### --json (Machine Readable)

```json
// Success
{"status":200,"body":{...}}

// HTTP error
{"status":404,"body":{...}}

// CLI error
{"error":"..."}
```

### --curl

Prints equivalent curl command without sending the request.

### --dry-run

Prints method, URL, headers, and body without sending.

## AI SDK Integration

specli exports an AI SDK tool for use with LLM agents:

```typescript
import { specli } from "specli/ai/tools";
import { generateText } from "ai";

const result = await generateText({
  model: yourModel,
  tools: {
    api: await specli({
      spec: "https://api.example.com/openapi.json",
      bearerToken: process.env.API_TOKEN,
    }),
  },
  prompt: "List all users",
});
```

The `specli()` function is async and fetches the OpenAPI spec upfront, so the returned tool is ready to use immediately without any additional network requests.

The tool supports three commands:
- `list` - Show available resources and actions
- `help` - Get details about a specific action
- `exec` - Execute an API call

## Limitations

- OpenAPI 3.x only (Swagger 2.0 not supported)
- Array serialization uses repeated keys only (`?tag=a&tag=b`)
- OpenAPI `style`/`explode`/deepObject not implemented
- Body field flags only support JSON with scalar/nested object properties
- Multipart and binary uploads not implemented
- OAuth2 token acquisition not implemented (use `--bearer-token` with pre-acquired tokens)

## Development

```bash
bun install
bun run build
bun test
bun run lint
bun run typecheck
```

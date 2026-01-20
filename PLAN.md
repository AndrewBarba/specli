# OpenCLI Planning Document

## Goal
OpenCLI turns an OpenAPI spec (3.0 or 3.1) into a non-interactive, highly-discoverable CLI suitable for automation and AI agents.

Example mapping:
- `GET /contacts` -> `opencli contacts list`
- `GET /contacts/{id}` -> `opencli contacts get <id>`

The CLI must work in two modes:
- Runtime mode: `opencli exec <url|path> ...`
- Standalone mode (compiled executable): `opencli compile <url|path>` embeds the spec at build time

## Design Principles
- Deterministic: given the same spec + config, command names and flags are stable.
- Discoverable: `--help` is comprehensive and generated from the spec.
- Script-first: output defaults should be machine-friendly; no prompts.
- Flexible naming: supports both REST-style paths and RPC-style operation naming.
- Extensible: supports new OpenAPI versions and naming strategies without rewrites.

## Non-Goals (v1)
- Interactive flows (prompts, wizards).
- Full code generation of a bespoke CLI per API (v1 is runtime generation; standalone is packaging + embedding).
- Perfect coverage of all JSON Schema edge-cases in flag expansion (support will be iterative).

## Entry Points

### 1) Runtime / "exec" entry
Intent: run the package directly and point it at a spec.

Command:
- `opencli exec https://example.com/openapi.json contacts list`

Notes:
- In Bun ecosystems, `bunx opencli ...` is the direct equivalent of `npx opencli ...`.
- We can publish a `bin` that runs under Bun (`#!/usr/bin/env bun`) assuming Bun is installed.

### 2) Standalone compiled entry
Intent: ship a single executable that contains the spec.

Build:
- `opencli compile <spec> --name myapi`

Behavior:
- Default spec comes from an embedded module generated at build time via Bun macro.
- Still allow overriding spec at runtime (`--spec`) for debugging unless explicitly disabled.
- The compiled binary name becomes the CLI root (e.g., `./dist/myapi contacts list`).

## High-Level Architecture

### Modules
- `SpecLoader`
  - Accepts `--spec` (URL or file path) or `embeddedSpec`.
  - Produces a fully dereferenced OpenAPI document.
  - Produces a fingerprint (hash) for caching and diagnostics.

- `OperationIndex`
  - Flattens the OpenAPI doc into a list of normalized operations:
    - `method`, `path`, `operationId`, `tags`, `summary`, `description`
    - `parameters` (path/query/header/cookie)
    - `requestBody` (content types, schemas)
    - `responses` (optional for future output formatting)
    - `security` requirements

- `CommandPlanner` (naming + command tree)
  - Converts operations into a command tree:
    - `resource` (plural, kebab-case)
    - `action` (list/get/create/update/delete for REST; parsed names for RPC)
    - positional args (path params)
    - flags (query/header/body)
  - Handles collisions with stable disambiguation.

- `ArgDeriver`
  - Produces a CLI argument schema from each operation:
    - path params -> required positionals
    - query params -> flags
    - headers -> flags or generic `--header`
    - body -> fully expanded flags + `--data` / `--file`
  - Supports validation and helpful error messages.

- `Runner`
  - Builds the HTTP request from parsed args:
    - server/base URL resolution
    - auth injection
    - query serialization
    - body serialization
  - Executes via `fetch`.
  - Formats output.

- `AuthManager` / `ProfileStore`
  - First-class auth derived from `components.securitySchemes`.
  - Stores credentials in system keychain via `import { secrets } from "bun"`.
  - Supports multiple profiles and selection via `--profile`.

### External Libraries (initial)
- `commander`: dynamic commands + good help
- `@apidevtools/swagger-parser`: load, validate, dereference `$ref`
- `openapi-types`: TS types for OpenAPI 3.x
- `ajv` + `ajv-formats`: validate query/body against schema (best-effort across 3.0/3.1)

## OpenAPI 3.0 vs 3.1 Support

### Strategy
- Parse and dereference both versions using Swagger Parser.
- Normalize schema handling behind a small internal interface so we can evolve support.

Key differences (relevant to us):
- OpenAPI 3.1 aligns more closely with modern JSON Schema (2020-12).
- OpenAPI 3.0 uses a schema dialect closer to older drafts and has some OpenAPI-specific constraints.

Pragmatic v1 approach:
- Use schema traversal primarily for:
  - flag generation (types, required fields, enums)
  - basic validation (required, type checking, enum)
- Implement deep JSON Schema semantics incrementally (oneOf/anyOf/allOf, discriminators).

## Command Naming Rules

### Resource (group) naming
Goal: always end up with a plural, kebab-case resource name.

Primary sources (in priority order):
1) Config overrides (future: `opencli.config.json`)
2) `tags[0]` when tags exist and are not generic
3) `operationId` namespace prefix when it looks RPC-ish:
   - `Contacts.List` -> resource `contacts`
4) Path first segment for REST-ish endpoints:
   - `/contacts/{id}` -> `contacts`

Pluralization:
- Normalize to plural even if spec uses singular:
  - `/contact/{id}` -> resource `contacts`
- Use a small pluralization utility (English rules + irregular map).
- Allow overrides for weird domains (e.g. `people`, `metadata`).

### Action naming
REST-ish defaults:
- `GET /resource` -> `list`
- `POST /resource` -> `create`
- `GET /resource/{id}` -> `get`
- `PUT/PATCH /resource/{id}` -> `update`
- `DELETE /resource/{id}` -> `delete`

RPC-ish defaults:
- Prefer parsed suffix from `operationId` or last path segment:
  - `Contacts.List` -> action `list`
  - `Contacts.Retrieve` -> action `get` (canonicalize to REST verbs when it maps cleanly)
- If no good name exists, fall back to HTTP method.

Collision handling:
- If multiple operations map to the same `resource action`, disambiguate deterministically by:
  1) adding a stable qualifier from the path (`contacts list-by-company`)
  2) else adding a suffix derived from `operationId`

## Argument Derivation Rules

### Path params
- Required positional args, in path order.
- Use param name directly: `contacts get <id>`.

### Query params
- Flags in kebab-case.
- Required query params are marked required in help and validated.

### Header params
- Provide a generic `--header "Name: Value"` (repeatable).
- Also generate first-class flags for declared header params when safe.

### Request body
Support both:
1) Fully expanded flags derived from JSON schema
   - Namespace by default to avoid collisions:
     - `--body-name`, `--body-address-city`
   - If a spec is simple, consider a future option to un-prefix.
2) Escape hatches
   - `--data <json>` for inline JSON
   - `--file <path>` for JSON/YAML file

Complex schemas:
- For `oneOf/anyOf/allOf`, generate help guidance and prefer `--data/--file` until richer support is implemented.

## Auth and Profiles

### Discovering auth
- Read `components.securitySchemes` and `security` requirements.
- Generate top-level auth flags based on supported schemes:
  - HTTP bearer: `--bearer-token`
  - HTTP basic: `--username`, `--password` (password via keychain/profile)
  - API key: `--api-key` plus location awareness (header/query)
  - OAuth2: start with token-based usage; full auth-code flow can come later

### Profiles
- `opencli auth login --profile <name> ...`
- `opencli auth logout --profile <name>`
- `opencli auth whoami --profile <name>` (optional)

Storage:
- Use Bun keychain: `import { secrets } from "bun"`.
- Store only identifiers and non-sensitive config on disk (profile names, server URL).
- Store secrets (tokens, passwords, client secrets) in keychain.

Invocation:
- `--profile <name>` selects credentials and default server.
- Explicit flags override profile.

## Output
- Default: JSON pretty print to stdout.
- `--json`: raw JSON (no extra formatting).
- `--status`: include HTTP status code.
- `--headers`: include response headers.
- `--dry-run` or `--curl`: print the request without sending.

Errors:
- Non-2xx exits with non-zero code.
- Error output goes to stderr and is structured when `--json` is set.

## Discoverability for Agents

In addition to `--help`, provide a machine-readable schema:
- `opencli __schema --json`
  - Prints command tree, operations, args, flags, types, required, enums.
  - Includes the underlying `method` + `path` mapping.

This enables agents to plan calls without scraping help text.

## Configuration
- Global flags:
  - `--spec <url|path>`
  - `--server <url>`
  - `--profile <name>`
  - `--json`, `--dry-run`, `--headers`, `--status`, `--verbose`

Future:
- `opencli.config.json` to override naming, pluralization, and grouping.

## Implementation Phases

Phase 1: Skeleton and spec loading
- Load and dereference OpenAPI (local + remote).
- Build operation index.
- Print debug view / `__schema`.

Phase 2: Naming + command tree
- Implement REST + RPC naming heuristics.
- Implement pluralization normalization.
- Implement collision strategy.

Phase 3: Argument derivation
- Path + query + headers.
- Request body `--data` / `--file`.
- Basic schema-walk expansion for `object` with scalar props.

Phase 4: Runner
- Server selection.
- Request construction and fetch.
- Output formatting + exit codes.

Phase 5: Auth + profiles
- Parse security schemes.
- Implement `auth` subcommands.
- Keychain-backed secret storage.

Phase 6: Standalone bundling
- Add `compile` command with Bun macro-based spec embedding.
- Document build steps.

## Testing
- Use `bun test`.
- Focus on deterministic unit tests for:
  - naming heuristics (REST and RPC)
  - pluralization edge cases
  - arg derivation from schemas
  - auth scheme parsing
- Add small fixture specs (minimal REST, minimal RPC, mixed).

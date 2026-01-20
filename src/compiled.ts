#!/usr/bin/env bun

import { main } from "./cli/main.ts";
import { env, envRequired } from "./macros/env.ts" with { type: "macro" };
import { loadSpec } from "./macros/spec.ts" with { type: "macro" };

// This entrypoint is intended to be compiled.
// The spec is embedded via Bun macro at bundle-time.
const embeddedSpecText = await loadSpec(envRequired("OPENCLI_EMBED_SPEC"));

// CLI name is also embedded at bundle-time.
const cliName = env("OPENCLI_CLI_NAME");

// Use embedded `execArgv` as default CLI args.
// We insert them before user-provided args so user flags win.
const argv = [
	process.argv[0] ?? cliName ?? "opencli",
	process.argv[1] ?? cliName ?? "opencli",
	...(process.execArgv ?? []),
	...process.argv.slice(2),
];

await main(argv, { embeddedSpecText, cliName });

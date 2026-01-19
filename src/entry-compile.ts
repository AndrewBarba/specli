#!/usr/bin/env bun

import { main } from "./cli/main.ts";

// This constant is injected at build time by `src/compile.ts` using Bun.build({ define }).
// It must be a valid string literal after replacement.
declare const OPENCLI_EMBED_SPEC_TEXT: string;

// Use embedded `execArgv` as default CLI args.
// We insert them before user-provided args so user flags win.
const argv = [
	process.argv[0] ?? "opencli",
	process.argv[1] ?? "opencli",
	...(process.execArgv ?? []),
	...process.argv.slice(2),
];

await main(argv, { embeddedSpecText: OPENCLI_EMBED_SPEC_TEXT });

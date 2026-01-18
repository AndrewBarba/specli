#!/usr/bin/env bun

import { main } from "./cli/main.ts";
import { loadOpenApiSpecTextFromEnv } from "./macros/load-openapi.ts" with {
	type: "macro",
};

// NOTE:
// - This is the standalone entry point intended for `bun build --compile`.
// - The macro runs at bundle-time and inlines the returned spec text.
// - The spec location must be statically known at bundle-time.
//
// Update this string as part of your build pipeline.
const embeddedSpecText = await loadOpenApiSpecTextFromEnv({
	// At bundle-time, Bun macros can read environment variables.
	// This keeps the callsite arguments static (macro requirement) while letting
	// your build pipeline choose the spec via env.
	//
	// Example:
	//   OPENCLI_EMBED_SPEC=./path/to/openapi.yaml bun build --compile ./src/entry-bundle.ts
	env: "OPENCLI_EMBED_SPEC",
	fallbackSpec: "./fixtures/openapi.json",
});

await main(process.argv, { embeddedSpecText });

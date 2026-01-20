#!/usr/bin/env bun

import { main } from "./cli/main.ts";
import { env, envRequired } from "./macros/env.ts" with { type: "macro" };
import { loadSpec } from "./macros/spec.ts" with { type: "macro" };

// This entrypoint is intended to be compiled.
// All values are embedded via Bun macros at bundle-time.
const embeddedSpecText = await loadSpec(envRequired("SPECLI_SPEC"));
const cliName = env("SPECLI_NAME");
const server = env("SPECLI_SERVER");
const serverVars = env("SPECLI_SERVER_VARS");
const auth = env("SPECLI_AUTH");

await main(process.argv, {
	embeddedSpecText,
	cliName,
	server,
	serverVars: serverVars ? serverVars.split(",") : undefined,
	auth,
});

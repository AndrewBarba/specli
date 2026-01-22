#!/usr/bin/env bun

import { main } from "./cli/main.js";
import { env, envRequired } from "./macros/env.js" with { type: "macro" };
import { loadSpec } from "./macros/spec.js" with { type: "macro" };
import { version } from "./macros/version.js" with { type: "macro" };

// This entrypoint is intended to be compiled.
// All values are embedded via Bun macros at bundle-time.
const embeddedSpecText = await loadSpec(envRequired("SPECLI_SPEC"));
const cliName = env("SPECLI_NAME");
const server = env("SPECLI_SERVER");
const serverVars = env("SPECLI_SERVER_VARS");
const auth = env("SPECLI_AUTH");
const embeddedVersion = version();

await main(process.argv, {
	embeddedSpecText,
	cliName,
	server,
	serverVars: serverVars ? serverVars.split(",") : undefined,
	auth,
	version: embeddedVersion,
});

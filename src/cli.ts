#!/usr/bin/env node

import { Command } from "commander";

function collect(value: string, previous: string[] = []): string[] {
	return previous.concat([value]);
}

const program = new Command();

program.name("specli").description("Generate CLIs from OpenAPI specs");

// ─────────────────────────────────────────────────────────────
// exec command - runs spec dynamically (works in both Bun and Node.js)
// ─────────────────────────────────────────────────────────────
program
	.command("exec <spec>")
	.description("Execute commands from an OpenAPI spec")
	.option("--server <url>", "Override server/base URL")
	.option(
		"--server-var <name=value>",
		"Server variable (repeatable)",
		collect,
		[],
	)
	.option("--auth <scheme>", "Select auth scheme")
	.option("--bearer-token <token>", "Bearer token")
	.option("--oauth-token <token>", "OAuth token")
	.option("--username <username>", "Basic auth username")
	.option("--password <password>", "Basic auth password")
	.option("--api-key <key>", "API key value")
	.option("--profile <name>", "Profile name")
	.option("--json", "Machine-readable output")
	.allowUnknownOption()
	.allowExcessArguments()
	.action(async (spec, options, command) => {
		const { execCommand } = await import("./cli/exec.js");
		await execCommand(spec, options, command.args);
	});

// ─────────────────────────────────────────────────────────────
// compile command - creates standalone binary (Bun only)
// ─────────────────────────────────────────────────────────────
program
	.command("compile <spec>")
	.description(
		"Compile an OpenAPI spec into a standalone CLI binary (requires Bun)",
	)
	.option("--name <name>", "Binary name (default: derived from spec)")
	.option("--outfile <path>", "Output path (default: ./dist/<name>)")
	.option("--target <target>", "Bun compile target (e.g. bun-linux-x64)")
	.option("--minify", "Enable minification")
	.option("--bytecode", "Enable bytecode compilation")
	.option("--no-dotenv", "Disable .env autoload")
	.option("--no-bunfig", "Disable bunfig.toml autoload")
	.option("--define <k=v>", "Build-time constant (repeatable)", collect, [])
	.option("--server <url>", "Default server URL (embedded)")
	.option(
		"--server-var <k=v>",
		"Default server variable (repeatable, embedded)",
		collect,
		[],
	)
	.option("--auth <scheme>", "Default auth scheme (embedded)")
	.action(async (spec, options) => {
		// Check if running in Bun
		if (typeof globalThis.Bun === "undefined") {
			console.error("Error: The 'compile' command requires Bun.");
			console.error("Install Bun: https://bun.sh");
			console.error("Then run: bunx specli compile <spec>");
			process.exit(1);
		}
		const { compileCommand } = await import("./cli/compile.js");
		await compileCommand(spec, options);
	});

await program.parseAsync(process.argv);

#!/usr/bin/env bun

import { Command } from "commander";

function collect(value: string, previous: string[] = []): string[] {
	return previous.concat([value]);
}

const program = new Command();

program.name("specli").description("Generate CLIs from OpenAPI specs");

// ─────────────────────────────────────────────────────────────
// exec command - runs spec dynamically
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
		const { execCommand } = await import("./src/cli/exec.ts");
		await execCommand(spec, options, command.args);
	});

// ─────────────────────────────────────────────────────────────
// compile command - creates standalone binary
// ─────────────────────────────────────────────────────────────
program
	.command("compile <spec>")
	.description("Compile an OpenAPI spec into a standalone CLI binary")
	.option("--name <name>", "Binary name (default: derived from spec)")
	.option("--outfile <path>", "Output path (default: ./dist/<name>)")
	.option("--target <target>", "Bun compile target (e.g. bun-linux-x64)")
	.option("--minify", "Enable minification")
	.option("--bytecode", "Enable bytecode compilation")
	.option("--no-dotenv", "Disable .env autoload")
	.option("--no-bunfig", "Disable bunfig.toml autoload")
	.option(
		"--exec-argv <arg>",
		"Embedded process.execArgv (repeatable)",
		collect,
		[],
	)
	.option("--define <k=v>", "Build-time constant (repeatable)", collect, [])
	.option("--server <url>", "Default server URL (baked in)")
	.option(
		"--server-var <k=v>",
		"Default server variable (repeatable)",
		collect,
		[],
	)
	.option("--auth <scheme>", "Default auth scheme")
	.action(async (spec, options) => {
		const { compileCommand } = await import("./src/cli/compile.ts");
		await compileCommand(spec, options);
	});

await program.parseAsync(process.argv);

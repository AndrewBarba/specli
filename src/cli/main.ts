import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command, Help } from "commander";

import { getArgValue, hasAnyArg } from "./runtime/argv.js";
import { collectRepeatable } from "./runtime/collect.js";

/**
 * Reads the version from package.json at runtime.
 * Used when running in non-compiled mode.
 */
function getPackageVersion(): string {
	try {
		const currentDir = dirname(fileURLToPath(import.meta.url));
		const packageJsonPath = join(currentDir, "../../package.json");
		const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
		return packageJson.version ?? "0.0.0";
	} catch {
		return "0.0.0";
	}
}

import { readStdinText } from "./runtime/compat.js";
import { buildRuntimeContext } from "./runtime/context.js";
import { addGeneratedCommands } from "./runtime/generated.js";
import { deleteToken, getToken, setToken } from "./runtime/profile/secrets.js";
import {
	readProfiles,
	upsertProfile,
	writeProfiles,
} from "./runtime/profile/store.js";
import { writeResult } from "./runtime/render.js";
import type { CommandResult } from "./runtime/result.js";

type MainOptions = {
	embeddedSpecText?: string;
	cliName?: string;
	server?: string;
	serverVars?: string[];
	auth?: string;
	version?: string;
};

export async function main(argv: string[], options: MainOptions = {}) {
	const program = new Command();
	const defaultHelp = new Help();

	// Get version - use embedded version if available, otherwise read from package.json
	const cliVersion = options.version ?? getPackageVersion();

	program
		.name(options.cliName ?? "specli")
		.description("Generate a CLI from an OpenAPI spec")
		.version(cliVersion, "-v, --version", "Output the version number")
		.option("--spec <urlOrPath>", "OpenAPI URL or file path")
		.option("--server <url>", "Override server/base URL")
		.option(
			"--server-var <name=value>",
			"Server URL template variable (repeatable)",
			collectRepeatable,
		)
		.option("--auth <scheme>", "Select auth scheme by key")
		.option("--bearer-token <token>", "Bearer token (Authorization: Bearer)")
		.option("--oauth-token <token>", "OAuth token (alias of bearer)")
		.option("--username <username>", "Basic auth username")
		.option("--password <password>", "Basic auth password")
		.option("--api-key <key>", "API key value")
		.option("--json", "Output as JSON")
		.showHelpAfterError();

	// If user asks for help and we have no embedded spec and no --spec, show minimal help.
	const spec = getArgValue(argv, "--spec");
	const wantsHelp = hasAnyArg(argv, ["-h", "--help"]);
	if (!spec && !options.embeddedSpecText && wantsHelp) {
		program.addHelpText(
			"after",
			"\nTo see generated commands, run with --spec <url|path>.\n",
		);
		program.parse(argv);
		return;
	}

	const ctx = await buildRuntimeContext({
		spec,
		embeddedSpecText: options.embeddedSpecText,
	});

	// Simple auth commands
	const defaultProfileName = "default";

	program
		.command("login [token]")
		.description("Store a bearer token for authentication")
		.action(async (tokenArg: string | undefined, _opts, command) => {
			const globals = command.optsWithGlobals() as { json?: boolean };

			let token = tokenArg;

			// If no token argument, try to read from stdin (for piping)
			if (!token) {
				const isTTY = process.stdin.isTTY;
				if (isTTY) {
					// Interactive mode - prompt user
					process.stdout.write("Enter token: ");
					const reader = process.stdin;
					const chunks: Buffer[] = [];
					for await (const chunk of reader) {
						chunks.push(chunk);
						// Read one line only
						if (chunk.includes(10)) break; // newline
					}
					token = Buffer.concat(chunks).toString().trim();
				} else {
					// Piped input - use cross-runtime stdin reading
					const text = await readStdinText();
					token = text.trim();
				}
			}

			if (!token) {
				const result: CommandResult = {
					type: "error",
					message:
						"No token provided. Usage: login <token> or echo $TOKEN | login",
				};
				writeResult(result, { format: globals.json ? "json" : "text" });
				return;
			}

			// Ensure default profile exists
			const file = await readProfiles();
			if (!file.profiles.find((p) => p.name === defaultProfileName)) {
				const updated = upsertProfile(file, { name: defaultProfileName });
				await writeProfiles({ ...updated, defaultProfile: defaultProfileName });
			} else if (!file.defaultProfile) {
				await writeProfiles({ ...file, defaultProfile: defaultProfileName });
			}

			await setToken(ctx.loaded.id, defaultProfileName, token);

			const result: CommandResult = {
				type: "data",
				kind: "login",
				data: { ok: true },
			};
			writeResult(result, { format: globals.json ? "json" : "text" });
		});

	program
		.command("logout")
		.description("Clear stored authentication token")
		.action(async (_opts, command) => {
			const globals = command.optsWithGlobals() as { json?: boolean };

			const deleted = await deleteToken(ctx.loaded.id, defaultProfileName);

			const result: CommandResult = {
				type: "data",
				kind: "logout",
				data: { ok: true, wasLoggedIn: deleted },
			};
			writeResult(result, { format: globals.json ? "json" : "text" });
		});

	program
		.command("whoami")
		.description("Show current authentication status")
		.action(async (_opts, command) => {
			const globals = command.optsWithGlobals() as { json?: boolean };

			const token = await getToken(ctx.loaded.id, defaultProfileName);
			const hasToken = Boolean(token);

			// Mask the token for display (show first 8 and last 4 chars)
			let maskedToken: string | undefined;
			if (token && token.length > 16) {
				maskedToken = `${token.slice(0, 8)}...${token.slice(-4)}`;
			} else if (token) {
				maskedToken = `${token.slice(0, 4)}...`;
			}

			const result: CommandResult = {
				type: "data",
				kind: "whoami",
				data: {
					authenticated: hasToken,
					maskedToken,
				},
			};
			writeResult(result, { format: globals.json ? "json" : "text" });
		});

	program
		.command("__schema")
		.description("Print indexed operations")
		.option(
			"--commands",
			"List all <resource> <action> commands (can be large)",
		)
		.action(async (_opts, command) => {
			const flags = command.optsWithGlobals() as {
				commands?: boolean;
				json?: boolean;
			};

			const schemaData = {
				title: ctx.schema.openapi.title,
				version: ctx.schema.openapi.version,
				specId: ctx.schema.spec.id,
				specSource: ctx.schema.spec.source,
				servers: ctx.servers,
				authSchemes: ctx.authSchemes,
				resources: ctx.commands.resources.map((r) => ({
					name: r.resource,
					actionCount: r.actions.length,
				})),
				cliName: program.name(),
				// Include full commands list if requested
				...(flags.commands && ctx.schema.planned?.length
					? {
							commands: ctx.schema.planned.map((op) => ({
								resource: op.resource,
								action: op.action,
								pathArgs: op.pathArgs,
							})),
						}
					: {}),
			};

			const result: CommandResult = {
				type: "data",
				kind: "schema",
				data: schemaData,
			};
			writeResult(result, { format: flags.json ? "json" : "text" });
		});

	addGeneratedCommands(program, {
		servers: ctx.servers,
		authSchemes: ctx.authSchemes,
		commands: ctx.commands,
		specId: ctx.loaded.id,
		embeddedDefaults: {
			server: options.server,
			serverVars: options.serverVars,
			auth: options.auth,
		},
	});

	program.configureHelp({
		formatHelp: (cmd, _helper) => {
			// Only customize the top-level help. Subcommands should keep
			// their own default or explicitly configured help.
			if (cmd !== program) return defaultHelp.formatHelp(cmd, defaultHelp);

			const lines: string[] = [];
			const name = program.name();
			const embedded = Boolean(options.embeddedSpecText);

			lines.push(`Usage: ${name} [options] [command]`);
			lines.push("");
			lines.push(program.description());
			lines.push("");

			// OpenAPI-derived commands first (resources)
			if (ctx.commands.resources.length > 0) {
				lines.push("OpenAPI Commands:");
				const resources = [...ctx.commands.resources]
					.map((r) => r.resource)
					.sort((a, b) => a.localeCompare(b));
				for (const r of resources) {
					lines.push(`  ${r}`);
				}
				lines.push("");
			}

			// Non-OpenAPI commands (built-ins)
			lines.push("Global Commands:");
			const globalCommands = ["login", "logout", "whoami", "__schema", "help"];
			const maxCmdLen = Math.max(...globalCommands.map((c) => c.length));
			for (const cmdName of globalCommands) {
				const c = program.commands.find((c) => c.name() === cmdName);
				if (!c) continue;
				const term =
					cmdName === "login"
						? "login [token]"
						: cmdName === "help"
							? "help [command]"
							: cmdName;
				const desc = c.description();
				const pad = " ".repeat(Math.max(1, maxCmdLen - cmdName.length + 2));
				lines.push(`  ${term}${pad}${desc}`);
			}
			lines.push("");

			// Global options last
			lines.push("Global Options:");
			const optionRows: Array<{ flags: string; desc: string }> = [];
			for (const opt of program.options) {
				// In compiled binaries the spec is embedded; --spec is meaningless.
				if (embedded && opt.long === "--spec") continue;
				optionRows.push({ flags: opt.flags, desc: opt.description });
			}
			optionRows.push({
				flags: "-h, --help",
				desc: "display help for command",
			});
			const maxOptLen = Math.max(...optionRows.map((o) => o.flags.length));
			for (const row of optionRows) {
				const pad = " ".repeat(Math.max(1, maxOptLen - row.flags.length + 2));
				lines.push(`  ${row.flags}${pad}${row.desc}`);
			}
			lines.push("");

			lines.push("Agent workflow:");
			lines.push(`  1) ${name} __schema`);
			lines.push(`  2) ${name} <resource> --help`);
			lines.push(`  3) ${name} <resource> <action> --help`);
			lines.push(`  4) ${name} <resource> <action> --curl`);
			lines.push("");

			return lines.join("\n");
		},
	});

	if (argv.length <= 2) {
		program.outputHelp();
		return;
	}

	const args = argv.slice(2);
	const flagWithValue = new Set([
		"--spec",
		"--server",
		"--server-var",
		"--auth",
		"--bearer-token",
		"--oauth-token",
		"--username",
		"--password",
		"--api-key",
	]);
	const boolFlags = new Set(["--json"]);
	const passthroughFlags = new Set(["-h", "--help", "-v", "--version"]);

	let hasSubcommand = false;
	let onlyKnownGlobals = true;
	for (let i = 0; i < args.length; i++) {
		const a = args[i];
		if (!a) continue;

		if (passthroughFlags.has(a)) break;
		if (boolFlags.has(a)) continue;
		if (flagWithValue.has(a)) {
			i++;
			continue;
		}
		if (a.startsWith("--") && a.includes("=")) {
			const key = a.slice(0, a.indexOf("="));
			if (
				!flagWithValue.has(key) &&
				!boolFlags.has(key) &&
				!passthroughFlags.has(key)
			) {
				onlyKnownGlobals = false;
			}
			continue;
		}
		if (a.startsWith("--") || a.startsWith("-")) {
			onlyKnownGlobals = false;
			continue;
		}

		hasSubcommand = true;
		break;
	}

	if (
		!hasSubcommand &&
		onlyKnownGlobals &&
		!hasAnyArg(argv, ["-h", "--help", "-v", "--version"])
	) {
		program.outputHelp();
		return;
	}

	await program.parseAsync(argv);
}

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";

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

import { stableStringify } from "./core/stable-json.js";
import { toMinimalSchemaOutput } from "./model/schema.js";
import { readStdinText } from "./runtime/compat.js";
import { buildRuntimeContext } from "./runtime/context.js";
import { addGeneratedCommands } from "./runtime/generated.js";
import { deleteToken, getToken, setToken } from "./runtime/profile/secrets.js";
import {
	readProfiles,
	upsertProfile,
	writeProfiles,
} from "./runtime/profile/store.js";

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
		.option("--json", "Machine-readable output")
		.showHelpAfterError();

	program.addHelpText(
		"after",
		`\nAgent workflow:\n  1) ${options.cliName ?? "specli"} __schema --json --min\n  2) ${options.cliName ?? "specli"} <resource> --help\n  3) ${options.cliName ?? "specli"} <resource> <action> --help\n`,
	);

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
				throw new Error(
					"No token provided. Usage: login <token> or echo $TOKEN | login",
				);
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

			if (globals.json) {
				process.stdout.write(`${JSON.stringify({ ok: true })}\n`);
				return;
			}
			process.stdout.write("ok: logged in\n");
		});

	program
		.command("logout")
		.description("Clear stored authentication token")
		.action(async (_opts, command) => {
			const globals = command.optsWithGlobals() as { json?: boolean };

			const deleted = await deleteToken(ctx.loaded.id, defaultProfileName);

			if (globals.json) {
				process.stdout.write(`${JSON.stringify({ ok: deleted })}\n`);
				return;
			}
			process.stdout.write(
				deleted ? "ok: logged out\n" : "ok: not logged in\n",
			);
		});

	program
		.command("whoami")
		.description("Show current authentication status")
		.action(async (_opts, command) => {
			const globals = command.optsWithGlobals() as { json?: boolean };

			const token = await getToken(ctx.loaded.id, defaultProfileName);
			const hasToken = Boolean(token);

			// Mask the token for display (show first 8 and last 4 chars)
			let maskedToken: string | null = null;
			if (token && token.length > 16) {
				maskedToken = `${token.slice(0, 8)}...${token.slice(-4)}`;
			} else if (token) {
				maskedToken = `${token.slice(0, 4)}...`;
			}

			if (globals.json) {
				process.stdout.write(
					`${JSON.stringify({ authenticated: hasToken, token: maskedToken })}\n`,
				);
				return;
			}

			if (hasToken) {
				process.stdout.write(`authenticated: yes\n`);
				process.stdout.write(`token: ${maskedToken}\n`);
			} else {
				process.stdout.write(`authenticated: no\n`);
				process.stdout.write(`Run 'login <token>' to authenticate.\n`);
			}
		});

	program
		.command("__schema")
		.description("Print indexed operations (machine-readable when --json)")
		.option("--pretty", "Pretty-print JSON when used with --json")
		.option("--min", "Minimal JSON output (commands + metadata only)")
		.action(async (_opts, command) => {
			const flags = command.optsWithGlobals() as {
				json?: boolean;
				pretty?: boolean;
				min?: boolean;
			};

			if (flags.json) {
				const pretty = Boolean(flags.pretty);
				const payload = flags.min
					? toMinimalSchemaOutput(ctx.schema)
					: ctx.schema;
				const text = stableStringify(payload, { space: pretty ? 2 : 0 });
				process.stdout.write(`${text}\n`);
				return;
			}

			process.stdout.write(`${ctx.schema.openapi.title ?? "(untitled)"}\n`);
			process.stdout.write(`OpenAPI: ${ctx.schema.openapi.version}\n`);
			process.stdout.write(
				`Spec: ${ctx.schema.spec.id} (${ctx.schema.spec.source})\n`,
			);
			process.stdout.write(`Fingerprint: ${ctx.schema.spec.fingerprint}\n`);
			process.stdout.write(`Servers: ${ctx.schema.servers.length}\n`);
			process.stdout.write(`Auth Schemes: ${ctx.schema.authSchemes.length}\n`);

			if (ctx.schema.planned?.length) {
				process.stdout.write(`\nCommands: ${ctx.schema.planned.length}\n\n`);
				for (const op of ctx.schema.planned) {
					const args = op.pathArgs.length
						? ` ${op.pathArgs.map((a) => `<${a}>`).join(" ")}`
						: "";
					process.stdout.write(
						`- ${program.name()} ${op.resource} ${op.action}${args}\n`,
					);
				}
			}

			process.stdout.write(
				"\nTip: explore required flags with --help at each level:\n" +
					`- ${program.name()} --help\n` +
					`- ${program.name()} <resource> --help\n` +
					`- ${program.name()} <resource> <action> --help\n`,
			);
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

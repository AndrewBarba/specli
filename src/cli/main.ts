import { Command } from "commander";

import { getArgValue, hasAnyArg } from "./runtime/argv.ts";
import { collectRepeatable } from "./runtime/collect.ts";
import { buildRuntimeContext } from "./runtime/context.ts";
import { addGeneratedCommands } from "./runtime/generated.ts";
import { deleteToken, getToken, setToken } from "./runtime/profile/secrets.ts";
import {
	getProfile,
	readProfiles,
	removeProfile,
	upsertProfile,
	writeProfiles,
} from "./runtime/profile/store.ts";
import { toMinimalSchemaOutput } from "./schema.ts";
import { stableStringify } from "./stable-json.ts";

type MainOptions = {
	embeddedSpecText?: string;
	cliName?: string;
	server?: string;
	serverVars?: string[];
	auth?: string;
};

export async function main(argv: string[], options: MainOptions = {}) {
	const program = new Command();

	program
		.name(options.cliName ?? "specli")
		.description("Generate a CLI from an OpenAPI spec")
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
		.option("--profile <name>", "Profile name (stored under ~/.config/specli)")
		.option("--json", "Machine-readable output")
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

	const profileCmd = program
		.command("profile")
		.description("Manage specli profiles");

	profileCmd
		.command("list")
		.description("List profiles")
		.action(async (_opts, command) => {
			const globals = command.optsWithGlobals() as { json?: boolean };
			const file = await readProfiles();

			const payload = {
				defaultProfile: file.defaultProfile,
				profiles: file.profiles.map((p) => ({
					name: p.name,
					server: p.server,
					authScheme: p.authScheme,
				})),
			};

			if (globals.json) {
				process.stdout.write(`${JSON.stringify(payload)}\n`);
				return;
			}

			if (payload.defaultProfile) {
				process.stdout.write(`default: ${payload.defaultProfile}\n`);
			}
			for (const p of payload.profiles) {
				process.stdout.write(`${p.name}\n`);
				if (p.server) process.stdout.write(`  server: ${p.server}\n`);
				if (p.authScheme)
					process.stdout.write(`  authScheme: ${p.authScheme}\n`);
			}
		});

	profileCmd
		.command("set")
		.description("Create or update a profile")
		.requiredOption("--name <name>", "Profile name")
		.option("--server <url>", "Default server/base URL")
		.option("--auth <scheme>", "Default auth scheme key")
		.option("--default", "Set as default profile")
		.action(async (opts, command) => {
			const globals = command.optsWithGlobals() as {
				json?: boolean;
				server?: string;
				auth?: string;
			};

			const file = await readProfiles();
			const next = upsertProfile(file, {
				name: String(opts.name),
				server:
					typeof opts.server === "string"
						? opts.server
						: typeof globals.server === "string"
							? globals.server
							: undefined,
				authScheme:
					typeof opts.auth === "string"
						? opts.auth
						: typeof globals.auth === "string"
							? globals.auth
							: undefined,
			});
			const final = opts.default
				? { ...next, defaultProfile: String(opts.name) }
				: next;
			await writeProfiles(final);

			if (globals.json) {
				process.stdout.write(
					`${JSON.stringify({ ok: true, profile: String(opts.name) })}\n`,
				);
				return;
			}
			process.stdout.write(`ok: profile ${String(opts.name)}\n`);
		});

	profileCmd
		.command("rm")
		.description("Remove a profile")
		.requiredOption("--name <name>", "Profile name")
		.action(async (opts, command) => {
			const globals = command.optsWithGlobals() as { json?: boolean };
			const file = await readProfiles();
			const removed = removeProfile(file, String(opts.name));

			const final =
				file.defaultProfile === opts.name
					? { ...removed, defaultProfile: undefined }
					: removed;

			await writeProfiles(final);

			if (globals.json) {
				process.stdout.write(
					`${JSON.stringify({ ok: true, profile: String(opts.name) })}\n`,
				);
				return;
			}

			process.stdout.write(`ok: removed ${String(opts.name)}\n`);
		});

	profileCmd
		.command("use")
		.description("Set the default profile")
		.requiredOption("--name <name>", "Profile name")
		.action(async (opts, command) => {
			const globals = command.optsWithGlobals() as { json?: boolean };
			const file = await readProfiles();
			const profile = getProfile(file, String(opts.name));
			if (!profile) throw new Error(`Profile not found: ${String(opts.name)}`);

			await writeProfiles({ ...file, defaultProfile: String(opts.name) });

			if (globals.json) {
				process.stdout.write(
					`${JSON.stringify({ ok: true, defaultProfile: String(opts.name) })}\n`,
				);
				return;
			}
			process.stdout.write(`ok: default ${String(opts.name)}\n`);
		});

	const authCmd = program.command("auth").description("Manage auth secrets");

	authCmd
		.command("token")
		.description("Set or get bearer token for a profile")
		.option("--name <name>", "Profile name (defaults to global --profile)")
		.option("--set <token>", "Set token")
		.option("--get", "Get token")
		.option("--delete", "Delete token")
		.action(async (opts, command) => {
			const globals = command.optsWithGlobals() as {
				json?: boolean;
				profile?: string;
			};

			const profileName = String(opts.name ?? globals.profile ?? "");
			if (!profileName) {
				throw new Error(
					"Missing profile name. Provide --name <name> or global --profile <name>.",
				);
			}
			if (opts.set && (opts.get || opts.delete)) {
				throw new Error("Use only one of --set, --get, --delete");
			}
			if (opts.get && opts.delete) {
				throw new Error("Use only one of --get or --delete");
			}
			if (!opts.set && !opts.get && !opts.delete) {
				throw new Error("Provide one of --set, --get, --delete");
			}

			if (typeof opts.set === "string") {
				await setToken(ctx.loaded.id, profileName, opts.set);
				if (globals.json) {
					process.stdout.write(
						`${JSON.stringify({ ok: true, profile: profileName })}\n`,
					);
					return;
				}
				process.stdout.write(`ok: token set for ${profileName}\n`);
				return;
			}

			if (opts.get) {
				const token = await getToken(ctx.loaded.id, profileName);
				if (globals.json) {
					process.stdout.write(
						`${JSON.stringify({ profile: profileName, token })}\n`,
					);
					return;
				}
				process.stdout.write(`${token ?? ""}\n`);
				return;
			}

			if (opts.delete) {
				const ok = await deleteToken(ctx.loaded.id, profileName);
				if (globals.json) {
					process.stdout.write(
						`${JSON.stringify({ ok, profile: profileName })}\n`,
					);
					return;
				}
				process.stdout.write(`ok: ${ok ? "deleted" : "not-found"}\n`);
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
			process.stdout.write(`Operations: ${ctx.schema.operations.length}\n`);

			for (const op of ctx.schema.operations) {
				const id = op.operationId ? ` (${op.operationId})` : "";
				process.stdout.write(`- ${op.method} ${op.path}${id}\n`);
			}

			if (ctx.schema.planned?.length) {
				process.stdout.write("\nPlanned commands:\n");
				for (const op of ctx.schema.planned) {
					const args = op.pathArgs.length
						? ` ${op.pathArgs.map((a) => `<${a}>`).join(" ")}`
						: "";
					process.stdout.write(`- specli ${op.resource} ${op.action}${args}\n`);
				}
			}
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

	await program.parseAsync(argv);
}

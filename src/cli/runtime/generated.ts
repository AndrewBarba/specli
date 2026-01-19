import { Command } from "commander";

import type { AuthScheme } from "../auth-schemes.ts";
import type { CommandModel } from "../command-model.ts";
import type { ServerInfo } from "../server.ts";

import { collectRepeatable } from "./collect.ts";
import { executeAction } from "./execute.ts";
import { coerceArrayInput, coerceValue } from "./validate/index.ts";

export type GeneratedCliContext = {
	servers: ServerInfo[];
	authSchemes: AuthScheme[];
	commands: CommandModel;
	specId: string;
};

export function addGeneratedCommands(
	program: Command,
	context: GeneratedCliContext,
): void {
	for (const resource of context.commands.resources) {
		const resourceCmd = program
			.command(resource.resource)
			.description(`Operations for ${resource.resource}`);

		for (const action of resource.actions) {
			const cmd = resourceCmd.command(action.action);
			cmd.description(
				action.summary ??
					action.description ??
					`${action.method} ${action.path}`,
			);

			for (const pos of action.positionals) {
				cmd.argument(`<${pos.name}>`, pos.description);
			}

			for (const flag of action.flags) {
				const opt = flag.flag;
				const desc = flag.description ?? `${flag.in} parameter`;

				if (flag.type === "boolean") {
					cmd.option(opt, desc);
					continue;
				}

				const isArray = flag.type === "array";
				const itemType = flag.itemType ?? "string";
				const parser = (raw: string) => coerceValue(raw, itemType);

				if (isArray) {
					const key = `${opt} <value>`;
					cmd.option(
						key,
						desc,
						(value: string, prev: unknown[] | undefined) => {
							const next: unknown[] = [...(prev ?? [])];

							// Allow `--tags a,b` and `--tags '["a","b"]'` to expand.
							const items = coerceArrayInput(value, itemType);
							for (const item of items) {
								next.push(item);
							}

							return next;
						},
					);
					continue;
				}

				const key = `${opt} <value>`;
				if (flag.required) cmd.requiredOption(key, desc, parser);
				else cmd.option(key, desc, parser);
			}

			const reservedFlags = new Set(action.flags.map((f) => f.flag));

			// Common curl-replacement options.
			// Some APIs have parameters like `accept`, `timeout`, etc. We always add
			// namespaced variants (`--oc-*`) and only add the short versions when they
			// do not conflict with operation flags.
			cmd
				.option(
					"--oc-header <header>",
					"Extra header (repeatable)",
					collectRepeatable,
				)
				.option("--oc-accept <type>", "Override Accept header")
				.option("--oc-status", "Include status in --json output")
				.option("--oc-headers", "Include headers in --json output")
				.option("--oc-dry-run", "Print request without sending")
				.option("--oc-curl", "Print curl command without sending")
				.option("--oc-timeout <ms>", "Request timeout in milliseconds");

			if (!reservedFlags.has("--header")) {
				cmd.option(
					"--header <header>",
					"Extra header (repeatable)",
					collectRepeatable,
				);
			}
			if (!reservedFlags.has("--accept")) {
				cmd.option("--accept <type>", "Override Accept header");
			}
			if (!reservedFlags.has("--status")) {
				cmd.option("--status", "Include status in --json output");
			}
			if (!reservedFlags.has("--headers")) {
				cmd.option("--headers", "Include headers in --json output");
			}
			if (!reservedFlags.has("--dry-run")) {
				cmd.option("--dry-run", "Print request without sending");
			}
			if (!reservedFlags.has("--curl")) {
				cmd.option("--curl", "Print curl command without sending");
			}
			if (!reservedFlags.has("--timeout")) {
				cmd.option("--timeout <ms>", "Request timeout in milliseconds");
			}

			if (action.requestBody) {
				cmd
					.option("--oc-data <data>", "Inline request body")
					.option("--oc-file <path>", "Request body from file")
					.option(
						"--oc-content-type <type>",
						"Override Content-Type (defaults from OpenAPI)",
					);

				if (!reservedFlags.has("--data")) {
					cmd.option("--data <data>", "Inline request body");
				}
				if (!reservedFlags.has("--file")) {
					cmd.option("--file <path>", "Request body from file");
				}
				if (!reservedFlags.has("--content-type")) {
					cmd.option(
						"--content-type <type>",
						"Override Content-Type (defaults from OpenAPI)",
					);
				}

				// Expanded JSON body flags (only for simple object bodies).
				const schema = action.requestBodySchema;
				if (schema && schema.type === "object" && schema.properties) {
					for (const [name, propSchema] of Object.entries(schema.properties)) {
						if (!name || typeof name !== "string") continue;
						if (!propSchema || typeof propSchema !== "object") continue;
						const t = (propSchema as { type?: unknown }).type;
						if (
							t !== "string" &&
							t !== "number" &&
							t !== "integer" &&
							t !== "boolean"
						) {
							continue;
						}

						const flagName = `--body-${name}`;
						if (t === "boolean") {
							cmd.option(flagName, `Body field '${name}'`);
						} else {
							cmd.option(`${flagName} <value>`, `Body field '${name}'`);
						}
					}
				}
			}

			// Commander passes positional args and then the Command instance as last arg.
			cmd.action(async (...args) => {
				const command = args[args.length - 1];
				const positionalValues = args.slice(0, -1).map((v) => String(v));

				if (!(command instanceof Command)) {
					throw new Error("Unexpected commander action signature");
				}

				const globals = command.optsWithGlobals();
				const local = command.opts();

				const bodyFlags: Record<string, unknown> = {};
				for (const key of Object.keys(local)) {
					if (!key.startsWith("body")) continue;
					bodyFlags[key] = local[key];
				}

				await executeAction({
					action,
					positionalValues,
					flagValues: { ...local, __body: bodyFlags },
					globals,
					servers: context.servers,
					authSchemes: context.authSchemes,
					specId: context.specId,
				});
			});
		}
	}
}

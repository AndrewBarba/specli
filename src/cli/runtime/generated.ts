import { Command } from "commander";

import type { AuthScheme } from "../auth-schemes.js";
import type { CommandAction, CommandModel } from "../command-model.js";
import type { ServerInfo } from "../server.js";

import { type BodyFlagDef, generateBodyFlags } from "./body-flags.js";
import { executeAction } from "./execute.js";
import type { EmbeddedDefaults } from "./request.js";
import { coerceArrayInput, coerceValue } from "./validate/index.js";

// Flag type from CommandAction
type CommandFlag = CommandAction["flags"][number];

/**
 * Format help output that is clear for both humans and AI agents.
 * Groups options into Required, Optional, and Global sections.
 */
function formatCustomHelp(
	cmd: Command,
	action: CommandAction,
	operationFlags: CommandFlag[],
	bodyFlagDefs: BodyFlagDef[],
): string {
	const lines: string[] = [];
	const cmdName = cmd.name();
	const parentName = cmd.parent?.name() ?? "";
	const fullCmd = parentName ? `${parentName} ${cmdName}` : cmdName;

	// Usage line
	const positionals = action.positionals.map((p) => `<${p.name}>`).join(" ");
	const usageSuffix = positionals ? ` ${positionals}` : "";
	lines.push(`Usage: ${fullCmd}${usageSuffix} [options]`);
	lines.push("");

	// Description
	const desc =
		action.summary ?? action.description ?? `${action.method} ${action.path}`;
	lines.push(desc);
	lines.push("");

	// Collect all options into categories
	const requiredOpts: string[] = [];
	const optionalOpts: string[] = [];

	// Format a single option line
	const formatOpt = (
		flag: string,
		type: string,
		desc: string,
		required: boolean,
	): string => {
		const typeStr = type === "boolean" ? "" : ` <${type}>`;
		const reqMarker = required ? " (required)" : "";
		return `  ${flag}${typeStr}${reqMarker}\n      ${desc}`;
	};

	// Operation flags (query/header/path params)
	for (const f of operationFlags) {
		const type = f.type === "array" ? `${f.itemType ?? "string"}[]` : f.type;
		const line = formatOpt(
			f.flag,
			type,
			f.description ?? `${f.in} parameter`,
			f.required,
		);
		if (f.required) {
			requiredOpts.push(line);
		} else {
			optionalOpts.push(line);
		}
	}

	// Body flags
	for (const def of bodyFlagDefs) {
		const line = formatOpt(def.flag, def.type, def.description, def.required);
		if (def.required) {
			requiredOpts.push(line);
		} else {
			optionalOpts.push(line);
		}
	}

	// Required options section
	if (requiredOpts.length > 0) {
		lines.push("Required:");
		lines.push(...requiredOpts);
		lines.push("");
	}

	// Optional options section
	if (optionalOpts.length > 0) {
		lines.push("Options:");
		lines.push(...optionalOpts);
		lines.push("");
	}

	// Global options (always available)
	lines.push("Global:");
	lines.push("  --curl\n      Print curl command instead of executing");
	lines.push("  --json\n      Output response as JSON");
	lines.push("  --server <url>\n      Override the API server URL");
	lines.push(
		"  --bearer-token <token>\n      Provide auth token (or use 'login' command)",
	);
	lines.push("  -h, --help\n      Show this help message");
	lines.push("");

	return lines.join("\n");
}

export type GeneratedCliContext = {
	servers: ServerInfo[];
	authSchemes: AuthScheme[];
	commands: CommandModel;
	specId: string;
	embeddedDefaults?: EmbeddedDefaults;
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
				const flagType = isArray ? itemType : flag.type;
				const parser = (raw: string) => coerceValue(raw, flagType);

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

			// Collect reserved flags: operation params + --curl
			const operationFlagSet = new Set(action.flags.map((f) => f.flag));
			const reservedFlags = new Set([...operationFlagSet, "--curl"]);

			// Only --curl is a built-in flag (for debugging)
			if (!operationFlagSet.has("--curl")) {
				cmd.option("--curl", "Print curl command without sending");
			}

			// Track body flag definitions for this action
			let bodyFlagDefs: BodyFlagDef[] = [];

			if (action.requestBody) {
				// Generate body flags from schema (recursive with dot notation)
				// Pass reserved flags to avoid conflicts with operation params and --curl
				bodyFlagDefs = generateBodyFlags(
					action.requestBodySchema,
					reservedFlags,
				);

				for (const def of bodyFlagDefs) {
					if (def.type === "boolean") {
						cmd.option(def.flag, def.description);
					} else {
						cmd.option(`${def.flag} <value>`, def.description);
					}
				}
			}

			// Custom help output for better agent/human readability
			cmd.configureHelp({
				formatHelp: () =>
					formatCustomHelp(cmd, action, action.flags, bodyFlagDefs),
			});

			// Commander passes positional args and then the Command instance as last arg.
			cmd.action(async (...args) => {
				const command = args[args.length - 1];
				const positionalValues = args.slice(0, -1).map((v) => String(v));

				if (!(command instanceof Command)) {
					throw new Error("Unexpected commander action signature");
				}

				const globals = command.optsWithGlobals();
				const local = command.opts();

				await executeAction({
					action,
					positionalValues,
					flagValues: local,
					globals,
					servers: context.servers,
					authSchemes: context.authSchemes,
					specId: context.specId,
					embeddedDefaults: context.embeddedDefaults,
					bodyFlagDefs,
					resourceName: resource.resource,
				});
			});
		}
	}
}

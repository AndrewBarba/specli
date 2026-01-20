import { Command } from "commander";

import type { AuthScheme } from "../auth-schemes.ts";
import type { CommandModel } from "../command-model.ts";
import type { ServerInfo } from "../server.ts";

import { type BodyFlagDef, generateBodyFlags } from "./body-flags.ts";
import { executeAction } from "./execute.ts";
import type { EmbeddedDefaults } from "./request.ts";
import { coerceArrayInput, coerceValue } from "./validate/index.ts";

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
			const operationFlags = new Set(action.flags.map((f) => f.flag));
			const reservedFlags = new Set([...operationFlags, "--curl"]);

			// Only --curl is a built-in flag (for debugging)
			if (!operationFlags.has("--curl")) {
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
				});
			});
		}
	}
}

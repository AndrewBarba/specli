import { Command } from "commander";

import type { AuthScheme } from "../auth-schemes.ts";
import type { CommandModel } from "../command-model.ts";
import type { ServerInfo } from "../server.ts";

import { collectRepeatable } from "./collect.ts";
import { executeAction } from "./execute.ts";
import { coerceValue } from "./validate/index.ts";

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
				const parser = (raw: string) => coerceValue(raw, flag.type);

				if (isArray) {
					const key = `${opt} <value>`;
					cmd.option(key, desc, collectRepeatable);
					continue;
				}

				const key = `${opt} <value>`;
				if (flag.required) cmd.requiredOption(key, desc, parser);
				else cmd.option(key, desc, parser);
			}

			// Common curl-replacement options
			cmd
				.option(
					"--header <header>",
					"Extra header (repeatable)",
					collectRepeatable,
				)
				.option("--accept <type>", "Override Accept header")
				.option("--status", "Include status in --json output")
				.option("--headers", "Include headers in --json output")
				.option("--dry-run", "Print request without sending")
				.option("--curl", "Print curl command without sending")
				.option("--timeout <ms>", "Request timeout in milliseconds");

			if (action.requestBody) {
				cmd
					.option("--data <data>", "Inline request body")
					.option("--file <path>", "Request body from file")
					.option(
						"--content-type <type>",
						"Override Content-Type (defaults from OpenAPI)",
					);
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
				});
			});
		}
	}
}

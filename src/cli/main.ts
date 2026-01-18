import { Command } from "commander";

import { listAuthSchemes } from "./auth-schemes.ts";
import { deriveCapabilities } from "./capabilities.ts";
import { buildCommandsIndex } from "./command-index.ts";
import { buildCommandModel } from "./command-model.ts";
import { planOperations } from "./naming.ts";
import { indexOperations } from "./operations.ts";
import { buildSchemaOutput, toMinimalSchemaOutput } from "./schema.ts";
import { listServers } from "./server.ts";
import { loadSpec } from "./spec-loader.ts";

type MainOptions = {
	embeddedSpecText?: string;
	embeddedSpecObject?: unknown;
};

export async function main(argv: string[], options: MainOptions = {}) {
	const program = new Command();

	program
		.name("opencli")
		.description("Generate a CLI from an OpenAPI spec")
		.option("--spec <urlOrPath>", "OpenAPI URL or file path")
		.option("--json", "JSON output")
		.option("--no-plan", "Skip planned command mapping")
		.showHelpAfterError();

	program
		.command("__schema")
		.description("Print indexed operations (machine-readable when --json)")
		.option("--pretty", "Pretty-print JSON when used with --json")
		.option("--min", "Minimal JSON output (commands + metadata only)")
		.action(async (_opts, command) => {
			const flags = command.optsWithGlobals() as {
				spec?: string;
				json?: boolean;
				pretty?: boolean;
				min?: boolean;
				plan?: boolean;
			};

			const loaded = await loadSpec({
				spec: flags.spec,
				embeddedSpecText: options.embeddedSpecText,
				embeddedSpecObject: options.embeddedSpecObject,
			});

			const operations = indexOperations(loaded.doc);
			const servers = listServers(loaded.doc);
			const authSchemes = listAuthSchemes(loaded.doc);

			const planned =
				flags.plan === false ? undefined : planOperations(operations);
			const commands = planned
				? buildCommandModel(planned, {
						specId: loaded.id,
						globalSecurity: loaded.doc.security,
						authSchemes,
					})
				: undefined;

			const capabilities = deriveCapabilities({
				doc: loaded.doc,
				servers,
				authSchemes,
				operations,
				commands,
			});

			const commandsIndex = buildCommandsIndex(commands);

			const output = buildSchemaOutput(
				loaded,
				operations,
				planned,
				servers,
				authSchemes,
				commands,
				commandsIndex,
				capabilities,
			);

			if (flags.json) {
				const pretty = Boolean(flags.pretty);
				const payload = flags.min ? toMinimalSchemaOutput(output) : output;
				process.stdout.write(
					`${JSON.stringify(payload, null, pretty ? 2 : 0)}\n`,
				);
				return;
			}

			process.stdout.write(`${output.openapi.title ?? "(untitled)"}\n`);
			process.stdout.write(`OpenAPI: ${output.openapi.version}\n`);
			process.stdout.write(`Spec: ${output.spec.id} (${output.spec.source})\n`);
			process.stdout.write(`Fingerprint: ${output.spec.fingerprint}\n`);
			process.stdout.write(`Servers: ${output.servers.length}\n`);
			process.stdout.write(`Auth Schemes: ${output.authSchemes.length}\n`);
			process.stdout.write(`Operations: ${output.operations.length}\n`);

			for (const op of output.operations) {
				const id = op.operationId ? ` (${op.operationId})` : "";
				process.stdout.write(`- ${op.method} ${op.path}${id}\n`);
			}

			if (output.planned?.length) {
				process.stdout.write("\nPlanned commands:\n");
				for (const op of output.planned) {
					const args = op.pathArgs.length
						? ` ${op.pathArgs.map((a) => `<${a}>`).join(" ")}`
						: "";
					process.stdout.write(
						`- opencli ${op.resource} ${op.action}${args}\n`,
					);
				}
			}
		});

	await program.parseAsync(argv);
}

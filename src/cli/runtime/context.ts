import { listAuthSchemes } from "../auth-schemes.ts";
import { deriveCapabilities } from "../capabilities.ts";
import { buildCommandsIndex } from "../command-index.ts";
import { buildCommandModel } from "../command-model.ts";
import { planOperations } from "../naming.ts";
import { indexOperations } from "../operations.ts";
import { buildSchemaOutput } from "../schema.ts";
import { listServers } from "../server.ts";
import { loadSpec } from "../spec-loader.ts";

export type BuildRuntimeContextOptions = {
	spec?: string;
	embeddedSpecText?: string;
	embeddedSpecObject?: unknown;
};

export async function buildRuntimeContext(options: BuildRuntimeContextOptions) {
	const loaded = await loadSpec({
		spec: options.spec,
		embeddedSpecText: options.embeddedSpecText,
		embeddedSpecObject: options.embeddedSpecObject,
	});

	const operations = indexOperations(loaded.doc);
	const servers = listServers(loaded.doc);
	const authSchemes = listAuthSchemes(loaded.doc);
	const planned = planOperations(operations);
	const commands = buildCommandModel(planned, {
		specId: loaded.id,
		globalSecurity: loaded.doc.security,
		authSchemes,
	});
	const commandsIndex = buildCommandsIndex(commands);
	const capabilities = deriveCapabilities({
		doc: loaded.doc,
		servers,
		authSchemes,
		operations,
		commands,
	});

	const schema = buildSchemaOutput(
		loaded,
		operations,
		planned,
		servers,
		authSchemes,
		commands,
		commandsIndex,
		capabilities,
	);

	return {
		loaded,
		operations,
		servers,
		authSchemes,
		planned,
		commands,
		commandsIndex,
		capabilities,
		schema,
	};
}

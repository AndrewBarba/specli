import { listAuthSchemes } from "../auth-schemes.js";
import { deriveCapabilities } from "../capabilities.js";
import { buildCommandsIndex } from "../command-index.js";
import { buildCommandModel } from "../command-model.js";
import { planOperations } from "../naming.js";
import { indexOperations } from "../operations.js";
import { buildSchemaOutput } from "../schema.js";
import { listServers } from "../server.js";
import { loadSpec } from "../spec-loader.js";

export type BuildRuntimeContextOptions = {
	spec?: string;
	embeddedSpecText?: string;
};

export async function buildRuntimeContext(options: BuildRuntimeContextOptions) {
	const loaded = await loadSpec({
		spec: options.spec,
		embeddedSpecText: options.embeddedSpecText,
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

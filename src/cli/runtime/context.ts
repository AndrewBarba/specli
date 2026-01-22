import { deriveCapabilities } from "../model/capabilities.js";
import { buildCommandsIndex } from "../model/command-index.js";
import { buildCommandModel } from "../model/command-model.js";
import { planOperations } from "../model/naming.js";
import { buildSchemaOutput } from "../model/schema.js";
import { listAuthSchemes } from "../parse/auth-schemes.js";
import { indexOperations } from "../parse/operations.js";
import { listServers } from "../parse/servers.js";
import { loadSpec } from "../spec/loader.js";

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

import type { AuthScheme } from "./auth-schemes.js";
import type { Capabilities } from "./capabilities.js";
import type { CommandModel } from "./command-model.js";
import type { PlannedOperation } from "./naming.js";
import type { ServerInfo } from "./server.js";
import type { LoadedSpec, NormalizedOperation } from "./types.js";

export type SchemaOutput = {
	schemaVersion: 1;
	openapi: {
		version: string;
		title?: string;
		infoVersion?: string;
	};
	spec: {
		id: string;
		fingerprint: string;
		source: LoadedSpec["source"];
	};
	capabilities: Capabilities;
	servers: ServerInfo[];
	authSchemes: AuthScheme[];
	operations: NormalizedOperation[];
	planned?: PlannedOperation[];
	commands?: CommandModel;
	commandsIndex?: import("./command-index.js").CommandsIndex;
};

export type MinimalSchemaOutput = Pick<
	SchemaOutput,
	"schemaVersion" | "openapi" | "spec" | "capabilities" | "commands"
>;

export function buildSchemaOutput(
	loaded: LoadedSpec,
	operations: NormalizedOperation[],
	planned: PlannedOperation[] | undefined,
	servers: ServerInfo[],
	authSchemes: AuthScheme[],
	commands: CommandModel | undefined,
	commandsIndex: import("./command-index.js").CommandsIndex | undefined,
	capabilities: Capabilities,
): SchemaOutput {
	return {
		schemaVersion: 1,
		openapi: {
			version: loaded.doc.openapi,
			title: loaded.doc.info?.title,
			infoVersion: loaded.doc.info?.version,
		},
		spec: {
			id: loaded.id,
			fingerprint: loaded.fingerprint,
			source: loaded.source,
		},
		capabilities,
		servers,
		authSchemes,
		operations,
		planned,
		commands,
		commandsIndex,
	};
}

export function toMinimalSchemaOutput(
	output: SchemaOutput,
): MinimalSchemaOutput {
	return {
		schemaVersion: output.schemaVersion,
		openapi: output.openapi,
		spec: output.spec,
		capabilities: output.capabilities,
		commands: output.commands,
	};
}

import type { AuthScheme } from "./auth-schemes.ts";
import type { CommandModel } from "./command-model.ts";
import type { PlannedOperation } from "./naming.ts";
import type { ServerInfo } from "./server.ts";
import type { LoadedSpec, NormalizedOperation } from "./types.ts";

export type SchemaOutput = {
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
	servers: ServerInfo[];
	authSchemes: AuthScheme[];
	operations: NormalizedOperation[];
	planned?: PlannedOperation[];
	commands?: CommandModel;
};

export function buildSchemaOutput(
	loaded: LoadedSpec,
	operations: NormalizedOperation[],
	planned: PlannedOperation[] | undefined,
	servers: ServerInfo[],
	authSchemes: AuthScheme[],
	commands: CommandModel | undefined,
): SchemaOutput {
	return {
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
		servers,
		authSchemes,
		operations,
		planned,
		commands,
	};
}

import type { AuthScheme, AuthSchemeKind } from "./auth-schemes.js";
import type { CommandModel } from "./command-model.js";
import type { ServerInfo } from "./server.js";
import type {
	NormalizedOperation,
	OpenApiDoc,
	SecurityRequirement,
} from "./types.js";

export type Capabilities = {
	servers: {
		count: number;
		hasVariables: boolean;
	};
	auth: {
		count: number;
		kinds: AuthSchemeKind[];
		hasSecurityRequirements: boolean;
	};
	operations: {
		count: number;
		hasRequestBodies: boolean;
	};
	commands: {
		countResources: number;
		countActions: number;
		hasRequestBodies: boolean;
	};
};

function uniqueSorted<T>(items: T[], compare: (a: T, b: T) => number): T[] {
	const out = [...items];
	out.sort(compare);
	return out.filter((v, i) => i === 0 || compare(out[i - 1] as T, v) !== 0);
}

function hasSecurity(requirements: SecurityRequirement[] | undefined): boolean {
	if (!requirements?.length) return false;

	// Treat any non-empty array as "auth exists", even if it contains `{}` to mean optional.
	return true;
}

export function deriveCapabilities(input: {
	doc: OpenApiDoc;
	servers: ServerInfo[];
	authSchemes: AuthScheme[];
	operations: NormalizedOperation[];
	commands?: CommandModel;
}): Capabilities {
	const serverHasVars = input.servers.some((s) => s.variableNames.length > 0);

	const authKinds = uniqueSorted(
		input.authSchemes.map((s) => s.kind),
		(a, b) => a.localeCompare(b),
	);

	const hasSecurityRequirements =
		hasSecurity(input.doc.security) ||
		input.operations.some((op) => hasSecurity(op.security));

	const opHasBodies = input.operations.some((op) => Boolean(op.requestBody));

	const cmdResources = input.commands?.resources ?? [];
	const cmdActions = cmdResources.flatMap((r) => r.actions);
	const cmdHasBodies = cmdActions.some((a) => Boolean(a.requestBody));

	return {
		servers: {
			count: input.servers.length,
			hasVariables: serverHasVars,
		},
		auth: {
			count: input.authSchemes.length,
			kinds: authKinds,
			hasSecurityRequirements,
		},
		operations: {
			count: input.operations.length,
			hasRequestBodies: opHasBodies,
		},
		commands: {
			countResources: cmdResources.length,
			countActions: cmdActions.length,
			hasRequestBodies: cmdHasBodies,
		},
	};
}

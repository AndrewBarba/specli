import { getSchemaEnumStrings } from "./schema-shape.ts";
import type { OpenApiDoc } from "./types.ts";

export type ServerVariable = {
	name: string;
	default?: string;
	enum?: string[];
	description?: string;
};

export type ServerInfo = {
	url: string;
	description?: string;
	variables: ServerVariable[];
	variableNames: string[];
};

type RawServerVariable = {
	default?: unknown;
	enum?: unknown;
	description?: unknown;
};

type RawServer = {
	url?: unknown;
	description?: unknown;
	variables?: unknown;
};

function extractVariableNames(url: string): string[] {
	const names: string[] = [];
	const re = /\{([^}]+)\}/g;

	while (true) {
		const match = re.exec(url);
		if (!match) break;
		names.push(match[1] ?? "");
	}

	return names.map((n) => n.trim()).filter(Boolean);
}

export function listServers(doc: OpenApiDoc): ServerInfo[] {
	const servers = doc.servers ?? [];
	const out: ServerInfo[] = [];

	for (const raw of servers) {
		const s = raw as RawServer;
		if (!s || typeof s !== "object") continue;
		if (typeof s.url !== "string") continue;

		const variableNames = extractVariableNames(s.url);
		const variables: ServerVariable[] = [];

		const rawVars =
			s.variables &&
			typeof s.variables === "object" &&
			!Array.isArray(s.variables)
				? (s.variables as Record<string, RawServerVariable>)
				: {};

		for (const name of variableNames) {
			const v = rawVars[name];
			const def = v?.default;
			const desc = v?.description;
			variables.push({
				name,
				default: typeof def === "string" ? def : undefined,
				enum: getSchemaEnumStrings(v),
				description: typeof desc === "string" ? desc : undefined,
			});
		}

		out.push({
			url: s.url,
			description:
				typeof s.description === "string" ? s.description : undefined,
			variables,
			variableNames,
		});
	}

	return out;
}

export function getDefaultServerUrl(doc: OpenApiDoc): string | undefined {
	return listServers(doc)[0]?.url;
}

import { getSchemaEnumStrings } from "./schema-shape.js";
import type { OpenApiDoc } from "./types.js";

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

const HTTP_METHODS = [
	"get",
	"post",
	"put",
	"patch",
	"delete",
	"options",
	"head",
	"trace",
] as const;

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

function parseServer(raw: unknown): ServerInfo | undefined {
	const s = raw as RawServer;
	if (!s || typeof s !== "object") return undefined;
	if (typeof s.url !== "string") return undefined;

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

	return {
		url: s.url,
		description: typeof s.description === "string" ? s.description : undefined,
		variables,
		variableNames,
	};
}

function mergeServers(a: ServerInfo, b: ServerInfo): ServerInfo {
	const variableNames = [...a.variableNames];
	for (const n of b.variableNames) {
		if (!variableNames.includes(n)) variableNames.push(n);
	}

	const byName = new Map<string, ServerVariable>();
	for (const v of a.variables) byName.set(v.name, { ...v });
	for (const v of b.variables) {
		const existing = byName.get(v.name);
		if (!existing) {
			byName.set(v.name, { ...v });
			continue;
		}
		byName.set(v.name, {
			name: v.name,
			default: existing.default ?? v.default,
			enum: existing.enum ?? v.enum,
			description: existing.description ?? v.description,
		});
	}

	return {
		url: a.url,
		description: a.description ?? b.description,
		variableNames,
		variables: variableNames
			.map((n) => byName.get(n))
			.filter(Boolean) as ServerVariable[],
	};
}

export function listServers(doc: OpenApiDoc): ServerInfo[] {
	const rawServers: unknown[] = [];

	// OpenAPI 3.x allows servers at the root, per-path-item, and per-operation.
	if (Array.isArray(doc.servers)) rawServers.push(...doc.servers);

	const paths = doc.paths;
	if (paths && typeof paths === "object" && !Array.isArray(paths)) {
		for (const rawPathItem of Object.values(paths)) {
			if (!rawPathItem || typeof rawPathItem !== "object") continue;
			const pathItem = rawPathItem as Record<string, unknown>;
			if (Array.isArray(pathItem.servers)) rawServers.push(...pathItem.servers);

			for (const method of HTTP_METHODS) {
				const op = pathItem[method];
				if (!op || typeof op !== "object") continue;
				const opObj = op as Record<string, unknown>;
				if (Array.isArray(opObj.servers)) rawServers.push(...opObj.servers);
			}
		}
	}

	const out: ServerInfo[] = [];
	const byUrl = new Map<string, ServerInfo>();

	for (const raw of rawServers) {
		const parsed = parseServer(raw);
		if (!parsed) continue;

		const existing = byUrl.get(parsed.url);
		if (!existing) {
			byUrl.set(parsed.url, parsed);
			out.push(parsed);
			continue;
		}
		const merged = mergeServers(existing, parsed);
		byUrl.set(parsed.url, merged);
		const idx = out.findIndex((s) => s.url === parsed.url);
		if (idx !== -1) out[idx] = merged;
	}

	return out;
}

export function getDefaultServerUrl(doc: OpenApiDoc): string | undefined {
	return listServers(doc)[0]?.url;
}

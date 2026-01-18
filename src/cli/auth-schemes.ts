import { kebabCase } from "./strings.ts";
import type { OpenApiDoc } from "./types.ts";

export type AuthSchemeKind =
	| "http-bearer"
	| "http-basic"
	| "api-key"
	| "oauth2"
	| "openIdConnect"
	| "unknown";

export type AuthScheme = {
	key: string;
	kind: AuthSchemeKind;
	name?: string;
	in?: "header" | "query" | "cookie";
	scheme?: string;
	bearerFormat?: string;
	description?: string;
};

type RawSecurityScheme = {
	type?: string;
	description?: string;
	name?: string;
	in?: string;
	scheme?: string;
	bearerFormat?: string;
	flows?: unknown;
	openIdConnectUrl?: string;
};

export function listAuthSchemes(doc: OpenApiDoc): AuthScheme[] {
	const schemes = doc.components?.securitySchemes;
	if (!schemes || typeof schemes !== "object") return [];

	const out: AuthScheme[] = [];

	for (const [key, raw] of Object.entries(schemes)) {
		if (!raw || typeof raw !== "object") continue;
		const s = raw as RawSecurityScheme;

		const type = s.type;
		if (type === "http") {
			const scheme = (s.scheme ?? "").toLowerCase();
			if (scheme === "bearer") {
				out.push({
					key,
					kind: "http-bearer",
					scheme: scheme,
					bearerFormat: s.bearerFormat,
					description: s.description,
				});
			} else if (scheme === "basic") {
				out.push({
					key,
					kind: "http-basic",
					scheme: scheme,
					description: s.description,
				});
			} else {
				out.push({
					key,
					kind: "unknown",
					scheme: s.scheme,
					description: s.description,
				});
			}
			continue;
		}

		if (type === "apiKey") {
			const where = s.in;
			const loc =
				where === "header" || where === "query" || where === "cookie"
					? where
					: undefined;
			out.push({
				key,
				kind: "api-key",
				name: s.name,
				in: loc,
				description: s.description,
			});
			continue;
		}

		if (type === "oauth2") {
			out.push({
				key,
				kind: "oauth2",
				description: s.description,
			});
			continue;
		}

		if (type === "openIdConnect") {
			out.push({
				key,
				kind: "openIdConnect",
				description: s.description,
			});
			continue;
		}

		out.push({ key, kind: "unknown", description: s.description });
	}

	// Stable order.
	out.sort((a, b) => kebabCase(a.key).localeCompare(kebabCase(b.key)));
	return out;
}

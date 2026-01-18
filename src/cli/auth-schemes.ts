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

	// oauth2/openid only (subset of spec, enough to derive flags + docs)
	oauthFlows?: OAuthFlows;
	openIdConnectUrl?: string;
};

export type OAuthFlow = {
	authorizationUrl?: string;
	tokenUrl?: string;
	refreshUrl?: string;
	scopes: string[];
};

export type OAuthFlows = Partial<
	Record<
		"implicit" | "password" | "clientCredentials" | "authorizationCode",
		OAuthFlow
	>
>;

type RawOAuthFlow = {
	authorizationUrl?: unknown;
	tokenUrl?: unknown;
	refreshUrl?: unknown;
	scopes?: unknown;
};

type RawOAuthFlows = {
	implicit?: RawOAuthFlow;
	password?: RawOAuthFlow;
	clientCredentials?: RawOAuthFlow;
	authorizationCode?: RawOAuthFlow;
};

type RawSecurityScheme = {
	type?: string;
	description?: string;
	name?: string;
	in?: string;
	scheme?: string;
	bearerFormat?: string;
	flows?: RawOAuthFlows;
	openIdConnectUrl?: string;
};

function parseOAuthFlow(flow: RawOAuthFlow | undefined): OAuthFlow | undefined {
	if (!flow) return undefined;
	const scopesObj = flow.scopes;
	const scopes =
		scopesObj && typeof scopesObj === "object" && !Array.isArray(scopesObj)
			? Object.keys(scopesObj as Record<string, unknown>)
			: [];

	return {
		authorizationUrl:
			typeof flow.authorizationUrl === "string"
				? flow.authorizationUrl
				: undefined,
		tokenUrl: typeof flow.tokenUrl === "string" ? flow.tokenUrl : undefined,
		refreshUrl:
			typeof flow.refreshUrl === "string" ? flow.refreshUrl : undefined,
		scopes: scopes.sort(),
	};
}

function parseOAuthFlows(
	flows: RawOAuthFlows | undefined,
): OAuthFlows | undefined {
	if (!flows) return undefined;
	const out: OAuthFlows = {};

	const implicit = parseOAuthFlow(flows.implicit);
	if (implicit) out.implicit = implicit;

	const password = parseOAuthFlow(flows.password);
	if (password) out.password = password;

	const clientCredentials = parseOAuthFlow(flows.clientCredentials);
	if (clientCredentials) out.clientCredentials = clientCredentials;

	const authorizationCode = parseOAuthFlow(flows.authorizationCode);
	if (authorizationCode) out.authorizationCode = authorizationCode;

	return Object.keys(out).length ? out : undefined;
}

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
				oauthFlows: parseOAuthFlows(s.flows),
			});
			continue;
		}

		if (type === "openIdConnect") {
			out.push({
				key,
				kind: "openIdConnect",
				description: s.description,
				openIdConnectUrl: s.openIdConnectUrl,
			});
			continue;
		}

		out.push({ key, kind: "unknown", description: s.description });
	}

	// Stable order.
	out.sort((a, b) => kebabCase(a.key).localeCompare(kebabCase(b.key)));
	return out;
}

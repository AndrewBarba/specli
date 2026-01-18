import type { AuthScheme } from "../auth-schemes.ts";
import type { CommandAction } from "../command-model.ts";

import { resolveAuthScheme } from "./auth/resolve.ts";
import { loadBody, parseBodyAsJsonOrYaml } from "./body.ts";
import { parseHeaderInput } from "./headers.ts";
import { getToken } from "./profile/secrets.ts";
import { getProfile, readProfiles } from "./profile/store.ts";
import { resolveServerUrl } from "./server-url.ts";
import { applyTemplate } from "./template.ts";
import {
	createAjv,
	deriveValidationSchemas,
	formatAjvErrors,
} from "./validate/index.ts";

export type RuntimeGlobals = {
	spec?: string;
	server?: string;
	serverVar?: string[];
	header?: string[];
	accept?: string;
	contentType?: string;
	data?: string;
	file?: string;
	dryRun?: boolean;
	curl?: boolean;
	json?: boolean;
	status?: boolean;
	headers?: boolean;
	timeout?: string;

	auth?: string;
	bearerToken?: string;
	oauthToken?: string;
	username?: string;
	password?: string;
	apiKey?: string;

	profile?: string;
};

function parseKeyValuePairs(
	pairs: string[] | undefined,
): Record<string, string> {
	const out: Record<string, string> = {};
	for (const pair of pairs ?? []) {
		const idx = pair.indexOf("=");
		if (idx === -1)
			throw new Error(`Invalid pair '${pair}', expected name=value`);
		const name = pair.slice(0, idx).trim();
		const value = pair.slice(idx + 1).trim();
		if (!name) throw new Error(`Invalid pair '${pair}', missing name`);
		out[name] = value;
	}
	return out;
}

function _parseTimeoutMs(value: string | undefined): number | undefined {
	if (!value) return undefined;
	const n = Number(value);
	if (!Number.isFinite(n) || n <= 0)
		throw new Error("--timeout must be a positive number");
	return n;
}

function pickAuthSchemeKey(
	action: CommandAction,
	globals: RuntimeGlobals,
): string | undefined {
	if (globals.auth) return globals.auth;

	// If operation declares a single requirement set with a single scheme, default to it.
	const req = action.auth.alternatives;
	if (req.length === 1 && req[0]?.length === 1) {
		return req[0][0]?.key;
	}

	return undefined;
}

function applyAuth(
	headers: Headers,
	url: URL,
	action: CommandAction,
	globals: RuntimeGlobals,
	authSchemes: AuthScheme[],
): { headers: Headers; url: URL } {
	const schemeKey = pickAuthSchemeKey(action, globals);
	if (!schemeKey) return { headers, url };

	const scheme = authSchemes.find((s) => s.key === schemeKey);
	if (!scheme) {
		throw new Error(
			`Unknown auth scheme '${schemeKey}'. Available: ${authSchemes
				.map((s) => s.key)
				.join(", ")}`,
		);
	}

	if (
		scheme.kind === "http-bearer" ||
		scheme.kind === "oauth2" ||
		scheme.kind === "openIdConnect"
	) {
		const token = globals.bearerToken ?? globals.oauthToken;
		if (!token)
			throw new Error("Missing token. Provide --bearer-token <token>.");
		headers.set("Authorization", `Bearer ${token}`);
		return { headers, url };
	}

	if (scheme.kind === "http-basic") {
		if (!globals.username) throw new Error("Missing --username for basic auth");
		if (!globals.password) throw new Error("Missing --password for basic auth");
		const raw = `${globals.username}:${globals.password}`;
		const encoded = Buffer.from(raw, "utf8").toString("base64");
		headers.set("Authorization", `Basic ${encoded}`);
		return { headers, url };
	}

	if (scheme.kind === "api-key") {
		if (!scheme.name)
			throw new Error(`apiKey scheme '${scheme.key}' missing name`);
		if (!scheme.in)
			throw new Error(`apiKey scheme '${scheme.key}' missing location`);
		if (!globals.apiKey) throw new Error("Missing --api-key for apiKey auth");

		if (scheme.in === "header") {
			headers.set(scheme.name, globals.apiKey);
		}
		if (scheme.in === "query") {
			url.searchParams.set(scheme.name, globals.apiKey);
		}
		if (scheme.in === "cookie") {
			const existing = headers.get("Cookie");
			const part = `${scheme.name}=${globals.apiKey}`;
			headers.set("Cookie", existing ? `${existing}; ${part}` : part);
		}

		return { headers, url };
	}

	return { headers, url };
}

export type BuildRequestInput = {
	specId: string;
	action: CommandAction;
	positionalValues: string[];
	flagValues: Record<string, unknown>;
	globals: RuntimeGlobals;
	servers: import("../server.ts").ServerInfo[];
	authSchemes: AuthScheme[];
};

export async function buildRequest(
	input: BuildRequestInput,
): Promise<{ request: Request; curl: string }> {
	const profilesFile = await readProfiles();
	const profile = getProfile(profilesFile, input.globals.profile);

	const serverVars = parseKeyValuePairs(input.globals.serverVar);
	const serverUrl = resolveServerUrl({
		serverOverride: input.globals.server ?? profile?.server,
		servers: input.servers,
		serverVars,
	});

	// Path params: action.positionals order matches templated params order.
	const pathVars: Record<string, string> = {};
	for (let i = 0; i < input.action.positionals.length; i++) {
		const pos = input.action.positionals[i];
		const raw = input.action.pathArgs[i];
		const value = input.positionalValues[i];
		if (typeof raw === "string" && typeof value === "string") {
			pathVars[raw] = value;
		}
		// Use cli name too as fallback
		if (pos?.name && typeof value === "string") {
			pathVars[pos.name] = value;
		}
	}

	const path = applyTemplate(input.action.path, pathVars, { encode: true });

	const url = new URL(
		path,
		serverUrl.endsWith("/") ? serverUrl : `${serverUrl}/`,
	);

	const headers = new Headers();
	if (input.globals.accept) headers.set("Accept", input.globals.accept);

	// Collect declared params for validation.
	const queryValues: Record<string, unknown> = {};
	const headerValues: Record<string, unknown> = {};
	const cookieValues: Record<string, unknown> = {};

	for (const p of input.action.params) {
		if (p.kind !== "flag") continue;
		const optValue = input.flagValues[optionKeyFromFlag(p.flag)];
		if (typeof optValue === "undefined") continue;

		if (p.in === "query") {
			queryValues[p.name] = optValue;
		}
		if (p.in === "header") {
			headerValues[p.name] = optValue;
		}
		if (p.in === "cookie") {
			cookieValues[p.name] = optValue;
		}
	}

	// Validate params (query/header/cookie) using Ajv.
	const schemas = deriveValidationSchemas(input.action);
	const ajv = createAjv();

	if (schemas.querySchema) {
		const validate = ajv.compile(schemas.querySchema);
		if (!validate(queryValues)) {
			throw new Error(formatAjvErrors(validate.errors));
		}
	}
	if (schemas.headerSchema) {
		const validate = ajv.compile(schemas.headerSchema);
		if (!validate(headerValues)) {
			throw new Error(formatAjvErrors(validate.errors));
		}
	}
	if (schemas.cookieSchema) {
		const validate = ajv.compile(schemas.cookieSchema);
		if (!validate(cookieValues)) {
			throw new Error(formatAjvErrors(validate.errors));
		}
	}

	// Apply params -> query/header/cookie
	for (const [name, value] of Object.entries(queryValues)) {
		if (Array.isArray(value)) {
			for (const item of value) {
				url.searchParams.append(name, String(item));
			}
			continue;
		}
		url.searchParams.set(name, String(value));
	}
	for (const [name, value] of Object.entries(headerValues)) {
		headers.set(name, String(value));
	}
	for (const [name, value] of Object.entries(cookieValues)) {
		const existing = headers.get("Cookie");
		const part = `${name}=${String(value)}`;
		headers.set("Cookie", existing ? `${existing}; ${part}` : part);
	}

	const extraHeaders = (input.globals.header ?? []).map(parseHeaderInput);
	for (const { name, value } of extraHeaders) {
		headers.set(name, value);
	}

	let body: string | undefined;
	if (input.action.requestBody) {
		const hasData = typeof input.globals.data === "string";
		const hasFile = typeof input.globals.file === "string";
		if (hasData && hasFile) throw new Error("Use only one of --data or --file");

		const contentType =
			input.globals.contentType ??
			input.action.requestBody.preferredContentType;
		if (contentType) headers.set("Content-Type", contentType);

		if (hasData) {
			if (contentType?.includes("json")) {
				// Validate basic JSON/YAML input and normalize JSON output.
				const parsed = parseBodyAsJsonOrYaml(input.globals.data as string);
				body = JSON.stringify(parsed);
			} else {
				body = input.globals.data as string;
			}
		} else if (hasFile) {
			const loaded = await loadBody({
				kind: "file",
				path: input.globals.file as string,
			});
			if (contentType?.includes("json")) {
				const parsed = parseBodyAsJsonOrYaml(loaded?.raw ?? "");
				body = JSON.stringify(parsed);
			} else {
				body = loaded?.raw;
			}
		}
	} else {
		if (
			typeof input.globals.data === "string" ||
			typeof input.globals.file === "string"
		) {
			throw new Error("This operation does not accept a request body");
		}
	}

	// Profile-aware auth resolution (flags override profile).
	const resolvedAuthScheme = resolveAuthScheme(
		input.authSchemes,
		input.action.auth,
		{
			flagAuthScheme: input.globals.auth,
			profileAuthScheme: profile?.authScheme,
		},
	);

	const tokenFromProfile =
		profile?.name && resolvedAuthScheme
			? await getToken(input.specId, profile.name)
			: null;

	const globalsWithProfileAuth: RuntimeGlobals = {
		...input.globals,
		auth: resolvedAuthScheme,
		bearerToken:
			input.globals.bearerToken ??
			input.globals.oauthToken ??
			tokenFromProfile ??
			undefined,
	};

	const final = applyAuth(
		headers,
		url,
		input.action,
		globalsWithProfileAuth,
		input.authSchemes,
	);

	const req = new Request(final.url.toString(), {
		method: input.action.method,
		headers: final.headers,
		body,
	});

	const curl = buildCurl(req, body);
	return { request: req, curl };
}

function buildCurl(req: Request, body: string | undefined): string {
	const parts: string[] = ["curl", "-sS", "-X", req.method];
	for (const [k, v] of req.headers.entries()) {
		parts.push("-H", shellQuote(`${k}: ${v}`));
	}
	if (typeof body === "string") {
		parts.push("--data", shellQuote(body));
	}
	parts.push(shellQuote(req.url));
	return parts.join(" ");
}

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

function optionKeyFromFlag(flag: string): string {
	// Commander uses camelCase property names derived from long flag.
	// Example: --x-request-id -> xRequestId
	const name = flag.replace(/^--/, "");
	return name.replace(/-([a-z])/g, (_, c) => String(c).toUpperCase());
}

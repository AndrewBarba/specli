import { basename } from "node:path";

import type { CommandAction } from "../model/command-model.js";
import type { AuthScheme } from "../parse/auth-schemes.js";
import type { ServerInfo } from "../parse/servers.js";

import { resolveAuthScheme } from "./auth/resolve.js";
import { fileExists, isBun } from "./compat.js";
import { getToken } from "./profile/secrets.js";
import { getProfile, readProfiles } from "./profile/store.js";
import type { BodyPart } from "./result.js";
import { resolveServerUrl } from "./server-url.js";
import { applyTemplate } from "./template.js";
import {
	createAjv,
	deriveValidationSchemas,
	formatAjvErrors,
} from "./validate/index.js";

export type RuntimeGlobals = {
	spec?: string;
	server?: string;
	serverVar?: string[];

	curl?: boolean;
	json?: boolean;

	auth?: string;
	bearerToken?: string;
	oauthToken?: string;
	username?: string;
	password?: string;
	apiKey?: string;
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

export type EmbeddedDefaults = {
	server?: string;
	serverVars?: string[];
	auth?: string;
};

export type BuildRequestInput = {
	specId: string;
	action: CommandAction;
	positionalValues: string[];
	flagValues: Record<string, unknown>;
	globals: RuntimeGlobals;
	servers: ServerInfo[];
	authSchemes: AuthScheme[];
	embeddedDefaults?: EmbeddedDefaults;
	bodyFlagDefs?: import("./body-flags.js").BodyFlagDef[];
};

export async function buildRequest(input: BuildRequestInput): Promise<{
	request: Request;
	curl: string;
	body?: string;
	bodyParts?: BodyPart[];
}> {
	// Always use the "default" profile for simplicity
	const defaultProfileName = "default";
	const profilesFile = await readProfiles();
	const profile = getProfile(profilesFile, defaultProfileName);
	const embedded = input.embeddedDefaults;

	// Merge server vars: CLI flags override embedded defaults
	const embeddedServerVars = parseKeyValuePairs(embedded?.serverVars);
	const cliServerVars = parseKeyValuePairs(input.globals.serverVar);
	const serverVars = { ...embeddedServerVars, ...cliServerVars };

	// Priority: CLI flag > profile > embedded default
	const serverUrl = resolveServerUrl({
		serverOverride: input.globals.server ?? profile?.server ?? embedded?.server,
		servers: input.servers,
		serverVars,
	});

	// Path params: positionals order matches templated params order.
	// Use rawPathArgs (original template variable names) for URL substitution.
	const pathVars: Record<string, string> = {};
	for (let i = 0; i < input.action.positionals.length; i++) {
		const rawName = input.action.rawPathArgs[i];
		const value = input.positionalValues[i];
		if (typeof rawName === "string" && typeof value === "string") {
			pathVars[rawName] = value;
		}
	}

	const path = applyTemplate(input.action.path, pathVars, { encode: true });

	// Build the full URL by combining server URL and path.
	// We need to handle the case where path starts with "/" carefully:
	// URL constructor treats absolute paths as relative to origin, not base path.
	const baseUrl = serverUrl.endsWith("/") ? serverUrl : `${serverUrl}/`;
	const relativePath = path.startsWith("/") ? path.slice(1) : path;
	const url = new URL(relativePath, baseUrl);

	const headers = new Headers();

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

	let body: string | undefined;
	let formData: FormData | undefined;
	let bodyParts: BodyPart[] | undefined;
	if (input.action.requestBody) {
		// Check if any body flags were provided using the flag definitions
		const bodyFlagDefs = input.bodyFlagDefs ?? [];
		const hasBodyFlags = bodyFlagDefs.some((def) => {
			// Commander keeps dots in option names: --address.street -> "address.street"
			const dotKey = def.path.join(".");
			return input.flagValues[dotKey] !== undefined;
		});

		const contentType = input.action.requestBody.preferredContentType;
		const isMultipart = contentType?.startsWith("multipart/form-data") ?? false;
		// For multipart the Request constructor derives the Content-Type
		// (including the boundary) from the FormData body.
		if (contentType && !isMultipart) headers.set("Content-Type", contentType);

		const schema = input.action.requestBodySchema;

		// Check if there are any required fields in the body
		const requiredFields = bodyFlagDefs.filter((d) => d.required);

		if (!hasBodyFlags) {
			if (requiredFields.length > 0) {
				// Error: user must provide required fields
				const flagList = requiredFields.map((d) => `--${d.path.join(".")}`);
				throw new Error(`Required: ${flagList.join(", ")}`);
			}
			if (isMultipart && input.action.requestBody.required) {
				throw new Error("Multipart request body requires body field flags.");
			}
			// No required fields - send empty body if body is required, otherwise skip
			if (input.action.requestBody.required) {
				body = "{}";
			}
		} else {
			if (!isMultipart && !contentType?.includes("json")) {
				throw new Error(
					"Body field flags are only supported for JSON and multipart/form-data request bodies.",
				);
			}

			// Check for missing required fields
			const { findMissingRequired, isFileBodyFlag, parseDotNotationFlags } =
				await import("./body-flags.js");
			const missing = findMissingRequired(input.flagValues, bodyFlagDefs);
			if (missing.length > 0) {
				const missingFlags = missing.map((m) => `--${m}`).join(", ");
				throw new Error(`Missing required fields: ${missingFlags}`);
			}

			const provided = bodyFlagDefs.filter(
				(def) => input.flagValues[def.path.join(".")] !== undefined,
			);
			if (isMultipart) {
				const nested = provided.filter((def) => def.path.length > 1);
				if (nested.length > 0) {
					const flags = nested.map((d) => d.flag).join(", ");
					throw new Error(
						`Nested body fields are not supported for multipart requests: ${flags}`,
					);
				}
			}

			// Build nested object from dot-notation flags
			const built = parseDotNotationFlags(input.flagValues, bodyFlagDefs);

			// File flags hold path strings here; validation runs on the paths,
			// conversion to file blobs happens after.
			if (schema) {
				const validate = ajv.compile(schema);
				if (!validate(built)) {
					throw new Error(formatAjvErrors(validate.errors));
				}
			}

			if (isMultipart) {
				const fileDefs = provided.filter(isFileBodyFlag);
				if (fileDefs.length > 0 && !isBun) {
					throw new Error("File uploads require Bun.");
				}
				const missingFiles: string[] = [];
				for (const def of fileDefs) {
					const filePath = String(built[def.path[0] as string]);
					if (!(await fileExists(filePath))) {
						missingFiles.push(`${filePath} (${def.flag})`);
					}
				}
				if (missingFiles.length > 0) {
					throw new Error(`File not found: ${missingFiles.join(", ")}`);
				}

				formData = new FormData();
				bodyParts = [];
				for (const def of provided) {
					const name = def.path[0] as string;
					const value = built[name];
					if (value === undefined) continue;
					if (isFileBodyFlag(def)) {
						const filePath = String(value);
						formData.append(name, Bun.file(filePath), basename(filePath));
						bodyParts.push({ name, value: filePath, isFile: true });
					} else {
						formData.append(name, String(value));
						bodyParts.push({ name, value: String(value), isFile: false });
					}
				}
			} else {
				body = JSON.stringify(built);
			}
		}
	}

	// Check if user has a stored token (needed for auth scheme auto-selection)
	const storedToken = profile?.name
		? await getToken(input.specId, profile.name)
		: null;

	// Auth resolution priority: CLI flag > profile > embedded default
	const resolvedAuthScheme = resolveAuthScheme(
		input.authSchemes,
		input.action.auth,
		{
			flagAuthScheme: input.globals.auth,
			profileAuthScheme: profile?.authScheme,
			embeddedAuthScheme: embedded?.auth,
			hasStoredToken: Boolean(storedToken),
		},
	);

	const tokenFromProfile = resolvedAuthScheme ? storedToken : null;

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
		body: formData ?? body,
	});

	const curl = buildCurl(req, body, bodyParts);
	return { request: req, curl, body, bodyParts };
}

function buildCurl(
	req: Request,
	body: string | undefined,
	bodyParts: BodyPart[] | undefined,
): string {
	const parts: string[] = ["curl", "-sS", "-X", req.method];
	for (const [k, v] of req.headers.entries()) {
		// For multipart, curl must generate its own boundary.
		if (bodyParts && k.toLowerCase() === "content-type") continue;
		const value = k.toLowerCase() === "authorization" ? maskAuthHeader(v) : v;
		parts.push("-H", shellQuote(`${k}: ${value}`));
	}
	if (bodyParts) {
		for (const part of bodyParts) {
			if (part.isFile) {
				parts.push("-F", shellQuote(`${part.name}=@${part.value}`));
			} else {
				parts.push("--form-string", shellQuote(`${part.name}=${part.value}`));
			}
		}
	} else if (typeof body === "string") {
		parts.push("--data", shellQuote(body));
	}
	parts.push(shellQuote(req.url));
	return parts.join(" ");
}

function maskAuthHeader(value: string): string {
	// Mask token in authorization header, preserving scheme (e.g., "Bearer")
	// "Bearer abc123xyz" -> "Bearer abc...xyz"
	const parts = value.split(" ");
	if (parts.length === 2) {
		const [scheme, token] = parts;
		return `${scheme} ${maskToken(token)}`;
	}
	// No scheme, just mask the whole value
	return maskToken(value);
}

function maskToken(token: string): string {
	if (token.length <= 6) {
		return "***";
	}
	const prefix = token.slice(0, 3);
	const suffix = token.slice(-3);
	return `${prefix}...${suffix}`;
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

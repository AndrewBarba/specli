/**
 * Specli Client - Core programmatic API for OpenAPI specs
 */

import type { CommandAction } from "../cli/model/command-model.js";
import type { AuthScheme } from "../cli/parse/auth-schemes.js";
import type { ServerInfo } from "../cli/parse/servers.js";
import { buildRuntimeContext } from "../cli/runtime/context.js";
import { execute, prepare } from "../cli/runtime/execute.js";
import type { RuntimeGlobals } from "../cli/runtime/request.js";
import type { CommandResult, DataResult } from "../cli/runtime/result.js";

/**
 * Custom filesystem interface for reading files.
 * Allows overriding file reading behavior for environments
 * where Node.js fs is not available or custom behavior is needed.
 */
export type SpecliFs = {
	/** Read file contents as UTF-8 string */
	readFile: (path: string) => Promise<string>;
};

export type SpecliOptions = {
	/** The OpenAPI spec URL or file path */
	spec: string;
	/** Override the server/base URL */
	server?: string;
	/** Server URL template variables */
	serverVars?: Record<string, string>;
	/** Bearer token for authentication */
	bearerToken?: string;
	/** API key for authentication */
	apiKey?: string;
	/** Basic auth credentials */
	basicAuth?: { username: string; password: string };
	/** Auth scheme to use (if multiple are available) */
	authScheme?: string;
	/** Custom fetch implementation */
	fetch?: typeof fetch;
	/** Custom filesystem implementation */
	fs?: SpecliFs;
};

export type ResourceInfo = {
	name: string;
	actions: ActionInfo[];
};

export type ActionInfo = {
	name: string;
	summary?: string;
	method: string;
	path: string;
	args: string[];
	requiredFlags: string[];
	optionalFlags: string[];
};

export type ActionDetail = {
	action: string;
	method: string;
	path: string;
	summary?: string;
	args: Array<{ name: string; description?: string }>;
	flags: Array<{
		name: string;
		type: string;
		required: boolean;
		description?: string;
	}>;
};

export type SchemaInfo = {
	title?: string;
	version: string;
	specId: string;
	servers: ServerInfo[];
	authSchemes: AuthScheme[];
	resources: Array<{
		name: string;
		actionCount: number;
	}>;
};

export type WhoamiInfo = {
	authenticated: boolean;
	authScheme?: string;
	/** Masked token for display (if bearer/oauth token is set) */
	maskedToken?: string;
};

export type SpecliClient = {
	/** List all available resources and their actions */
	list(): ResourceInfo[];

	/** Get detailed help for a specific action */
	help(resource: string, action: string): ActionDetail | undefined;

	/**
	 * Execute an API action and return the full CommandResult.
	 */
	exec(
		resource: string,
		action: string,
		args?: string[],
		flags?: Record<string, unknown>,
	): Promise<CommandResult>;

	/**
	 * Prepare a request without executing it.
	 * Returns a PreparedResult or ErrorResult.
	 */
	prepare(
		resource: string,
		action: string,
		args?: string[],
		flags?: Record<string, unknown>,
	): Promise<CommandResult>;

	/**
	 * Get schema information about the loaded spec.
	 * Returns a DataResult that can be rendered with renderToString().
	 */
	schema(): DataResult;

	/**
	 * Get current authentication status.
	 * Returns a DataResult that can be rendered with renderToString().
	 */
	whoami(): DataResult;

	/** Get server information */
	servers: ServerInfo[];

	/** Get authentication schemes */
	authSchemes: AuthScheme[];
};

function findAction(
	ctx: Awaited<ReturnType<typeof buildRuntimeContext>>,
	resource: string,
	action: string,
): CommandAction | undefined {
	const r = ctx.commands.resources.find(
		(r) => r.resource.toLowerCase() === resource.toLowerCase(),
	);
	return r?.actions.find(
		(a) => a.action.toLowerCase() === action.toLowerCase(),
	);
}

/**
 * Create a specli client for interacting with an OpenAPI spec.
 */
export async function createClient(
	options: SpecliOptions,
): Promise<SpecliClient> {
	const {
		spec,
		server,
		serverVars,
		bearerToken,
		apiKey,
		basicAuth,
		authScheme,
		fetch: customFetch,
		fs: customFs,
	} = options;

	const ctx = await buildRuntimeContext({ spec, fs: customFs });

	const globals: RuntimeGlobals = {
		server,
		serverVar: serverVars
			? Object.entries(serverVars).map(([k, v]) => `${k}=${v}`)
			: undefined,
		auth: authScheme,
		bearerToken,
		apiKey,
		username: basicAuth?.username,
		password: basicAuth?.password,
	};

	return {
		list(): ResourceInfo[] {
			return ctx.commands.resources.map((r) => ({
				name: r.resource,
				actions: r.actions.map((a) => ({
					name: a.action,
					summary: a.summary,
					method: a.method,
					path: a.path,
					args: a.positionals.map((p) => p.name),
					requiredFlags: a.flags.filter((f) => f.required).map((f) => f.flag),
					optionalFlags: a.flags.filter((f) => !f.required).map((f) => f.flag),
				})),
			}));
		},

		help(resource: string, action: string): ActionDetail | undefined {
			const actionDef = findAction(ctx, resource, action);
			if (!actionDef) return undefined;

			return {
				action: actionDef.action,
				method: actionDef.method,
				path: actionDef.path,
				summary: actionDef.summary,
				args: actionDef.positionals.map((p) => ({
					name: p.name,
					description: p.description,
				})),
				flags: actionDef.flags.map((f) => ({
					name: f.flag,
					type: f.type,
					required: f.required,
					description: f.description,
				})),
			};
		},

		async exec(
			resource: string,
			action: string,
			args: string[] = [],
			flags: Record<string, unknown> = {},
		): Promise<CommandResult> {
			const actionDef = findAction(ctx, resource, action);
			if (!actionDef) {
				return {
					type: "error",
					message: `Unknown action: ${resource} ${action}`,
					resource,
					action,
				};
			}

			const result = await execute({
				specId: ctx.loaded.id,
				action: actionDef,
				positionalValues: args,
				flagValues: flags,
				globals,
				servers: ctx.servers,
				authSchemes: ctx.authSchemes,
				fetch: customFetch,
			});

			// Add context to the result
			result.resource = resource;
			result.action = action;

			return result;
		},

		async prepare(
			resource: string,
			action: string,
			args: string[] = [],
			flags: Record<string, unknown> = {},
		): Promise<CommandResult> {
			const actionDef = findAction(ctx, resource, action);
			if (!actionDef) {
				return {
					type: "error",
					message: `Unknown action: ${resource} ${action}`,
					resource,
					action,
				};
			}

			const result = await prepare({
				specId: ctx.loaded.id,
				action: actionDef,
				positionalValues: args,
				flagValues: flags,
				globals,
				servers: ctx.servers,
				authSchemes: ctx.authSchemes,
			});

			// Add context to the result
			result.resource = resource;
			result.action = action;

			return result;
		},

		schema(): DataResult {
			const data: SchemaInfo = {
				title: ctx.schema.openapi.title,
				version: ctx.schema.openapi.version,
				specId: ctx.loaded.id,
				servers: ctx.servers,
				authSchemes: ctx.authSchemes,
				resources: ctx.commands.resources.map((r) => ({
					name: r.resource,
					actionCount: r.actions.length,
				})),
			};
			return {
				type: "data",
				kind: "schema",
				data,
			};
		},

		whoami(): DataResult {
			const token = bearerToken;
			const hasAuth = Boolean(token || apiKey || basicAuth);

			// Mask the token for display (show first 8 and last 4 chars)
			let maskedToken: string | undefined;
			if (token && token.length > 16) {
				maskedToken = `${token.slice(0, 8)}...${token.slice(-4)}`;
			} else if (token) {
				maskedToken = `${token.slice(0, 4)}...`;
			}

			const data: WhoamiInfo = {
				authenticated: hasAuth,
				authScheme,
				maskedToken,
			};
			return {
				type: "data",
				kind: "whoami",
				data,
			};
		},

		servers: ctx.servers,
		authSchemes: ctx.authSchemes,
	};
}

export type { AuthScheme } from "../cli/parse/auth-schemes.js";
export type { ServerInfo } from "../cli/parse/servers.js";
// Re-export useful types from runtime
export type {
	CommandResult,
	CurlResult,
	DataResult,
	ErrorResult,
	PreparedRequest,
	PreparedResult,
	ResponseData,
	SuccessResult,
	Timing,
	ValidationError,
	ValidationResult,
} from "../cli/runtime/result.js";

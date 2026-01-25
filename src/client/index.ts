/**
 * Specli Client - Core programmatic API for OpenAPI specs
 */

import type { CommandAction } from "../cli/model/command-model.js";
import type { AuthScheme } from "../cli/parse/auth-schemes.js";
import type { ServerInfo } from "../cli/parse/servers.js";
import { buildRuntimeContext } from "../cli/runtime/context.js";
import { execute, prepare } from "../cli/runtime/execute.js";
import type { RuntimeGlobals } from "../cli/runtime/request.js";
import type { CommandResult } from "../cli/runtime/result.js";

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
	} = options;

	const ctx = await buildRuntimeContext({ spec });

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

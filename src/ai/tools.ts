/**
 * AI SDK tools for specli
 *
 * Provides tools for AI agents to explore and execute OpenAPI specs.
 *
 * @example
 * ```ts
 * import { specli } from "specli/ai";
 * import { generateText } from "ai";
 *
 * const result = await generateText({
 *   model: yourModel,
 *   tools: {
 *     api: specli({ spec: "https://api.example.com/openapi.json" }),
 *   },
 *   prompt: "List all users",
 * });
 * ```
 */

import { tool } from "ai";
import { z } from "zod";

import type { CommandAction } from "../cli/command-model.js";
import { buildRuntimeContext } from "../cli/runtime/context.js";
import { execute } from "../cli/runtime/execute.js";
import type { RuntimeGlobals } from "../cli/runtime/request.js";

export type SpecliToolOptions = {
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
};

// Cache contexts to avoid reloading spec on every call
const contextCache = new Map<
	string,
	Awaited<ReturnType<typeof buildRuntimeContext>>
>();

async function getContext(spec: string) {
	let ctx = contextCache.get(spec);
	if (!ctx) {
		ctx = await buildRuntimeContext({ spec });
		contextCache.set(spec, ctx);
	}
	return ctx;
}

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
 * Create an AI SDK tool for interacting with an OpenAPI spec.
 */
export function specli(options: SpecliToolOptions) {
	const {
		spec,
		server,
		serverVars,
		bearerToken,
		apiKey,
		basicAuth,
		authScheme,
	} = options;

	return tool({
		description: `Execute API operations. Commands: "list" (show resources/actions), "help" (action details), "exec" (call API).`,
		inputSchema: z.object({
			command: z.enum(["list", "help", "exec"]).describe("Command to run"),
			resource: z.string().optional().describe("Resource name (e.g. users)"),
			action: z
				.string()
				.optional()
				.describe("Action name (e.g. list, get, create)"),
			args: z.array(z.string()).optional().describe("Positional arguments"),
			flags: z
				.record(z.string(), z.unknown())
				.optional()
				.describe("Named flags"),
		}),
		execute: async ({ command, resource, action, args, flags }) => {
			const ctx = await getContext(spec);

			if (command === "list") {
				return {
					resources: ctx.commands.resources.map((r) => ({
						name: r.resource,
						actions: r.actions.map((a) => ({
							name: a.action,
							summary: a.summary,
							method: a.method,
							path: a.path,
							args: a.positionals.map((p) => p.name),
							requiredFlags: a.flags
								.filter((f) => f.required)
								.map((f) => f.flag),
						})),
					})),
				};
			}

			if (command === "help") {
				if (!resource) return { error: "Missing resource" };
				const r = ctx.commands.resources.find(
					(r) => r.resource.toLowerCase() === resource.toLowerCase(),
				);
				if (!r) return { error: `Unknown resource: ${resource}` };
				if (!action) {
					return {
						resource: r.resource,
						actions: r.actions.map((a) => a.action),
					};
				}
				const a = r.actions.find(
					(a) => a.action.toLowerCase() === action.toLowerCase(),
				);
				if (!a) return { error: `Unknown action: ${action}` };
				return {
					action: a.action,
					method: a.method,
					path: a.path,
					summary: a.summary,
					args: a.positionals.map((p) => ({
						name: p.name,
						description: p.description,
					})),
					flags: a.flags.map((f) => ({
						name: f.flag,
						type: f.type,
						required: f.required,
						description: f.description,
					})),
				};
			}

			if (command === "exec") {
				if (!resource || !action)
					return { error: "Missing resource or action" };
				const actionDef = findAction(ctx, resource, action);
				if (!actionDef) return { error: `Unknown: ${resource} ${action}` };

				const positionalValues = args ?? [];
				if (positionalValues.length < actionDef.positionals.length) {
					return {
						error: `Missing args: ${actionDef.positionals
							.slice(positionalValues.length)
							.map((p) => p.name)
							.join(", ")}`,
					};
				}

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

				try {
					const result = await execute({
						specId: ctx.loaded.id,
						action: actionDef,
						positionalValues,
						flagValues: flags ?? {},
						globals,
						servers: ctx.servers,
						authSchemes: ctx.authSchemes,
					});
					return { status: result.status, ok: result.ok, body: result.body };
				} catch (err) {
					return { error: err instanceof Error ? err.message : String(err) };
				}
			}

			return { error: `Unknown command: ${command}` };
		},
	});
}

/** Clear cached spec context */
export function clearSpecliCache(spec?: string): void {
	if (spec) contextCache.delete(spec);
	else contextCache.clear();
}

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

import type { AuthScheme } from "../cli/auth-schemes.ts";
import type { CommandAction, CommandModel } from "../cli/command-model.ts";
import { buildRuntimeContext } from "../cli/runtime/context.ts";
import { buildRequest, type RuntimeGlobals } from "../cli/runtime/request.ts";
import type { SchemaOutput } from "../cli/schema.ts";
import type { ServerInfo } from "../cli/server.ts";

/**
 * Cached runtime context to avoid reloading the spec on every tool call
 */
type CachedContext = {
	spec: string;
	schema: SchemaOutput;
	commands: CommandModel;
	servers: ServerInfo[];
	authSchemes: AuthScheme[];
	specId: string;
};

const contextCache = new Map<string, CachedContext>();

async function getContext(spec: string): Promise<CachedContext> {
	const cached = contextCache.get(spec);
	if (cached) return cached;

	const ctx = await buildRuntimeContext({ spec });
	const context: CachedContext = {
		spec,
		schema: ctx.schema,
		commands: ctx.commands,
		servers: ctx.servers,
		authSchemes: ctx.authSchemes,
		specId: ctx.loaded.id,
	};
	contextCache.set(spec, context);
	return context;
}

/**
 * Find an action by resource and action name
 */
function findAction(
	commands: CommandModel,
	resource: string,
	action: string,
): CommandAction | undefined {
	const resourceEntry = commands.resources.find(
		(r) => r.resource.toLowerCase() === resource.toLowerCase(),
	);
	if (!resourceEntry) return undefined;
	return resourceEntry.actions.find(
		(a) => a.action.toLowerCase() === action.toLowerCase(),
	);
}

/**
 * Build a description of available commands for the LLM
 */
function describeCommands(commands: CommandModel): string {
	const lines: string[] = [];

	for (const resource of commands.resources) {
		lines.push(`\n## ${resource.resource}`);
		for (const action of resource.actions) {
			const args = action.positionals.map((p) => `<${p.name}>`).join(" ");
			const flags = action.flags
				.filter((f) => f.required)
				.map((f) => `--${f.flag}`)
				.join(" ");
			const optional = action.flags
				.filter((f) => !f.required)
				.map((f) => `[--${f.flag}]`)
				.join(" ");

			const usage = [action.action, args, flags, optional]
				.filter(Boolean)
				.join(" ");
			const desc = action.summary || action.description || "";
			lines.push(`- **${usage}**: ${desc}`);
		}
	}

	return lines.join("\n");
}

/**
 * Build detailed help for a specific action
 */
function describeAction(action: CommandAction): string {
	const lines: string[] = [];

	lines.push(`# ${action.action}`);
	lines.push(`${action.summary || action.description || "No description"}`);
	lines.push(`\nMethod: ${action.method.toUpperCase()} ${action.path}`);

	if (action.positionals.length > 0) {
		lines.push("\n## Arguments (required, in order)");
		for (const p of action.positionals) {
			lines.push(`- **${p.name}**: ${p.description || "No description"}`);
		}
	}

	const requiredFlags = action.flags.filter((f) => f.required);
	if (requiredFlags.length > 0) {
		lines.push("\n## Required Flags");
		for (const f of requiredFlags) {
			const type = f.enum ? f.enum.join("|") : f.type || "string";
			lines.push(`- **--${f.flag}** (${type}): ${f.description || ""}`);
		}
	}

	const optionalFlags = action.flags.filter((f) => !f.required);
	if (optionalFlags.length > 0) {
		lines.push("\n## Optional Flags");
		for (const f of optionalFlags) {
			const type = f.enum ? f.enum.join("|") : f.type || "string";
			lines.push(`- **--${f.flag}** (${type}): ${f.description || ""}`);
		}
	}

	if (action.requestBody) {
		lines.push("\n## Request Body");
		lines.push(`Content-Type: ${action.requestBody.preferredContentType}`);
		if (action.requestBody.required) {
			lines.push("Required: yes");
		}
	}

	return lines.join("\n");
}

export type SpecliToolOptions = {
	/**
	 * The OpenAPI spec URL or file path
	 */
	spec: string;

	/**
	 * Override the server/base URL
	 */
	server?: string;

	/**
	 * Server URL template variables
	 */
	serverVars?: Record<string, string>;

	/**
	 * Bearer token for authentication
	 */
	bearerToken?: string;

	/**
	 * API key for authentication
	 */
	apiKey?: string;

	/**
	 * Basic auth credentials
	 */
	basicAuth?: {
		username: string;
		password: string;
	};

	/**
	 * Auth scheme to use (if multiple are available)
	 */
	authScheme?: string;
};

const inputSchema = z.object({
	command: z
		.enum(["list", "help", "exec"])
		.describe(
			'The command to run: "list" shows available actions, "help" shows details for an action, "exec" executes an action',
		),
	resource: z
		.string()
		.optional()
		.describe("The resource name (e.g., users, posts)"),
	action: z
		.string()
		.optional()
		.describe("The action name (e.g., list, get, create, delete)"),
	args: z
		.array(z.string())
		.optional()
		.describe(
			"Positional arguments for the action (e.g., user ID for get/delete)",
		),
	flags: z
		.record(z.string(), z.unknown())
		.optional()
		.describe(
			"Named flags/options for the action (e.g., { limit: 10, offset: 0 })",
		),
});

/**
 * Create an AI SDK tool for interacting with an OpenAPI spec.
 *
 * The tool allows an agent to:
 * 1. List available resources and actions
 * 2. Get detailed help for a specific action
 * 3. Execute API calls with parameters
 *
 * @example
 * ```ts
 * import { specli } from "specli/ai";
 * import { generateText } from "ai";
 *
 * const result = await generateText({
 *   model: yourModel,
 *   tools: {
 *     api: specli({
 *       spec: "https://api.example.com/openapi.json",
 *       bearerToken: process.env.API_TOKEN,
 *     }),
 *   },
 *   prompt: "Create a new user named John",
 * });
 * ```
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
		description: `Execute API operations from an OpenAPI spec. Use command "list" to see available resources and actions. Use command "help <resource> <action>" to get detailed usage. Use command "exec <resource> <action>" to execute an API call.`,
		inputSchema,
		execute: async ({ command, resource, action, args, flags }) => {
			const ctx = await getContext(spec);

			// List all available resources and actions
			if (command === "list") {
				const title = ctx.schema.openapi.title || "API";
				const description = describeCommands(ctx.commands);
				return {
					title,
					description: `# ${title}\n${description}`,
					resources: ctx.commands.resources.map((r) => ({
						name: r.resource,
						actions: r.actions.map((a) => ({
							name: a.action,
							summary: a.summary,
							method: a.method,
							path: a.path,
							positionals: a.positionals.map((p) => p.name),
							requiredFlags: a.flags
								.filter((f) => f.required)
								.map((f) => f.flag),
						})),
					})),
				};
			}

			// Get detailed help for a specific action
			if (command === "help") {
				if (!resource) {
					return {
						error:
							"Missing resource name. Use 'list' to see available resources.",
					};
				}
				if (!action) {
					// List actions for resource
					const resourceEntry = ctx.commands.resources.find(
						(r) => r.resource.toLowerCase() === resource.toLowerCase(),
					);
					if (!resourceEntry) {
						return {
							error: `Resource '${resource}' not found. Available: ${ctx.commands.resources.map((r) => r.resource).join(", ")}`,
						};
					}
					return {
						resource: resourceEntry.resource,
						actions: resourceEntry.actions.map((a) => ({
							name: a.action,
							summary: a.summary,
							method: a.method,
							path: a.path,
						})),
					};
				}

				const actionDef = findAction(ctx.commands, resource, action);
				if (!actionDef) {
					const resourceEntry = ctx.commands.resources.find(
						(r) => r.resource.toLowerCase() === resource.toLowerCase(),
					);
					if (!resourceEntry) {
						return {
							error: `Resource '${resource}' not found. Available: ${ctx.commands.resources.map((r) => r.resource).join(", ")}`,
						};
					}
					return {
						error: `Action '${action}' not found in '${resource}'. Available: ${resourceEntry.actions.map((a) => a.action).join(", ")}`,
					};
				}

				return {
					description: describeAction(actionDef),
					action: {
						name: actionDef.action,
						method: actionDef.method,
						path: actionDef.path,
						summary: actionDef.summary,
						positionals: actionDef.positionals.map((p) => ({
							name: p.name,
							description: p.description,
							required: true,
						})),
						flags: actionDef.flags.map((f) => ({
							name: f.flag,
							type: f.type,
							required: f.required,
							description: f.description,
							enum: f.enum,
						})),
						requestBody: actionDef.requestBody
							? {
									contentType: actionDef.requestBody.preferredContentType,
									required: actionDef.requestBody.required,
								}
							: undefined,
					},
				};
			}

			// Execute an action
			if (command === "exec") {
				if (!resource) {
					return {
						error:
							"Missing resource name. Use 'list' to see available resources.",
					};
				}
				if (!action) {
					return {
						error:
							"Missing action name. Use 'help <resource>' to see available actions.",
					};
				}

				const actionDef = findAction(ctx.commands, resource, action);
				if (!actionDef) {
					const resourceEntry = ctx.commands.resources.find(
						(r) => r.resource.toLowerCase() === resource.toLowerCase(),
					);
					if (!resourceEntry) {
						return {
							error: `Resource '${resource}' not found. Available: ${ctx.commands.resources.map((r) => r.resource).join(", ")}`,
						};
					}
					return {
						error: `Action '${action}' not found in '${resource}'. Available: ${resourceEntry.actions.map((a) => a.action).join(", ")}`,
					};
				}

				// Validate positional arguments
				const positionalValues = args ?? [];
				if (positionalValues.length < actionDef.positionals.length) {
					const missing = actionDef.positionals
						.slice(positionalValues.length)
						.map((p) => p.name);
					return {
						error: `Missing required arguments: ${missing.join(", ")}`,
						required: actionDef.positionals.map((p) => p.name),
						provided: positionalValues,
					};
				}

				// Build globals for auth
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
					const { request } = await buildRequest({
						specId: ctx.specId,
						action: actionDef,
						positionalValues,
						flagValues: flags ?? {},
						globals,
						servers: ctx.servers,
						authSchemes: ctx.authSchemes,
					});

					const response = await fetch(request);
					const contentType = response.headers.get("content-type") ?? "";

					let body: unknown;
					const text = await response.text();

					if (contentType.includes("json") && text) {
						try {
							body = JSON.parse(text);
						} catch {
							body = text;
						}
					} else {
						body = text;
					}

					return {
						status: response.status,
						ok: response.ok,
						body,
					};
				} catch (err) {
					return {
						error: err instanceof Error ? err.message : String(err),
					};
				}
			}

			return { error: `Unknown command: ${command}` };
		},
	});
}

/**
 * Clear the cached context for a spec (useful for testing or when spec changes)
 */
export function clearCache(spec?: string): void {
	if (spec) {
		contextCache.delete(spec);
	} else {
		contextCache.clear();
	}
}

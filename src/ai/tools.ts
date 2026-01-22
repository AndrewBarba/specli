/**
 * AI SDK tools for specli
 *
 * Provides tools for AI agents to explore and execute OpenAPI specs.
 *
 * @example
 * ```ts
 * import { specliTool } from "specli/ai/tools";
 * import { generateText } from "ai";
 *
 * const result = await generateText({
 *   model: yourModel,
 *   tools: {
 *     api: await specliTool({ spec: "https://api.example.com/openapi.json" }),
 *   },
 *   prompt: "List all users",
 * });
 * ```
 */

import { tool } from "ai";
import { z } from "zod";
import { createClient, type SpecliOptions } from "../client/index.js";

/**
 * Create an AI SDK tool for interacting with an OpenAPI spec.
 *
 * The spec is fetched once when this function is called, so the returned
 * tool already has the spec loaded and ready to use.
 */
export async function specliTool(options: SpecliOptions) {
	const client = await createClient(options);

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
			if (command === "list") {
				return { resources: client.list() };
			}

			if (command === "help") {
				if (!resource) return { error: "Missing resource" };
				if (!action) {
					// List actions for a resource
					const resources = client.list();
					const r = resources.find(
						(r) => r.name.toLowerCase() === resource.toLowerCase(),
					);
					if (!r) return { error: `Unknown resource: ${resource}` };
					return {
						resource: r.name,
						actions: r.actions.map((a) => a.name),
					};
				}
				const detail = client.help(resource, action);
				if (!detail) return { error: `Unknown: ${resource} ${action}` };
				return detail;
			}

			if (command === "exec") {
				if (!resource || !action)
					return { error: "Missing resource or action" };

				try {
					const result = await client.exec(
						resource,
						action,
						args ?? [],
						flags ?? {},
					);
					return { status: result.status, ok: result.ok, body: result.body };
				} catch (err) {
					return { error: err instanceof Error ? err.message : String(err) };
				}
			}

			return { error: `Unknown command: ${command}` };
		},
	});
}

// Re-export for backwards compatibility
export { specliTool as specli };

// Re-export the options type
export type { SpecliOptions as SpecliToolOptions } from "../client/index.js";

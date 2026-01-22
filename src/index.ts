/**
 * Specli - Convert OpenAPI specs to executables, built to be agent-first
 *
 * @example
 * ```ts
 * import { specli } from "specli";
 *
 * const api = await specli({ spec: "https://api.example.com/openapi.json" });
 *
 * // List available resources and actions
 * const resources = api.list();
 *
 * // Execute an API call
 * const result = await api.exec("users", "get", ["123"]);
 * console.log(result.body);
 * ```
 */

import {
	createClient,
	type SpecliClient,
	type SpecliOptions,
} from "./client/index.js";

/**
 * Create a specli client for interacting with an OpenAPI spec.
 *
 * @example
 * ```ts
 * import { specli } from "specli";
 *
 * const api = await specli({
 *   spec: "https://api.example.com/openapi.json",
 *   bearerToken: process.env.API_TOKEN,
 * });
 *
 * // List resources
 * const resources = api.list();
 *
 * // Execute a call
 * const result = await api.exec("users", "list");
 * if (result.ok) {
 *   console.log(result.body);
 * }
 * ```
 */
export async function specli(options: SpecliOptions): Promise<SpecliClient> {
	return createClient(options);
}

// Re-export all types
export type {
	ActionDetail,
	ActionInfo,
	AuthScheme,
	ExecuteResult,
	ResourceInfo,
	ServerInfo,
	SpecliClient,
	SpecliOptions,
} from "./client/index.js";

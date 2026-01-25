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
 * // Execute an API call and get the full result
 * const result = await api.exec("users", "get", ["123"]);
 * if (result.type === "success") {
 *   console.log(result.response.body);
 * }
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
 * if (result.type === "success" && result.response.ok) {
 *   console.log(result.response.body);
 * }
 * ```
 */
export async function specli(options: SpecliOptions): Promise<SpecliClient> {
	return createClient(options);
}

// Re-export render utilities for advanced usage
export {
	getExitCode,
	getOutputStream,
	type RenderOptions,
	renderToJSON,
	renderToString,
	toJSON,
} from "./cli/runtime/render.js";

// Re-export type guards for convenience
export {
	getBody,
	getStatus,
	isCurl,
	isData,
	isError,
	isOk,
	isPrepared,
	isSuccess,
	isValidation,
} from "./cli/runtime/result.js";

// Re-export all types from client
export type {
	ActionDetail,
	ActionInfo,
	AuthScheme,
	CommandResult,
	CurlResult,
	DataResult,
	ErrorResult,
	PreparedRequest,
	PreparedResult,
	ResourceInfo,
	ResponseData,
	ServerInfo,
	SpecliClient,
	SpecliOptions,
	SuccessResult,
	Timing,
	ValidationError,
	ValidationResult,
} from "./client/index.js";

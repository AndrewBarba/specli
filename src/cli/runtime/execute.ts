import type { CommandAction } from "../model/command-model.js";
import type { AuthScheme } from "../parse/auth-schemes.js";
import type { ServerInfo } from "../parse/servers.js";

import type { BodyFlagDef } from "./body-flags.js";
import { getExitCode, getOutputStream, renderToString } from "./render.js";
import {
	buildRequest,
	type EmbeddedDefaults,
	type RuntimeGlobals,
} from "./request.js";
import type {
	CommandResult,
	CurlResult,
	ErrorResult,
	PreparedRequest,
	SuccessResult,
} from "./result.js";

export type ExecuteInput = {
	action: CommandAction;
	positionalValues: string[];
	flagValues: Record<string, unknown>;
	globals: RuntimeGlobals;
	servers: ServerInfo[];
	authSchemes: AuthScheme[];
	specId: string;
	embeddedDefaults?: EmbeddedDefaults;
	bodyFlagDefs?: BodyFlagDef[];
	/** Resource name for error messages (e.g. "plans") */
	resourceName?: string;
};

/**
 * Build a prepared request without executing it.
 * Returns a PreparedResult or ErrorResult (for validation failures).
 */
export async function prepare(
	input: Omit<ExecuteInput, "resourceName">,
): Promise<CommandResult> {
	try {
		const { request, curl, body } = await buildRequest({
			specId: input.specId,
			action: input.action,
			positionalValues: input.positionalValues,
			flagValues: input.flagValues,
			globals: input.globals,
			servers: input.servers,
			authSchemes: input.authSchemes,
			embeddedDefaults: input.embeddedDefaults,
			bodyFlagDefs: input.bodyFlagDefs,
		});

		const headers: Record<string, string> = {};
		for (const [key, value] of request.headers.entries()) {
			headers[key] = value;
		}

		const prepared: PreparedRequest = {
			method: request.method,
			url: request.url,
			headers,
			body,
			curl,
		};

		return {
			type: "prepared",
			request: prepared,
		};
	} catch (err) {
		return {
			type: "error",
			message: err instanceof Error ? err.message : String(err),
		};
	}
}

/**
 * Execute an action and return the result as a CommandResult.
 * This is the core execution function used by both CLI and programmatic API.
 */
export async function execute(
	input: Omit<ExecuteInput, "resourceName">,
): Promise<CommandResult> {
	const startTime = Date.now();
	const startedAt = new Date().toISOString();

	try {
		const { request, curl, body } = await buildRequest({
			specId: input.specId,
			action: input.action,
			positionalValues: input.positionalValues,
			flagValues: input.flagValues,
			globals: input.globals,
			servers: input.servers,
			authSchemes: input.authSchemes,
			embeddedDefaults: input.embeddedDefaults,
			bodyFlagDefs: input.bodyFlagDefs,
		});

		// Build PreparedRequest before fetch (since body gets consumed)
		const headers: Record<string, string> = {};
		for (const [key, value] of request.headers.entries()) {
			headers[key] = value;
		}
		const preparedRequest: PreparedRequest = {
			method: request.method,
			url: request.url,
			headers,
			body,
			curl,
		};

		// Handle --curl mode
		if (input.globals.curl) {
			const result: CurlResult = {
				type: "curl",
				curl,
				request: preparedRequest,
			};
			return result;
		}

		// Execute the request
		const res = await fetch(request);
		const durationMs = Date.now() - startTime;

		const contentType = res.headers.get("content-type") ?? "";
		const rawBody = await res.text();

		let parsedBody: unknown = rawBody;
		if (contentType.includes("json") && rawBody) {
			try {
				parsedBody = JSON.parse(rawBody);
			} catch {
				// keep as text
			}
		}

		// Build response headers
		const responseHeaders: Record<string, string> = {};
		for (const [key, value] of res.headers.entries()) {
			responseHeaders[key] = value;
		}

		const result: SuccessResult = {
			type: "success",
			request: preparedRequest,
			response: {
				status: res.status,
				ok: res.ok,
				headers: responseHeaders,
				body: parsedBody,
				rawBody,
			},
			timing: {
				startedAt,
				durationMs,
			},
		};

		return result;
	} catch (err) {
		const durationMs = Date.now() - startTime;
		const result: ErrorResult = {
			type: "error",
			message: err instanceof Error ? err.message : String(err),
			timing: {
				startedAt,
				durationMs,
			},
		};
		return result;
	}
}

/**
 * Execute an action and write output to stdout/stderr.
 * This is the CLI-facing wrapper around execute().
 */
export async function executeAction(input: ExecuteInput): Promise<void> {
	const actionName = input.action.action;
	const resourceName = input.resourceName;

	// Execute and get the result
	const result = await execute(input);

	// Add context for error messages
	if (result.type === "error" || result.type === "validation") {
		result.resource = resourceName;
		result.action = actionName;
	}

	// Render the result
	const format = input.globals.json ? "json" : "text";
	const output = renderToString(result, { format });

	// Write to appropriate stream
	const stream = getOutputStream(result);
	if (stream === "stderr") {
		process.stderr.write(output);
	} else {
		process.stdout.write(output);
	}

	// Set exit code
	process.exitCode = getExitCode(result);
}

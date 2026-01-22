import type { CommandAction } from "../model/command-model.js";
import type { AuthScheme } from "../parse/auth-schemes.js";
import type { ServerInfo } from "../parse/servers.js";

import type { BodyFlagDef } from "./body-flags.js";
import {
	buildRequest,
	type EmbeddedDefaults,
	type RuntimeGlobals,
} from "./request.js";

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

export type ExecuteResult = {
	ok: boolean;
	status: number;
	body: unknown;
	curl: string;
};

/**
 * Format an error message with a help hint.
 */
function formatError(
	message: string,
	resourceName: string | undefined,
	actionName: string,
): string {
	const helpCmd = resourceName
		? `${resourceName} ${actionName} --help`
		: `${actionName} --help`;
	return `${message}\n\nRun '${helpCmd}' to see available options.`;
}

/**
 * Execute an action and return the result as data.
 * This is the core execution function used by both CLI and programmatic API.
 */
export async function execute(
	input: Omit<ExecuteInput, "resourceName">,
): Promise<ExecuteResult> {
	const { request, curl } = await buildRequest({
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

	const res = await fetch(request);
	const contentType = res.headers.get("content-type") ?? "";

	const text = await res.text();
	let body: unknown = text;

	if (contentType.includes("json") && text) {
		try {
			body = JSON.parse(text);
		} catch {
			// keep as text
		}
	}

	return {
		ok: res.ok,
		status: res.status,
		body,
		curl,
	};
}

/**
 * Execute an action and write output to stdout/stderr.
 * This is the CLI-facing wrapper around execute().
 */
export async function executeAction(input: ExecuteInput): Promise<void> {
	const actionName = input.action.action;
	const resourceName = input.resourceName;

	try {
		if (input.globals.curl) {
			const { curl } = await buildRequest({
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
			process.stdout.write(`${curl}\n`);
			return;
		}

		const result = await execute(input);

		if (!result.ok) {
			if (input.globals.json) {
				process.stdout.write(
					`${JSON.stringify({ status: result.status, body: result.body })}\n`,
				);
			} else {
				process.stderr.write(`HTTP ${result.status}\n`);
				process.stderr.write(
					`${typeof result.body === "string" ? result.body : JSON.stringify(result.body, null, 2)}\n`,
				);
			}
			process.exitCode = 1;
			return;
		}

		if (input.globals.json) {
			process.stdout.write(`${JSON.stringify(result.body)}\n`);
			return;
		}

		// default (human + agent readable)
		if (typeof result.body === "string") {
			process.stdout.write(result.body);
			if (!result.body.endsWith("\n")) process.stdout.write("\n");
		} else {
			process.stdout.write(`${JSON.stringify(result.body, null, 2)}\n`);
		}
	} catch (err) {
		const rawMessage = err instanceof Error ? err.message : String(err);
		const message = formatError(rawMessage, resourceName, actionName);

		if (input.globals.json) {
			process.stdout.write(`${JSON.stringify({ error: rawMessage })}\n`);
		} else {
			process.stderr.write(`error: ${message}\n`);
		}
		process.exitCode = 1;
	}
}

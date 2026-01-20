import type { CommandAction } from "../command-model.ts";

import type { BodyFlagDef } from "./body-flags.ts";
import { buildRequest, type EmbeddedDefaults } from "./request.ts";

export type ExecuteInput = {
	action: CommandAction;
	positionalValues: string[];
	flagValues: Record<string, unknown>;
	globals: import("./request.ts").RuntimeGlobals;
	servers: import("../server.ts").ServerInfo[];
	authSchemes: import("../auth-schemes.ts").AuthScheme[];
	specId: string;
	embeddedDefaults?: EmbeddedDefaults;
	bodyFlagDefs?: BodyFlagDef[];
	/** Resource name for error messages (e.g. "plans") */
	resourceName?: string;
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

export async function executeAction(input: ExecuteInput): Promise<void> {
	const actionName = input.action.action;
	const resourceName = input.resourceName;

	try {
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

		if (input.globals.curl) {
			process.stdout.write(`${curl}\n`);
			return;
		}

		const res = await fetch(request);
		const contentType = res.headers.get("content-type") ?? "";
		const status = res.status;

		const text = await res.text();
		let body: unknown = text;
		let parsedJson: unknown | undefined;

		if (contentType.includes("json")) {
			try {
				parsedJson = text ? JSON.parse(text) : null;
				body = parsedJson;
			} catch {
				// keep as text
			}
		}

		if (!res.ok) {
			if (input.globals.json) {
				process.stdout.write(`${JSON.stringify({ status, body })}\n`);
			} else {
				process.stderr.write(`HTTP ${status}\n`);
				process.stderr.write(
					`${typeof body === "string" ? body : JSON.stringify(body, null, 2)}\n`,
				);
			}
			process.exitCode = 1;
			return;
		}

		if (input.globals.json) {
			process.stdout.write(`${JSON.stringify(body)}\n`);
			return;
		}

		// default (human + agent readable)
		if (typeof parsedJson !== "undefined") {
			process.stdout.write(`${JSON.stringify(parsedJson, null, 2)}\n`);
		} else {
			process.stdout.write(text);
			if (!text.endsWith("\n")) process.stdout.write("\n");
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

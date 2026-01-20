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
};

export async function executeAction(input: ExecuteInput): Promise<void> {
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

		if (input.globals.dryRun) {
			process.stdout.write(`${request.method} ${request.url}\n`);
			for (const [k, v] of request.headers.entries()) {
				process.stdout.write(`${k}: ${v}\n`);
			}
			if (request.body) {
				const text = await request.clone().text();
				if (text) process.stdout.write(`\n${text}\n`);
			}
			return;
		}

		const timeoutMs = input.globals.timeout
			? Number(input.globals.timeout)
			: undefined;
		let timeout: Timer | undefined;
		let controller: AbortController | undefined;
		if (timeoutMs && Number.isFinite(timeoutMs) && timeoutMs > 0) {
			controller = new AbortController();
			timeout = setTimeout(() => controller?.abort(), timeoutMs);
		}

		try {
			const res = await fetch(request, { signal: controller?.signal });
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
					process.stdout.write(
						`${JSON.stringify({
							status,
							body,
							headers: input.globals.headers
								? Object.fromEntries(res.headers.entries())
								: undefined,
						})}\n`,
					);
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
				const payload: unknown =
					input.globals.status || input.globals.headers
						? {
								status: input.globals.status ? status : undefined,
								headers: input.globals.headers
									? Object.fromEntries(res.headers.entries())
									: undefined,
								body,
							}
						: body;

				process.stdout.write(`${JSON.stringify(payload)}\n`);
				return;
			}

			// default (human + agent readable)
			if (typeof parsedJson !== "undefined") {
				process.stdout.write(`${JSON.stringify(parsedJson, null, 2)}\n`);
			} else {
				process.stdout.write(text);
				if (!text.endsWith("\n")) process.stdout.write("\n");
			}
		} finally {
			if (timeout) clearTimeout(timeout);
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (input.globals.json) {
			process.stdout.write(`${JSON.stringify({ error: message })}\n`);
		} else {
			process.stderr.write(`error: ${message}\n`);
		}
		process.exitCode = 1;
	}
}
